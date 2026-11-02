import type {
  CommonRepMetrics,
  ExerciseConfig,
  FormViolation,
  FrameMetricsInput,
  Landmark3D,
  RepMetrics,
  RepMetricsCollector,
  RepState,
  Rule,
} from '../types';
import { torsoLength } from '../features';

export type ArmSide = 'left' | 'right';

export interface ArmLandmarks {
  shoulder: Landmark3D;
  elbow: Landmark3D;
  wrist: Landmark3D;
}

export const BICEP_CURL_LANDMARK_INDICES = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

export interface ArmSelectionResult {
  side: ArmSide;
  averageVisibility: number;
  landmarks: {
    shoulder: Landmark3D;
    elbow: Landmark3D;
    wrist: Landmark3D;
  };
  isValid: boolean;
}

/**
 * Helper to get landmark visibility score, falling back to optional normalized landmarks
 * or defaulting to 1.0 if not present.
 */
function getVisibilityScore(
  lm?: Landmark3D | null,
  fallbackLm?: Landmark3D | null
): number {
  if (!lm && !fallbackLm) return 0;
  if (lm?.visibility !== undefined) return lm.visibility;
  if (fallbackLm?.visibility !== undefined) return fallbackLm.visibility;
  return 1.0;
}

/**
 * Chooses the arm (left or right) with the higher average visibility of shoulder, elbow, and wrist.
 * Skips/marks invalid if the chosen arm's average visibility is below minVisibility (default 0.5).
 */
export function selectBicepCurlArm(
  worldLandmarks: Landmark3D[] | null | undefined,
  minVisibility = 0.5,
  normalizedLandmarks?: Landmark3D[] | null | undefined
): ArmSelectionResult | null {
  if (!worldLandmarks || worldLandmarks.length <= BICEP_CURL_LANDMARK_INDICES.RIGHT_WRIST) {
    return null;
  }

  const leftShoulder = worldLandmarks[BICEP_CURL_LANDMARK_INDICES.LEFT_SHOULDER];
  const leftElbow = worldLandmarks[BICEP_CURL_LANDMARK_INDICES.LEFT_ELBOW];
  const leftWrist = worldLandmarks[BICEP_CURL_LANDMARK_INDICES.LEFT_WRIST];

  const rightShoulder = worldLandmarks[BICEP_CURL_LANDMARK_INDICES.RIGHT_SHOULDER];
  const rightElbow = worldLandmarks[BICEP_CURL_LANDMARK_INDICES.RIGHT_ELBOW];
  const rightWrist = worldLandmarks[BICEP_CURL_LANDMARK_INDICES.RIGHT_WRIST];

  if (
    !leftShoulder ||
    !leftElbow ||
    !leftWrist ||
    !rightShoulder ||
    !rightElbow ||
    !rightWrist
  ) {
    return null;
  }

  const leftVis =
    (getVisibilityScore(
      leftShoulder,
      normalizedLandmarks?.[BICEP_CURL_LANDMARK_INDICES.LEFT_SHOULDER]
    ) +
      getVisibilityScore(
        leftElbow,
        normalizedLandmarks?.[BICEP_CURL_LANDMARK_INDICES.LEFT_ELBOW]
      ) +
      getVisibilityScore(
        leftWrist,
        normalizedLandmarks?.[BICEP_CURL_LANDMARK_INDICES.LEFT_WRIST]
      )) /
    3.0;

  const rightVis =
    (getVisibilityScore(
      rightShoulder,
      normalizedLandmarks?.[BICEP_CURL_LANDMARK_INDICES.RIGHT_SHOULDER]
    ) +
      getVisibilityScore(
        rightElbow,
        normalizedLandmarks?.[BICEP_CURL_LANDMARK_INDICES.RIGHT_ELBOW]
      ) +
      getVisibilityScore(
        rightWrist,
        normalizedLandmarks?.[BICEP_CURL_LANDMARK_INDICES.RIGHT_WRIST]
      )) /
    3.0;

  const isRightHigher = rightVis > leftVis;
  const side: ArmSide = isRightHigher ? 'right' : 'left';
  const averageVisibility = isRightHigher ? rightVis : leftVis;
  const armLandmarks = isRightHigher
    ? {
      shoulder: rightShoulder,
      elbow: rightElbow,
      wrist: rightWrist,
    }
    : {
      shoulder: leftShoulder,
      elbow: leftElbow,
      wrist: leftWrist,
    };

  const isValid = averageVisibility >= minVisibility;

  return {
    side,
    averageVisibility,
    landmarks: armLandmarks,
    isValid,
  };
}

