export type ScoreTone = 'good' | 'warn' | 'bad';

/**
 * Maps a score (0 to 100) to its semantic tone according to the design system:
 * - 85 and above: "good" (emerald)
 * - 70 to 84: "warn" (amber)
 * - below 70: "bad" (rose)
 */
export function scoreTone(score: number): ScoreTone {
  if (score >= 85) {
    return 'good';
  }
  if (score >= 70) {
    return 'warn';
  }
  return 'bad';
}

/**
 * Returns Tailwind/CSS token classes for a given score tone.
 */
export function scoreClasses(tone: ScoreTone) {
  switch (tone) {
    case 'good':
      return {
        text: 'text-[var(--score-good)]',
        bg: 'bg-[var(--score-good-bg)]',
        border: 'border-[var(--score-good-border)]',
        fill: 'var(--score-good)',
      };
    case 'warn':
      return {
        text: 'text-[var(--score-warn)]',
        bg: 'bg-[var(--score-warn-bg)]',
        border: 'border-[var(--score-warn-border)]',
        fill: 'var(--score-warn)',
      };
    case 'bad':
      return {
        text: 'text-[var(--score-bad)]',
        bg: 'bg-[var(--score-bad-bg)]',
        border: 'border-[var(--score-bad-border)]',
        fill: 'var(--score-bad)',
      };
  }
}
