import React, { useEffect, useReducer, useState } from 'react';
import {
  getReport,
  generateReport,
  type ReportLanguage,
  type ReportRead,
  NetworkError,
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

  // Sync state if sessionId or initialLanguage changes
  useEffect(() => {
    setSelectedLanguage(initialLanguage);
    dispatch({ type: 'RESET', sessionId, language: initialLanguage });
  }, [sessionId, initialLanguage]);

  // Load report on mount or language change (GET only)
  useEffect(() => {
    let isCancelled = false;
    const lang = selectedLanguage;

    // Check in-memory cache first
    const cached = getCachedReport(sessionId, lang);
    if (cached) {
      // Re-trigger start fetch cache to get the correct requestKey, then resolve immediately
      dispatch({ type: 'START_FETCH_CACHE', sessionId, language: lang });
      // Construct expected key: `${sessionId}_${lang}_${state.counter + 1}`
      const reqKey = `${sessionId}_${lang}_${state.counter + 1}`;
      dispatch({ type: 'CACHE_FOUND', requestKey: reqKey, report: cached });
      return;
    }

    dispatch({ type: 'START_FETCH_CACHE', sessionId, language: lang });
    const reqKey = `${sessionId}_${lang}_${state.counter + 1}`;

    getReport(sessionId, lang)
      .then((report) => {
        if (isCancelled) return;
        if (report) {
          setCachedReport(sessionId, lang, report);
          dispatch({ type: 'CACHE_FOUND', requestKey: reqKey, report });
        } else {
          dispatch({ type: 'CACHE_NOT_FOUND', requestKey: reqKey });
        }
      })
      .catch((err: Error) => {
        if (isCancelled) return;
        dispatch({ type: 'FETCH_ERROR', requestKey: reqKey, error: err });
      });

    return () => {
      isCancelled = true;
    };
  }, [sessionId, selectedLanguage]);

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
    if (state.status === 'generating') return; // Prevent double submission

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
            disabled={isButtonsDisabled}
            className="mt-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition-all flex items-center gap-2"
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
              {state.error instanceof NetworkError
                ? 'Backend unreachable'
                : state.error instanceof ServerError
                ? 'Server error'
                : 'Failed to load report'}
            </h3>
            <p className="text-xs text-rose-200/80 mt-1 max-w-md">
              {state.error?.message || 'An unexpected error occurred while communicating with the server.'}
            </p>
          </div>
          <button
            onClick={() => {
              if (state.report) {
                handleGenerate(true);
              } else {
                // Retry checking cache
                setSelectedLanguage((prev) => prev);
                dispatch({ type: 'START_FETCH_CACHE', sessionId, language: selectedLanguage });
                const reqKey = `${sessionId}_${selectedLanguage}_${state.counter + 1}`;
                getReport(sessionId, selectedLanguage)
                  .then((r) => {
                    if (r) dispatch({ type: 'CACHE_FOUND', requestKey: reqKey, report: r });
                    else dispatch({ type: 'CACHE_NOT_FOUND', requestKey: reqKey });
                  })
                  .catch((e) => dispatch({ type: 'FETCH_ERROR', requestKey: reqKey, error: e }));
              }
            }}
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
                  disabled={isButtonsDisabled}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>🔄</span>
                  <span>Regenerate</span>
                </button>
              ) : (
                canRetryAI(state.report.fallback_reason) && (
                  <button
                    onClick={() => handleGenerate(true)}
                    disabled={isButtonsDisabled}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span>🔄</span>
                    <span>Try AI again</span>
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
              <div className="flex flex-col gap-1.5 bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-3">
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                  {selectedLanguage === 'ar' ? 'نقاط القوة' : selectedLanguage === 'fr' ? 'Points forts' : 'Strengths'}
                </span>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  {state.report.narrative.strengths.map((str, idx) => (
                    <li key={idx}>
                      <bdi>{str}</bdi>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Issue Cards */}
            {state.report.narrative.issues && state.report.narrative.issues.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                  {selectedLanguage === 'ar'
                    ? 'مجالات التحسين'
                    : selectedLanguage === 'fr'
                    ? 'Axes d’amélioration'
                    : 'Areas for Improvement'}
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {state.report.narrative.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-3.5 flex flex-col gap-2"
                    >
                      <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                        <span className="text-amber-400">⚠️</span>
                        <bdi>{resolveRuleHeading(issue.rule)}</bdi>
                      </h4>
                      <p className="text-slate-300 text-[11px]">
                        <bdi>{issue.explanation}</bdi>
                      </p>
                      <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2 text-[11px] text-amber-200/90">
                        <strong>
                          {selectedLanguage === 'ar' ? 'نصيحة: ' : selectedLanguage === 'fr' ? 'Conseil : ' : 'Tip: '}
                        </strong>
                        <bdi>{issue.tip}</bdi>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Session Steps */}
            {state.report.narrative.next_session && state.report.narrative.next_session.length > 0 && (
              <div className="flex flex-col gap-1.5 bg-indigo-950/20 border border-indigo-900/30 rounded-xl p-3">
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                  {selectedLanguage === 'ar'
                    ? 'الخطوات للجلسة القادمة'
                    : selectedLanguage === 'fr'
                    ? 'Pour la prochaine séance'
                    : 'Next Session'}
                </span>
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  {state.report.narrative.next_session.map((step, idx) => (
                    <li key={idx}>
                      <bdi>{step}</bdi>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Fatigue Note Callout */}
            {state.report.narrative.fatigue_note && (
              <div className="bg-slate-800/50 border-l-4 border-cyan-500 rounded-r-xl p-3 text-[11px] text-slate-300">
                <strong className="text-cyan-400 block mb-0.5">
                  {selectedLanguage === 'ar'
                    ? 'تحليل التعب والإرهاق'
                    : selectedLanguage === 'fr'
                    ? 'Analyse de fatigue'
                    : 'Fatigue Analysis'}
                </strong>
                <p>
                  <bdi>{state.report.narrative.fatigue_note}</bdi>
                </p>
              </div>
            )}

            {/* Generated Timestamp */}
            <div className="text-[11px] text-slate-500 flex justify-between items-center pt-1 border-t border-slate-800/60">
              <span>
                Generated: <bdi>{new Date(state.report.created_at).toLocaleString()}</bdi>
              </span>
            </div>
          </div>

          {/* Small Note Under Narrative */}
          <p className="text-[11px] text-slate-500 italic mt-1">
            Numbers are computed from your saved reps. The text is written by an AI and may be imperfect.
          </p>
        </div>
      )}
    </div>
  );
};
