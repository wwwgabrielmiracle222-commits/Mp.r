import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Upload,
  Plus,
  Search,
  Music,
  Trash2,
  FileAudio,
  Bookmark,
  Share2,
  FileText,
  Clock,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
  LocateFixed,
  Smartphone,
  ListPlus,
  FolderOpen,
  Download,
  HardDrive,
} from 'lucide-react';
import { AudioTrack, VisualizerMode } from '../types/audio';
import { Visualizer } from './Visualizer';
import { extractWaveformPeaks } from '../services/audioSynthesizer';
import { openAudioFileManager } from '../services/fileManager';

interface PlayerViewProps {
  tracks: AudioTrack[];
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  visualizerMode: VisualizerMode;
  onVisualizerModeChange: (mode: VisualizerMode) => void;
  onSelectTrack: (track: AudioTrack) => void;
  onTogglePlay: () => void;
  onDeleteTrack: (trackId: string) => void;
  onFileUpload: (files: FileList | File[] | File) => void;
  onOpenLibrary?: () => void;
  onOpenAddToPlaylist?: (track: AudioTrack) => void;
  onDownloadTrack?: (track: AudioTrack) => void;
  abLoop: { start: number; end: number; active: boolean };
  onSetAbLoop: (start: number, end: number, active: boolean) => void;
  onSeek: (seconds: number) => void;
}

