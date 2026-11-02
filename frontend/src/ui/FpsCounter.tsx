import type { FC } from 'react';

interface FpsCounterProps {
  fps: number;
  delegate?: 'GPU' | 'CPU' | null;
  inferenceTimeMs?: number;
  className?: string;
}

export const FpsCounter: FC<FpsCounterProps> = ({
  fps,
  delegate,
  inferenceTimeMs,
  className = '',
}) => {
  const roundedFps = Math.round(fps);

  // Color code FPS indicator
  let fpsColor = 'text-emerald-400 bg-emerald-950/70 border-emerald-500/30';
  if (roundedFps < 15) {
    fpsColor = 'text-rose-400 bg-rose-950/70 border-rose-500/30';
  } else if (roundedFps < 24) {
    fpsColor = 'text-amber-400 bg-amber-950/70 border-amber-500/30';
  }

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-mono font-medium backdrop-blur-md shadow-sm transition-colors ${fpsColor} ${className}`}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
            roundedFps >= 24 ? 'bg-emerald-400' : 'bg-amber-400'
          }`}
        />
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            roundedFps >= 24 ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
        />
      </span>
      <span>{roundedFps} FPS</span>

      {inferenceTimeMs !== undefined && (
        <span className="text-slate-400 text-[10px]">
          ({inferenceTimeMs.toFixed(1)} ms)
        </span>
      )}

      {delegate && (
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            delegate === 'GPU'
              ? 'bg-cyan-900/80 text-cyan-300 border border-cyan-700/50'
              : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
          }`}
        >
          {delegate}
        </span>
      )}
    </div>
  );
};
