import { useState, useEffect, useCallback } from 'react';

export type Theme = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'gymcoach_theme';

export function getStoredTheme(): Theme {
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === 'dark' || val === 'light' || val === 'system') {
      return val;
    }
  } catch {
    // LocalStorage access may fail in private mode or sandbox
  }
  return 'dark'; // Default theme is dark
}

export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures
  }
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    }
    return 'dark';
  }
  return theme;
}

export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
    // Also toggle standard Tailwind 'dark' class for compatibility
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }
  return resolved;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(getStoredTheme()));

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    setStoredTheme(nextTheme);
    const resolved = applyTheme(nextTheme);
    setResolvedTheme(resolved);
  }, []);

  useEffect(() => {
    const resolved = applyTheme(theme);
    setResolvedTheme(resolved);

    if (theme === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => {
        const nextResolved = applyTheme('system');
        setResolvedTheme(nextResolved);
      };
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  return { theme, resolvedTheme, setTheme };
}
