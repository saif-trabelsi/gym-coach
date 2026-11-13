import React, { useEffect, useRef, useState, useMemo } from 'react';
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
import { formatLocalDateTime, formatDuration } from '../analytics/dates';
import { scoreTone } from '../design/scoreTone';
import { getChartTheme } from './chartTheme';
import { ReportCard } from './ReportCard';
import { ReplayPlayer } from './ReplayPlayer';
import { Card } from './kit/Card';
import { Button } from './kit/Button';
import { Badge } from './kit/Badge';
import { ScoreRing } from './kit/ScoreRing';
import { StatTile } from './kit/StatTile';
import { Skeleton } from './kit/Skeleton';
import { EmptyState } from './kit/EmptyState';
import { Spinner } from './kit/Spinner';
import {
  ArrowLeft,
  Dumbbell,
  Flame,
  Clock,
  Layers,
  Play,
  RotateCcw,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Minus,
  Printer,
} from 'lucide-react';

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

  // Theme-aware chart colors from tokens
  const chartTheme = useMemo(() => getChartTheme(), []);

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

  const getTrendBadge = (trend: FatigueTrend, drop: number | null) => {
    if (drop === null || trend === 'insufficient') {
      return (
        <Badge variant="neutral" size="sm">
          <Minus className="w-3 h-3 me-1 text-[var(--text-muted)]" />
          <span>Not enough reps</span>
        </Badge>
      );
    }
    if (trend === 'declining') {
      return (
        <Badge variant="danger" size="sm">
          <TrendingDown className="w-3 h-3 me-1 text-[var(--status-danger)]" />
          <span>Declining (+{drop.toFixed(1)})</span>
        </Badge>
      );
    }
    if (trend === 'improving') {
      return (
        <Badge variant="success" size="sm">
          <TrendingUp className="w-3 h-3 me-1 text-[var(--status-success)]" />
          <span>Improving ({drop.toFixed(1)})</span>
        </Badge>
      );
    }
    return (
      <Badge variant="neutral" size="sm">
        <Minus className="w-3 h-3 me-1 text-[var(--text-muted)]" />
        <span>Stable ({drop >= 0 ? '+' : ''}{drop.toFixed(1)})</span>
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 p-4">
        <div className="flex items-center gap-3">
          <Skeleton variant="rounded" width={110} height={36} />
          <Skeleton variant="text" width={160} height={24} />
        </div>
        <Card className="p-6 flex flex-col gap-4">
          <Skeleton variant="text" width={240} height={28} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
            {[1, 2, 3, 4].map((n) => (
              <Skeleton key={n} variant="rounded" height={64} />
            ))}
          </div>
        </Card>
        <Card className="p-6 h-64 flex items-center justify-center">
          <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
            <Spinner size="md" />
            <span>Loading workout details...</span>
          </div>
        </Card>
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4 flex flex-col items-center">
        <EmptyState
          icon={<AlertCircle className="w-8 h-8 text-[var(--status-warning)]" />}
          title="Workout Not Found"
          description={`We could not find workout session #${sessionId}. It may have been deleted.`}
          action={
            <Button
              variant="primary"
              size="md"
              onClick={onBack}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back to History
            </Button>
          }
        />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4 flex flex-col items-center">
        <EmptyState
          icon={<AlertCircle className="w-8 h-8 text-[var(--status-danger)]" />}
          title="Failed to Load Workout"
          description={error || 'An unexpected error occurred while loading session details.'}
          action={
            <Button
              variant="secondary"
              size="md"
              onClick={onBack}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back to History
            </Button>
          }
        />
      </div>
    );
  }

  // Calculate session totals
  const allReps = session.sets.flatMap((s) => s.reps);
  const totalReps = allReps.length;
  const overallAvgNum =
    totalReps > 0
      ? allReps.reduce((sum, r) => sum + r.score, 0) / totalReps
      : 0;
  const overallAvg = overallAvgNum > 0 ? overallAvgNum.toFixed(1) : '0.0';
  const overallScoreRounded = Math.round(overallAvgNum);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 p-4">
      {/* Top Navigation & Session ID */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onBack}
            leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
          >
            Back to History
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.print()}
            leftIcon={<Printer className="w-3.5 h-3.5" />}
            className="hidden sm:inline-flex"
            title="Print or save session report as PDF"
          >
            Print / Save PDF
          </Button>
        </div>
        <Badge variant="neutral" size="sm">
          Session #{session.id}
        </Badge>
      </div>

      {/* Session Overview Header Card */}
      <Card className="p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          {totalReps > 0 ? (
            <ScoreRing score={overallScoreRounded} size={76} strokeWidth={7} role="meter" />
          ) : (
            <div className="w-[76px] h-[76px] rounded-full border border-[var(--border-subtle)] flex items-center justify-center font-mono text-sm text-[var(--text-muted)]">
              --
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-[var(--text-primary)] tracking-tight">
                Workout Summary
              </h1>
              <Badge variant="neutral" size="sm">
                {session.sets.length} set{session.sets.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1 flex items-center gap-1.5">
              <span>{formatLocalDateTime(session.started_at)}</span>
              <span>·</span>
              <span className="font-mono text-[var(--text-primary)] font-semibold">
                {formatDuration(session.started_at, session.ended_at)}
              </span>
            </p>
          </div>
        </div>

        {/* Overview Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t md:border-t-0 md:border-s border-[var(--border-subtle)] pt-4 md:pt-0 md:ps-6">
          <StatTile
            label="Total Reps"
            value={totalReps}
            icon={<Dumbbell className="w-4 h-4 text-[var(--accent)]" />}
          />
          <StatTile
            label="Avg Score"
            value={overallAvg}
            tone={totalReps > 0 ? scoreTone(overallAvgNum) : 'default'}
          />
          <StatTile
            label="Total Sets"
            value={session.sets.length}
            icon={<Layers className="w-4 h-4 text-cyan-400" />}
          />
        </div>
      </Card>

      {/* AI Coaching Report Section */}
      <ReportCard sessionId={session.id} initialLanguage={initialLanguage} />

      {/* Workout Sets Section */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--accent)]" />
            Workout Sets ({session.sets.length})
          </h2>
          <div className="flex-1 h-px bg-[var(--border-subtle)]" />
        </div>

        {session.sets.map((wSet, setIdx) => {
          const summary = setSummary(wSet);

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
            <Card
              key={wSet.id || setIdx}
              className="p-5 shadow-sm flex flex-col gap-5 border-[var(--border-subtle)]"
            >
              {/* Set Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2.5">
                  <Badge variant="neutral" size="sm">
                    {wSet.exercise === 'squat' ? (
                      <Flame className="w-3.5 h-3.5 text-emerald-400 inline me-1" />
                    ) : (
                      <Dumbbell className="w-3.5 h-3.5 text-cyan-400 inline me-1" />
                    )}
                    {wSet.exercise === 'squat' ? 'Squat' : 'Bicep Curl'}
                  </Badge>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    Set {setIdx + 1}
                  </h3>
                </div>

                <span className="text-xs text-[var(--text-secondary)] font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                  {formatDuration(wSet.started_at, wSet.ended_at)}
                </span>
              </div>

              {/* Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <StatTile label="Reps" value={summary.reps} />
                <StatTile
                  label="Average"
                  value={summary.averageScore}
                  tone={scoreTone(summary.averageScore)}
                />
                <StatTile
                  label="Best"
                  value={summary.bestScore}
                  tone={scoreTone(summary.bestScore)}
                />
                <StatTile
                  label="Worst"
                  value={summary.worstScore}
                  tone={scoreTone(summary.worstScore)}
                />
                <div className="col-span-2 sm:col-span-1 bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] p-3 rounded-[var(--radius-xl)] flex flex-col justify-center items-center text-center">
                  <span className="text-[10px] uppercase font-semibold text-[var(--text-muted)] tracking-wider">
                    Trend
                  </span>
                  <div className="mt-1">{getTrendBadge(summary.trend, summary.formDrop)}</div>
                </div>
              </div>

              {/* Top Form Faults (if any) */}
              {summary.ranking.length > 0 && (
                <div className="bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] p-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-[var(--text-secondary)]">Top Form Faults:</span>
                  {summary.ranking.slice(0, 3).map((item) => (
                    <Badge key={item.rule} variant="danger" size="sm">
                      {item.rule} ({item.count})
                    </Badge>
                  ))}
                </div>
              )}

              {/* Fatigue Curve Line Chart */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span className="font-bold text-[var(--text-primary)]">
                    Fatigue Curve (Score per Rep)
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] font-mono">
                    Dashed line = Set Average ({summary.averageScore})
                  </span>
                </div>
                <div className="w-full h-52 bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} opacity={0.5} />
                      <XAxis
                        dataKey="index"
                        stroke={chartTheme.axisText}
                        fontSize={11}
                        tickLine={false}
                        label={{
                          value: 'Rep #',
                          position: 'insideBottomRight',
                          offset: -5,
                          fill: chartTheme.axisText,
                          fontSize: 10,
                        }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        stroke={chartTheme.axisText}
                        fontSize={11}
                        tickLine={false}
                        ticks={[0, 25, 50, 75, 100]}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] p-3 rounded-[var(--radius-lg)] shadow-xl text-xs font-mono">
                                <p className="font-bold text-[var(--text-primary)] mb-1">
                                  Rep #{data.index}
                                </p>
                                <p className="text-[var(--accent)] font-semibold">
                                  Score: <strong className="text-[var(--text-primary)]">{data.score}</strong>
                                </p>
                                {data.violations && data.violations.length > 0 ? (
                                  <div className="mt-1.5 text-[var(--status-danger)]">
                                    <span className="font-semibold font-sans">Violations:</span>
                                    <ul className="list-disc list-inside mt-0.5">
                                      {data.violations.map((v: string, idx: number) => (
                                        <li key={idx}>{v}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : (
                                  <p className="text-[var(--status-success)] mt-1 font-sans">✓ Perfect form</p>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <ReferenceLine
                        y={summary.averageScore}
                        stroke={chartTheme.axisText}
                        strokeDasharray="4 4"
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke={chartTheme.accent}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: chartTheme.accent, strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: chartTheme.accent }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Worst rep replay button */}
              {worstReplayRep && (
                <div className="flex items-center justify-start">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenReplay(worstReplayRep, wSet.exercise)}
                    leftIcon={<Play className="w-3.5 h-3.5 text-[var(--status-danger)]" />}
                  >
                    <span>Replay worst rep</span>
                  </Button>
                </div>
              )}

              {/* Inline replay accordion */}
              {activeReplay && wSet.reps.some((r) => r.id === activeReplay.repId) && (
                <div className="w-full bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-2xl)] p-4 my-1">
                  {replayLoading && (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-[var(--text-secondary)] text-xs">
                      <Spinner size="md" />
                      <span>Loading replay...</span>
                    </div>
                  )}

                  {replayError && !replayLoading && (
                    <div className="py-4 flex flex-col items-center gap-2 text-center text-xs">
                      <AlertCircle className="w-6 h-6 text-[var(--status-danger)]" />
                      <p className="text-[var(--status-danger)] font-semibold">
                        {replayError.message}
                      </p>
                      {replayError.type === 'network' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleRetryReplay}
                          leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                        >
                          Retry
                        </Button>
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
              <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-[var(--radius-xl)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold">
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
                  <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                    {wSet.reps.map((rep) => {
                      const tone = scoreTone(rep.score);
                      return (
                        <tr
                          key={rep.id || rep.index}
                          className="hover:bg-[var(--bg-surface-elevated)]/60 transition-colors"
                        >
                          <td className="py-2.5 px-3 font-semibold text-[var(--text-primary)]">
                            <div className="flex items-center gap-2">
                              <span>#{rep.index}</span>
                              {rep.has_replay && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReplay(rep, wSet.exercise)}
                                  title="Replay rep"
                                  aria-label={`Replay rep ${rep.index}`}
                                  className="p-1 rounded-md bg-[var(--bg-surface)] hover:bg-[var(--accent)] text-[var(--accent)] hover:text-[var(--accent-contrast)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant={
                                tone === 'good'
                                  ? 'success'
                                  : tone === 'warn'
                                  ? 'warning'
                                  : 'danger'
                              }
                              size="sm"
                            >
                              {rep.score}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            {rep.violations && rep.violations.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {rep.violations.map((v, vIdx) => (
                                  <Badge key={vIdx} variant="danger" size="sm">
                                    {v}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[var(--status-success)] text-xs font-medium">
                                ✓ Clean
                              </span>
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
                              <td key={key} className="py-2.5 px-3 text-[var(--text-secondary)]">
                                {displayVal}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
