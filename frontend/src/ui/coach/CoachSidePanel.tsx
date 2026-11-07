import React, { useState } from 'react';
import type { RecordedSet, RecordedRep } from '../../recording/workoutRecorder';
import type { SaveErrorState, SaveSuccessState } from '../WorkoutPanel';
import { Button } from '../kit/Button';
import { Badge } from '../kit/Badge';
import { Card } from '../kit/Card';
import { Dialog } from '../kit/Dialog';
import { scoreTone } from '../../design/scoreTone';
import { Check, AlertCircle, ChevronDown, ChevronUp, Trash2, Save, CornerDownRight } from 'lucide-react';

export interface CoachRepItem {
  index?: number;
  score: number;
  duration_ms?: number;
  metrics?: Record<string, any>;
  violations?: (string | { message: string })[];
  timestamp: number;
}

export interface CoachSidePanelProps {
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
  repsHistory: CoachRepItem[];
  className?: string;
}

export const CoachSidePanel: React.FC<CoachSidePanelProps> = ({
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
  repsHistory,
  className = '',
}) => {
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState<boolean>(false);
  const [expandedRepIdx, setExpandedRepIdx] = useState<number | null>(null);

  const hasCurrentSetReps = currentSet !== null && currentSet.reps.length > 0;
  const canSave = totals.totalReps > 0 && !isSaving;
  const canDiscard = (totals.totalReps > 0 || finishedSets.length > 0) && !isSaving;

  // Last 10 reps in chronological order (or newest first)
  const last10Reps = repsHistory.slice(-10).reverse();

  return (
    <Card variant="default" className={`flex flex-col gap-5 ${className}`}>
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Workout Session
          </h2>
          <span className="text-xs text-[var(--text-muted)]">
            Set {finishedSets.length + 1} in progress
          </span>
        </div>
        {totals.totalReps > 0 && (
          <Badge variant="success" size="md">
            {totals.totalReps} total rep{totals.totalReps === 1 ? '' : 's'} · {totals.averageScore} avg
          </Badge>
        )}
      </div>

      {/* Save Success Banner */}
      {saveSuccess && (
        <div className="bg-[var(--score-good-bg)] border border-[var(--score-good-border)] text-[var(--score-good)] rounded-[var(--radius-lg)] p-3 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>Saved {saveSuccess.totalReps} reps to workout history!</span>
          </div>
          <button
            onClick={onDismissSuccess}
            className="text-xs font-bold hover:underline p-1 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Save Error Banner */}
      {saveError && (
        <div className="bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-[var(--status-danger)] rounded-[var(--radius-lg)] p-3 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{saveError.message}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={onRetrySave} isLoading={isSaving}>
            Retry
          </Button>
        </div>
      )}

      {/* Current & Finished Sets Summary */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          Sets Log
        </span>
        <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
          {finishedSets.map((s, idx) => {
            const setAvg =
              s.reps.length > 0
                ? Math.round(s.reps.reduce((acc, r) => acc + r.score, 0) / s.reps.length)
                : 0;
            return (
              <div
                key={s.started_at + idx}
                className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--text-muted)]">#{idx + 1}</span>
                  <span className="capitalize font-semibold text-[var(--text-primary)]">
                    {s.exercise === 'bicepCurl' ? 'Bicep Curl' : 'Squat'}
                  </span>
                  <span className="text-[var(--text-muted)]">({s.reps.length} reps)</span>
                </div>
                <Badge
                  variant={setAvg >= 85 ? 'success' : setAvg >= 70 ? 'warning' : 'danger'}
                  size="sm"
                >
                  {setAvg} pts
                </Badge>
              </div>
            );
          })}

          {/* Active Set Row */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent)] text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--accent)]">#{finishedSets.length + 1}</span>
              <span className="font-bold text-[var(--text-primary)]">Current Active Set</span>
              <span className="text-[var(--text-secondary)]">
                ({currentSet ? currentSet.reps.length : 0} reps)
              </span>
            </div>
            <span className="font-mono font-bold text-[var(--accent)]">
              {currentSet && currentSet.reps.length > 0 ? `${currentSet.averageScore} avg` : 'Active'}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons: End Set, Finish & Save, Discard */}
      <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-subtle)]">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={onEndSet}
            disabled={!hasCurrentSetReps}
            leftIcon={<CornerDownRight className="w-4 h-4" />}
          >
            End Set
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={onFinishAndSave}
            disabled={!canSave}
            isLoading={isSaving}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Finish & Save
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsDiscardDialogOpen(true)}
          disabled={!canDiscard}
          leftIcon={<Trash2 className="w-3.5 h-3.5 text-[var(--status-danger)]" />}
          className="text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
        >
          Discard Workout
        </Button>
      </div>

      {/* Last 10 Reps List with Expandable Biometrics */}
      <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-subtle)]">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          Recent Reps ({repsHistory.length} total)
        </span>

        {last10Reps.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] italic py-2">
            Reps will appear here in real time as you complete them.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            {last10Reps.map((rep, idx) => {
              const repNumber = repsHistory.length - idx;
              const repKey = rep.index ?? rep.timestamp;
              const isExpanded = expandedRepIdx === repKey;
              const tone = scoreTone(rep.score);

              const toneBadge =
                tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : 'danger';

              const durationSeconds = rep.duration_ms
                ? (rep.duration_ms / 1000).toFixed(1)
                : rep.metrics?.descentDurationMs
                ? (rep.metrics.descentDurationMs / 1000).toFixed(1)
                : '-';

              return (
                <div
                  key={rep.timestamp}
                  className="rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] p-2 text-xs transition-colors"
                >
                  <div
                    onClick={() => setExpandedRepIdx(isExpanded ? null : repKey)}
                    className="flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[var(--text-muted)]">
                        #{repNumber}
                      </span>
                      <Badge variant={toneBadge} size="sm">
                        Score {rep.score}
                      </Badge>
                      <span className="text-[11px] text-[var(--text-muted)] font-mono">
                        {durationSeconds}s
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                      {rep.violations && rep.violations.length > 0 ? (
                        <span className="text-[10px] text-[var(--status-danger)] font-medium">
                          {rep.violations.length} issue{rep.violations.length === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--score-good)] font-medium">
                          Clean rep
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </div>
                  </div>

                  {/* Expandable Biometrics metrics */}
                  {isExpanded && rep.metrics && (
                    <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]/60 flex flex-col gap-1.5 text-[11px] font-mono text-[var(--text-secondary)]">
                      {rep.metrics.minKneeAngle !== undefined && (
                        <div className="flex justify-between">
                          <span>Min Knee Angle:</span>
                          <span className="text-[var(--text-primary)] font-bold">
                            {rep.metrics.minKneeAngle.toFixed(0)}°
                          </span>
                        </div>
                      )}
                      {rep.metrics.maxTorsoLean !== undefined && (
                        <div className="flex justify-between">
                          <span>Max Torso Lean:</span>
                          <span className="text-[var(--text-primary)] font-bold">
                            {rep.metrics.maxTorsoLean.toFixed(0)}°
                          </span>
                        </div>
                      )}
                      {rep.metrics.minElbowAngle !== undefined && (
                        <div className="flex justify-between">
                          <span>Min Elbow Angle:</span>
                          <span className="text-[var(--text-primary)] font-bold">
                            {rep.metrics.minElbowAngle.toFixed(0)}°
                          </span>
                        </div>
                      )}
                      {rep.metrics.elbowDrift !== undefined && (
                        <div className="flex justify-between">
                          <span>Elbow Drift:</span>
                          <span className="text-[var(--text-primary)] font-bold">
                            {(rep.metrics.elbowDrift * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {rep.violations && rep.violations.length > 0 && (
                        <div className="mt-1 pt-1 border-t border-[var(--border-subtle)]/40 flex flex-wrap gap-1">
                          {rep.violations.map((v) => {
                            const msg = typeof v === 'string' ? v : v.message;
                            return (
                              <span
                                key={msg}
                                className="px-1.5 py-0.5 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-[10px]"
                              >
                                {msg}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Discard Confirmation Dialog */}
      <Dialog
        isOpen={isDiscardDialogOpen}
        onClose={() => setIsDiscardDialogOpen(false)}
        title="Discard Workout Session?"
        description="Are you sure you want to discard this workout? All recorded reps and sets will be permanently cleared."
      >
        <div className="flex justify-end gap-3 mt-5">
          <Button variant="ghost" onClick={() => setIsDiscardDialogOpen(false)}>
            Keep Workout
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setIsDiscardDialogOpen(false);
              onDiscard();
            }}
          >
            Yes, Discard
          </Button>
        </div>
      </Dialog>
    </Card>
  );
};
