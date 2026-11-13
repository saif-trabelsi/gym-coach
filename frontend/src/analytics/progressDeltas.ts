import type { ProgressRow } from './progress';

export interface PeriodKpi {
  workoutsCount: number;
  totalReps: number;
  averageScore: number;
  activeDays: number;
  mostTrained: string | null;
}

export interface KpiDelta {
  current: number;
  previous: number | null;
  delta: number | null;
  pctChange: number | null; // e.g. +25.5% or -10.0%
}

export interface ProgressMetricsWithDeltas {
  range: '7d' | '30d' | 'all';
  totalReps: KpiDelta;
  averageScore: KpiDelta;
  workoutsCount: KpiDelta;
  activeDays: KpiDelta;
  mostTrained: string | null;
  currentRows: ProgressRow[];
  previousRows: ProgressRow[];
}

/**
 * Calculates metrics for a given subset of progress rows.
 */
export function calculatePeriodKpi(rows: ProgressRow[]): PeriodKpi {
  let totalReps = 0;
  let weightedScoreSum = 0;
  const daysSet = new Set<string>();
  const exerciseReps: Record<string, number> = {};

  for (const row of rows) {
    totalReps += row.reps;
    weightedScoreSum += row.reps * row.average_score;
    daysSet.add(row.date);

    if (!exerciseReps[row.exercise]) {
      exerciseReps[row.exercise] = 0;
    }
    exerciseReps[row.exercise] += row.reps;
  }

  const averageScore =
    totalReps > 0 ? Math.round((weightedScoreSum / totalReps) * 10) / 10 : 0;

  let mostTrained: string | null = null;
  let maxReps = -1;
  for (const [ex, count] of Object.entries(exerciseReps)) {
    if (count > maxReps) {
      maxReps = count;
      mostTrained = ex;
    }
  }

  return {
    workoutsCount: daysSet.size, // active workout days count
    totalReps,
    averageScore,
    activeDays: daysSet.size,
    mostTrained,
  };
}

/**
 * Builds delta comparison object between current and previous values.
 */
export function makeDelta(
  current: number,
  previous: number | null,
  isScore = false
): KpiDelta {
  if (previous === null) {
    return {
      current,
      previous: null,
      delta: null,
      pctChange: null,
    };
  }

  const delta = isScore
    ? Math.round((current - previous) * 10) / 10
    : current - previous;

  let pctChange: number | null = null;
  if (previous > 0) {
    pctChange = Math.round(((current - previous) / previous) * 1000) / 10;
  } else if (current > 0) {
    pctChange = 100.0;
  }

  return {
    current,
    previous,
    delta,
    pctChange,
  };
}

/**
 * Partitions progress rows into current and equal previous period based on range and reference date (now).
 * For '7d': current = [now - 7 days, now], previous = [now - 14 days, now - 7 days)
 * For '30d': current = [now - 30 days, now], previous = [now - 60 days, now - 30 days)
 * For 'all': all rows are current, previous is empty (no deltas)
 */
export function computeProgressWithDeltas(
  rows: ProgressRow[],
  range: '7d' | '30d' | 'all',
  now: Date = new Date()
): ProgressMetricsWithDeltas {
  if (range === 'all') {
    const kpi = calculatePeriodKpi(rows);
    return {
      range,
      totalReps: makeDelta(kpi.totalReps, null),
      averageScore: makeDelta(kpi.averageScore, null, true),
      workoutsCount: makeDelta(kpi.workoutsCount, null),
      activeDays: makeDelta(kpi.activeDays, null),
      mostTrained: kpi.mostTrained,
      currentRows: [...rows],
      previousRows: [],
    };
  }

  const days = range === '7d' ? 7 : 30;
  const msPerDay = 24 * 60 * 60 * 1000;

  // Normalize now to UTC midnight for consistent cross-timezone calculations
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const currentStart = nowUtc - (days - 1) * msPerDay; // inclusive of today (e.g. 7 days: day -6 to day 0)
  const previousStart = currentStart - days * msPerDay;

  const currentRows: ProgressRow[] = [];
  const previousRows: ProgressRow[] = [];

  for (const row of rows) {
    const parts = row.date.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) continue;
    const rowUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);

    // Check current period
    if (rowUtc >= currentStart && rowUtc <= nowUtc) {
      currentRows.push(row);
    }
    // Check previous period
    else if (rowUtc >= previousStart && rowUtc < currentStart) {
      previousRows.push(row);
    }
  }

  const currentKpi = calculatePeriodKpi(currentRows);
  const previousKpi = calculatePeriodKpi(previousRows);

  return {
    range,
    totalReps: makeDelta(currentKpi.totalReps, previousKpi.totalReps),
    averageScore: makeDelta(currentKpi.averageScore, previousKpi.averageScore, true),
    workoutsCount: makeDelta(currentKpi.workoutsCount, previousKpi.workoutsCount),
    activeDays: makeDelta(currentKpi.activeDays, previousKpi.activeDays),
    mostTrained: currentKpi.mostTrained,
    currentRows,
    previousRows,
  };
}
