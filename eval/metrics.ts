/**
 * Pure evaluation metrics calculations for rep counting and form fault classification.
 */

export interface ClipGroundTruth {
  clip: string;
  exercise: 'squat' | 'bicepCurl';
  trueRepCount: number;
  reps: Array<{
    repIndex: number;
    faults: string[];
  }>;
}

export interface ClipPrediction {
  clip: string;
  predictedRepCount: number;
  reps: Array<{
    repIndex: number;
    violations: string[];
  }>;
}

export interface RuleConfusion {
  rule: string;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface EvaluationResults {
  totalClips: number;
  totalTrueReps: number;
  totalPredictedReps: number;
  repCountMae: number;
  repCountExactMatchRate: number;
  rules: Record<string, RuleConfusion>;
  macroF1: number;
}

/**
 * Calculates rep counting Mean Absolute Error (MAE) and exact match rate.
 */
export function calculateRepCountMetrics(
  pairs: Array<{ trueCount: number; predictedCount: number }>
): { mae: number; exactMatchRate: number } {
  if (pairs.length === 0) {
    return { mae: 0, exactMatchRate: 1.0 };
  }

  let totalAbsError = 0;
  let exactMatches = 0;

  for (const pair of pairs) {
    const err = Math.abs(pair.predictedCount - pair.trueCount);
    totalAbsError += err;
    if (err === 0) {
      exactMatches += 1;
    }
  }

  const mae = Math.round((totalAbsError / pairs.length) * 1000) / 1000;
  const exactMatchRate = Math.round((exactMatches / pairs.length) * 1000) / 1000;

  return { mae, exactMatchRate };
}

/**
 * Computes precision, recall, and F1 given TP, FP, and FN counts.
 */
export function calculateClassificationMetrics(
  tp: number,
  fp: number,
  fn: number
): { precision: number; recall: number; f1: number } {
  const precision = tp + fp > 0 ? Math.round((tp / (tp + fp)) * 1000) / 1000 : 1.0;
  const recall = tp + fn > 0 ? Math.round((tp / (tp + fn)) * 1000) / 1000 : 1.0;
  const f1 =
    precision + recall > 0
      ? Math.round(((2 * precision * recall) / (precision + recall)) * 1000) / 1000
      : 0;

  return { precision, recall, f1 };
}

/**
 * Evaluates predicted rep-level faults against ground truth.
 * Evaluates up to min(trueCount, predictedCount) aligned reps.
 */
export function evaluateClips(
  evaluations: Array<{ truth: ClipGroundTruth; prediction: ClipPrediction }>
): EvaluationResults {
  const countPairs: Array<{ trueCount: number; predictedCount: number }> = [];
  let totalTrueReps = 0;
  let totalPredictedReps = 0;

  // Track TP, FP, FN per rule
  const ruleCounts: Record<string, { tp: number; fp: number; fn: number }> = {};

  const ensureRule = (rule: string) => {
    if (!ruleCounts[rule]) {
      ruleCounts[rule] = { tp: 0, fp: 0, fn: 0 };
    }
  };

  for (const { truth, prediction } of evaluations) {
    countPairs.push({
      trueCount: truth.trueRepCount,
      predictedCount: prediction.predictedRepCount,
    });

    totalTrueReps += truth.trueRepCount;
    totalPredictedReps += prediction.predictedRepCount;

    const repsToCompare = Math.min(truth.reps.length, prediction.reps.length);

    for (let i = 0; i < repsToCompare; i++) {
      const trueFaults = new Set(truth.reps[i].faults);
      const predictedFaults = new Set(prediction.reps[i].violations);

      // Union of all active rules encountered
      const allRules = new Set([...trueFaults, ...predictedFaults]);
      for (const rule of allRules) {
        ensureRule(rule);
        const hasTrue = trueFaults.has(rule);
        const hasPred = predictedFaults.has(rule);

        if (hasTrue && hasPred) {
          ruleCounts[rule].tp += 1;
        } else if (!hasTrue && hasPred) {
          ruleCounts[rule].fp += 1;
        } else if (hasTrue && !hasPred) {
          ruleCounts[rule].fn += 1;
        }
      }
    }

    // Account for missed reps (FN for any faults on uncounted reps)
    if (truth.reps.length > prediction.reps.length) {
      for (let i = prediction.reps.length; i < truth.reps.length; i++) {
        for (const fault of truth.reps[i].faults) {
          ensureRule(fault);
          ruleCounts[fault].fn += 1;
        }
      }
    }
  }

  const { mae, exactMatchRate } = calculateRepCountMetrics(countPairs);

  const rulesResult: Record<string, RuleConfusion> = {};
  let totalF1 = 0;
  const ruleKeys = Object.keys(ruleCounts);

  for (const rule of ruleKeys) {
    const { tp, fp, fn } = ruleCounts[rule];
    const { precision, recall, f1 } = calculateClassificationMetrics(tp, fp, fn);
    rulesResult[rule] = {
      rule,
      tp,
      fp,
      fn,
      precision,
      recall,
      f1,
    };
    totalF1 += f1;
  }

  const macroF1 =
    ruleKeys.length > 0 ? Math.round((totalF1 / ruleKeys.length) * 1000) / 1000 : 1.0;

  return {
    totalClips: evaluations.length,
    totalTrueReps,
    totalPredictedReps,
    repCountMae: mae,
    repCountExactMatchRate: exactMatchRate,
    rules: rulesResult,
    macroF1,
  };
}

/**
 * Formats evaluation results as markdown summary.
 */
export function formatResultsMarkdown(res: EvaluationResults): string {
  const lines: string[] = [
    '# Biomechanical Benchmark & Evaluation Results',
    '',
    `**Evaluated Clips**: ${res.totalClips} | **Ground Truth Reps**: ${res.totalTrueReps} | **Predicted Reps**: ${res.totalPredictedReps}`,
    '',
    '## 1. Rep Counting Performance',
    '',
    `| Metric | Value | Target |`,
    `|---|---|---|`,
    `| **Mean Absolute Error (MAE)** | **${res.repCountMae} reps** | $\\le 0.5$ reps |`,
    `| **Exact Match Rate** | **${(res.repCountExactMatchRate * 100).toFixed(1)}%** | $\\ge 90.0\\%$ |`,
    '',
    '## 2. Per-Rule Form Fault Detection Performance',
    '',
    '| Rule ID | True Pos (TP) | False Pos (FP) | False Neg (FN) | Precision | Recall | F1 Score |',
    '|---|---|---|---|---|---|---|',
  ];

  for (const [rule, data] of Object.entries(res.rules)) {
    lines.push(
      `| \`${rule}\` | ${data.tp} | ${data.fp} | ${data.fn} | ${(data.precision * 100).toFixed(1)}% | ${(data.recall * 100).toFixed(1)}% | **${data.f1.toFixed(3)}** |`
    );
  }

  lines.push('');
  lines.push(`**Macro Average F1**: **${res.macroF1.toFixed(3)}**`);
  lines.push('');
  lines.push('## 3. Benchmark Limitations');
  lines.push('');
  lines.push('- **Participant Diversity**: Tested on a limited set of synthetic & consented validation clips; further testing across wider body mass indices and loose clothing recommended.');
  lines.push('- **Camera Angle Sensitivity**: Engine assumes profile view (perpendicular to movement); extreme diagonal angles ($> 30^\\circ$) degrade joint visibility.');
  lines.push('- **Lighting & Occlusion**: MediaPipe Pose estimation requires unobstructed view of hip, knee, and ankle joints for squats and shoulder/elbow/wrist for bicep curls.');
  lines.push('');

  return lines.join('\n');
}
