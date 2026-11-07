import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rounded';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'rounded',
  width,
  height,
  className = '',
  style,
  ...props
}) => {
  const variantClasses = {
    text: 'rounded-[var(--radius-sm)] h-4 w-full',
    circular: 'rounded-full',
    rounded: 'rounded-[var(--radius-lg)]',
  };

  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] ${variantClasses[variant]} ${className}`}
      style={{
        width,
        height,
        ...style,
      }}
      {...props}
    />
  );
};
