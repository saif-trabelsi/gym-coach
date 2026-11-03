export const FATIGUE_BAND = 5;

export interface RepScoreItem {
  index: number;
  score: number;
  violations?: (string | { ruleId: string })[];
  metrics?: Record<string, unknown>;
}

export interface ViolationCount {
  rule: string;
  count: number;
}

export type FatigueTrend = 'declining' | 'improving' | 'stable' | 'insufficient';

export interface SetSummaryResult {
  reps: number;
  averageScore: number;
  bestScore: number;
  worstScore: number;
  formDrop: number | null;
  trend: FatigueTrend;
  ranking: ViolationCount[];
}

/**
 * Returns [{index, score}] sorted by index ascending.
 */
export function fatigueCurve(reps: { index: number; score: number }[]): { index: number; score: number }[] {
  return [...reps]
    .sort((a, b) => a.index - b.index)
    .map((r) => ({ index: r.index, score: r.score }));
}

/**
 * Calculates form drop across scores.
 * k = max(1, floor(n/3))
 * returns average(first k) minus average(last k), or null if n < 4.
 * Rounded to 1 decimal place.
 */
export function formDrop(scores: number[]): number | null {
  const n = scores.length;
  if (n < 4) {
    return null;
  }

  const k = Math.max(1, Math.floor(n / 3));
  const firstK = scores.slice(0, k);
  const lastK = scores.slice(n - k);

  const avgFirst = firstK.reduce((sum, s) => sum + s, 0) / k;
  const avgLast = lastK.reduce((sum, s) => sum + s, 0) / k;

  const drop = avgFirst - avgLast;
  return Math.round(drop * 10) / 10;
}

/**
 * Determines trend from form drop value.
 * "declining" if drop >= FATIGUE_BAND (5)
 * "improving" if drop <= -FATIGUE_BAND (-5)
 * "stable" otherwise
 * "insufficient" if drop is null
 */
export function fatigueTrend(drop: number | null): FatigueTrend {
  if (drop === null) {
    return 'insufficient';
  }
  if (drop >= FATIGUE_BAND) {
    return 'declining';
  }
  if (drop <= -FATIGUE_BAND) {
    return 'improving';
  }
  return 'stable';
}

/**
 * Ranks violation rule IDs by frequency descending, then rule name alphabetically ascending.
 */
export function violationRanking(
  reps: { violations?: (string | { ruleId: string })[] }[]
): ViolationCount[] {
  const counts: Record<string, number> = {};

  for (const rep of reps) {
    if (!rep.violations) continue;
    for (const v of rep.violations) {
      const ruleId = typeof v === 'string' ? v : v?.ruleId;
      if (ruleId) {
        counts[ruleId] = (counts[ruleId] || 0) + 1;
      }
    }
  }

  return Object.entries(counts)
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.rule.localeCompare(b.rule);
    });
}

/**
 * Computes set summary: reps, average score (1 decimal), best, worst, formDrop, trend, ranking.
 */
export function setSummary(set: {
  reps: RepScoreItem[];
}): SetSummaryResult {
  const repsCount = set.reps.length;
  if (repsCount === 0) {
    return {
      reps: 0,
      averageScore: 0,
      bestScore: 0,
      worstScore: 0,
      formDrop: null,
      trend: 'insufficient',
      ranking: [],
    };
  }

  const scores = set.reps.map((r) => r.score);
  const totalScore = scores.reduce((sum, s) => sum + s, 0);
  const avg = Math.round((totalScore / repsCount) * 10) / 10;
  const best = Math.max(...scores);
  const worst = Math.min(...scores);
  const drop = formDrop(scores);
  const trend = fatigueTrend(drop);
  const ranking = violationRanking(set.reps);

  return {
    reps: repsCount,
    averageScore: avg,
    bestScore: best,
    worstScore: worst,
    formDrop: drop,
    trend,
    ranking,
  };
}
