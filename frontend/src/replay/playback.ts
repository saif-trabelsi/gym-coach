/**
 * Pure playback logic for skeleton rep replay.
 * Zero React or DOM imports to remain 100% unit-testable.
 */

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface VisibleSegment {
  start: number;
  end: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  colorGroup: 'left' | 'right' | 'center';
  isRed: boolean;
}

export interface DrawOptions {
  width?: number;
  height?: number;
  timestamp?: number;
  dpr?: number;
  pulseRadius?: number;
}

export const POSE_CONNECTIONS: Array<{ start: number; end: number }> = [
  { start: 0, end: 1 },
  { start: 1, end: 2 },
  { start: 2, end: 3 },
  { start: 3, end: 7 },
  { start: 0, end: 4 },
  { start: 4, end: 5 },
  { start: 5, end: 6 },
  { start: 6, end: 8 },
  { start: 9, end: 10 },
  { start: 11, end: 12 },
  { start: 11, end: 13 },
  { start: 13, end: 15 },
  { start: 15, end: 17 },
  { start: 15, end: 19 },
  { start: 15, end: 21 },
  { start: 17, end: 19 },
  { start: 12, end: 14 },
  { start: 14, end: 16 },
  { start: 16, end: 18 },
  { start: 16, end: 20 },
  { start: 16, end: 22 },
  { start: 18, end: 20 },
  { start: 11, end: 23 },
  { start: 12, end: 24 },
  { start: 23, end: 24 },
  { start: 23, end: 25 },
  { start: 24, end: 26 },
  { start: 25, end: 27 },
  { start: 26, end: 28 },
  { start: 27, end: 29 },
  { start: 28, end: 30 },
  { start: 29, end: 31 },
  { start: 30, end: 32 },
  { start: 27, end: 31 },
  { start: 28, end: 32 },
];

/**
 * Advances playback position by dtMs.
 * Returns updated decimal frame position and ended flag.
 * - When ended is true, position stays at frameCount - 1 (no overshoot).
 * - When loop is true, position wraps modulo frameCount and ended is always false.
 * - Caps dt to 100ms when capDt is true or when dtMs > 1000.
 */
export function advance(
  position: number,
  dtMs: number,
  fps: number,
  speed: number,
  frameCount: number,
  loop: boolean,
  capDt: boolean = dtMs > 1000
): { position: number; ended: boolean } {
  if (frameCount <= 0) {
    return { position: 0, ended: true };
  }

  const effectiveDt = capDt ? Math.min(Math.max(0, dtMs), 100) : Math.max(0, dtMs);
  const deltaFrames = (effectiveDt / 1000) * fps * speed;
  const targetPos = position + deltaFrames;

  if (loop) {
    const wrapped = ((targetPos % frameCount) + frameCount) % frameCount;
    return { position: wrapped, ended: false };
  }

  if (targetPos >= frameCount - 1) {
    return { position: frameCount - 1, ended: true };
  }

  return { position: Math.max(0, targetPos), ended: false };
}

/**
 * Returns integer frame index floored and clamped to [0, frameCount - 1].
 */
export function frameIndex(position: number, frameCount?: number): number {
  const floored = Math.floor(position);
  if (frameCount === undefined) {
    return Math.max(0, floored);
  }
  if (frameCount <= 0) return 0;
  return Math.max(0, Math.min(floored, frameCount - 1));
}

/**
 * Moving average filter on each point [x, y] across neighboring frames (-1, 0, +1 for window 3).
 * If a point is null in the current frame, it stays null.
 * If a neighbor point is null, average only over available neighbors.
 * The first and last frames average over available neighbors. Pure, does not mutate input.
 */
export function smoothFrames(
  frames: Array<Array<[number, number] | null>>,
  window = 3
): Array<Array<[number, number] | null>> {
  if (!frames || frames.length === 0) return [];
  const half = Math.floor(window / 2);
  const nFrames = frames.length;

  return frames.map((frame, i) => {
    return frame.map((point, ptIdx) => {
      if (point === null) return null;

      let sumX = 0;
      let sumY = 0;
      let count = 0;

      const start = Math.max(0, i - half);
      const end = Math.min(nFrames - 1, i + half);

      for (let j = start; j <= end; j++) {
        const neighbor = frames[j][ptIdx];
        if (neighbor !== null) {
          sumX += neighbor[0];
          sumY += neighbor[1];
          count++;
        }
      }

      if (count === 0) return null;
      return [sumX / count, sumY / count] as [number, number];
    });
  });
}

