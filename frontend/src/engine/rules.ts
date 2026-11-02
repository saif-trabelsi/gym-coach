import type {
  ExerciseConfig,
  FormViolation,
  RepMetrics,
  Rule,
} from './types';

export type { Rule };

/**
 * Creates the squat depth rule:
 * Minimum knee angle must reach below the depth threshold (e.g., < 100°).
 * Threshold is read dynamically from config.depthThreshold.
 */
export function createDepthRule(config: ExerciseConfig): Rule {
  return {
    id: 'depth',
    severity: 'high',
    penalty: 30,
    message: 'Go lower',
    check: (metrics: RepMetrics): FormViolation | null => {
      const threshold = config.depthThreshold ?? 100;
      // Violation if the user failed to go below the threshold
      if (metrics.minKneeAngle !== undefined && metrics.minKneeAngle >= threshold) {
        return {
          ruleId: 'depth',
          severity: 'high',
          penalty: 30,
          message: 'Go lower',
          actualValue: metrics.minKneeAngle,
          threshold,
        };
      }
      return null;
    },
  };
}

/**
 * Creates the squat back angle rule:
 * Maximum torso lean angle from vertical must remain below the back threshold (e.g., < 45°).
 * Threshold is read dynamically from config.backThreshold.
 */
export function createBackRule(config: ExerciseConfig): Rule {
  return {
    id: 'back',
    severity: 'high',
    penalty: 25,
    message: 'Keep your chest up',
    check: (metrics: RepMetrics): FormViolation | null => {
      const threshold = config.backThreshold ?? 45;
      // Violation if torso lean is too high
      if (metrics.maxTorsoLean !== undefined && metrics.maxTorsoLean >= threshold) {
        return {
          ruleId: 'back',
          severity: 'high',
          penalty: 25,
          message: 'Keep your chest up',
          actualValue: metrics.maxTorsoLean,
          threshold,
        };
      }
      return null;
    },
  };
}

/**
 * Creates the squat tempo rule:
 * Descent duration must be at least the tempo threshold (e.g., >= 800 ms).
 * Threshold is read dynamically from config.tempoThreshold.
 */
export function createTempoRule(config: ExerciseConfig): Rule {
  return {
    id: 'tempo',
    severity: 'low',
    penalty: 15,
    message: 'Slow down',
    check: (metrics: RepMetrics): FormViolation | null => {
      const threshold = config.tempoThreshold ?? 800;
      // Violation if descent was too rapid
      if (metrics.descentDurationMs < threshold) {
        return {
          ruleId: 'tempo',
          severity: 'low',
          penalty: 15,
          message: 'Slow down',
          actualValue: metrics.descentDurationMs,
          threshold,
        };
      }
      return null;
    },
  };
}

/**
 * Creates all rules for the squat exercise from the provided configuration.
 */
export function createSquatRules(config: ExerciseConfig): Rule[] {
  return [
    createDepthRule(config),
    createBackRule(config),
    createTempoRule(config),
  ];
}
