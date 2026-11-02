import { describe, it, expect } from 'vitest';
import {
  angle,
  isLandmarkVisible,
  areLandmarksVisible,
  torsoLength,
  normalizeDistance,
  selectSquatLeg,
  computeTorsoLean,
  SQUAT_LANDMARK_INDICES,
} from './features';
import { OneEuroFilter } from './oneEuroFilter';
import { RepStateMachine } from './stateMachine';
import { squatConfig } from './exercises/squat';
import { createDepthRule, createBackRule, createTempoRule, createSquatRules } from './rules';
import { calculateScore, evaluateRep } from './scoring';
import type { ExerciseConfig, FormViolation, Landmark3D, RepMetrics } from './types';

describe('Feature Extractor: 3D Geometry and Visibility', () => {
  it('correctly computes a 90 degree angle from known geometry', () => {
    // 2D plane case
    const a: Landmark3D = { x: 1, y: 0, z: 0 };
    const b: Landmark3D = { x: 0, y: 0, z: 0 };
    const c: Landmark3D = { x: 0, y: 1, z: 0 };

    expect(angle(a, b, c)).toBeCloseTo(90, 4);

    // 3D case (Y-axis and Z-axis)
    const a3d: Landmark3D = { x: 0, y: 5, z: 0 };
    const b3d: Landmark3D = { x: 0, y: 0, z: 0 };
    const c3d: Landmark3D = { x: 0, y: 0, z: 12 };

    expect(angle(a3d, b3d, c3d)).toBeCloseTo(90, 4);
  });

  it('correctly computes a 180 degree angle from known geometry', () => {
    const a: Landmark3D = { x: -1, y: 0, z: 0 };
    const b: Landmark3D = { x: 0, y: 0, z: 0 };
    const c: Landmark3D = { x: 1, y: 0, z: 0 };

    expect(angle(a, b, c)).toBeCloseTo(180, 4);
  });

  it('handles degenerate / zero-length vectors without crashing', () => {
    const b: Landmark3D = { x: 1, y: 1, z: 1 };
    expect(angle(b, b, b)).toBe(0);
  });

  it('correctly filters landmark visibility with 0.5 threshold', () => {
    expect(isLandmarkVisible({ x: 0, y: 0, z: 0, visibility: 0.9 })).toBe(true);
    expect(isLandmarkVisible({ x: 0, y: 0, z: 0, visibility: 0.5 })).toBe(true);
    expect(isLandmarkVisible({ x: 0, y: 0, z: 0, visibility: 0.49 })).toBe(false);
    expect(isLandmarkVisible({ x: 0, y: 0, z: 0, visibility: 0.1 })).toBe(false);
    expect(isLandmarkVisible({ x: 0, y: 0, z: 0 })).toBe(true); // undefined visibility defaults to valid
    expect(isLandmarkVisible(null)).toBe(false);

    const lms: Landmark3D[] = [
      { x: 0, y: 0, z: 0, visibility: 0.8 },
      { x: 1, y: 1, z: 1, visibility: 0.7 },
      { x: 2, y: 2, z: 2, visibility: 0.3 },
    ];
    expect(areLandmarksVisible(lms)).toBe(false);
    expect(areLandmarksVisible(lms.slice(0, 2))).toBe(true);
  });

  it('computes torso length and normalizes distances accurately', () => {
    const ls: Landmark3D = { x: -0.2, y: 0.6, z: 0 };
    const rs: Landmark3D = { x: 0.2, y: 0.6, z: 0 };
    const lh: Landmark3D = { x: -0.15, y: 0.1, z: 0 };
    const rh: Landmark3D = { x: 0.15, y: 0.1, z: 0 };

    // Shoulder midpoint is (0, 0.6, 0), hip midpoint is (0, 0.1, 0)
    // Distance dy = 0.5
    const torso = torsoLength(ls, rs, lh, rh);
    expect(torso).toBeCloseTo(0.5, 4);

    expect(normalizeDistance(0.25, torso)).toBeCloseTo(0.5, 4);
    expect(normalizeDistance(0.5, torso)).toBeCloseTo(1.0, 4);
  });
});

