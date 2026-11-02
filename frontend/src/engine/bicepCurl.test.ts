import { describe, it, expect } from 'vitest';
import {
  RepStateMachine,
  bicepCurlConfig,
  squatConfig,
  selectBicepCurlArm,
  type Landmark3D,
} from './index';

describe('Bicep Curl Engine & Form Rules', () => {
  interface CurlLandmarkOptions {
    elbowOffset?: { x: number; y: number; z: number };
    shoulderOffset?: { x: number; y: number; z: number };
    scale?: number;
    rightVis?: number;
    leftVis?: number;
  }

  /**
   * Helper to build a full synthetic 33-landmark skeleton for bicep curl.
   * Torso length is exactly 0.5 * scale.
   */
  function createSyntheticCurlLandmarks(
    elbowAngleDeg: number,
    options: CurlLandmarkOptions = {}
  ): Landmark3D[] {
    const scale = options.scale ?? 1.0;
    const rightVis = options.rightVis ?? 0.95;
    const leftVis = options.leftVis ?? 0.1;

    const lms: Landmark3D[] = Array.from({ length: 33 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visibility: 0.1,
    }));

    // Torso endpoints
    // Shoulders: left (-0.2, 0, 0), right (+0.2, 0, 0) -> midpoint (0, 0, 0)
    // Hips: left (-0.15, 0.5, 0), right (+0.15, 0.5, 0) -> midpoint (0, 0.5, 0)
    // Distance between midpoints = 0.5 * scale
    lms[11] = { x: -0.2 * scale, y: 0, z: 0, visibility: leftVis };
    lms[12] = {
      x: (0.2 + (options.shoulderOffset?.x ?? 0)) * scale,
      y: (0 + (options.shoulderOffset?.y ?? 0)) * scale,
      z: (0 + (options.shoulderOffset?.z ?? 0)) * scale,
      visibility: rightVis,
    };
    lms[23] = { x: -0.15 * scale, y: 0.5 * scale, z: 0, visibility: leftVis };
    lms[24] = { x: 0.15 * scale, y: 0.5 * scale, z: 0, visibility: rightVis };

    // Upper arm: shoulder to elbow along +Y axis (length 0.3 * scale)
    const upperArmLen = 0.3 * scale;
    const elbowBaseX = 0.2 * scale;
    const elbowBaseY = upperArmLen;
    const elbowBaseZ = 0;

    lms[14] = {
      x: elbowBaseX + (options.elbowOffset?.x ?? 0) * scale,
      y: elbowBaseY + (options.elbowOffset?.y ?? 0) * scale,
      z: elbowBaseZ + (options.elbowOffset?.z ?? 0) * scale,
      visibility: rightVis,
    };

    // Forearm: length 0.25 * scale
    // Vector BA (elbow to shoulder) = (0, -upperArmLen, 0)
    // Angle between BA and BC is elbowAngleDeg
    const forearmLen = 0.25 * scale;
    const rad = (elbowAngleDeg * Math.PI) / 180;
    // BC = (0, -forearmLen * cos(rad), forearmLen * sin(rad))
    lms[16] = {
      x: lms[14].x,
      y: lms[14].y - forearmLen * Math.cos(rad),
      z: lms[14].z + forearmLen * Math.sin(rad),
      visibility: rightVis,
    };

    // Left arm dummy landmarks
    lms[13] = { x: -0.2 * scale, y: upperArmLen, z: 0, visibility: leftVis };
    lms[15] = { x: -0.2 * scale, y: upperArmLen + forearmLen, z: 0, visibility: leftVis };

    return lms;
  }

  // 1. Clean synthetic curl
  it('1. counts 1 rep with score 100 and no violations for a clean curl (170 -> 40 -> 170 over ~2s)', () => {
    const sm = new RepStateMachine(bicepCurlConfig);
    const dt = 25; // 40 fps
    let t = 1000;

    const feed = (angle: number) => {
      const worldLandmarks = createSyntheticCurlLandmarks(angle);
      const res = sm.update(angle, t, { worldLandmarks });
      t += dt;
      return res;
    };

    // Ready position (extended at 170°)
    for (let i = 0; i < 10; i++) feed(170);

    // Descent (contraction from 170° down to 40°): 40 frames * 25ms = 1000 ms
    for (let i = 1; i <= 40; i++) {
      const a = 170 - (i / 40) * (170 - 40);
      feed(a);
    }

    // Ascent (extension from 40° back to 170°): 40 frames * 25ms = 1000 ms
    for (let i = 1; i <= 40; i++) {
      const a = 40 + (i / 40) * (170 - 40);
      feed(a);
    }

    expect(sm.getRepCount()).toBe(1);
    const rep = sm.getReps()[0];
    expect(rep.score).toBe(100);
    expect(rep.violations).toEqual([]);
    expect(rep.metrics.minElbowAngle).toBeCloseTo(40, 1);
    expect(rep.metrics.maxElbowAngle).toBeCloseTo(170, 1);
    expect(rep.metrics.elbowDrift).toBeCloseTo(0, 4);
    expect(rep.metrics.bodySway).toBeCloseTo(0, 4);
  });

  // 2. Half curl that reaches only 90 degrees
  it('2. does NOT count a half curl reaching only 90 degrees', () => {
    const sm = new RepStateMachine(bicepCurlConfig);
    const dt = 25;
    let t = 1000;

    const feed = (angle: number) => {
      const worldLandmarks = createSyntheticCurlLandmarks(angle);
      const res = sm.update(angle, t, { worldLandmarks });
      t += dt;
      return res;
    };

    for (let i = 0; i < 10; i++) feed(170);

    // Contraction only down to 90° (does not cross downThreshold of 70°)
    for (let i = 1; i <= 40; i++) {
      const a = 170 - (i / 40) * (170 - 90);
      feed(a);
    }

    // Return to 170°
    for (let i = 1; i <= 40; i++) {
      const a = 90 + (i / 40) * (170 - 90);
      feed(a);
    }

    expect(sm.getRepCount()).toBe(0);
    expect(sm.getState()).toBe('idle');
  });

  // 3. Partial curl: reaches 65 degrees, returns to 150
  it('3. counts a curl reaching 65 degrees returning to 150, triggers "Curl higher" rule, score 75', () => {
    const sm = new RepStateMachine(bicepCurlConfig);
    const dt = 25;
    let t = 1000;

    const feed = (angle: number) => {
      const worldLandmarks = createSyntheticCurlLandmarks(angle);
      const res = sm.update(angle, t, { worldLandmarks });
      t += dt;
      return res;
    };

    for (let i = 0; i < 10; i++) feed(170);

    // Contraction to 65° (below downThreshold 70°, but above rangeThreshold 50°)
    for (let i = 1; i <= 40; i++) {
      const a = 170 - (i / 40) * (170 - 65);
      feed(a);
    }

    // Return to 150° (above upThreshold 140°)
    for (let i = 1; i <= 40; i++) {
      const a = 65 + (i / 40) * (150 - 65);
      feed(a);
    }

    expect(sm.getRepCount()).toBe(1);
    const rep = sm.getReps()[0];
    expect(rep.score).toBe(75);
    expect(rep.violations).toHaveLength(1);
    expect(rep.violations[0].ruleId).toBe('range');
    expect(rep.violations[0].message).toBe('Curl higher');
    expect(rep.violations[0].penalty).toBe(25);
    expect(rep.metrics.minElbowAngle).toBeCloseTo(65, 1);
  });

  // 4. Incomplete extension: starts and ends at 145 degrees, reaches 40
  it('4. counts a curl starting/ending at 145 degrees reaching 40, triggers "Fully extend" rule, score 80', () => {
    const sm = new RepStateMachine(bicepCurlConfig);
    const dt = 25;
    let t = 1000;

    const feed = (angle: number) => {
      const worldLandmarks = createSyntheticCurlLandmarks(angle);
      const res = sm.update(angle, t, { worldLandmarks });
      t += dt;
      return res;
    };

    // Ready at 145° (above upThreshold 140°, but below extensionThreshold 160°)
    for (let i = 0; i < 10; i++) feed(145);

    // Contraction to 40°
    for (let i = 1; i <= 40; i++) {
      const a = 145 - (i / 40) * (145 - 40);
      feed(a);
    }

    // Return to 145°
    for (let i = 1; i <= 40; i++) {
      const a = 40 + (i / 40) * (145 - 40);
      feed(a);
    }

    expect(sm.getRepCount()).toBe(1);
    const rep = sm.getReps()[0];
    expect(rep.score).toBe(80);
    expect(rep.violations).toHaveLength(1);
    expect(rep.violations[0].ruleId).toBe('extension');
    expect(rep.violations[0].message).toBe('Fully extend');
    expect(rep.violations[0].penalty).toBe(20);
    expect(rep.metrics.maxElbowAngle).toBeCloseTo(145, 1);
  });

  // 5. Boundary tests
  describe('5. Boundary tests for all 4 form rules', () => {
    const runCurl = (
      startAngle: number,
      minAngle: number,
      endAngle: number,
      options: {
        elbowOffset?: { x: number; y: number; z: number };
        shoulderOffset?: { x: number; y: number; z: number };
      } = {}
    ) => {
      const sm = new RepStateMachine(bicepCurlConfig);
      const dt = 25;
      let t = 1000;

      const feed = (
        angle: number,
        offsets?: {
          elbowOffset?: { x: number; y: number; z: number };
          shoulderOffset?: { x: number; y: number; z: number };
        }
      ) => {
        const worldLandmarks = createSyntheticCurlLandmarks(angle, offsets);
        const res = sm.update(angle, t, { worldLandmarks });
        t += dt;
        return res;
      };

      for (let i = 0; i < 5; i++) feed(startAngle);
      for (let i = 1; i <= 30; i++) {
        const a = startAngle - (i / 30) * (startAngle - minAngle);
        const inRep = a < 140;
        feed(a, inRep ? options : undefined);
      }
      for (let i = 1; i <= 30; i++) {
        const a = minAngle + (i / 30) * (endAngle - minAngle);
        feed(a, options);
      }
      return sm.getReps()[0];
    };

    it('range boundary: fires at 55.1, passes at 54.9', () => {
      const repFires = runCurl(170, 55.1, 170);
      expect(repFires.violations.some((v) => v.ruleId === 'range')).toBe(true);

      const repPasses = runCurl(170, 54.9, 170);
      expect(repPasses.violations.some((v) => v.ruleId === 'range')).toBe(false);
    });

    it('extension boundary: fires at 149.9, passes at 150.1', () => {
      const repFires = runCurl(149.9, 40, 145);
      expect(repFires.violations.some((v) => v.ruleId === 'extension')).toBe(true);

      const repPasses = runCurl(150.1, 40, 145);
      expect(repPasses.violations.some((v) => v.ruleId === 'extension')).toBe(false);
    });

    it('drift boundary: fires at 0.23, passes at 0.21', () => {
      // torsoLength is 0.5.
      // threshold is 0.22.
      // 0.23 * 0.5 = 0.115
      const repFires = runCurl(170, 40, 170, {
        elbowOffset: { x: 0.115, y: 0, z: 0 },
      });
      expect(repFires.metrics.elbowDrift).toBeCloseTo(0.23, 2);
      expect(repFires.violations.some((v) => v.ruleId === 'elbowDrift')).toBe(true);

      // 0.21 * 0.5 = 0.105
      const repPasses = runCurl(170, 40, 170, {
        elbowOffset: { x: 0.105, y: 0, z: 0 },
      });
      expect(repPasses.metrics.elbowDrift).toBeCloseTo(0.21, 2);
      expect(repPasses.violations.some((v) => v.ruleId === 'elbowDrift')).toBe(false);
    });

    it('swing boundary: fires at 0.16, passes at 0.14', () => {
      // torsoLength is 0.5.
      // threshold is 0.15.
      // 0.16 * 0.5 = 0.08
      const repFires = runCurl(170, 40, 170, {
        shoulderOffset: { x: 0.08, y: 0, z: 0 },
      });
      expect(repFires.metrics.bodySway).toBeCloseTo(0.16, 2);
      expect(repFires.violations.some((v) => v.ruleId === 'swing')).toBe(true);

      // 0.14 * 0.5 = 0.07
      const repPasses = runCurl(170, 40, 170, {
        shoulderOffset: { x: 0.07, y: 0, z: 0 },
      });
      expect(repPasses.metrics.bodySway).toBeCloseTo(0.14, 2);
      expect(repPasses.violations.some((v) => v.ruleId === 'swing')).toBe(false);
    });
  });

  // 6. Violation stacking
  it('6. stacks penalties correctly: drift + swing = penalty 55 (score 45); all 4 violated clamps score to 0', () => {
    const sm = new RepStateMachine(bicepCurlConfig);
    const dt = 25;
    let t = 1000;

    const feed = (
      angle: number,
      offsets?: {
        elbowOffset?: { x: number; y: number; z: number };
        shoulderOffset?: { x: number; y: number; z: number };
      }
    ) => {
      const worldLandmarks = createSyntheticCurlLandmarks(angle, offsets);
      const res = sm.update(angle, t, { worldLandmarks });
      t += dt;
      return res;
    };

    // Rep 1: Drift (> 0.22, penalty 30) + Swing (> 0.15, penalty 25)
    for (let i = 0; i < 5; i++) feed(170);
    // 0.26 * 0.5 = 0.13 offset for elbow; 0.18 * 0.5 = 0.09 for shoulder
    const stackOffsets = {
      elbowOffset: { x: 0.13, y: 0, z: 0 },
      shoulderOffset: { x: 0.09, y: 0, z: 0 },
    };
    for (let i = 1; i <= 30; i++) {
      const a = 170 - (i / 30) * (170 - 40);
      const inRep = a < 140;
      feed(a, inRep ? stackOffsets : undefined);
    }
    for (let i = 1; i <= 30; i++) {
      const a = 40 + (i / 30) * (170 - 40);
      feed(a, stackOffsets);
    }

    expect(sm.getRepCount()).toBe(1);
    const rep1 = sm.getReps()[0];
    expect(rep1.violations).toHaveLength(2);
    expect(rep1.score).toBe(45); // 100 - 30 - 25 = 45

    // Rep 2: All 4 violated
    // Incomplete range (min 65 > 55, penalty 25)
    // Incomplete extension (start/end 145 < 150, penalty 20)
    // Drift (penalty 30)
    // Swing (penalty 25)
    // Total penalty = 100 -> score = 0
    const sm2 = new RepStateMachine(bicepCurlConfig);
    t = 1000;
    const feed2 = (
      angle: number,
      offsets?: {
        elbowOffset?: { x: number; y: number; z: number };
        shoulderOffset?: { x: number; y: number; z: number };
      }
    ) => {
      const worldLandmarks = createSyntheticCurlLandmarks(angle, offsets);
      const res = sm2.update(angle, t, { worldLandmarks });
      t += dt;
      return res;
    };

    for (let i = 0; i < 5; i++) feed2(145);
    for (let i = 1; i <= 30; i++) {
      const a = 145 - (i / 30) * (145 - 65);
      const inRep = a < 140;
      feed2(a, inRep ? stackOffsets : undefined);
    }
    for (let i = 1; i <= 30; i++) {
      const a = 65 + (i / 30) * (145 - 65);
      feed2(a, stackOffsets);
    }

    expect(sm2.getRepCount()).toBe(1);
    const rep2 = sm2.getReps()[0];
    expect(rep2.violations).toHaveLength(4);
    expect(rep2.score).toBe(0);
  });

  // 7. Scale invariance
  it('7. ensures scale invariance: scaling landmarks by 2x yields identical elbowDrift and bodySway within 1e-6', () => {
    const runScaledCurl = (scale: number) => {
      const sm = new RepStateMachine(bicepCurlConfig);
      const dt = 25;
      let t = 1000;

      const offsets = {
        elbowOffset: { x: 0.06, y: 0.02, z: 0.03 },
        shoulderOffset: { x: 0.04, y: 0, z: 0.02 },
      };

      for (let i = 0; i < 5; i++) {
        const lms = createSyntheticCurlLandmarks(170, { scale });
        sm.update(170, t, { worldLandmarks: lms });
        t += dt;
      }

      for (let i = 1; i <= 30; i++) {
        const a = 170 - (i / 30) * (170 - 40);
        const lms = createSyntheticCurlLandmarks(a, { scale, ...offsets });
        sm.update(a, t, { worldLandmarks: lms });
        t += dt;
      }

      for (let i = 1; i <= 30; i++) {
        const a = 40 + (i / 30) * (170 - 40);
        const lms = createSyntheticCurlLandmarks(a, { scale, ...offsets });
        sm.update(a, t, { worldLandmarks: lms });
        t += dt;
      }

      return sm.getReps()[0].metrics;
    };

    const metrics1x = runScaledCurl(1.0);
    const metrics2x = runScaledCurl(2.0);

    expect(metrics1x.elbowDrift).toBeDefined();
    expect(metrics2x.elbowDrift).toBeDefined();
    expect(Math.abs(metrics1x.elbowDrift! - metrics2x.elbowDrift!)).toBeLessThan(1e-6);

    expect(metrics1x.bodySway).toBeDefined();
    expect(metrics2x.bodySway).toBeDefined();
    expect(Math.abs(metrics1x.bodySway! - metrics2x.bodySway!)).toBeLessThan(1e-6);
  });

  // 8. Arm selection
  it('8. selects arm with higher visibility; skips when both are below 0.5', () => {
    // Right arm has higher visibility
    const rightArmLms = createSyntheticCurlLandmarks(170, {
      rightVis: 0.9,
      leftVis: 0.3,
    });
    const rightSel = selectBicepCurlArm(rightArmLms, 0.5);
    expect(rightSel).not.toBeNull();
    expect(rightSel?.side).toBe('right');
    expect(rightSel?.isValid).toBe(true);
    expect(rightSel?.averageVisibility).toBeCloseTo(0.9, 2);

    // Left arm has higher visibility
    const leftArmLms = createSyntheticCurlLandmarks(170, {
      rightVis: 0.3,
      leftVis: 0.85,
    });
    const leftSel = selectBicepCurlArm(leftArmLms, 0.5);
    expect(leftSel).not.toBeNull();
    expect(leftSel?.side).toBe('left');
    expect(leftSel?.isValid).toBe(true);
    expect(leftSel?.averageVisibility).toBeCloseTo(0.85, 2);

    // Both below 0.5
    const lowVisLms = createSyntheticCurlLandmarks(170, {
      rightVis: 0.4,
      leftVis: 0.3,
    });
    const lowSel = selectBicepCurlArm(lowVisLms, 0.5);
    expect(lowSel).not.toBeNull();
    expect(lowSel?.isValid).toBe(false);
  });

  // 9. Fast movement
  it('9. does NOT count a movement faster than minDurationMs (500 ms)', () => {
    const sm = new RepStateMachine(bicepCurlConfig);
    const dt = 25;
    let t = 1000;

    const feed = (angle: number) => {
      const worldLandmarks = createSyntheticCurlLandmarks(angle);
      const res = sm.update(angle, t, { worldLandmarks });
      t += dt;
      return res;
    };

    for (let i = 0; i < 5; i++) feed(170);

    // Fast curl: 6 frames descent (150ms) + 6 frames ascent (150ms) = 300ms total (< 500ms)
    for (let i = 1; i <= 6; i++) {
      const a = 170 - (i / 6) * (170 - 40);
      feed(a);
    }
    for (let i = 1; i <= 6; i++) {
      const a = 40 + (i / 6) * (170 - 40);
      feed(a);
    }

    expect(sm.getRepCount()).toBe(0);
    expect(sm.getState()).toBe('idle');
  });

  // 10. Exercise switching
  it('10. switches between squat and bicep curl cleanly using setConfig with zero state leakage', () => {
    const sm = new RepStateMachine(squatConfig);
    const dt = 25;
    let t = 1000;

    // Helper for synthetic squat
    const feedSquat = (angle: number, lean: number) => {
      return sm.update(angle, t, { torsoLean: lean });
    };

    // Run 2 clean squats (165 -> 85 -> 165, minDuration 600ms)
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 5; i++) {
        feedSquat(165, 15);
        t += dt;
      }
      for (let i = 1; i <= 35; i++) {
        feedSquat(165 - (i / 35) * (165 - 85), 20);
        t += dt;
      }
      for (let i = 1; i <= 35; i++) {
        feedSquat(85 + (i / 35) * (165 - 85), 20);
        t += dt;
      }
    }

    expect(sm.getRepCount()).toBe(2);
    const squatReps = sm.getReps();
    expect(squatReps[0].metrics.minKneeAngle).toBeDefined();
    expect(squatReps[0].metrics.maxTorsoLean).toBeDefined();
    expect(squatReps[0].metrics.minElbowAngle).toBeUndefined();
    expect(squatReps[0].score).toBe(100);

    // Switch exercise configuration to bicepCurlConfig
    sm.setConfig(bicepCurlConfig);
    expect(sm.getRepCount()).toBe(0);
    expect(sm.getState()).toBe('idle');

    // Run 2 clean bicep curls (170 -> 40 -> 170)
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 5; i++) {
        const lms = createSyntheticCurlLandmarks(170);
        sm.update(170, t, { worldLandmarks: lms });
        t += dt;
      }
      for (let i = 1; i <= 35; i++) {
        const a = 170 - (i / 35) * (170 - 40);
        const lms = createSyntheticCurlLandmarks(a);
        sm.update(a, t, { worldLandmarks: lms });
        t += dt;
      }
      for (let i = 1; i <= 35; i++) {
        const a = 40 + (i / 35) * (170 - 40);
        const lms = createSyntheticCurlLandmarks(a);
        sm.update(a, t, { worldLandmarks: lms });
        t += dt;
      }
    }

    expect(sm.getRepCount()).toBe(2);
    const curlReps = sm.getReps();
    expect(curlReps[0].metrics.minElbowAngle).toBeDefined();
    expect(curlReps[0].metrics.maxElbowAngle).toBeDefined();
    expect(curlReps[0].metrics.elbowDrift).toBeDefined();
    expect(curlReps[0].metrics.bodySway).toBeDefined();
    expect(curlReps[0].score).toBe(100);
    expect(curlReps[0].violations).toEqual([]);
    expect(curlReps[1].score).toBe(100);
    expect(curlReps[1].violations).toEqual([]);
  });
});
