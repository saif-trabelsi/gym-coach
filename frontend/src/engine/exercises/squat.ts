import type { ExerciseConfig } from '../types';
import { createSquatRules } from '../rules';

/**
 * Exercise configuration for Squat (side view).
 *
 * Rep Counting:
 * - Signal: Knee angle (hip -> knee -> ankle).
 * - Direction: high-to-low.
 * - Standing (up threshold): > 160°
 * - In-rep / bottom (down threshold): < 120°
 * - Minimum rep duration: 600 ms.
 *
 * Form Rule Thresholds:
 * - depthThreshold: min knee angle must be below 100° (penalty 30, high severity, "Go lower")
 * - backThreshold: max torso lean below 45° (penalty 25, high severity, "Keep your chest up")
 * - tempoThreshold: descent duration at least 800 ms (penalty 15, low severity, "Slow down")
 */
export const squatConfig: ExerciseConfig = {
  name: 'squat',
  view: 'side',
  signal: 'knee',
  direction: 'high-to-low',
  upThreshold: 160,
  downThreshold: 120,
  minDurationMs: 600,
  hysteresis: 5,
  depthThreshold: 100,
  backThreshold: 45,
  tempoThreshold: 800,
};

// Attach form rules initialized from the config
squatConfig.rules = createSquatRules(squatConfig);

export default squatConfig;
