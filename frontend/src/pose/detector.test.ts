import { describe, it, expect, vi } from 'vitest';
import { POSE_CONNECTIONS, POSE_LANDMARKS, type NormalizedLandmark } from './detector';
import { drawSkeletonOnCanvas } from '../ui/Overlay';

describe('Pose Detector Configuration & Constants', () => {
  it('should have 33 defined landmark indices', () => {
    const indices = Object.values(POSE_LANDMARKS);
    expect(indices.length).toBe(33);
    for (let i = 0; i < 33; i++) {
      expect(indices).toContain(i);
    }
  });

  it('should have valid POSE_CONNECTIONS with indices in [0, 32]', () => {
    expect(POSE_CONNECTIONS.length).toBeGreaterThan(0);
    for (const conn of POSE_CONNECTIONS) {
      expect(conn.start).toBeGreaterThanOrEqual(0);
      expect(conn.start).toBeLessThan(33);
      expect(conn.end).toBeGreaterThanOrEqual(0);
      expect(conn.end).toBeLessThan(33);
    }
  });
});

describe('Overlay Canvas Rendering', () => {
  function createMockContext(): CanvasRenderingContext2D {
    return {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      lineWidth: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      strokeStyle: '',
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;
  }

  it('clears canvas when landmarks are null or empty', () => {
    const ctx = createMockContext();
    drawSkeletonOnCanvas(ctx, null, 640, 480);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(ctx.beginPath).not.toHaveBeenCalled();

    drawSkeletonOnCanvas(ctx, [], 640, 480);
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('draws skeleton connections and landmarks for valid 33 landmarks', () => {
    const ctx = createMockContext();
    const syntheticLandmarks: NormalizedLandmark[] = Array.from(
      { length: 33 },
      (_, idx) => ({
        x: 0.5 + (idx % 5) * 0.05,
        y: 0.5 + Math.floor(idx / 5) * 0.05,
        z: 0,
        visibility: 0.9,
      })
    );

    drawSkeletonOnCanvas(ctx, syntheticLandmarks, 640, 480, 0.4);

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('skips drawing connections and points below visibility threshold', () => {
    const ctx = createMockContext();
    // All landmarks with visibility 0.1, lower than minVisibility 0.5
    const hiddenLandmarks: NormalizedLandmark[] = Array.from(
      { length: 33 },
      () => ({
        x: 0.5,
        y: 0.5,
        z: 0,
        visibility: 0.1,
      })
    );

    drawSkeletonOnCanvas(ctx, hiddenLandmarks, 640, 480, 0.5);

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});
