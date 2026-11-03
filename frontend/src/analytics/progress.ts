export interface ProgressRow {
  date: string; // YYYY-MM-DD
  exercise: string;
  reps: number;
  average_score: number;
}

export interface SessionOverviewItem {
  id: number;
  started_at: string;
  ended_at: string;
  exercises: string[];
  total_reps: number;
  average_score: number | null;
}

export interface KpiSummary {
  workoutsCount: number;
  totalReps: number;
  overallAverageScore: number;
  bestDay: string | null;
}

/**
 * Returns timezone offset in minutes east of UTC (-new Date().getTimezoneOffset()).
 */
export function tzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/**
 * Filters progress rows by range ('7d', '30d', 'all') relative to an injected today string (YYYY-MM-DD).
 * 7d keeps only the last 7 calendar days including today.
 */
export function filterByRange(
  rows: ProgressRow[],
  range: '7d' | '30d' | 'all',
  today: string
): ProgressRow[] {
  if (range === 'all') {
    return [...rows];
  }

  const todayTime = Date.parse(`${today}T00:00:00Z`);
  const maxDays = range === '7d' ? 7 : 30;

  return rows.filter((row) => {
    const rowTime = Date.parse(`${row.date}T00:00:00Z`);
    if (isNaN(rowTime)) return false;

    const diffDays = Math.round((todayTime - rowTime) / (24 * 60 * 60 * 1000));
    return diffDays >= 0 && diffDays < maxDays;
  });
}

/**
 * Calculates high-level KPIs from progress rows and sessions.
 * Overall average score is weighted by reps (rounded to 1 decimal).
 * Best day is the calendar date with the highest average score.
 */
export function kpis(
  rows: ProgressRow[],
  sessions?: SessionOverviewItem[] | number
): KpiSummary {
  let totalReps = 0;
  let weightedScoreSum = 0;

  // Group by date to find best day
  const dateTotals: Record<string, { reps: number; weightedScore: number }> = {};

  for (const row of rows) {
    totalReps += row.reps;
    weightedScoreSum += row.reps * row.average_score;

    if (!dateTotals[row.date]) {
      dateTotals[row.date] = { reps: 0, weightedScore: 0 };
    }
    dateTotals[row.date].reps += row.reps;
    dateTotals[row.date].weightedScore += row.reps * row.average_score;
  }

  const overallAverageScore =
    totalReps > 0 ? Math.round((weightedScoreSum / totalReps) * 10) / 10 : 0;

  let bestDay: string | null = null;
  let highestDayAverage = -1;

  for (const [date, data] of Object.entries(dateTotals)) {
    const dayAvg = data.reps > 0 ? data.weightedScore / data.reps : 0;
    if (dayAvg > highestDayAverage) {
      highestDayAverage = dayAvg;
      bestDay = date;
    }
  }

  let workoutsCount = 0;
  if (typeof sessions === 'number') {
    workoutsCount = sessions;
  } else if (Array.isArray(sessions)) {
    workoutsCount = sessions.length;
  } else {
    // Fall back to distinct dates if sessions list not provided
    workoutsCount = Object.keys(dateTotals).length;
  }

  return {
    workoutsCount,
    totalReps,
    overallAverageScore,
    bestDay,
  };
}
