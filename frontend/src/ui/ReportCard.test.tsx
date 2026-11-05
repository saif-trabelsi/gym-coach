// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReportCard, clearReportCache } from './ReportCard';
import type { ReportRead } from '../api/client';

const mockAiReport: ReportRead = {
  session_id: 10,
  language: 'en',
  created_at: '2026-11-05T10:00:00Z',
  provider: 'gemini',
  model: 'gemini-2.5-flash-lite',
  is_fallback: false,
  fallback_reason: null,
  stats: {
    total_reps: 15,
    average_score: 92.5,
    duration_minutes: 8.0,
    exercises: ['squat'],
    top_issues: [{ rule: 'depth', count: 2, share: 13.3 }],
    sets: [],
  },
  narrative: {
    summary: 'Great form during all sets.',
    strengths: ['Great chest posture', 'Smooth pace'],
    issues: [
      {
        rule: 'depth',
        explanation: 'Deepen slightly at bottom',
        tip: 'Go down until thighs are parallel.',
      },
    ],
    next_session: ['Maintain tempo', 'Increase volume by 1 set'],
    fatigue_note: 'No notable fatigue detected.',
  },
};

const mockFallbackReportNoKey: ReportRead = {
  ...mockAiReport,
  is_fallback: true,
  fallback_reason: 'no_api_key',
};

const mockFallbackReportProviderError: ReportRead = {
  ...mockAiReport,
  is_fallback: true,
  fallback_reason: 'provider_error',
};