describe('One Euro Filter', () => {
  it('smooths a noisy scalar signal (filtered output variance is significantly lower than raw noise)', () => {
    const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 });

    const baseValue = 100.0;
    const nSamples = 100;
    const dt = 33.33; // ~30 fps

    const rawValues: number[] = [];
    const filteredValues: number[] = [];

    // Simple deterministic pseudo-random generator
    let seed = 42;
    const pseudoRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    let t = 0;
    for (let i = 0; i < nSamples; i++) {
      const noise = (pseudoRandom() - 0.5) * 10; // noise in [-5, 5]
      const raw = baseValue + noise;
      const filtered = filter.filter(raw, t);

      rawValues.push(raw);
      filteredValues.push(filtered);
      t += dt;
    }

    // Calculate jitter as sum of absolute successive differences (after initial settling of 10 samples)
    let rawJitter = 0;
    let filteredJitter = 0;
    for (let i = 11; i < nSamples; i++) {
      rawJitter += Math.abs(rawValues[i] - rawValues[i - 1]);
      filteredJitter += Math.abs(filteredValues[i] - filteredValues[i - 1]);
    }

    // Filtered jitter should be substantially less than raw jitter
    expect(filteredJitter).toBeLessThan(rawJitter * 0.4);
  });

  it('resets state properly', () => {
    const filter = new OneEuroFilter();
    filter.filter(10, 0);
    filter.filter(20, 33);
    filter.reset();
    // After reset, first sample should be returned directly
    expect(filter.filter(50, 1000)).toBe(50);
  });
});

describe('Rep State Machine', () => {
  const squatConfig: ExerciseConfig = {
    upThreshold: 160,
    downThreshold: 100,
    minDurationMs: 800,
    direction: 'high-to-low',
    hysteresis: 5,
  };

  /**
   * Helper to simulate a cosine wave:
   * angle(t) oscillates between maxAngle and minAngle with period `repDurationMs`.
   */
  function simulateWave({
    nReps,
    repDurationMs,
    minAngle,
    maxAngle,
    fps = 30,
    noiseAmplitude = 0,
    config = squatConfig,
  }: {
    nReps: number;
    repDurationMs: number;
    minAngle: number;
    maxAngle: number;
    fps?: number;
    noiseAmplitude?: number;
    config?: ExerciseConfig;
  }) {
    const sm = new RepStateMachine(config);
    const dt = 1000 / fps;
    const totalTimeMs = nReps * repDurationMs;
    const midAngle = (maxAngle + minAngle) / 2;
    const amplitude = (maxAngle - minAngle) / 2;

    let seed = 12345;
    const pseudoRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    let t = 0;
    while (t <= totalTimeMs) {
      // cos wave: at t = 0 -> angle = mid + amp = maxAngle (standing)
      // at t = repDuration / 2 -> angle = mid - amp = minAngle (bottom)
      // at t = repDuration -> angle = mid + amp = maxAngle (standing)
      const phase = (2 * Math.PI * (t % repDurationMs)) / repDurationMs;
      const cleanAngle = midAngle + amplitude * Math.cos(phase);
      const noise = noiseAmplitude > 0 ? (pseudoRandom() - 0.5) * 2 * noiseAmplitude : 0;
      const currentAngle = cleanAngle + noise;

      sm.update(currentAngle, t);
      t += dt;
    }

    return sm;
  }

  it('counts exactly N reps on a clean sine wave between 170 and 80 degrees', () => {
    const N = 4;
    const sm = simulateWave({
      nReps: N,
      repDurationMs: 2000, // 2.0s per rep (> 800ms minDuration)
      minAngle: 80,
      maxAngle: 170,
    });

    expect(sm.getRepCount()).toBe(N);

    // Verify properties of emitted reps
    const reps = sm.getReps();
    expect(reps.length).toBe(N);
    for (const rep of reps) {
      expect(rep.minAngle).toBeLessThanOrEqual(100);
      expect(rep.maxAngle).toBeGreaterThanOrEqual(160);
      expect(rep.durationMs).toBeGreaterThanOrEqual(800);
    }
  });

  it('counts exactly N reps on the same wave with random noise', () => {
    const N = 4;
    const sm = simulateWave({
      nReps: N,
      repDurationMs: 2000,
      minAngle: 80,
      maxAngle: 170,
      noiseAmplitude: 4.0, // +/- 4 degrees jitter
    });

    expect(sm.getRepCount()).toBe(N);
  });

  it('does NOT count a half rep that only goes down to 130 degrees', () => {
    const sm = simulateWave({
      nReps: 3,
      repDurationMs: 2000,
      minAngle: 130, // Bottom threshold is 100, so 130 never enters 'bottom'
      maxAngle: 170,
    });

    expect(sm.getRepCount()).toBe(0);
    expect(sm.getState()).toBe('idle');
  });

  it('does NOT count a movement faster than the minimum duration', () => {
    const sm = simulateWave({
      nReps: 3,
      repDurationMs: 500, // 500ms < 800ms minDurationMs
      minAngle: 80,
      maxAngle: 170,
    });

    expect(sm.getRepCount()).toBe(0);
  });

  it('handles low-to-high exercise direction (e.g. leg extension)', () => {
    const legExtensionConfig: ExerciseConfig = {
      upThreshold: 160,
      downThreshold: 90,
      minDurationMs: 800,
      direction: 'low-to-high',
      hysteresis: 5,
    };

    const sm = new RepStateMachine(legExtensionConfig);
    const dt = 33.33;
    let t = 0;

    // Simulate 2 reps from 85 degrees up to 165 degrees and back to 85 degrees
    for (let rep = 0; rep < 2; rep++) {
      // 1. Starting at bottom (85 deg)
      sm.update(85, t);
      t += dt;

      // 2. Ascending to 165 deg
      for (let a = 90; a <= 165; a += 5) {
        sm.update(a, t);
        t += dt;
      }
      expect(sm.getState()).toBe('bottom'); // Inflection reached

      // 3. Descending back to 85 deg
      for (let a = 160; a >= 85; a -= 5) {
        sm.update(a, t);
        t += dt;
      }
      expect(sm.getState()).toBe('idle');
    }

    expect(sm.getRepCount()).toBe(2);
  });
});

