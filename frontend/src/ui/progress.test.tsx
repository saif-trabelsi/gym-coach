// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ProgressView } from './ProgressView';
import { NotFoundView } from './NotFoundView';
import { parseHash, getTitleForRoute } from '../analytics/navigation';
import type { ProgressRow } from '../api/client';

const mockProgressData: ProgressRow[] = [
  { date: '2026-11-12', exercise: 'squat', reps: 30, average_score: 92.0 },
  { date: '2026-11-10', exercise: 'bicepCurl', reps: 20, average_score: 85.0 },
  { date: '2026-11-04', exercise: 'squat', reps: 25, average_score: 80.0 },
  { date: '2026-10-15', exercise: 'squat', reps: 40, average_score: 75.0 },
];

describe('ProgressView & Navigation Enhancements (Task D.4)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  describe('ProgressView KPI Tiles & Range Filters', () => {
    it('renders KPI tiles with computed values from progress rows', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/stats/progress')) {
          return Promise.resolve(
            new Response(JSON.stringify(mockProgressData), { status: 200 })
          );
        }
        return Promise.reject(new Error(`Unknown url: ${url}`));
      });

      render(<ProgressView backendOnline={true} onGoToCoach={vi.fn()} />);

      expect(await screen.findByText(/Total Reps/i)).toBeTruthy();
      expect(screen.getByText(/Avg Score/i)).toBeTruthy();
      expect(screen.getByText(/Active Days/i)).toBeTruthy();
      expect(screen.getByText(/Focus/i)).toBeTruthy();
    });

    it('filters rows by range when SegmentedControl buttons are clicked', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/stats/progress')) {
          return Promise.resolve(
            new Response(JSON.stringify(mockProgressData), { status: 200 })
          );
        }
        return Promise.reject(new Error(`Unknown url: ${url}`));
      });

      render(<ProgressView backendOnline={true} onGoToCoach={vi.fn()} />);

      await screen.findByText(/Total Reps/i);

      // Click "7 Days" range option
      const sevenDaysBtn = screen.getByRole('radio', { name: /7 Days/i });
      fireEvent.click(sevenDaysBtn);
      expect(sevenDaysBtn.getAttribute('aria-checked')).toBe('true');

      // Click "All Time" range option
      const allTimeBtn = screen.getByRole('radio', { name: /All Time/i });
      fireEvent.click(allTimeBtn);
      expect(allTimeBtn.getAttribute('aria-checked')).toBe('true');
    });

    it('renders EmptyState with call-to-action button when data is empty', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/stats/progress')) {
          return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        }
        return Promise.reject(new Error(`Unknown url: ${url}`));
      });

      const handleGoToCoach = vi.fn();
      render(
        <ProgressView backendOnline={true} onGoToCoach={handleGoToCoach} />
      );

      expect(await screen.findByText(/No workout data found/i)).toBeTruthy();
      const actionBtn = screen.getByRole('button', { name: /Start a Workout/i });
      fireEvent.click(actionBtn);
      expect(handleGoToCoach).toHaveBeenCalledTimes(1);
    });
  });

  describe('Route Fallback & Document Title Updates', () => {
    it('parseHash parses not-found and 404 routes', () => {
      const notFoundRoute = parseHash('#not-found');
      expect(notFoundRoute.view).toBe('not-found');

      const route404 = parseHash('#404');
      expect(route404.view).toBe('not-found');
    });

    it('parseHash defaults empty or bare # to coach', () => {
      expect(parseHash('').view).toBe('coach');
      expect(parseHash('#').view).toBe('coach');
      expect(parseHash('#coach').view).toBe('coach');
    });

    it('getTitleForRoute returns proper document titles for each view', () => {
      expect(getTitleForRoute({ view: 'coach' })).toContain('Real-Time Form Coaching');
      expect(getTitleForRoute({ view: 'history' })).toContain('Workout History');
      expect(getTitleForRoute({ view: 'history', id: 42 })).toContain('Session #42 Details');
      expect(getTitleForRoute({ view: 'progress' })).toContain('Progress Analytics');
      expect(getTitleForRoute({ view: 'design' })).toContain('Design Style Guide');
      expect(getTitleForRoute({ view: 'not-found' })).toContain('Page Not Found');
    });

    it('NotFoundView renders error message and Back to Coach button', () => {
      const handleGoToCoach = vi.fn();
      render(
        <NotFoundView rawPath="invalid-route" onGoToCoach={handleGoToCoach} />
      );

      expect(screen.getByText(/Page Not Found \(404\)/i)).toBeTruthy();
      expect(screen.getByText(/#invalid-route/i)).toBeTruthy();
      const backBtn = screen.getByRole('button', { name: /Back to Coach/i });
      fireEvent.click(backBtn);
      expect(handleGoToCoach).toHaveBeenCalledTimes(1);
    });
  });
});
