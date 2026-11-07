import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 rounded-[var(--radius-2xl)] border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)]/50 ${className}`}
    >
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent)] mb-3 shadow-inner">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
      <p className="text-xs text-[var(--text-secondary)] max-w-sm mt-1">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
