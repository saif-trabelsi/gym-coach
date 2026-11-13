import { describe, it, expect } from 'vitest';
import {
  calculateRepCountMetrics,
  calculateClassificationMetrics,
  evaluateClips,
  type ClipGroundTruth,
  type ClipPrediction,
} from '../../../eval/metrics';

describe('Biomechanical Evaluation & Benchmarking Metrics (Task 6.1)', () => {
  it('calculates rep count MAE = 1 when 10 reps counted as 9', () => {
    const pairs = [{ trueCount: 10, predictedCount: 9 }];
    const metrics = calculateRepCountMetrics(pairs);

    expect(metrics.mae).toBe(1.0);
    expect(metrics.exactMatchRate).toBe(0.0);
  });

  it('calculates exact match rate and MAE across multiple clips', () => {
    const pairs = [
      { trueCount: 5, predictedCount: 5 }, // err = 0
      { trueCount: 10, predictedCount: 8 }, // err = 2
      { trueCount: 4, predictedCount: 4 }, // err = 0
      { trueCount: 6, predictedCount: 7 }, // err = 1
    ];
    // MAE = (0 + 2 + 0 + 1) / 4 = 3 / 4 = 0.75
    // exact match = 2 / 4 = 0.5
    const metrics = calculateRepCountMetrics(pairs);

    expect(metrics.mae).toBe(0.75);
    expect(metrics.exactMatchRate).toBe(0.5);
  });

  it('asserts hand-computed expected values: 2 TP, 1 FP, 2 FN gives precision 0.667 and recall 0.5', () => {
    // 3 reps fired: 2 true positives + 1 false positive
    // 4 true faults exist: 2 true positives + 2 false negatives
    const tp = 2;
    const fp = 1;
    const fn = 2;

    const { precision, recall, f1 } = calculateClassificationMetrics(tp, fp, fn);

    expect(precision).toBe(0.667);
    expect(recall).toBe(0.5);
    // F1 = 2 * (0.667 * 0.5) / (0.667 + 0.5) = 0.667 / 1.167 = 0.57155... -> 0.572
    expect(f1).toBe(0.572);
  });

  it('evaluates mock clips end-to-end aggregating confusion table per rule', () => {
    const mockTruth: ClipGroundTruth = {
      clip: 'test_clip',
      exercise: 'squat',
      trueRepCount: 3,
      reps: [
        { repIndex: 1, faults: [] },
        { repIndex: 2, faults: ['depth'] },
        { repIndex: 3, faults: ['back'] },
      ],
    };

    const mockPred: ClipPrediction = {
      clip: 'test_clip',
      predictedRepCount: 3,
      reps: [
        { repIndex: 1, violations: [] },
        { repIndex: 2, violations: ['depth'] }, // TP for depth
        { repIndex: 3, violations: ['depth'] }, // FP for depth, FN for back
      ],
    };

    const results = evaluateClips([{ truth: mockTruth, prediction: mockPred }]);

    expect(results.totalClips).toBe(1);
    expect(results.repCountMae).toBe(0.0);
    expect(results.repCountExactMatchRate).toBe(1.0);

    // Depth rule: 1 TP (rep 2), 1 FP (rep 3), 0 FN
    const depth = results.rules['depth'];
    expect(depth.tp).toBe(1);
    expect(depth.fp).toBe(1);
    expect(depth.fn).toBe(0);
    expect(depth.precision).toBe(0.5);
    expect(depth.recall).toBe(1.0);

    // Back rule: 0 TP, 0 FP, 1 FN (rep 3 ground truth had back, pred did not)
    const back = results.rules['back'];
    expect(back.tp).toBe(0);
    expect(back.fp).toBe(0);
    expect(back.fn).toBe(1);
    expect(back.recall).toBe(0.0);
  });
});