describe('Squat Configuration & Leg Selection Logic', () => {
  it('exports compliant squat ExerciseConfig', () => {
    expect(squatConfig.upThreshold).toBe(160);
    expect(squatConfig.downThreshold).toBe(120);
    expect(squatConfig.minDurationMs).toBe(600);
    expect(squatConfig.direction).toBe('high-to-low');
    expect(squatConfig.view).toBe('side');
    expect(squatConfig.depthThreshold).toBe(100);
    expect(squatConfig.backThreshold).toBe(45);
    expect(squatConfig.tempoThreshold).toBe(800);
  });

  function create33Landmarks(): Landmark3D[] {
    return Array.from({ length: 33 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visibility: 0.5,
    }));
  }

  it('selects the leg with the higher average visibility (right leg higher)', () => {
    const lms = create33Landmarks();

    // Left leg: 23, 25, 27 -> avg = (0.5 + 0.6 + 0.4) / 3 = 0.5
    lms[SQUAT_LANDMARK_INDICES.LEFT_HIP].visibility = 0.5;
    lms[SQUAT_LANDMARK_INDICES.LEFT_KNEE].visibility = 0.6;
    lms[SQUAT_LANDMARK_INDICES.LEFT_ANKLE].visibility = 0.4;

    // Right leg: 24, 26, 28 -> avg = (0.9 + 0.8 + 0.85) / 3 = 0.85
    lms[SQUAT_LANDMARK_INDICES.RIGHT_HIP].visibility = 0.9;
    lms[SQUAT_LANDMARK_INDICES.RIGHT_KNEE].visibility = 0.8;
    lms[SQUAT_LANDMARK_INDICES.RIGHT_ANKLE].visibility = 0.85;

    const res = selectSquatLeg(lms, 0.5);
    expect(res).not.toBeNull();
    expect(res!.side).toBe('right');
    expect(res!.averageVisibility).toBeCloseTo(0.85, 2);
    expect(res!.isValid).toBe(true);
    expect(res!.landmarks.hip).toBe(lms[SQUAT_LANDMARK_INDICES.RIGHT_HIP]);
    expect(res!.landmarks.knee).toBe(lms[SQUAT_LANDMARK_INDICES.RIGHT_KNEE]);
    expect(res!.landmarks.ankle).toBe(lms[SQUAT_LANDMARK_INDICES.RIGHT_ANKLE]);
  });

  it('selects the leg with the higher average visibility (left leg higher)', () => {
    const lms = create33Landmarks();

    // Left leg: 23, 25, 27 -> avg = (0.9 + 0.85 + 0.95) / 3 = 0.9
    lms[SQUAT_LANDMARK_INDICES.LEFT_HIP].visibility = 0.9;
    lms[SQUAT_LANDMARK_INDICES.LEFT_KNEE].visibility = 0.85;
    lms[SQUAT_LANDMARK_INDICES.LEFT_ANKLE].visibility = 0.95;

    // Right leg: 24, 26, 28 -> avg = (0.3 + 0.2 + 0.4) / 3 = 0.3
    lms[SQUAT_LANDMARK_INDICES.RIGHT_HIP].visibility = 0.3;
    lms[SQUAT_LANDMARK_INDICES.RIGHT_KNEE].visibility = 0.2;
    lms[SQUAT_LANDMARK_INDICES.RIGHT_ANKLE].visibility = 0.4;

    const res = selectSquatLeg(lms, 0.5);
    expect(res).not.toBeNull();
    expect(res!.side).toBe('left');
    expect(res!.averageVisibility).toBeCloseTo(0.9, 2);
    expect(res!.isValid).toBe(true);
  });

  it('marks frame invalid when the highest average visibility is below 0.5', () => {
    const lms = create33Landmarks();

    // Left leg avg = 0.2
    lms[SQUAT_LANDMARK_INDICES.LEFT_HIP].visibility = 0.2;
    lms[SQUAT_LANDMARK_INDICES.LEFT_KNEE].visibility = 0.2;
    lms[SQUAT_LANDMARK_INDICES.LEFT_ANKLE].visibility = 0.2;

    // Right leg avg = 0.4 (< 0.5 threshold)
    lms[SQUAT_LANDMARK_INDICES.RIGHT_HIP].visibility = 0.4;
    lms[SQUAT_LANDMARK_INDICES.RIGHT_KNEE].visibility = 0.4;
    lms[SQUAT_LANDMARK_INDICES.RIGHT_ANKLE].visibility = 0.4;

    const res = selectSquatLeg(lms, 0.5);
    expect(res).not.toBeNull();
    expect(res!.side).toBe('right');
    expect(res!.isValid).toBe(false);
  });

  it('handles null, undefined, or incomplete landmark arrays gracefully', () => {
    expect(selectSquatLeg(null)).toBeNull();
    expect(selectSquatLeg(undefined)).toBeNull();
    expect(selectSquatLeg([])).toBeNull();
    expect(selectSquatLeg(Array.from({ length: 15 }))).toBeNull();
  });

  it('falls back to normalized landmarks visibility when world landmarks lack visibility', () => {
    const worldLms = create33Landmarks().map((l) => ({ x: l.x, y: l.y, z: l.z })); // no visibility property
    const normLms = create33Landmarks();

    // Set visibility only on normalized landmarks
    normLms[SQUAT_LANDMARK_INDICES.RIGHT_HIP].visibility = 0.85;
    normLms[SQUAT_LANDMARK_INDICES.RIGHT_KNEE].visibility = 0.85;
    normLms[SQUAT_LANDMARK_INDICES.RIGHT_ANKLE].visibility = 0.85;

    normLms[SQUAT_LANDMARK_INDICES.LEFT_HIP].visibility = 0.4;
    normLms[SQUAT_LANDMARK_INDICES.LEFT_KNEE].visibility = 0.4;
    normLms[SQUAT_LANDMARK_INDICES.LEFT_ANKLE].visibility = 0.4;

    const res = selectSquatLeg(worldLms, 0.5, normLms);
    expect(res).not.toBeNull();
    expect(res!.side).toBe('right');
    expect(res!.isValid).toBe(true);
    expect(res!.averageVisibility).toBeCloseTo(0.85, 2);
  });
});

