// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReplayPlayer } from './ReplayPlayer';
import { SessionDetailView } from './SessionDetailView';
import type { RepReplayPayload, SessionRead } from '../api/client';

const mockReplay: RepReplayPayload = {
  version: 1,
  fps: 15,
  aspect: 1.333,
  mirrored: true,
  frames: [
    Array(33).fill([0.5, 0.5]),
    Array(33).fill([0.52, 0.51]),
    Array(33).fill([0.54, 0.52]),
    Array(33).fill([0.56, 0.53]),
  ],
  highlight: [25, 27],
  violations: ['depth'],
};

const mockSessionWithReplays: SessionRead = {
  id: 42,
  started_at: '2026-11-05T10:00:00Z',
  ended_at: '2026-11-05T10:05:00Z',
  sets: [
    {
      id: 101,
      exercise: 'squat',
      started_at: '2026-11-05T10:00:00Z',
      ended_at: '2026-11-05T10:02:00Z',
      reps: [
        {
          id: 201,
          index: 1,
          score: 95,
          duration_ms: 2200,
          metrics: { minKneeAngle: 92 },
          violations: [],
          timestamp: 1793700130000,
          has_replay: false,
        },
        {
          id: 202,
          index: 2,
          score: 68,
          duration_ms: 2100,
          metrics: { minKneeAngle: 110 },
          violations: ['depth'],
          timestamp: 1793700133000,
          has_replay: true,
        },
        {
          id: 203,
          index: 3,
          score: 74,
          duration_ms: 2050,
          metrics: { minKneeAngle: 105 },
          violations: ['depth'],
          timestamp: 1793700136000,
          has_replay: true,
        },
      ],
    },
  ],
};

