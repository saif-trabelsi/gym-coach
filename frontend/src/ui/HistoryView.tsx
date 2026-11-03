import React, { useEffect, useState, useCallback } from 'react';
import { listSessions, deleteSession, type SessionListItem } from '../api/client';

interface HistoryViewProps {
  backendOnline: boolean | null;
  onSelectSession: (id: number) => void;
  onGoToCoach: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  backendOnline,
  onSelectSession,
  onGoToCoach,
}) => {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this workout session? This action cannot be undone.')) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteSession(id);
      await fetchHistory();
    } catch (err: unknown) {
      alert(`Failed to delete session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDuration = (startStr: string, endStr: string): string => {
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    if (isNaN(start) || isNaN(end) || end < start) return '-';
    const totalSec = Math.max(0, Math.round((end - start) / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const formatLocalDateTime = (utcStr: string): string => {
    const d = new Date(utcStr);
    if (isNaN(d.getTime())) return utcStr;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getScoreBadgeClass = (score: number | null): string => {
    if (score === null) return 'bg-slate-800 text-slate-400 border-slate-700';
    if (score >= 85) return 'bg-emerald-950 text-emerald-300 border-emerald-600/50';
    if (score >= 70) return 'bg-amber-950 text-amber-300 border-amber-600/50';
    return 'bg-rose-950 text-rose-300 border-rose-600/50';
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 p-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>📜</span> Workout History
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Browse past workout sessions, performance summaries, and drill down into set fatigue curves.
          </p>
        </div>
        <button
          onClick={fetchHistory}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1.5"
        >
          <span>🔄</span> Refresh
        </button>
      </div>

      {/* Backend Offline Warning */}
      {backendOnline === false && (
        <div className="bg-rose-950/60 border border-rose-600/40 rounded-xl p-3 text-xs text-rose-300 flex items-center gap-2">
          <span>⚠️</span>
          <span>Backend is offline. History cannot be retrieved or updated until the server is reachable.</span>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
          <svg className="animate-spin h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading workouts...</span>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="bg-rose-950/60 border border-rose-700/50 rounded-2xl p-6 text-center flex flex-col items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <p className="text-sm font-semibold text-rose-200">{error}</p>
          <button
            onClick={fetchHistory}
            className="px-4 py-2 bg-rose-800 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && sessions.length === 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center gap-4">
          <span className="text-4xl">🏋️</span>
          <div>
            <h3 className="text-base font-bold text-slate-200">No workouts yet</h3>
            <p className="text-xs text-slate-400 mt-1">
              Start performing squats or bicep curls with the live AI coach to record your first workout!
            </p>
          </div>
          <button
            onClick={onGoToCoach}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition-all flex items-center gap-2"
          >
            <span>🎯</span> Go to Coach
          </button>
        </div>
      )}

      {/* Sessions List Cards */}
      {!loading && !error && sessions.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {sessions.map((sess) => {
            const isDeleting = deletingId === sess.id;
            return (
              <div
                key={sess.id}
                onClick={() => onSelectSession(sess.id)}
                className="bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 transition-all cursor-pointer shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                      {formatLocalDateTime(sess.started_at)}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      ({formatDuration(sess.started_at, sess.ended_at)})
                    </span>
                  </div>

                  {/* Exercises Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    {sess.exercises.map((ex) => (
                      <span
                        key={ex}
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/80 capitalize"
                      >
                        {ex === 'squat' ? '🦵 Squat' : '💪 Bicep Curl'}
                      </span>
                    ))}
                    <span className="text-xs text-slate-400 ml-1">
                      · <strong className="text-slate-200">{sess.total_reps}</strong> reps total
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  {/* Average Score Badge */}
                  <div
                    className={`px-3 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${getScoreBadgeClass(
                      sess.average_score
                    )}`}
                  >
                    <span>Score:</span>
                    <span>{sess.average_score !== null ? sess.average_score.toFixed(1) : '-'}</span>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={(e) => handleDelete(e, sess.id)}
                    disabled={isDeleting}
                    title="Delete workout session"
                    className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/40 transition-colors"
                  >
                    {isDeleting ? (
                      <svg className="animate-spin h-4 w-4 text-rose-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>

                  {/* Chevron Right */}
                  <svg className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