describe('Torso Lean Angle Calculation', () => {
  it('computes 0 degrees for perfectly vertical upright posture', () => {
    const hip: Landmark3D = { x: 0, y: 0, z: 0 };
    const shoulder: Landmark3D = { x: 0, y: -0.6, z: 0 }; // directly above hip
    expect(computeTorsoLean(hip, shoulder)).toBeCloseTo(0, 4);
  });

  it('computes accurate lean angle from known geometric orientations', () => {
    const hip: Landmark3D = { x: 0, y: 0, z: 0 };

    // 30 degrees lean forward (Z-axis tilt)
    const len = 0.5;
    const s30: Landmark3D = {
      x: 0,
      y: -len * Math.cos((30 * Math.PI) / 180),
      z: len * Math.sin((30 * Math.PI) / 180),
    };
    expect(computeTorsoLean(hip, s30)).toBeCloseTo(30, 4);

    // 45 degrees lean
    const s45: Landmark3D = {
      x: 0,
      y: -len * Math.cos((45 * Math.PI) / 180),
      z: len * Math.sin((45 * Math.PI) / 180),
    };
    expect(computeTorsoLean(hip, s45)).toBeCloseTo(45, 4);

    // 90 degrees lean (completely horizontal)
    const s90: Landmark3D = { x: 0, y: 0, z: len };
    expect(computeTorsoLean(hip, s90)).toBeCloseTo(90, 4);
  });

  it('handles coincident points safely without crashing or NaN', () => {
    const pt: Landmark3D = { x: 1, y: 1, z: 1 };
    expect(computeTorsoLean(pt, pt)).toBe(0);
  });
});

