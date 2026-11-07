import React from 'react';
import { scoreTone } from '../../design/scoreTone';

export interface ScoreRingProps {
  score: number;
  size?: number; // width & height in px
  strokeWidth?: number;
  showText?: boolean;
  className?: string;
  animate?: boolean;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  size = 64,
  strokeWidth = 6,
  showText = true,
  className = '',
  animate = true,
}) => {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const tone = scoreTone(clampedScore);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  const strokeColors = {
    good: 'var(--score-good)',
    warn: 'var(--score-warn)',
    bad: 'var(--score-bad)',
  };

  const textColors = {
    good: 'text-[var(--score-good)]',
    warn: 'text-[var(--score-warn)]',
    bad: 'text-[var(--score-bad)]',
  };

  return (
    <div
      role="img"
      aria-label={`Score ${clampedScore} out of 100`}
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rotate-[-90deg] overflow-visible"
      >
        {/* Track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--border-subtle)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColors[tone]}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          className={animate ? 'transition-[stroke-dashoffset] duration-700 ease-out' : ''}
        />
      </svg>
      {showText && (
        <span
          className={`absolute font-black font-mono tracking-tight select-none ${textColors[tone]}`}
          style={{ fontSize: size * 0.32 }}
        >
          {clampedScore}
        </span>
      )}
    </div>
  );
};
