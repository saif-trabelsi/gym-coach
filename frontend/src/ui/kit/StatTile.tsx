import React from 'react';

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  className?: string;
}

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  subValue,
  icon,
  tone = 'default',
  className = '',
}) => {
  const toneClasses = {
    default: 'text-[var(--text-primary)]',
    good: 'text-[var(--score-good)]',
    warn: 'text-[var(--score-warn)]',
    bad: 'text-[var(--score-bad)]',
  };

  return (
    <div
      className={`bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] p-4 flex flex-col justify-between shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        <span>{label}</span>
        {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-3xl font-black font-mono tracking-tight ${toneClasses[tone]}`}>
          {value}
        </span>
        {subValue && (
          <span className="text-xs text-[var(--text-muted)] font-mono">{subValue}</span>
        )}
      </div>
    </div>
  );
};