describe('Squat Form Rules & Boundary Threshold Tests', () => {
  const dummyMetrics = (overrides: Partial<RepMetrics> = {}): RepMetrics => ({
    minKneeAngle: 85,
    maxTorsoLean: 25,
    descentDurationMs: 1200,
    minAngle: 85,
    maxAngle: 165,
    durationMs: 2200,
    ...overrides,
  });

  const testConfig: ExerciseConfig = {
    ...squatConfig,
    depthThreshold: 100,
    backThreshold: 45,
    tempoThreshold: 800,
  };

  it('depth rule: fires only when knee angle fails to drop below 100 degrees', () => {
    const depthRule = createDepthRule(testConfig);

    // Just below threshold (valid depth -> no violation)
    const validJustBelow = depthRule.check(dummyMetrics({ minKneeAngle: 99.5 }));
    expect(validJustBelow).toBeNull();

    // At threshold (requires strictly below 100 -> violation)
    const atThreshold = depthRule.check(dummyMetrics({ minKneeAngle: 100 }));
    expect(atThreshold).not.toBeNull();
    expect(atThreshold?.ruleId).toBe('depth');
    expect(atThreshold?.severity).toBe('high');
    expect(atThreshold?.penalty).toBe(30);
    expect(atThreshold?.message).toBe('Go lower');

    // Just above threshold (shallow squat -> violation)
    const shallow = depthRule.check(dummyMetrics({ minKneeAngle: 100.5 }));
    expect(shallow).not.toBeNull();
    expect(shallow?.ruleId).toBe('depth');
    expect(shallow?.penalty).toBe(30);
    expect(shallow?.message).toBe('Go lower');
  });

  it('back rule: fires only when torso lean reaches or exceeds 45 degrees', () => {
    const backRule = createBackRule(testConfig);

    // Just below threshold (good upright chest -> no violation)
    const validJustBelow = backRule.check(dummyMetrics({ maxTorsoLean: 44.5 }));
    expect(validJustBelow).toBeNull();

    // At threshold (requires below 45 -> violation)
    const atThreshold = backRule.check(dummyMetrics({ maxTorsoLean: 45 }));
    expect(atThreshold).not.toBeNull();
    expect(atThreshold?.ruleId).toBe('back');
    expect(atThreshold?.severity).toBe('high');
    expect(atThreshold?.penalty).toBe(25);
    expect(atThreshold?.message).toBe('Keep your chest up');

    // Just above threshold (excessive lean -> violation)
    const leaningForward = backRule.check(dummyMetrics({ maxTorsoLean: 45.5 }));
    expect(leaningForward).not.toBeNull();
    expect(leaningForward?.ruleId).toBe('back');
    expect(leaningForward?.penalty).toBe(25);
    expect(leaningForward?.message).toBe('Keep your chest up');
  });

  it('tempo rule: fires only when descent duration is less than 800 ms', () => {
    const tempoRule = createTempoRule(testConfig);

    // At threshold (descent of at least 800 ms -> no violation)
    const atThreshold = tempoRule.check(dummyMetrics({ descentDurationMs: 800 }));
    expect(atThreshold).toBeNull();

    // Just above threshold (controlled descent -> no violation)
    const validJustAbove = tempoRule.check(dummyMetrics({ descentDurationMs: 801 }));
    expect(validJustAbove).toBeNull();

    // Just below threshold (too fast descent -> violation)
    const tooFast = tempoRule.check(dummyMetrics({ descentDurationMs: 799 }));
    expect(tooFast).not.toBeNull();
    expect(tooFast?.ruleId).toBe('tempo');
    expect(tooFast?.severity).toBe('low');
    expect(tooFast?.penalty).toBe(15);
    expect(tooFast?.message).toBe('Slow down');
  });

  it('thresholds are dynamically read from config and not hardcoded', () => {
    const customConfig: ExerciseConfig = {
      ...squatConfig,
      depthThreshold: 90, // Custom strict depth
      backThreshold: 35, // Custom strict chest
      tempoThreshold: 1000, // Custom slower tempo
    };

    const rules = createSquatRules(customConfig);
    const [depthRule, backRule, tempoRule] = rules;

    // Angle of 95° is valid under default 100°, but fails under custom 90°
    expect(depthRule.check(dummyMetrics({ minKneeAngle: 95 }))).not.toBeNull();
    expect(depthRule.check(dummyMetrics({ minKneeAngle: 89 }))).toBeNull();

    // Torso lean of 40° is valid under default 45°, but fails under custom 35°
    expect(backRule.check(dummyMetrics({ maxTorsoLean: 40 }))).not.toBeNull();
    expect(backRule.check(dummyMetrics({ maxTorsoLean: 34 }))).toBeNull();

    // Tempo of 900ms is valid under default 800ms, but fails under custom 1000ms
    expect(tempoRule.check(dummyMetrics({ descentDurationMs: 900 }))).not.toBeNull();
    expect(tempoRule.check(dummyMetrics({ descentDurationMs: 1050 }))).toBeNull();
  });
});

