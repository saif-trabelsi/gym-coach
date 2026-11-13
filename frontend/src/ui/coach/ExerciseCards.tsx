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
    <div className="w-full grid grid-cols-2 gap-2 sm:gap-3" role="radiogroup" aria-label="Exercise Selection">
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
            className={`p-3 sm:p-4 rounded-[var(--radius-xl)] border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2.5 sm:gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] disabled:opacity-50 disabled:cursor-not-allowed ${
              isSelected
                ? 'bg-[var(--accent-subtle)] border-[var(--accent)] shadow-md shadow-[var(--accent)]/10 ring-1 ring-[var(--accent)]'
                : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--bg-surface-elevated)]'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 sm:gap-2.5">
                <div
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                    isSelected
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)]'
                  }`}
                >
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-xs sm:text-sm text-[var(--text-primary)] truncate">{item.name}</h3>
                  <span className="text-[10px] sm:text-[11px] text-[var(--text-muted)] font-medium block truncate">
                    {item.tagline}
                  </span>
                </div>
              </div>
              <span
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent)]'
                    : 'border-[var(--border-default)] bg-transparent'
                }`}
              >
                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-contrast)]" />}
              </span>
            </div>

            <div className={`pt-2 border-t border-[var(--border-subtle)]/60 flex flex-col gap-1 text-[10px] sm:text-[11px] ${isSelected ? 'flex' : 'hidden sm:flex'}`}>
              <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="text-[var(--accent)] font-bold shrink-0">📷</span>
                <span className="truncate sm:whitespace-normal">{item.cameraHint}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-secondary)] shrink-0">Target:</span>
                <span className="truncate sm:whitespace-normal">{item.targetDepth}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
