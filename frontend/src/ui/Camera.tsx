import { useEffect, useRef, useState, forwardRef, useImperativeHandle, type ReactNode } from 'react';

export interface CameraHandle {
  getVideo: () => HTMLVideoElement | null;
  start: () => Promise<void>;
  stop: () => void;
  isActive: boolean;
}

interface CameraProps {
  onVideoElement?: (video: HTMLVideoElement | null) => void;
  onActiveChange?: (isActive: boolean) => void;
  children?: ReactNode;
  className?: string;
}

export const Camera = forwardRef<CameraHandle, CameraProps>(
  ({ onVideoElement, onActiveChange, children, className = '' }, ref) => {
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
        {/* Video feed container */}
        <div className="relative w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-contain ${
              isActive ? 'block' : 'hidden'
            }`}
          />

          {isActive && children}

          {!isActive && (
            <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <div className="w-16 h-16 mb-4 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400">
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <p className="text-base font-medium text-slate-300">Webcam is off</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Click Start Camera below to begin live posture tracking
              </p>
            </div>
          )}

          {error && (
            <div className="absolute top-4 left-4 right-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-lg p-3 backdrop-blur-md">
              <p className="font-semibold">Camera Error:</p>
              <p className="mt-0.5">{error}</p>
            </div>
          )}
        </div>

        {/* Camera Control Bar */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={toggleCamera}
            disabled={isLoading}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
              isActive
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30 ring-2 ring-rose-500/30'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/30 ring-2 ring-indigo-500/30'
            }`}
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                Connecting...
              </>
            ) : isActive ? (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop Camera
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Start Camera
              </>
            )}
          </button>
        </div>
      </div>
    );
  }
);

Camera.displayName = 'Camera';