describe('Scoring & Penalty Stacking', () => {
  const dummyMetrics = (overrides: Partial<RepMetrics> = {}): RepMetrics => ({
    minKneeAngle: 85,
    maxTorsoLean: 25,
    descentDurationMs: 1200,
    minAngle: 85,
    maxAngle: 165,
    durationMs: 2200,
    ...overrides,
  });

  const rules = createSquatRules(squatConfig);

  it('a perfect synthetic rep gives score 100 with zero violations', () => {
    const perfectMetrics = dummyMetrics({
      minKneeAngle: 80, // well below 100
      maxTorsoLean: 20, // well below 45
      descentDurationMs: 1200, // well above 800
    });

    const result = evaluateRep(perfectMetrics, rules);
    expect(result.violations).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it('stacks violations and deducts cumulative penalties correctly', () => {
    // 1. Only Depth violated: 100 - 30 = 70
    const depthFailed = evaluateRep(dummyMetrics({ minKneeAngle: 105 }), rules);
    expect(depthFailed.violations).toHaveLength(1);
    expect(depthFailed.violations[0].ruleId).toBe('depth');
    expect(depthFailed.score).toBe(70);

    // 2. Depth (30) + Back (25) violated: 100 - (30 + 25) = 45
    const depthAndBackFailed = evaluateRep(
      dummyMetrics({ minKneeAngle: 105, maxTorsoLean: 50 }),
      rules
    );
    expect(depthAndBackFailed.violations).toHaveLength(2);
    expect(depthAndBackFailed.score).toBe(45);

    // 3. All three violated (Depth 30 + Back 25 + Tempo 15 = 70 penalty): 100 - 70 = 30
    const allFailed = evaluateRep(
      dummyMetrics({ minKneeAngle: 105, maxTorsoLean: 50, descentDurationMs: 500 }),
      rules
    );
    expect(allFailed.violations).toHaveLength(3);
    expect(allFailed.score).toBe(30);

    // 4. Back (25) + Tempo (15) violated: 100 - 40 = 60
    const backAndTempoFailed = evaluateRep(
      dummyMetrics({ minKneeAngle: 85, maxTorsoLean: 50, descentDurationMs: 500 }),
      rules
    );
    expect(backAndTempoFailed.violations).toHaveLength(2);
    expect(backAndTempoFailed.score).toBe(60);
  });

  it('score never goes below 0 when penalties exceed 100', () => {
    const extremeViolations: FormViolation[] = [
      { ruleId: 'rule1', severity: 'high', penalty: 50, message: 'm1', actualValue: 0, threshold: 0 },
      { ruleId: 'rule2', severity: 'high', penalty: 40, message: 'm2', actualValue: 0, threshold: 0 },
      { ruleId: 'rule3', severity: 'high', penalty: 30, message: 'm3', actualValue: 0, threshold: 0 },
    ]; // total penalty 120

    expect(calculateScore(extremeViolations)).toBe(0);
  });
});

describe('Full State Machine Rep Metrics & Form Rules Integration', () => {
  it('records metrics frame by frame and emits rep with score 100 on perfect squat', () => {
    const sm = new RepStateMachine(squatConfig);
    const dt = 33.33;
    let t = 0;

    // Start in standing position (165°)
    sm.update(165, t, { torsoLean: 10 });
    t += dt;

    // Slowly descend from 165° down to 85° over 60 steps (~2000 ms)
    // Spending > 850 ms in the descending phase (from 155° down to 120°)
    const descentSteps = 60;
    for (let i = 1; i <= descentSteps; i++) {
      const a = 165 - (i / descentSteps) * (165 - 85);
      const lean = 10 + (i / descentSteps) * 15; // lean up to 25°
      sm.update(a, t, { torsoLean: lean });
      t += dt;
    }

    // In bottom
    expect(sm.getState()).toBe('bottom');

    // Ascend back to 165° over 30 steps (~1000 ms)
    const ascentSteps = 30;
    let completedRep = null;
    for (let i = 1; i <= ascentSteps; i++) {
      const a = 85 + (i / ascentSteps) * (165 - 85);
      const res = sm.update(a, t, { torsoLean: 20 });
      if (res.completedRep) {
        completedRep = res.completedRep;
      }
      t += dt;
    }

    expect(completedRep).not.toBeNull();
    expect(completedRep!.score).toBe(100);
    expect(completedRep!.violations).toHaveLength(0);
    expect(completedRep!.metrics.minKneeAngle).toBeCloseTo(85, 1);
    expect(completedRep!.metrics.maxTorsoLean).toBeCloseTo(25, 1);
    expect(completedRep!.metrics.descentDurationMs).toBeGreaterThanOrEqual(800);
    expect(completedRep!.metrics.durationMs).toBeGreaterThanOrEqual(2000);
  });

  it('correctly catches shallow depth (down to 110°) and applies depth penalty', () => {
    const sm = new RepStateMachine(squatConfig);
    const dt = 33.33;
    let t = 0;

    // Stand
    sm.update(165, t, { torsoLean: 10 });
    t += dt;

    // Slowly descend to 110° (< 120 downThreshold so rep counts, but >= 100 depthThreshold)
    // Over 45 steps (~1500 ms) so tempo rule passes (descent >= 800 ms)
    const descentSteps = 45;
    for (let i = 1; i <= descentSteps; i++) {
      const a = 165 - (i / descentSteps) * (165 - 110);
      sm.update(a, t, { torsoLean: 20 });
      t += dt;
    }

    expect(sm.getState()).toBe('bottom');

    // Ascend back to 165°
    const ascentSteps = 30;
    let completedRep = null;
    for (let i = 1; i <= ascentSteps; i++) {
      const a = 110 + (i / ascentSteps) * (165 - 110);
      const res = sm.update(a, t, { torsoLean: 20 });
      if (res.completedRep) {
        completedRep = res.completedRep;
      }
      t += dt;
    }

    expect(completedRep).not.toBeNull();
    expect(completedRep!.score).toBe(70); // 100 - 30 (depth violation only)
    expect(completedRep!.violations).toHaveLength(1);
    expect(completedRep!.violations[0].ruleId).toBe('depth');
    expect(completedRep!.violations[0].message).toBe('Go lower');
    expect(completedRep!.metrics.minKneeAngle).toBeCloseTo(110, 1);
  });
});