/**
 * Rule: Range of Motion (curl height)
 * minElbowAngle must be <= rangeThreshold (default 50°).
 * Violation message: "Curl higher", penalty 25, high severity.
 */
export function createRangeRule(config: ExerciseConfig): Rule {
  return {
    id: 'range',
    severity: 'high',
    penalty: 25,
    message: 'Curl higher',
    check: (metrics: RepMetrics): FormViolation | null => {
      const threshold = config.rangeThreshold ?? 55;
      if (metrics.minElbowAngle !== undefined && metrics.minElbowAngle > threshold) {
        return {
          ruleId: 'range',
          severity: 'high',
          penalty: 25,
          message: 'Curl higher',
          actualValue: metrics.minElbowAngle,
          threshold,
        };
      }
      return null;
    },
  };
}

/**
 * Rule: Full Extension
 * maxElbowAngle must be >= extensionThreshold (default 150°).
 * Violation message: "Fully extend", penalty 20, medium severity.
 */
export function createExtensionRule(config: ExerciseConfig): Rule {
  return {
    id: 'extension',
    severity: 'medium',
    penalty: 20,
    message: 'Fully extend',
    check: (metrics: RepMetrics): FormViolation | null => {
      const threshold = config.extensionThreshold ?? 150;
      if (metrics.maxElbowAngle !== undefined && metrics.maxElbowAngle < threshold) {
        return {
          ruleId: 'extension',
          severity: 'medium',
          penalty: 20,
          message: 'Fully extend',
          actualValue: metrics.maxElbowAngle,
          threshold,
        };
      }
      return null;
    },
  };
}

/**
 * Rule: Elbow Drift
 * elbowDrift must be <= elbowDriftThreshold (default 0.22).
 * Maximum 3D distance between elbow at rep start and any frame, divided by torso length at rep start.
 * Violation message: "Pin your elbow", penalty 30, high severity.
 */
export function createElbowDriftRule(config: ExerciseConfig): Rule {
  return {
    id: 'elbowDrift',
    severity: 'high',
    penalty: 30,
    message: 'Pin your elbow',
    check: (metrics: RepMetrics): FormViolation | null => {
      const threshold = config.elbowDriftThreshold ?? 0.22;
      if (metrics.elbowDrift !== undefined && metrics.elbowDrift > threshold) {
        return {
          ruleId: 'elbowDrift',
          severity: 'high',
          penalty: 30,
          message: 'Pin your elbow',
          actualValue: metrics.elbowDrift,
          threshold,
        };
      }
      return null;
    },
  };
}

/**
 * Rule: Body Sway
 * bodySway must be <= swingThreshold (default 0.15).
 * Maximum horizontal displacement (x and z axes only, ignoring y) of shoulder from rep start,
 * divided by torso length at rep start.
 * Violation message: "Don't swing", penalty 25, high severity.
 */
export function createSwingRule(config: ExerciseConfig): Rule {
  return {
    id: 'swing',
    severity: 'high',
    penalty: 25,
    message: "Don't swing",
    check: (metrics: RepMetrics): FormViolation | null => {
      const threshold = config.swingThreshold ?? 0.15;
      if (metrics.bodySway !== undefined && metrics.bodySway > threshold) {
        return {
          ruleId: 'swing',
          severity: 'high',
          penalty: 25,
          message: "Don't swing",
          actualValue: metrics.bodySway,
          threshold,
        };
      }
      return null;
    },
  };
}

/**
 * Creates all rules for the bicep curl exercise from the provided configuration.
 */
