import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { listSessions, deleteSession, type SessionListItem } from '../api/client';
import { groupSessionsByDay, formatDuration, formatLocalTime } from '../analytics/dates';
import { Button } from './kit/Button';
import { Card } from './kit/Card';
import { Badge } from './kit/Badge';
import { ScoreRing } from './kit/ScoreRing';
import { Skeleton } from './kit/Skeleton';
import { EmptyState } from './kit/EmptyState';
import { Dialog } from './kit/Dialog';
import {
  History as HistoryIcon,
  RotateCcw,
  Trash2,
  Dumbbell,
  Clock,
  Filter,
  Calendar,
  Flame,
  ArrowRight,
} from 'lucide-react';

export interface HistoryViewProps {
  backendOnline: boolean | null;
  onSelectSession: (id: number) => void;
  onGoToCoach: () => void;
}

export type ExerciseFilter = 'all' | 'squat' | 'bicepCurl';
export type DateRangeFilter = 'all' | '7d' | '30d';

export const HistoryView: React.FC<HistoryViewProps> = ({
  backendOnline,
  onSelectSession,
  onGoToCoach,
}) => {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [exerciseFilter, setExerciseFilter] = useState<ExerciseFilter>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>('all');

  // Deletion modal state
  const [deletingSession, setDeletingSession] = useState<SessionListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSessions();
      setSessions(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load workout history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const confirmDelete = async () => {
    if (!deletingSession) return;
    setIsDeleting(true);
    try {
      await deleteSession(deletingSession.id);
      setDeletingSession(null);
      await fetchHistory();
    } catch (err: unknown) {
      alert(`Failed to delete session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter sessions by exercise and date range
  const filteredSessions = useMemo(() => {
    let result = sessions;

    // Filter by exercise
    if (exerciseFilter !== 'all') {
      result = result.filter((s) => s.exercises?.includes(exerciseFilter));
    }

    // Filter by date range
    if (dateRangeFilter !== 'all') {
      const now = Date.now();
      const cutoffDays = dateRangeFilter === '7d' ? 7 : 30;
      const cutoffMs = now - cutoffDays * 24 * 60 * 60 * 1000;
      result = result.filter((s) => new Date(s.started_at).getTime() >= cutoffMs);
    }

    return result;
  }, [sessions, exerciseFilter, dateRangeFilter]);

  // Group by day with relative headers (Today, Yesterday, etc.)
  const dayGroups = useMemo(() => {
    return groupSessionsByDay(filteredSessions);
  }, [filteredSessions]);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 p-4">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2">
              <HistoryIcon className="w-5 h-5 text-[var(--accent)]" />
              Workout History
            </h1>
            <Badge variant="neutral" size="sm">
              {filteredSessions.length} session{filteredSessions.length === 1 ? '' : 's'}
            </Badge>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Browse past workout sessions, performance summaries, and drill down into set fatigue curves.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={fetchHistory}
          disabled={loading}
          leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          Refresh
        </Button>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 rounded-[var(--radius-xl)] text-xs">
        {/* Exercise Filter Chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[var(--text-muted)] font-semibold flex items-center gap-1 me-1">
            <Filter className="w-3.5 h-3.5" /> Exercise:
          </span>
          {(['all', 'squat', 'bicepCurl'] as ExerciseFilter[]).map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setExerciseFilter(ex)}
              className={`px-2.5 py-1 rounded-full font-medium transition-all cursor-pointer ${
                exerciseFilter === ex
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                  : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)]'
              }`}
            >
              {ex === 'all' ? 'All' : ex === 'squat' ? 'Squat' : 'Bicep Curl'}
            </button>
          ))}
        </div>

        {/* Date Range Chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[var(--text-muted)] font-semibold flex items-center gap-1 me-1">
            <Calendar className="w-3.5 h-3.5" /> Date:
          </span>
          {(['all', '7d', '30d'] as DateRangeFilter[]).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setDateRangeFilter(range)}
              className={`px-2.5 py-1 rounded-full font-medium transition-all cursor-pointer ${
                dateRangeFilter === range
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                  : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)]'
              }`}
            >
              {range === 'all' ? 'All time' : range === '7d' ? 'Last 7 days' : 'Last 30 days'}
            </button>
          ))}
        </div>
      </div>

      {/* Offline banner warning */}
      {backendOnline === false && (
        <div
          role="alert"
          className="bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-[var(--status-danger)] rounded-[var(--radius-lg)] p-3 text-xs flex items-center gap-2"
        >
          <span>The backend is currently unreachable. Workout history may be incomplete.</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-[var(--status-danger)] rounded-[var(--radius-xl)] p-4 text-xs flex items-center justify-between">
          <span>{error}</span>
          <Button variant="secondary" size="sm" onClick={fetchHistory}>
            Try Again
          </Button>
        </div>
      )}

      {/* Loading Skeleton List */}
      {loading && (
        <div data-testid="history-skeleton-list" className="flex flex-col gap-4">
          <Skeleton variant="text" width={120} height={20} />
          <div className="grid grid-cols-1 gap-3">
            {[1, 2, 3].map((n) => (
              <Card key={n} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <Skeleton variant="circular" width={52} height={52} />
                  <div className="flex flex-col gap-2">
                    <Skeleton variant="text" width={140} height={16} />
                    <Skeleton variant="text" width={90} height={12} />
                  </div>
                </div>
                <Skeleton variant="rounded" width={80} height={32} />
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredSessions.length === 0 && (
        <EmptyState
          icon={<HistoryIcon className="w-6 h-6" />}
          title="No workouts found"
          description={
            exerciseFilter !== 'all' || dateRangeFilter !== 'all'
              ? 'No sessions match your filter criteria. Try clearing filters.'
              : 'You have not recorded any workouts yet. Start your first session to track progress.'
          }
          action={
            <Button variant="primary" size="md" onClick={onGoToCoach} rightIcon={<ArrowRight className="w-4 h-4" />}>
              Start a Workout
            </Button>
          }
        />
      )}

      {/* Grouped Workout Cards */}
      {!loading && !error && dayGroups.length > 0 && (
        <div className="flex flex-col gap-8">
          {dayGroups.map((group) => (
            <div key={group.dateKey} className="flex flex-col gap-3">
              {/* Relative Date Header */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                  {group.label}
                </span>
                <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              </div>

              {/* Day Sessions List */}
              <div className="grid grid-cols-1 gap-3">
                {group.items.map((s) => {
                  const duration = formatDuration(s.started_at, s.ended_at);
                  const time = formatLocalTime(s.started_at);
                  const score = s.average_score !== null ? Math.round(s.average_score) : null;

                  return (
                    <Card
                      key={s.id}
                      onClick={() => onSelectSession(s.id)}
                      className="group cursor-pointer hover:border-[var(--accent)] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 shadow-sm"
                    >
                      <div className="flex items-center gap-4">
                        {/* Small ScoreRing or Score placeholder */}
                        {score !== null ? (
                          <ScoreRing score={score} size={50} strokeWidth={5} />
                        ) : (
                          <div className="w-[50px] h-[50px] rounded-full border border-[var(--border-subtle)] flex items-center justify-center font-mono text-xs text-[var(--text-muted)]">
                            --
                          </div>
                        )}

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-[var(--text-primary)]">
                              Session #{s.id}
                            </span>
                            <span className="text-xs text-[var(--text-muted)]">· {time}</span>
                          </div>

                          {/* Exercise Badges & Duration */}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {s.exercises?.map((ex) => (
                              <Badge key={ex} variant="neutral" size="sm">
                                {ex === 'squat' ? (
                                  <Flame className="w-3 h-3 text-emerald-400 inline me-1" />
                                ) : (
                                  <Dumbbell className="w-3 h-3 text-cyan-400 inline me-1" />
                                )}
                                {ex === 'squat' ? 'Squat' : 'Bicep Curl'}
                              </Badge>
                            ))}

                            <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1 font-mono">
                              <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                              {duration}
                            </span>

                            <span className="text-xs text-[var(--text-secondary)] font-mono font-medium">
                              {s.total_reps} reps
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Actions: Drill Down Arrow & Delete Button */}
                      <div className="flex items-center justify-end gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--border-subtle)]">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingSession(s);
                          }}
                          aria-label={`Delete session ${s.id}`}
                          title="Delete workout session"
                          className="p-2 rounded-[var(--radius-lg)] text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <span className="text-xs font-semibold text-[var(--accent)] group-hover:translate-x-0.5 transition-transform hidden sm:inline-flex items-center gap-1">
                          View Analysis <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Accessible Delete Confirmation Dialog */}
      <Dialog
        isOpen={deletingSession !== null}
        onClose={() => setDeletingSession(null)}
        title="Delete Workout Session?"
        description={`Are you sure you want to delete session #${deletingSession?.id}? All recorded sets, biomechanical metrics, replays, and coaching reports will be permanently deleted.`}
      >
        <div className="flex justify-end gap-3 mt-5">
          <Button variant="ghost" onClick={() => setDeletingSession(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete} isLoading={isDeleting}>
            Yes, Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
};
