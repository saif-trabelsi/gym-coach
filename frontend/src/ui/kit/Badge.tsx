import React from 'react';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  dot = false,
  className = '',
  children,
  ...props
}) => {
  const variantStyles = {
    neutral: 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border border-[var(--border-default)]',
    success: 'bg-[var(--score-good-bg)] text-[var(--score-good)] border border-[var(--score-good-border)]',
    warning: 'bg-[var(--score-warn-bg)] text-[var(--score-warn)] border border-[var(--score-warn-border)]',
    danger: 'bg-[var(--status-danger-bg)] text-[var(--status-danger)] border border-[var(--status-danger-border)]',
    info: 'bg-[var(--status-info-bg)] text-[var(--status-info)] border border-[var(--status-info-border)]',
  };

  const dotColors = {
    neutral: 'bg-[var(--text-muted)]',
    success: 'bg-[var(--score-good)]',
    warning: 'bg-[var(--score-warn)]',
    danger: 'bg-[var(--status-danger)]',
    info: 'bg-[var(--status-info)]',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
  };

  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-full)] font-medium leading-none whitespace-nowrap ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant]}`} />}
      {children}
    </span>
  );
};
