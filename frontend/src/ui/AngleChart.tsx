import { useEffect, useRef, type FC } from 'react';

export interface AngleDataPoint {
  timestamp: number;
  angle: number;
}

interface AngleChartProps {
  data: AngleDataPoint[];
  upThreshold: number;
  downThreshold: number;
  currentAngle?: number | null;
  className?: string;
  width?: number;
  height?: number;
}

export const AngleChart: FC<AngleChartProps> = ({
  data,
  upThreshold,
  downThreshold,
  currentAngle,
  className = '',
  width = 640,
  height = 180,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fixed angle range for stability
    const minPlotAngle = 50;
    const maxPlotAngle = 190;
    const angleRange = maxPlotAngle - minPlotAngle;

    const padding = { top: 20, right: 75, bottom: 25, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Helper: Map angle to canvas Y coordinate
    const getY = (angle: number) => {
      const clamped = Math.max(minPlotAngle, Math.min(maxPlotAngle, angle));
      const norm = (clamped - minPlotAngle) / angleRange;
      return padding.top + chartHeight * (1 - norm);
    };

    // Helper: Map timestamp to canvas X coordinate (last 10 seconds)
    const now = data.length > 0 ? data[data.length - 1].timestamp : performance.now();
    const timeWindowMs = 10000;
    const startTime = now - timeWindowMs;

    const getX = (t: number) => {
      const norm = (t - startTime) / timeWindowMs;
      return padding.left + chartWidth * Math.max(0, Math.min(1, norm));
    };

    // 1. Clear canvas & draw background
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // 2. Draw subtle grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    // Horizontal grid lines every 30 degrees
    const gridAngles = [60, 90, 120, 150, 180];
    ctx.font = '10px monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (const a of gridAngles) {
      const y = getY(a);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      ctx.fillText(`${a}°`, padding.left - 6, y);
    }

    // Time axis grid lines (-10s, -5s, 0s)
    const timeMarks = [0, 2500, 5000, 7500, 10000];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const offset of timeMarks) {
      const x = padding.left + (chartWidth * offset) / timeWindowMs;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();

      const secLabel = offset === 10000 ? 'Now' : `-${(10 - offset / 1000).toFixed(0)}s`;
      ctx.fillText(secLabel, x, height - padding.bottom + 6);
    }

    // 3. Draw Up Threshold horizontal line (e.g. 160°)
    const upY = getY(upThreshold);
    ctx.save();
    ctx.strokeStyle = '#818cf8'; // Indigo-400
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, upY);
    ctx.lineTo(width - padding.right, upY);
    ctx.stroke();

    ctx.fillStyle = '#a5b4fc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Up (${upThreshold}°)`, width - padding.right + 6, upY);
    ctx.restore();

    // 4. Draw Down Threshold horizontal line (e.g. 100°)
    const downY = getY(downThreshold);
    ctx.save();
    ctx.strokeStyle = '#34d399'; // Emerald-400
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, downY);
    ctx.lineTo(width - padding.right, downY);
    ctx.stroke();

    ctx.fillStyle = '#6ee7b7';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Down (${downThreshold}°)`, width - padding.right + 6, downY);
    ctx.restore();

    // 5. Draw Angle Signal Curve
    const visiblePoints = data.filter((p) => p.timestamp >= startTime);

    if (visiblePoints.length > 1) {
      // Area gradient fill
      const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
      gradient.addColorStop(0, 'rgba(6, 182, 212, 0.25)'); // Cyan
      gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

      ctx.beginPath();
      ctx.moveTo(getX(visiblePoints[0].timestamp), height - padding.bottom);
      for (const p of visiblePoints) {
        ctx.lineTo(getX(p.timestamp), getY(p.angle));
      }
      ctx.lineTo(getX(visiblePoints[visiblePoints.length - 1].timestamp), height - padding.bottom);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Stroke line
      ctx.beginPath();
      ctx.strokeStyle = '#22d3ee'; // Cyan-400
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = 0; i < visiblePoints.length; i++) {
        const pt = visiblePoints[i];
        const x = getX(pt.timestamp);
        const y = getY(pt.angle);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Latest point dot
      const latest = visiblePoints[visiblePoints.length - 1];
      const latestX = getX(latest.timestamp);
      const latestY = getY(latest.angle);

      ctx.beginPath();
      ctx.arc(latestX, latestY, 5, 0, 2 * Math.PI);
      ctx.fillStyle = '#06b6d4';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }

    // 6. Chart Title & Legend
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('LIVE KNEE ANGLE SIGNAL (10s WINDOW)', padding.left, 4);

    if (currentAngle !== undefined && currentAngle !== null) {
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#22d3ee';
      ctx.textAlign = 'right';
      ctx.fillText(`${currentAngle.toFixed(1)}°`, width - padding.right, 4);
    }
  }, [data, upThreshold, downThreshold, currentAngle, width, height]);

  return (
    <div className={`flex flex-col bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-lg ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300">Signal Debug View</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono border border-slate-700">
            Window: 10s • One Euro Filtered
          </span>
        </div>
        {currentAngle !== null && currentAngle !== undefined && (
          <span className="text-xs font-mono font-bold text-cyan-400">
            {currentAngle.toFixed(1)}°
          </span>
        )}
      </div>

      <div className="w-full overflow-hidden rounded-lg border border-slate-800 bg-[#090d16] flex justify-center">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full h-auto max-w-full block"
        />
      </div>
    </div>
  );
};
