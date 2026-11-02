import type { FormViolation, RepMetrics, Rule } from './types';

/**
 * Calculates a rep form score from 0 to 100:
 * score = 100 minus the sum of penalties of violated rules, clamped to [0, 100].
 *
 * @param violations Array of form violations incurred during the rep
 * @returns Score integer clamped between 0 and 100
 */
export function calculateScore(violations: FormViolation[]): number {
  const totalPenalty = violations.reduce((acc, v) => acc + v.penalty, 0);
  return Math.max(0, Math.min(100, 100 - totalPenalty));
}

/**
 * Evaluates a completed rep's metrics against a list of exercise rules.
 *
 * @param metrics Recorded per-rep metrics
 * @param rules List of rules configured for this exercise
 * @returns Collected violations and computed score (0-100)
 */
export function evaluateRep(
  metrics: RepMetrics,
  rules: Rule[]
): { violations: FormViolation[]; score: number } {
  const violations: FormViolation[] = [];

  for (const rule of rules) {
    const violation = rule.check(metrics);
    if (violation !== null) {
      violations.push(violation);
    }
  }

  const score = calculateScore(violations);

  return {
    violations,
    score,
  };
}
