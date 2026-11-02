import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
  type NormalizedLandmark,
  type Landmark,
} from '@mediapipe/tasks-vision';

export interface PoseConnection {
  start: number;
  end: number;
}

export interface PoseFrameResult {
  landmarks: NormalizedLandmark[] | null;
  worldLandmarks: Landmark[] | null;
  raw: PoseLandmarkerResult | null;
  timestamp: number;
}

export interface PoseDetectorConfig {
  wasmPath?: string;
  modelPath?: string;
  minDetectionConfidence?: number;
  minPresenceConfidence?: number;
  minTrackingConfidence?: number;
  numPoses?: number;
}

export interface PoseDetector {
  /**
   * Run pose detection on a single frame of a video element.
   * Timestamps are automatically guaranteed to be strictly monotonically increasing.
   */
  detectFrame(video: HTMLVideoElement, timestampMs?: number): PoseFrameResult | null;

  /**
   * Returns current active delegate ('GPU' or 'CPU').
   */
  getDelegate(): 'GPU' | 'CPU';

  /**
   * Returns true if landmarker is ready for inference.
   */
  isReady(): boolean;

  /**
   * Release resources held by the detector.
   */
  close(): Promise<void>;
}

// Export the standard 33-landmark skeleton connections
export const POSE_CONNECTIONS: PoseConnection[] = PoseLandmarker.POSE_CONNECTIONS;

// Landmark indices for reference
export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

const DEFAULT_WASM_PATH = '/wasm';
const FALLBACK_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

const DEFAULT_MODEL_PATH = '/models/pose_landmarker_full.task';
const FALLBACK_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';

/**
 * Creates and initializes a MediaPipe Pose Landmarker with:
 * - Model "full"
 * - Running mode "VIDEO"
 * - GPU delegate with automatic CPU fallback
 */
export async function createPoseDetector(
  config: PoseDetectorConfig = {}
): Promise<PoseDetector> {
  const {
    wasmPath = DEFAULT_WASM_PATH,
    modelPath = DEFAULT_MODEL_PATH,
    minDetectionConfidence = 0.5,
    minPresenceConfidence = 0.5,
    minTrackingConfidence = 0.5,
    numPoses = 1,
  } = config;

  // 1. Resolve WASM fileset (with fallback)
  let visionWasm: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
  try {
    visionWasm = await FilesetResolver.forVisionTasks(wasmPath);
  } catch (err) {
    console.warn(`Failed loading WASM from ${wasmPath}, falling back to CDN...`, err);
    visionWasm = await FilesetResolver.forVisionTasks(FALLBACK_WASM_CDN);
  }

  // 2. Initialize PoseLandmarker: try GPU first, fallback to CPU
  let landmarker: PoseLandmarker | null = null;
  let activeDelegate: 'GPU' | 'CPU' = 'GPU';

  const baseInitOptions = {
    runningMode: 'VIDEO' as const,
    numPoses,
    minPoseDetectionConfidence: minDetectionConfidence,
    minPosePresenceConfidence: minPresenceConfidence,
    minTrackingConfidence,
  };

  async function tryInit(targetModelPath: string, delegate: 'GPU' | 'CPU'): Promise<PoseLandmarker> {
    return await PoseLandmarker.createFromOptions(visionWasm, {
      ...baseInitOptions,
      baseOptions: {
        modelAssetPath: targetModelPath,
        delegate,
      },
    });
  }

  // Attempt with GPU delegate
  try {
    landmarker = await tryInit(modelPath, 'GPU');
    activeDelegate = 'GPU';
  } catch (gpuErr) {
    console.warn('PoseLandmarker GPU initialization failed. Retrying with fallback model or CPU...', gpuErr);
    
    // If local model failed, try CDN model with GPU
    try {
      if (modelPath !== FALLBACK_MODEL_URL) {
        landmarker = await tryInit(FALLBACK_MODEL_URL, 'GPU');
        activeDelegate = 'GPU';
      } else {
        throw gpuErr;
      }
    } catch {
      // GPU failed completely; fallback to CPU
      try {
        landmarker = await tryInit(modelPath, 'CPU');
        activeDelegate = 'CPU';
      } catch (cpuErr) {
        console.warn(`Local model with CPU failed, trying fallback model URL with CPU...`, cpuErr);
        landmarker = await tryInit(FALLBACK_MODEL_URL, 'CPU');
        activeDelegate = 'CPU';
      }
    }
  }

  // Track monotonic timestamp required by MediaPipe VIDEO mode
  let lastTimestamp = -1;

  return {
    detectFrame(video: HTMLVideoElement, timestampMs?: number): PoseFrameResult | null {
      if (!landmarker) {
        return null;
      }

      // Check if video is playable and has non-zero dimensions
      if (
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        return null;
      }

      // MediaPipe requires strictly monotonically increasing timestamps for VIDEO mode
      let targetTime = timestampMs ?? performance.now();
      if (targetTime <= lastTimestamp) {
        targetTime = lastTimestamp + 1;
      }
      lastTimestamp = targetTime;

      const result: PoseLandmarkerResult = landmarker.detectForVideo(video, targetTime);

      const hasPose = result.landmarks && result.landmarks.length > 0;
      const landmarks = hasPose ? result.landmarks[0] : null;
      const worldLandmarks =
        result.worldLandmarks && result.worldLandmarks.length > 0
          ? result.worldLandmarks[0]
          : null;

      return {
        landmarks,
        worldLandmarks,
        raw: result,
        timestamp: targetTime,
      };
    },

    getDelegate(): 'GPU' | 'CPU' {
      return activeDelegate;
    },

    isReady(): boolean {
      return landmarker !== null;
    },

    async close(): Promise<void> {
      if (landmarker) {
        landmarker.close();
        landmarker = null;
      }
    },
  };
}

export type { NormalizedLandmark, Landmark, PoseLandmarkerResult };
