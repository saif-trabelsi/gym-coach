import React from 'react';
import type { ExerciseType } from '../../App';
import { Dumbbell, Flame } from 'lucide-react';

interface ExerciseCardsProps {
  selected: ExerciseType;
  onSelect: (exercise: ExerciseType) => void;
  disabled?: boolean;
}

export const ExerciseCards: React.FC<ExerciseCardsProps> = ({
  selected,
  onSelect,
  disabled = false,
}) => {
  const exercises = [
    {
      id: 'squat' as const,
      name: 'Squat',
      icon: <Flame className="w-5 h-5" />,
      tagline: 'Quads, Glutes & Core',
      cameraHint: 'Camera at hip height, side-on view (full body visible)',
      targetDepth: 'Knee angle < 100° (below parallel)',
    },
    {
      id: 'bicepCurl' as const,
      name: 'Bicep Curl',
      icon: <Dumbbell className="w-5 h-5" />,
      tagline: 'Biceps & Forearms',
      cameraHint: 'Camera at chest height, side-on view (active arm & torso)',
      targetDepth: 'Elbow angle < 55° (full contraction)',
    },
  ];

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Exercise Selection">
      {exercises.map((item) => {
        const isSelected = selected === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onSelect(item.id)}
            className={`p-4 rounded-[var(--radius-xl)] border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] disabled:opacity-50 disabled:cursor-not-allowed ${
              isSelected
                ? 'bg-[var(--accent-subtle)] border-[var(--accent)] shadow-md shadow-[var(--accent)]/10 ring-1 ring-[var(--accent)]'
                : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--bg-surface-elevated)]'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)]'
                  }`}
                >
                  {item.icon}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[var(--text-primary)]">{item.name}</h3>
                  <span className="text-[11px] text-[var(--text-muted)] font-medium">
                    {item.tagline}
                  </span>
                </div>
              </div>
              <span
                className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent)]'
                    : 'border-[var(--border-default)] bg-transparent'
                }`}
              >
                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-contrast)]" />}
              </span>
            </div>

            <div className="pt-2 border-t border-[var(--border-subtle)]/60 flex flex-col gap-1 text-[11px]">
              <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="text-[var(--accent)] font-bold">📷</span>
                <span>{item.cameraHint}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-secondary)]">Target:</span>
                <span>{item.targetDepth}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
