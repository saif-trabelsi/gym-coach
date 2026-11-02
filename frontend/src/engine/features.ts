import type { Landmark3D } from './types';

/**
 * Calculates the 3D angle (in degrees) at point B between vectors BA and BC.
 *
 * @param a First 3D point
 * @param b Middle 3D point (vertex of the angle)
 * @param c Third 3D point
 * @returns Angle in degrees in range [0, 180]
 */
export function angle(a: Landmark3D, b: Landmark3D, c: Landmark3D): number {
  const v1 = {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };

  const v2 = {
    x: c.x - b.x,
    y: c.y - b.y,
    z: c.z - b.z,
  };

  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

  // Avoid division by zero for coincident points
  if (mag1 === 0 || mag2 === 0) {
    return 0;
  }

  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));

  return Math.acos(cosTheta) * (180 / Math.PI);
}

/**
 * Checks if a landmark has sufficient visibility confidence.
 * Landmarks with visibility below minVisibility (default 0.5) are considered invalid.
 */
export function isLandmarkVisible(
  landmark: Landmark3D | null | undefined,
  minVisibility = 0.5
): boolean {
  if (!landmark) return false;
  if (landmark.visibility !== undefined && landmark.visibility < minVisibility) {
    return false;
  }
  return true;
}

/**
 * Checks if all supplied landmarks are visible above the threshold.
 */
export function areLandmarksVisible(
  landmarks: (Landmark3D | null | undefined)[],
  minVisibility = 0.5
): boolean {
  for (const lm of landmarks) {
    if (!isLandmarkVisible(lm, minVisibility)) {
      return false;
    }
  }
  return true;
}

/**
 * Computes torso length: distance between shoulder midpoint and hip midpoint in 3D.
 * Used to normalize distances across different camera distances and body proportions.
 */
export function torsoLength(
  leftShoulder: Landmark3D,
  rightShoulder: Landmark3D,
  leftHip: Landmark3D,
  rightHip: Landmark3D
): number {
  const shoulderMid = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
    z: (leftShoulder.z + rightShoulder.z) / 2,
  };

  const hipMid = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: (leftHip.z + rightHip.z) / 2,
  };

  const dx = shoulderMid.x - hipMid.x;
  const dy = shoulderMid.y - hipMid.y;
  const dz = shoulderMid.z - hipMid.z;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Normalizes a spatial distance by torso length.
 */
export function normalizeDistance(distance: number, torso: number): number {
  if (torso <= 0) return 0;
  return distance / torso;
}

export const SQUAT_LANDMARK_INDICES = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

export type LegSide = 'left' | 'right';

export interface LegLandmarks {
  hip: Landmark3D;
  knee: Landmark3D;
  ankle: Landmark3D;
  shoulder?: Landmark3D;
}

export interface LegSelectionResult {
  side: LegSide;
  averageVisibility: number;
  landmarks: LegLandmarks;
  isValid: boolean;
}

/**
 * Computes torso lean angle in degrees between the hip-to-shoulder vector and the vertical axis.
 * Uses 3D world landmarks for the selected side.
 * 0 degrees = perfectly upright/vertical torso.
 * Higher values = leaning forward/back.
 */
export function computeTorsoLean(hip: Landmark3D, shoulder: Landmark3D): number {
  const dx = shoulder.x - hip.x;
  const dy = shoulder.y - hip.y;
  const dz = shoulder.z - hip.z;

  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length === 0) return 0;

  // The vertical alignment is the ratio of vertical displacement |dy| to 3D length
  const cosTheta = Math.max(-1, Math.min(1, Math.abs(dy) / length));
  return Math.acos(cosTheta) * (180 / Math.PI);
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
 * Chooses the leg (left or right) with the higher average visibility of hip, knee, and ankle.
 * Skips/marks invalid if the chosen leg's average visibility is below minVisibility (default 0.5).
 *
 * @param worldLandmarks 3D world landmarks from pose estimation
 * @param minVisibility Visibility threshold (default 0.5)
 * @param normalizedLandmarks Optional normalized 2D landmarks for visibility fallback
 */
export function selectSquatLeg(
  worldLandmarks: Landmark3D[] | null | undefined,
  minVisibility = 0.5,
  normalizedLandmarks?: Landmark3D[] | null | undefined
): LegSelectionResult | null {
  if (!worldLandmarks || worldLandmarks.length <= SQUAT_LANDMARK_INDICES.RIGHT_ANKLE) {
    return null;
  }

  const leftHip = worldLandmarks[SQUAT_LANDMARK_INDICES.LEFT_HIP];
  const leftKnee = worldLandmarks[SQUAT_LANDMARK_INDICES.LEFT_KNEE];
  const leftAnkle = worldLandmarks[SQUAT_LANDMARK_INDICES.LEFT_ANKLE];

  const rightHip = worldLandmarks[SQUAT_LANDMARK_INDICES.RIGHT_HIP];
  const rightKnee = worldLandmarks[SQUAT_LANDMARK_INDICES.RIGHT_KNEE];
  const rightAnkle = worldLandmarks[SQUAT_LANDMARK_INDICES.RIGHT_ANKLE];

  if (!leftHip || !leftKnee || !leftAnkle || !rightHip || !rightKnee || !rightAnkle) {
    return null;
  }

  const leftVis =
    (getVisibilityScore(leftHip, normalizedLandmarks?.[SQUAT_LANDMARK_INDICES.LEFT_HIP]) +
      getVisibilityScore(leftKnee, normalizedLandmarks?.[SQUAT_LANDMARK_INDICES.LEFT_KNEE]) +
      getVisibilityScore(leftAnkle, normalizedLandmarks?.[SQUAT_LANDMARK_INDICES.LEFT_ANKLE])) /
    3.0;

  const rightVis =
    (getVisibilityScore(rightHip, normalizedLandmarks?.[SQUAT_LANDMARK_INDICES.RIGHT_HIP]) +
      getVisibilityScore(rightKnee, normalizedLandmarks?.[SQUAT_LANDMARK_INDICES.RIGHT_KNEE]) +
      getVisibilityScore(rightAnkle, normalizedLandmarks?.[SQUAT_LANDMARK_INDICES.RIGHT_ANKLE])) /
    3.0;

  const leftShoulder = worldLandmarks[SQUAT_LANDMARK_INDICES.LEFT_SHOULDER];
  const rightShoulder = worldLandmarks[SQUAT_LANDMARK_INDICES.RIGHT_SHOULDER];

  // Choose the leg with the higher average visibility
  const isRightHigher = rightVis > leftVis;
  const side: LegSide = isRightHigher ? 'right' : 'left';
  const averageVisibility = isRightHigher ? rightVis : leftVis;
  const legLandmarks: LegLandmarks = isRightHigher
    ? {
        hip: rightHip,
        knee: rightKnee,
        ankle: rightAnkle,
        shoulder: rightShoulder,
      }
    : {
        hip: leftHip,
        knee: leftKnee,
        ankle: leftAnkle,
        shoulder: leftShoulder,
      };

  const isValid = averageVisibility >= minVisibility;

  return {
    side,
    averageVisibility,
    landmarks: legLandmarks,
    isValid,
  };
}

