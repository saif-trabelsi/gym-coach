import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from 'react';
import type { RepReplayPayload } from '../api/client';
import {
  advance,
  frameIndex,
  smoothFrames,
  projectFrame,
  visibleSegments,
  drawReplayFrame,
  POSE_CONNECTIONS,
} from '../replay/playback';
import { getTranslatedMessage } from '../feedback/messages';
import { Badge } from './kit/Badge';
import { scoreTone } from '../design/scoreTone';
import {
  Play,
  Pause,
  RotateCcw,
  X,
  Keyboard,
} from 'lucide-react';

export interface ReplayPlayerProps {
  replay: RepReplayPayload;
  repIndex: number;
  score: number;
  violations: string[];
  exercise?: string;
  onClose?: () => void;
}

export const ReplayPlayer: React.FC<ReplayPlayerProps> = ({
  replay,
  repIndex,
  score,
  violations,
  exercise,
  onClose,
}) => {
  // Check prefers-reduced-motion
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const [isPlaying, setIsPlaying] = useState<boolean>(!prefersReducedMotion);
  const [speed, setSpeed] = useState<number>(0.5);
  const [isLoop, setIsLoop] = useState<boolean>(true);
  const [useSmooth, setUseSmooth] = useState<boolean>(true);
  const [position, setPosition] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const wasPlayingRef = useRef<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const frameCount = replay.frames?.length ?? 0;

  // Pre-calculate smoothed frames
  const smoothedFrames = useMemo(
    () => smoothFrames(replay.frames, 3),
    [replay.frames]
  );
  const activeFrames = useSmooth ? smoothedFrames : replay.frames;

  // Responsive canvas dimensions
  const aspect = replay.aspect > 0 ? replay.aspect : 1;
  const [canvasWidth, setCanvasWidth] = useState<number>(480);
  const canvasHeight = Math.round(canvasWidth / aspect);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (!containerRef.current) return;
      const width = Math.min(480, containerRef.current.clientWidth || 480);
      setCanvasWidth(width);
    };
    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateSize);
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    }
  }, []);

  // Draw current frame on canvas
  const drawCurrent = useCallback(
    (pos: number, timestamp?: number) => {
      const canvas = canvasRef.current;
      if (!canvas || frameCount === 0) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const idx = frameIndex(pos, frameCount);
      const rawFrame = activeFrames[idx] || [];
      const projected = projectFrame(rawFrame, canvasWidth, canvasHeight, replay.mirrored);
      const segments = visibleSegments(projected, POSE_CONNECTIONS, replay.highlight);

      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      drawReplayFrame(ctx, projected, segments, replay.highlight, {
        width: canvasWidth,
        height: canvasHeight,
        timestamp,
        dpr,
      });
    },
    [activeFrames, frameCount, canvasWidth, canvasHeight, replay.mirrored, replay.highlight]
  );

  // Resize canvas backing store for devicePixelRatio
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(canvasHeight * dpr);
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    drawCurrent(position);
  }, [canvasWidth, canvasHeight, drawCurrent, position]);

  // Animation loop with requestAnimationFrame - completely stopped when paused or ended
  useEffect(() => {
    if (!isPlaying || isDragging || frameCount === 0) return;

    let animId: number;
    let lastTime = performance.now();

    const loopStep = (currentTime: number) => {
      const dtMs = currentTime - lastTime;
      lastTime = currentTime;

      setPosition((prev) => {
        const next = advance(prev, dtMs, replay.fps, speed, frameCount, isLoop, true);
        if (next.ended) {
          setIsPlaying(false);
        }
        return next.position;
      });

      animId = requestAnimationFrame(loopStep);
    };

    animId = requestAnimationFrame(loopStep);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, isDragging, replay.fps, speed, frameCount, isLoop]);

  // Keyboard navigation: Space for play/pause, Left/Right arrows step frame when paused
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => {
          if (!prev && position >= frameCount - 1 && !isLoop) {
            setPosition(0);
          }
          return !prev;
        });
      } else if (e.key === 'ArrowLeft') {
        if (!isPlaying) {
          e.preventDefault();
          setPosition((prev) => Math.max(0, prev - 1));
        }
      } else if (e.key === 'ArrowRight') {
        if (!isPlaying) {
          e.preventDefault();
          setPosition((prev) => Math.min(frameCount - 1, prev + 1));
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isPlaying, position, frameCount, isLoop]);

  const togglePlay = () => {
    if (!isPlaying && position >= frameCount - 1 && !isLoop) {
      setPosition(0);
    }
    setIsPlaying((prev) => !prev);
  };

  const handleRestart = () => {
    setPosition(0);
    if (!isPlaying) {
      setIsPlaying(true);
    }
  };

  const curSeconds = (position / (replay.fps || 15)).toFixed(1);
  const totalSeconds = (frameCount / (replay.fps || 15)).toFixed(1);

  const ariaDescription = `Replay of rep ${repIndex}${exercise ? `, ${exercise}` : ''}, score ${score}`;
  const tone = scoreTone(score);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="w-full max-w-[480px] mx-auto bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-2xl)] p-4 flex flex-col gap-3 shadow-xl focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)] transition-all"
    >
      {/* Title & Violation Chips */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-[var(--text-primary)]">
              Rep #{repIndex}, score {score}
            </h4>
            <Badge
              variant={
                tone === 'good'
                  ? 'success'
                  : tone === 'warn'
                  ? 'warning'
                  : 'danger'
              }
              size="sm"
            >
              {score}
            </Badge>
          </div>

          {violations && violations.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {violations.map((v, i) => (
                <Badge key={i} variant="danger" size="sm">
                  {getTranslatedMessage(v, 'en-US')}
                </Badge>
              ))}
            </div>
          ) : (
            <Badge variant="success" size="sm">
              Clean rep
            </Badge>
          )}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
            aria-label="Close replay"
            title="Close replay player"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Canvas Video Stage */}
      <div className="flex justify-center bg-[var(--bg-surface-elevated)] rounded-[var(--radius-xl)] overflow-hidden border border-[var(--border-subtle)] relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ariaDescription}
          className="block"
        />
      </div>

      {/* Scrubber slider and Timestamp */}
      <div className="flex flex-col gap-1.5 px-0.5">
        <div className="flex items-center gap-3">
          <input
            type="range"
            aria-label="Replay scrubber"
            min={0}
            max={Math.max(0, frameCount - 1)}
            step={0.1}
            value={position}
            onPointerDown={() => {
              wasPlayingRef.current = isPlaying;
              setIsPlaying(false);
              setIsDragging(true);
            }}
            onPointerUp={() => {
              setIsDragging(false);
              if (wasPlayingRef.current) {
                setIsPlaying(true);
              }
            }}
            onMouseDown={() => {
              wasPlayingRef.current = isPlaying;
              setIsPlaying(false);
              setIsDragging(true);
            }}
            onMouseUp={() => {
              setIsDragging(false);
              if (wasPlayingRef.current) {
                setIsPlaying(true);
              }
            }}
            onTouchStart={() => {
              wasPlayingRef.current = isPlaying;
              setIsPlaying(false);
              setIsDragging(true);
            }}
            onTouchEnd={() => {
              setIsDragging(false);
              if (wasPlayingRef.current) {
                setIsPlaying(true);
              }
            }}
            onChange={(e) => {
              setPosition(parseFloat(e.target.value));
            }}
            className="w-full accent-[var(--accent)] cursor-pointer h-1.5 bg-[var(--bg-surface-elevated)] rounded-lg appearance-none"
          />
          <span className="text-xs font-mono text-[var(--text-secondary)] whitespace-nowrap">
            {curSeconds} s / {totalSeconds} s
          </span>
        </div>
      </div>

      {/* Pill Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
        {/* Play/Pause & Restart Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="px-3 py-1.5 bg-[var(--accent)] hover:opacity-90 text-[var(--accent-contrast)] rounded-[var(--radius-lg)] text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleRestart}
            aria-label="Restart"
            className="px-2.5 py-1.5 bg-[var(--bg-surface-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restart</span>
          </button>
        </div>

        {/* Speed Segmented Pill */}
        <div className="flex items-center bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-0.5">
          {[0.25, 0.5, 1].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`px-2 py-0.5 text-xs rounded-[var(--radius-md)] font-mono transition-all cursor-pointer ${
                speed === s
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-bold shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              aria-pressed={speed === s}
              aria-label={`${s}x speed`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Loop and Smooth checkboxes */}
        <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-[var(--text-primary)] select-none">
            <input
              type="checkbox"
              checked={isLoop}
              onChange={(e) => setIsLoop(e.target.checked)}
              className="accent-[var(--accent)] rounded"
            />
            <span>Loop</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-[var(--text-primary)] select-none">
            <input
              type="checkbox"
              checked={useSmooth}
              onChange={(e) => setUseSmooth(e.target.checked)}
              className="accent-[var(--accent)] rounded"
            />
            <span>Smooth</span>
          </label>
        </div>
      </div>

      {/* Accessible Keyboard Hints Strip */}
      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)] font-mono">
        <span className="flex items-center gap-1">
          <Keyboard className="w-3 h-3" /> Keyboard shortcuts:
        </span>
        <div className="flex items-center gap-2">
          <span><kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">Space</kbd> Play/Pause</span>
          <span><kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">←</kbd> <kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">→</kbd> Step</span>
        </div>
      </div>
    </div>
  );
};
