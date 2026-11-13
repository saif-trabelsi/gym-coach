import {
  RepStateMachine,
  squatConfig,
  bicepCurlConfig,
  selectSquatLeg,
  selectBicepCurlArm,
  angle,
  computeTorsoLean,
  OneEuroFilter,
} from '../frontend/src/engine';
import type { ClipPrediction } from './metrics';

export interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface LandmarkFrame {
  timestamp: number;
  landmarks: LandmarkPoint[];
  worldLandmarks: LandmarkPoint[];
}

export interface LandmarkClip {
  clip: string;
  exercise: 'squat' | 'bicepCurl';
  frames: LandmarkFrame[];
}

/**
 * Headlessly evaluates a recorded landmark clip through the AI Gym Coach state machine engine.
 * Uses identical configuration, filtering, and scoring logic as the live browser coach.
 */
export function runClipThroughEngine(clip: LandmarkClip): ClipPrediction {
  const isSquat = clip.exercise === 'squat';
  const config = isSquat ? squatConfig : bicepCurlConfig;
  const sm = new RepStateMachine(config);
  const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 });

  for (const frame of clip.frames) {
    const t = frame.timestamp;

    if (isSquat) {
      const leg = selectSquatLeg(frame.worldLandmarks, 0.5, frame.landmarks);
      if (!leg || !leg.isValid) continue;

      const rawAngle = angle(
        leg.landmarks.hip,
        leg.landmarks.knee,
        leg.landmarks.ankle
      );
      const smoothedAngle = filter.filter(rawAngle, t);
      const torsoLean = computeTorsoLean(
        leg.landmarks.hip,
        leg.landmarks.shoulder || { x: leg.landmarks.hip.x, y: leg.landmarks.hip.y - 0.5, z: 0 }
      );

      sm.update(smoothedAngle, t, { torsoLean });
    } else {
      const arm = selectBicepCurlArm(frame.worldLandmarks, 0.5);
      if (!arm || !arm.isValid) continue;

      const rawAngle = angle(
        arm.landmarks.shoulder,
        arm.landmarks.elbow,
        arm.landmarks.wrist
      );
      const smoothedAngle = filter.filter(rawAngle, t);

      sm.update(smoothedAngle, t);
    }
  }

  const reps = sm.getReps().map((r) => ({
    repIndex: r.index,
    violations: r.violations.map((v) => (typeof v === 'string' ? v : v.ruleId)),
  }));

  return {
    clip: clip.clip,
    predictedRepCount: sm.getRepCount(),
    reps,
  };
}
