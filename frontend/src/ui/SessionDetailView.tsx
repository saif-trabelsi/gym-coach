import React, { useEffect, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  getSession,
  getReplay,
  type SessionRead,
  type RepReplayPayload,
  type ReportLanguage,
  NotFoundError,
} from '../api/client';
import { setSummary, type FatigueTrend } from '../analytics/fatigue';
import { ReportCard } from './ReportCard';
import { ReplayPlayer } from './ReplayPlayer';

interface SessionDetailViewProps {
  sessionId: number;
  onBack: () => void;
  initialLanguage?: ReportLanguage;
}

const METRIC_LABELS: Record<string, string> = {
  minKneeAngle: 'Min Knee (°)',
  maxTorsoLean: 'Torso Lean (°)',
  descentDurationMs: 'Descent (ms)',
  descentStartMs: 'Descent Start (ms)',
  bottomMs: 'Bottom (ms)',
  minElbowAngle: 'Min Elbow (°)',
  maxElbowAngle: 'Max Elbow (°)',
  elbowDrift: 'Elbow Drift',
  bodySway: 'Body Sway',
  minAngle: 'Min Angle (°)',
  maxAngle: 'Max Angle (°)',
  durationMs: 'Duration (ms)',
};

export const SessionDetailView: React.FC<SessionDetailViewProps> = ({
  sessionId,
  onBack,
  initialLanguage = 'en',
}) => {
  const [session, setSession] = useState<SessionRead | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);

  // Worst-rep replay state
  const [activeReplay, setActiveReplay] = useState<{
    repId: number;
    repIndex: number;
    score: number;
    violations: string[];
    exercise: string;
  } | null>(null);
  const [replayLoading, setReplayLoading] = useState<boolean>(false);
  const [replayError, setReplayError] = useState<{
    type: 'not_found' | 'network';
    message: string;
  } | null>(null);
  const [loadedReplayPayload, setLoadedReplayPayload] =
    useState<RepReplayPayload | null>(null);
  const replayCacheRef = useRef<Map<number, RepReplayPayload>>(new Map());

  const handleOpenReplay = async (
    rep: { id: number; index: number; score: number; violations?: string[] },
    exercise: string
  ) => {
    setActiveReplay({
      repId: rep.id,
      repIndex: rep.index,
      score: rep.score,
      violations: rep.violations || [],
      exercise,
    });
    setReplayError(null);

    const cached = replayCacheRef.current.get(rep.id);
    if (cached) {
      setLoadedReplayPayload(cached);
      setReplayLoading(false);
      return;
    }

    setReplayLoading(true);
    setLoadedReplayPayload(null);
    try {
      const data = await getReplay(rep.id);
      replayCacheRef.current.set(rep.id, data);
      setLoadedReplayPayload(data);
    } catch (err: unknown) {
      if (err instanceof NotFoundError) {
        setReplayError({
          type: 'not_found',
          message: 'Replay unavailable for this rep',
        });
      } else {
        setReplayError({
          type: 'network',
          message: 'Backend unreachable. Failed to load replay.',
        });
      }
    } finally {
      setReplayLoading(false);
    }
  };

  const handleRetryReplay = () => {
    if (activeReplay) {
      handleOpenReplay(
        {
          id: activeReplay.repId,
          index: activeReplay.repIndex,
          score: activeReplay.score,
          violations: activeReplay.violations,
        },
        activeReplay.exercise
      );
    }
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setIsNotFound(false);

    async function load() {
      try {
        const data = await getSession(sessionId);
        if (isMounted) {
          setSession(data);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        if (err instanceof NotFoundError) {
          setIsNotFound(true);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load session details');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [sessionId]);

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

  const getTrendBadge = (trend: FatigueTrend, drop: number | null) => {
    if (drop === null || trend === 'insufficient') {
      return {
        label: 'Not enough reps for a fatigue trend',
        className: 'bg-slate-800 text-slate-400 border-slate-700',
        icon: 'ℹ️',
      };
    }
    if (trend === 'declining') {
      return {
        label: `Declining (+${drop.toFixed(1)})`,
        className: 'bg-rose-950 text-rose-300 border-rose-800/60',
        icon: '↓',
      };
    }
    if (trend === 'improving') {
      return {
        label: `Improving (${drop.toFixed(1)})`,
        className: 'bg-emerald-950 text-emerald-300 border-emerald-800/60',
        icon: '↑',
      };
    }
    return {
      label: `Stable (${drop >= 0 ? '+' : ''}${drop.toFixed(1)})`,
      className: 'bg-slate-800 text-slate-300 border-slate-700',
      icon: '→',
    };
  };

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto py-24 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
        <svg className="animate-spin h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span>Loading workout details...</span>
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="w-full max-w-4xl mx-auto p-6 flex flex-col items-center gap-4 text-center">
        <span className="text-4xl">🔍</span>
        <h2 className="text-lg font-bold text-white">Workout Not Found</h2>
        <p className="text-xs text-slate-400">
          We could not find workout session #{sessionId}. It may have been deleted.
        </p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow transition-all flex items-center gap-1.5"
        >
          <span>←</span> Back to History
        </button>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="w-full max-w-4xl mx-auto p-6 flex flex-col items-center gap-4 text-center">
        <span className="text-4xl">⚠️</span>
        <h2 className="text-lg font-bold text-rose-300">Failed to Load Workout</h2>
        <p className="text-xs text-slate-400">{error || 'Unknown error occurred'}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all"
        >
          ← Back to History
        </button>
      </div>
    );
  }

  // Calculate session totals
  const allReps = session.sets.flatMap((s) => s.reps);
  const totalReps = allReps.length;
  const overallAvg =
    totalReps > 0
      ? (allReps.reduce((sum, r) => sum + r.score, 0) / totalReps).toFixed(1)
      : '0.0';

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 p-4">
      {/* Back button and Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <button
          onClick={onBack}
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
        >
          <span>←</span> Back to History
        </button>
        <span className="text-xs text-slate-500 font-mono">Session #{session.id}</span>
      </div>

      {/* Session Overview Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🏋️‍♂️</span> Workout from {formatLocalDateTime(session.started_at)}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Duration: <strong className="text-slate-200 font-mono">{formatDuration(session.started_at, session.ended_at)}</strong> · Sets:{' '}
            <strong className="text-slate-200">{session.sets.length}</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-800/80 border border-slate-700/80 px-3.5 py-2 rounded-xl text-center">
            <div className="text-[10px] uppercase font-semibold text-slate-400">Total Reps</div>
            <div className="text-base font-bold text-cyan-400">{totalReps}</div>
          </div>
          <div className="bg-slate-800/80 border border-slate-700/80 px-3.5 py-2 rounded-xl text-center">
            <div className="text-[10px] uppercase font-semibold text-slate-400">Avg Score</div>
            <div className="text-base font-bold text-emerald-400">{overallAvg}</div>
          </div>
        </div>
      </div>

      {/* AI Coaching Report Card */}
      <ReportCard sessionId={session.id} initialLanguage={initialLanguage} />

      {/* Sets Detail */}
      <div className="flex flex-col gap-8">
        {session.sets.map((wSet, setIdx) => {
          const summary = setSummary(wSet);
          const trendBadge = getTrendBadge(summary.trend, summary.formDrop);

          // Dynamic metric columns for this set
          const metricKeys = Array.from(
            new Set(wSet.reps.flatMap((r) => Object.keys(r.metrics || {})))
          );

          // Prepare chart data
          const chartData = wSet.reps.map((r) => ({
            index: r.index,
            score: r.score,
            violations: r.violations,
          }));

          const repsWithReplay = wSet.reps.filter((r) => r.has_replay);
          const worstReplayRep =
            repsWithReplay.length > 0
              ? repsWithReplay.reduce(
                  (worst, cur) => (cur.score < worst.score ? cur : worst),
                  repsWithReplay[0]
                )
              : null;

          return (
            <div
              key={wSet.id || setIdx}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-5"
            >
              {/* Set Title */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">
                    {wSet.exercise === 'squat' ? '🦵' : '💪'}
                  </span>
                  <h3 className="text-base font-bold text-white capitalize">
                    Set {setIdx + 1}: {wSet.exercise === 'squat' ? 'Squat' : 'Bicep Curl'}
                  </h3>
                </div>
                <span className="text-xs text-slate-500 font-mono">
                  {formatDuration(wSet.started_at, wSet.ended_at)}
                </span>
              </div>

              {/* Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-800/60 border border-slate-700/60 p-2.5 rounded-xl text-center">
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Reps</div>
                  <div className="text-sm font-bold text-slate-100">{summary.reps}</div>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/60 p-2.5 rounded-xl text-center">
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Average</div>
                  <div className="text-sm font-bold text-slate-100">{summary.averageScore}</div>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/60 p-2.5 rounded-xl text-center">
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Best</div>
                  <div className="text-sm font-bold text-emerald-400">{summary.bestScore}</div>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/60 p-2.5 rounded-xl text-center">
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Worst</div>
                  <div className="text-sm font-bold text-rose-400">{summary.worstScore}</div>
                </div>
                <div className="col-span-2 sm:col-span-1 bg-slate-800/60 border border-slate-700/60 p-2.5 rounded-xl text-center flex flex-col justify-center items-center">
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Trend</div>
                  <span
                    className={`mt-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${trendBadge.className}`}
                  >
                    <span>{trendBadge.icon}</span>
                    <span className="truncate">{trendBadge.label}</span>
                  </span>
                </div>
              </div>

              {/* Top Violations Strip (if any) */}
              {summary.ranking.length > 0 && (
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-400">Top Form Faults:</span>
                  {summary.ranking.slice(0, 3).map((item) => (
                    <span
                      key={item.rule}
                      className="px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-900/40 font-mono text-[11px]"
                    >
                      {item.rule} ({item.count})
                    </span>
                  ))}
                </div>
              )}

              {/* Fatigue Curve Line Chart */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold">Fatigue Curve (Score per Rep)</span>
                  <span className="text-[11px] text-slate-500 font-mono">Dashed line = Set Average ({summary.averageScore})</span>
                </div>
                <div className="w-full h-48 bg-slate-950/60 border border-slate-800 rounded-xl p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                      <XAxis
                        dataKey="index"
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        label={{ value: 'Rep #', position: 'insideBottomRight', offset: -5, fill: '#64748b', fontSize: 10 }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        ticks={[0, 25, 50, 75, 100]}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-lg shadow-xl text-xs font-mono">
                                <p className="font-bold text-white mb-0.5">Rep #{data.index}</p>
                                <p className="text-cyan-300">
                                  Score: <strong className="text-white">{data.score}</strong>
                                </p>
                                {data.violations && data.violations.length > 0 ? (
                                  <div className="mt-1 text-rose-300">
                                    <span className="font-semibold text-rose-400 font-sans">Violations:</span>
                                    <ul className="list-disc list-inside mt-0.5">
                                      {data.violations.map((v: string, idx: number) => (
                                        <li key={idx}>{v}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : (
                                  <p className="text-emerald-400 mt-1 font-sans">✓ Perfect form</p>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <ReferenceLine
                        y={summary.averageScore}
                        stroke="#94a3b8"
                        strokeDasharray="4 4"
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#818cf8', strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: '#38bdf8' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Worst rep replay button */}
              {worstReplayRep && (
                <div className="flex items-center justify-start">
                  <button
                    type="button"
                    onClick={() => handleOpenReplay(worstReplayRep, wSet.exercise)}
                    className="px-3.5 py-1.5 bg-rose-950/80 hover:bg-rose-900/80 text-rose-200 border border-rose-800/60 rounded-xl text-xs font-semibold shadow transition-all flex items-center gap-1.5"
                  >
                    <span>🎬</span>
                    <span>Replay worst rep</span>
                  </button>
                </div>
              )}

              {/* Inline replay accordion */}
              {activeReplay && wSet.reps.some((r) => r.id === activeReplay.repId) && (
                <div className="w-full bg-slate-900/50 border border-slate-800/80 rounded-2xl p-4 my-1">
                  {replayLoading && (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                      <svg
                        className="animate-spin h-5 w-5 text-indigo-400"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span>Loading replay...</span>
                    </div>
                  )}

                  {replayError && !replayLoading && (
                    <div className="py-4 flex flex-col items-center gap-2 text-center text-xs">
                      <span className="text-xl">⚠️</span>
                      <p className="text-rose-300 font-semibold">
                        {replayError.message}
                      </p>
                      {replayError.type === 'network' && (
                        <button
                          type="button"
                          onClick={handleRetryReplay}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}

                  {loadedReplayPayload && !replayLoading && !replayError && (
                    <ReplayPlayer
                      replay={loadedReplayPayload}
                      repIndex={activeReplay.repIndex}
                      score={activeReplay.score}
                      violations={activeReplay.violations}
                      exercise={activeReplay.exercise}
                      onClose={() => setActiveReplay(null)}
                    />
                  )}
                </div>
              )}

              {/* Rep Table with Dynamic Metric Columns */}
              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 border-b border-slate-700/80 text-slate-400 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Rep #</th>
                      <th className="py-2.5 px-3">Score</th>
                      <th className="py-2.5 px-3">Violations</th>
                      {metricKeys.map((key) => (
                        <th key={key} className="py-2.5 px-3">
                          {METRIC_LABELS[key] || key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {wSet.reps.map((rep) => (
                      <tr key={rep.id || rep.index} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-semibold text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <span>#{rep.index}</span>
                            {rep.has_replay && (
                              <button
                                type="button"
                                onClick={() => handleOpenReplay(rep, wSet.exercise)}
                                title="Replay rep"
                                aria-label={`Replay rep ${rep.index}`}
                                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-slate-700 hover:border-indigo-500 transition-colors text-[10px] font-sans"
                              >
                                ▶
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                              rep.score >= 85
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                                : rep.score >= 70
                                ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                                : 'bg-rose-950 text-rose-300 border border-rose-700/60'
                            }`}
                          >
                            {rep.score}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-sans">
                          {rep.violations && rep.violations.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {rep.violations.map((v, vIdx) => (
                                <span
                                  key={vIdx}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-950 text-rose-300 border border-rose-800/40"
                                >
                                  {v}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-emerald-400 text-[11px]">✓ Clean</span>
                          )}
                        </td>
                        {metricKeys.map((key) => {
                          const val = rep.metrics ? rep.metrics[key] : undefined;
                          const displayVal =
                            typeof val === 'number'
                              ? val.toFixed(1)
                              : val !== undefined && val !== null
                              ? String(val)
                              : '-';
                          return (
                            <td key={key} className="py-2 px-3 text-slate-300">
                              {displayVal}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
