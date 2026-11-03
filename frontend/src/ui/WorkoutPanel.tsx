import React from 'react';
import type { RecordedSet, RecordedRep } from '../recording/workoutRecorder';

export interface SaveErrorState {
  type: 'network' | 'validation' | 'server';
  message: string;
}

export interface SaveSuccessState {
  setsCount: number;
  totalReps: number;
  averageScore: number;
}

interface WorkoutPanelProps {
  backendOnline: boolean | null;
  currentSet: { exercise: string; reps: RecordedRep[]; averageScore: number } | null;
  finishedSets: RecordedSet[];
  totals: { totalReps: number; averageScore: number };
  isSaving: boolean;
  saveError: SaveErrorState | null;
  saveSuccess: SaveSuccessState | null;
  onEndSet: () => void;
  onFinishAndSave: () => void;
  onRetrySave: () => void;
  onDiscard: () => void;
  onDismissSuccess: () => void;
}

export const WorkoutPanel: React.FC<WorkoutPanelProps> = ({
  backendOnline,
  currentSet,
  finishedSets,
  totals,
  isSaving,
  saveError,
  saveSuccess,
  onEndSet,
  onFinishAndSave,
  onRetrySave,
  onDiscard,
  onDismissSuccess,
}) => {
  const hasActiveSet = currentSet !== null && currentSet.reps.length > 0;
  const canSave = totals.totalReps > 0 && !isSaving;
  const canDiscard = (totals.totalReps > 0 || finishedSets.length > 0) && !isSaving;

  const handleDiscardClick = () => {
    if (window.confirm('Are you sure you want to discard this workout? All recorded reps and sets will be lost.')) {
      onDiscard();
    }
  };

  return (
    <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
      {/* Header with Title and Backend Status Badge */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏋️‍♂️</span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100">
            Workout Session
          </h2>
          {totals.totalReps > 0 && (
            <span className="bg-indigo-950 text-indigo-300 border border-indigo-700/60 text-xs px-2.5 py-0.5 rounded-full font-semibold">
              {totals.totalReps} total rep{totals.totalReps === 1 ? '' : 's'} · {totals.averageScore} avg
            </span>
          )}
        </div>

        {/* Backend Status Badge */}
        <div
          data-testid="backend-status-badge"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
            backendOnline === true
              ? 'bg-emerald-950/70 text-emerald-300 border-emerald-600/50'
              : backendOnline === false
              ? 'bg-rose-950/70 text-rose-300 border-rose-600/50'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              backendOnline === true
                ? 'bg-emerald-400 animate-pulse'
                : backendOnline === false
                ? 'bg-rose-500'
                : 'bg-slate-500'
            }`}
          />
          <span>{backendOnline === true ? 'Backend online' : backendOnline === false ? 'Backend offline' : 'Checking...'}</span>
        </div>
      </div>

      {/* Success Banner */}
      {saveSuccess && (
        <div className="bg-emerald-950/70 border border-emerald-500/50 rounded-xl p-4 flex items-center justify-between text-emerald-200">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <p className="font-semibold text-sm">Workout saved successfully!</p>
              <p className="text-xs text-emerald-300/80 mt-0.5">
                Saved {saveSuccess.setsCount} set{saveSuccess.setsCount === 1 ? '' : 's'} with {saveSuccess.totalReps} total rep{saveSuccess.totalReps === 1 ? '' : 's'} (Average Score: {saveSuccess.averageScore}).
              </p>
            </div>
          </div>
          <button
            onClick={onDismissSuccess}
            className="text-xs px-3 py-1.5 bg-emerald-900/60 hover:bg-emerald-800/60 rounded-lg text-emerald-200 border border-emerald-600/40 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error Banner with Retry */}
      {saveError && (
        <div className="bg-rose-950/70 border border-rose-500/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-200">
          <div className="flex items-start gap-2.5">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-semibold text-xs text-rose-300 uppercase tracking-wider">
                {saveError.type === 'network'
                  ? 'Backend unreachable'
                  : saveError.type === 'validation'
                  ? 'Rejected by server'
                  : 'Server Error'}
              </p>
              <p className="text-xs text-rose-200 mt-0.5 break-words font-mono">
                {saveError.message}
              </p>
            </div>
          </div>
          <button
            onClick={onRetrySave}
            disabled={isSaving}
            className="self-end sm:self-center px-3.5 py-1.5 bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            {isSaving ? 'Retrying...' : 'Retry save'}
          </button>
        </div>
      )}

      {/* Grid: Current Set & Finished Sets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Current Active Set */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Current Set
              </span>
              {hasActiveSet && (
                <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded">
                  In progress
                </span>
              )}
            </div>

            {hasActiveSet ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-bold text-white capitalize">
                    {currentSet!.exercise === 'squat' ? 'Squat' : 'Bicep Curl'}
                  </span>
                  <span className="text-xs text-slate-300">
                    <strong className="text-cyan-400">{currentSet!.reps.length}</strong> reps completed
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  Current set avg score:{' '}
                  <span className="font-bold text-slate-200">{currentSet!.averageScore}</span>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-slate-500 italic">
                No reps in current set yet. Start moving to begin!
              </div>
            )}
          </div>

          <div className="pt-3 mt-2 border-t border-slate-700/40 flex justify-end">
            <button
              onClick={onEndSet}
              disabled={!hasActiveSet || isSaving}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:hover:bg-slate-700 text-slate-200 transition-colors"
            >
              End set
            </button>
          </div>
        </div>

        {/* Finished Sets of this Workout */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Finished Sets ({finishedSets.length})
              </span>
            </div>

            {finishedSets.length > 0 ? (
              <div className="max-h-36 overflow-y-auto divide-y divide-slate-700/40 text-xs">
                {finishedSets.map((s, idx) => {
                  const setAvg =
                    s.reps.length > 0
                      ? Math.round(
                          (s.reps.reduce((acc, r) => acc + r.score, 0) / s.reps.length) * 10
                        ) / 10
                      : 0;
                  return (
                    <div key={idx} className="py-1.5 flex items-center justify-between">
                      <span className="font-medium text-slate-300">
                        Set {idx + 1}:{' '}
                        <span className="capitalize text-slate-400">
                          {s.exercise === 'squat' ? 'Squat' : 'Curl'}
                        </span>
                      </span>
                      <span className="font-mono text-slate-400">
                        {s.reps.length} reps · avg {setAvg}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-slate-500 italic">
                No finished sets yet.
              </div>
            )}
          </div>

          {finishedSets.length > 0 && (
            <div className="pt-3 mt-2 border-t border-slate-700/40 text-right text-xs text-slate-400">
              Total finished reps: <span className="text-slate-200 font-bold">{finishedSets.reduce((acc, s) => acc + s.reps.length, 0)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons: Finish & Save, Discard */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-800">
        <button
          onClick={handleDiscardClick}
          disabled={!canDiscard}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-300 bg-rose-950/40 hover:bg-rose-900/50 disabled:opacity-40 disabled:hover:bg-rose-950/40 border border-rose-800/40 transition-colors"
        >
          Discard workout
        </button>

        <button
          onClick={onFinishAndSave}
          disabled={!canSave}
          className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-emerald-700/20 transition-all flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Saving...</span>
            </>
          ) : (
            <>
              <span>💾</span>
              <span>Finish & save workout</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
