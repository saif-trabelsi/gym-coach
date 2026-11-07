import React, { forwardRef } from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'glass';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', className = '', children, ...props }, ref) => {
    const variantStyles = {
      default: 'bg-[var(--bg-surface)] border border-[var(--border-subtle)]',
      elevated: 'bg-[var(--bg-surface-elevated)] border border-[var(--border-default)] shadow-lg',
      glass: 'bg-[var(--bg-surface-glass)] backdrop-blur-md border border-[var(--border-subtle)]',
    };

    return (
      <div
        ref={ref}
        className={`rounded-[var(--radius-xl)] p-5 text-[var(--text-primary)] transition-colors ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
