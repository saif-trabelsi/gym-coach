import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSession,
  checkHealth,
  NetworkError,
  TimeoutError,
  ValidationError,
  ServerError,
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
});
