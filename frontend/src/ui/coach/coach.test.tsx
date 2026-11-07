// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { VideoStage } from './VideoStage';
import { HudOverlays } from './HudOverlays';
import { CoachSidePanel } from './CoachSidePanel';
import { ExerciseCards } from './ExerciseCards';
import type { FeedbackResult } from '../../feedback';
import type { RepResult } from '../../engine';

describe('Coach Screen Redesign (Task D.2)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Component States: Idle Onboarding, Permission Denied, Model Loading, Running', () => {
    it('renders idle onboarding state with silhouette, checklist, and Start button', () => {
      const handleStart = vi.fn();
      render(
        <VideoStage
          isActive={false}
          isLoading={false}
          isModelLoading={false}
          cameraError={null}
          modelError={null}
          exercise="squat"
          currentState="idle"
          repCount={0}
          lastRep={null}
          latestFeedback={null}
          isBodyVisible={true}
          onStartCamera={handleStart}
          onStopCamera={vi.fn()}
        />
      );

      expect(screen.getByTestId('coach-onboarding')).toBeTruthy();
      expect(screen.getByText(/Setup Your Squat Coaching/i)).toBeTruthy();
      expect(screen.getByText(/Full body in frame/i)).toBeTruthy();
      expect(screen.getByText(/Side-on angle/i)).toBeTruthy();
      expect(screen.getByText(/Camera at hip height/i)).toBeTruthy();

      const startBtn = screen.getByRole('button', { name: /Start Camera/i });
      fireEvent.click(startBtn);
      expect(handleStart).toHaveBeenCalledTimes(1);
    });

    it('renders camera permission denied state with instructions and retry button', () => {
      const handleRetry = vi.fn();
      render(
        <VideoStage
          isActive={false}
          isLoading={false}
          isModelLoading={false}
          cameraError="Permission denied by system"
          modelError={null}
          exercise="squat"
          currentState="idle"
          repCount={0}
          lastRep={null}
          latestFeedback={null}
          isBodyVisible={true}
          onStartCamera={handleRetry}
          onStopCamera={vi.fn()}
        />
      );

      expect(screen.getByTestId('coach-camera-denied')).toBeTruthy();
      expect(screen.getByText(/Camera Access Denied/i)).toBeTruthy();
      expect(screen.getByText(/Permission denied by system/i)).toBeTruthy();

      const retryBtn = screen.getByRole('button', { name: /Try Camera Again/i });
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it('renders model loading skeleton state with descriptive message', () => {
      render(
        <VideoStage
          isActive={false}
          isLoading={false}
          isModelLoading={true}
          cameraError={null}
          modelError={null}
          exercise="squat"
          currentState="idle"
          repCount={0}
          lastRep={null}
          latestFeedback={null}
          isBodyVisible={true}
          onStartCamera={vi.fn()}
          onStopCamera={vi.fn()}
        />
      );

      expect(screen.getByTestId('coach-model-loading')).toBeTruthy();
      expect(screen.getByText(/Loading MediaPipe Pose Landmarker/i)).toBeTruthy();
    });

    it('renders active running state with video container and HUD overlays', () => {
      render(
        <VideoStage
          isActive={true}
          isLoading={false}
          isModelLoading={false}
          cameraError={null}
          modelError={null}
          exercise="squat"
          currentState="descending"
          repCount={7}
          lastRep={{
            score: 92,
            minAngle: 95,
            maxAngle: 165,
            durationMs: 1500,
            metrics: {} as any,
            violations: [],
            timestamp: 1234567890,
          }}
          latestFeedback={{ message: 'Good depth!', isPositive: true }}
          isBodyVisible={true}
          onStartCamera={vi.fn()}
          onStopCamera={vi.fn()}
        >
          <div data-testid="test-video-stream">Live Stream</div>
        </VideoStage>
      );

      expect(screen.getByTestId('test-video-stream')).toBeTruthy();
      expect(screen.getByTestId('hud-top-left')).toBeTruthy();
      expect(screen.getByTestId('hud-bottom-left')).toBeTruthy();
      expect(screen.getByTestId('hud-top-right')).toBeTruthy();
      expect(screen.getByTestId('hud-feedback-toast')).toBeTruthy();
    });
  });

  describe('2. HUD Overlays and Props Data Display', () => {
    it('displays exercise name, state badge, rep count, score ring, and feedback message from props', () => {
      const mockLastRep: RepResult = {
        score: 88,
        minAngle: 95,
        maxAngle: 165,
        durationMs: 1500,
        metrics: { minKneeAngle: 95 } as any,
        violations: [],
        timestamp: 1700000000000,
      };

      const mockFeedback: FeedbackResult = {
        message: 'Chest high, great posture!',
        isPositive: true,
      };

      render(
        <HudOverlays
          exercise="squat"
          currentState="bottom"
          repCount={12}
          lastRep={mockLastRep}
          latestFeedback={mockFeedback}
          isBodyVisible={true}
        />
      );

      // Top-left chip
      const topLeft = screen.getByTestId('hud-top-left');
      expect(topLeft.textContent).toContain('Squat');
      expect(topLeft.textContent).toContain('BOTTOM DEPTH');

      // Bottom-left rep counter
      const repCounter = screen.getByTestId('hud-rep-counter');
      expect(repCounter.textContent).toBe('12');

      // Top-right ScoreRing
      const scoreRing = screen.getByRole('img');
      expect(scoreRing.getAttribute('aria-label')).toBe('Score 88 out of 100');

      // Bottom-center feedback toast
      const toast = screen.getByTestId('hud-feedback-toast');
      expect(toast.textContent).toContain('Chest high, great posture!');
    });

    it('displays landmark visibility warning when isBodyVisible is false', () => {
      render(
        <HudOverlays
          exercise="squat"
          currentState="idle"
          repCount={0}
          lastRep={null}
          latestFeedback={null}
          isBodyVisible={false}
        />
      );

      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText(/Step back, full body in frame/i)).toBeTruthy();
    });
  });

  describe('3. Severity to Color Mapping in Feedback Toast', () => {
    it('maps positive feedback to emerald tone classes', () => {
      render(
        <HudOverlays
          exercise="squat"
          currentState="descending"
          repCount={3}
          lastRep={null}
          latestFeedback={{ message: 'Excellent descent speed', isPositive: true }}
          isBodyVisible={true}
        />
      );

      const toast = screen.getByTestId('hud-feedback-toast');
      expect(toast.className).toContain('bg-emerald-950/80');
      expect(toast.className).toContain('border-emerald-500/60');
    });

    it('maps warning/negative violation feedback to rose tone classes', () => {
      render(
        <HudOverlays
          exercise="squat"
          currentState="descending"
          repCount={3}
          lastRep={null}
          latestFeedback={{ message: 'Squat deeper below parallel', isPositive: false }}
          isBodyVisible={true}
        />
      );

      const toast = screen.getByTestId('hud-feedback-toast');
      expect(toast.className).toContain('bg-rose-950/80');
      expect(toast.className).toContain('border-rose-500/60');
    });
  });

  describe('4. Workout Panel Buttons Enabled / Disabled Rules and Discard Dialog', () => {
    it('enforces End Set and Finish & Save enabled/disabled rules', () => {
      const handleEndSet = vi.fn();
      const handleFinishSave = vi.fn();

      // Case A: 0 reps in active set, 0 total reps -> both disabled
      const { rerender } = render(
        <CoachSidePanel
          currentSet={{ exercise: 'squat', reps: [], averageScore: 0 }}
          finishedSets={[]}
          totals={{ totalReps: 0, averageScore: 0 }}
          isSaving={false}
          saveError={null}
          saveSuccess={null}
          onEndSet={handleEndSet}
          onFinishAndSave={handleFinishSave}
          onRetrySave={vi.fn()}
          onDiscard={vi.fn()}
          onDismissSuccess={vi.fn()}
          repsHistory={[]}
        />
      );

      const endSetBtn = screen.getByRole('button', { name: /End Set/i });
      const finishSaveBtn = screen.getByRole('button', { name: /Finish & Save/i });
      const discardBtn = screen.getByRole('button', { name: /Discard Workout/i });

      expect(endSetBtn.getAttribute('disabled')).not.toBeNull();
      expect(finishSaveBtn.getAttribute('disabled')).not.toBeNull();
      expect(discardBtn.getAttribute('disabled')).not.toBeNull();

      // Case B: 3 reps in current active set -> End Set enabled, Finish & Save enabled, Discard enabled
      rerender(
        <CoachSidePanel
          currentSet={{
            exercise: 'squat',
            reps: [
              { index: 1, score: 90, duration_ms: 1500, metrics: {}, violations: [], timestamp: 1 },
            ],
            averageScore: 90,
          }}
          finishedSets={[]}
          totals={{ totalReps: 1, averageScore: 90 }}
          isSaving={false}
          saveError={null}
          saveSuccess={null}
          onEndSet={handleEndSet}
          onFinishAndSave={handleFinishSave}
          onRetrySave={vi.fn()}
          onDiscard={vi.fn()}
          onDismissSuccess={vi.fn()}
          repsHistory={[{ index: 1, score: 90, duration_ms: 1500, metrics: {}, violations: [], timestamp: 1 }]}
        />
      );

      expect(screen.getByRole('button', { name: /End Set/i }).getAttribute('disabled')).toBeNull();
      expect(screen.getByRole('button', { name: /Finish & Save/i }).getAttribute('disabled')).toBeNull();
      expect(screen.getByRole('button', { name: /Discard Workout/i }).getAttribute('disabled')).toBeNull();
    });

    it('opens confirmation Dialog on Discard click and executes onDiscard only after confirming', () => {
      const handleDiscard = vi.fn();
      render(
        <CoachSidePanel
          currentSet={{
            exercise: 'squat',
            reps: [{ index: 1, score: 90, duration_ms: 1500, metrics: {}, violations: [], timestamp: 1 }],
            averageScore: 90,
          }}
          finishedSets={[]}
          totals={{ totalReps: 1, averageScore: 90 }}
          isSaving={false}
          saveError={null}
          saveSuccess={null}
          onEndSet={vi.fn()}
          onFinishAndSave={vi.fn()}
          onRetrySave={vi.fn()}
          onDiscard={handleDiscard}
          onDismissSuccess={vi.fn()}
          repsHistory={[]}
        />
      );

      const discardBtn = screen.getByRole('button', { name: /Discard Workout/i });
      fireEvent.click(discardBtn);

      // Dialog opens
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(screen.getByText(/Discard Workout Session\?/i)).toBeTruthy();
      expect(handleDiscard).not.toHaveBeenCalled();

      // Click "Yes, Discard"
      const confirmBtn = screen.getByRole('button', { name: /Yes, Discard/i });
      fireEvent.click(confirmBtn);

      expect(handleDiscard).toHaveBeenCalledTimes(1);
    });

    it('expands and collapses biometrics for recent reps', () => {
      render(
        <CoachSidePanel
          currentSet={null}
          finishedSets={[]}
          totals={{ totalReps: 1, averageScore: 85 }}
          isSaving={false}
          saveError={null}
          saveSuccess={null}
          onEndSet={vi.fn()}
          onFinishAndSave={vi.fn()}
          onRetrySave={vi.fn()}
          onDiscard={vi.fn()}
          onDismissSuccess={vi.fn()}
          repsHistory={[
            {
              index: 1,
              score: 85,
              duration_ms: 1600,
              metrics: { minKneeAngle: 94, maxTorsoLean: 38 },
              violations: ['shallow'],
              timestamp: 1000,
            },
          ]}
        />
      );

      // Initially details are collapsed
      expect(screen.queryByText(/Min Knee Angle:/i)).toBeNull();

      // Click rep row to expand
      fireEvent.click(screen.getByText(/Score 85/i));
      expect(screen.getByText(/Min Knee Angle:/i)).toBeTruthy();
      expect(screen.getByText('94°')).toBeTruthy();
      expect(screen.getByText(/shallow/i)).toBeTruthy();

      // Click again to collapse
      fireEvent.click(screen.getByText(/Score 85/i));
      expect(screen.queryByText(/Min Knee Angle:/i)).toBeNull();
    });
  });

  describe('5. Rep Counter Bump Animation respects prefers-reduced-motion', () => {
    it('applies bump animation when reduced motion is false', () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false, // does NOT prefer reduced motion
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { rerender } = render(
        <HudOverlays
          exercise="squat"
          currentState="idle"
          repCount={3}
          lastRep={null}
          latestFeedback={null}
          isBodyVisible={true}
        />
      );

      const counter = screen.getByTestId('hud-rep-counter');
      expect(counter.className).toContain('scale-100');

      // Increment repCount
      rerender(
        <HudOverlays
          exercise="squat"
          currentState="idle"
          repCount={4}
          lastRep={null}
          latestFeedback={null}
          isBodyVisible={true}
        />
      );

      expect(counter.className).toContain('scale-125');
    });

    it('skips bump animation when prefers-reduced-motion is true', () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query.includes('prefers-reduced-motion'), // prefers reduced motion!
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { rerender } = render(
        <HudOverlays
          exercise="squat"
          currentState="idle"
          repCount={5}
          lastRep={null}
          latestFeedback={null}
          isBodyVisible={true}
        />
      );

      const counter = screen.getByTestId('hud-rep-counter');

      // Increment repCount
      rerender(
        <HudOverlays
          exercise="squat"
          currentState="idle"
          repCount={6}
          lastRep={null}
          latestFeedback={null}
          isBodyVisible={true}
        />
      );

      // Should remain scale-100 (bump skipped)
      expect(counter.className).toContain('scale-100');
      expect(counter.className).not.toContain('scale-125');
    });
  });

  describe('6. Exercise Selector Cards', () => {
    it('renders large cards for Squat and Bicep Curl and switches selection', () => {
      const handleSelect = vi.fn();
      render(<ExerciseCards selected="squat" onSelect={handleSelect} />);

      const cards = screen.getAllByRole('radio');
      expect(cards).toHaveLength(2);

      expect(cards[0].getAttribute('aria-checked')).toBe('true');
      expect(cards[1].getAttribute('aria-checked')).toBe('false');

      fireEvent.click(cards[1]);
      expect(handleSelect).toHaveBeenCalledWith('bicepCurl');
    });
  });
});
