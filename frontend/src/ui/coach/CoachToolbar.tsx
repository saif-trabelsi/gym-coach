import React, { useState } from 'react';
import type { SupportedLanguage } from '../../feedback';
import type { AngleDataPoint } from '../AngleChart';
import { AngleChart } from '../AngleChart';
import { Volume2, VolumeX, Cpu, Activity, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

export interface CoachToolbarProps {
  mode: 'webcam' | 'video';
  onModeChange: (mode: 'webcam' | 'video') => void;
  language: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onReset: () => void;
  fps: number;
  delegate: 'GPU' | 'CPU' | null;
  inferenceTimeMs: number;
  poseDetected?: boolean;
  activeSide?: { side: 'left' | 'right'; type: 'leg' | 'arm' } | null;
  chartData: AngleDataPoint[];
  upThreshold: number;
  downThreshold: number;
  currentAngle: number | null;
}

export const CoachToolbar: React.FC<CoachToolbarProps> = ({
  mode,
  onModeChange,
  language,
  onLanguageChange,
  isMuted,
  onToggleMute,
  onReset,
  fps,
  delegate,
  inferenceTimeMs,
  poseDetected = false,
  activeSide,
  chartData,
  upThreshold,
  downThreshold,
  currentAngle,
}) => {
  const [showPerfDetails, setShowPerfDetails] = useState<boolean>(false);
  const [showDevTools, setShowDevTools] = useState<boolean>(false);

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Top compact bar */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 rounded-[var(--radius-xl)] shadow-sm">
        {/* Left: Mode toggle (Webcam / Video) */}
        <div className="flex items-center bg-[var(--bg-surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold">
          <button
            type="button"
            onClick={() => onModeChange('webcam')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              mode === 'webcam'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm font-bold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Webcam
          </button>
          <button
            type="button"
            onClick={() => onModeChange('video')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              mode === 'video'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm font-bold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Video File
          </button>
        </div>

        {/* Right: Audio, Language, Collapsible Perf, Reset */}
        <div className="flex items-center gap-2">
          {/* Pose status pill */}
          <div
            className={`text-xs px-2.5 py-1.5 rounded-[var(--radius-lg)] border font-mono flex items-center gap-1.5 ${
              poseDetected
                ? 'bg-[var(--score-good-bg)] text-[var(--score-good)] border-[var(--score-good-border)]'
                : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                poseDetected ? 'bg-[var(--score-good)]' : 'bg-[var(--text-muted)]'
              }`}
            />
            <span className="hidden sm:inline">
              {poseDetected ? (activeSide ? `${activeSide.side} ${activeSide.type}` : 'Tracking') : 'No pose'}
            </span>
          </div>

          {/* Voice mute toggle */}
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Unmute audio coaching' : 'Mute audio coaching'}
            title={isMuted ? 'Unmute voice' : 'Mute voice'}
            className={`p-2 rounded-[var(--radius-lg)] border transition-all cursor-pointer ${
              isMuted
                ? 'bg-[var(--status-danger-bg)] text-[var(--status-danger)] border-[var(--status-danger-border)]'
                : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
            }`}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Language selector */}
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as SupportedLanguage)}
            aria-label="Voice Language"
            className="bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] px-2 py-1.5 text-xs font-medium focus:ring-2 focus:ring-[var(--border-focus)] outline-none cursor-pointer"
          >
            <option value="en-US">EN</option>
            <option value="fr-FR">FR</option>
            <option value="ar">AR</option>
          </select>

          {/* Small collapsible FPS / Delegate badge */}
          <button
            type="button"
            onClick={() => setShowPerfDetails(!showPerfDetails)}
            aria-expanded={showPerfDetails}
            aria-label="Toggle performance stats"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] text-xs font-mono font-medium text-[var(--text-secondary)] cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>{fps} fps</span>
            {showPerfDetails ? (
              <ChevronUp className="w-3 h-3 ml-0.5" />
            ) : (
              <ChevronDown className="w-3 h-3 ml-0.5" />
            )}
          </button>

          {/* Rep & Engine Reset */}
          <button
            type="button"
            onClick={onReset}
            title="Reset rep count and state machine"
            className="p-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded Performance Details */}
      {showPerfDetails && (
        <div className="w-full bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] p-3 text-xs font-mono grid grid-cols-3 gap-3 animate-in fade-in duration-150">
          <div>
            <span className="text-[var(--text-muted)] block text-[10px] uppercase">FPS</span>
            <span className="font-bold text-[var(--text-primary)] text-sm">{fps}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block text-[10px] uppercase">Inference</span>
            <span className="font-bold text-[var(--text-primary)] text-sm">
              {inferenceTimeMs > 0 ? `${inferenceTimeMs.toFixed(1)} ms` : '--'}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block text-[10px] uppercase">Delegate</span>
            <span className="font-bold text-[var(--accent)] text-sm">
              {delegate || 'Loading...'}
            </span>
          </div>
        </div>
      )}

      {/* Collapsed Developer Tools Section */}
      <div className="w-full border border-[var(--border-subtle)] rounded-[var(--radius-xl)] bg-[var(--bg-surface)] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDevTools(!showDevTools)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--accent)]" />
            <span>Developer Tools: Live Biomechanics Angle Chart</span>
          </div>
          {showDevTools ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showDevTools && (
          <div className="p-4 border-t border-[var(--border-subtle)]">
            <AngleChart
              data={chartData}
              upThreshold={upThreshold}
              downThreshold={downThreshold}
              currentAngle={currentAngle}
              width={750}
              height={200}
            />
          </div>
        )}
      </div>
    </div>
  );
};
