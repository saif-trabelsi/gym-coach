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
  selectBicepCurlArm,
  angle,
  computeTorsoLean,
  squatConfig,
  bicepCurlConfig,
  type RepResult,
  type RepState,
} from './engine';
import {
  FeedbackManager,
  VoiceSynthesizer,
  type FeedbackResult,
  type SupportedLanguage,
} from './feedback';
import { WorkoutPanel, type SaveErrorState, type SaveSuccessState } from './ui/WorkoutPanel';
import {
  WorkoutRecorder,
  type RecordedSet,
  type RecordedRep,
  type RepReplayPayload,
} from './recording/workoutRecorder';
import { FrameBuffer, getHighlightJoints } from './recording/frameBuffer';
import {
  createSession,
  checkHealth,
  subscribeHealth,
  NetworkError,
  TimeoutError,
  ValidationError,
  ServerError,
} from './api/client';
import { parseHash, type ParsedRoute } from './analytics/navigation';
import { HistoryView } from './ui/HistoryView';
import { SessionDetailView } from './ui/SessionDetailView';
import { ProgressView } from './ui/ProgressView';

type InputMode = 'webcam' | 'video';
export type ExerciseType = 'squat' | 'bicepCurl';

export default function App() {
  const [mode, setMode] = useState<InputMode>('webcam');
  const [exercise, setExercise] = useState<ExerciseType>('squat');

  // Hash Navigation State (#coach default, #history, #history/<id>, #progress)
  const [currentRoute, setCurrentRoute] = useState<ParsedRoute>(() =>
    parseHash(typeof window !== 'undefined' ? window.location.hash : '')
  );

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentRoute(parseHash(window.location.hash));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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
  const [currentAngle, setCurrentAngle] = useState<number | null>(null);
  const [activeSide, setActiveSide] = useState<{ side: 'left' | 'right'; type: 'leg' | 'arm' } | null>(null);
  const [isBodyVisible, setIsBodyVisible] = useState<boolean>(true);

  // Feedback, Voice & Language state
  const [language, setLanguage] = useState<SupportedLanguage>('en-US');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [latestFeedback, setLatestFeedback] = useState<FeedbackResult | null>(null);
  const [lastRep, setLastRep] = useState<RepResult | null>(null);
  const [repsHistory, setRepsHistory] = useState<RepResult[]>([]);

  // Debug Chart state
  const [chartData, setChartData] = useState<AngleDataPoint[]>([]);

  // Engine & Feedback persistent instances
  const activeConfig = exercise === 'squat' ? squatConfig : bicepCurlConfig;
  const stateMachineRef = useRef<RepStateMachine>(new RepStateMachine(squatConfig));
  const filterRef = useRef<OneEuroFilter>(
    new OneEuroFilter({ minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 })
  );
  const feedbackManagerRef = useRef<FeedbackManager>(new FeedbackManager(3000));
  const voiceRef = useRef<VoiceSynthesizer>(
    new VoiceSynthesizer({
      muted: false,
      language: 'en-US',
      onFallbackNotice: (requested) => {
        setVoiceNotice(`Browser has no voice for ${requested}, falling back to English.`);
        setTimeout(() => setVoiceNotice(null), 5000);
      },
    })
  );

  // Skeleton fault joint highlighting
  const highlightJointsRef = useRef<Set<number>>(new Set());
  const highlightExpiryRef = useRef<number>(0);

  // Workout Recording state & persistent recorder
  const workoutRecorderRef = useRef<WorkoutRecorder>(new WorkoutRecorder());
  const frameBufferRef = useRef<FrameBuffer>(new FrameBuffer());
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [currentRecordedSet, setCurrentRecordedSet] = useState<{
    exercise: string;
    reps: RecordedRep[];
    averageScore: number;
  } | null>(null);
  const [finishedRecordedSets, setFinishedRecordedSets] = useState<RecordedSet[]>([]);
  const [workoutTotals, setWorkoutTotals] = useState<{ totalReps: number; averageScore: number }>({
    totalReps: 0,
    averageScore: 0,
  });
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<SaveErrorState | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<SaveSuccessState | null>(null);

  const syncWorkoutState = useCallback(() => {
    setCurrentRecordedSet(workoutRecorderRef.current.getCurrentSet());
    setFinishedRecordedSets(workoutRecorderRef.current.getFinishedSets());
    setWorkoutTotals(workoutRecorderRef.current.getTotals());
  }, []);

  const overlayRef = useRef<OverlayHandle | null>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
  const videoInputRef = useRef<VideoFileInputHandle | null>(null);

  // FPS calculation references
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(performance.now());
  const rafIdRef = useRef<number | null>(null);

  // Unlock speech audio upon user click (browser autoplay restriction)
  const unlockAudio = useCallback(() => {
    voiceRef.current.enableAudio();
  }, []);

  // Sync mute setting
  const handleToggleMute = () => {
    unlockAudio();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    voiceRef.current.setMuted(nextMuted);
  };

  // Sync language setting
  const handleLanguageChange = (newLang: SupportedLanguage) => {
    unlockAudio();
    setLanguage(newLang);
    voiceRef.current.setLanguage(newLang);
  };

  // Reset function: ends the current set (keeping its reps in the workout) and resets the live counter
  const handleReset = useCallback(() => {
    workoutRecorderRef.current.endSet();
    syncWorkoutState();

    stateMachineRef.current.reset();
    filterRef.current.reset();
    feedbackManagerRef.current.reset();
    voiceRef.current.cancel();

    highlightJointsRef.current.clear();
    highlightExpiryRef.current = 0;

    setRepCount(0);
    setCurrentState('idle');
    setCurrentAngle(null);
    setActiveSide(null);
    setChartData([]);
    setLatestFeedback(null);
    setLastRep(null);
    setRepsHistory([]);
  }, [syncWorkoutState]);

  // Handle exercise view change: switching exercise automatically ends the current set
  const handleExerciseChange = (newExercise: ExerciseType) => {
    if (newExercise === exercise) return;
    workoutRecorderRef.current.endSet();
    syncWorkoutState();
    setExercise(newExercise);
    stateMachineRef.current.setConfig(newExercise === 'squat' ? squatConfig : bicepCurlConfig);
    handleReset();
  };

  // Check backend health on load and every 15s
  useEffect(() => {
    let isMounted = true;
    const ping = async () => {
      const isOk = await checkHealth();
      if (isMounted) {
        setBackendOnline(isOk);
      }
    };
    ping();
    const interval = setInterval(ping, 15000);
    const unsubscribe = subscribeHealth((isOk) => {
      if (isMounted) {
        setBackendOnline(isOk);
      }
    });
    return () => {
      isMounted = false;
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  // Browser warning (beforeunload) if there are unsaved reps
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (workoutTotals.totalReps > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [workoutTotals.totalReps]);

  // Workout Panel actions
  const handleEndSet = () => {
    workoutRecorderRef.current.endSet();
    syncWorkoutState();
  };

  const handleFinishAndSave = async () => {
    if (isSaving || workoutTotals.totalReps === 0) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const payload = workoutRecorderRef.current.buildPayload();
      if (!payload) {
        setIsSaving(false);
        return;
      }

      await createSession(payload);

      setSaveSuccess({
        setsCount: payload.sets.length,
        totalReps: workoutTotals.totalReps,
        averageScore: workoutTotals.averageScore,
      });

      workoutRecorderRef.current.reset();
      syncWorkoutState();
    } catch (err: unknown) {
      if (err instanceof NetworkError || err instanceof TimeoutError) {
        setSaveError({
          type: 'network',
          message: err.message,
        });
      } else if (err instanceof ValidationError) {
        setSaveError({
          type: 'validation',
          message: err.message,
        });
      } else if (err instanceof ServerError) {
        setSaveError({
          type: 'server',
          message: err.message,
        });
      } else {
        setSaveError({
          type: 'server',
          message: err instanceof Error ? err.message : 'Unknown save error',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetrySave = () => {
    handleFinishAndSave();
  };

  const handleDiscardWorkout = () => {
    workoutRecorderRef.current.reset();
    setSaveError(null);
    syncWorkoutState();
  };

  const handleDismissSuccess = () => {
    setSaveSuccess(null);
  };

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

      if (currentRoute.view !== 'coach') {
        rafIdRef.current = requestAnimationFrame(processFrame);
        return;
      }

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
          // Push detected frame into ring buffer for potential worst-rep replay
          frameBufferRef.current.push(timestamp, result.landmarks);

          // Check if joint highlights are active (1.5s after faulty rep)
          const isHighlightActive = timestamp < highlightExpiryRef.current;
          overlayRef.current?.draw(
            result.landmarks,
            isHighlightActive ? highlightJointsRef.current : null
          );
          setPoseDetected(true);

          if (exercise === 'squat') {
            // Squat exercise tracking: Choose leg with higher average visibility
            const legSelection = selectSquatLeg(result.worldLandmarks, 0.5, result.landmarks);

            if (!legSelection || !legSelection.isValid) {
              setIsBodyVisible(false);
            } else {
              setIsBodyVisible(true);
              setActiveSide({ side: legSelection.side, type: 'leg' });

              const rawAngle = angle(
                legSelection.landmarks.hip,
                legSelection.landmarks.knee,
                legSelection.landmarks.ankle
              );
              const smoothedAngle = filterRef.current.filter(rawAngle, timestamp);
              const torsoLean = legSelection.landmarks.shoulder
                ? computeTorsoLean(legSelection.landmarks.hip, legSelection.landmarks.shoulder)
                : 0;

              const smResult = stateMachineRef.current.update(smoothedAngle, timestamp, {
                torsoLean,
                worldLandmarks: result.worldLandmarks,
              });

              setCurrentAngle(smoothedAngle);
              setCurrentState(smResult.state);
              setRepCount(stateMachineRef.current.getRepCount());

              if (smResult.completedRep) {
                const rep = smResult.completedRep;
                setLastRep(rep);
                setRepsHistory((prev) => [rep, ...prev].slice(0, 10));

                const vWidth = activeVideo?.videoWidth || 640;
                const vHeight = activeVideo?.videoHeight || 480;
                const aspect = vHeight > 0 ? Math.round((vWidth / vHeight) * 100) / 100 : 1.33;

                const snapFrames = frameBufferRef.current.snapshot(timestamp, rep.durationMs, 300);
                const highlightJoints = getHighlightJoints(rep.violations, legSelection.side);

                let replayPayload: RepReplayPayload | null = null;
                if (snapFrames && snapFrames.length >= 2) {
                  replayPayload = {
                    version: 1,
                    fps: 15,
                    aspect: Math.max(0.2, Math.min(5.0, aspect)),
                    mirrored: false,
                    frames: snapFrames,
                    highlight: highlightJoints,
                    violations: rep.violations.map((v) => v.ruleId),
                  };
                }

                // Feed completed rep to workout recorder
                workoutRecorderRef.current.addRep(exercise, rep, replayPayload);
                syncWorkoutState();

                const feedback = feedbackManagerRef.current.processRep(
                  rep,
                  timestamp,
                  voiceRef.current.getLanguage()
                );

                if (feedback) {
                  setLatestFeedback(feedback);
                  voiceRef.current.speak(feedback.message);
                }

                // Highlight faulty joints
                if (rep.violations && rep.violations.length > 0) {
                  highlightJointsRef.current = new Set(highlightJoints);
                  highlightExpiryRef.current = timestamp + 1500;
                } else {
                  highlightJointsRef.current.clear();
                  highlightExpiryRef.current = 0;
                }
              }

              // Append to chart history (keep last 10 seconds)
              setChartData((prev) => {
                const cutoff = timestamp - 10000;
                const filtered = prev.filter((pt) => pt.timestamp >= cutoff);
                return [...filtered, { timestamp, angle: smoothedAngle }];
              });
            }
          } else {
            // Bicep curl tracking: Choose arm with higher average visibility
            const armSelection = selectBicepCurlArm(result.worldLandmarks, 0.5, result.landmarks);

            if (!armSelection || !armSelection.isValid) {
              setIsBodyVisible(false);
            } else {
              setIsBodyVisible(true);
              setActiveSide({ side: armSelection.side, type: 'arm' });

              const rawAngle = angle(
                armSelection.landmarks.shoulder,
                armSelection.landmarks.elbow,
                armSelection.landmarks.wrist
              );
              const smoothedAngle = filterRef.current.filter(rawAngle, timestamp);

              const smResult = stateMachineRef.current.update(smoothedAngle, timestamp, {
                worldLandmarks: result.worldLandmarks,
                landmarks: result.landmarks,
                side: armSelection.side,
              });

              setCurrentAngle(smoothedAngle);
              setCurrentState(smResult.state);
              setRepCount(stateMachineRef.current.getRepCount());

              if (smResult.completedRep) {
                const rep = smResult.completedRep;
                setLastRep(rep);
                setRepsHistory((prev) => [rep, ...prev].slice(0, 10));

                const vWidth = activeVideo?.videoWidth || 640;
                const vHeight = activeVideo?.videoHeight || 480;
                const aspect = vHeight > 0 ? Math.round((vWidth / vHeight) * 100) / 100 : 1.33;

                const snapFrames = frameBufferRef.current.snapshot(timestamp, rep.durationMs, 300);
                const highlightJoints = getHighlightJoints(rep.violations, armSelection.side);

                let replayPayload: RepReplayPayload | null = null;
                if (snapFrames && snapFrames.length >= 2) {
                  replayPayload = {
                    version: 1,
                    fps: 15,
                    aspect: Math.max(0.2, Math.min(5.0, aspect)),
                    mirrored: false,
                    frames: snapFrames,
                    highlight: highlightJoints,
                    violations: rep.violations.map((v) => v.ruleId),
                  };
                }

                // Feed completed rep to workout recorder
                workoutRecorderRef.current.addRep(exercise, rep, replayPayload);
                syncWorkoutState();

                const feedback = feedbackManagerRef.current.processRep(
                  rep,
                  timestamp,
                  voiceRef.current.getLanguage()
                );

                if (feedback) {
                  setLatestFeedback(feedback);
                  voiceRef.current.speak(feedback.message);
                }

                // Highlight faulty joints for bicep curl
                if (rep.violations && rep.violations.length > 0) {
                  highlightJointsRef.current = new Set(highlightJoints);
                  highlightExpiryRef.current = timestamp + 1500;
                } else {
                  highlightJointsRef.current.clear();
                  highlightExpiryRef.current = 0;
                }
              }

              // Append to chart history (keep last 10 seconds)
              setChartData((prev) => {
                const cutoff = timestamp - 10000;
                const filtered = prev.filter((pt) => pt.timestamp >= cutoff);
                return [...filtered, { timestamp, angle: smoothedAngle }];
              });
            }
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
  }, [detector, activeVideo, syncCanvasDimensions, exercise]);

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

  // State badge styling
  const getStateBadge = (state: RepState, ex: ExerciseType) => {
    if (ex === 'squat') {
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
    } else {
      switch (state) {
        case 'idle':
          return { text: 'READY (Extended)', color: 'bg-slate-800 text-slate-300 border-slate-700' };
        case 'descending':
          return { text: 'CURLING UP ⬆', color: 'bg-cyan-950 text-cyan-300 border-cyan-700 animate-pulse' };
        case 'bottom':
          return { text: 'PEAK CONTRACTION 🎯', color: 'bg-emerald-950 text-emerald-300 border-emerald-600 font-bold' };
        case 'ascending':
          return { text: 'LOWERING ⬇', color: 'bg-indigo-950 text-indigo-300 border-indigo-700 animate-pulse' };
      }
    }
  };

  const stateBadge = getStateBadge(currentState, exercise);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Offline banner */}
      {backendOnline === false && (
        <div
          role="alert"
          data-testid="backend-offline-banner"
          className="w-full bg-rose-600 text-white text-xs py-1 px-4 text-center font-medium sticky top-0 z-50 shadow"
        >
          The backend is not reachable
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-lg font-black text-white">⚡</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                AI Gym Coach
                {currentRoute.view === 'coach' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                    {exercise === 'squat' ? 'Squat' : 'Bicep Curl'}
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-400">
                Live Coaching • Workout History • Fatigue Curve
              </p>
            </div>
          </div>

          {/* Main Navigation Tabs */}
          <nav className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 text-xs font-semibold">
            <a
              href="#coach"
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                currentRoute.view === 'coach'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🎯</span> Coach
              {workoutTotals.totalReps > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950">
                  {workoutTotals.totalReps} in progress
                </span>
              )}
            </a>
            <a
              href="#history"
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                currentRoute.view === 'history'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📜</span> History
            </a>
            <a
              href="#progress"
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                currentRoute.view === 'progress'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📈</span> Progress
            </a>
          </nav>

          {currentRoute.view === 'coach' && (
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Exercise View Selector */}
              <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-indigo-500/30 shadow-inner">
                <button
                  onClick={() => handleExerciseChange('squat')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    exercise === 'squat'
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>🏋️</span> Squat
                </button>
                <button
                  onClick={() => handleExerciseChange('bicepCurl')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    exercise === 'bicepCurl'
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>💪</span> Curl
                </button>
              </div>

              {/* Mode Switcher */}
              <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/70">
                <button
                  onClick={() => handleModeChange('webcam')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    mode === 'webcam'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  📹 Webcam
                </button>
                <button
                  onClick={() => handleModeChange('video')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    mode === 'video'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  📁 Video
                </button>
              </div>

              {/* Audio & Language Controls & Reset */}
              <div className="flex items-center gap-2">
                <select
                  value={language}
                  onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
                  aria-label="Language selector"
                  className="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2 py-1 text-xs font-medium focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value="en-US">🇺🇸 EN</option>
                  <option value="fr-FR">🇫🇷 FR</option>
                  <option value="ar">🇸🇦 AR</option>
                </select>

                <button
                  onClick={handleToggleMute}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1 ${
                    isMuted
                      ? 'bg-rose-950/70 text-rose-300 border-rose-700/50 hover:bg-rose-900/60'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                  title={isMuted ? 'Unmute voice coaching' : 'Mute voice coaching'}
                >
                  {isMuted ? 'Muted' : 'Voice'}
                </button>

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
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1 active:scale-95 shadow-sm"
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 flex flex-col items-center justify-start gap-6">
        {currentRoute.view === 'coach' && (
          <>
            {/* Voice fallback notification */}
            {voiceNotice && (
              <div className="w-full bg-amber-950/60 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-300 flex items-center gap-2">
                <span>ℹ️</span>
                <span>{voiceNotice}</span>
              </div>
            )}

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

        {/* Live Feedback Banner (Large text) */}
        {latestFeedback && (
          <div
            className={`w-full max-w-4xl rounded-2xl p-4 md:p-5 border shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-300 ${
              latestFeedback.isPositive
                ? 'bg-gradient-to-r from-emerald-950/90 to-teal-950/90 border-emerald-500/50 shadow-emerald-950/50 text-emerald-100'
                : 'bg-gradient-to-r from-rose-950/90 to-amber-950/90 border-rose-500/50 shadow-rose-950/50 text-rose-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">
                {latestFeedback.isPositive ? '👏' : '⚠️'}
              </span>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider opacity-75">
                  Live Coach Feedback
                </span>
                <p className="text-2xl md:text-3xl font-black tracking-tight mt-0.5">
                  &ldquo;{latestFeedback.message}&rdquo;
                </p>
              </div>
            </div>

            {lastRep && (
              <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-xl border border-white/10">
                <span className="text-xs text-slate-300">Last Rep Score</span>
                <span
                  className={`text-2xl font-black font-mono ${
                    lastRep.score >= 90
                      ? 'text-emerald-400'
                      : lastRep.score >= 70
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {lastRep.score}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Live Exercise Metric Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-4xl">
          {/* Rep Counter */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-lg">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {exercise === 'squat' ? 'Squat Reps' : 'Curl Reps'}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-black text-indigo-400 font-mono tracking-tight">{repCount}</span>
              <span className="text-xs text-slate-500">completed</span>
            </div>
          </div>

          {/* Joint Angle (Knee or Elbow) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-lg">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {exercise === 'squat' ? 'Knee Angle' : 'Elbow Angle'}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-black text-cyan-400 font-mono tracking-tight">
                {currentAngle !== null ? currentAngle.toFixed(0) : '--'}
                <span className="text-2xl font-light">°</span>
              </span>
              <span className="text-[11px] text-slate-500 capitalize">
                {activeSide ? `${activeSide.side} ${activeSide.type}` : 'tracking'}
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

          {/* Last Rep Score card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-lg">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Rep Score</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                className={`text-4xl font-black font-mono tracking-tight ${
                  lastRep
                    ? lastRep.score >= 90
                      ? 'text-emerald-400'
                      : lastRep.score >= 70
                      ? 'text-amber-400'
                      : 'text-rose-400'
                    : 'text-slate-600'
                }`}
              >
                {lastRep ? lastRep.score : '--'}
              </span>
              <span className="text-[11px] text-slate-500">/ 100</span>
            </div>
          </div>
        </div>

        {/* Video Player + Overlay */}
        <div className="relative w-full max-w-4xl flex flex-col items-center">
          {mode === 'webcam' ? (
            <Camera
              ref={cameraRef}
              onVideoElement={(video) => {
                unlockAudio();
                setActiveVideo(video);
              }}
            >
              <Overlay ref={overlayRef} />
            </Camera>
          ) : (
            <VideoFileInput
              ref={videoInputRef}
              onVideoElement={(video) => {
                unlockAudio();
                setActiveVideo(video);
              }}
            >
              <Overlay ref={overlayRef} />
            </VideoFileInput>
          )}

          {/* Warning banner when key landmarks not visible */}
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
                {exercise === 'squat'
                  ? 'Step back, full body in frame'
                  : 'Keep torso and active arm in frame'}
              </span>
            </div>
          )}
        </div>

        {/* Exercise Coaching Tips Banner */}
        <div className="w-full max-w-4xl bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{exercise === 'squat' ? '💡' : '🎯'}</span>
            <span>
              {exercise === 'squat' ? (
                <>
                  <strong className="text-slate-200">Squat Form Guide:</strong> Best viewed from side. Squat below parallel (&lt;100°), keep chest up (&lt;45°), and control tempo (&gt;0.8s descent).
                </>
              ) : (
                <>
                  <strong className="text-slate-200">Bicep Curl Guide:</strong> Front or side view. Pin your elbows (&le;22% drift), avoid body sway (&le;15%), fully extend (&ge;150°), and curl up (&le;55°).
                </>
              )}
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            {exercise === 'squat' ? 'Knee angle signal (160°/120°)' : 'Elbow angle signal (140°/70°)'}
          </span>
        </div>

        {/* Workout Session Recording & Management Panel */}
        <WorkoutPanel
          backendOnline={backendOnline}
          currentSet={currentRecordedSet}
          finishedSets={finishedRecordedSets}
          totals={workoutTotals}
          isSaving={isSaving}
          saveError={saveError}
          saveSuccess={saveSuccess}
          onEndSet={handleEndSet}
          onFinishAndSave={handleFinishAndSave}
          onRetrySave={handleRetrySave}
          onDiscard={handleDiscardWorkout}
          onDismissSuccess={handleDismissSuccess}
        />

        {/* Reps History Table (Last 10 Reps with score & violations) */}
        {repsHistory.length > 0 && (
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <span>📋</span> Last {repsHistory.length} {exercise === 'squat' ? 'Squat' : 'Curl'} Reps History
              </h3>
              <span className="text-[11px] text-slate-500">
                Sorted by most recent
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="py-2 px-3">Rep #</th>
                    <th className="py-2 px-3">Score</th>
                    {exercise === 'squat' ? (
                      <>
                        <th className="py-2 px-3">Min Knee</th>
                        <th className="py-2 px-3">Torso Lean</th>
                        <th className="py-2 px-3">Descent</th>
                        <th className="py-2 px-3">Start / Bottom (ms)</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2 px-3">Min Elbow (Height)</th>
                        <th className="py-2 px-3">Max Elbow (Extension)</th>
                        <th className="py-2 px-3">Elbow Drift</th>
                        <th className="py-2 px-3">Body Sway</th>
                      </>
                    )}
                    <th className="py-2 px-3">Feedback / Form Violations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {repsHistory.map((rep, idx) => {
                    const repIndex = repCount - idx;
                    const hasViolations = rep.violations && rep.violations.length > 0;
                    return (
                      <tr key={rep.timestamp} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-semibold text-slate-300">
                          #{repIndex}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                              rep.score >= 90
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                                : rep.score >= 70
                                ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                                : 'bg-rose-950 text-rose-300 border border-rose-700/60'
                            }`}
                          >
                            {rep.score}
                          </span>
                        </td>
                        {exercise === 'squat' ? (
                          <>
                            <td className="py-2.5 px-3 text-slate-300">
                              {rep.metrics.minKneeAngle !== undefined ? `${rep.metrics.minKneeAngle.toFixed(0)}°` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-300">
                              {rep.metrics.maxTorsoLean !== undefined ? `${rep.metrics.maxTorsoLean.toFixed(0)}°` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">
                              {(rep.metrics.descentDurationMs / 1000).toFixed(1)}s
                              <span className="block text-[10px] text-slate-500 font-mono">
                                {Math.round(rep.metrics.descentDurationMs)}ms
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 text-[11px] font-mono whitespace-nowrap">
                              <div>Start: {Math.round(rep.metrics.descentStartMs)}ms</div>
                              <div>Bottom: {Math.round(rep.metrics.bottomMs)}ms</div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2.5 px-3 text-slate-300">
                              {rep.metrics.minElbowAngle !== undefined ? `${rep.metrics.minElbowAngle.toFixed(0)}°` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-300">
                              {rep.metrics.maxElbowAngle !== undefined ? `${rep.metrics.maxElbowAngle.toFixed(0)}°` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">
                              {rep.metrics.elbowDrift !== undefined ? `${(rep.metrics.elbowDrift * 100).toFixed(1)}%` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">
                              {rep.metrics.bodySway !== undefined ? `${(rep.metrics.bodySway * 100).toFixed(1)}%` : '-'}
                            </td>
                          </>
                        )}
                        <td className="py-2.5 px-3">
                          {!hasViolations ? (
                            <span className="text-emerald-400 text-[11px] font-sans font-medium flex items-center gap-1">
                              ✓ Good form
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1 font-sans">
                              {rep.violations.map((v) => (
                                <span
                                  key={v.ruleId}
                                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-950/80 text-rose-300 border border-rose-800/50"
                                  title={`Penalty -${v.penalty}`}
                                >
                                  {v.message} (-{v.penalty})
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Debug Panel: Live Line Chart */}
        <div className="w-full max-w-4xl">
          <AngleChart
            data={chartData}
            upThreshold={activeConfig.upThreshold}
            downThreshold={activeConfig.downThreshold}
            currentAngle={currentAngle}
            width={800}
            height={200}
          />
        </div>
      </>
    )}

    {currentRoute.view === 'history' &&
      (currentRoute.id ? (
        <SessionDetailView
          sessionId={currentRoute.id}
          initialLanguage={language.startsWith('fr') ? 'fr' : language === 'ar' ? 'ar' : 'en'}
          onBack={() => {
            window.location.hash = '#history';
          }}
        />
      ) : (
        <HistoryView
          backendOnline={backendOnline}
          onSelectSession={(id) => {
            window.location.hash = `#history/${id}`;
          }}
          onGoToCoach={() => {
            window.location.hash = '#coach';
          }}
        />
      ))}

    {currentRoute.view === 'progress' && (
      <ProgressView
        backendOnline={backendOnline}
        onGoToCoach={() => {
          window.location.hash = '#coach';
        }}
      />
    )}
  </main>
</div>
);
}