/**
 * Transforms normalized [x, y] to canvas pixel coordinates.
 * If mirrored: true, x is flipped (1 - x).
 * Returns array of {x, y} or null.
 */
export function projectFrame(
  frame: Array<[number, number] | null>,
  width: number,
  height: number,
  mirrored: boolean
): Array<ProjectedPoint | null> {
  return frame.map((pt) => {
    if (pt === null) return null;
    const [normX, normY] = pt;
    const x = (mirrored ? 1 - normX : normX) * width;
    const y = normY * height;
    return { x, y };
  });
}

/**
 * Returns visible lines between pairs of landmarks.
 * If either landmark is null, omit the line.
 * Each segment carries a color group (left, right, center) and isRed: boolean
 * (true when BOTH endpoints are in highlight).
 */
export function visibleSegments(
  frame: Array<ProjectedPoint | [number, number] | null>,
  connections: Array<{ start: number; end: number }> = POSE_CONNECTIONS,
  highlight: number[] | Set<number> = []
): VisibleSegment[] {
  const highlightSet = highlight instanceof Set ? highlight : new Set(highlight);
  const segments: VisibleSegment[] = [];

  for (const conn of connections) {
    const p1 = frame[conn.start];
    const p2 = frame[conn.end];

    if (!p1 || !p2) continue;

    const x1 = 'x' in p1 ? p1.x : p1[0];
    const y1 = 'y' in p1 ? p1.y : p1[1];
    const x2 = 'x' in p2 ? p2.x : p2[0];
    const y2 = 'y' in p2 ? p2.y : p2[1];

    const isLeft = conn.start % 2 === 1 && conn.end % 2 === 1;
    const isRight = conn.start % 2 === 0 && conn.end % 2 === 0;
    const colorGroup: 'left' | 'right' | 'center' = isLeft
      ? 'left'
      : isRight
      ? 'right'
      : 'center';

    const isRed = highlightSet.has(conn.start) && highlightSet.has(conn.end);

    segments.push({
      start: conn.start,
      end: conn.end,
      startX: x1,
      startY: y1,
      endX: x2,
      endY: y2,
      colorGroup,
      isRed,
    });
  }

  return segments;
}

/**
 * Clears canvas and draws skeleton segments and joints with highlighted features.
 */
export function drawReplayFrame(
  ctx: CanvasRenderingContext2D,
  points: Array<ProjectedPoint | null>,
  segments: VisibleSegment[],
  highlight: number[] | Set<number>,
  options?: DrawOptions
): void {
  const dpr = options?.dpr ?? 1;
  const width = options?.width ?? (ctx.canvas.width / dpr);
  const height = options?.height ?? (ctx.canvas.height / dpr);
  const highlightSet = highlight instanceof Set ? highlight : new Set(highlight);
  const timestamp = options?.timestamp ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());

  ctx.save();
  if (dpr !== 1) {
    ctx.scale(dpr, dpr);
  }
  ctx.clearRect(0, 0, width, height);

  // Draw segments
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const seg of segments) {
    ctx.beginPath();
    ctx.moveTo(seg.startX, seg.startY);
    ctx.lineTo(seg.endX, seg.endY);
    if (seg.isRed) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
    } else if (seg.colorGroup === 'left') {
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
    } else if (seg.colorGroup === 'right') {
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.9)';
    } else {
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.9)';
    }
    ctx.stroke();
  }

  // Draw joints
  const pulseRadius = options?.pulseRadius ?? (8 + Math.sin(timestamp / 200));
  const clampedPulse = Math.max(7, Math.min(9, pulseRadius));

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!pt) continue;

    const isHighlighted = highlightSet.has(i);

    if (isHighlighted) {
      // Outer pulsing red ring
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, clampedPulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Inner circle (radius 4)
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
    } else {
      // Outer dark circle border
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fill();

      // Inner circle (radius 4)
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      if (i % 2 === 1) {
        ctx.fillStyle = '#06b6d4';
      } else if (i % 2 === 0 && i !== 0) {
        ctx.fillStyle = '#eab308';
      } else {
        ctx.fillStyle = '#a855f7';
      }
      ctx.fill();
    }
  }

  ctx.restore();
}
