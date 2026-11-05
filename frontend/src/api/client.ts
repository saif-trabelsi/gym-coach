import type { SessionPayload, RepReplayPayload } from '../recording/workoutRecorder';

export type { RepReplayPayload };

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends ApiError {
  constructor(message = 'Backend unreachable') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends ApiError {
  constructor(message = 'Request timed out after 10 seconds') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class ValidationError extends ApiError {
  public details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class ServerError extends ApiError {
  public status: number;

  constructor(status: number, message = `Server error (${status})`) {
    super(message);
    this.name = 'ServerError';
    this.status = status;
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found (404)') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends ApiError {
  public retryAfterSeconds: number;

  constructor(retryAfterSeconds = 10, message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type ReportLanguage = 'en' | 'fr' | 'ar';

export type FallbackReason =
  | 'no_api_key'
  | 'timeout'
  | 'rate_limited'
  | 'provider_error'
  | 'invalid_output';

export interface NarrativeIssue {
  rule: string;
  explanation: string;
  tip: string;
}

export interface NarrativeData {
  summary: string;
  strengths: string[];
  issues: NarrativeIssue[];
  next_session: string[];
  fatigue_note: string;
}

export interface TopIssueStat {
  rule: string;
  count: number;
  share: number;
}

export interface SetStat {
  exercise: string;
  reps: number;
  average_score: number;
  best: number;
  worst: number;
  form_drop: number | null;
  trend: string;
  violation_ranking: Array<{ rule: string; count: number }>;
}

export interface SessionStatsData {
  total_reps: number;
  average_score: number;
  duration_minutes: number;
  exercises: string[];
  top_issues: TopIssueStat[];
  sets: SetStat[];
}

export interface ReportRead {
  session_id: number;
  language: ReportLanguage;
  created_at: string;
  provider: string;
  model: string;
  is_fallback: boolean;
  fallback_reason: FallbackReason | null;
  stats: SessionStatsData;
  narrative: NarrativeData;
}

export interface SessionListItem {
  id: number;
  started_at: string;
  ended_at: string;
  exercises: string[];
  total_reps: number;
  average_score: number | null;
}

export interface ProgressRow {
  date: string;
  exercise: string;
  reps: number;
  average_score: number;
}

export interface SessionRead {
  id: number;
  started_at: string;
  ended_at: string;
  sets: Array<{
    id: number;
    exercise: string;
    started_at: string;
    ended_at: string;
    reps: Array<{
      id: number;
      index: number;
      score: number;
      duration_ms: number;
      metrics: Record<string, unknown>;
      violations: string[];
      timestamp: number;
      has_replay?: boolean;
    }>;
  }>;
}

const DEFAULT_API_URL = 'http://127.0.0.1:8000';
const REQUEST_TIMEOUT_MS = 10000;

export function getApiUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }
  return DEFAULT_API_URL;
}

export function formatValidationDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const loc = Array.isArray((item as { loc?: unknown[] }).loc)
            ? (item as { loc: unknown[] }).loc.slice(1).join('.')
            : '';
          const msg = (item as { msg?: string }).msg || JSON.stringify(item);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(item);
      })
      .join('; ');
  }
  if (detail && typeof detail === 'object') {
    return JSON.stringify(detail);
  }
  return 'Validation failed';
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new NetworkError(
      `Backend unreachable: ${error instanceof Error ? error.message : 'connection failed'}`
    );
  } finally {
    clearTimeout(id);
  }
}

/**
 * Sends the workout session payload to the backend.
 */
