import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, type CameraHandle } from './ui/Camera';
import { VideoFileInput, type VideoFileInputHandle } from './ui/VideoFileInput';
import { Overlay, type OverlayHandle } from './ui/Overlay';
import type { AngleDataPoint } from './ui/AngleChart';
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
import type { SaveErrorState, SaveSuccessState } from './ui/WorkoutPanel';
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
import { AppShell } from './ui/shell/AppShell';
import { DesignStyleGuide } from './ui/DesignStyleGuide';
import { ToastProvider } from './ui/kit';
import { ExerciseCards } from './ui/coach/ExerciseCards';
import { HudOverlays } from './ui/coach/HudOverlays';
import { CoachSidePanel } from './ui/coach/CoachSidePanel';
import { CoachToolbar } from './ui/coach/CoachToolbar';

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

  return (
    <ToastProvider>
      <AppShell
        currentView={currentRoute.view}
        backendOnline={backendOnline}
        inProgressReps={workoutTotals.totalReps}
      >
        {/* Main Content Area */}
        <div className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 flex flex-col items-center justify-start gap-6">
          {currentRoute.view === 'coach' && (
            <div className="w-full flex flex-col gap-6">
              {/* Voice fallback notification */}
              {voiceNotice && (
                <div className="w-full bg-amber-950/60 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-300 flex items-center gap-2">
                  <span>ℹ️</span>
                  <span>{voiceNotice}</span>
                </div>
              )}

              {/* Model loading alert */}
              {isModelLoading && (
                <div className="w-full bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-xl p-3 flex items-center gap-3 text-xs text-[var(--accent)]">
                  <svg className="animate-spin h-4 w-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24">
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

              {/* Exercise Selector Cards */}
              <ExerciseCards
                selected={exercise}
                onSelect={(ex) => handleExerciseChange(ex)}
                disabled={activeVideo !== null && !activeVideo.paused}
              />

              {/* Responsive Layout: Video Stage + Side Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
                {/* Hero Video Stage & Toolbar (Left Column) */}
                <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4 w-full">
                  <div className="relative w-full">
                    {mode === 'webcam' ? (
                      <Camera
                        ref={cameraRef}
                        exercise={exercise}
                        onVideoElement={(video) => {
                          unlockAudio();
                          setActiveVideo(video);
                        }}
                      >
                        <Overlay ref={overlayRef} />
                        <HudOverlays
                          exercise={exercise}
                          currentState={currentState}
                          repCount={repCount}
                          lastRep={lastRep}
                          latestFeedback={latestFeedback}
                          isBodyVisible={isBodyVisible}
                        />
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
                        <HudOverlays
                          exercise={exercise}
                          currentState={currentState}
                          repCount={repCount}
                          lastRep={lastRep}
                          latestFeedback={latestFeedback}
                          isBodyVisible={isBodyVisible}
                        />
                      </VideoFileInput>
                    )}
                  </div>

                  {/* Compact Toolbar, Performance & Collapsible Angle Chart */}
                  <CoachToolbar
                    mode={mode}
                    onModeChange={handleModeChange}
                    language={language}
                    onLanguageChange={handleLanguageChange}
                    isMuted={isMuted}
                    onToggleMute={handleToggleMute}
                    onReset={handleReset}
                    fps={fps}
                    delegate={delegate}
                    inferenceTimeMs={inferenceTimeMs}
                    poseDetected={poseDetected}
                    activeSide={activeSide}
                    chartData={chartData}
                    upThreshold={activeConfig.upThreshold}
                    downThreshold={activeConfig.downThreshold}
                    currentAngle={currentAngle}
                  />
                </div>

                {/* Side Panel on Desktop & Bottom Sheet on Mobile (Right Column) */}
                <div className="lg:col-span-5 xl:col-span-4 w-full max-lg:order-last">
                  <CoachSidePanel
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
                    repsHistory={repsHistory}
                  />
                </div>
              </div>
            </div>
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

        {currentRoute.view === 'design' && <DesignStyleGuide />}
      </div>
    </AppShell>
  </ToastProvider>
);
}