export function createBicepCurlRules(config: ExerciseConfig): Rule[] {
  return [
    createRangeRule(config),
    createExtensionRule(config),
    createElbowDriftRule(config),
    createSwingRule(config),
  ];
}

interface FrameSnapshot {
  angle: number;
  timestampMs: number;
  elbow?: Landmark3D;
  shoulder?: Landmark3D;
  torsoLength?: number;
}

/**
 * Exercise metrics collector for Bicep Curl.
 * Tracks min/max elbow angle, elbow drift, and body sway relative to rep start.
 */
export class BicepCurlMetricsCollector implements RepMetricsCollector {
  private lastAboveUpSnapshot: FrameSnapshot | null = null;
  private repStartSnapshot: FrameSnapshot | null = null;
  private idleMaxAngle = -Infinity;

  private minElbowAngle = Infinity;
  private maxElbowAngle = -Infinity;
  private maxElbowDrift = 0;
  private maxBodySway = 0;

  constructor(_config?: ExerciseConfig) { }

  private extractSnapshot(
    angle: number,
    timestampMs: number,
    frameMetrics?: FrameMetricsInput
  ): FrameSnapshot {
    if (!frameMetrics) {
      return { angle, timestampMs };
    }

    let shoulder = frameMetrics.shoulder;
    let elbow = frameMetrics.elbow;
    let torsoLen = frameMetrics.torsoLength;

    if (frameMetrics.armLandmarks) {
      shoulder = shoulder ?? frameMetrics.armLandmarks.shoulder;
      elbow = elbow ?? frameMetrics.armLandmarks.elbow;
    }

    if (frameMetrics.worldLandmarks) {
      const arm = selectBicepCurlArm(
        frameMetrics.worldLandmarks,
        0.5,
        frameMetrics.landmarks
      );
      if (arm?.isValid) {
        shoulder = shoulder ?? arm.landmarks.shoulder;
        elbow = elbow ?? arm.landmarks.elbow;
      }

      if (torsoLen === undefined && frameMetrics.worldLandmarks.length > 24) {
        const ls = frameMetrics.worldLandmarks[BICEP_CURL_LANDMARK_INDICES.LEFT_SHOULDER];
        const rs = frameMetrics.worldLandmarks[BICEP_CURL_LANDMARK_INDICES.RIGHT_SHOULDER];
        const lh = frameMetrics.worldLandmarks[BICEP_CURL_LANDMARK_INDICES.LEFT_HIP];
        const rh = frameMetrics.worldLandmarks[BICEP_CURL_LANDMARK_INDICES.RIGHT_HIP];
        if (ls && rs && lh && rh) {
          torsoLen = torsoLength(ls, rs, lh, rh);
        }
      }
    }

    return {
      angle,
      timestampMs,
      shoulder,
      elbow,
      torsoLength: torsoLen,
    };
  }

  private processFrame(snapshot: FrameSnapshot): void {
    this.minElbowAngle = Math.min(this.minElbowAngle, snapshot.angle);
    this.maxElbowAngle = Math.max(this.maxElbowAngle, snapshot.angle);

    const start = this.repStartSnapshot;
    if (start && start.torsoLength && start.torsoLength > 0) {
      // 3D Euclidean distance for elbow drift
      if (snapshot.elbow && start.elbow) {
        const dx = snapshot.elbow.x - start.elbow.x;
        const dy = snapshot.elbow.y - start.elbow.y;
        const dz = snapshot.elbow.z - start.elbow.z;
        const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const drift = dist3D / start.torsoLength;
        this.maxElbowDrift = Math.max(this.maxElbowDrift, drift);
      }

      // Horizontal displacement (x and z axes only, ignoring y) for body sway
      if (snapshot.shoulder && start.shoulder) {
        const dx = snapshot.shoulder.x - start.shoulder.x;
        const dz = snapshot.shoulder.z - start.shoulder.z;
        const dist2D = Math.sqrt(dx * dx + dz * dz);
        const sway = dist2D / start.torsoLength;
        this.maxBodySway = Math.max(this.maxBodySway, sway);
      }
    }
  }