export async function createSession(payload: SessionPayload): Promise<SessionRead> {
  const baseUrl = getApiUrl();
  const response = await fetchWithTimeout(`${baseUrl}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 201) {
    return response.json();
  }

  if (response.status === 422) {
    let errorDetail: unknown = null;
    let readableMessage = 'Validation error';
    try {
      const data = await response.json();
      errorDetail = data.detail;
      readableMessage = formatValidationDetail(data.detail);
    } catch {
      readableMessage = 'Validation failed (unparseable error response)';
    }
    throw new ValidationError(readableMessage, errorDetail);
  }

  if (response.status >= 500) {
    throw new ServerError(response.status, `Server error (${response.status})`);
  }

  throw new ApiError(`Unexpected response from server (${response.status})`);
}

/**
 * Checks backend health. Returns true if healthy, false otherwise.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const baseUrl = getApiUrl();
    const response = await fetchWithTimeout(`${baseUrl}/health`, {
      method: 'GET',
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Lists all recorded sessions, newest first.
 */
export async function listSessions(): Promise<SessionListItem[]> {
  const baseUrl = getApiUrl();
  const response = await fetchWithTimeout(`${baseUrl}/sessions`, {
    method: 'GET',
  });

  if (response.ok) {
    return response.json();
  }

  if (response.status >= 500) {
    throw new ServerError(response.status, `Server error (${response.status})`);
  }

  throw new ApiError(`Failed to fetch sessions (${response.status})`);
}

/**
 * Retrieves full details of a specific session by id.
 */
export async function getSession(id: number): Promise<SessionRead> {
  const baseUrl = getApiUrl();
  const response = await fetchWithTimeout(`${baseUrl}/sessions/${id}`, {
    method: 'GET',
  });

  if (response.status === 200) {
    return response.json();
  }

  if (response.status === 404) {
    throw new NotFoundError(`Session with id ${id} not found`);
  }

  if (response.status >= 500) {
    throw new ServerError(response.status, `Server error (${response.status})`);
  }

  throw new ApiError(`Failed to fetch session (${response.status})`);
}

/**
 * Deletes a session by id (cascades sets and reps).
 */
export async function deleteSession(id: number): Promise<void> {
  const baseUrl = getApiUrl();
  const response = await fetchWithTimeout(`${baseUrl}/sessions/${id}`, {
    method: 'DELETE',
  });

  if (response.status === 204) {
    return;
  }

  if (response.status === 404) {
    throw new NotFoundError(`Session with id ${id} not found`);
  }

  if (response.status >= 500) {
    throw new ServerError(response.status, `Server error (${response.status})`);
  }

  throw new ApiError(`Failed to delete session (${response.status})`);
}

/**
 * Retrieves progress statistics aggregated by calendar day.
 */
export async function getProgress(params?: {
  exercise?: string;
  tzOffsetMinutes?: number;
}): Promise<ProgressRow[]> {
  const baseUrl = getApiUrl();
  const query = new URLSearchParams();
  if (params?.exercise) {
    query.set('exercise', params.exercise);
  }
  if (typeof params?.tzOffsetMinutes === 'number') {
    query.set('tz_offset_minutes', params.tzOffsetMinutes.toString());
  }

  const queryString = query.toString();
  const url = `${baseUrl}/stats/progress${queryString ? `?${queryString}` : ''}`;

  const response = await fetchWithTimeout(url, {
    method: 'GET',
  });

  if (response.status === 200) {
    return response.json();
  }

  if (response.status === 422) {
    let errorDetail: unknown = null;
    let readableMessage = 'Validation error';
    try {
      const data = await response.json();
      errorDetail = data.detail;
      readableMessage = formatValidationDetail(data.detail);
    } catch {
      readableMessage = 'Validation failed';
    }
    throw new ValidationError(readableMessage, errorDetail);
  }

  if (response.status >= 500) {
    throw new ServerError(response.status, `Server error (${response.status})`);
  }

  throw new ApiError(`Failed to fetch progress (${response.status})`);
}

const GENERATE_TIMEOUT_MS = 40000;

function parseRetryAfter(header: string | null | undefined): number {
  if (!header) return 10;
  const parsed = parseInt(header.trim(), 10);
  if (isNaN(parsed) || parsed <= 0) return 10;
  return parsed;
}

/**
 * Retrieves cached coaching report for a session in the given language.
 * Returns the report or null if 404 (not yet generated).
 */
export async function getReport(
  sessionId: number,
  language: ReportLanguage = 'en'
): Promise<ReportRead | null> {
  const baseUrl = getApiUrl();
  const response = await fetchWithTimeout(
    `${baseUrl}/sessions/${sessionId}/report?language=${encodeURIComponent(language)}`,
    {
      method: 'GET',
    },
    REQUEST_TIMEOUT_MS
  );

  if (response.status === 200) {
    return response.json();
  }

  if (response.status === 404) {
    return null;
  }

  if (response.status === 422) {
    let errorDetail: unknown = null;
    let readableMessage = 'Validation error';
    try {
      const data = await response.json();
      errorDetail = data.detail;
      readableMessage = formatValidationDetail(data.detail);
    } catch {
      readableMessage = 'Validation failed';
    }
    throw new ValidationError(readableMessage, errorDetail);
  }

  if (response.status >= 500) {
    throw new ServerError(response.status, `Server error (${response.status})`);
  }

  throw new ApiError(`Failed to fetch report (${response.status})`);
}

/**
 * Generates or retrieves coaching report for a session.
 * Uses 40-second timeout for LLM generation.
 */
export async function generateReport(
  sessionId: number,
  language: ReportLanguage = 'en',
  force = false
): Promise<ReportRead> {
  const baseUrl = getApiUrl();
  const url = `${baseUrl}/sessions/${sessionId}/report?language=${encodeURIComponent(
    language
  )}&force=${force ? 'true' : 'false'}`;

  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
    },
    GENERATE_TIMEOUT_MS
  );

  if (response.status === 200 || response.status === 201) {
    return response.json();
  }

  if (response.status === 429) {
    const retryHeader = response.headers.get('Retry-After');
    const retrySeconds = parseRetryAfter(retryHeader);
    throw new RateLimitError(
      retrySeconds,
      `Too many requests. Please wait ${retrySeconds} seconds.`
    );
  }

  if (response.status === 404) {
    throw new NotFoundError(`Session with id ${sessionId} not found`);
  }

  if (response.status === 422) {
    let errorDetail: unknown = null;
    let readableMessage = 'Validation error';
    try {
      const data = await response.json();
      errorDetail = data.detail;
      readableMessage = formatValidationDetail(data.detail);
    } catch {
      readableMessage = 'Validation failed';
    }
    throw new ValidationError(readableMessage, errorDetail);
  }

  if (response.status >= 500) {
    throw new ServerError(response.status, `Server error (${response.status})`);
  }

  throw new ApiError(`Failed to generate report (${response.status})`);
}

