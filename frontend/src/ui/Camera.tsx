import { useEffect, useRef, useState, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { Button } from './kit/Button';
import { Camera as CameraIcon, CheckCircle2 } from 'lucide-react';

export interface CameraHandle {
  getVideo: () => HTMLVideoElement | null;
  start: () => Promise<void>;
  stop: () => void;
  isActive: boolean;
}

interface CameraProps {
  exercise?: 'squat' | 'bicepCurl';
  onVideoElement?: (video: HTMLVideoElement | null) => void;
  onActiveChange?: (isActive: boolean) => void;
  children?: ReactNode;
  className?: string;
}

export const Camera = forwardRef<CameraHandle, CameraProps>(
  ({ exercise = 'squat', onVideoElement, onActiveChange, children, className = '' }, ref) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [isActive, setIsActive] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);

    const stopCamera = () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsActive(false);
      setIsLoading(false);
      onActiveChange?.(false);
      onVideoElement?.(null);
    };

    const startCamera = async () => {
      setError(null);
      setIsLoading(true);

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Webcam access is not supported by your browser.');
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
          onVideoElement?.(videoRef.current);
        }

        setStream(mediaStream);
        setIsActive(true);
        onActiveChange?.(true);
      } catch (err: unknown) {
        console.error('Failed to access webcam:', err);
        const message =
          err instanceof Error
            ? err.message
            : 'Could not access camera. Please allow camera permissions.';
        setError(message);
        stopCamera();
      } finally {
        setIsLoading(false);
      }
    };

    const toggleCamera = () => {
      if (isActive) {
        stopCamera();
      } else {
        startCamera();
      }
    };

    useImperativeHandle(ref, () => ({
      getVideo: () => videoRef.current,
      start: startCamera,
      stop: stopCamera,
      isActive,
    }));

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
      };
    }, [stream]);

    return (
      <div className={`relative flex flex-col items-center w-full ${className}`}>
        {/* Video feed container (aspect-video) */}
        <div className="relative w-full aspect-video bg-[var(--bg-app)] rounded-[var(--radius-2xl)] overflow-hidden border border-[var(--border-subtle)] shadow-2xl flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-contain ${
              isActive ? 'block' : 'hidden'
            }`}
          />

          {/* Active Overlay (MediaPipe Canvas + HUD) */}
          {isActive && children}

          {/* Camera Permission Denied / Error State */}
          {error && !isActive && (
            <div
              data-testid="coach-camera-denied"
              className="absolute inset-0 z-20 bg-[var(--bg-surface)]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 sm:p-8 text-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] flex items-center justify-center text-[var(--status-danger)]">
                <CameraIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[var(--text-primary)]">Camera Access Denied</h3>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mt-1">{error}</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                  Click the lock or camera icon in your browser address bar to allow permissions.
                </p>
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={startCamera}
                isLoading={isLoading}
                className="mt-2"
              >
                Try Camera Again
              </Button>
            </div>
          )}

          {/* Idle Onboarding State (Before Camera Starts) */}
          {!isActive && !error && (
            <div
              data-testid="coach-onboarding"
              className="w-full h-full flex flex-col items-center justify-center p-6 md:p-8 text-center bg-gradient-to-b from-[var(--bg-surface)]/80 to-[var(--bg-app)]"
            >
              {/* Athlete Silhouette Vector */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 mb-2 sm:mb-3 text-[var(--accent)] flex items-center justify-center">
                <svg
                  viewBox="0 0 100 100"
                  fill="none"
                  stroke="currentColor"
                  className="w-full h-full opacity-90 drop-shadow-md"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="50" cy="18" r="9" strokeWidth="3" />
                  <path d="M50 27 L48 55" strokeWidth="3.5" strokeLinecap="round" />
                  <path d="M50 33 L62 44 L56 58" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M48 55 L38 72 L42 92" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="20" y1="94" x2="80" y2="94" strokeWidth="2" strokeDasharray="4 4" className="text-[var(--text-muted)]" />
                </svg>
              </div>

              <h2 className="text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)]">
                Ready for {exercise === 'squat' ? 'Squat' : 'Bicep Curl'} Coaching
              </h2>

              {/* 4-Point Setup Checklist */}
              <div className="grid grid-cols-2 gap-2 max-w-sm my-3 text-left text-[11px] text-[var(--text-secondary)]">
                <div className="flex items-center gap-1.5 bg-[var(--bg-surface-elevated)]/60 px-2 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>Full body visible</span>
                </div>
                <div className="flex items-center gap-1.5 bg-[var(--bg-surface-elevated)]/60 px-2 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>Side-on camera view</span>
                </div>
                <div className="flex items-center gap-1.5 bg-[var(--bg-surface-elevated)]/60 px-2 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>
                    {exercise === 'squat' ? 'Camera at hip height' : 'Camera at chest height'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-[var(--bg-surface-elevated)]/60 px-2 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>Good light & contrast</span>
                </div>
              </div>

              <Button
                size="lg"
                variant="primary"
                onClick={startCamera}
                isLoading={isLoading}
                leftIcon={<CameraIcon className="w-5 h-5" />}
                className="mt-1"
              >
                Start Camera
              </Button>
            </div>
          )}
        </div>

        {/* Camera Control Bar when active */}
        {isActive && (
          <div className="mt-3 flex items-center gap-3">
            <Button
              variant="danger"
              size="sm"
              onClick={toggleCamera}
              disabled={isLoading}
            >
              Stop Camera
            </Button>
          </div>
        )}
      </div>
    );
  }
);

Camera.displayName = 'Camera';
