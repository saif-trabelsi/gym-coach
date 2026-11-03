import { describe, it, expect, vi } from 'vitest';
import { WorkoutRecorder, sanitizeMetrics } from './workoutRecorder';
import { createSession } from '../api/client';

describe('WorkoutRecorder (deterministic, injected clock)', () => {
  const BASE_TIME = 1793700000000; // 2026-11-03T10:00:00.000Z

  // a. 3 squat reps then End set then 2 curl reps then buildPayload: 2 sets, indexes 1,2,3 and 1,2, exercises "squat" and "bicepCurl".
  it('a. 3 squat reps then End set then 2 curl reps then buildPayload: 2 sets, indexes 1,2,3 and 1,2, exercises "squat" and "bicepCurl"', () => {
    let mockTime = BASE_TIME;
    const recorder = new WorkoutRecorder(() => mockTime);

    // 3 squat reps
    mockTime += 1000;
    recorder.addRep('squat', { score: 95, durationMs: 2000, metrics: { minKneeAngle: 85 }, violations: [] });
    mockTime += 3000;
    recorder.addRep('squat', { score: 90, durationMs: 2100, metrics: { minKneeAngle: 82 }, violations: ['tempo'] });
    mockTime += 3000;
    recorder.addRep('squat', { score: 100, durationMs: 1900, metrics: { minKneeAngle: 79 }, violations: [] });

    // End set
    recorder.endSet();

    // 2 curl reps
    mockTime += 5000;
    recorder.addRep('bicepCurl', { score: 85, durationMs: 1800, metrics: { minElbowAngle: 45 }, violations: [] });
    mockTime += 3000;
    recorder.addRep('bicepCurl', { score: 80, durationMs: 1700, metrics: { minElbowAngle: 50 }, violations: [] });

    // Build payload
    const payload = recorder.buildPayload();
    expect(payload).not.toBeNull();
    expect(payload!.sets).toHaveLength(2);

    const set1 = payload!.sets[0];
    const set2 = payload!.sets[1];

    expect(set1.exercise).toBe('squat');
    expect(set1.reps).toHaveLength(3);
    expect(set1.reps.map((r) => r.index)).toEqual([1, 2, 3]);

    expect(set2.exercise).toBe('bicepCurl');
    expect(set2.reps).toHaveLength(2);
    expect(set2.reps.map((r) => r.index)).toEqual([1, 2]);
  });

  // b. Switching exercise without pressing End set still produces 2 separate sets.
  it('b. Switching exercise without pressing End set still produces 2 separate sets', () => {
    let mockTime = BASE_TIME;
    const recorder = new WorkoutRecorder(() => mockTime);

    mockTime += 1000;
    recorder.addRep('squat', { score: 90, durationMs: 2000 });
    mockTime += 2000;
    recorder.addRep('squat', { score: 95, durationMs: 2000 });

    // Switch exercise directly without endSet()
    mockTime += 5000;
    recorder.addRep('bicepCurl', { score: 85, durationMs: 1500 });

    const payload = recorder.buildPayload();
    expect(payload).not.toBeNull();
    expect(payload!.sets).toHaveLength(2);

    expect(payload!.sets[0].exercise).toBe('squat');
    expect(payload!.sets[0].reps).toHaveLength(2);
    expect(payload!.sets[0].reps[0].index).toBe(1);
    expect(payload!.sets[0].reps[1].index).toBe(2);

    expect(payload!.sets[1].exercise).toBe('bicepCurl');
    expect(payload!.sets[1].reps).toHaveLength(1);
    expect(payload!.sets[1].reps[0].index).toBe(1);
  });

  // c. endSet twice in a row creates no empty set, and buildPayload with no reps returns null.
  it('c. endSet twice in a row creates no empty set, and buildPayload with no reps returns null', () => {
    const recorder = new WorkoutRecorder(() => BASE_TIME);

    // With no reps:
    expect(recorder.buildPayload()).toBeNull();

    // Call endSet with no reps:
    recorder.endSet();
    recorder.endSet();
    expect(recorder.buildPayload()).toBeNull();
    expect(recorder.getFinishedSets()).toHaveLength(0);

    // Add 1 rep, endSet twice:
    recorder.addRep('squat', { score: 100, durationMs: 2000 });
    recorder.endSet();
    recorder.endSet(); // second call should do nothing

    const payload = recorder.buildPayload();
    expect(payload).not.toBeNull();
    expect(payload!.sets).toHaveLength(1);
    expect(payload!.sets[0].reps).toHaveLength(1);
  });

  // d. Timestamps: every rep timestamp is an integer of at least 1000000000000; all session and set dates end with "Z"; ended_at is never before started_at.
  it('d. Timestamps: every rep timestamp is an integer of at least 1000000000000; all session and set dates end with "Z"; ended_at is never before started_at', () => {
    let mockTime = BASE_TIME;
    const recorder = new WorkoutRecorder(() => mockTime);

    mockTime += 1000;
    recorder.addRep('squat', { score: 90, durationMs: 2500 });
    mockTime += 3000;
    recorder.addRep('squat', { score: 95, durationMs: 2200 });
    mockTime += 5000;

    const payload = recorder.buildPayload()!;
    expect(payload).not.toBeNull();

    // Session timestamps
    expect(payload.started_at.endsWith('Z')).toBe(true);
    expect(payload.ended_at.endsWith('Z')).toBe(true);
    expect(new Date(payload.ended_at).getTime()).toBeGreaterThanOrEqual(
      new Date(payload.started_at).getTime()
    );

    // Sets & reps timestamps
    for (const s of payload.sets) {
      expect(s.started_at.endsWith('Z')).toBe(true);
      expect(s.ended_at.endsWith('Z')).toBe(true);
      expect(new Date(s.ended_at).getTime()).toBeGreaterThanOrEqual(
        new Date(s.started_at).getTime()
      );

      for (const rep of s.reps) {
        expect(Number.isInteger(rep.timestamp)).toBe(true);
        expect(rep.timestamp).toBeGreaterThanOrEqual(1000000000000);
      }
    }
  });

  // e. Scores: 99.6 becomes 100, 105 becomes 100, -3 becomes 0. Metrics {"minKneeAngle": 78.456, "x": NaN} becomes {"minKneeAngle": 78.46}.
  it('e. Scores: 99.6 becomes 100, 105 becomes 100, -3 becomes 0. Metrics {"minKneeAngle": 78.456, "x": NaN} becomes {"minKneeAngle": 78.46}', () => {
    const recorder = new WorkoutRecorder(() => BASE_TIME);

    recorder.addRep('squat', {
      score: 99.6,
      durationMs: 2000,
      metrics: { minKneeAngle: 78.456, x: NaN },
    });
    recorder.addRep('squat', {
      score: 105,
      durationMs: 2000,
    });
    recorder.addRep('squat', {
      score: -3,
      durationMs: 2000,
    });

    const payload = recorder.buildPayload()!;
    const reps = payload.sets[0].reps;

    expect(reps[0].score).toBe(100);
    expect(reps[0].metrics).toEqual({ minKneeAngle: 78.46 });

    expect(reps[1].score).toBe(100);
    expect(reps[2].score).toBe(0);

    // Also verify sanitizeMetrics directly
    expect(sanitizeMetrics({ minKneeAngle: 78.456, x: NaN })).toEqual({ minKneeAngle: 78.46 });
    expect(sanitizeMetrics({ y: Infinity, z: -Infinity, valid: 12.345 })).toEqual({ valid: 12.35 });
  });

  // f. Totals: scores 100, 80, 60 give total 3 reps and average 80.
  it('f. Totals: scores 100, 80, 60 give total 3 reps and average 80', () => {
    const recorder = new WorkoutRecorder(() => BASE_TIME);

    recorder.addRep('squat', { score: 100, durationMs: 2000 });
    recorder.addRep('squat', { score: 80, durationMs: 2000 });
    recorder.addRep('squat', { score: 60, durationMs: 2000 });

    const totals = recorder.getTotals();
    expect(totals.totalReps).toBe(3);
    expect(totals.averageScore).toBe(80);
    expect(recorder.totalReps).toBe(3);
    expect(recorder.averageScore).toBe(80);
  });

  // h. After a failed save the recorder still contains all data, and a successful retry sends the identical payload.
  it('h. After a failed save the recorder still contains all data, and a successful retry sends the identical payload', async () => {
    let mockTime = BASE_TIME;
    const recorder = new WorkoutRecorder(() => mockTime);

    mockTime += 1000;
    recorder.addRep('squat', { score: 95, durationMs: 2000 });
    mockTime += 2000;
    recorder.addRep('squat', { score: 85, durationMs: 2100 });

    const payloadFirstAttempt = recorder.buildPayload()!;
    expect(payloadFirstAttempt).not.toBeNull();

    // Mock fetch to simulate failure on first attempt
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    try {
      // 1. Simulate network error on first attempt
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(createSession(payloadFirstAttempt)).rejects.toThrow();

      // Verify the recorder still contains all data
      expect(recorder.getTotals().totalReps).toBe(2);
      expect(recorder.getTotals().averageScore).toBe(90);
      expect(recorder.getFinishedSets()[0].reps).toHaveLength(2);

      // Advance clock time to ensure buildPayload produces identical payload
      mockTime += 10000;
      const payloadRetry = recorder.buildPayload()!;
      expect(payloadRetry).toEqual(payloadFirstAttempt);

      // 2. Retry succeeds
      const mockSuccessResponse = {
        id: 42,
        started_at: payloadRetry.started_at,
        ended_at: payloadRetry.ended_at,
        sets: [],
      };
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(mockSuccessResponse), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const saved = await createSession(payloadRetry);
      expect(saved.id).toBe(42);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
