import { describe, it, expect } from 'vitest';
import {
  advance,
  frameIndex,
  smoothFrames,
  projectFrame,
  visibleSegments,
} from './playback';

describe('Playback Engine (playback.ts)', () => {
  // Test Group a: advance calculations and dt capping
  describe('Group a: advance calculations', () => {
    it('advance(0, 1000, 15, 1, 40, false) -> position 15', () => {
      const res = advance(0, 1000, 15, 1, 40, false);
      expect(res.position).toBe(15);
      expect(res.ended).toBe(false);
    });

    it('advance(0, 1000, 15, 0.25, 40, false) -> position 3.75', () => {
      const res = advance(0, 1000, 15, 0.25, 40, false);
      expect(res.position).toBe(3.75);
      expect(res.ended).toBe(false);
    });

    it('advance(38, 1000, 15, 1, 40, false) -> position 39 and ended: true', () => {
      const res = advance(38, 1000, 15, 1, 40, false);
      expect(res.position).toBe(39);
      expect(res.ended).toBe(true);
    });

    it('advance(38, 200, 15, 1, 40, true) -> position 1 (modulo wrap)', () => {
      // 38 + (200 / 1000) * 15 = 38 + 3 = 41. 41 % 40 = 1.
      const res = advance(38, 200, 15, 1, 40, true);
      expect(res.position).toBe(1);
      expect(res.ended).toBe(false);
    });

    it('advance with dt 5000 gives the same result as dt 100 (capping)', () => {
      const res5000 = advance(10, 5000, 15, 1, 40, false);
      const res100 = advance(10, 100, 15, 1, 40, false);
      expect(res5000.position).toBe(res100.position);
      expect(res5000.ended).toBe(res100.ended);
    });

    it('frameIndex floors and clamps properly', () => {
      expect(frameIndex(12.4)).toBe(12);
      expect(frameIndex(12.9, 10)).toBe(9);
      expect(frameIndex(-2, 10)).toBe(0);
      expect(frameIndex(0, 0)).toBe(0);
    });
  });

  // Test Group b: Changing speed does not jump position
  describe('Group b: speed transitions', () => {
    it('changing speed maintains position continuity without jumps', () => {
      const initialPos = 14.5;
      // Changing speed is an instant state change in UI; advancing 0ms with new speed leaves pos unchanged
      const atSpeed1 = advance(initialPos, 0, 15, 1.0, 40, false);
      const atSpeedHalf = advance(initialPos, 0, 15, 0.5, 40, false);
      const atSpeedQuarter = advance(initialPos, 0, 15, 0.25, 40, false);

      expect(atSpeed1.position).toBe(initialPos);
      expect(atSpeedHalf.position).toBe(initialPos);
      expect(atSpeedQuarter.position).toBe(initialPos);

      // Subsequent advance with dt 50ms at 0.5x vs 1.0x progresses smoothly from initialPos
      const nextHalf = advance(initialPos, 50, 15, 0.5, 40, false);
      const next1 = advance(initialPos, 50, 15, 1.0, 40, false);
      expect(nextHalf.position).toBeGreaterThan(initialPos);
      expect(next1.position).toBeGreaterThan(nextHalf.position);
    });
  });

  // Test Group c: smoothFrames window average, null handling, non-mutating
  describe('Group c: smoothFrames moving average', () => {
    it('3-frame window averages points correctly across neighbors', () => {
      const frames: Array<Array<[number, number] | null>> = [
        [[10, 20]],
        [[20, 40]],
        [[30, 60]],
      ];

      const smoothed = smoothFrames(frames, 3);
      // Frame 0: neighbors frame 0, 1 -> avg ([10, 20] + [20, 40]) / 2 = [15, 30]
      expect(smoothed[0][0]).toEqual([15, 30]);
      // Frame 1: neighbors frame 0, 1, 2 -> avg ([10, 20] + [20, 40] + [30, 60]) / 3 = [20, 40]
      expect(smoothed[1][0]).toEqual([20, 40]);
      // Frame 2: neighbors frame 1, 2 -> avg ([20, 40] + [30, 60]) / 2 = [25, 50]
      expect(smoothed[2][0]).toEqual([25, 50]);
    });

    it('handles null points: current null stays null, missing neighbors are ignored', () => {
      const framesWithNulls: Array<Array<[number, number] | null>> = [
        [null, [10, 10]],
        [[20, 40], [20, 20]],
        [[40, 80], null],
      ];

      const smoothed = smoothFrames(framesWithNulls, 3);
      // Frame 0 point 0 was null -> stays null
      expect(smoothed[0][0]).toBeNull();

      // Frame 1 point 0: neighbor frame 0 is null, frame 1 is [20, 40], frame 2 is [40, 80]
      // -> avg ([20+40]/2, [40+80]/2) = [30, 60]
      expect(smoothed[1][0]).toEqual([30, 60]);

      // Frame 2 point 1 was null -> stays null
      expect(smoothed[2][1]).toBeNull();

      // Frame 1 point 1: neighbor frame 0 is [10, 10], frame 1 is [20, 20], frame 2 is null
      // -> avg ([10+20]/2, [10+20]/2) = [15, 15]
      expect(smoothed[1][1]).toEqual([15, 15]);
    });

    it('is pure and does not mutate input array or frames', () => {
      const original: Array<Array<[number, number] | null>> = [
        [[10, 20]],
        [[30, 40]],
      ];
      const copy = JSON.parse(JSON.stringify(original));

      const smoothed = smoothFrames(original, 3);
      expect(original).toEqual(copy);
      expect(smoothed).not.toBe(original);
      expect(smoothed[0]).not.toBe(original[0]);
    });
  });

  // Test Group d: projectFrame scales and mirrors correctly
  describe('Group d: projectFrame projection & mirroring', () => {
    it('scales normalized coords to canvas pixel dimensions', () => {
      const frame: Array<[number, number] | null> = [
        [0.5, 0.25],
        null,
      ];
      const projected = projectFrame(frame, 400, 200, false);
      expect(projected[0]).toEqual({ x: 200, y: 50 });
      expect(projected[1]).toBeNull();
    });

    it('mirrors x coordinate (1 - x) when mirrored is true', () => {
      const frame: Array<[number, number] | null> = [
        [0.2, 0.75],
      ];
      const projected = projectFrame(frame, 500, 400, true);
      // (1 - 0.2) * 500 = 0.8 * 500 = 400
      expect(projected[0]).toEqual({ x: 400, y: 300 });
    });
  });

  // Test Group e: visibleSegments omits missing joints, marks highlighted segments isRed: true
  describe('Group e: visibleSegments', () => {
    it('omits segments with missing/null joints', () => {
      const frame = [
        { x: 10, y: 20 },
        null, // index 1 is null
        { x: 30, y: 40 },
      ];
      const connections = [
        { start: 0, end: 1 }, // end is null -> omit
        { start: 0, end: 2 }, // both present -> keep
      ];

      const segs = visibleSegments(frame, connections, []);
      expect(segs.length).toBe(1);
      expect(segs[0].start).toBe(0);
      expect(segs[0].end).toBe(2);
      expect(segs[0].startX).toBe(10);
      expect(segs[0].endX).toBe(30);
    });

    it('marks segment isRed: true only when BOTH endpoints are in highlight', () => {
      const frame = [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
        { x: 30, y: 30 },
      ];
      const connections = [
        { start: 0, end: 1 },
        { start: 1, end: 2 },
      ];

      // Highlight only joint 1
      const segs1 = visibleSegments(frame, connections, [1]);
      expect(segs1[0].isRed).toBe(false);
      expect(segs1[1].isRed).toBe(false);

      // Highlight joint 0 and 1
      const segs2 = visibleSegments(frame, connections, [0, 1]);
      expect(segs2[0].isRed).toBe(true);
      expect(segs2[1].isRed).toBe(false);
    });

    it('assigns color groups (left, right, center) correctly based on parity', () => {
      const frame = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
        { x: 4, y: 4 },
      ];
      const connections = [
        { start: 1, end: 3 }, // both odd -> left
        { start: 2, end: 4 }, // both even -> right
        { start: 1, end: 2 }, // mixed -> center
      ];

      const segs = visibleSegments(frame, connections, []);
      expect(segs[0].colorGroup).toBe('left');
      expect(segs[1].colorGroup).toBe('right');
      expect(segs[2].colorGroup).toBe('center');
    });
  });
});
