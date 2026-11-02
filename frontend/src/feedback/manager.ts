import type { RepResult, RuleSeverity } from '../engine/types';
import { getTranslatedMessage, type SupportedLanguage } from './messages';

export interface FeedbackResult {
  message: string;
  ruleId?: string;
  severity?: RuleSeverity;
  isPositive: boolean;
}

const SEVERITY_RANK: Record<RuleSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export class FeedbackManager {
  private readonly cooldownMs: number;
  private readonly repeatWindowMs: number;
  private lastEmittedTimeMs: number | null = null;
  private lastMessageKey: string | null = null;
  private lastEmittedTimes: Map<string, number> = new Map();
  private lastFeedbackResult: FeedbackResult | null = null;

  constructor(cooldownMs = 3000, repeatWindowMs = 8000) {
    this.cooldownMs = cooldownMs;
    this.repeatWindowMs = repeatWindowMs;
  }

  /**
   * Evaluates a completed rep and decides whether to emit a feedback message.
   *
   * @param rep The completed rep object including violations and score
   * @param currentTimeMs Current timestamp in milliseconds
   * @param language Output language (defaults to 'en-US')
   * @returns The single message to show/speak, or null if throttled/no message
   */
  public processRep(
    rep: RepResult,
    currentTimeMs: number,
    language: SupportedLanguage = 'en-US'
  ): FeedbackResult | null {
    // 1. General cooldown check: minimum 3000 ms between any two messages
    if (
      this.lastEmittedTimeMs !== null &&
      currentTimeMs - this.lastEmittedTimeMs < this.cooldownMs
    ) {
      return null;
    }

    // 2. Prioritize form violations if any occurred
    if (rep.violations && rep.violations.length > 0) {
      // Sort violations: highest severity first, then highest penalty
      const sortedViolations = [...rep.violations].sort((a, b) => {
        const rankA = SEVERITY_RANK[a.severity] ?? 0;
        const rankB = SEVERITY_RANK[b.severity] ?? 0;
        if (rankB !== rankA) {
          return rankB - rankA;
        }
        return b.penalty - a.penalty;
      });

      // Find highest severity violation that satisfies repeat window:
      // The same message may be repeated only after repeatWindowMs (8000 ms),
      // different messages only need the normal cooldown (3000 ms).
      const candidate = sortedViolations.find((v) => {
        const lastSpoken = this.lastEmittedTimes.get(v.ruleId);
        if (lastSpoken === undefined) return true;
        return currentTimeMs - lastSpoken >= this.repeatWindowMs;
      });

      if (!candidate) {
        return null;
      }

      const text = getTranslatedMessage(candidate.ruleId, language);
      const result: FeedbackResult = {
        message: text,
        ruleId: candidate.ruleId,
        severity: candidate.severity,
        isPositive: false,
      };

      this.lastEmittedTimeMs = currentTimeMs;
      this.lastMessageKey = candidate.ruleId;
      this.lastEmittedTimes.set(candidate.ruleId, currentTimeMs);
      this.lastFeedbackResult = result;
      return result;
    }

    // 3. Emit positive message if score is >= 90 and no violation fired
    if (rep.score >= 90 && (!rep.violations || rep.violations.length === 0)) {
      const lastSpoken = this.lastEmittedTimes.get('good_rep');
      if (lastSpoken !== undefined && currentTimeMs - lastSpoken < this.repeatWindowMs) {
        // Same positive message cannot be repeated within repeatWindowMs
        return null;
      }

      const text = getTranslatedMessage('good_rep', language);
      const result: FeedbackResult = {
        message: text,
        ruleId: 'good_rep',
        isPositive: true,
      };

      this.lastEmittedTimeMs = currentTimeMs;
      this.lastMessageKey = 'good_rep';
      this.lastEmittedTimes.set('good_rep', currentTimeMs);
      this.lastFeedbackResult = result;
      return result;
    }

    // Score < 90 without violations -> no message
    return null;
  }

  public getLastMessage(): FeedbackResult | null {
    return this.lastFeedbackResult;
  }

  public getLastMessageKey(): string | null {
    return this.lastMessageKey;
  }

  public reset(): void {
    this.lastEmittedTimeMs = null;
    this.lastMessageKey = null;
    this.lastEmittedTimes.clear();
    this.lastFeedbackResult = null;
  }
}
