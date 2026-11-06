import React, { useEffect, useReducer, useState, useCallback, useRef } from 'react';
import {
  getAllReports,
  generateReport,
  subscribeHealth,
  type ReportLanguage,
  type ReportRead,
  NetworkError,
  NotFoundError,
  ServerError,
  RateLimitError,
} from '../api/client';
import {
  createInitialReportState,
  reportReducer,
} from '../reports/reportState';
import {
  canRetryAI,
  fallbackReasonLabel,
  formatReportAsText,
} from '../reports/format';
import { getTranslatedMessage, type SupportedLanguage } from '../feedback/messages';

// In-memory cache per (session id, language) across component mounts in this page visit
const reportMemoryCache = new Map<string, ReportRead>();

export function getCachedReport(sessionId: number, language: ReportLanguage): ReportRead | undefined {
  return reportMemoryCache.get(`${sessionId}:${language}`);
}

export function setCachedReport(sessionId: number, language: ReportLanguage, report: ReportRead): void {
  reportMemoryCache.set(`${sessionId}:${language}`, report);
}

export function clearReportCache(): void {
  reportMemoryCache.clear();
}

interface ReportCardProps {
  sessionId: number;
  initialLanguage?: ReportLanguage;
}

export const ReportCard: React.FC<ReportCardProps> = ({
  sessionId,
  initialLanguage = 'en',
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState<ReportLanguage>(initialLanguage);
  const [state, dispatch] = useReducer(
    reportReducer,
    createInitialReportState(sessionId, initialLanguage)
  );
  const [copied, setCopied] = useState<boolean>(false);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const sessionFetchedRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Sync state if sessionId or initialLanguage changes
  useEffect(() => {
    setSelectedLanguage(initialLanguage);
    sessionFetchedRef.current = null;
    dispatch({ type: 'RESET', sessionId, language: initialLanguage });
  }, [sessionId, initialLanguage]);

  // Load reports for the session
  const loadReports = useCallback(() => {
    const lang = selectedLanguage;
    const cached = getCachedReport(sessionId, lang);
    if (cached) {
      dispatch({ type: 'START_FETCH_CACHE', sessionId, language: lang });
      const reqKey = `${sessionId}_${lang}_${stateRef.current.counter + 1}`;
      dispatch({ type: 'CACHE_FOUND', requestKey: reqKey, report: cached });
      return;
    }

    dispatch({ type: 'START_FETCH_CACHE', sessionId, language: lang });
    const reqKey = `${sessionId}_${lang}_${stateRef.current.counter + 1}`;

    getAllReports(sessionId)
      .then((data) => {
        sessionFetchedRef.current = sessionId;
        if (data.reports) {
          for (const [l, r] of Object.entries(data.reports)) {
            if (r) {
              setCachedReport(sessionId, l as ReportLanguage, r);
            }
          }
          const activeReport = data.reports[lang];
          if (activeReport) {
            dispatch({ type: 'CACHE_FOUND', requestKey: reqKey, report: activeReport });
          } else {
            dispatch({ type: 'CACHE_NOT_FOUND', requestKey: reqKey });
          }
        }
      })
      .catch((err: Error) => {
        if (err instanceof NotFoundError) {
          dispatch({ type: 'CACHE_NOT_FOUND', requestKey: reqKey });
        } else {
          dispatch({ type: 'FETCH_ERROR', requestKey: reqKey, error: err });
        }
      });
  }, [sessionId, selectedLanguage]);

  // On mount or sessionId/language change
  useEffect(() => {
    const cached = getCachedReport(sessionId, selectedLanguage);
    if (cached) {
      dispatch({ type: 'START_FETCH_CACHE', sessionId, language: selectedLanguage });
      const reqKey = `${sessionId}_${selectedLanguage}_${state.counter + 1}`;
      dispatch({ type: 'CACHE_FOUND', requestKey: reqKey, report: cached });
    } else if (sessionFetchedRef.current === sessionId) {
      // Session was already fetched from server, and this language was not in the collection
      const reqKey = `${sessionId}_${selectedLanguage}_${state.counter + 1}`;
      dispatch({ type: 'CACHE_NOT_FOUND', requestKey: reqKey });
    } else {
      loadReports();
    }
  }, [sessionId, selectedLanguage, loadReports]);

  // Subscribe to health check: if backend recovers from offline to online, refetch!
  useEffect(() => {
    const unsubscribe = subscribeHealth((online) => {
      if (online) {
        loadReports();
      }
    });
    return unsubscribe;
  }, [loadReports]);

  // Cooldown calculation: 10s cooldown after generation computed from report created_at
  useEffect(() => {
    if (!state.report?.created_at) {
      setCooldownSeconds(0);
      return;
    }

    const createdAtMs = new Date(state.report.created_at).getTime();
    if (isNaN(createdAtMs)) {
      setCooldownSeconds(0);
      return;
    }

    const calcRemaining = () => {
      const nowMs = Date.now();
      // Tolerant to clock differences: if nowMs < createdAtMs, elapsed is 0, remaining is 10
      const elapsed = Math.max(0, (nowMs - createdAtMs) / 1000);
      if (elapsed >= 10.0) return 0;
      return Math.min(10, Math.max(0, Math.ceil(10.0 - elapsed)));
    };

    const initial = calcRemaining();
    setCooldownSeconds(initial);
    if (initial <= 0) return;

    const timer = setInterval(() => {
      const rem = calcRemaining();
      setCooldownSeconds(rem);
      if (rem <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [state.report?.created_at, state.report?.language, state.status]);

  // Live countdown timer for rate-limited state
  useEffect(() => {
    if (state.status !== 'rateLimited' || state.retryAfterSeconds <= 0) return;

    const timer = setInterval(() => {
      dispatch({ type: 'TICK_COUNTDOWN' });
    }, 1000);

    return () => clearInterval(timer);
  }, [state.status, state.retryAfterSeconds]);

  // Trigger report generation (POST)
  const handleGenerate = async (force = false) => {
    if (state.status === 'generating' || cooldownSeconds > 0) return;

    const lang = selectedLanguage;
    dispatch({ type: 'START_GENERATE', sessionId, language: lang, force });
    const reqKey = `${sessionId}_${lang}_${state.counter + 1}`;

    try {
      const report = await generateReport(sessionId, lang, force);
      setCachedReport(sessionId, lang, report);
      dispatch({ type: 'GENERATE_SUCCESS', requestKey: reqKey, report });
    } catch (err: unknown) {
      if (err instanceof RateLimitError) {
        dispatch({
          type: 'RATE_LIMITED',
          requestKey: reqKey,
          retryAfterSeconds: err.retryAfterSeconds,
        });
      } else {
        dispatch({
          type: 'FETCH_ERROR',
          requestKey: reqKey,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
  };

  const handleCopy = async () => {
    if (!state.report) return;
    try {
      const text = formatReportAsText(state.report);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures
    }
  };

  const handleLanguageChange = (lang: ReportLanguage) => {
    if (lang === selectedLanguage || state.status === 'generating') return;
    setSelectedLanguage(lang);
  };

  // Helper to resolve coaching message for rule id
  const resolveRuleHeading = (ruleId: string): string => {
    const feedbackLang: SupportedLanguage =
      selectedLanguage === 'fr' ? 'fr-FR' : selectedLanguage === 'ar' ? 'ar' : 'en-US';
    return getTranslatedMessage(ruleId, feedbackLang);
  };

  const isButtonsDisabled = state.status === 'generating' || state.status === 'rateLimited';

  const isUnreachableError =
    state.error instanceof NetworkError ||
    (state.error?.message &&
      (state.error.message.toLowerCase().includes('backend unreachable') ||
        state.error.message.toLowerCase().includes('not reachable') ||
        state.error.message.toLowerCase().includes('failed to fetch')));

  return (
    <div
      data-testid="report-card"
      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-5 text-slate-200"
    >
      {/* Top Header Strip: Title, Language Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <h2 className="text-base font-bold text-white">AI Coaching Report</h2>
        </div>

        {/* Language selector (EN, FR, AR) */}
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/80">
          {(['en', 'fr', 'ar'] as ReportLanguage[]).map((lang) => (
            <button
              key={lang}
              onClick={() => handleLanguageChange(lang)}
              disabled={isButtonsDisabled}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg uppercase transition-all ${
                selectedLanguage === lang
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              } ${isButtonsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      {/* Loading Cache State */}
      {state.status === 'loadingCache' && (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Checking for coaching report...</span>
        </div>
      )}

      {/* Not Generated State (404) */}
      {state.status === 'notGenerated' && (
        <div className="py-6 flex flex-col items-center justify-center gap-3 text-center">
          <span className="text-3xl">📋</span>
          <div>
            <h3 className="text-sm font-semibold text-white">No Report Generated Yet</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Generate an in-depth coaching report analyzing your form, fatigue trend, and areas for improvement.
            </p>
          </div>
          <button
            onClick={() => handleGenerate(false)}
            disabled={isButtonsDisabled || cooldownSeconds > 0}
            className="mt-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <span>✨</span> Generate
          </button>
        </div>
      )}

      {/* Generating State */}
      {state.status === 'generating' && (
        <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-6 h-6 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-slate-300">
            Writing your report, this can take up to 20 seconds
          </p>
        </div>
      )}

      {/* Rate Limited State */}
      {state.status === 'rateLimited' && (
        <div className="py-6 flex flex-col items-center justify-center gap-3 text-center bg-amber-950/20 border border-amber-900/40 rounded-xl p-4">
          <span className="text-2xl">⏳</span>
          <div>
            <h3 className="text-sm font-bold text-amber-300">Rate Limit Reached</h3>
            <p className="text-xs text-amber-200/80 mt-1 font-mono">
              Please wait {state.retryAfterSeconds} seconds
            </p>
          </div>
        </div>
      )}

      {/* Error State */}
      {state.status === 'error' && (
        <div className="py-6 flex flex-col items-center justify-center gap-3 text-center bg-rose-950/20 border border-rose-900/40 rounded-xl p-4">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="text-sm font-bold text-rose-300">
              {isUnreachableError
                ? 'The backend is not reachable'
                : state.error instanceof ServerError
                ? 'Server error'
                : 'Failed to load report'}
            </h3>
            <p className="text-xs text-rose-200/80 mt-1 max-w-md">
              {isUnreachableError
                ? 'The backend is not reachable. Please check your connection and ensure the server is running.'
                : state.error?.message || 'An unexpected error occurred while communicating with the server.'}
            </p>
          </div>
          <button
            onClick={() => loadReports()}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {/* Ready State */}
      {(state.status === 'ready' || (state.status === 'rateLimited' && state.report)) && state.report && (
        <div className="flex flex-col gap-5">
          {/* Badge & Action Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {!state.report.is_fallback ? (
                <span className="px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 font-medium flex items-center gap-1.5">
                  <span>✨</span>
                  <span>AI-written, numbers computed from your data</span>
                  <span className="font-mono text-[11px] text-emerald-400">({state.report.model})</span>
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-amber-950/60 border border-amber-800/60 text-amber-300 font-medium flex items-center gap-1.5">
                  <span>⚙️</span>
                  <span>Generated from your stats (offline mode)</span>
                  {state.report.fallback_reason && (
                    <span className="text-[11px] text-amber-400">
                      — {fallbackReasonLabel(state.report.fallback_reason)}
                    </span>
                  )}
                </span>
              )}
            </div>

            {/* Action Buttons: Copy, Regenerate / Try AI again */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                disabled={isButtonsDisabled}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition-all flex items-center gap-1.5"
              >
                <span>📋</span>
                <span>{copied ? 'Copied' : 'Copy report'}</span>
              </button>

              {!state.report.is_fallback ? (
                <button
                  onClick={() => handleGenerate(true)}
                  disabled={isButtonsDisabled || cooldownSeconds > 0}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>🔄</span>
                  <span>
                    {cooldownSeconds > 0 ? `Regenerate (${cooldownSeconds}s)` : 'Regenerate'}
                  </span>
                </button>
              ) : (
                canRetryAI(state.report.fallback_reason) && (
                  <button
                    onClick={() => handleGenerate(true)}
                    disabled={isButtonsDisabled || cooldownSeconds > 0}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span>🔄</span>
                    <span>
                      {cooldownSeconds > 0 ? `Try AI again (${cooldownSeconds}s)` : 'Try AI again'}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Stats Strip built ONLY from stats object */}
          <div
            data-testid="stats-strip"
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5"
          >
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Total Reps</span>
              <span data-testid="stat-total-reps" className="text-base font-bold text-cyan-400 font-mono">
                {state.report.stats.total_reps}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Avg Score</span>
              <span data-testid="stat-avg-score" className="text-base font-bold text-emerald-400 font-mono">
                {state.report.stats.average_score}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Duration</span>
              <span data-testid="stat-duration" className="text-base font-bold text-indigo-400 font-mono">
                {state.report.stats.duration_minutes} min
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Top Issues</span>
              <div data-testid="stat-top-issues" className="text-xs text-slate-300 font-mono truncate">
                {state.report.stats.top_issues && state.report.stats.top_issues.length > 0 ? (
                  state.report.stats.top_issues.map((issue) => (
                    <div key={issue.rule}>
                      {issue.rule}: {issue.count} ({issue.share}%)
                    </div>
                  ))
                ) : (
                  <span className="text-slate-500">None</span>
                )}
              </div>
            </div>
          </div>

          {/* Narrative Block (Arabic gets dir="rtl" and lang="ar", English/French stay "ltr") */}
          <div
            data-testid="narrative-container"
            dir={selectedLanguage === 'ar' ? 'rtl' : 'ltr'}
            lang={selectedLanguage === 'ar' ? 'ar' : selectedLanguage}
            className="flex flex-col gap-4 text-xs leading-relaxed"
          >
            {/* Summary */}
            <div className="text-slate-200">
              <p className="text-sm font-medium text-slate-100">
                <bdi>{state.report.narrative.summary}</bdi>
              </p>
            </div>

            {/* Strengths */}
            {state.report.narrative.strengths && state.report.narrative.strengths.length > 0 && (
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>💪</span> Strengths
                </span>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  {state.report.narrative.strengths.map((strength, i) => (
                    <li key={i}>
                      <bdi>{strength}</bdi>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Form Issues (with localized rule headings & action tips) */}
            {state.report.narrative.issues && state.report.narrative.issues.length > 0 && (
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-2.5">
                <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🎯</span> Key Form Issues
                </span>
                <div className="flex flex-col gap-2">
                  {state.report.narrative.issues.map((issue) => (
                    <div
                      key={issue.rule}
                      className="border border-rose-900/30 bg-rose-950/10 rounded-lg p-2.5 flex flex-col gap-1"
                    >
                      <div className="font-semibold text-rose-300 flex items-center gap-1.5">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800/50">
                          {issue.rule}
                        </span>
                        <span>•</span>
                        <span>{resolveRuleHeading(issue.rule)}</span>
                      </div>
                      <p className="text-slate-300 text-xs">
                        <bdi>{issue.explanation}</bdi>
                      </p>
                      <div className="text-amber-300/90 text-xs mt-0.5 font-medium flex items-start gap-1">
                        <span>💡</span>
                        <bdi>{issue.tip}</bdi>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Session Focus */}
            {state.report.narrative.next_session && state.report.narrative.next_session.length > 0 && (
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🎯</span> Focus for Next Session
                </span>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  {state.report.narrative.next_session.map((item, i) => (
                    <li key={i}>
                      <bdi>{item}</bdi>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Fatigue Note */}
            {state.report.narrative.fatigue_note && (
              <div className="text-[11px] text-slate-400 italic border-t border-slate-800/60 pt-2 flex items-center gap-1.5">
                <span>⚡</span>
                <bdi>{state.report.narrative.fatigue_note}</bdi>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
