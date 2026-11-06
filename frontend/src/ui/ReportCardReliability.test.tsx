// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ReportCard, clearReportCache } from './ReportCard';
import App from '../App';
import { checkHealth, type ReportRead } from '../api/client';

vi.mock('../pose/detector', () => ({
  createPoseDetector: vi.fn().mockResolvedValue({
    detectFrame: vi.fn(),
    getDelegate: vi.fn().mockReturnValue('CPU'),
    isReady: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  }),
  POSE_CONNECTIONS: [],
  POSE_LANDMARKS: {},
}));

const mockReportData: ReportRead = {
  session_id: 10,
  language: 'en',
  created_at: new Date().toISOString(),
  provider: 'gemini',
  model: 'gemini-2.5-flash-lite',
  is_fallback: false,
  fallback_reason: null,
  stats: {
    total_reps: 12,
    average_score: 88.0,
    duration_minutes: 6.5,
    exercises: ['squat'],
    top_issues: [],
    sets: [],
  },
  narrative: {
    summary: 'Solid workout session.',
    strengths: ['Great posture'],
    issues: [],
    next_session: ['Keep it up'],
    fatigue_note: 'None',
  },
};

describe('ReportCard Reliability Tests (Task 5.1/5.2 reliability)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearReportCache();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    clearReportCache();
  });

  // Test a: Opening a session sends exactly one request to /reports and none to the single report endpoint
  it('a. opening a session sends exactly one request to /reports and none to the single report endpoint', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/sessions/10/reports')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              session_id: 10,
              reports: { en: null, fr: null, ar: null },
            }),
            { status: 200 }
          )
        );
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });
    globalThis.fetch = fetchMock;

    render(<ReportCard sessionId={10} initialLanguage="en" />);

    await screen.findByRole('button', { name: /Generate/i });

    // Verify calls: exactly one to /sessions/10/reports
    const reportsCalls = fetchMock.mock.calls.filter((call) =>
      call[0].includes('/sessions/10/reports')
    );
    expect(reportsCalls).toHaveLength(1);

    // None to /sessions/10/report?
    const singleReportCalls = fetchMock.mock.calls.filter((call) =>
      call[0].includes('/sessions/10/report?')
    );
    expect(singleReportCalls).toHaveLength(0);
  });

  // Test b: After a generation, Regenerate is disabled for 10 s with a countdown, then enabled
  it('b. after a generation, Regenerate is disabled for 10 s with a countdown, then enabled', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/sessions/10/reports')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              session_id: 10,
              reports: { en: null, fr: null, ar: null },
            }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/sessions/10/report') && options?.method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ...mockReportData,
              created_at: new Date().toISOString(),
            }),
            { status: 200 }
          )
        );
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });
    globalThis.fetch = fetchMock;

    render(<ReportCard sessionId={10} initialLanguage="en" />);

    // Wait for initial cache check
    await act(async () => {
      await Promise.resolve();
    });

    const generateBtn = screen.getByRole('button', { name: /Generate/i });

    // Click Generate
    await act(async () => {
      fireEvent.click(generateBtn);
      await Promise.resolve();
    });

    // Check report is rendered and Regenerate is disabled with countdown
    const regenBtn = screen.getByRole('button', { name: /Regenerate/i }) as HTMLButtonElement;
    expect(regenBtn).toBeTruthy();
    expect(regenBtn.disabled).toBe(true);
    expect(regenBtn.textContent).toMatch(/Regenerate \(10s\)/i);

    // Advance 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(regenBtn.disabled).toBe(true);
    expect(regenBtn.textContent).toMatch(/Regenerate \(5s\)/i);

    // Advance remaining 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(regenBtn.disabled).toBe(false);
    expect(regenBtn.textContent?.trim()).toBe('🔄Regenerate');
  });

  // Test c: A server 429 with Retry-After 7 shows a 7 second countdown
  it('c. a server 429 with Retry-After 7 shows a 7 second countdown', async () => {
    vi.useFakeTimers();

    globalThis.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/sessions/10/reports')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              session_id: 10,
              reports: { en: null, fr: null, ar: null },
            }),
            { status: 200 }
          )
        );
      }
      if (options?.method === 'POST') {
        return Promise.resolve(
          new Response(JSON.stringify({ detail: 'Rate limited' }), {
            status: 429,
            headers: { 'Retry-After': '7' },
          })
        );
      }
      return Promise.reject(new Error('Unknown'));
    });

    render(<ReportCard sessionId={10} initialLanguage="en" />);

    await act(async () => {
      await Promise.resolve();
    });

    const generateBtn = screen.getByRole('button', { name: /Generate/i });

    await act(async () => {
      fireEvent.click(generateBtn);
      await Promise.resolve();
    });

    // Shows 7 second countdown
    expect(screen.getByText(/Please wait 7 seconds/i)).toBeTruthy();

    // Advance 3s
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText(/Please wait 4 seconds/i)).toBeTruthy();
  });

  // Test d: Unreachable backend shows the message, then when health becomes reachable the card refetches by itself
  it('d. unreachable backend shows the message, then when health becomes reachable card refetches by itself', async () => {
    let backendIsReachable = false;

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/health')) {
        if (!backendIsReachable) {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
      }
      if (url.includes('/sessions/10/reports')) {
        if (!backendIsReachable) {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              session_id: 10,
              reports: { en: mockReportData, fr: null, ar: null },
            }),
            { status: 200 }
          )
        );
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(<ReportCard sessionId={10} initialLanguage="en" />);

    // Shows "The backend is not reachable" with Retry button
    expect(await screen.findByRole('heading', { name: /The backend is not reachable/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeTruthy();

    // Backend comes back online
    backendIsReachable = true;

    // Trigger health check (simulating periodic ping)
    await act(async () => {
      const ok = await checkHealth();
      expect(ok).toBe(true);
    });

    // Card should automatically refetch and render the report without a page reload or clicking Retry!
    expect(await screen.findByText(/AI-written, numbers computed from your data/i)).toBeTruthy();
  });

  // Test e: The offline banner appears and disappears with the health status
  it('e. the offline banner appears and disappears with the health status', async () => {
    let healthStatus = false;

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/health')) {
        if (healthStatus) {
          return Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
        }
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(<App />);

    // Health was checked on mount (failed)
    expect(await screen.findByTestId('backend-offline-banner')).toBeTruthy();
    expect(screen.getByText(/The backend is not reachable/i)).toBeTruthy();

    // Health becomes online
    healthStatus = true;
    await act(async () => {
      await checkHealth();
    });

    // Offline banner disappeared!
    expect(screen.queryByTestId('backend-offline-banner')).toBeNull();
  });
});
