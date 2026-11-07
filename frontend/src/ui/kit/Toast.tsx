import React, { createContext, useContext, useState, useCallback } from 'react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

export interface ToastMessage {
  id: string;
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, durationMs?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info', durationMs: number = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newToast: ToastMessage = { id, message, variant, durationMs };
      setToasts((prev) => [...prev, newToast]);

      if (durationMs > 0) {
        setTimeout(() => {
          removeToast(id);
        }, durationMs);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Toast viewport with aria-live="polite" */}
      <div
        aria-live="polite"
        aria-atomic="true"
        data-testid="toast-container"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

export const ToastItem: React.FC<{ toast: ToastMessage; onClose: () => void }> = ({
  toast,
  onClose,
}) => {
  const variantStyles = {
    info: 'bg-[var(--bg-surface-elevated)] border-[var(--status-info-border)] text-[var(--text-primary)]',
    success: 'bg-[var(--bg-surface-elevated)] border-[var(--score-good-border)] text-[var(--text-primary)]',
    warning: 'bg-[var(--bg-surface-elevated)] border-[var(--score-warn-border)] text-[var(--text-primary)]',
    danger: 'bg-[var(--bg-surface-elevated)] border-[var(--status-danger-border)] text-[var(--text-primary)]',
  };

  const dotColors = {
    info: 'bg-[var(--status-info)]',
    success: 'bg-[var(--score-good)]',
    warning: 'bg-[var(--score-warn)]',
    danger: 'bg-[var(--status-danger)]',
  };

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-[var(--radius-lg)] border shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200 ${variantStyles[toast.variant || 'info']}`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColors[toast.variant || 'info']}`} />
        <span className="text-xs font-medium">{toast.message}</span>
      </div>
      <button
        onClick={onClose}
        aria-label="Dismiss toast"
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
      >
        ✕
      </button>
    </div>
  );
};
