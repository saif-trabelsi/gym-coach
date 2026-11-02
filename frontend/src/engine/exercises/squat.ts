import type { ExerciseConfig } from '../types';

/**
 * Exercise configuration for Squat (side view).
 *
 * Signal: Knee angle (hip -> knee -> ankle).
 * Direction: high-to-low (standing at > 160°, bottom squat at < 100°).
 * Minimum rep duration: 600 ms.
 */
export const squatConfig: ExerciseConfig = {
  name: 'squat',
  view: 'side',
  signal: 'knee',
  direction: 'high-to-low',
  upThreshold: 160,
  downThreshold: 100,
  minDurationMs: 600,
  hysteresis: 5,
};

export default squatConfig;