  public onAboveUpThreshold(
    angle: number,
    timestampMs: number,
    frameMetrics?: FrameMetricsInput
  ): void {
    this.idleMaxAngle = Math.max(this.idleMaxAngle, angle);
    this.lastAboveUpSnapshot = this.extractSnapshot(angle, timestampMs, frameMetrics);
  }

  public onRepStart(
    angle: number,
    timestampMs: number,
    frameMetrics?: FrameMetricsInput
  ): void {
    const start =
      this.lastAboveUpSnapshot ?? this.extractSnapshot(angle, timestampMs, frameMetrics);
    this.repStartSnapshot = start;
    this.minElbowAngle = Math.min(start.angle, angle);
    this.maxElbowAngle = Math.max(start.angle, angle, this.idleMaxAngle);
    this.maxElbowDrift = 0;
    this.maxBodySway = 0;

    const current = this.extractSnapshot(angle, timestampMs, frameMetrics);
    this.processFrame(current);
  }

  public onFrame(
    angle: number,
    timestampMs: number,
    state: RepState,
    frameMetrics?: FrameMetricsInput
  ): void {
    if (state !== 'idle') {
      const current = this.extractSnapshot(angle, timestampMs, frameMetrics);
      this.processFrame(current);
    }
  }

  public onRepCompleted(
    commonMetrics: CommonRepMetrics,
    frameMetrics?: FrameMetricsInput
  ): RepMetrics {
    if (frameMetrics) {
      const current = this.extractSnapshot(
        commonMetrics.maxAngle,
        commonMetrics.bottomMs + commonMetrics.descentDurationMs,
        frameMetrics
      );
      this.processFrame(current);
    }

    const minElbowAngle =
      this.minElbowAngle === Infinity ? commonMetrics.minAngle : this.minElbowAngle;
    const maxElbowAngle =
      this.maxElbowAngle === -Infinity ? commonMetrics.maxAngle : this.maxElbowAngle;

    return {
      ...commonMetrics,
      minElbowAngle,
      maxElbowAngle,
      elbowDrift: this.maxElbowDrift,
      bodySway: this.maxBodySway,
    };
  }

  public resetCurrentRep(): void {
    this.repStartSnapshot = null;
    this.minElbowAngle = Infinity;
    this.maxElbowAngle = -Infinity;
    this.maxElbowDrift = 0;
    this.maxBodySway = 0;
    this.idleMaxAngle = -Infinity;
  }

  public reset(): void {
    this.resetCurrentRep();
    this.lastAboveUpSnapshot = null;
  }
}

/**
 * Exercise configuration for Bicep Curl.
 *
 * Rep Counting:
 * - Signal: Elbow angle (shoulder -> elbow -> wrist).
 * - Direction: high-to-low (180° extended -> ~40° contracted -> 180° extended).
 * - Extended (up threshold): > 140°
 * - In-rep / curled (down threshold): < 70°
 * - Minimum rep duration: 500 ms.
 *
 * Form Rule Thresholds (Loosened for natural movement tolerance):
 * - rangeThreshold: min elbow angle must be <= 55° (penalty 25, high severity, "Curl higher")
 * - extensionThreshold: max elbow angle must be >= 150° (penalty 20, medium severity, "Fully extend")
 * - elbowDriftThreshold: max elbow drift normalized <= 0.22 (penalty 30, high severity, "Pin your elbow")
 * - swingThreshold: max body sway normalized <= 0.15 (penalty 25, high severity, "Don't swing")
 */
export const bicepCurlConfig: ExerciseConfig = {
  name: 'bicepCurl',
  view: 'any',
  signal: 'elbow',
  direction: 'high-to-low',
  upThreshold: 140,
  downThreshold: 70,
  minDurationMs: 500,
  hysteresis: 5,
  rangeThreshold: 60,
  extensionThreshold: 150,
  elbowDriftThreshold: 0.40,
  swingThreshold: 0.35,
};

bicepCurlConfig.rules = createBicepCurlRules(bicepCurlConfig);
bicepCurlConfig.createMetricsCollector = () => new BicepCurlMetricsCollector(bicepCurlConfig);

export default bicepCurlConfig;
