import React from 'react';
import { useTheme, type Theme } from '../../design/theme';
import { Dumbbell, History, TrendingUp, Sun, Moon, Laptop, Activity, Wifi, WifiOff } from 'lucide-react';

export interface AppShellProps {
  currentView: 'coach' | 'history' | 'progress' | 'design';
  backendOnline: boolean | null;
  inProgressReps?: number;
  children: React.ReactNode;
}

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'dark') setTheme('light');
    else if (theme === 'light') setTheme('system');
    else setTheme('dark');
  };

  const icons: Record<Theme, React.ReactNode> = {
    dark: <Moon className="w-4 h-4 text-emerald-400" />,
    light: <Sun className="w-4 h-4 text-amber-500" />,
    system: <Laptop className="w-4 h-4 text-[var(--text-secondary)]" />,
  };

  const labels: Record<Theme, string> = {
    dark: 'Theme: Dark',
    light: 'Theme: Light',
    system: 'Theme: System',
  };

  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={`Toggle color theme. Current: ${labels[theme]}`}
      title={labels[theme]}
      className="p-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
    >
      {icons[theme]}
      <span className="sr-only">{labels[theme]}</span>
    </button>
  );
};

export const BackendStatusPill: React.FC<{ online: boolean | null }> = ({ online }) => {
  return (
    <div
      role="status"
      aria-label={online === false ? 'Backend unreachable' : 'Backend online'}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-full)] text-[11px] font-mono font-medium bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          online === false ? 'bg-[var(--status-danger)] animate-pulse' : 'bg-[var(--score-good)]'
        }`}
      />
      <span className="hidden sm:inline">
        {online === false ? 'Offline' : 'API Ready'}
      </span>
      {online === false ? (
        <WifiOff className="w-3 h-3 text-[var(--status-danger)]" />
      ) : (
        <Wifi className="w-3 h-3 text-[var(--score-good)]" />
      )}
    </div>
  );
};

export const AppShell: React.FC<AppShellProps> = ({
  currentView,
  backendOnline,
  inProgressReps = 0,
  children,
}) => {
  const navItems = [
    { id: 'coach', label: 'Coach', href: '#coach', icon: <Dumbbell className="w-4 h-4" /> },
    { id: 'history', label: 'History', href: '#history', icon: <History className="w-4 h-4" /> },
    { id: 'progress', label: 'Progress', href: '#progress', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  if (import.meta.env?.DEV) {
    navItems.push({
      id: 'design',
      label: 'Design',
      href: '#design',
      icon: <Activity className="w-4 h-4" />,
    });
  }

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col font-sans transition-colors duration-200">
      {/* Accessible skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--accent)] focus:text-[var(--accent-contrast)] focus:rounded-[var(--radius-lg)] focus:shadow-xl focus:font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
      >
        Skip to content
      </a>

      {/* Restyled Sticky Offline Banner */}
      {backendOnline === false && (
        <div
          role="alert"
          data-testid="backend-offline-banner"
          className="w-full bg-[var(--status-danger)] text-white text-xs py-1.5 px-4 text-center font-semibold sticky top-0 z-50 shadow-md flex items-center justify-center gap-2"
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>The backend is not reachable</span>
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-glass)] backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Wordmark */}
          <a
            href="#coach"
            className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] rounded-[var(--radius-lg)]"
          >
            <div className="w-9 h-9 rounded-[var(--radius-lg)] bg-[var(--accent)] text-[var(--accent-contrast)] flex items-center justify-center shadow-md shadow-[var(--accent)]/20 transition-transform group-hover:scale-105">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <span className="text-base font-black tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                AI Gym Coach
                <span className="hidden md:inline-block text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  v1.0
                </span>
              </span>
              <p className="text-[11px] text-[var(--text-muted)] hidden sm:block">
                Sports-Tech Biomechanics & Real-Time Form
              </p>
            </div>
          </a>

          {/* Desktop Navigation */}
          <nav
            aria-label="Main Navigation"
            className="hidden sm:flex items-center bg-[var(--bg-surface-elevated)] p-1 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] text-xs font-semibold"
          >
            {navItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <a
                  key={item.id}
                  href={item.href}
                  className={`px-3.5 py-1.5 rounded-[var(--radius-lg)] transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] ${
                    isActive
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.id === 'coach' && inProgressReps > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950">
                      {inProgressReps}
                    </span>
                  )}
                </a>
              );
            })}
          </nav>

          {/* Utility Toolbar: Backend Status & Theme Toggle */}
          <div className="flex items-center gap-2">
            <BackendStatusPill online={backendOnline} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content Landmark */}
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col focus:outline-none pb-20 sm:pb-8">
        {children}
      </main>

      {/* Bottom Tab Bar (mobile < 640px) */}
      <nav
        aria-label="Mobile Navigation"
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--bg-surface-glass)] backdrop-blur-lg border-t border-[var(--border-subtle)] px-2 py-1.5 flex items-center justify-around"
      >
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <a
              key={item.id}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-[var(--radius-lg)] text-[11px] font-semibold transition-colors ${
                isActive
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="relative">
                {item.icon}
                {item.id === 'coach' && inProgressReps > 0 && (
                  <span className="absolute -top-1.5 -right-2 w-3.5 h-3.5 bg-amber-400 text-slate-950 rounded-full text-[9px] font-bold flex items-center justify-center">
                    {inProgressReps}
                  </span>
                )}
              </span>
              <span className="mt-0.5">{item.label}</span>
            </a>
          );
        })}
      </nav>

      {/* Footer */}
      <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-6 text-center text-xs text-[var(--text-muted)]">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 AI Gym Coach. Private & on-device pose estimation.</p>
          <div className="flex items-center gap-4 text-[var(--text-secondary)]">
            <a href="#coach" className="hover:text-[var(--text-primary)]">Coach</a>
            <a href="#history" className="hover:text-[var(--text-primary)]">History</a>
            <a href="#progress" className="hover:text-[var(--text-primary)]">Progress</a>
            {import.meta.env?.DEV && (
              <a href="#design" className="hover:text-[var(--text-primary)] font-mono text-[11px]">#design</a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
