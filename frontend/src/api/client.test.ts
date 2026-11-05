import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSession,
  checkHealth,
  listSessions,
  getSession,
  deleteSession,
  getProgress,
  getReport,
  generateReport,
  NetworkError,
  TimeoutError,
  ValidationError,
  ServerError,
  NotFoundError,
  RateLimitError,
  type ReportRead,
} from './client';
import type { SessionPayload } from '../recording/workoutRecorder';

describe('API Client (client.ts)', () => {
  const originalFetch = globalThis.fetch;
  const mockPayload: SessionPayload = {
    started_at: '2026-11-03T10:00:00.000Z',
    ended_at: '2026-11-03T10:15:00.000Z',
    sets: [
      {
        exercise: 'squat',
        started_at: '2026-11-03T10:00:30.000Z',
        ended_at: '2026-11-03T10:05:00.000Z',
        reps: [
          {
            index: 1,
            score: 95,
            duration_ms: 2000,
            metrics: { minKneeAngle: 82.5 },
            violations: [],
            timestamp: 1793700032000,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // g. API client with a mocked fetch: 201 returns the session, 422 produces a readable validation message, a network failure is reported as backend unreachable, a timeout is reported as a timeout.
  describe('g. API client with a mocked fetch', () => {
    it('201 returns the created session', async () => {
      const mockSession = {
        id: 1,
        started_at: mockPayload.started_at,
        ended_at: mockPayload.ended_at,
        sets: [],
      };

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(mockSession), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await createSession(mockPayload);
      expect(result).toEqual(mockSession);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sessions'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('422 produces a readable validation message', async () => {
      const errorResponse = {
        detail: [
          {
            loc: ['body', 'sets', 0, 'reps', 0, 'timestamp'],
            msg: 'Rep timestamp must be Unix epoch time in milliseconds (>= 1000000000000)',
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(errorResponse), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await expect(createSession(mockPayload)).rejects.toThrow(ValidationError);

      // Re-run to inspect exact error message
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(errorResponse), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      try {
        await createSession(mockPayload);
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ValidationError);
        const valErr = err as ValidationError;
        expect(valErr.message).toContain('sets.0.reps.0.timestamp: Rep timestamp must be Unix epoch time in milliseconds');
      }
    });

    it('network failure is reported as backend unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(createSession(mockPayload)).rejects.toThrow(NetworkError);

      globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError('Connection refused'));
      try {
        await createSession(mockPayload);
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(NetworkError);
        expect((err as NetworkError).message).toContain('Backend unreachable');
      }
    });

    it('timeout is reported as a timeout', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      globalThis.fetch = vi.fn().mockRejectedValueOnce(abortError);

      await expect(createSession(mockPayload)).rejects.toThrow(TimeoutError);

      globalThis.fetch = vi.fn().mockRejectedValueOnce(abortError);
      try {
        await createSession(mockPayload);
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(TimeoutError);
        expect((err as TimeoutError).message).toContain('timed out');
      }
    });
  });

  describe('Additional error & health checks', () => {
    it('server error (500) throws ServerError', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 })
      );

      await expect(createSession(mockPayload)).rejects.toThrow(ServerError);
    });

    it('checkHealth returns true when backend responds ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
      );

      const isHealthy = await checkHealth();
      expect(isHealthy).toBe(true);
    });

    it('checkHealth returns false when backend is down or error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const isHealthy = await checkHealth();
      expect(isHealthy).toBe(false);
    });
  });

  // h. API client with mocked fetch: listSessions, getSession, getProgress builds the query string with exercise and tz_offset_minutes, 404 maps to not found, deleteSession handles 204 with an empty body.
  describe('h. API client with mocked fetch (Task 4.3 endpoints)', () => {
    it('listSessions fetches /sessions and returns session list', async () => {
      const mockList = [
        {
          id: 1,
          started_at: '2026-11-03T10:00:00Z',
          ended_at: '2026-11-03T10:15:00Z',
          exercises: ['squat'],
          total_reps: 10,
          average_score: 85.5,
        },
      ];
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(mockList), { status: 200 })
      );

      const sessions = await listSessions();
      expect(sessions).toEqual(mockList);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sessions'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('getSession retrieves session detail; 404 maps to not found', async () => {
      // 1. Success 200
      const mockDetail = { id: 42, sets: [] };
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(mockDetail), { status: 200 })
      );

      const session = await getSession(42);
      expect(session).toEqual(mockDetail);

      // 2. 404 maps to NotFoundError
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Session not found' }), { status: 404 })
      );

      await expect(getSession(999)).rejects.toThrow(NotFoundError);
    });

    it('deleteSession handles 204 with an empty body; 404 maps to not found', async () => {
      // 1. 204 No Content
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(null, { status: 204 })
      );

      await expect(deleteSession(1)).resolves.toBeUndefined();

      // 2. 404 maps to NotFoundError
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
      );

      await expect(deleteSession(999)).rejects.toThrow(NotFoundError);
    });

    it('getProgress builds the query string with exercise and tz_offset_minutes', async () => {
      const mockRows = [
        { date: '2026-11-03', exercise: 'squat', reps: 15, average_score: 91.2 },
      ];
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(mockRows), { status: 200 })
      );

      const rows = await getProgress({ exercise: 'squat', tzOffsetMinutes: 120 });
      expect(rows).toEqual(mockRows);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/stats\/progress\?.*exercise=squat/),
        expect.objectContaining({ method: 'GET' })
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/stats\/progress\?.*tz_offset_minutes=120/),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('d. getReport returns null on 404 and the report on 200', async () => {
      const mockReport: ReportRead = {
        session_id: 1,
        language: 'en',
        created_at: '2026-11-05T10:00:00Z',
        provider: 'gemini',
        model: 'gemini-2.5-flash-lite',
        is_fallback: false,
        fallback_reason: null,
        stats: {
          total_reps: 10,
          average_score: 85,
          duration_minutes: 5.5,
          exercises: ['squat'],
          top_issues: [],
          sets: [],
        },
        narrative: {
          summary: 'Great workout.',
          strengths: ['Consistent depth'],
          issues: [],
          next_session: ['Keep it up', 'Rest well'],
          fatigue_note: 'No fatigue observed',
        },
      };

      // 1. 200 returns report
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(mockReport), { status: 200 })
      );
      const res = await getReport(1, 'en');
      expect(res).toEqual(mockReport);

      // 2. 404 returns null
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
      );
      const nullRes = await getReport(99, 'en');
      expect(nullRes).toBeNull();
    });

    it('d. generateReport sends force=true in query when requested', async () => {
      const mockReport: Partial<ReportRead> = { session_id: 1 };
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(mockReport), { status: 201 })
      );

      await generateReport(1, 'fr', true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/sessions\/1\/report\?language=fr&force=true/),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('d. a 429 with Retry-After 7 produces a rate-limit error with retryAfterSeconds 7', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Too many requests' }), {
          status: 429,
          headers: { 'Retry-After': '7' },
        })
      );

      try {
        await generateReport(1, 'en', true);
        expect.fail('Should have thrown RateLimitError');
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError);
        expect((err as RateLimitError).retryAfterSeconds).toBe(7);
      }
    });

    it('d. a timeout is reported as a timeout and network failure as unreachable', async () => {
      // 1. Timeout
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValueOnce(abortError);

      await expect(getReport(1, 'en')).rejects.toThrow(TimeoutError);

      // 2. Network failure
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
      try {
        await getReport(1, 'en');
        expect.fail('Should have thrown NetworkError');
      } catch (err) {
        expect(err).toBeInstanceOf(NetworkError);
        expect((err as NetworkError).message).toContain('Backend unreachable');
      }
    });
  });
});

