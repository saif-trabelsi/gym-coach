import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, type CameraHandle } from './ui/Camera';
import { VideoFileInput, type VideoFileInputHandle } from './ui/VideoFileInput';
import { Overlay, type OverlayHandle } from './ui/Overlay';
import { FpsCounter } from './ui/FpsCounter';
import {
  createPoseDetector,
  type PoseDetector,
} from './pose/detector';

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

  const overlayRef = useRef<OverlayHandle | null>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
  const videoInputRef = useRef<VideoFileInputHandle | null>(null);

  // FPS calculation references
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(performance.now());
  const rafIdRef = useRef<number | null>(null);

  // Initialize MediaPipe PoseLandmarker once
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

  // Update overlay canvas dimensions when active video dimensions change
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

  // Main pose detection and rendering loop
  useEffect(() => {
    if (!detector || !activeVideo) {
      overlayRef.current?.clear();
      setPoseDetected(false);
      setFps(0);
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
        // Use performance.now() to ensure strictly increasing timestamps
        const result = detector.detectFrame(activeVideo, performance.now());
        const endTime = performance.now();

        const latency = endTime - startTime;
        setInferenceTimeMs(latency);

        // Update skeleton overlay directly
        if (result && result.landmarks) {
          overlayRef.current?.draw(result.landmarks);
          setPoseDetected(true);
        } else {
          overlayRef.current?.clear();
          setPoseDetected(false);
        }

        // Compute rolling FPS
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
    setMode(newMode);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation / Status Bar */}
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
                  Phase 1.1
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                MediaPipe Pose Landmarker (Full • Video mode)
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

          {/* Metrics & Status */}
          <div className="flex items-center gap-3">
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
              {poseDetected ? 'Skeleton 33/33' : 'No pose'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 flex flex-col items-center justify-start gap-6">
        {/* Model initialization alert banner if loading or error */}
        {isModelLoading && (
          <div className="w-full bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3 flex items-center gap-3 text-xs text-indigo-300">
            <svg
              className="animate-spin h-4 w-4 text-indigo-400"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>
              Loading MediaPipe Pose Landmarker (&apos;full&apos; model, GPU delegate)...
            </span>
          </div>
        )}

        {modelError && (
          <div className="w-full bg-rose-950/40 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300">
            <strong>Model Error:</strong> {modelError}
          </div>
        )}

        {/* Video + Overlay Container */}
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
        </div>

        {/* Pipeline Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-4xl text-xs">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
            <span className="text-slate-400 font-medium">Pose Estimation</span>
            <span className="font-semibold text-slate-200">
              MediaPipe Pose Landmarker Full
            </span>
            <span className="text-slate-500 text-[11px]">
              Running mode: VIDEO • 33 3D landmarks
            </span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
            <span className="text-slate-400 font-medium">Delegate</span>
            <span className="font-semibold text-cyan-400">
              {delegate ?? 'Initializing...'}
            </span>
            <span className="text-slate-500 text-[11px]">
              GPU accelerated with automatic CPU fallback
            </span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
            <span className="text-slate-400 font-medium">Architecture</span>
            <span className="font-semibold text-emerald-400">100% In-Browser</span>
            <span className="text-slate-500 text-[11px]">
              Zero server video streaming • Privacy safe
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
