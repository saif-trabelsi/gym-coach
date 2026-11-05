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

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="w-full max-w-[480px] mx-auto bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-2xl focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
    >
      {/* Title & Violation Chips */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-bold text-white">
            Rep #{repIndex}, score {score}
          </h4>
          {violations && violations.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {violations.map((v, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/60"
                >
                  {getTranslatedMessage(v, 'en-US')}
                </span>
              ))}
            </div>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
              Clean rep
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 transition-colors"
            aria-label="Close replay"
          >
            ✕
          </button>
        )}
      </div>

      {/* Canvas */}
      <div className="flex justify-center bg-slate-900/90 rounded-xl overflow-hidden border border-slate-800">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ariaDescription}
          className="block"
        />
      </div>

      {/* Scrubber slider and Timestamp */}
      <div className="flex flex-col gap-1">
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
            className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
          />
          <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
            {curSeconds} s / {totalSeconds} s
          </span>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
        {/* Play/Pause & Restart */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition-colors flex items-center gap-1"
          >
            <span>{isPlaying ? '⏸' : '▶'}</span>
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <button
            type="button"
            onClick={handleRestart}
            aria-label="Restart"
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            ↺ Restart
          </button>
        </div>

        {/* Speed toggle buttons */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
          {[0.25, 0.5, 1].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`px-2 py-0.5 text-xs rounded-md font-mono transition-colors ${
                speed === s
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              aria-pressed={speed === s}
              aria-label={`${s}x speed`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Loop and Smooth checkboxes */}
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-white select-none">
            <input
              type="checkbox"
              checked={isLoop}
              onChange={(e) => setIsLoop(e.target.checked)}
              className="accent-indigo-500 rounded"
            />
            <span>Loop</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-white select-none">
            <input
              type="checkbox"
              checked={useSmooth}
              onChange={(e) => setUseSmooth(e.target.checked)}
              className="accent-indigo-500 rounded"
            />
            <span>Smooth</span>
          </label>
        </div>
      </div>
    </div>
  );
};
