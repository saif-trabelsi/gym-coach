export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export type ReplayPoint = [number, number] | null;

export interface BufferedFrame {
  timestampMs: number;
  points: ReplayPoint[];
}

/**
 * Ring buffer of skeleton frames keeping up to the last 8000 ms.
 * Lightweight: zero deep copies, allocations bounded to 1 small array per frame.
 */
export class FrameBuffer {
  private frames: BufferedFrame[] = [];
  private maxRetentionMs: number;

  constructor(maxRetentionMs = 8000) {
    this.maxRetentionMs = maxRetentionMs;
  }

  /**
   * Pushes a frame with normalized landmarks.
   * Drops landmarks with visibility below 0.5 (set to null).
   * Evicts frames older than 8000 ms relative to newest.
   */
  push(timestampMs: number, landmarks: LandmarkPoint[]): void {
    const points: ReplayPoint[] = new Array(33);
    for (let i = 0; i < 33; i++) {
      const lm = landmarks[i];
      if (!lm || (lm.visibility !== undefined && lm.visibility < 0.5)) {
        points[i] = null;
      } else {
        const x = Math.round(lm.x * 1000) / 1000;
        const y = Math.round(lm.y * 1000) / 1000;
        points[i] = [x, y];
      }
    }

    this.frames.push({ timestampMs, points });

    const cutoff = timestampMs - this.maxRetentionMs;
    while (this.frames.length > 0 && this.frames[0].timestampMs < cutoff) {
      this.frames.shift();
    }
  }

  /**
   * Returns frames inside [end - duration - margin, end], downsampled to at most 15 fps
   * (at least 66 ms interval), and if more than 90 frames remain, uniformly subsampled
   * down to 90 keeping the first and last.
   * Returns null if fewer than 2 frames are available.
   */
  snapshot(
    endTimestampMs: number,
    durationMs: number,
    marginMs = 300
  ): ReplayPoint[][] | null {
    const start = endTimestampMs - durationMs - marginMs;
    const end = endTimestampMs;

    const inWindow = this.frames.filter(
      (f) => f.timestampMs >= start && f.timestampMs <= end
    );

    if (inWindow.length < 2) {
      return null;
    }

    // Downsample to at most 15 fps (keep a frame only if at least 66 ms passed since the last kept one)
    const kept: BufferedFrame[] = [inWindow[0]];
    for (let i = 1; i < inWindow.length; i++) {
      const frame = inWindow[i];
      if (frame.timestampMs - kept[kept.length - 1].timestampMs >= 66) {
        kept.push(frame);
      }
    }

    // Ensure the last frame inside the window is kept if possible
    const lastWindowFrame = inWindow[inWindow.length - 1];
    if (kept[kept.length - 1] !== lastWindowFrame) {
      if (lastWindowFrame.timestampMs - kept[kept.length - 1].timestampMs >= 66) {
        kept.push(lastWindowFrame);
      } else if (kept.length > 1 && lastWindowFrame.timestampMs - kept[kept.length - 2].timestampMs >= 66) {
        kept[kept.length - 1] = lastWindowFrame;
      } else if (kept.length === 1) {
        kept.push(lastWindowFrame);
      }
    }

    if (kept.length < 2) {
      return null;
    }

    // If more than 90 frames remain, subsample uniformly down to 90 keeping first and last
    let finalFrames = kept;
    if (finalFrames.length > 90) {
      const subsampled: BufferedFrame[] = [];
      const n = finalFrames.length;
      for (let j = 0; j < 90; j++) {
        const idx = Math.round((j * (n - 1)) / 89);
        subsampled.push(finalFrames[idx]);
      }
      finalFrames = subsampled;
    }

    return finalFrames.map((f) => f.points);
  }

  getFrameCount(): number {
    return this.frames.length;
  }

  getFrames(): BufferedFrame[] {
    return [...this.frames];
  }

  clear(): void {
    this.frames = [];
  }
}

/**
 * Computes faulty joint landmark indices to highlight based on violations and tracked side.
 * Reused by live overlay and replay recording.
 */
export function getHighlightJoints(
  violations: Array<string | { ruleId: string }>,
  side?: 'left' | 'right' | null
): number[] {
  const joints = new Set<number>();

  for (const v of violations) {
    const ruleId = typeof v === 'string' ? v : v.ruleId;

    if (ruleId === 'depth') {
      if (side === 'left') {
        joints.add(25); // Left knee
      } else if (side === 'right') {
        joints.add(26); // Right knee
      } else {
        joints.add(25);
        joints.add(26);
      }
    } else if (ruleId === 'back') {
      if (side === 'left') {
        joints.add(11); // Left shoulder
        joints.add(23); // Left hip
      } else if (side === 'right') {
        joints.add(12); // Right shoulder
        joints.add(24); // Right hip
      } else {
        joints.add(11);
        joints.add(12);
        joints.add(23);
        joints.add(24);
      }
    } else if (ruleId === 'range' || ruleId === 'extension' || ruleId === 'elbowDrift') {
      if (side === 'left') {
        joints.add(13); // Left elbow
        joints.add(15); // Left wrist
      } else if (side === 'right') {
        joints.add(14); // Right elbow
        joints.add(16); // Right wrist
      } else {
        joints.add(13);
        joints.add(14);
        joints.add(15);
        joints.add(16);
      }
    } else if (ruleId === 'swing') {
      if (side === 'left') {
        joints.add(11); // Left shoulder
        joints.add(23); // Left hip
      } else if (side === 'right') {
        joints.add(12); // Right shoulder
        joints.add(24); // Right hip
      } else {
        joints.add(11);
        joints.add(12);
        joints.add(23);
        joints.add(24);
      }
    }
  }

  return Array.from(joints).sort((a, b) => a - b);
}
