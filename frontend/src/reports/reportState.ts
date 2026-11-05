import type { ReportLanguage, ReportRead } from '../api/client';

export type ReportCardStatus =
  | 'idle'
  | 'loadingCache'
  | 'notGenerated'
  | 'generating'
  | 'ready'
  | 'rateLimited'
  | 'error';

export interface ReportState {
  status: ReportCardStatus;
  sessionId: number;
  language: ReportLanguage;
  counter: number;
  requestKey: string;
  report: ReportRead | null;
  error: Error | null;
  retryAfterSeconds: number;
}

export type ReportAction =
  | { type: 'START_FETCH_CACHE'; sessionId: number; language: ReportLanguage }
  | { type: 'CACHE_FOUND'; requestKey: string; report: ReportRead }
  | { type: 'CACHE_NOT_FOUND'; requestKey: string }
  | { type: 'START_GENERATE'; sessionId: number; language: ReportLanguage; force?: boolean }
  | { type: 'GENERATE_SUCCESS'; requestKey: string; report: ReportRead }
  | { type: 'RATE_LIMITED'; requestKey: string; retryAfterSeconds: number }
  | { type: 'TICK_COUNTDOWN' }
  | { type: 'FETCH_ERROR'; requestKey: string; error: Error }
  | { type: 'RESET'; sessionId: number; language: ReportLanguage };

export function retryAfterToSeconds(header: string | null | undefined): number {
  if (!header) return 10;
  const parsed = parseInt(header.trim(), 10);
  if (isNaN(parsed) || parsed <= 0) return 10;
  return parsed;
}

export function createInitialReportState(
  sessionId: number,
  language: ReportLanguage = 'en'
): ReportState {
  return {
    status: 'idle',
    sessionId,
    language,
    counter: 0,
    requestKey: `${sessionId}_${language}_0`,
    report: null,
    error: null,
    retryAfterSeconds: 0,
  };
}

export function reportReducer(state: ReportState, action: ReportAction): ReportState {
  switch (action.type) {
    case 'START_FETCH_CACHE': {
      const nextCounter = state.counter + 1;
      return {
        ...state,
        status: 'loadingCache',
        sessionId: action.sessionId,
        language: action.language,
        counter: nextCounter,
        requestKey: `${action.sessionId}_${action.language}_${nextCounter}`,
        error: null,
      };
    }
    case 'CACHE_FOUND': {
      if (action.requestKey !== state.requestKey) {
        return state;
      }
      return {
        ...state,
        status: 'ready',
        report: action.report,
        error: null,
      };
    }
    case 'CACHE_NOT_FOUND': {
      if (action.requestKey !== state.requestKey) {
        return state;
      }
      return {
        ...state,
        status: 'notGenerated',
        report: null,
        error: null,
      };
    }
    case 'START_GENERATE': {
      const nextCounter = state.counter + 1;
      return {
        ...state,
        status: 'generating',
        sessionId: action.sessionId,
        language: action.language,
        counter: nextCounter,
        requestKey: `${action.sessionId}_${action.language}_${nextCounter}`,
        error: null,
      };
    }
    case 'GENERATE_SUCCESS': {
      if (action.requestKey !== state.requestKey) {
        return state;
      }
      return {
        ...state,
        status: 'ready',
        report: action.report,
        error: null,
      };
    }
    case 'RATE_LIMITED': {
      if (action.requestKey !== state.requestKey) {
        return state;
      }
      return {
        ...state,
        status: 'rateLimited',
        retryAfterSeconds: action.retryAfterSeconds,
      };
    }
    case 'TICK_COUNTDOWN': {
      if (state.status !== 'rateLimited') {
        return state;
      }
      const nextSeconds = state.retryAfterSeconds - 1;
      if (nextSeconds <= 0) {
        return {
          ...state,
          status: state.report ? 'ready' : 'notGenerated',
          retryAfterSeconds: 0,
        };
      }
      return {
        ...state,
        retryAfterSeconds: nextSeconds,
      };
    }
    case 'FETCH_ERROR': {
      if (action.requestKey !== state.requestKey) {
        return state;
      }
      return {
        ...state,
        status: 'error',
        error: action.error,
      };
    }
    case 'RESET': {
      return createInitialReportState(action.sessionId, action.language);
    }
    default:
      return state;
  }
}
