import { describe, it, expect } from 'vitest';
import {
  RepStateMachine,
  OneEuroFilter,
  selectSquatLeg,
  angle,
  computeTorsoLean,
  squatConfig,
  type Landmark3D,
} from './index';

describe('Squat Engine Characterization / Regression Safety Net', () => {
  function createSyntheticLandmarks(kneeAngleDeg: number, torsoLeanDeg: number): Landmark3D[] {
    const lms: Landmark3D[] = Array.from({ length: 33 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visibility: 0.1,
    }));

    // Right side landmarks with high visibility
    // Hip at origin
    lms[24] = { x: 0, y: 0, z: 0, visibility: 0.95 };

    // Shoulder tilted by torsoLeanDeg from vertical (-Y)
    const torsoLen = 0.5;
    const leanRad = (torsoLeanDeg * Math.PI) / 180;
    lms[12] = {
      x: 0,
      y: -torsoLen * Math.cos(leanRad),
      z: torsoLen * Math.sin(leanRad),
      visibility: 0.95,
    };

    // Knee along -Y axis at distance 0.4
    const femurLen = 0.4;
    lms[26] = { x: 0, y: femurLen, z: 0, visibility: 0.95 };

    // Ankle rotated at knee by kneeAngleDeg
    const tibiaLen = 0.4;
    const kneeRad = (kneeAngleDeg * Math.PI) / 180;
    // Knee is at (0, femurLen, 0)
    // Vector BA (knee to hip) points along -Y
    // Vector BC (knee to ankle) has angle kneeRad with BA:
    // BC = (0, -tibiaLen * Math.cos(kneeRad), tibiaLen * Math.sin(kneeRad))
    lms[28] = {
      x: 0,
      y: femurLen - tibiaLen * Math.cos(kneeRad),
      z: tibiaLen * Math.sin(kneeRad),
      visibility: 0.95,
    };

    return lms;
  }

  it('runs 5 deterministic synthetic squat reps and preserves exact behavior', () => {
    const sm = new RepStateMachine(squatConfig);
    const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 });

    const dt = 25; // 40 fps
    let t = 1000;

    // Helper to feed a frame
    const feed = (kneeAngle: number, torsoLean: number) => {
      const worldLms = createSyntheticLandmarks(kneeAngle, torsoLean);
      const leg = selectSquatLeg(worldLms, 0.5);
      expect(leg).not.toBeNull();
      expect(leg?.isValid).toBe(true);
      expect(leg?.side).toBe('right');

      const rawAngle = angle(leg!.landmarks.hip, leg!.landmarks.knee, leg!.landmarks.ankle);
      expect(rawAngle).toBeCloseTo(kneeAngle, 2);

      const smoothedAngle = filter.filter(rawAngle, t);
      const lean = computeTorsoLean(leg!.landmarks.hip, leg!.landmarks.shoulder!);
      expect(lean).toBeCloseTo(torsoLean, 2);

      const res = sm.update(smoothedAngle, t, { torsoLean: lean });
      t += dt;
      return res;
    };

    // Stabilize filter at standing 165°
    for (let i = 0; i < 20; i++) {
      feed(165, 10);
    }

    // REP 1: Perfect rep (depth 85°, lean 20°, descent 1200ms, ascent 1000ms)
    // Descent: 48 steps * 25ms = 1200ms
    for (let i = 1; i <= 48; i++) {
      const a = 165 - (i / 48) * (165 - 85);
      feed(a, 20);
    }
    // Ascent: 40 steps * 25ms = 1000ms
    for (let i = 1; i <= 40; i++) {
      const a = 85 + (i / 40) * (165 - 85);
      feed(a, 20);
    }

    // Pause standing
    for (let i = 0; i < 5; i++) feed(165, 10);

    // REP 2: Shallow rep (depth 108° >= 100°, lean 20°, descent 1200ms, ascent 1000ms)
    for (let i = 1; i <= 48; i++) {
      const a = 165 - (i / 48) * (165 - 108);
      feed(a, 20);
    }
    for (let i = 1; i <= 40; i++) {
      const a = 108 + (i / 40) * (165 - 108);
      feed(a, 20);
    }

    // Pause standing
    for (let i = 0; i < 5; i++) feed(165, 10);

    // REP 3: Fast rep (depth 85°, lean 15°, descent 400ms < 800ms, ascent 400ms, total 800ms >= 600ms)
    for (let i = 1; i <= 16; i++) {
      // 16 * 25ms = 400ms
      const a = 165 - (i / 16) * (165 - 85);
      feed(a, 15);
    }
    for (let i = 1; i <= 16; i++) {
      const a = 85 + (i / 16) * (165 - 85);
      feed(a, 15);
    }

    // Pause standing
    for (let i = 0; i < 5; i++) feed(165, 10);

    // REP 4: Leaning rep (depth 85°, lean 52° >= 45°, descent 1200ms, ascent 1000ms)
    for (let i = 1; i <= 48; i++) {
      const a = 165 - (i / 48) * (165 - 85);
      const l = 10 + (i / 48) * (52 - 10);
      feed(a, l);
    }
    for (let i = 1; i <= 40; i++) {
      const a = 85 + (i / 40) * (165 - 85);
      feed(a, 25);
    }

    // Pause standing
    for (let i = 0; i < 5; i++) feed(165, 10);

    // REP 5: Multiple violations (shallow 110° + leaning 50°, descent 1200ms)
    for (let i = 1; i <= 48; i++) {
      const a = 165 - (i / 48) * (165 - 110);
      const l = 10 + (i / 48) * (50 - 10);
      feed(a, l);
    }
    for (let i = 1; i <= 40; i++) {
      const a = 110 + (i / 40) * (165 - 110);
      feed(a, 25);
    }

    // Check rep count and all 5 reps
    expect(sm.getRepCount()).toBe(5);
    const reps = sm.getReps();
    expect(reps).toHaveLength(5);

    // Rep 1: Perfect
    expect(reps[0].score).toBe(100);
    expect(reps[0].violations).toHaveLength(0);
    expect(reps[0].metrics.minKneeAngle).toBeLessThan(100);
    expect(reps[0].metrics.maxTorsoLean).toBeLessThan(45);
    expect(reps[0].metrics.descentDurationMs).toBeGreaterThanOrEqual(800);

    // Rep 2: Shallow (depth violation only)
    expect(reps[1].score).toBe(70); // 100 - 30
    expect(reps[1].violations).toHaveLength(1);
    expect(reps[1].violations[0].ruleId).toBe('depth');
    expect(reps[1].violations[0].message).toBe('Go lower');

    // Rep 3: Fast (tempo violation only)
    expect(reps[2].score).toBe(85); // 100 - 15
    expect(reps[2].violations).toHaveLength(1);
    expect(reps[2].violations[0].ruleId).toBe('tempo');
    expect(reps[2].violations[0].message).toBe('Slow down');

    // Rep 4: Leaning (back violation only)
    expect(reps[3].score).toBe(75); // 100 - 25
    expect(reps[3].violations).toHaveLength(1);
    expect(reps[3].violations[0].ruleId).toBe('back');
    expect(reps[3].violations[0].message).toBe('Keep your chest up');

    // Rep 5: Multiple (depth 30 + back 25 = 55 penalty -> score 45)
    expect(reps[4].score).toBe(45); // 100 - 55
    expect(reps[4].violations).toHaveLength(2);
    const ruleIds = reps[4].violations.map((v) => v.ruleId).sort();
    expect(ruleIds).toEqual(['back', 'depth']);
  });
});
