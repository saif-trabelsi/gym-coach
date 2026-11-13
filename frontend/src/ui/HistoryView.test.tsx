// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { HistoryView } from './HistoryView';
import type { SessionListItem } from '../api/client';

const mockSessions: SessionListItem[] = [
  {
    id: 1,
    started_at: '2026-11-12T10:00:00Z',
    ended_at: '2026-11-12T10:05:00Z',
    total_reps: 15,
    average_score: 92.5,
    exercises: ['squat'],
  },
  {
    id: 2,
    started_at: '2026-11-11T14:30:00Z',
    ended_at: '2026-11-11T14:40:00Z',
    total_reps: 20,
    average_score: 75.0,
    exercises: ['bicepCurl'],
  },
  {
    id: 3,
    started_at: '2026-10-01T09:00:00Z',
    ended_at: '2026-10-01T09:15:00Z',
    total_reps: 30,
    average_score: 62.0,
    exercises: ['squat', 'bicepCurl'],
  },
];

describe('HistoryView (Task D.3)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('renders sessions grouped by day with relative labels', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/sessions')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockSessions), { status: 200 })
        );
      }
      return Promise.reject(new Error(`Unknown url: ${url}`));
    });

    render(
      <HistoryView
        backendOnline={true}
        onSelectSession={vi.fn()}
        onGoToCoach={vi.fn()}
      />
    );

    // Verify session cards rendered
    expect(await screen.findByText('Session #1')).toBeTruthy();
    expect(screen.getByText('Session #2')).toBeTruthy();
    expect(screen.getByText('Session #3')).toBeTruthy();

    // Verify relative dates or headers rendered
    expect(screen.getByText(/3 sessions/i)).toBeTruthy();
  });

  it('filters sessions by exercise chip selection', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/sessions')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockSessions), { status: 200 })
        );
      }
      return Promise.reject(new Error(`Unknown url: ${url}`));
    });

    render(
      <HistoryView
        backendOnline={true}
        onSelectSession={vi.fn()}
        onGoToCoach={vi.fn()}
      />
    );

    await screen.findByText('Session #1');

    // Click "Bicep Curl" filter chip
    const curlChip = screen.getByRole('button', { name: /^Bicep Curl$/i });
    fireEvent.click(curlChip);

    // Session 2 and Session 3 have bicepCurl, Session 1 (squat only) should not be visible
    expect(screen.queryByText('Session #1')).toBeNull();
    expect(screen.getByText('Session #2')).toBeTruthy();
    expect(screen.getByText('Session #3')).toBeTruthy();

    // Click "Squat" filter chip
    const squatChip = screen.getByRole('button', { name: /^Squat$/i });
    fireEvent.click(squatChip);

    // Session 1 and Session 3 have squat, Session 2 (bicepCurl only) should not be visible
    expect(screen.getByText('Session #1')).toBeTruthy();
    expect(screen.queryByText('Session #2')).toBeNull();
    expect(screen.getByText('Session #3')).toBeTruthy();

    // Reset to "All"
    const allChip = screen.getByRole('button', { name: /^All$/i });
    fireEvent.click(allChip);
    expect(screen.getByText('Session #1')).toBeTruthy();
    expect(screen.getByText('Session #2')).toBeTruthy();
  });

  it('filters sessions by date range chip selection', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/sessions')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockSessions), { status: 200 })
        );
      }
      return Promise.reject(new Error(`Unknown url: ${url}`));
    });

    render(
      <HistoryView
        backendOnline={true}
        onSelectSession={vi.fn()}
        onGoToCoach={vi.fn()}
      />
    );

    await screen.findByText('Session #1');

    // Click "Last 7 days" filter chip
    const sevenDaysChip = screen.getByRole('button', { name: /Last 7 days/i });
    fireEvent.click(sevenDaysChip);

    // Session 3 is from October 2026, which is > 7 days ago compared to Nov 2026
    expect(screen.queryByText('Session #3')).toBeNull();

    // Click "All time"
    const allTimeChip = screen.getByRole('button', { name: /All time/i });
    fireEvent.click(allTimeChip);
    expect(screen.getByText('Session #3')).toBeTruthy();
  });

  it('opens confirmation Dialog when clicking delete and calls deleteSession on confirm', async () => {
    let deletedId: number | null = null;
    globalThis.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/sessions/') && options?.method === 'DELETE') {
        const parts = url.split('/');
        deletedId = parseInt(parts[parts.length - 1], 10);
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      if (url.includes('/sessions')) {
        const sessionsToReturn = deletedId ? mockSessions.filter((s) => s.id !== deletedId) : mockSessions;
        return Promise.resolve(
          new Response(JSON.stringify(sessionsToReturn), { status: 200 })
        );
      }
      return Promise.reject(new Error(`Unknown url: ${url}`));
    });

    render(
      <HistoryView
        backendOnline={true}
        onSelectSession={vi.fn()}
        onGoToCoach={vi.fn()}
      />
    );

    await screen.findByText('Session #1');

    // Click delete on Session 1
    const deleteBtn = screen.getByRole('button', { name: /Delete session 1/i });
    fireEvent.click(deleteBtn);

    // Confirmation dialog is open
    expect(screen.getByText(/Delete Workout Session\?/i)).toBeTruthy();
    expect(
      screen.getByText(/Are you sure you want to delete session #1\?/i)
    ).toBeTruthy();

    // Confirm deletion
    const confirmBtn = screen.getByRole('button', { name: /Yes, Delete/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deletedId).toBe(1);
    });
  });

  it('renders EmptyState when session list is empty with call to action', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/sessions')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.reject(new Error(`Unknown url: ${url}`));
    });

    const handleGoToCoach = vi.fn();
    render(
      <HistoryView
        backendOnline={true}
        onSelectSession={vi.fn()}
        onGoToCoach={handleGoToCoach}
      />
    );

    expect(await screen.findByText(/No workouts found/i)).toBeTruthy();
    const startBtn = screen.getByRole('button', { name: /Start a Workout/i });
    fireEvent.click(startBtn);
    expect(handleGoToCoach).toHaveBeenCalledTimes(1);
  });
});
