import React, { useEffect, useState, useRef } from 'react';
import type { ExerciseType } from '../../App';
import type { RepState, RepResult } from '../../engine';
import type { FeedbackResult } from '../../feedback';
import { ScoreRing } from '../kit/ScoreRing';
import { AlertTriangle, ThumbsUp } from 'lucide-react';

export interface HudOverlaysProps {
  exercise: ExerciseType;
  currentState: RepState;
  repCount: number;
  lastRep: RepResult | null;
  latestFeedback: FeedbackResult | null;
  isBodyVisible: boolean;
}

export const HudOverlays: React.FC<HudOverlaysProps> = ({
  exercise,
  currentState,
  repCount,
  lastRep,
  latestFeedback,
  isBodyVisible,
}) => {
  const [isBumping, setIsBumping] = useState<boolean>(false);
  const prevRepCountRef = useRef<number>(repCount);

  useEffect(() => {
    if (repCount > prevRepCountRef.current) {
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

      if (!prefersReducedMotion) {
        setIsBumping(true);
        const timer = setTimeout(() => setIsBumping(false), 300);
        return () => clearTimeout(timer);
      }
    }
    prevRepCountRef.current = repCount;
  }, [repCount]);

  const getStateBadge = (state: RepState) => {
    switch (state) {
      case 'idle':
        return { text: 'READY', color: 'bg-slate-800/80 text-slate-300 border-slate-700' };
      case 'descending':
        return {
          text: exercise === 'squat' ? 'DESCENDING ⬇' : 'CURLING UP ⬆',
          color: 'bg-emerald-950/80 text-emerald-300 border-emerald-600 animate-pulse',
        };
      case 'bottom':
        return {
          text: exercise === 'squat' ? 'BOTTOM DEPTH 🎯' : 'PEAK CONTRACTION 🎯',
          color: 'bg-amber-950/80 text-amber-300 border-amber-500 font-bold',
        };
      case 'ascending':
        return {
          text: exercise === 'squat' ? 'ASCENDING ⬆' : 'LOWERING ⬇',
          color: 'bg-indigo-950/80 text-indigo-300 border-indigo-500 animate-pulse',
        };
    }
  };

  const stateBadge = getStateBadge(currentState);

  return (
    <>
      {/* Landmark Visibility Warning */}
      {!isBodyVisible && (
        <div
          role="alert"
          className="absolute top-4 inset-x-4 mx-auto max-w-sm bg-amber-500/90 text-slate-950 border border-amber-300 rounded-xl px-3.5 py-2 shadow-2xl backdrop-blur-md flex items-center justify-center gap-2 z-20 animate-bounce pointer-events-none"
        >
          <AlertTriangle className="w-4 h-4 text-slate-950 shrink-0" />
          <span className="font-bold text-xs">
            {exercise === 'squat'
              ? 'Step back, full body in frame'
              : 'Keep torso and active arm in frame'}
          </span>
        </div>
      )}

      {/* Top-Left: Exercise & State Chip */}
      <div
        data-testid="hud-top-left"
        className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-[var(--radius-xl)] shadow-lg pointer-events-none"
      >
        <span className="text-xs font-bold text-white uppercase tracking-wider">
          {exercise === 'squat' ? 'Squat' : 'Curl'}
        </span>
        <span className="text-white/40">·</span>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${stateBadge.color}`}
        >
          {stateBadge.text}
        </span>
      </div>

      {/* Top-Right: Last Rep ScoreRing */}
      <div
        data-testid="hud-top-right"
        className="absolute top-3 right-3 z-10 flex items-center gap-2.5 bg-black/60 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-[var(--radius-xl)] shadow-lg pointer-events-none"
      >
        <div className="flex flex-col text-right">
          <span className="text-[10px] uppercase font-bold text-white/60">Last Rep</span>
          <span className="text-xs font-mono font-semibold text-white">
            {lastRep ? `${lastRep.score}/100` : '--'}
          </span>
        </div>
        <ScoreRing score={lastRep ? lastRep.score : 0} size={42} strokeWidth={4.5} />
      </div>

      {/* Bottom-Left: Large Rep Counter Numeral */}
      <div
        data-testid="hud-bottom-left"
        className="absolute bottom-3 left-3 z-10 flex flex-col bg-black/60 backdrop-blur-md border border-white/15 px-4 py-2 rounded-[var(--radius-xl)] shadow-lg pointer-events-none"
      >
        <span className="text-[10px] uppercase font-bold tracking-wider text-white/60">
          Reps
        </span>
        <span
          data-testid="hud-rep-counter"
          className={`text-4xl md:text-5xl font-black font-mono text-[var(--accent)] tracking-tight leading-none transition-transform duration-200 ${
            isBumping ? 'scale-125 text-emerald-300' : 'scale-100'
          }`}
        >
          {repCount}
        </span>
      </div>

      {/* Bottom-Center: Live Feedback Toast */}
      {latestFeedback && (
        <div
          data-testid="hud-feedback-toast"
          className={`absolute bottom-3 inset-x-20 mx-auto max-w-md z-10 px-4 py-2.5 rounded-[var(--radius-xl)] backdrop-blur-md border shadow-2xl flex items-center justify-center gap-2.5 transition-all duration-200 pointer-events-none ${
            latestFeedback.isPositive
              ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
              : 'bg-rose-950/80 border-rose-500/60 text-rose-200'
          }`}
        >
          {latestFeedback.isPositive ? (
            <ThumbsUp className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="font-bold text-xs md:text-sm tracking-wide text-center">
            {latestFeedback.message}
          </span>
        </div>
      )}
    </>
  );
};
