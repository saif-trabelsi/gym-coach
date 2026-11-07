import React from 'react';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
}

export function SegmentedControl<T extends string = string>({
  value,
  onChange,
  options,
  size = 'md',
  ariaLabel,
  className = '',
}: SegmentedControlProps<T>) {
  const sizeClasses = {
    sm: 'p-0.5 text-xs gap-0.5',
    md: 'p-1 text-sm gap-1',
  };

  const itemSizeClasses = {
    sm: 'px-2 py-1',
    md: 'px-3 py-1.5',
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-[var(--radius-lg)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] ${sizeClasses[size]} ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center justify-center gap-1.5 font-medium rounded-[var(--radius-md)] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] disabled:opacity-40 disabled:cursor-not-allowed ${itemSizeClasses[size]} ${
              isSelected
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
