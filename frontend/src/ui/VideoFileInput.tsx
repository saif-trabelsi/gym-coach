import {
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
  type ChangeEvent,
  type DragEvent,
} from 'react';

export interface VideoFileInputHandle {
  getVideo: () => HTMLVideoElement | null;
  play: () => Promise<void>;
  pause: () => void;
  isPlaying: boolean;
}

interface VideoFileInputProps {
  onVideoElement?: (video: HTMLVideoElement | null) => void;
  children?: ReactNode;
  className?: string;
}

export const VideoFileInput = forwardRef<VideoFileInputHandle, VideoFileInputProps>(
  ({ onVideoElement, children, className = '' }, ref) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const [isLooping, setIsLooping] = useState<boolean>(true);
    const [isDragging, setIsDragging] = useState<boolean>(false);

    // Clean up created blob object URL
    useEffect(() => {
      return () => {
        if (videoSrc) {
          URL.revokeObjectURL(videoSrc);
        }
      };
    }, [videoSrc]);

    const handleFile = (file: File) => {
      if (!file.type.startsWith('video/')) {
        alert('Please upload a valid video file (.mp4, .webm, .mov, etc.)');
        return;
      }

      if (videoSrc) {
        URL.revokeObjectURL(videoSrc);
      }

      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setFileName(file.name);
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = () => {
      setIsDragging(false);
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    };

    const togglePlay = async () => {
      const video = videoRef.current;
      if (!video) return;

      if (video.paused) {
        await video.play();
        setIsPlaying(true);
      } else {
        video.pause();
        setIsPlaying(false);
      }
    };

    const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
      const video = videoRef.current;
      if (!video) return;
      const targetTime = parseFloat(e.target.value);
      video.currentTime = targetTime;
      setCurrentTime(targetTime);
    };

    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 10);
      return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
    };

    useImperativeHandle(ref, () => ({
      getVideo: () => videoRef.current,
      play: async () => {
        if (videoRef.current) {
          await videoRef.current.play();
          setIsPlaying(true);
        }
      },
      pause: () => {
        if (videoRef.current) {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      },
      isPlaying,
    }));

    return (
      <div className={`relative flex flex-col items-center w-full ${className}`}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileInputChange}
        />

        {/* Video preview / dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden border transition-all duration-200 shadow-2xl flex items-center justify-center ${
            isDragging
              ? 'border-indigo-400 bg-indigo-950/20'
              : 'border-slate-800'
          }`}
        >
          {videoSrc ? (
            <>
              <video
                ref={(el) => {
                  videoRef.current = el;
                  onVideoElement?.(el);
                }}
                src={videoSrc}
                playsInline
                loop={isLooping}
                muted
                onTimeUpdate={() => {
                  if (videoRef.current) {
                    setCurrentTime(videoRef.current.currentTime);
                  }
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    setDuration(videoRef.current.duration);
                    onVideoElement?.(videoRef.current);
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                className="w-full h-full object-contain"
              />
              {children}
            </>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center p-8 text-center text-slate-400 cursor-pointer hover:text-slate-300 transition-colors w-full h-full"
            >
              <div className="w-16 h-16 mb-4 rounded-full bg-slate-800/80 flex items-center justify-center text-indigo-400 border border-slate-700/50">
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
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <p className="text-base font-semibold text-slate-200">
                Upload exercise video
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Drag and drop your video file here, or click to browse
              </p>
              <span className="mt-3 text-[11px] px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                MP4, WebM, MOV supported
              </span>
            </div>
          )}
        </div>

        {/* Video Controls Bar */}
        {videoSrc && (
          <div className="mt-4 w-full bg-slate-900/90 border border-slate-800/80 backdrop-blur-md rounded-xl p-3 flex flex-col gap-2 shadow-xl">
            {/* Top row: filename + loop + change button */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="truncate max-w-[200px] font-medium text-slate-300">
                📁 {fileName}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsLooping(!isLooping)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors border ${
                    isLooping
                      ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/50'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                  title="Toggle loop"
                >
                  🔁 Loop: {isLooping ? 'On' : 'Off'}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="hover:text-slate-200 transition-colors underline text-[11px]"
                >
                  Change file
                </button>
              </div>
            </div>

            {/* Middle row: Seek slider */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400 w-12 text-right">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min="0"
                max={duration || 1}
                step="0.05"
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <span className="text-[11px] font-mono text-slate-500 w-12">
                {formatTime(duration)}
              </span>
            </div>

            {/* Bottom row: Play/Pause button */}
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                onClick={togglePlay}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md flex items-center gap-1.5"
              >
                {isPlaying ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                    Pause
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Play Video
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
);

VideoFileInput.displayName = 'VideoFileInput';
