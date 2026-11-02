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
