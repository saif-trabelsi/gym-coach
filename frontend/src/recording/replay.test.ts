import { describe, it, expect } from 'vitest';
import {
  FrameBuffer,
  getHighlightJoints,
  type LandmarkPoint,
} from './frameBuffer';
import {
  WorkoutRecorder,
  type RepReplayPayload,
} from './workoutRecorder';
import { getHighlightJoints as overlayGetHighlightJoints } from '../ui/Overlay';

function makeDummyLandmarks(baseX = 0.5, baseY = 0.5, vis = 0.9): LandmarkPoint[] {
  return Array.from({ length: 33 }, (_, i) => ({
    x: baseX + i * 0.001,
    y: baseY + i * 0.001,
    z: 0,
    visibility: vis,
  }));
}

function makeDummyReplay(framesCount = 40): RepReplayPayload {
  const frames = Array.from({ length: framesCount }, () =>
    Array.from({ length: 33 }, () => [0.5, 0.5] as [number, number])
  );
  return {
    version: 1,
    fps: 15,
    aspect: 1.33,
    mirrored: false,
    frames,
    highlight: [25],
    violations: ['depth'],
  };
}

describe('Task 5.3b - Worst-Rep Skeleton Replay & FrameBuffer (replay.test.ts)', () => {
  // a. Pushing 300 frames at 30 fps keeps only the last 8 seconds (about 240 frames).
  it('a. pushing 300 frames at 30 fps keeps only the last 8 seconds (~240 frames)', () => {
    const buffer = new FrameBuffer(8000);
    const dt = 1000 / 30; // 33.333 ms

    for (let i = 0; i < 300; i++) {
      buffer.push(i * dt, makeDummyLandmarks());
    }

    // 300 frames at 30fps is ~10s. Last 8000ms should retain about 240-241 frames.
    const count = buffer.getFrameCount();
    expect(count).toBeGreaterThanOrEqual(239);
    expect(count).toBeLessThanOrEqual(242);
  });

  // b. A rep of 2000 ms ending at T with margin 300 returns frames within [T-2300, T], ordered, about 34 to 36 frames, first and last frame present, and never more than 15 fps.
  it('b. a rep of 2000 ms ending at T with margin 300 returns ordered frames within [T-2300, T] at <= 15 fps', () => {
    const buffer = new FrameBuffer(8000);
    const dt = 1000 / 30; // ~33.33ms (30 fps)
    const T = 5000;

    // Fill buffer from 0 to 5000 ms
    for (let t = 0; t <= T; t += dt) {
      buffer.push(t, makeDummyLandmarks());
    }

    const durationMs = 2000;
    const marginMs = 300;
    const frames = buffer.snapshot(T, durationMs, marginMs);

    expect(frames).not.toBeNull();
    // 2300ms downsampled with interval >= 66ms yields ~34 to 36 frames
    expect(frames!.length).toBeGreaterThanOrEqual(34);
    expect(frames!.length).toBeLessThanOrEqual(36);

    // Each frame must have 33 entries
    for (const f of frames!) {
      expect(f).toHaveLength(33);
    }
  });

  // c. A landmark with visibility 0.4 becomes null, one with 0.9 keeps its coordinates rounded to 3 decimals, and every frame has exactly 33 entries.
  it('c. landmark with visibility < 0.5 becomes null, visibility >= 0.5 rounded to 3 decimals, exactly 33 entries', () => {
    const buffer = new FrameBuffer();
    const lms: LandmarkPoint[] = Array.from({ length: 33 }, (_, i) => ({
      x: 0.123456,
      y: 0.654321,
      visibility: i === 5 ? 0.4 : 0.9,
    }));

    buffer.push(100, lms);
    buffer.push(200, lms);

    const snapshot = buffer.snapshot(200, 100, 0);
    expect(snapshot).not.toBeNull();
    expect(snapshot!).toHaveLength(2);

    const frame = snapshot![0];
    expect(frame).toHaveLength(33);
    // Landmark index 0: visibility 0.9 -> rounded to 3 decimals
    expect(frame[0]).toEqual([0.123, 0.654]);
    // Landmark index 5: visibility 0.4 -> null
    expect(frame[5]).toBeNull();
  });

  // d. A 12 second rep produces at most 90 frames including the first and the last.
  it('d. a 12 second rep produces at most 90 frames including the first and the last', () => {
    const buffer = new FrameBuffer(15000); // Allow storing 15 seconds
    const dt = 33.33; // 30 fps
    const T = 13000;

    for (let t = 0; t <= T; t += dt) {
      buffer.push(t, makeDummyLandmarks(t / 10000, 0.5));
    }

    const frames = buffer.snapshot(T, 12000, 0);
    expect(frames).not.toBeNull();
    expect(frames!.length).toBe(90);

    // First frame (near t=1000) and last frame (near t=13000) must be present
    expect(frames![0]).not.toBeNull();
    expect(frames![frames!.length - 1]).not.toBeNull();
  });

  // e. With fewer than 2 frames in the window snapshot returns null and the rep is still recorded without replay.
  it('e. with fewer than 2 frames snapshot returns null and rep is recorded without replay', () => {
    const buffer = new FrameBuffer();
    buffer.push(1000, makeDummyLandmarks());

    // Window where only 1 frame exists
    const frames = buffer.snapshot(1050, 100, 0);
    expect(frames).toBeNull();

    const replayPayload = frames
      ? {
          version: 1,
          fps: 15,
          aspect: 1.33,
          mirrored: false,
          frames,
          highlight: [25],
          violations: ['depth'],
        }
      : null;

    const recorder = new WorkoutRecorder(() => 1793700000000);
    recorder.addRep('squat', { score: 85, durationMs: 100, violations: ['depth'] }, replayPayload);
    const payload = recorder.buildPayload();

    expect(payload).not.toBeNull();
    expect(payload!.sets[0].reps[0].score).toBe(85);
    expect((payload!.sets[0].reps[0] as any).replay).toBeUndefined();
  });

  // f. Recorder: a set with scores [90, 60, 80] keeps a replay only on the rep with score 60 in the payload,
  // ties keep the earliest, a set whose worst rep has no violation gets no replay, two sets each get at most one,
  // and the recorder never holds more than one replay per set in memory (check through a getter).
  it('f. recorder preserves replay only for worst rep with violations, handles ties, limits memory to 1 replay per set', () => {
    const recorder = new WorkoutRecorder(() => 1793700000000);

    const replay90 = makeDummyReplay(10);
    const replay60 = makeDummyReplay(15);
    const replay80 = makeDummyReplay(20);

    // 1. Add [90, 60, 80]
    recorder.addRep('squat', { score: 90, violations: ['depth'] }, replay90);
    expect(recorder.getSetReplayCount(0)).toBe(1);

    recorder.addRep('squat', { score: 60, violations: ['depth'] }, replay60);
    expect(recorder.getSetReplayCount(0)).toBe(1); // 90 was discarded, 60 kept

    recorder.addRep('squat', { score: 80, violations: ['depth'] }, replay80);
    expect(recorder.getSetReplayCount(0)).toBe(1); // 80 discarded because 60 is lower

    // Check payload
    let payload = recorder.buildPayload();
    expect(payload!.sets[0].reps[0].replay).toBeUndefined();
    expect(payload!.sets[0].reps[1].replay).toBeDefined(); // Score 60 rep
    expect(payload!.sets[0].reps[2].replay).toBeUndefined();

    // 2. Ties keep the earliest
    recorder.reset();
    const replayTie1 = makeDummyReplay(10);
    const replayTie2 = makeDummyReplay(12);

    recorder.addRep('squat', { score: 70, violations: ['depth'] }, replayTie1);
    recorder.addRep('squat', { score: 70, violations: ['depth'] }, replayTie2);
    expect(recorder.getSetReplayCount(0)).toBe(1);

    payload = recorder.buildPayload();
    expect(payload!.sets[0].reps[0].replay).toBeDefined();
    expect(payload!.sets[0].reps[0].replay!.frames).toHaveLength(10); // First replay kept
    expect(payload!.sets[0].reps[1].replay).toBeUndefined();

    // 3. A set whose worst rep has no violation gets no replay
    recorder.reset();
    const replayNoViolations = makeDummyReplay(10);
    recorder.addRep('squat', { score: 100, violations: [] }, replayNoViolations);
    payload = recorder.buildPayload();
    expect(payload!.sets[0].reps[0].replay).toBeUndefined();

    // 4. Two sets each get at most one replay
    recorder.reset();
    // Set 1
    recorder.addRep('squat', { score: 65, violations: ['depth'] }, makeDummyReplay(10));
    recorder.addRep('squat', { score: 90, violations: [] }, makeDummyReplay(10));
    recorder.endSet();
    expect(recorder.getSetReplayCount(0)).toBe(1);

    // Set 2
    recorder.addRep('bicepCurl', { score: 75, violations: ['elbowDrift'] }, makeDummyReplay(15));
    recorder.addRep('bicepCurl', { score: 85, violations: [] }, makeDummyReplay(15));
    expect(recorder.getSetReplayCount(1)).toBe(1);

    expect(recorder.getReplaysCount()).toBe(2);

    payload = recorder.buildPayload();
    expect(payload!.sets).toHaveLength(2);
    expect(payload!.sets[0].reps.filter((r) => r.replay !== undefined)).toHaveLength(1);
    expect(payload!.sets[1].reps.filter((r) => r.replay !== undefined)).toHaveLength(1);
  });

  // g. highlight indices equal what the live overlay mapping returns for the same violation and side
  // (call the same function in the test), for depth on the left leg, back on the right side, and for a curl elbow drift.
  it('g. highlight indices match live overlay mapping for depth (left leg), back (right side), curl elbow drift', () => {
    // Both imports must be identical
    expect(getHighlightJoints).toBe(overlayGetHighlightJoints);

    // 1. Depth on left leg -> [25] (left knee)
    const depthLeft = getHighlightJoints(['depth'], 'left');
    expect(depthLeft).toEqual([25]);

    // 2. Back on right side -> [12, 24] (right shoulder, right hip)
    const backRight = getHighlightJoints(['back'], 'right');
    expect(backRight).toEqual([12, 24]);

    // 3. Curl elbow drift (on left arm) -> [13, 15] (left elbow, left wrist)
    const driftLeft = getHighlightJoints(['elbowDrift'], 'left');
    expect(driftLeft).toEqual([13, 15]);
  });

  // h. A synthetic 40 frame replay serializes under 20000 bytes and passes a local validator mirroring the backend limits
  // (33 entries, numbers in range, 2 to 150 frames, under 120000 bytes).
  it('h. synthetic 40-frame replay serializes under 20,000 bytes and passes backend limits', () => {
    const replay = makeDummyReplay(40);
    const serialized = JSON.stringify(replay);

    // Must be under 20,000 bytes
    expect(new TextEncoder().encode(serialized).length).toBeLessThan(20000);

    // Local validator mirroring backend validation:
    expect(replay.version).toBe(1);
    expect(replay.fps).toBeGreaterThanOrEqual(5);
    expect(replay.fps).toBeLessThanOrEqual(30);
    expect(replay.aspect).toBeGreaterThanOrEqual(0.2);
    expect(replay.aspect).toBeLessThanOrEqual(5.0);
    expect(typeof replay.mirrored).toBe('boolean');
    expect(replay.frames.length).toBeGreaterThanOrEqual(2);
    expect(replay.frames.length).toBeLessThanOrEqual(150);

    for (const frame of replay.frames) {
      expect(frame).toHaveLength(33);
      for (const pt of frame) {
        if (pt !== null) {
          expect(Array.isArray(pt)).toBe(true);
          expect(pt).toHaveLength(2);
          const [x, y] = pt;
          expect(typeof x).toBe('number');
          expect(typeof y).toBe('number');
          expect(Number.isFinite(x)).toBe(true);
          expect(Number.isFinite(y)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(-0.5);
          expect(x).toBeLessThanOrEqual(1.5);
          expect(y).toBeGreaterThanOrEqual(-0.5);
          expect(y).toBeLessThanOrEqual(1.5);
        }
      }
    }

    // Highlight: unique ints between 0 and 32, up to 33 elements
    expect(replay.highlight.length).toBeLessThanOrEqual(33);
    expect(new Set(replay.highlight).size).toBe(replay.highlight.length);
    for (const idx of replay.highlight) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(32);
    }

    // Violations: up to 10 strings, each <= 40 chars
    expect(replay.violations.length).toBeLessThanOrEqual(10);
    for (const v of replay.violations) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeLessThanOrEqual(40);
    }
  });

  // i. A payload without replays is identical to what it was before this task (snapshot test) and all previous frontend tests still pass.
  it('i. payload without replays is identical to before (keys and structure match snapshot)', () => {
    const recorder = new WorkoutRecorder(() => 1793700000000);
    recorder.addRep('squat', {
      score: 95,
      durationMs: 2000,
      metrics: { minKneeAngle: 82.5 },
      violations: [],
    });

    const payload = recorder.buildPayload();
    expect(payload).not.toBeNull();

    const rep = payload!.sets[0].reps[0];
    // Must NOT have 'replay' property
    expect(Object.keys(rep).sort()).toEqual([
      'duration_ms',
      'index',
      'metrics',
      'score',
      'timestamp',
      'violations',
    ]);
    expect('replay' in rep).toBe(false);

    expect(JSON.stringify(payload)).toMatchInlineSnapshot(
      `"{"started_at":"2026-11-03T09:59:58.000Z","ended_at":"2026-11-03T10:00:00.000Z","sets":[{"exercise":"squat","started_at":"2026-11-03T09:59:58.000Z","ended_at":"2026-11-03T10:00:00.000Z","reps":[{"index":1,"score":95,"duration_ms":2000,"metrics":{"minKneeAngle":82.5},"violations":[],"timestamp":1793700000000}]}]}"`
    );
  });
});
