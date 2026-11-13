import React, { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { getProgress, type ProgressRow } from '../api/client';
import { tzOffsetMinutes } from '../analytics/progress';
import { computeProgressWithDeltas } from '../analytics/progressDeltas';
import { scoreTone } from '../design/scoreTone';
import { getChartTheme } from './chartTheme';
import { Card } from './kit/Card';
import { Badge } from './kit/Badge';
import { Button } from './kit/Button';
import { StatTile } from './kit/StatTile';
import { Skeleton } from './kit/Skeleton';
import { EmptyState } from './kit/EmptyState';
import { SegmentedControl, type SegmentedOption } from './kit/SegmentedControl';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Dumbbell,
  Flame,
  Calendar,
  Layers,
  ArrowRight,
  RotateCcw,
  BarChart3,
  Award,
} from 'lucide-react';

interface ProgressViewProps {
  backendOnline: boolean | null;
  onGoToCoach: () => void;
}

export type ExerciseFilter = 'all' | 'squat' | 'bicepCurl';
export type RangeFilter = '7d' | '30d' | 'all';

export const ProgressView: React.FC<ProgressViewProps> = ({
  backendOnline,
  onGoToCoach,
}) => {
  const [exerciseFilter, setExerciseFilter] = useState<ExerciseFilter>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('30d');
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const chartTheme = useMemo(() => getChartTheme(), []);

  const fetchStats = async (exercise: ExerciseFilter) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProgress({
        exercise: exercise === 'all' ? undefined : exercise,
        tzOffsetMinutes: tzOffsetMinutes(),
      });
      setRows(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch progress stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(exerciseFilter);
  }, [exerciseFilter]);

  // Compute metrics and deltas vs previous equal period
  const metrics = useMemo(() => {
    return computeProgressWithDeltas(rows, rangeFilter);
  }, [rows, rangeFilter]);

  // Prepare chart data pivoted by date for Recharts
  const chartData = useMemo(() => {
    const byDate: Record<
      string,
      {
        date: string;
        squatScore?: number;
        bicepCurlScore?: number;
        score?: number;
        totalReps: number;
        squatReps?: number;
        bicepCurlReps?: number;
      }
    > = {};

    for (const r of metrics.currentRows) {
      if (!byDate[r.date]) {
        byDate[r.date] = {
          date: r.date,
          totalReps: 0,
        };
      }
      byDate[r.date].totalReps += r.reps;

      if (exerciseFilter === 'all') {
        if (r.exercise === 'squat') {
          byDate[r.date].squatScore = r.average_score;
          byDate[r.date].squatReps = r.reps;
        } else if (r.exercise === 'bicepCurl') {
          byDate[r.date].bicepCurlScore = r.average_score;
          byDate[r.date].bicepCurlReps = r.reps;
        }
      } else {
        byDate[r.date].score = r.average_score;
      }
    }

    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [metrics.currentRows, exerciseFilter]);

  const rangeOptions: SegmentedOption<RangeFilter>[] = [
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: 'all', label: 'All Time' },
  ];

  const exerciseOptions: SegmentedOption<ExerciseFilter>[] = [
    { value: 'all', label: 'All Exercises' },
    { value: 'squat', label: 'Squat' },
    { value: 'bicepCurl', label: 'Bicep Curl' },
  ];

  const formatDeltaSubValue = (
    delta: number | null,
    pct: number | null,
    suffix = ''
  ) => {
    if (delta === null) return null;
    if (delta === 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-xs text-[var(--text-muted)] font-mono">
          <Minus className="w-3 h-3" /> 0{suffix}
        </span>
      );
    }
    const isPos = delta > 0;
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-xs font-mono font-semibold ${
          isPos ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'
        }`}
      >
        {isPos ? (
          <TrendingUp className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3" />
        )}
        {isPos ? `+${delta}` : delta}
        {suffix}
        {pct !== null && ` (${isPos ? `+${pct}` : pct}%)`}
      </span>
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 p-4">
      {/* View Header & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
              Progress & Analytics
            </h1>
            <Badge variant="neutral" size="sm">
              {rangeFilter === '7d' ? 'Last 7 Days' : rangeFilter === '30d' ? 'Last 30 Days' : 'All Time'}
            </Badge>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Track workout consistency, volume progression, and form improvement curves over time.
          </p>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <SegmentedControl
            value={exerciseFilter}
            onChange={(val) => setExerciseFilter(val)}
            options={exerciseOptions}
            size="sm"
            ariaLabel="Filter by exercise"
          />
          <SegmentedControl
            value={rangeFilter}
            onChange={(val) => setRangeFilter(val)}
            options={rangeOptions}
            size="sm"
            ariaLabel="Filter by date range"
          />
        </div>
      </div>

      {/* Backend Offline Warning */}
      {backendOnline === false && (
        <div
          role="alert"
          className="bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-[var(--status-danger)] rounded-[var(--radius-lg)] p-3 text-xs flex items-center gap-2"
        >
          <span>The backend is currently unreachable. Progress analytics may be incomplete.</span>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <Card className="p-6 text-center flex flex-col items-center gap-3 border-[var(--status-danger-border)]">
          <p className="text-sm font-semibold text-[var(--status-danger)]">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchStats(exerciseFilter)}
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Retry
          </Button>
        </Card>
      )}

      {/* Loading Skeleton State */}
      {loading && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {[1, 2, 3, 4].map((n) => (
              <Card key={n} className="p-4 flex flex-col gap-2">
                <Skeleton variant="text" width={80} height={14} />
                <Skeleton variant="text" width={60} height={28} />
                <Skeleton variant="text" width={100} height={12} />
              </Card>
            ))}
          </div>
          <Card className="p-5 h-64 flex flex-col gap-4">
            <Skeleton variant="text" width={180} height={20} />
            <Skeleton variant="rounded" height={180} />
          </Card>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && metrics.currentRows.length === 0 && (
        <EmptyState
          icon={<BarChart3 className="w-8 h-8 text-[var(--accent)]" />}
          title="No workout data found"
          description={
            rangeFilter !== 'all'
              ? `No workouts recorded in the selected range (${rangeFilter === '7d' ? 'Last 7 days' : 'Last 30 days'}). Try expanding the filter or record a workout with the coach!`
              : 'No recorded workouts found in your workout history. Start a session to build your progress trends!'
          }
          action={
            <Button
              variant="primary"
              size="md"
              onClick={onGoToCoach}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Start a Workout
            </Button>
          }
        />
      )}

      {/* Main Analytics Content */}
      {!loading && !error && metrics.currentRows.length > 0 && (
        <div className="flex flex-col gap-6">
          {/* KPI Tiles with deltas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <StatTile
              label="Total Reps"
              value={metrics.totalReps.current}
              subValue={formatDeltaSubValue(metrics.totalReps.delta, metrics.totalReps.pctChange)}
              icon={<Dumbbell className="w-4 h-4 text-[var(--accent)]" />}
            />
            <StatTile
              label="Avg Score"
              value={metrics.averageScore.current}
              subValue={formatDeltaSubValue(metrics.averageScore.delta, null, ' pts')}
              tone={scoreTone(metrics.averageScore.current)}
              icon={<Award className="w-4 h-4 text-emerald-400" />}
            />
            <StatTile
              label="Active Days"
              value={metrics.activeDays.current}
              subValue={formatDeltaSubValue(metrics.activeDays.delta, null, ' days')}
              icon={<Calendar className="w-4 h-4 text-cyan-400" />}
            />
            <StatTile
              label="Focus"
              value={
                metrics.mostTrained === 'squat'
                  ? 'Squat'
                  : metrics.mostTrained === 'bicepCurl'
                  ? 'Bicep Curl'
                  : '-'
              }
              subValue={
                metrics.mostTrained ? (
                  <span className="text-[10px] text-[var(--text-muted)] font-sans">
                    Most trained exercise
                  </span>
                ) : null
              }
              icon={
                metrics.mostTrained === 'squat' ? (
                  <Flame className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Layers className="w-4 h-4 text-cyan-400" />
                )
              }
            />
          </div>

          {/* Line Chart: Average Form Score per Day */}
          <Card className="p-5 shadow-sm flex flex-col gap-3 border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
                Average Form Score per Day
              </h2>
              <span className="text-[11px] text-[var(--text-muted)] font-mono">Scale 0 - 100</span>
            </div>
            <div className="w-full h-64 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    stroke={chartTheme.axisText}
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke={chartTheme.axisText}
                    fontSize={11}
                    tickLine={false}
                    ticks={[0, 25, 50, 75, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartTheme.tooltipBg,
                      borderColor: chartTheme.tooltipBorder,
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />

                  {exerciseFilter === 'all' ? (
                    <>
                      <Line
                        type="monotone"
                        dataKey="squatScore"
                        name="Squat Avg Score"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="bicepCurlScore"
                        name="Curl Avg Score"
                        stroke="#06b6d4"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#06b6d4', strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    </>
                  ) : (
                    <Line
                      type="monotone"
                      dataKey="score"
                      name={`${exerciseFilter === 'squat' ? 'Squat' : 'Bicep Curl'} Score`}
                      stroke={chartTheme.accent}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: chartTheme.accent, strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Bar Chart: Reps per Day */}
          <Card className="p-5 shadow-sm flex flex-col gap-3 border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-[var(--accent)]" />
                Reps per Day (Volume)
              </h2>
              <span className="text-[11px] text-[var(--text-muted)] font-mono">Total repetitions</span>
            </div>
            <div className="w-full h-56 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    stroke={chartTheme.axisText}
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke={chartTheme.axisText}
                    fontSize={11}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartTheme.tooltipBg,
                      borderColor: chartTheme.tooltipBorder,
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />

                  {exerciseFilter === 'all' ? (
                    <>
                      <Bar dataKey="squatReps" name="Squat Reps" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="bicepCurlReps" name="Curl Reps" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    </>
                  ) : (
                    <Bar
                      dataKey="totalReps"
                      name={`${exerciseFilter === 'squat' ? 'Squat' : 'Curl'} Reps`}
                      fill={chartTheme.accent}
                      radius={[4, 4, 0, 0]}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
