import { describe, it, expect } from 'vitest';
import { angle, isLandmarkVisible, areLandmarksVisible, torsoLength, normalizeDistance } from './features';
import { OneEuroFilter } from './oneEuroFilter';
import { RepStateMachine } from './stateMachine';
import type { ExerciseConfig, Landmark3D } from './types';

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
