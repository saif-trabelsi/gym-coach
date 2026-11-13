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
import { Card } from './kit/Card';
import { Button } from './kit/Button';
import { Badge } from './kit/Badge';
import { Spinner } from './kit/Spinner';
import { SegmentedControl, type SegmentedOption } from './kit/SegmentedControl';
import {
  Sparkles,
  Bot,
  Check,
  AlertCircle,
  Target,
  CheckCircle2,
  Lightbulb,
  Zap,
} from 'lucide-react';

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

  const languageOptions: SegmentedOption<ReportLanguage>[] = [
    {
      value: 'en',
      label: 'EN',
      icon: selectedLanguage === 'en' ? <Check className="w-3 h-3 text-[var(--accent)]" /> : undefined,
      disabled: isButtonsDisabled,
    },
    {
      value: 'fr',
      label: 'FR',
      icon: selectedLanguage === 'fr' ? <Check className="w-3 h-3 text-[var(--accent)]" /> : undefined,
      disabled: isButtonsDisabled,
    },
    {
      value: 'ar',
      label: 'AR',
      icon: selectedLanguage === 'ar' ? <Check className="w-3 h-3 text-[var(--accent)]" /> : undefined,
      disabled: isButtonsDisabled,
    },
  ];

  return (
    <Card
      data-testid="report-card"
      className="p-5 shadow-sm flex flex-col gap-5 border-[var(--border-subtle)]"
    >
      {/* Top Header Strip: Title, Language Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-[var(--radius-lg)] bg-[var(--accent)]/10 text-[var(--accent)]">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              AI Coaching Report
            </h2>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Personalized biomechanical analysis and progress insights
            </p>
          </div>
        </div>

        {/* Language selector (EN, FR, AR) as SegmentedControl with checkmarks */}
        <SegmentedControl
          value={selectedLanguage}
          onChange={handleLanguageChange}
          options={languageOptions}
          size="sm"
          ariaLabel="Report language"
        />
      </div>

      {/* Loading Cache State */}
      {state.status === 'loadingCache' && (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
          <Spinner size="md" />
          <span className="text-xs">Checking for coaching report...</span>
        </div>
      )}

      {/* Not Generated State (404) */}
      {state.status === 'notGenerated' && (
        <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
          <div className="p-3 rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--accent)]">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">No Report Generated Yet</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm">
              Generate an in-depth coaching report analyzing your form, fatigue trend, and areas for improvement.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleGenerate(false)}
            disabled={isButtonsDisabled || cooldownSeconds > 0}
            className="mt-1 px-4 py-2 bg-[var(--accent)] hover:opacity-90 text-[var(--accent-contrast)] text-xs font-bold rounded-[var(--radius-xl)] shadow transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <span>✨</span> Generate
          </button>
        </div>
      )}

      {/* Generating State */}
      {state.status === 'generating' && (
        <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
          <Spinner size="lg" />
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            Writing your report, this can take up to 20 seconds
          </p>
        </div>
      )}

      {/* Rate Limited State */}
      {state.status === 'rateLimited' && (
        <div className="py-6 flex flex-col items-center justify-center gap-3 text-center bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] rounded-[var(--radius-xl)] p-4">
          <span className="text-2xl">⏳</span>
          <div>
            <h3 className="text-sm font-bold text-[var(--status-warning)]">Rate Limit Reached</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 font-mono">
              Please wait {state.retryAfterSeconds} seconds
            </p>
          </div>
        </div>
      )}

      {/* Error State */}
      {state.status === 'error' && (
        <div className="py-6 flex flex-col items-center justify-center gap-3 text-center bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] rounded-[var(--radius-xl)] p-4">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="text-sm font-bold text-[var(--status-danger)]">
              {isUnreachableError
                ? 'The backend is not reachable'
                : state.error instanceof ServerError
                ? 'Server error'
                : 'Failed to load report'}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-md">
              {isUnreachableError
                ? 'The backend is not reachable. Please check your connection and ensure the server is running.'
                : state.error?.message || 'An unexpected error occurred while communicating with the server.'}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadReports()}>
            Retry
          </Button>
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
                <span className="px-3 py-1 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--accent)] font-medium flex items-center gap-1.5">
                  <span>✨</span>
                  <span>AI-written, numbers computed from your data</span>
                  <span className="font-mono text-[11px] opacity-80">({state.report.model})</span>
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] text-[var(--status-warning)] font-medium flex items-center gap-1.5">
                  <span>⚙️</span>
                  <span>Generated from your stats (offline mode)</span>
                  {state.report.fallback_reason && (
                    <span className="text-[11px] opacity-90">
                      — {fallbackReasonLabel(state.report.fallback_reason)}
                    </span>
                  )}
                </span>
              )}
            </div>

            {/* Action Buttons: Copy, Regenerate / Try AI again */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                disabled={isButtonsDisabled}
                className="px-3 py-1.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>📋</span>
                <span>{copied ? 'Copied' : 'Copy report'}</span>
              </button>

              {!state.report.is_fallback ? (
                <button
                  type="button"
                  onClick={() => handleGenerate(true)}
                  disabled={isButtonsDisabled || cooldownSeconds > 0}
                  className="px-3 py-1.5 rounded-[var(--radius-lg)] bg-[var(--accent)] hover:opacity-90 text-[var(--accent-contrast)] text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span>🔄</span>
                  <span>
                    {cooldownSeconds > 0 ? `Regenerate (${cooldownSeconds}s)` : 'Regenerate'}
                  </span>
                </button>
              ) : (
                canRetryAI(state.report.fallback_reason) && (
                  <button
                    type="button"
                    onClick={() => handleGenerate(true)}
                    disabled={isButtonsDisabled || cooldownSeconds > 0}
                    className="px-3 py-1.5 rounded-[var(--radius-lg)] bg-[var(--accent)] hover:opacity-90 text-[var(--accent-contrast)] text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] p-3.5"
          >
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-semibold text-[var(--text-muted)] tracking-wider">
                Total Reps
              </span>
              <span
                data-testid="stat-total-reps"
                className="text-base font-bold text-cyan-400 font-mono mt-0.5"
              >
                {state.report.stats.total_reps}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-semibold text-[var(--text-muted)] tracking-wider">
                Avg Score
              </span>
              <span
                data-testid="stat-avg-score"
                className="text-base font-bold text-[var(--accent)] font-mono mt-0.5"
              >
                {state.report.stats.average_score}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-semibold text-[var(--text-muted)] tracking-wider">
                Duration
              </span>
              <span
                data-testid="stat-duration"
                className="text-base font-bold text-[var(--text-primary)] font-mono mt-0.5"
              >
                {state.report.stats.duration_minutes} min
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-semibold text-[var(--text-muted)] tracking-wider">
                Top Issues
              </span>
              <div
                data-testid="stat-top-issues"
                className="text-xs text-[var(--text-secondary)] font-mono truncate mt-0.5"
              >
                {state.report.stats.top_issues && state.report.stats.top_issues.length > 0 ? (
                  state.report.stats.top_issues.map((issue) => (
                    <div key={issue.rule}>
                      {issue.rule}: {issue.count} ({issue.share}%)
                    </div>
                  ))
                ) : (
                  <span className="text-[var(--text-muted)]">None</span>
                )}
              </div>
            </div>
          </div>

          {/* Narrative Block (Arabic gets dir="rtl" and lang="ar", English/French stay "ltr") */}
          <div
            data-testid="narrative-container"
            dir={selectedLanguage === 'ar' ? 'rtl' : 'ltr'}
            lang={selectedLanguage === 'ar' ? 'ar' : selectedLanguage}
            className="flex flex-col gap-4 text-xs leading-relaxed text-[var(--text-primary)]"
          >
            {/* Summary */}
            <div className="p-3.5 bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)]">
              <p className="text-sm font-medium text-[var(--text-primary)] leading-relaxed">
                <bdi>{state.report.narrative.summary}</bdi>
              </p>
            </div>

            {/* Strengths */}
            {state.report.narrative.strengths && state.report.narrative.strengths.length > 0 && (
              <div className="bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] p-3.5 flex flex-col gap-2">
                <span className="text-[11px] font-bold text-[var(--status-success)] uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Strengths</span>
                </span>
                <ul className="space-y-1.5 text-[var(--text-secondary)] ps-1">
                  {state.report.narrative.strengths.map((strength, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[var(--status-success)] shrink-0 font-bold">•</span>
                      <bdi className="flex-1">{strength}</bdi>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Form Issues (with localized rule headings & action tips) */}
            {state.report.narrative.issues && state.report.narrative.issues.length > 0 && (
              <div className="bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] p-3.5 flex flex-col gap-3">
                <span className="text-[11px] font-bold text-[var(--status-danger)] uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Key Form Issues</span>
                </span>
                <div className="flex flex-col gap-2.5">
                  {state.report.narrative.issues.map((issue) => (
                    <div
                      key={issue.rule}
                      className="border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] rounded-[var(--radius-lg)] p-3 flex flex-col gap-1.5"
                    >
                      <div className="font-semibold text-[var(--status-danger)] flex items-center gap-2">
                        <Badge variant="danger" size="sm">
                          {issue.rule}
                        </Badge>
                        <span>•</span>
                        <span>{resolveRuleHeading(issue.rule)}</span>
                      </div>
                      <p className="text-[var(--text-primary)] text-xs mt-0.5">
                        <bdi>{issue.explanation}</bdi>
                      </p>
                      <div className="text-[var(--status-warning)] text-xs mt-1 font-medium flex items-start gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <bdi className="flex-1">{issue.tip}</bdi>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Session Focus */}
            {state.report.narrative.next_session && state.report.narrative.next_session.length > 0 && (
              <div className="bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] p-3.5 flex flex-col gap-2">
                <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 shrink-0" />
                  <span>Focus for Next Session</span>
                </span>
                <ul className="space-y-1.5 text-[var(--text-secondary)] ps-1">
                  {state.report.narrative.next_session.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-cyan-400 shrink-0 font-bold">•</span>
                      <bdi className="flex-1">{item}</bdi>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Fatigue Note */}
            {state.report.narrative.fatigue_note && (
              <div className="text-[11px] text-[var(--text-muted)] italic border-t border-[var(--border-subtle)] pt-2.5 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <bdi>{state.report.narrative.fatigue_note}</bdi>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
