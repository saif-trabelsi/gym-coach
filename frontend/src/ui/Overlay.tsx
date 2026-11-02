import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import type { NormalizedLandmark } from '../pose/detector';
import { POSE_CONNECTIONS, POSE_LANDMARKS } from '../pose/detector';

export interface OverlayHandle {
  draw: (
    landmarks: NormalizedLandmark[] | null,
    highlightJoints?: Set<number> | null
  ) => void;
  clear: () => void;
  getCanvas: () => HTMLCanvasElement | null;
}

interface OverlayProps {
  landmarks?: NormalizedLandmark[] | null;
  highlightJoints?: Set<number> | null;
  width?: number;
  height?: number;
  className?: string;
  minVisibility?: number;
}

// Major exercise joints to emphasize
const KEY_JOINTS = new Set<number>([
  POSE_LANDMARKS.LEFT_SHOULDER,
  POSE_LANDMARKS.RIGHT_SHOULDER,
  POSE_LANDMARKS.LEFT_ELBOW,
  POSE_LANDMARKS.RIGHT_ELBOW,
  POSE_LANDMARKS.LEFT_WRIST,
  POSE_LANDMARKS.RIGHT_WRIST,
  POSE_LANDMARKS.LEFT_HIP,
  POSE_LANDMARKS.RIGHT_HIP,
  POSE_LANDMARKS.LEFT_KNEE,
  POSE_LANDMARKS.RIGHT_KNEE,
  POSE_LANDMARKS.LEFT_ANKLE,
  POSE_LANDMARKS.RIGHT_ANKLE,
]);

/**
 * Pure helper function to draw skeleton landmarks and connections on a 2D canvas.
 */
export function drawSkeletonOnCanvas(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[] | null,
  width: number,
  height: number,
  minVisibility = 0.4,
  highlightJoints?: Set<number> | null
): void {
  ctx.clearRect(0, 0, width, height);

  if (!landmarks || landmarks.length === 0) {
    return;
  }

  // Draw connections
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const connection of POSE_CONNECTIONS) {
    const startLandmark = landmarks[connection.start];
    const endLandmark = landmarks[connection.end];

    if (!startLandmark || !endLandmark) continue;

    // Check visibility if available
    const startVis = startLandmark.visibility ?? 1.0;
    const endVis = endLandmark.visibility ?? 1.0;

    if (startVis < minVisibility || endVis < minVisibility) {
      continue;
    }

    const x1 = startLandmark.x * width;
    const y1 = startLandmark.y * height;
    const x2 = endLandmark.x * width;
    const y2 = endLandmark.y * height;

    // If both ends are highlighted, draw red connection line
    const isConnHighlighted =
      highlightJoints &&
      highlightJoints.has(connection.start) &&
      highlightJoints.has(connection.end);

    if (isConnHighlighted) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)'; // Red
    } else {
      // Color code left vs right vs torso/head for instant readability
      const isLeft = connection.start % 2 === 1 && connection.end % 2 === 1;
      const isRight = connection.start % 2 === 0 && connection.end % 2 === 0;

      if (isLeft) {
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)'; // Cyan for left
      } else if (isRight) {
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.9)'; // Amber for right
      } else {
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.9)'; // Purple for cross/torso
      }
    }

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Draw landmark points
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    const vis = lm.visibility ?? 1.0;

    if (vis < minVisibility) {
      continue;
    }

    const x = lm.x * width;
    const y = lm.y * height;
    const isHighlighted = highlightJoints?.has(i);
    const isKeyJoint = KEY_JOINTS.has(i);
    const radius = isHighlighted ? 7 : isKeyJoint ? 5 : 3.5;

    if (isHighlighted) {
      // Draw red pulse/glow halo
      ctx.beginPath();
      ctx.arc(x, y, radius + 4, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.fill();

      // Outer circle
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
      ctx.fillStyle = '#7f1d1d';
      ctx.fill();

      // Inner circle - bright red
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
    } else {
      // Outer circle
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fill();

      // Inner circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      if (i % 2 === 1) {
        ctx.fillStyle = '#22d3ee'; // cyan-400
      } else if (i % 2 === 0 && i !== 0) {
        ctx.fillStyle = '#facc15'; // yellow-400
      } else {
        ctx.fillStyle = '#c084fc'; // purple-400
      }
      ctx.fill();
    }
  }
}

export const Overlay = forwardRef<OverlayHandle, OverlayProps>(
  (
    {
      landmarks = null,
      highlightJoints = null,
      width,
      height,
      className = '',
      minVisibility = 0.4,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const render = (
      lms: NormalizedLandmark[] | null,
      hj?: Set<number> | null
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = width ?? canvas.width;
      const h = height ?? canvas.height;

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      drawSkeletonOnCanvas(ctx, lms, w, h, minVisibility, hj ?? highlightJoints);
    };

    useImperativeHandle(ref, () => ({
      draw: (
        lms: NormalizedLandmark[] | null,
        hj?: Set<number> | null
      ) => {
        render(lms, hj);
      },
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      },
      getCanvas: () => canvasRef.current,
    }));

    // React prop updates
    useEffect(() => {
      render(landmarks, highlightJoints);
    }, [landmarks, highlightJoints, width, height, minVisibility]);

    return (
      <canvas
        ref={canvasRef}
        width={width ?? 640}
        height={height ?? 480}
        className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${className}`}
      />
    );
  }
);

Overlay.displayName = 'Overlay';
