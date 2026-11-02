/**
 * Shared types for the exercise engine.
 * Pure TypeScript types - no React or DOM dependencies.
 */

export interface Landmark3D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type RepDirection = 'high-to-low' | 'low-to-high';

export type RepState = 'idle' | 'descending' | 'bottom' | 'ascending';

export type RuleSeverity = 'low' | 'medium' | 'high';

export interface FormViolation {
  ruleId: string;
  message: string;
  severity: RuleSeverity;
  penalty: number;
  actualValue: number;
  threshold: number;
}

export interface RepMetrics {
  minKneeAngle: number;
  maxTorsoLean: number;
  descentDurationMs: number;
  descentStartMs: number;
  bottomMs: number;
  minAngle: number;
  maxAngle: number;
  durationMs: number;
}

export interface Rule {
  id: string;
  severity: RuleSeverity;
  penalty: number;
  message: string;
  check: (metrics: RepMetrics) => FormViolation | null;
}

export interface ExerciseConfig {
  /**
   * Angle threshold when the user is at the starting/standing/extended position.
   */
  upThreshold: number;

  /**
   * Angle threshold when the user has reached the bottom/contracted position.
   */
  downThreshold: number;

  /**
   * Minimum duration in milliseconds for a rep to be valid (rejects fast noise).
   */
  minDurationMs: number;

  /**
   * Direction of the rep:
   * 'high-to-low': starts high, descends to low, returns high (e.g., squat, bicep curl angle)
   * 'low-to-high': starts low, ascends to high, returns low (e.g., leg extension)
   */
  direction: RepDirection;

  /**
   * Optional hysteresis margin (in degrees) to avoid rapid state bouncing near thresholds.
   * Defaults to 5 degrees if omitted.
   */
  hysteresis?: number;

  /**
   * Optional metadata
   */
  name?: string;
  view?: 'side' | 'front' | 'any';
  signal?: string;

  /**
   * Form rule thresholds
   */
  depthThreshold?: number; // min knee angle below this (degrees)
  backThreshold?: number; // max torso lean below this (degrees)
  tempoThreshold?: number; // descent duration at least this (ms)

  /**
   * Optional active rules to evaluate on rep completion
   */
  rules?: Rule[];
}

export interface RepResult {
  minAngle: number;
  maxAngle: number;
  durationMs: number;
  timestamp: number;
  metrics: RepMetrics;
  violations: FormViolation[];
  score: number;
}

export interface StateMachineUpdateResult {
  state: RepState;
  completedRep: RepResult | null;
}

export interface FrameMetricsInput {
  torsoLean?: number;
}