export function PlayerView({
  tracks,
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  visualizerMode,
  onVisualizerModeChange,
  onSelectTrack,
  onTogglePlay,
  onDeleteTrack,
  onFileUpload,
  onOpenLibrary,
  onOpenAddToPlaylist,
  onDownloadTrack,
  abLoop,
  onSetAbLoop,
  onSeek,
}: PlayerViewProps) {
  const [filterType, setFilterType] = useState<'all' | 'preset' | 'recording' | 'upload'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [trackNotes, setTrackNotes] = useState<Record<string, string>>({});
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Waveform Zoom & Inspection State
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const waveformScrollRef = useRef<HTMLDivElement | null>(null);
  const innerTrackRef = useRef<HTMLDivElement | null>(null);

  const query = searchQuery.trim().toLowerCase();
  const filteredTracks = tracks.filter((t) => {
    const matchesFilter = filterType === 'all' || t.sourceType === filterType;
    if (!query) return matchesFilter;
    const matchesSearch =
      t.title.toLowerCase().includes(query) ||
      t.artist.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // High-density peaks computed dynamically based on zoom factor
  const detailedPeaks = useMemo(() => {
    if (currentTrack?.audioBuffer) {
      const pointCount = Math.min(360, Math.max(64, Math.round(64 * zoomLevel)));
      return extractWaveformPeaks(currentTrack.audioBuffer, pointCount);
    }
    if (!currentTrack?.waveformPeaks || currentTrack.waveformPeaks.length === 0) return [];
    if (zoomLevel === 1) return currentTrack.waveformPeaks;

    const original = currentTrack.waveformPeaks;
    const targetCount = Math.min(320, original.length * zoomLevel);
    const result: number[] = [];
    for (let i = 0; i < targetCount; i++) {
      const origIndex = (i / targetCount) * (original.length - 1);
      const low = Math.floor(origIndex);
      const high = Math.min(original.length - 1, low + 1);
      const frac = origIndex - low;
      const baseVal = original[low] * (1 - frac) + original[high] * frac;
      const micro = Math.sin(i * 1.7) * 0.035;
      result.push(Math.max(0.08, Math.min(1, baseVal + micro)));
    }
    return result;
  }, [currentTrack, zoomLevel]);

  // Timeline tick markers for audio ruler
  const timeTicks = useMemo(() => {
    if (duration <= 0) return [];
    let interval = 5;
    if (zoomLevel >= 8) interval = 1;
    else if (zoomLevel >= 4) interval = 2;
    else if (zoomLevel >= 2) interval = 2.5;

    const ticks: { time: number; label: string; percent: number }[] = [];
    for (let t = 0; t <= duration; t += interval) {
      ticks.push({
        time: t,
        label: formatTime(t),
        percent: (t / duration) * 100,
      });
    }
    return ticks;
  }, [duration, zoomLevel]);

  // Auto-scroll smoothly to keep playhead in view when zoomed
  useEffect(() => {
    if (autoScroll && isPlaying && waveformScrollRef.current && duration > 0 && zoomLevel > 1) {
      const container = waveformScrollRef.current;
      const playheadX = (currentTime / duration) * container.scrollWidth;
      const targetLeft = playheadX - container.clientWidth / 2;
      container.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: 'smooth',
      });
    }
  }, [currentTime, isPlaying, autoScroll, duration, zoomLevel]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileUpload(e.dataTransfer.files);
    }
  };

  const handleSetLoopA = () => {
    onSetAbLoop(currentTime, abLoop.end > currentTime ? abLoop.end : duration, true);
  };

  const handleSetLoopB = () => {
    onSetAbLoop(abLoop.start < currentTime ? abLoop.start : 0, currentTime, true);
  };

  const handleClearLoop = () => {
    onSetAbLoop(0, 0, false);
  };

  return (
    <div className="space-y-6">
      {/* 2-Column Main Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Visualizer & Active Track Details (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Main Studio Visualizer */}
          <Visualizer
            mode={visualizerMode}
            onModeChange={onVisualizerModeChange}
            className="h-[280px]"
          />

          {/* Active Track Control Deck */}
          <div className="p-5 rounded-xl bg-[#0D121D] border border-slate-800">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                  <span>Current Deck</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-400 font-medium">
                    {currentTrack?.sourceType === 'preset' ? 'Studio Master' : currentTrack?.sourceType === 'recording' ? 'Mic Recording' : 'Imported Media'}
                  </span>
                  {currentTrack?.bpm && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{currentTrack.bpm} BPM</span>
                    </>
                  )}
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {currentTrack ? currentTrack.title : 'No Track Loaded'}
                </h2>
                <p className="text-sm text-slate-400">
                  {currentTrack ? currentTrack.artist : 'Select a track from the library below'}
                </p>
              </div>

              {/* Deck Action Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const files = await openAudioFileManager({ multiple: true });
                    if (files.length > 0) onFileUpload(files);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                  title="Add song from file manager"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Add from File Manager</span>
                </button>
                {onOpenAddToPlaylist && currentTrack && (
                  <button
                    onClick={() => onOpenAddToPlaylist(currentTrack)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                    title="Add current track to playlist"
                  >
                    <ListPlus className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Add to Playlist</span>
                  </button>
                )}
                {onDownloadTrack && currentTrack && (
                  <button
                    onClick={() => onDownloadTrack(currentTrack)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                    title={`Download "${currentTrack.title}" as audio file to Downloads folder`}
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="hidden sm:inline">Download</span>
                  </button>
                )}
                <button
                  onClick={onTogglePlay}
                  disabled={!currentTrack}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>
              </div>
            </div>

            {/* Waveform Inspector with Precision Zoom */}
            {detailedPeaks.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="font-sans font-semibold text-slate-200">Waveform Inspector</span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-amber-400 font-bold">{zoomLevel}x Zoom</span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                    {hoverTime !== null && (
                      <>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="text-cyan-400">Cursor: {formatTime(hoverTime)}</span>
                      </>
                    )}
                  </div>

                  {/* Zoom Controls */}
                  <div className="flex items-center gap-1.5">
                    {/* Follow Playhead Toggle */}
                    {zoomLevel > 1 && (
                      <button
                        type="button"
                        onClick={() => setAutoScroll(!autoScroll)}
                        title={autoScroll ? 'Auto-scroll Playhead Enabled' : 'Auto-scroll Playhead Disabled'}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium transition-colors ${
                          autoScroll
                            ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                        }`}
                      >
                        <LocateFixed className="w-3 h-3" />
                        <span>Follow</span>
                      </button>
                    )}

                    <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const levels = [1, 2, 4, 8];
                          const currIdx = levels.indexOf(zoomLevel);
                          if (currIdx > 0) setZoomLevel(levels[currIdx - 1]);
                        }}
                        disabled={zoomLevel === 1}
                        title="Zoom Out"
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center px-1 gap-1">
                        {[1, 2, 4, 8].map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setZoomLevel(lvl)}
                            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors font-mono ${
                              zoomLevel === lvl
                                ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {lvl}x
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const levels = [1, 2, 4, 8];
                          const currIdx = levels.indexOf(zoomLevel);
                          if (currIdx < levels.length - 1) setZoomLevel(levels[currIdx + 1]);
                        }}
                        disabled={zoomLevel === 8}
                        title="Zoom In"
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Scrollable Waveform Viewport */}
                <div
                  ref={waveformScrollRef}
                  className="relative w-full overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/80 p-2 select-none"
                  style={{ scrollbarWidth: 'thin' }}
                >
                  {/* Inner Track scaling with zoom */}
                  <div
                    ref={innerTrackRef}
                    onClick={(e) => {
                      if (!innerTrackRef.current || duration <= 0) return;
                      const rect = innerTrackRef.current.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                      onSeek(ratio * duration);
                    }}
                    onMouseMove={(e) => {
                      if (!innerTrackRef.current || duration <= 0) return;
                      const rect = innerTrackRef.current.getBoundingClientRect();
                      const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                      const ratio = mouseX / rect.width;
                      setHoverTime(ratio * duration);
                    }}
                    onMouseLeave={() => setHoverTime(null)}
                    className="relative h-16 cursor-pointer flex flex-col justify-between"
                    style={{ width: `${zoomLevel * 100}%`, minWidth: '100%' }}
                  >
                    {/* A-B Loop highlight region */}
                    {abLoop.active && duration > 0 && (
                      <div
                        className="absolute inset-y-0 bg-amber-400/15 border-x border-amber-400/50 pointer-events-none z-10"
                        style={{
                          left: `${(abLoop.start / duration) * 100}%`,
                          width: `${((abLoop.end - abLoop.start) / duration) * 100}%`,
                        }}
                      >
                        <span className="absolute top-0.5 left-1 text-[9px] font-mono font-bold text-amber-300 bg-slate-950/80 px-1 rounded">
                          LOOP
                        </span>
                      </div>
                    )}

                    {/* Waveform Peaks */}
                    <div className="h-12 w-full flex items-center gap-[2px]">
                      {detailedPeaks.map((peak, idx) => {
                        const progressRatio = duration > 0 ? currentTime / duration : 0;
                        const barRatio = idx / detailedPeaks.length;
                        const isPlayed = barRatio <= progressRatio;
                        return (
                          <div
                            key={idx}
                            className={`flex-1 rounded-full transition-colors ${
                              isPlayed
                                ? 'bg-gradient-to-t from-amber-500 to-amber-300'
                                : 'bg-slate-700/80 hover:bg-slate-600'
                            }`}
                            style={{ height: `${Math.max(10, peak * 100)}%` }}
                          />
                        );
                      })}
                    </div>

                    {/* Timeline Ruler at bottom */}
                    <div className="relative h-3 w-full border-t border-slate-800/80 mt-1 pointer-events-none">
                      {timeTicks.map((tick, i) => (
                        <div
                          key={i}
                          className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center"
                          style={{ left: `${tick.percent}%` }}
                        >
                          <div className="h-1 w-px bg-slate-700" />
                          <span className="text-[8px] font-mono text-slate-500 leading-none mt-0.5 whitespace-nowrap">
                            {tick.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Playhead Vertical Line */}
                    {duration > 0 && (
                      <div
                        className="absolute inset-y-0 w-0.5 bg-amber-400 shadow-md shadow-amber-400/50 pointer-events-none z-20"
                        style={{ left: `${(currentTime / duration) * 100}%` }}
                      >
                        <div className="w-2.5 h-2.5 bg-amber-400 -translate-x-[4px] -top-1 rounded-full border border-slate-950 shadow-sm" />
                      </div>
                    )}

                    {/* Hover cursor line and timestamp */}
                    {hoverTime !== null && duration > 0 && (
                      <div
                        className="absolute inset-y-0 w-px bg-cyan-400/80 pointer-events-none z-20"
                        style={{ left: `${(hoverTime / duration) * 100}%` }}
                      >
                        <span className="absolute -top-4 -translate-x-1/2 text-[9px] font-mono px-1 py-0.5 bg-cyan-950 border border-cyan-800 text-cyan-200 rounded whitespace-nowrap">
                          {formatTime(hoverTime)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Minimap Viewport navigation helper when zoomed */}
                {zoomLevel > 1 && (
                  <div className="flex items-center justify-between text-[10px] text-slate-500 px-1 font-mono">
                    <span>Scroll horizontally or drag to inspect waveform sections</span>
                    <button
                      type="button"
                      onClick={() => setZoomLevel(1)}
                      className="text-amber-400 hover:text-amber-300 hover:underline"
                    >
                      Reset Zoom (1x)
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* A-B Looper Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-medium text-slate-300">A-B Looper:</span>
                <span className="font-mono tabular-nums text-slate-400">
                  {abLoop.active
                    ? `${formatTime(abLoop.start)} → ${formatTime(abLoop.end)}`
                    : 'Off'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleSetLoopA}
                  className="px-2.5 py-1 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                >
                  Set [A]
                </button>
                <button
                  onClick={handleSetLoopB}
                  className="px-2.5 py-1 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                >
                  Set [B]
                </button>
                {abLoop.active && (
                  <button
                    onClick={handleClearLoop}
                    className="px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded border border-rose-900/50 transition-colors"
                  >
                    Clear Loop
                  </button>
                )}
              </div>
            </div>

            {/* Track Notes / Lyrics Drawer */}
            <div className="mt-4 pt-3 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <div className="flex items-center gap-1.5 font-medium text-slate-300">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Production Notes & Lyrics</span>
                </div>
                <button
                  onClick={() => setIsEditingNotes(!isEditingNotes)}
                  className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  {isEditingNotes ? 'Done' : 'Edit Notes'}
                </button>
              </div>

              {isEditingNotes ? (
                <textarea
                  value={trackNotes[currentTrack?.id || ''] || currentTrack?.notes || ''}
                  onChange={(e) => {
                    if (currentTrack) {
                      setTrackNotes({ ...trackNotes, [currentTrack.id]: e.target.value });
                    }
                  }}
                  placeholder="Add track arrangement notes, chord progressions, lyrics, or mixing instructions..."
                  rows={3}
                  className="w-full text-xs bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-400 resize-none font-mono"
                />
              ) : (
                <p className="text-xs text-slate-400 italic bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/50">
                  {trackNotes[currentTrack?.id || ''] || currentTrack?.notes || 'No notes for this track. Click "Edit Notes" to add chords or lyrics.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Library & Playlist (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-xl bg-[#0D121D] border border-slate-800 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Media Library</h3>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="font-mono tabular-nums">{filteredTracks.length}</span>
                  <span>available tracks</span>
                </div>
              </div>

              {/* Phone Music & Full Library Trigger */}
              <div className="flex items-center gap-2">
                {onOpenLibrary && (
                  <button
                    type="button"
                    onClick={onOpenLibrary}
                    className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    View All →
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    const files = await openAudioFileManager({ multiple: true });
                    if (files.length > 0) onFileUpload(files);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm shadow-amber-400/20 cursor-pointer active:scale-95 transition-all"
                  title="Open system file manager to add songs"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Add from File Manager</span>
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 mb-3 overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'upload', label: 'Local & Phone' },
                  { id: 'preset', label: 'Studio Presets' },
                  { id: 'recording', label: 'Recordings' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                    filterType === tab.id
                      ? 'bg-amber-400/20 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                aria-label="Search tracks by title or artist"
                placeholder="Search tracks by title or artist..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchQuery('');
                }}
                className="w-full pl-9 pr-8 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Active search filter feedback */}
            {searchQuery.trim() && (
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 px-0.5">
                <span>
                  Found <span className="text-amber-400 font-mono tabular-nums font-semibold">{filteredTracks.length}</span> matching "{searchQuery.trim()}"
                </span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-amber-400 hover:text-amber-300 text-[11px] hover:underline"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Clickable Drag & Drop / File Manager Trigger */}
            <div
              onClick={async () => {
                const files = await openAudioFileManager({ multiple: true });
                if (files.length > 0) onFileUpload(files);
              }}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              className={`p-3 rounded-lg border border-dashed mb-3 text-center transition-all cursor-pointer group select-none ${
                dragActive
                  ? 'border-amber-400 bg-amber-400/10 text-amber-300 scale-[1.01]'
                  : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-amber-400/60 hover:bg-slate-900/80'
              }`}
            >
              <div className="flex items-center justify-center gap-2 text-xs">
                <FolderOpen className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                <span>
                  <strong className="text-slate-200 group-hover:text-amber-300 font-semibold">Open File Manager</strong> or drop audio files here
                </span>
              </div>
            </div>

            {/* Track List */}
            <div className="flex-1 overflow-y-auto space-y-2 max-h-[360px] pr-1">
              {filteredTracks.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 space-y-2.5">
                  <p>
                    {searchQuery.trim()
                      ? `No tracks found matching "${searchQuery.trim()}".`
                      : 'No audio tracks match the selected filter.'}
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {searchQuery.trim() && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
                      >
                        Reset search filter
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        const files = await openAudioFileManager({ multiple: true });
                        if (files.length > 0) onFileUpload(files);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 rounded-lg transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Add Song from File Manager</span>
                    </button>
                  </div>
                </div>
              ) : (
                filteredTracks.map((track) => {
                  const isCurrent = currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      onClick={() => onSelectTrack(track)}
                      className={`group flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-amber-400/10 border-amber-400/50 shadow-sm'
                          : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/70 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Play Indicator / Icon */}
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isCurrent
                              ? 'bg-amber-400 text-slate-950 font-bold'
                              : 'bg-slate-800 text-slate-400 group-hover:text-white'
                          }`}
                        >
                          {isCurrent && isPlaying ? (
                            <Pause className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <h4
                            className={`text-xs font-semibold truncate ${
                              isCurrent ? 'text-amber-300' : 'text-slate-200'
                            }`}
                          >
                            {track.title}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                            <span>{track.artist}</span>
                            <span aria-hidden="true" className="text-slate-600">·</span>
                            <span>{track.genre}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Meta & Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 mr-1">
                          {formatTime(track.duration)}
                        </span>
                        {onOpenAddToPlaylist && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenAddToPlaylist(track);
                            }}
                            title="Add to Playlist"
                            className="p-1 text-slate-500 hover:text-amber-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                          >
                            <ListPlus className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDownloadTrack && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDownloadTrack(track);
                            }}
                            title={`Download "${track.title}" to device Downloads`}
                            className="p-1 text-slate-500 hover:text-cyan-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {track.sourceType !== 'preset' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTrack(track.id);
                            }}
                            title="Remove track"
                            className="p-1 text-slate-600 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
