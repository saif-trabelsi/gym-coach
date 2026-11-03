import { describe, it, expect, vi } from 'vitest';
import {
  fatigueCurve,
  formDrop,
  fatigueTrend,
  violationRanking,
  setSummary,
  FATIGUE_BAND,
} from './fatigue';
import {
  filterByRange,
  kpis,
  tzOffsetMinutes,
  type ProgressRow,
} from './progress';
import { parseHash } from './navigation';

describe('Task 4.3 Analytics & Navigation Tests', () => {
  // a. fatigue
  describe('a. fatigue functions (formDrop, fatigueTrend, fatigueCurve)', () => {
    it('scores [100,100,90,80,70,60] give formDrop 35 and "declining"', () => {
      const drop = formDrop([100, 100, 90, 80, 70, 60]);
      expect(drop).toBe(35);
      expect(fatigueTrend(drop)).toBe('declining');
    });

    it('scores [60,70,80,90,100,100] give -35 and "improving"', () => {
      const drop = formDrop([60, 70, 80, 90, 100, 100]);
      expect(drop).toBe(-35);
      expect(fatigueTrend(drop)).toBe('improving');
    });

    it('scores [90,92,88,91,89,90] give a drop within +-5 and "stable"', () => {
      const drop = formDrop([90, 92, 88, 91, 89, 90]);
      expect(drop).not.toBeNull();
      expect(Math.abs(drop!)).toBeLessThan(FATIGUE_BAND);
      expect(fatigueTrend(drop)).toBe('stable');
    });

    it('3 scores give null and "insufficient"', () => {
      const drop = formDrop([90, 95, 80]);
      expect(drop).toBeNull();
      expect(fatigueTrend(drop)).toBe('insufficient');
    });

    it('n = 4 uses k = 1, n = 6 uses k = 2, n = 9 uses k = 3', () => {
      // n = 4: first 1 is 100, last 1 is 80 -> drop 20
      expect(formDrop([100, 95, 90, 80])).toBe(20);

      // n = 6: first 2 are [100, 90] (avg 95), last 2 are [80, 70] (avg 75) -> drop 20
      expect(formDrop([100, 90, 90, 90, 80, 70])).toBe(20);

      // n = 9: first 3 are [100, 100, 100] (avg 100), last 3 are [70, 70, 70] (avg 70) -> drop 30
      expect(formDrop([100, 100, 100, 90, 90, 90, 70, 70, 70])).toBe(30);
    });

    it('fatigueCurve sorts reps by index ascending', () => {
      const reps = [
        { index: 3, score: 80 },
        { index: 1, score: 95 },
        { index: 2, score: 90 },
      ];
      expect(fatigueCurve(reps)).toEqual([
        { index: 1, score: 95 },
        { index: 2, score: 90 },
        { index: 3, score: 80 },
      ]);
    });
  });

  // b. violationRanking
  describe('b. violationRanking', () => {
    it('counts correct, ties sorted alphabetically', () => {
      const reps = [
        { violations: ['tempo', 'depth'] },
        { violations: ['depth', 'back'] },
        { violations: [{ ruleId: 'back' }] },
        { violations: [] },
      ];

      // Counts: depth = 2, back = 2, tempo = 1
      // depth and back are tied at 2, so back comes before depth alphabetically!
      const ranking = violationRanking(reps);
      expect(ranking).toEqual([
        { rule: 'back', count: 2 },
        { rule: 'depth', count: 2 },
        { rule: 'tempo', count: 1 },
      ]);
    });
  });

  // c. setSummary
  describe('c. setSummary', () => {
    it('gives exact average (1 decimal), best, worst on a known set', () => {
      const set = {
        reps: [
          { index: 1, score: 95, violations: [] },
          { index: 2, score: 88, violations: ['tempo'] },
          { index: 3, score: 82, violations: ['back'] },
          { index: 4, score: 79, violations: ['back', 'depth'] },
        ],
      };

      // Average: (95 + 88 + 82 + 79) / 4 = 344 / 4 = 86.0
      // Best: 95, Worst: 79
      // n = 4, k = 1: first is 95, last is 79 -> drop 16.0, trend "declining"
      const summary = setSummary(set);
      expect(summary.reps).toBe(4);
      expect(summary.averageScore).toBe(86.0);
      expect(summary.bestScore).toBe(95);
      expect(summary.worstScore).toBe(79);
      expect(summary.formDrop).toBe(16.0);
      expect(summary.trend).toBe('declining');
      expect(summary.ranking).toEqual([
        { rule: 'back', count: 2 },
        { rule: 'depth', count: 1 },
        { rule: 'tempo', count: 1 },
      ]);
    });
  });

  // d. parseHash
  describe('d. parseHash', () => {
    it('#history/12 gives view history id 12', () => {
      expect(parseHash('#history/12')).toEqual({ view: 'history', id: 12 });
    });

    it('#progress gives progress', () => {
      expect(parseHash('#progress')).toEqual({ view: 'progress' });
    });

    it('"" and "#nonsense" give coach', () => {
      expect(parseHash('')).toEqual({ view: 'coach' });
      expect(parseHash('#nonsense')).toEqual({ view: 'coach' });
      expect(parseHash('#coach')).toEqual({ view: 'coach' });
    });

    it('#history/abc falls back to the history list', () => {
      expect(parseHash('#history/abc')).toEqual({ view: 'history' });
    });
  });

  // e. filterByRange
  describe('e. filterByRange', () => {
    it('with a fixed today: 7d keeps only the last 7 days including today', () => {
      const today = '2026-11-03';
      const rows: ProgressRow[] = [
        { date: '2026-11-03', exercise: 'squat', reps: 10, average_score: 90 }, // today (day 0) -> keep
        { date: '2026-11-01', exercise: 'squat', reps: 10, average_score: 85 }, // day -2 -> keep
        { date: '2026-10-28', exercise: 'squat', reps: 10, average_score: 80 }, // day -6 (7th day) -> keep
        { date: '2026-10-27', exercise: 'squat', reps: 10, average_score: 75 }, // day -7 (8th day) -> exclude
        { date: '2026-10-15', exercise: 'squat', reps: 10, average_score: 70 }, // day -19 -> exclude
      ];

      const filtered7d = filterByRange(rows, '7d', today);
      expect(filtered7d.map((r) => r.date)).toEqual([
        '2026-11-03',
        '2026-11-01',
        '2026-10-28',
      ]);

      const filtered30d = filterByRange(rows, '30d', today);
      expect(filtered30d).toHaveLength(5);

      const filteredAll = filterByRange(rows, 'all', today);
      expect(filteredAll).toHaveLength(5);
    });
  });

  // f. kpis
  describe('f. kpis', () => {
    it('rows [(day1, squat, 10 reps, avg 90), (day2, squat, 30 reps, avg 70)] give overall average 75.0 (weighted by reps), total reps 40, best day = day1', () => {
      const rows: ProgressRow[] = [
        { date: '2026-11-01', exercise: 'squat', reps: 10, average_score: 90 },
        { date: '2026-11-02', exercise: 'squat', reps: 30, average_score: 70 },
      ];

      const result = kpis(rows);
      expect(result.overallAverageScore).toBe(75.0);
      expect(result.totalReps).toBe(40);
      expect(result.bestDay).toBe('2026-11-01');
      expect(result.workoutsCount).toBe(2);
    });
  });

  // g. tzOffsetMinutes
  describe('g. tzOffsetMinutes', () => {
    it('returns 60 when the mocked Date offset is -60', () => {
      const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
      try {
        Date.prototype.getTimezoneOffset = vi.fn().mockReturnValue(-60);
        expect(tzOffsetMinutes()).toBe(60);
      } finally {
        Date.prototype.getTimezoneOffset = originalGetTimezoneOffset;
      }
    });
  });
});
