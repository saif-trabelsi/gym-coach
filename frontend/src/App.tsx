import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, type CameraHandle } from './ui/Camera';
import { VideoFileInput, type VideoFileInputHandle } from './ui/VideoFileInput';
import { Overlay, type OverlayHandle } from './ui/Overlay';
import { FpsCounter } from './ui/FpsCounter';
import { AngleChart, type AngleDataPoint } from './ui/AngleChart';
import {
  createPoseDetector,
  type PoseDetector,
} from './pose/detector';
import {
  RepStateMachine,
  OneEuroFilter,
  selectSquatLeg,
  angle,
  squatConfig,
  type RepState,
} from './engine';

type InputMode = 'webcam' | 'video';

export default function App() {
  const [mode, setMode] = useState<InputMode>('webcam');
  const [detector, setDetector] = useState<PoseDetector | null>(null);
  const [delegate, setDelegate] = useState<'GPU' | 'CPU' | null>(null);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
  const [modelError, setModelError] = useState<string | null>(null);

  const [activeVideo, setActiveVideo] = useState<HTMLVideoElement | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [inferenceTimeMs, setInferenceTimeMs] = useState<number>(0);
  const [poseDetected, setPoseDetected] = useState<boolean>(false);

  // Engine state
  const [repCount, setRepCount] = useState<number>(0);
  const [currentState, setCurrentState] = useState<RepState>('idle');
  const [currentKneeAngle, setCurrentKneeAngle] = useState<number | null>(null);
  const [activeLeg, setActiveLeg] = useState<'left' | 'right' | null>(null);
  const [isBodyVisible, setIsBodyVisible] = useState<boolean>(true);

  // Debug Chart state
  const [chartData, setChartData] = useState<AngleDataPoint[]>([]);

  // Engine refs (keep instances persistent across re-renders)
  const stateMachineRef = useRef<RepStateMachine>(new RepStateMachine(squatConfig));
  const filterRef = useRef<OneEuroFilter>(
    new OneEuroFilter({ minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 })
  );

  const overlayRef = useRef<OverlayHandle | null>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
  const videoInputRef = useRef<VideoFileInputHandle | null>(null);

  // FPS calculation references
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(performance.now());
  const rafIdRef = useRef<number | null>(null);

  // Reset function
  const handleReset = useCallback(() => {
    stateMachineRef.current.reset();
    filterRef.current.reset();
    setRepCount(0);
    setCurrentState('idle');
    setCurrentKneeAngle(null);
    setChartData([]);
  }, []);

  // Initialize MediaPipe PoseLandmarker
  useEffect(() => {
    let isCancelled = false;

    async function initDetector() {
      setIsModelLoading(true);
      setModelError(null);
      try {
        const instance = await createPoseDetector();
        if (isCancelled) {
          await instance.close();
          return;
        }
        setDetector(instance);
        setDelegate(instance.getDelegate());
      } catch (err: unknown) {
        console.error('Failed to initialize PoseDetector:', err);
        if (!isCancelled) {
          setModelError(
            err instanceof Error
              ? err.message
              : 'Failed to initialize MediaPipe PoseLandmarker'
          );
        }
      } finally {
        if (!isCancelled) {
          setIsModelLoading(false);
        }
      }
    }

    initDetector();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Sync canvas overlay dimensions
  const syncCanvasDimensions = useCallback(() => {
    if (!activeVideo || !overlayRef.current) return;
    const canvas = overlayRef.current.getCanvas();
    if (!canvas) return;

    const vWidth = activeVideo.videoWidth || 640;
    const vHeight = activeVideo.videoHeight || 480;

    if (canvas.width !== vWidth || canvas.height !== vHeight) {
      canvas.width = vWidth;
      canvas.height = vHeight;
    }
  }, [activeVideo]);

  // Main pose detection and engine loop
  useEffect(() => {
    if (!detector || !activeVideo) {
      overlayRef.current?.clear();
      setPoseDetected(false);
      setFps(0);
      setIsBodyVisible(true);
      return;
    }

    let isRunning = true;

    const processFrame = () => {
      if (!isRunning) return;

      if (
        activeVideo &&
        activeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        !activeVideo.paused &&
        !activeVideo.ended
      ) {
        syncCanvasDimensions();

        const startTime = performance.now();
        const timestamp = performance.now();
        const result = detector.detectFrame(activeVideo, timestamp);
        const endTime = performance.now();

        setInferenceTimeMs(endTime - startTime);

        if (result && result.landmarks && result.worldLandmarks) {
          overlayRef.current?.draw(result.landmarks);
          setPoseDetected(true);

          // Task 1.3: Choose leg with higher average visibility of hip, knee and ankle
          const legSelection = selectSquatLeg(result.worldLandmarks, 0.5, result.landmarks);

          if (!legSelection || !legSelection.isValid) {
            // Landmarks needed are below 0.5 visibility -> show warning and skip frame
            setIsBodyVisible(false);
          } else {
            setIsBodyVisible(true);
            setActiveLeg(legSelection.side);

            // Compute raw knee angle from 3D world landmarks
            const rawKneeAngle = angle(
              legSelection.landmarks.hip,
              legSelection.landmarks.knee,
              legSelection.landmarks.ankle
            );

            // Smooth using One Euro filter with frame timestamp
            const smoothedKneeAngle = filterRef.current.filter(rawKneeAngle, timestamp);

            // Feed smoothed angle into exercise state machine
            const smResult = stateMachineRef.current.update(smoothedKneeAngle, timestamp);

            setCurrentKneeAngle(smoothedKneeAngle);
            setCurrentState(smResult.state);
            setRepCount(stateMachineRef.current.getRepCount());

            // Append to chart history (keep last 10 seconds)
            setChartData((prev) => {
              const cutoff = timestamp - 10000;
              const filtered = prev.filter((pt) => pt.timestamp >= cutoff);
              return [...filtered, { timestamp, angle: smoothedKneeAngle }];
            });
          }
        } else {
          overlayRef.current?.clear();
          setPoseDetected(false);
          setIsBodyVisible(false);
        }

        // FPS calculation
        frameCountRef.current++;
        const elapsed = endTime - lastFpsUpdateRef.current;
        if (elapsed >= 500) {
          const currentFps = (frameCountRef.current / elapsed) * 1000;
          setFps(currentFps);
          frameCountRef.current = 0;
          lastFpsUpdateRef.current = endTime;
        }
      } else if (activeVideo.paused) {
        setFps(0);
      }

      rafIdRef.current = requestAnimationFrame(processFrame);
    };

    rafIdRef.current = requestAnimationFrame(processFrame);

    return () => {
      isRunning = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      overlayRef.current?.clear();
    };
  }, [detector, activeVideo, syncCanvasDimensions]);

  // Switch between camera and video file mode
  const handleModeChange = (newMode: InputMode) => {
    if (newMode === mode) return;

    if (mode === 'webcam') {
      cameraRef.current?.stop();
    } else {
      videoInputRef.current?.pause();
    }

    overlayRef.current?.clear();
    setActiveVideo(null);
    setPoseDetected(false);
    setFps(0);
    setIsBodyVisible(true);
    handleReset();
    setMode(newMode);
  };

  // State badge color styles
  const getStateBadge = (state: RepState) => {
    switch (state) {
      case 'idle':
        return { text: 'IDLE (Standing)', color: 'bg-slate-800 text-slate-300 border-slate-700' };
      case 'descending':
        return { text: 'DESCENDING ↓', color: 'bg-cyan-950 text-cyan-300 border-cyan-700 animate-pulse' };
      case 'bottom':
        return { text: 'BOTTOM (Parallel) 🎯', color: 'bg-emerald-950 text-emerald-300 border-emerald-600 font-bold' };
      case 'ascending':
        return { text: 'ASCENDING ↑', color: 'bg-indigo-950 text-indigo-300 border-indigo-700 animate-pulse' };
    }
  };

  const stateBadge = getStateBadge(currentState);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-lg font-black text-white">🏋️</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                AI Gym Coach
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                  Squat Engine (1.3)
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Live Rep Counter • Knee Angle Tracking • 1€ Filter
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/70">
            <button
              onClick={() => handleModeChange('webcam')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === 'webcam'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              📹 Live Webcam
            </button>
            <button
              onClick={() => handleModeChange('video')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === 'video'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              📁 Video File
            </button>
          </div>

          {/* Metrics & Reset */}
          <div className="flex items-center gap-2.5">
            <FpsCounter
              fps={fps}
              delegate={delegate}
              inferenceTimeMs={fps > 0 ? inferenceTimeMs : undefined}
            />

            {/* Pose status pill */}
            <div
              className={`text-xs px-2.5 py-1 rounded-lg border font-mono flex items-center gap-1.5 ${
                poseDetected
                  ? 'bg-cyan-950/70 text-cyan-300 border-cyan-500/30'
                  : 'bg-slate-900 text-slate-500 border-slate-800'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  poseDetected ? 'bg-cyan-400' : 'bg-slate-600'
                }`}
              />
              {poseDetected ? 'Pose 3D' : 'No pose'}
            </div>

            <button
              onClick={handleReset}
              title="Reset rep counter and state machine"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 active:scale-95 shadow-sm"
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 flex flex-col items-center justify-start gap-6">
        {/* Model initialization alert banner */}
        {isModelLoading && (
          <div className="w-full bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3 flex items-center gap-3 text-xs text-indigo-300">
            <svg className="animate-spin h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading MediaPipe Pose Landmarker (&apos;full&apos; model, GPU delegate)...</span>
          </div>
        )}

        {modelError && (
          <div className="w-full bg-rose-950/40 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300">
            <strong>Model Error:</strong> {modelError}
          </div>
        )}

        {/* Live Exercise Metric Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-4xl">
          {/* Rep Counter */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-lg">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Squat Reps</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-black text-indigo-400 font-mono tracking-tight">{repCount}</span>
              <span className="text-xs text-slate-500">completed</span>
            </div>
          </div>

          {/* Knee Angle */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-lg">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Knee Angle</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-black text-cyan-400 font-mono tracking-tight">
                {currentKneeAngle !== null ? currentKneeAngle.toFixed(0) : '--'}
                <span className="text-2xl font-light">°</span>
              </span>
              <span className="text-[11px] text-slate-500">
                {activeLeg ? `${activeLeg} leg` : 'tracking'}
              </span>
            </div>
          </div>

          {/* Current State */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-lg">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Exercise State</span>
            <div className="mt-2">
              <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold border ${stateBadge.color}`}>
                {stateBadge.text}
              </span>
            </div>
          </div>

          {/* Threshold Targets */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-lg text-xs">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Targets</span>
            <div className="flex flex-col gap-1 mt-1 text-[11px]">
              <div className="flex justify-between items-center text-slate-300">
                <span>Top (Stand):</span>
                <span className="font-mono text-indigo-300 font-semibold">&gt; {squatConfig.upThreshold}°</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Bottom (Depth):</span>
                <span className="font-mono text-emerald-300 font-semibold">&lt; {squatConfig.downThreshold}°</span>
              </div>
            </div>
          </div>
        </div>

        {/* Video Player + Overlay */}
        <div className="relative w-full max-w-4xl flex flex-col items-center">
          {mode === 'webcam' ? (
            <Camera
              ref={cameraRef}
              onVideoElement={(video) => setActiveVideo(video)}
            >
              <Overlay ref={overlayRef} />
            </Camera>
          ) : (
            <VideoFileInput
              ref={videoInputRef}
              onVideoElement={(video) => setActiveVideo(video)}
            >
              <Overlay ref={overlayRef} />
            </VideoFileInput>
          )}

          {/* "Step back, full body in frame" warning notification banner */}
          {activeVideo && !isBodyVisible && (
            <div className="absolute top-4 inset-x-4 mx-auto max-w-md bg-amber-500/90 text-slate-950 border border-amber-300/80 rounded-xl px-4 py-2.5 shadow-2xl backdrop-blur-md flex items-center justify-center gap-2 z-10 transition-all">
              <svg className="w-5 h-5 text-slate-950 flex-shrink-0 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="font-bold text-xs md:text-sm tracking-wide">
                Step back, full body in frame
              </span>
            </div>
          )}
        </div>

        {/* Debug Panel: Live Line Chart */}
        <div className="w-full max-w-4xl">
          <AngleChart
            data={chartData}
            upThreshold={squatConfig.upThreshold}
            downThreshold={squatConfig.downThreshold}
            currentAngle={currentKneeAngle}
            width={800}
            height={200}
          />
        </div>
      </main>
    </div>
  );
}
