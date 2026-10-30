import { useState, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Repeat1,
  Shuffle,
  SlidersHorizontal,
  Radio,
  Gauge,
  Download,
} from 'lucide-react';
import { AudioTrack } from '../types/audio';
import { audioEngine } from '../services/audioEngine';

interface BottomPlayerBarProps {
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  onOpenEq: () => void;
  loopMode: 'none' | 'all' | 'single';
  onToggleLoop: () => void;
  isShuffle: boolean;
  onToggleShuffle: () => void;
  onDownloadTrack?: (track: AudioTrack) => void;
}

export function BottomPlayerBar({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  onOpenEq,
  loopMode,
  onToggleLoop,
  isShuffle,
  onToggleShuffle,
  onDownloadTrack,
}: BottomPlayerBarProps) {
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(pos * duration);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    audioEngine.setVolume(val);
    if (isMuted && val > 0) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    const muted = audioEngine.toggleMute();
    setIsMuted(muted);
  };

  const handleSliderSpeedChange = (val: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, parseFloat(val.toFixed(2))));
    setSpeed(clamped);
    audioEngine.setSpeed(clamped);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="sticky bottom-0 z-40 w-full bg-[#0E131F]/95 backdrop-blur-xl border-t border-slate-800/80 px-4 sm:px-6 py-2.5">
      {/* Scrub Bar Slider */}
      <div
        ref={progressBarRef}
        onClick={handleProgressClick}
        className="group relative w-full h-2 mb-2 cursor-pointer flex items-center"
      >
        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full relative"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {/* Playhead handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `calc(${progressPercent}% - 5px)` }}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        {/* Left: Track Information */}
        <div className="flex items-center gap-3 min-w-0 max-w-[280px] sm:max-w-[340px]">
          <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/60 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
            {currentTrack?.sourceType === 'radio' ? (
              <Radio className="w-5 h-5 text-amber-400" />
            ) : (
              <span className="text-xs font-bold text-amber-400 font-mono">MP.R</span>
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-white truncate">
              {currentTrack ? currentTrack.title : 'Ready for Audio'}
            </h4>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
              <span>{currentTrack ? currentTrack.artist : 'Select a track or stream'}</span>
              {currentTrack?.genre && (
                <>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>{currentTrack.genre}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Center: Playback Controls */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={onToggleShuffle}
              title={isShuffle ? 'Shuffle On' : 'Shuffle Off'}
              className={`p-2 rounded-lg transition-colors ${
                isShuffle ? 'text-amber-400 bg-amber-400/10' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              onClick={onPrev}
              title="Previous Track"
              className="p-2 text-slate-300 hover:text-white transition-colors"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={onPlayPause}
              title={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-400/20 transition-transform active:scale-95"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>

            <button
              onClick={onNext}
              title="Next Track"
              className="p-2 text-slate-300 hover:text-white transition-colors"
            >
              <SkipForward className="w-5 h-5" />
            </button>

            <button
              onClick={onToggleLoop}
              title={`Loop: ${loopMode}`}
              className={`p-2 rounded-lg transition-colors ${
                loopMode !== 'none' ? 'text-amber-400 bg-amber-400/10' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {loopMode === 'single' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </button>
          </div>

          {/* Timecodes */}
          <div className="text-[11px] font-mono tabular-nums text-slate-400 tracking-wider">
            <span>{formatTime(currentTime)}</span>
            <span className="mx-1.5 text-slate-600">/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Master Output & Quick Knobs */}
        <div className="flex items-center gap-3">
          {/* Playback Speed Slider (0.5x - 2.0x) */}
          <div className="flex items-center gap-2 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Gauge className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <button
                type="button"
                onClick={() => handleSliderSpeedChange(1.0)}
                title="Reset tempo to 1.00x"
                className="text-[11px] font-mono tabular-nums font-semibold text-amber-400 hover:text-amber-300 w-11 text-left transition-colors cursor-pointer"
              >
                {speed.toFixed(2)}x
              </button>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={speed}
              aria-label="Playback speed slider"
              title={`Playback speed: ${speed.toFixed(2)}x (0.5x to 2.0x)`}
              onChange={(e) => handleSliderSpeedChange(parseFloat(e.target.value))}
              className="w-16 sm:w-20 md:w-24 h-1.5 bg-slate-700 accent-amber-400 rounded-lg cursor-pointer"
            />
          </div>

          {/* Equalizer Quick Link */}
          <button
            onClick={onOpenEq}
            title="Equalizer & DSP"
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-lg transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Download Current Track */}
          {currentTrack && onDownloadTrack && (
            <button
              onClick={() => onDownloadTrack(currentTrack)}
              title={`Download "${currentTrack.title}" to device Downloads`}
              className="p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Volume Control */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
              className="text-slate-400 hover:text-slate-200"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 sm:w-24 h-1.5 bg-slate-700 accent-amber-400 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
