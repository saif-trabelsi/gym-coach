import { describe, it, expect } from 'vitest';
import { FeedbackManager } from './manager';
import type { FormViolation, RepMetrics, RepResult } from '../engine/types';

describe('FeedbackManager', () => {
  const dummyMetrics: RepMetrics = {
    minKneeAngle: 85,
    maxTorsoLean: 20,
    descentDurationMs: 1200,
    descentStartMs: 1000,
    bottomMs: 2200,
    minAngle: 85,
    maxAngle: 165,
    durationMs: 2200,
  };

  const createRep = (overrides: Partial<RepResult> = {}): RepResult => ({
    minAngle: 85,
    maxAngle: 165,
    durationMs: 2200,
    timestamp: 1000,
    metrics: dummyMetrics,
    violations: [],
    score: 100,
    ...overrides,
  });

  const depthViolation: FormViolation = {
    ruleId: 'depth',
    severity: 'high',
    penalty: 30,
    message: 'Go lower',
    actualValue: 110,
    threshold: 100,
  };

  const backViolation: FormViolation = {
    ruleId: 'back',
    severity: 'high',
    penalty: 25,
    message: 'Keep your chest up',
    actualValue: 50,
    threshold: 45,
  };

  const tempoViolation: FormViolation = {
    ruleId: 'tempo',
    severity: 'low',
    penalty: 15,
    message: 'Slow down',
    actualValue: 500,
    threshold: 800,
  };

  it('respects the 3000 ms cooldown between messages', () => {
    const manager = new FeedbackManager(3000);

    // 1. Rep at t = 1000 ms with depth violation
    const rep1 = createRep({ violations: [depthViolation], score: 70, timestamp: 1000 });
    const res1 = manager.processRep(rep1, 1000);
    expect(res1).not.toBeNull();
    expect(res1?.message).toBe('Go lower');

    // 2. Rep at t = 2500 ms (elapsed 1500 ms < 3000 ms cooldown) -> must be throttled
    const rep2 = createRep({ violations: [backViolation], score: 75, timestamp: 2500 });
    const res2 = manager.processRep(rep2, 2500);
    expect(res2).toBeNull();

    // 3. Rep at t = 3999 ms (elapsed 2999 ms < 3000 ms) -> must still be throttled
    const res3 = manager.processRep(rep2, 3999);
    expect(res3).toBeNull();

    // 4. Rep at t = 4001 ms (elapsed 3001 ms >= 3000 ms) -> cooldown passed, emits message
    const res4 = manager.processRep(rep2, 4001);
    expect(res4).not.toBeNull();
    expect(res4?.message).toBe('Keep your chest up');
  });

  it('prioritizes violations by highest severity (high > low)', () => {
    const manager = new FeedbackManager(3000);

    // Rep with both tempo (low) and depth (high)
    const rep = createRep({
      violations: [tempoViolation, depthViolation],
      score: 55,
      timestamp: 1000,
    });

    const res = manager.processRep(rep, 1000);
    expect(res).not.toBeNull();
    expect(res?.ruleId).toBe('depth');
    expect(res?.message).toBe('Go lower');
  });

  it('repeats the same message only after the repeat window (8000 ms by default)', () => {
    const manager = new FeedbackManager(3000, 8000);

    // Rep 1 at t = 1000: depth violation -> emits "Go lower"
    const rep1 = createRep({ violations: [depthViolation], score: 70 });
    const res1 = manager.processRep(rep1, 1000);
    expect(res1?.message).toBe('Go lower');

    // Rep 2 at t = 5000: cooldown (3000ms) passed, but repeat window (8000ms) has not elapsed
    // 5000 - 1000 = 4000ms < 8000ms -> must NOT repeat "Go lower"
    const rep2 = createRep({ violations: [depthViolation], score: 70 });
    const res2 = manager.processRep(rep2, 5000);
    expect(res2).toBeNull();

    // Rep 3 at t = 9001: 9001 - 1000 = 8001ms >= 8000ms repeat window passed -> emits "Go lower"
    const rep3 = createRep({ violations: [depthViolation], score: 70 });
    const res3 = manager.processRep(rep3, 9001);
    expect(res3).not.toBeNull();
    expect(res3?.message).toBe('Go lower');
  });

  it('allows different messages to be spoken after normal cooldown (3000 ms)', () => {
    const manager = new FeedbackManager(3000, 8000);

    // Rep 1 at t = 1000: depth violation -> emits "Go lower"
    const rep1 = createRep({ violations: [depthViolation], score: 70 });
    const res1 = manager.processRep(rep1, 1000);
    expect(res1?.message).toBe('Go lower');

    // Rep 2 at t = 4500: elapsed 3500ms >= 3000ms cooldown, different message "Keep your chest up"
    const rep2 = createRep({ violations: [backViolation], score: 75 });
    const res2 = manager.processRep(rep2, 4500);
    expect(res2).not.toBeNull();
    expect(res2?.message).toBe('Keep your chest up');
  });

  it('emits a positive message ("Good rep") ONLY when score is >= 90 and no violation fired', () => {
    const manager = new FeedbackManager(3000);

    // Perfect rep: score 100, 0 violations -> emits "Good rep"
    const perfectRep = createRep({ score: 100, violations: [] });
    const res1 = manager.processRep(perfectRep, 1000);
    expect(res1).not.toBeNull();
    expect(res1?.message).toBe('Good rep');
    expect(res1?.isPositive).toBe(true);

    // Rep with score 90 and 0 violations -> eligible for positive feedback,
    // but tests repetition prevention after the previous "Good rep"
    const repScore90 = createRep({ score: 90, violations: [] });
    const res2 = manager.processRep(repScore90, 5000);
    expect(res2).toBeNull(); // prevented immediate repetition of "Good rep"

    // Reset manager to test fresh threshold checks
    manager.reset();

    // Rep with score 89 and 0 violations -> no positive feedback (score < 90)
    const repScore89 = createRep({ score: 89, violations: [] });
    const res3 = manager.processRep(repScore89, 1000);
    expect(res3).toBeNull();

    // Rep with score 90 but with a minor violation -> must emit violation, NOT positive message
    const minorViolation: FormViolation = {
      ruleId: 'tempo',
      severity: 'low',
      penalty: 10,
      message: 'Slow down',
      actualValue: 700,
      threshold: 800,
    };
    const repWithViolation = createRep({ score: 90, violations: [minorViolation] });
    const res4 = manager.processRep(repWithViolation, 5000);
    expect(res4).not.toBeNull();
    expect(res4?.isPositive).toBe(false);
    expect(res4?.message).toBe('Slow down');
  });

  it('translates feedback into French and Arabic', () => {
    const managerFR = new FeedbackManager(0);
    const rep = createRep({ violations: [depthViolation], score: 70 });
    const resFR = managerFR.processRep(rep, 1000, 'fr-FR');
    expect(resFR?.message).toBe('Descends plus bas');

    const managerAR = new FeedbackManager(0);
    const resAR = managerAR.processRep(rep, 1000, 'ar');
    expect(resAR?.message).toBe('انزل أكثر');

    // Positive message translations
    const managerPositive = new FeedbackManager(0);
    const goodRep = createRep({ score: 100, violations: [] });
    expect(managerPositive.processRep(goodRep, 1000, 'fr-FR')?.message).toBe('Bonne répétition');

    managerPositive.reset();
    expect(managerPositive.processRep(goodRep, 1000, 'ar')?.message).toBe('تكرار ممتاز');
  });

  it('resets cooldown and message history properly', () => {
    const manager = new FeedbackManager(3000);
    const rep = createRep({ violations: [depthViolation], score: 70 });

    manager.processRep(rep, 1000);
    manager.reset();

    // Right after reset at same timestamp, can emit again
    const res = manager.processRep(rep, 1000);
    expect(res).not.toBeNull();
    expect(res?.message).toBe('Go lower');
  });
});
