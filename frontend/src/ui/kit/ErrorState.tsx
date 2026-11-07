import React from 'react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryText?: string;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryText = 'Try again',
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center p-6 rounded-[var(--radius-xl)] bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-[var(--status-danger)] ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-[var(--status-danger)]/20 flex items-center justify-center mb-2">
        <svg
          className="w-5 h-5 text-[var(--status-danger)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h4 className="text-sm font-bold text-[var(--text-primary)]">{title}</h4>
      <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {retryText}
          </Button>
        </div>
      )}
    </div>
  );
};
