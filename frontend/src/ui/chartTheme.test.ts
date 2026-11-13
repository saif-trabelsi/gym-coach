// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getChartTheme, FALLBACK_CHART_THEME } from './chartTheme';

describe('Chart Theme Helper (chartTheme.ts)', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--accent');
    document.documentElement.style.removeProperty('--score-good');
    document.documentElement.style.removeProperty('--score-warn');
    document.documentElement.style.removeProperty('--score-bad');
    document.documentElement.style.removeProperty('--border-subtle');
  });

  it('provides default fallback colors when tokens are not explicitly set on root', () => {
    const theme = getChartTheme();
    expect(theme.accent).toBe(FALLBACK_CHART_THEME.accent);
    expect(theme.good).toBe(FALLBACK_CHART_THEME.good);
    expect(theme.warn).toBe(FALLBACK_CHART_THEME.warn);
    expect(theme.bad).toBe(FALLBACK_CHART_THEME.bad);
  });

  it('reads overridden token values from document.documentElement', () => {
    document.documentElement.style.setProperty('--accent', '#059669');
    document.documentElement.style.setProperty('--score-good', '#10b981');
    document.documentElement.style.setProperty('--score-warn', '#d97706');
    document.documentElement.style.setProperty('--score-bad', '#e11d48');

    const theme = getChartTheme();
    expect(theme.accent).toBe('#059669');
    expect(theme.good).toBe('#10b981');
    expect(theme.warn).toBe('#d97706');
    expect(theme.bad).toBe('#e11d48');
  });
});
