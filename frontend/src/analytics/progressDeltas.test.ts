import { describe, it, expect } from 'vitest';
import {
  calculatePeriodKpi,
  makeDelta,
  computeProgressWithDeltas,
} from './progressDeltas';
import type { ProgressRow } from './progress';

describe('Progress KPI & Delta Calculations (Task D.4)', () => {
  const fixedNow = new Date('2026-11-12T12:00:00Z');

  it('calculatePeriodKpi computes weighted average, totals, and most trained exercise', () => {
    const rows: ProgressRow[] = [
      { date: '2026-11-10', exercise: 'squat', reps: 20, average_score: 90 },
      { date: '2026-11-11', exercise: 'squat', reps: 10, average_score: 80 },
      { date: '2026-11-11', exercise: 'bicepCurl', reps: 15, average_score: 70 },
    ];

    const kpi = calculatePeriodKpi(rows);
    expect(kpi.totalReps).toBe(45);
    // (20*90 + 10*80 + 15*70) / 45 = (1800 + 800 + 1050) / 45 = 3650 / 45 = 81.111 -> 81.1
    expect(kpi.averageScore).toBe(81.1);
    expect(kpi.activeDays).toBe(2);
    expect(kpi.mostTrained).toBe('squat');
  });

  it('makeDelta calculates absolute delta and percent change accurately', () => {
    // Reps increase from 100 to 150 (+50, +50%)
    const delta1 = makeDelta(150, 100);
    expect(delta1.delta).toBe(50);
    expect(delta1.pctChange).toBe(50.0);

    // Score change from 80.0 to 85.5 (+5.5 pts)
    const delta2 = makeDelta(85.5, 80.0, true);
    expect(delta2.delta).toBe(5.5);

    // Decrease from 100 to 60 (-40, -40%)
    const delta3 = makeDelta(60, 100);
    expect(delta3.delta).toBe(-40);
    expect(delta3.pctChange).toBe(-40.0);

    // No previous period
    const delta4 = makeDelta(100, null);
    expect(delta4.delta).toBeNull();
    expect(delta4.pctChange).toBeNull();
  });

  it('computeProgressWithDeltas splits current and previous equal periods correctly for 7d', () => {
    // Reference now: 2026-11-12
    // Current 7d window: 2026-11-06 to 2026-11-12 (7 days)
    // Previous 7d window: 2026-10-30 to 2026-11-05 (7 days)
    const rows: ProgressRow[] = [
      // Current 7d
      { date: '2026-11-12', exercise: 'squat', reps: 30, average_score: 90 },
      { date: '2026-11-08', exercise: 'squat', reps: 20, average_score: 85 },
      // Previous 7d
      { date: '2026-11-04', exercise: 'squat', reps: 25, average_score: 80 },
      { date: '2026-11-01', exercise: 'squat', reps: 15, average_score: 75 },
      // Older than previous 7d
      { date: '2026-10-20', exercise: 'squat', reps: 50, average_score: 60 },
    ];

    const result = computeProgressWithDeltas(rows, '7d', fixedNow);

    expect(result.currentRows).toHaveLength(2);
    expect(result.previousRows).toHaveLength(2);

    // Current: 50 reps, prev: 40 reps -> delta +10 reps, +25%
    expect(result.totalReps.current).toBe(50);
    expect(result.totalReps.previous).toBe(40);
    expect(result.totalReps.delta).toBe(10);
    expect(result.totalReps.pctChange).toBe(25.0);

    // Current avg: (30*90 + 20*85)/50 = 4400/50 = 88.0
    // Prev avg: (25*80 + 15*75)/40 = 3125/40 = 78.1
    // Delta: +9.9 pts
    expect(result.averageScore.current).toBe(88.0);
    expect(result.averageScore.previous).toBe(78.1);
    expect(result.averageScore.delta).toBe(9.9);
  });

  it('handles range="all" with null deltas', () => {
    const rows: ProgressRow[] = [
      { date: '2026-11-12', exercise: 'squat', reps: 30, average_score: 90 },
    ];
    const result = computeProgressWithDeltas(rows, 'all', fixedNow);
    expect(result.totalReps.current).toBe(30);
    expect(result.totalReps.delta).toBeNull();
    expect(result.previousRows).toHaveLength(0);
  });
});
