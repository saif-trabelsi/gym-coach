import React, { useEffect, useState, useRef } from 'react';
import type { ExerciseType } from '../../App';
import type { RepState, RepResult } from '../../engine';
import type { FeedbackResult } from '../../feedback';
import { ScoreRing } from '../kit/ScoreRing';
import { Button } from '../kit/Button';
import { Skeleton } from '../kit/Skeleton';
import { Camera as CameraIcon, AlertTriangle, CheckCircle2, ThumbsUp, Sparkles } from 'lucide-react';

export interface VideoStageProps {
  isActive: boolean;
  isLoading: boolean;
  isModelLoading: boolean;
  cameraError: string | null;
  modelError: string | null;
  exercise: ExerciseType;
  currentState: RepState;
  repCount: number;
  lastRep: RepResult | null;
  latestFeedback: FeedbackResult | null;
  isBodyVisible: boolean;
  onStartCamera: () => void;
  onStopCamera: () => void;
  children?: React.ReactNode; // Active video element + Canvas overlay
}

export const VideoStage: React.FC<VideoStageProps> = ({
  isActive,
  isLoading,
  isModelLoading,
  cameraError,
  modelError,
  exercise,
  currentState,
  repCount,
  lastRep,
  latestFeedback,
  isBodyVisible,
  onStartCamera,
  onStopCamera,
  children,
}) => {
  // Rep count bump animation
  const [isBumping, setIsBumping] = useState<boolean>(false);
  const prevRepCountRef = useRef<number>(repCount);

  useEffect(() => {
    if (repCount > prevRepCountRef.current) {
      // Check if reduced motion is preferred
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!prefersReducedMotion) {
        setIsBumping(true);
        const timer = setTimeout(() => setIsBumping(false), 300);
        return () => clearTimeout(timer);
      }
    }
    prevRepCountRef.current = repCount;
  }, [repCount]);

  // State pill configuration
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

  // Video Stage Container
  return (
    <div className="relative w-full aspect-video bg-[var(--bg-app)] rounded-[var(--radius-2xl)] overflow-hidden border border-[var(--border-subtle)] shadow-2xl flex items-center justify-center">
      {/* 1. Model Loading State */}
      {isModelLoading && (
        <div
          data-testid="coach-model-loading"
          className="absolute inset-0 z-30 bg-[var(--bg-surface)]/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center gap-4"
        >
          <Skeleton variant="rounded" width={80} height={80} className="rounded-2xl" />
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--accent)] animate-spin" />
              Loading MediaPipe Pose Landmarker
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Initializing neural model with GPU/CPU acceleration...
            </p>
          </div>
        </div>
      )}

      {/* 2. Model Error State */}
      {modelError && (
        <div
          role="alert"
          className="absolute inset-0 z-30 bg-[var(--bg-surface)] flex flex-col items-center justify-center p-6 text-center gap-3 text-[var(--status-danger)]"
        >
          <AlertTriangle className="w-10 h-10" />
          <h3 className="font-bold text-base text-[var(--text-primary)]">Model Initialization Failed</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm">{modelError}</p>
        </div>
      )}

      {/* 3. Camera Permission Denied / Error State */}
      {cameraError && !isActive && (
        <div
          data-testid="coach-camera-denied"
          className="absolute inset-0 z-20 bg-[var(--bg-surface)]/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center gap-4"
        >
          <div className="w-12 h-12 rounded-full bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] flex items-center justify-center text-[var(--status-danger)]">
            <CameraIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-[var(--text-primary)]">Camera Access Denied</h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mt-1">
              {cameraError}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-2">
              Tip: Click the camera / lock icon in your browser address bar to allow camera access.
            </p>
          </div>
          <Button variant="primary" size="md" onClick={onStartCamera} isLoading={isLoading}>
            Try Camera Again
          </Button>
        </div>
      )}

      {/* 4. Idle Onboarding State (Before camera starts) */}
      {!isActive && !cameraError && !isModelLoading && (
        <div
          data-testid="coach-onboarding"
          className="w-full h-full flex flex-col items-center justify-center p-6 md:p-8 text-center bg-gradient-to-b from-[var(--bg-surface)]/60 to-[var(--bg-app)]"
        >
          {/* Athlete side-view SVG Silhouette */}
          <div className="w-20 h-20 mb-3 text-[var(--accent)] flex items-center justify-center">
            <svg
              viewBox="0 0 100 100"
              fill="none"
              stroke="currentColor"
              className="w-full h-full opacity-90 drop-shadow-lg"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Head */}
              <circle cx="50" cy="18" r="9" strokeWidth="3" />
              {/* Torso */}
              <path d="M50 27 L48 55" strokeWidth="3.5" strokeLinecap="round" />
              {/* Arms (Side angle) */}
              <path d="M50 33 L62 44 L56 58" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {/* Legs (Side angle) */}
              <path d="M48 55 L38 72 L42 92" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              {/* Ground guide */}
              <line x1="20" y1="94" x2="80" y2="94" strokeWidth="2" strokeDasharray="4 4" className="text-[var(--text-muted)]" />
            </svg>
          </div>

          <h2 className="text-lg md:text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Setup Your {exercise === 'squat' ? 'Squat' : 'Bicep Curl'} Coaching
          </h2>

          {/* Quick Setup Checklist */}
          <div className="grid grid-cols-2 gap-2 max-w-md my-4 text-left text-xs text-[var(--text-secondary)]">
            <div className="flex items-center gap-2 bg-[var(--bg-surface-elevated)]/60 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Full body in frame</span>
            </div>
            <div className="flex items-center gap-2 bg-[var(--bg-surface-elevated)]/60 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Side-on angle</span>
            </div>
            <div className="flex items-center gap-2 bg-[var(--bg-surface-elevated)]/60 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>
                {exercise === 'squat' ? 'Camera at hip height' : 'Camera at chest height'}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-[var(--bg-surface-elevated)]/60 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Good contrast & lighting</span>
            </div>
          </div>

          <Button
            size="lg"
            variant="primary"
            onClick={onStartCamera}
            isLoading={isLoading}
            leftIcon={<CameraIcon className="w-5 h-5" />}
          >
            Start Camera
          </Button>
        </div>
      )}

      {/* 5. Active Video Element + Live Overlays */}
      {isActive && (
        <>
          {children}

          {/* Warning Banner: Body landmarks not visible */}
          {!isBodyVisible && (
            <div
              role="alert"
              className="absolute top-4 inset-x-4 mx-auto max-w-sm bg-amber-500/90 text-slate-950 border border-amber-300 rounded-xl px-3.5 py-2 shadow-2xl backdrop-blur-md flex items-center justify-center gap-2 z-20 animate-bounce"
            >
              <AlertTriangle className="w-4 h-4 text-slate-950 shrink-0" />
              <span className="font-bold text-xs">
                {exercise === 'squat'
                  ? 'Step back, full body in frame'
                  : 'Keep torso and active arm in frame'}
              </span>
            </div>
          )}

          {/* HUD Overlay 1: Top-Left Exercise & State Chip */}
          <div
            data-testid="hud-top-left"
            className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-[var(--radius-xl)] shadow-lg"
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

          {/* HUD Overlay 2: Top-Right Last Rep ScoreRing */}
          <div
            data-testid="hud-top-right"
            className="absolute top-3 right-3 z-10 flex items-center gap-2.5 bg-black/60 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-[var(--radius-xl)] shadow-lg"
          >
            <div className="flex flex-col text-right">
              <span className="text-[10px] uppercase font-bold text-white/60">Last Rep</span>
              <span className="text-xs font-mono font-semibold text-white">
                {lastRep ? `${lastRep.score}/100` : '--'}
              </span>
            </div>
            <ScoreRing score={lastRep ? lastRep.score : 0} size={42} strokeWidth={4.5} />
          </div>

          {/* HUD Overlay 3: Bottom-Left Large Rep Counter */}
          <div
            data-testid="hud-bottom-left"
            className="absolute bottom-3 left-3 z-10 flex flex-col bg-black/60 backdrop-blur-md border border-white/15 px-4 py-2 rounded-[var(--radius-xl)] shadow-lg"
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

          {/* HUD Overlay 4: Bottom-Center Live Feedback Toast */}
          {latestFeedback && (
            <div
              data-testid="hud-feedback-toast"
              className={`absolute bottom-3 inset-x-20 mx-auto max-w-md z-10 px-4 py-2.5 rounded-[var(--radius-xl)] backdrop-blur-md border shadow-2xl flex items-center justify-center gap-2.5 transition-all duration-200 ${
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

          {/* Quick Stop Camera Button in HUD */}
          <div className="absolute bottom-3 right-3 z-10">
            <Button
              size="sm"
              variant="secondary"
              onClick={onStopCamera}
              className="bg-black/60 text-white border-white/20 hover:bg-black/80 backdrop-blur-md"
            >
              Stop
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
