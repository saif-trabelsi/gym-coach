export type ExerciseType = 'squat' | 'bicepCurl';

export interface RecordedRep {
  index: number;
  score: number;
  duration_ms: number;
  metrics: Record<string, unknown>;
  violations: string[];
  timestamp: number;
}

export interface RecordedSet {
  exercise: ExerciseType;
  started_at: string;
  ended_at: string;
  reps: RecordedRep[];
}

export interface SessionPayload {
  started_at: string;
  ended_at: string;
  sets: RecordedSet[];
}

export interface InputRepData {
  score: number;
  durationMs?: number;
  duration_ms?: number;
  metrics?: Record<string, unknown> | object | null;
  violations?: (string | { ruleId: string })[];
  timestamp?: number;
}

/**
 * Strips non-finite values (NaN, Infinity, undefined) and rounds numbers to 2 decimal places.
 */
export function sanitizeMetrics(raw?: Record<string, unknown> | object | null): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number') {
      if (Number.isFinite(value)) {
        cleaned[key] = Math.round(value * 100) / 100;
      }
    } else if (value !== undefined && value !== null) {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

interface ActiveSet {
  exercise: ExerciseType;
  reps: RecordedRep[];
}

export class WorkoutRecorder {
  private clock: () => number;
  private activeSet: ActiveSet | null = null;
  private finishedSetsList: RecordedSet[] = [];
  private cachedSessionEndedAt: string | null = null;

  constructor(clock: () => number = Date.now) {
    this.clock = clock;
  }

  /**
   * Adds a completed rep to the current workout set.
   * If the exercise differs from the active set, the active set is closed and a new set opens.
   */
  addRep(exercise: ExerciseType, rep: InputRepData): void {
    if (this.activeSet && this.activeSet.exercise !== exercise) {
      this.endSet();
    }

    if (!this.activeSet) {
      this.activeSet = { exercise, reps: [] };
    }

    this.cachedSessionEndedAt = null;

    const repIndex = this.activeSet.reps.length + 1;
    const score = Math.max(0, Math.min(100, Math.round(rep.score)));
    const duration_ms = Math.max(0, Math.round(rep.durationMs ?? rep.duration_ms ?? 0));

    // Timestamp must be an integer >= 1000000000000
    const rawTimestamp =
      typeof rep.timestamp === 'number' && rep.timestamp >= 1000000000000
        ? Math.round(rep.timestamp)
        : Math.round(this.clock());
    const timestamp = Math.max(1000000000000, rawTimestamp);

    const metrics = sanitizeMetrics(rep.metrics);

    const violations: string[] = (rep.violations ?? [])
      .map((v) => (typeof v === 'string' ? v : v?.ruleId))
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const recordedRep: RecordedRep = {
      index: repIndex,
      score,
      duration_ms,
      metrics,
      violations,
      timestamp,
    };

    this.activeSet.reps.push(recordedRep);
  }

  /**
   * Closes the active set and moves it to finished sets.
   * If there is no active set or the active set has 0 reps, this does nothing.
   */
  endSet(): void {
    if (!this.activeSet || this.activeSet.reps.length === 0) {
      this.activeSet = null;
      return;
    }

    const { exercise, reps } = this.activeSet;
    const firstRep = reps[0];
    const lastRep = reps[reps.length - 1];

    const startMs = firstRep.timestamp - firstRep.duration_ms;
    const endMs = Math.max(startMs, lastRep.timestamp);

    const finalizedSet: RecordedSet = {
      exercise,
      started_at: new Date(startMs).toISOString(),
      ended_at: new Date(endMs).toISOString(),
      reps,
    };

    this.finishedSetsList.push(finalizedSet);
    this.activeSet = null;
  }

  /**
   * Builds the session payload for the backend.
   * Ends any active set with reps first. Returns null if there are no reps in the entire workout.
   */
  buildPayload(): SessionPayload | null {
    if (this.activeSet && this.activeSet.reps.length > 0) {
      this.endSet();
    }

    if (this.finishedSetsList.length === 0) {
      return null;
    }

    const firstSet = this.finishedSetsList[0];
    const firstSetStartMs = new Date(firstSet.started_at).getTime();

    if (!this.cachedSessionEndedAt) {
      const nowMs = Math.max(1000000000000, Math.round(this.clock()));
      const sessionEndedMs = Math.max(nowMs, firstSetStartMs);
      this.cachedSessionEndedAt = new Date(sessionEndedMs).toISOString();
    }

    return {
      started_at: firstSet.started_at,
      ended_at: this.cachedSessionEndedAt,
      sets: this.finishedSetsList.map((s) => ({
        exercise: s.exercise,
        started_at: s.started_at,
        ended_at: s.ended_at,
        reps: [...s.reps],
      })),
    };
  }

  /**
   * Resets all recorded workout data.
   */
  reset(): void {
    this.activeSet = null;
    this.finishedSetsList = [];
    this.cachedSessionEndedAt = null;
  }

  /**
   * Returns current active set details if open.
   */
  getCurrentSet(): { exercise: ExerciseType; reps: RecordedRep[]; averageScore: number } | null {
    if (!this.activeSet || this.activeSet.reps.length === 0) {
      return null;
    }
    const count = this.activeSet.reps.length;
    const sum = this.activeSet.reps.reduce((acc, r) => acc + r.score, 0);
    return {
      exercise: this.activeSet.exercise,
      reps: [...this.activeSet.reps],
      averageScore: Math.round((sum / count) * 10) / 10,
    };
  }

  get currentSet() {
    return this.getCurrentSet();
  }

  /**
   * Returns all finished sets.
   */
  getFinishedSets(): RecordedSet[] {
    return [...this.finishedSetsList];
  }

  get finishedSets() {
    return this.getFinishedSets();
  }

  /**
   * Returns total reps and overall average score.
   */
  getTotals(): { totalReps: number; averageScore: number } {
    let count = 0;
    let sum = 0;

    for (const set of this.finishedSetsList) {
      for (const rep of set.reps) {
        count++;
        sum += rep.score;
      }
    }

    if (this.activeSet) {
      for (const rep of this.activeSet.reps) {
        count++;
        sum += rep.score;
      }
    }

    return {
      totalReps: count,
      averageScore: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
    };
  }

  get totals() {
    return this.getTotals();
  }

  get totalReps(): number {
    return this.getTotals().totalReps;
  }

  get averageScore(): number {
    return this.getTotals().averageScore;
  }
}
