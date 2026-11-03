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
import { filterByRange, kpis, tzOffsetMinutes } from '../analytics/progress';

interface ProgressViewProps {
  backendOnline: boolean | null;
  onGoToCoach: () => void;
}

type ExerciseFilter = 'all' | 'squat' | 'bicepCurl';
type RangeFilter = '7d' | '30d' | 'all';

export const ProgressView: React.FC<ProgressViewProps> = ({
  backendOnline,
  onGoToCoach,
}) => {
  const [exerciseFilter, setExerciseFilter] = useState<ExerciseFilter>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('30d');
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  // Apply range filter relative to today's date
  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const filteredRows = useMemo(() => {
    return filterByRange(rows, rangeFilter, todayStr);
  }, [rows, rangeFilter, todayStr]);

  const statsKpis = useMemo(() => {
    return kpis(filteredRows);
  }, [filteredRows]);

  // Pivot data by date for Recharts
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

    for (const r of filteredRows) {
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
  }, [filteredRows, exerciseFilter]);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 p-4">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>📈</span> Progress & Analytics
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Track your workout consistency, daily rep volumes, and form improvements over time.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Exercise Filter */}
          <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 text-xs font-semibold">
            <button
              onClick={() => setExerciseFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                exerciseFilter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setExerciseFilter('squat')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                exerciseFilter === 'squat'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Squat
            </button>
            <button
              onClick={() => setExerciseFilter('bicepCurl')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                exerciseFilter === 'bicepCurl'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Curl
            </button>
          </div>

          {/* Range Filter */}
          <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 text-xs font-semibold">
            <button
              onClick={() => setRangeFilter('7d')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                rangeFilter === '7d'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setRangeFilter('30d')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                rangeFilter === '30d'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setRangeFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                rangeFilter === 'all'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Time
            </button>
          </div>
        </div>
      </div>

      {/* Backend Offline Warning */}
      {backendOnline === false && (
        <div className="bg-rose-950/60 border border-rose-600/40 rounded-xl p-3 text-xs text-rose-300 flex items-center gap-2">
          <span>⚠️</span>
          <span>Backend is offline. Progress data cannot be loaded until the server is running.</span>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
          <svg className="animate-spin h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading analytics...</span>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="bg-rose-950/60 border border-rose-700/50 rounded-2xl p-6 text-center flex flex-col items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <p className="text-sm font-semibold text-rose-200">{error}</p>
          <button
            onClick={() => fetchStats(exerciseFilter)}
            className="px-4 py-2 bg-rose-800 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredRows.length === 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center gap-4">
          <span className="text-4xl">📊</span>
          <div>
            <h3 className="text-base font-bold text-slate-200">No workout stats found</h3>
            <p className="text-xs text-slate-400 mt-1">
              {rangeFilter !== 'all'
                ? `No recorded workouts in the selected range (${rangeFilter}). Try changing the filter or record a workout with the coach!`
                : 'No recorded workouts found in your database. Start moving to see your progress!'}
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

      {/* Main Stats Content */}
      {!loading && !error && filteredRows.length > 0 && (
        <div className="flex flex-col gap-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Active Days
              </div>
              <div className="text-2xl font-black text-white mt-1">
                {statsKpis.workoutsCount}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Days with recorded reps</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Total Reps
              </div>
              <div className="text-2xl font-black text-cyan-400 mt-1">
                {statsKpis.totalReps}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Volume completed</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Average Score
              </div>
              <div className="text-2xl font-black text-emerald-400 mt-1">
                {statsKpis.overallAverageScore}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Weighted by reps</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Best Day
              </div>
              <div className="text-base font-bold text-amber-300 mt-2 font-mono truncate">
                {statsKpis.bestDay || '-'}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Highest form score</div>
            </div>
          </div>

          {/* Line Chart: Average Score per Day */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>🎯</span> Average Form Score per Day
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">Scale 0 - 100</span>
            </div>
            <div className="w-full h-64 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    ticks={[0, 25, 50, 75, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
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
                        stroke="#06b6d4"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#06b6d4', strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="bicepCurlScore"
                        name="Curl Avg Score"
                        stroke="#8b5cf6"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    </>
                  ) : (
                    <Line
                      type="monotone"
                      dataKey="score"
                      name={`${exerciseFilter === 'squat' ? 'Squat' : 'Bicep Curl'} Score`}
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar Chart: Reps per Day */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>💪</span> Reps per Day (Volume)
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">Total repetitions</span>
            </div>
            <div className="w-full h-56 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />

                  {exerciseFilter === 'all' ? (
                    <>
                      <Bar dataKey="squatReps" name="Squat Reps" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="bicepCurlReps" name="Curl Reps" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </>
                  ) : (
                    <Bar
                      dataKey="totalReps"
                      name={`${exerciseFilter === 'squat' ? 'Squat' : 'Curl'} Reps`}
                      fill="#6366f1"
                      radius={[4, 4, 0, 0]}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