describe('ReplayPlayer & SessionDetailView Replay Integration', () => {
  const originalFetch = globalThis.fetch;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();

    // Mock Canvas context in jsdom
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      canvas: { width: 480, height: 360 },
    });

    // Mock matchMedia default (motion reduce: false)
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.matchMedia = originalMatchMedia;
  });

  // Test Group f: Component features
  describe('Group f: ReplayPlayer component controls and accessibility', () => {
    it('renders title, score, and translated violation chips', () => {
      render(
        <ReplayPlayer
          replay={mockReplay}
          repIndex={3}
          score={72}
          violations={['depth']}
          exercise="squat"
        />
      );

      // Title & Score
      expect(screen.getByText(/Rep #3, score 72/i)).toBeTruthy();
      // Translated violation chip for 'depth' (English: 'Go lower')
      expect(screen.getByText(/Go lower/i)).toBeTruthy();
      // Canvas role & aria-label
      const canvas = screen.getByRole('img');
      expect(canvas.getAttribute('aria-label')).toContain('Replay of rep 3, squat, score 72');
    });

    it('defaults to speed 0.5x and loop enabled', () => {
      render(
        <ReplayPlayer
          replay={mockReplay}
          repIndex={1}
          score={85}
          violations={[]}
        />
      );

      // 0.5x button is active (aria-pressed="true")
      const halfSpeedBtn = screen.getByRole('button', { name: /0\.5x speed/i });
      expect(halfSpeedBtn.getAttribute('aria-pressed')).toBe('true');

      // Loop checkbox is checked
      const loopCheckbox = screen.getByRole('checkbox', { name: /loop/i }) as HTMLInputElement;
      expect(loopCheckbox.checked).toBe(true);
    });

    it('pauses playback during scrubber drag and resumes after', () => {
      render(
        <ReplayPlayer
          replay={mockReplay}
          repIndex={1}
          score={85}
          violations={[]}
        />
      );

      // Initially playing (Pause button visible)
      expect(screen.getByRole('button', { name: /pause/i })).toBeTruthy();

      const scrubber = screen.getByRole('slider', { name: /replay scrubber/i });

      // Start drag
      fireEvent.pointerDown(scrubber);
      // Playback paused during drag -> Play button visible
      expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();

      // Change scrubber
      fireEvent.change(scrubber, { target: { value: '2' } });

      // End drag
      fireEvent.pointerUp(scrubber);
      // Resumed playing -> Pause button visible again
      expect(screen.getByRole('button', { name: /pause/i })).toBeTruthy();
    });

    it('toggles play/pause with Space key', () => {
      render(
        <ReplayPlayer
          replay={mockReplay}
          repIndex={1}
          score={85}
          violations={[]}
        />
      );

      // Starts playing -> Pause button
      expect(screen.getByRole('button', { name: /pause/i })).toBeTruthy();

      // Press Space -> Paused
      fireEvent.keyDown(window, { key: ' ' });
      expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();

      // Press Space again -> Resumes playing
      fireEvent.keyDown(window, { key: ' ' });
      expect(screen.getByRole('button', { name: /pause/i })).toBeTruthy();
    });

    it('opens paused when prefers-reduced-motion is true', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      render(
        <ReplayPlayer
          replay={mockReplay}
          repIndex={1}
          score={85}
          violations={[]}
        />
      );

      // Opened paused -> Play button visible instead of Pause
      expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /pause/i })).toBeNull();
    });
  });

  // Integration with SessionDetailView
  describe('Group f (cont.): SessionDetailView integration, caching, error states & accordion', () => {
    const handleFetchMock = (
      url: string,
      replayHandler: (url: string) => Promise<Response>
    ) => {
      if (url.includes('/report')) {
        return Promise.resolve(
          new Response(JSON.stringify({ detail: 'No report yet' }), {
            status: 404,
          })
        );
      }
      if (url.includes('/replay')) {
        return replayHandler(url);
      }
      if (url.includes('/sessions/42')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockSessionWithReplays), { status: 200 })
        );
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    };

    it('fetches on click, caches on second click (getReplay called once)', async () => {
      let replayFetchCount = 0;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        return handleFetchMock(url, (reqUrl) => {
          if (reqUrl.includes('/reps/202/replay')) {
            replayFetchCount++;
            return Promise.resolve(
              new Response(JSON.stringify(mockReplay), { status: 200 })
            );
          }
          return Promise.reject(new Error(`Unhandled replay URL: ${reqUrl}`));
        });
      });

      render(<SessionDetailView sessionId={42} onBack={() => {}} />);

      // Wait for session to load
      const replayWorstBtn = await screen.findByRole('button', {
        name: /replay worst rep/i,
      });
      expect(replayWorstBtn).toBeTruthy();

      // First click: fetches replay
      fireEvent.click(replayWorstBtn);
      expect(await screen.findByText(/Rep #2, score 68/i)).toBeTruthy();
      expect(replayFetchCount).toBe(1);

      // Close player via close button
      const closeBtn = screen.getByRole('button', { name: /close replay/i });
      fireEvent.click(closeBtn);
      expect(screen.queryByText(/Rep #2, score 68/i)).toBeNull();

      // Re-click replay worst rep: opens from cache without refetching
      fireEvent.click(replayWorstBtn);
      expect(await screen.findByText(/Rep #2, score 68/i)).toBeTruthy();
      expect(replayFetchCount).toBe(1); // Still 1!
    });

    it('shows 404 message when replay is missing', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        return handleFetchMock(url, () => {
          return Promise.resolve(
            new Response(JSON.stringify({ detail: 'Replay not found' }), {
              status: 404,
            })
          );
        });
      });

      render(<SessionDetailView sessionId={42} onBack={() => {}} />);
      const replayWorstBtn = await screen.findByRole('button', {
        name: /replay worst rep/i,
      });
      fireEvent.click(replayWorstBtn);

      expect(
        await screen.findByText(/Replay unavailable for this rep/i)
      ).toBeTruthy();
    });

    it('shows retry button on network error and retries on click', async () => {
      let attempts = 0;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        return handleFetchMock(url, () => {
          attempts++;
          if (attempts === 1) {
            return Promise.reject(new Error('Failed to fetch'));
          }
          return Promise.resolve(
            new Response(JSON.stringify(mockReplay), { status: 200 })
          );
        });
      });

      render(<SessionDetailView sessionId={42} onBack={() => {}} />);
      const replayWorstBtn = await screen.findByRole('button', {
        name: /replay worst rep/i,
      });
      fireEvent.click(replayWorstBtn);

      // Error message & Retry button visible
      expect(await screen.findByText(/Backend unreachable/i)).toBeTruthy();
      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeTruthy();

      // Click retry
      fireEvent.click(retryBtn);
      expect(await screen.findByText(/Rep #2, score 68/i)).toBeTruthy();
      expect(attempts).toBe(2);
    });

    it('only one player is open at a time (opening a second closes the first)', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        return handleFetchMock(url, (reqUrl) => {
          if (reqUrl.includes('/reps/202/replay')) {
            return Promise.resolve(
              new Response(JSON.stringify(mockReplay), { status: 200 })
            );
          }
          if (reqUrl.includes('/reps/203/replay')) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ ...mockReplay, violations: ['tempo'] }),
                { status: 200 }
              )
            );
          }
          return Promise.reject(new Error(`Unknown replay: ${reqUrl}`));
        });
      });

      render(<SessionDetailView sessionId={42} onBack={() => {}} />);
      await screen.findByRole('button', { name: /replay worst rep/i });

      // Click rep 2 play button in table
      const rep2Btn = screen.getByRole('button', { name: /replay rep 2/i });
      fireEvent.click(rep2Btn);

      expect(await screen.findByText(/Rep #2, score 68/i)).toBeTruthy();

      // Click rep 3 play button in table
      const rep3Btn = screen.getByRole('button', { name: /replay rep 3/i });
      fireEvent.click(rep3Btn);

      // Rep 3 opens and Rep 2 is closed
      expect(await screen.findByText(/Rep #3, score 74/i)).toBeTruthy();
      expect(screen.queryByText(/Rep #2, score 68/i)).toBeNull();
      // Exactly 1 canvas rendered
      expect(screen.getAllByRole('img').length).toBe(1);
    });
  });

  // Test Group g: Animation loop stopped when paused, cancelled on unmount
  describe('Group g: requestAnimationFrame loop management', () => {
    it('cancels animation frame on unmount', () => {
      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
      const { unmount } = render(
        <ReplayPlayer
          replay={mockReplay}
          repIndex={1}
          score={85}
          violations={[]}
        />
      );

      unmount();
      expect(cancelSpy).toHaveBeenCalled();
    });

    it('stops animation loop when paused', () => {
      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
      render(
        <ReplayPlayer
          replay={mockReplay}
          repIndex={1}
          score={85}
          violations={[]}
        />
      );

      // Click pause
      const pauseBtn = screen.getByRole('button', { name: /pause/i });
      fireEvent.click(pauseBtn);

      // Cancels the active rAF
      expect(cancelSpy).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();
    });
  });
});
