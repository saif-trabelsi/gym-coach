import { describe, it, expect } from 'vitest';
import type { ReportRead, FallbackReason } from '../api/client';
import {
  reportReducer,
  createInitialReportState,
  retryAfterToSeconds,
} from './reportState';
import {
  fallbackReasonLabel,
  canRetryAI,
  formatReportAsText,
} from './format';

const sampleReport: ReportRead = {
  session_id: 42,
  language: 'en',
  created_at: '2026-11-05T10:00:00Z',
  provider: 'gemini',
  model: 'gemini-2.5-flash-lite',
  is_fallback: false,
  fallback_reason: null,
  stats: {
    total_reps: 12,
    average_score: 88.5,
    duration_minutes: 6.2,
    exercises: ['squat'],
    top_issues: [{ rule: 'depth', count: 3, share: 25.0 }],
    sets: [],
  },
  narrative: {
    summary: 'Strong squat session with solid tempo.',
    strengths: ['Great chest posture', 'Consistent descent speed'],
    issues: [
      {
        rule: 'depth',
        explanation: 'Some reps did not reach parallel depth.',
        tip: 'Focus on sinking your hips slightly lower.',
      },
    ],
    next_session: [
      'Warm up hip flexors before starting.',
      'Aim for 90-degree depth on all sets.',
    ],
    fatigue_note: 'Mild fatigue detected in the final 3 reps.',
  },
};

describe('Task 5.2 - State and formatting helpers (reports.test.ts)', () => {
  // a. reducer: idle goes to loadingCache, then notGenerated on 404, then generating, then ready on success.
  it('a. reducer transitions: idle -> loadingCache -> notGenerated -> generating -> ready', () => {
    let state = createInitialReportState(42, 'en');
    expect(state.status).toBe('idle');

    // 1. Start fetching cache
    state = reportReducer(state, {
      type: 'START_FETCH_CACHE',
      sessionId: 42,
      language: 'en',
    });
    expect(state.status).toBe('loadingCache');
    const cacheReqKey = state.requestKey;

    // 2. Cache 404 (not found)
    state = reportReducer(state, {
      type: 'CACHE_NOT_FOUND',
      requestKey: cacheReqKey,
    });
    expect(state.status).toBe('notGenerated');

    // 3. User clicks generate
    state = reportReducer(state, {
      type: 'START_GENERATE',
      sessionId: 42,
      language: 'en',
    });
    expect(state.status).toBe('generating');
    const genReqKey = state.requestKey;

    // 4. Generate success
    state = reportReducer(state, {
      type: 'GENERATE_SUCCESS',
      requestKey: genReqKey,
      report: sampleReport,
    });
    expect(state.status).toBe('ready');
    expect(state.report).toEqual(sampleReport);
  });

  // b. stale response: a fr response arriving after the user switched to ar is ignored and the state stays on the ar request.
  it('b. stale response: a fr response arriving after switching to ar is ignored', () => {
    let state = createInitialReportState(42, 'en');

    // User switches to FR
    state = reportReducer(state, {
      type: 'START_FETCH_CACHE',
      sessionId: 42,
      language: 'fr',
    });
    const frReqKey = state.requestKey;
    expect(state.language).toBe('fr');
    expect(state.status).toBe('loadingCache');

    // User immediately switches to AR
    state = reportReducer(state, {
      type: 'START_FETCH_CACHE',
      sessionId: 42,
      language: 'ar',
    });
    const arReqKey = state.requestKey;
    expect(state.language).toBe('ar');
    expect(state.status).toBe('loadingCache');

    // Delayed FR response arrives with old key
    state = reportReducer(state, {
      type: 'CACHE_FOUND',
      requestKey: frReqKey,
      report: { ...sampleReport, language: 'fr' },
    });

    // Must be ignored! State must still be loadingCache for AR
    expect(state.status).toBe('loadingCache');
    expect(state.language).toBe('ar');
    expect(state.requestKey).toBe(arReqKey);
    expect(state.report).toBeNull();
  });

  // c. retryAfterToSeconds: "7" gives 7, "" gives 10, "abc" gives 10, "0" gives 10, "-3" gives 10.
  it('c. retryAfterToSeconds parses valid positive integers and falls back to 10', () => {
    expect(retryAfterToSeconds('7')).toBe(7);
    expect(retryAfterToSeconds('')).toBe(10);
    expect(retryAfterToSeconds('abc')).toBe(10);
    expect(retryAfterToSeconds('0')).toBe(10);
    expect(retryAfterToSeconds('-3')).toBe(10);
    expect(retryAfterToSeconds(null)).toBe(10);
    expect(retryAfterToSeconds(undefined)).toBe(10);
  });

  // e. fallbackReasonLabel returns the five exact messages above, canRetryAI is false only for no_api_key.
  it('e. fallbackReasonLabel returns exact 5 messages and canRetryAI is false only for no_api_key', () => {
    expect(fallbackReasonLabel('no_api_key')).toBe('No AI key is configured');
    expect(fallbackReasonLabel('timeout')).toBe('The AI service took too long');
    expect(fallbackReasonLabel('rate_limited')).toBe('The AI service is busy');
    expect(fallbackReasonLabel('provider_error')).toBe('The AI service is unavailable');
    expect(fallbackReasonLabel('invalid_output')).toBe(
      'The AI answer was not usable, showing the standard report'
    );

    expect(canRetryAI('no_api_key')).toBe(false);
    expect(canRetryAI('timeout')).toBe(true);
    expect(canRetryAI('rate_limited')).toBe(true);
    expect(canRetryAI('provider_error')).toBe(true);
    expect(canRetryAI('invalid_output')).toBe(true);
    expect(canRetryAI(null as unknown as FallbackReason)).toBe(true);
  });

  // f. formatReportAsText includes the summary, every strength, every issue tip and every next session step, in order, and contains no HTML.
  it('f. formatReportAsText includes summary, strengths, issue tips, next steps in order and has no HTML', () => {
    const formatted = formatReportAsText(sampleReport);

    // Contains no HTML tags
    expect(formatted).not.toMatch(/<[^>]+>/);

    // Includes all parts
    expect(formatted).toContain(sampleReport.narrative.summary);
    for (const s of sampleReport.narrative.strengths) {
      expect(formatted).toContain(s);
    }
    for (const issue of sampleReport.narrative.issues) {
      expect(formatted).toContain(issue.tip);
    }
    for (const step of sampleReport.narrative.next_session) {
      expect(formatted).toContain(step);
    }
    expect(formatted).toContain(sampleReport.narrative.fatigue_note);

    // Verify ordering
    const summaryIdx = formatted.indexOf(sampleReport.narrative.summary);
    const strengthIdx = formatted.indexOf(sampleReport.narrative.strengths[0]);
    const issueTipIdx = formatted.indexOf(sampleReport.narrative.issues[0].tip);
    const nextStepIdx = formatted.indexOf(sampleReport.narrative.next_session[0]);
    const fatigueIdx = formatted.indexOf(sampleReport.narrative.fatigue_note);

    expect(summaryIdx).toBeGreaterThan(-1);
    expect(strengthIdx).toBeGreaterThan(summaryIdx);
    expect(issueTipIdx).toBeGreaterThan(strengthIdx);
    expect(nextStepIdx).toBeGreaterThan(issueTipIdx);
    expect(fatigueIdx).toBeGreaterThan(nextStepIdx);
  });
});
