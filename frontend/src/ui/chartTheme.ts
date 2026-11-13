/**
 * Provides theme-aware colors from CSS variables to Recharts components,
 * eliminating hardcoded hex colors from chart implementations.
 */

export interface ChartThemeColors {
  accent: string;
  good: string;
  warn: string;
  bad: string;
  grid: string;
  axisText: string;
  tooltipBg: string;
  tooltipBorder: string;
  surface: string;
}

export const FALLBACK_CHART_THEME: ChartThemeColors = {
  accent: '#10b981', // emerald-500
  good: '#10b981',
  warn: '#f59e0b', // amber-500
  bad: '#f43f5e', // rose-500
  grid: 'rgba(51, 65, 85, 0.45)', // slate-700 / border-subtle
  axisText: '#94a3b8', // slate-400 / text-secondary
  tooltipBg: '#0f172a', // slate-900 / bg-surface
  tooltipBorder: '#334155', // slate-700 / border-default
  surface: '#0f172a',
};

/**
 * Reads CSS token variables from document.documentElement or falls back to standard token values.
 */
export function getChartTheme(): ChartThemeColors {
  if (typeof document === 'undefined') {
    return FALLBACK_CHART_THEME;
  }

  const style = window.getComputedStyle(document.documentElement);
  const getVar = (name: string, fallback: string) => {
    const val = style.getPropertyValue(name).trim();
    return val || fallback;
  };

  return {
    accent: getVar('--accent', FALLBACK_CHART_THEME.accent),
    good: getVar('--score-good', FALLBACK_CHART_THEME.good),
    warn: getVar('--score-warn', FALLBACK_CHART_THEME.warn),
    bad: getVar('--score-bad', FALLBACK_CHART_THEME.bad),
    grid: getVar('--border-subtle', FALLBACK_CHART_THEME.grid),
    axisText: getVar('--text-secondary', FALLBACK_CHART_THEME.axisText),
    tooltipBg: getVar('--bg-surface', FALLBACK_CHART_THEME.tooltipBg),
    tooltipBorder: getVar('--border-default', FALLBACK_CHART_THEME.tooltipBorder),
    surface: getVar('--bg-surface', FALLBACK_CHART_THEME.surface),
  };
}