describe('ReportCard Component (ReportCard.test.tsx)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearReportCache();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    clearReportCache();
  });

  // g1. with a ready AI report the badge "AI-written, numbers computed from your data" and the model name are visible and "Regenerate" exists.
  it('g1. renders AI badge, model name, and Regenerate button for ready AI report', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(mockAiReport), { status: 200 })
    );

    render(<ReportCard sessionId={10} initialLanguage="en" />);

    expect(await screen.findByText(/AI-written, numbers computed from your data/i)).toBeTruthy();
    expect(screen.getByText(/\(gemini-2.5-flash-lite\)/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Regenerate/i })).toBeTruthy();
  });

  // g2. With a fallback report with reason no_api_key the offline badge is visible and "Try AI again" is NOT rendered.
  it('g2. offline badge rendered on no_api_key and "Try AI again" is NOT rendered', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(mockFallbackReportNoKey), { status: 200 })
    );

    render(<ReportCard sessionId={10} initialLanguage="en" />);

    expect(await screen.findByText(/Generated from your stats \(offline mode\)/i)).toBeTruthy();
    expect(screen.getByText(/No AI key is configured/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Try AI again/i })).toBeNull();
  });

  // g3. With reason provider_error "Try AI again" IS rendered.
  it('g3. "Try AI again" IS rendered on provider_error fallback', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(mockFallbackReportProviderError), { status: 200 })
    );

    render(<ReportCard sessionId={10} initialLanguage="en" />);

    expect(await screen.findByText(/The AI service is unavailable/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Try AI again/i })).toBeTruthy();
  });

  // g4. With language ar the narrative container has dir="rtl" and lang="ar" and the card container does not.
  it('g4. with language ar narrative container has dir="rtl" and lang="ar" while card container does not', async () => {
    const arReport: ReportRead = {
      ...mockAiReport,
      language: 'ar',
      narrative: {
        summary: 'جلسة ممتازة',
        strengths: ['ثبات جيد'],
        issues: [],
        next_session: ['الاستمرار على هذا الأداء', 'زيادة التكرارات'],
        fatigue_note: 'لا يوجد تعب ملحوظ',
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(arReport), { status: 200 })
    );

    render(<ReportCard sessionId={10} initialLanguage="ar" />);

    const narrativeEl = await screen.findByTestId('narrative-container');
    expect(narrativeEl.getAttribute('dir')).toBe('rtl');
    expect(narrativeEl.getAttribute('lang')).toBe('ar');

    const cardEl = screen.getByTestId('report-card');
    expect(cardEl.getAttribute('dir')).toBeNull();
  });

  // g5. Opening the card issues a GET and no POST.
  it('g5. opening the card issues a GET and no POST', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
    );
    globalThis.fetch = fetchMock;

    render(<ReportCard sessionId={10} initialLanguage="en" />);

    await screen.findByRole('button', { name: /Generate/i });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sessions/10/report?language=en'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  // g6. Clicking Generate issues exactly one POST even if clicked twice quickly.
  it('g6. clicking Generate issues exactly one POST even if clicked twice quickly', async () => {
    // 1. Initial GET returns 404
    globalThis.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'GET') {
        return Promise.resolve(new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 }));
      }
      if (options?.method === 'POST') {
        // Return a delayed response
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(new Response(JSON.stringify(mockAiReport), { status: 201 }));
          }, 50);
        });
      }
      return Promise.reject(new Error('Unknown'));
    });

    render(<ReportCard sessionId={10} initialLanguage="en" />);

    const generateBtn = await screen.findByRole('button', { name: /Generate/i });

    // Click twice rapidly
    fireEvent.click(generateBtn);
    fireEvent.click(generateBtn);

    // Wait for the report to be rendered
    await screen.findByText(/AI-written, numbers computed from your data/i);

    const postCalls = (globalThis.fetch as any).mock.calls.filter(
      (call: any[]) => call[1]?.method === 'POST'
    );
    expect(postCalls).toHaveLength(1);
  });

  // g7. A 429 shows the countdown text.
  it('g7. a 429 response shows the countdown text', async () => {
    // Initial GET returns 404
    globalThis.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'GET') {
        return Promise.resolve(new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 }));
      }
      if (options?.method === 'POST') {
        return Promise.resolve(
          new Response(JSON.stringify({ detail: 'Too many requests' }), {
            status: 429,
            headers: { 'Retry-After': '9' },
          })
        );
      }
      return Promise.reject(new Error('Unknown'));
    });

    render(<ReportCard sessionId={10} initialLanguage="en" />);

    const generateBtn = await screen.findByRole('button', { name: /Generate/i });
    fireEvent.click(generateBtn);

    expect(await screen.findByText(/Please wait 9 seconds/i)).toBeTruthy();
  });

  // h. The stats strip shows the numbers from the stats object, not from the narrative text
  it('h. stats strip displays numbers from stats object and not narrative text', async () => {
    const reportWithConflictingNarrative: ReportRead = {
      ...mockAiReport,
      stats: {
        total_reps: 20,
        average_score: 95.0,
        duration_minutes: 12.5,
        exercises: ['squat'],
        top_issues: [{ rule: 'depth', count: 4, share: 20.0 }],
        sets: [],
      },
      narrative: {
        // Purposely misleading text with totally different numbers!
        summary: 'In this session you completed 99 reps with a score of 50 in 3 minutes.',
        strengths: ['Great posture'],
        issues: [],
        next_session: ['Advice 1', 'Advice 2'],
        fatigue_note: 'None',
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(reportWithConflictingNarrative), { status: 200 })
    );

    render(<ReportCard sessionId={10} initialLanguage="en" />);

    await screen.findByTestId('stats-strip');

    // Stats strip must show stats object values: 20 reps, 95 score, 12.5 min
    expect(screen.getByTestId('stat-total-reps').textContent).toBe('20');
    expect(screen.getByTestId('stat-avg-score').textContent).toBe('95');
    expect(screen.getByTestId('stat-duration').textContent).toContain('12.5');

    // And top issues in strip
    expect(screen.getByTestId('stat-top-issues').textContent).toContain('depth: 4 (20%)');

    // Ensure narrative text contains 99 but stats strip does not
    expect(screen.getByTestId('stat-total-reps').textContent).not.toBe('99');
  });
});
