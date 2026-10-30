import { useState, useRef, useEffect } from 'react';
import {
  Smartphone,
  Upload,
  Play,
  Pause,
  Search,
  Music,
  Trash2,
  FileAudio,
  FolderOpen,
  CheckCircle2,
  HardDrive,
  Clock,
  Sparkles,
  ArrowUpDown,
  X,
  Plus,
  ListPlus,
  ListMusic,
  Shuffle,
  FolderPlus,
  ArrowLeft,
  FolderTree,
  Download,
  ShieldCheck,
  Database,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { AudioTrack, Playlist } from '../types/audio';
import { openAudioFileManager } from '../services/fileManager';
import { getTrackEstimatedSizeMb } from '../services/downloadService';

interface LibraryViewProps {
  tracks: AudioTrack[];
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  onSelectTrack: (track: AudioTrack) => void;
  onTogglePlay: () => void;
  onDeleteTrack: (trackId: string) => void;
  onFilesUpload: (files: FileList | File[]) => void;
  playlists: Playlist[];
  onCreatePlaylist: (name: string, description?: string) => string;
  onDeletePlaylist: (playlistId: string) => void;
  onPlayPlaylist: (playlist: Playlist, shuffle?: boolean) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  onOpenAddToPlaylist: (track: AudioTrack) => void;
  onDownloadTrack?: (track: AudioTrack) => void;
  onDownloadAllLocalTracks?: () => void;
  onClearLocalTracks?: () => void;
  onOpenGitHub?: () => void;
  initialFilter?: 'all' | 'upload' | 'playlists' | 'preset' | 'recording';
  isImporting?: boolean;
  importProgress?: { current: number; total: number } | null;
}

export function LibraryView({
  tracks,
  currentTrack,
  isPlaying,
  onSelectTrack,
  onTogglePlay,
  onDeleteTrack,
  onFilesUpload,
  playlists,
  onCreatePlaylist,
  onDeletePlaylist,
  onPlayPlaylist,
  onRemoveTrackFromPlaylist,
  onOpenAddToPlaylist,
  onDownloadTrack,
  onDownloadAllLocalTracks,
  onClearLocalTracks,
  onOpenGitHub,
  initialFilter = 'all',
  isImporting = false,
  importProgress = null,
}: LibraryViewProps) {
  const [filterType, setFilterType] = useState<'all' | 'upload' | 'playlists' | 'preset' | 'recording'>(initialFilter);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  // Sync if initialFilter changes externally (e.g. from top nav)
  useEffect(() => {
    if (initialFilter) {
      setFilterType(initialFilter);
    }
  }, [initialFilter]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'title' | 'artist' | 'duration'>('title');
  const [dragActive, setDragActive] = useState(false);

  // New playlist modal state
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatDurationLong = (secs: number) => {
    if (isNaN(secs) || secs <= 0) return '0 min';
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    if (mins === 0) return `${s}s`;
    return `${mins}m ${s > 0 ? `${s}s` : ''}`;
  };

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
      onFilesUpload(e.dataTransfer.files);
    }
  };

  const handleCreatePlaylistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    const newId = onCreatePlaylist(newPlaylistName.trim(), newPlaylistDesc.trim());
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    setIsCreatingPlaylist(false);
    setSelectedPlaylistId(newId);
  };

  const query = searchQuery.trim().toLowerCase();
  const phoneTracksCount = tracks.filter((t) => t.sourceType === 'upload').length;
  const localTracks = tracks.filter((t) => t.sourceType === 'upload');
  const totalLocalSizeBytes = localTracks.reduce((sum, t) => {
    if (t.blob && t.blob.size) return sum + t.blob.size;
    if (t.audioBuffer) return sum + t.audioBuffer.length * t.audioBuffer.numberOfChannels * 2;
    return sum + (t.duration > 0 ? t.duration * 24000 : 0);
  }, 0);
  const totalLocalSizeMb = (totalLocalSizeBytes / (1024 * 1024)).toFixed(1);

  const filteredTracks = tracks
    .filter((t) => {
      const matchesFilter = filterType === 'all' || t.sourceType === filterType;
      if (!query) return matchesFilter;
      const matchesSearch =
        t.title.toLowerCase().includes(query) ||
        t.artist.toLowerCase().includes(query) ||
        t.genre.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'artist') return a.artist.localeCompare(b.artist);
      if (sortBy === 'duration') return b.duration - a.duration;
      return 0;
    });

  // Active playlist details
  const activePlaylist = playlists.find((p) => p.id === selectedPlaylistId) || null;
  const activePlaylistTracks = activePlaylist
    ? activePlaylist.trackIds
        .map((id) => tracks.find((t) => t.id === id))
        .filter((t): t is AudioTrack => Boolean(t))
    : [];

  const activePlaylistDuration = activePlaylistTracks.reduce((acc, t) => acc + (t.duration || 0), 0);

  return (
    <div className="space-y-6">
      {/* Hidden file pickers with broad audio support */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.m4a,.wav,.aac,.flac,.ogg,.opus,.wma"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFilesUpload(e.target.files);
            e.target.value = '';
          }
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is standard in WebKit/Blink
        webkitdirectory="true"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFilesUpload(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Hero: Phone & Device Music Access Banner */}
      <div className="p-6 sm:p-7 rounded-2xl bg-gradient-to-br from-[#101828] via-[#0E1422] to-[#0A0E18] border border-amber-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="max-w-2xl space-y-2">
            <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold tracking-wide uppercase">
              <Smartphone className="w-4 h-4" />
              <span>Phone Music & Custom Collections</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Music Library & Playlists
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Pick songs directly from your phone's storage, organize them into custom playlists, and play them offline. All audio files and playlists are saved safely in your device's browser memory.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Multi-file phone import</span>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="flex items-center gap-1.5">
                <ListMusic className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono tabular-nums text-slate-200">{playlists.length}</span>
                <span>custom playlists</span>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                <span>Saved locally on phone</span>
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto shrink-0">
            <button
              onClick={async () => {
                const files = await openAudioFileManager({ multiple: true });
                if (files.length > 0) onFilesUpload(files);
              }}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs sm:text-sm text-slate-950 bg-amber-400 hover:bg-amber-300 shadow-lg shadow-amber-400/20 active:scale-98 transition-all cursor-pointer"
              title="Open system file manager to select music files"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Add from File Manager</span>
            </button>

            <button
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl font-medium text-xs text-slate-200 bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 active:scale-98 transition-all cursor-pointer"
              title="Import an entire folder of music from your device"
            >
              <FolderTree className="w-4 h-4 text-cyan-400" />
              <span>Import Folder</span>
            </button>

            <button
              onClick={() => {
                setFilterType('playlists');
                setIsCreatingPlaylist(true);
              }}
              className="flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl font-medium text-xs text-slate-200 bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 active:scale-98 transition-all cursor-pointer"
            >
              <FolderPlus className="w-4 h-4 text-amber-400" />
              <span>New Playlist</span>
            </button>

            {onOpenGitHub && (
              <button
                onClick={onOpenGitHub}
                className="flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl font-medium text-xs text-slate-200 bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 active:scale-98 transition-all cursor-pointer"
                title="Connect GitHub to import audio files from your repositories"
              >
                <svg className="w-4 h-4 fill-current text-slate-300" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>GitHub Audio</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Batch Import Progress Bar */}
        {isImporting && importProgress && (
          <div className="mt-5 pt-4 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-amber-300 font-medium animate-pulse">
                Importing songs from your phone...
              </span>
              <span className="font-mono tabular-nums text-slate-300">
                {importProgress.current} / {importProgress.total} files
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-200"
                style={{
                  width: `${(importProgress.current / Math.max(1, importProgress.total)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Library Toolbar & Controls */}
      <div className="p-5 rounded-xl bg-[#0D121D] border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Main Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 overflow-x-auto shrink-0">
            {(
              [
                { id: 'all', label: 'All Music', count: tracks.length },
                { id: 'upload', label: 'Downloads & Local', count: phoneTracksCount },
                { id: 'playlists', label: 'Custom Playlists', count: playlists.length },
                { id: 'preset', label: 'Studio Presets', count: tracks.filter((t) => t.sourceType === 'preset').length },
                { id: 'recording', label: 'Recordings', count: tracks.filter((t) => t.sourceType === 'recording').length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setFilterType(tab.id);
                  if (tab.id !== 'playlists') setSelectedPlaylistId(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  filterType === tab.id
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] font-mono tabular-nums opacity-80">({tab.count})</span>
              </button>
            ))}
          </div>

          {filterType !== 'playlists' && (
            <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <span>Sort by:</span>
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                {(
                  [
                    { id: 'title', label: 'Title' },
                    { id: 'artist', label: 'Artist' },
                    { id: 'duration', label: 'Length' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSortBy(opt.id)}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      sortBy === opt.id
                        ? 'bg-slate-800 text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* PLAYLISTS VIEW: Active Playlist detail OR Playlists overview  */}
        {/* ============================================================== */}
        {filterType === 'playlists' ? (
          <div className="space-y-4 pt-1">
            {activePlaylist ? (
              /* Single Playlist Detail View */
              <div className="space-y-4">
                {/* Playlist Breadcrumb / Back button */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedPlaylistId(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 rounded-lg border border-slate-700 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>All Playlists</span>
                    </button>
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span>{activePlaylist.name}</span>
                        <span className="text-xs font-normal text-amber-400 font-mono tabular-nums">
                          ({activePlaylistTracks.length} tracks · {formatDurationLong(activePlaylistDuration)})
                        </span>
                      </h3>
                      {activePlaylist.description && (
                        <p className="text-xs text-slate-400">{activePlaylist.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Playlist Action Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      disabled={activePlaylistTracks.length === 0}
                      onClick={() => onPlayPlaylist(activePlaylist, false)}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      <span>Play Collection</span>
                    </button>

                    <button
                      disabled={activePlaylistTracks.length === 0}
                      onClick={() => onPlayPlaylist(activePlaylist, true)}
                      title="Shuffle Playlist"
                      className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(`Delete playlist "${activePlaylist.name}"?`)) {
                          onDeletePlaylist(activePlaylist.id);
                          setSelectedPlaylistId(null);
                        }
                      }}
                      title="Delete playlist"
                      className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-lg border border-rose-900/40 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Playlist Tracks List */}
                <div className="space-y-2">
                  {activePlaylistTracks.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500 space-y-3">
                      <ListMusic className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-sm text-slate-400">
                        This playlist is empty. Add songs from "All Music" or "Phone Tracks"!
                      </p>
                      <button
                        onClick={() => setFilterType('all')}
                        className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer"
                      >
                        Browse Songs to Add
                      </button>
                    </div>
                  ) : (
                    activePlaylistTracks.map((track, idx) => {
                      const isCurrent = currentTrack?.id === track.id;
                      const isTrackPlaying = isCurrent && isPlaying;

                      return (
                        <div
                          key={`${activePlaylist.id}_${track.id}_${idx}`}
                          onClick={() => onSelectTrack(track)}
                          className={`group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                            isCurrent
                              ? 'bg-amber-400/10 border-amber-400/50 shadow-sm'
                              : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/70 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-mono tabular-nums text-slate-500 w-5 text-right shrink-0">
                              {idx + 1}
                            </span>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isCurrent) onTogglePlay();
                                else onSelectTrack(track);
                              }}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                isTrackPlaying
                                  ? 'bg-amber-400 text-slate-950 font-bold'
                                  : 'bg-slate-800 text-slate-300 group-hover:text-white'
                              }`}
                            >
                              {isTrackPlaying ? (
                                <Pause className="w-3.5 h-3.5 fill-current" />
                              ) : (
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                              )}
                            </button>

                            <div className="min-w-0">
                              <h4 className={`text-xs font-semibold truncate ${isCurrent ? 'text-amber-300' : 'text-slate-100'}`}>
                                {track.title}
                              </h4>
                              <p className="text-[11px] text-slate-400 truncate">{track.artist}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs font-mono tabular-nums text-slate-500">
                              {formatTime(track.duration)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveTrackFromPlaylist(activePlaylist.id, track.id);
                              }}
                              title="Remove from this playlist"
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* All Playlists Grid & Creator */
              <div className="space-y-4">
                {/* Create Playlist Action & Form */}
                {isCreatingPlaylist ? (
                  <form
                    onSubmit={handleCreatePlaylistSubmit}
                    className="p-4 rounded-xl bg-slate-900/90 border border-amber-400/30 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white flex items-center gap-2">
                        <FolderPlus className="w-4 h-4 text-amber-400" />
                        <span>Create New Custom Playlist</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => setIsCreatingPlaylist(false)}
                        className="text-slate-400 hover:text-white text-xs"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        autoFocus
                        required
                        placeholder="Playlist Title (e.g. Chill Lo-Fi, Cardio Mix)"
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                      />
                      <input
                        type="text"
                        placeholder="Description / Mood (optional)"
                        value={newPlaylistDesc}
                        onChange={(e) => setNewPlaylistDesc(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsCreatingPlaylist(false)}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors"
                      >
                        Save Playlist
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Your Playlist Collections</h3>
                      <p className="text-xs text-slate-400">
                        Organize your phone songs and studio tracks into custom playlists saved on your device.
                      </p>
                    </div>
                    <button
                      onClick={() => setIsCreatingPlaylist(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Playlist</span>
                    </button>
                  </div>
                )}

                {/* Playlists Cards Grid */}
                {playlists.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500 space-y-3 bg-slate-900/30 rounded-xl border border-slate-800">
                    <ListMusic className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-sm text-slate-400">
                      No custom playlists created yet.
                    </p>
                    <button
                      onClick={() => setIsCreatingPlaylist(true)}
                      className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      Create Your First Playlist
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {playlists.map((playlist) => {
                      const pTracks = playlist.trackIds
                        .map((id) => tracks.find((t) => t.id === id))
                        .filter((t): t is AudioTrack => Boolean(t));
                      const totalSecs = pTracks.reduce((acc, t) => acc + (t.duration || 0), 0);

                      return (
                        <div
                          key={playlist.id}
                          onClick={() => setSelectedPlaylistId(playlist.id)}
                          className="group relative p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition-all flex flex-col justify-between cursor-pointer"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-700/30 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0">
                                <ListMusic className="w-5 h-5" />
                              </div>

                              <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100">
                                <button
                                  type="button"
                                  disabled={pTracks.length === 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onPlayPlaylist(playlist, false);
                                  }}
                                  title="Play Playlist"
                                  className="w-8 h-8 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center shadow-sm disabled:opacity-30 transition-transform active:scale-95"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={pTracks.length === 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onPlayPlaylist(playlist, true);
                                  }}
                                  title="Shuffle Play"
                                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 disabled:opacity-30 transition-colors"
                                >
                                  <Shuffle className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <h4 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                              {playlist.name}
                            </h4>
                            <p className="text-xs text-slate-400 line-clamp-2 mt-0.5 min-h-[1.25rem]">
                              {playlist.description || 'Custom audio collection'}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/80 text-[11px] text-slate-500 font-mono">
                            <span>
                              {playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'song' : 'songs'}
                            </span>
                            <span>{formatDurationLong(totalSecs)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ============================================================== */
          /* TRACKS LIST VIEW: All Music / Phone Tracks / Presets / Recs    */
          /* ============================================================== */
          <>
            {/* Downloads & Local Music Management Card */}
            {filterType === 'upload' && (
              <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-900/90 border border-cyan-800/40 shadow-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300 shrink-0">
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Downloads & Local Music Hub</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-normal">
                          <ShieldCheck className="w-3 h-3" />
                          <span>100% Offline Ready</span>
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        Phone audio and downloaded tracks saved locally in your browser's persistent database. Play anywhere offline.
                      </p>
                    </div>
                  </div>

                  {/* Storage Stats Pill */}
                  <div className="flex items-center gap-3 bg-slate-900/95 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono self-start sm:self-auto shrink-0 shadow-inner">
                    <div>
                      <span className="text-slate-400 text-[11px]">Local Tracks: </span>
                      <span className="text-cyan-300 font-bold">{localTracks.length}</span>
                    </div>
                    <span className="text-slate-700">|</span>
                    <div>
                      <span className="text-slate-400 text-[11px]">Storage: </span>
                      <span className="text-amber-300 font-bold">{totalLocalSizeMb} MB</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-800/80">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={async () => {
                        const files = await openAudioFileManager({ multiple: true });
                        if (files.length > 0) onFilesUpload(files);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Add from File Manager</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Import from Downloads</span>
                    </button>
                    {localTracks.length > 0 && onDownloadAllLocalTracks && (
                      <button
                        onClick={onDownloadAllLocalTracks}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-200 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-800/60 rounded-lg transition-colors cursor-pointer"
                        title="Download all local songs to your device Downloads folder"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download All ({localTracks.length})</span>
                      </button>
                    )}
                  </div>

                  {localTracks.length > 0 && onClearLocalTracks && (
                    <div className="flex items-center gap-2">
                      {isConfirmingClear ? (
                        <div className="flex items-center gap-1.5 bg-rose-950/80 border border-rose-800 px-2 py-1 rounded-lg text-xs">
                          <span className="text-rose-200 text-[11px]">Clear all phone tracks?</span>
                          <button
                            onClick={() => {
                              onClearLocalTracks();
                              setIsConfirmingClear(false);
                            }}
                            className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] cursor-pointer"
                          >
                            Yes, Clear
                          </button>
                          <button
                            onClick={() => setIsConfirmingClear(false)}
                            className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsConfirmingClear(true)}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 p-1.5 rounded hover:bg-rose-950/30 transition-colors cursor-pointer"
                          title="Clear local cached music files from browser"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="text-[11px]">Clear Cache</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Real-time Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                aria-label="Search music library"
                placeholder="Search by song title, artist, or genre..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchQuery('');
                }}
                className="w-full pl-10 pr-9 py-2.5 text-sm bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Clickable Drag & Drop / File Manager Launcher Area */}
            <div
              onClick={async () => {
                const files = await openAudioFileManager({ multiple: true });
                if (files.length > 0) onFilesUpload(files);
              }}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              className={`p-4 rounded-xl border border-dashed text-center transition-all cursor-pointer group select-none ${
                dragActive
                  ? 'border-amber-400 bg-amber-400/10 text-amber-300 scale-[1.01]'
                  : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:border-amber-400/60 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs">
                <FolderOpen className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                <span>
                  <strong className="text-slate-200 group-hover:text-amber-300 font-semibold">Open File Manager</strong> or drag and drop audio files (MP3, WAV, FLAC, M4A, OGG)
                </span>
              </div>
            </div>

            {/* Track List */}
            <div className="space-y-2 pt-2">
              {filteredTracks.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 space-y-3">
                  <FileAudio className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-sm text-slate-400">
                    {searchQuery.trim()
                      ? `No tracks found matching "${searchQuery.trim()}".`
                      : filterType === 'upload'
                      ? 'No songs imported from your File Manager or phone yet.'
                      : 'No audio tracks available in this filter.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      onClick={async () => {
                        const files = await openAudioFileManager({ multiple: true });
                        if (files.length > 0) onFilesUpload(files);
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Add from File Manager</span>
                    </button>
                    <button
                      onClick={() => folderInputRef.current?.click()}
                      className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                    >
                      <FolderTree className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Import Entire Folder</span>
                    </button>
                  </div>
                </div>
              ) : (
                filteredTracks.map((track) => {
                  const isCurrent = currentTrack?.id === track.id;
                  const isTrackPlaying = isCurrent && isPlaying;

                  return (
                    <div
                      key={track.id}
                      onClick={() => onSelectTrack(track)}
                      className={`group flex items-center justify-between p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-amber-400/10 border-amber-400/50 shadow-md shadow-amber-400/5'
                          : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/70 hover:border-slate-700'
                      }`}
                    >
                      {/* Left: Play button + Artwork + Metadata */}
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isCurrent) {
                              onTogglePlay();
                            } else {
                              onSelectTrack(track);
                            }
                          }}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform active:scale-95 ${
                            isTrackPlaying
                              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/30'
                              : isCurrent
                              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                              : 'bg-slate-800 text-slate-300 group-hover:bg-amber-400 group-hover:text-slate-950'
                          }`}
                        >
                          {isTrackPlaying ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4
                              className={`text-sm font-semibold truncate ${
                                isCurrent ? 'text-amber-300' : 'text-slate-100'
                              }`}
                            >
                              {track.title}
                            </h4>
                            {track.sourceType === 'upload' && (
                              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                <span>Offline Local</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-400 truncate mt-0.5">
                            <span className="text-slate-300">{track.artist}</span>
                            {track.album && (
                              <>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span>{track.album}</span>
                              </>
                            )}
                            {track.genre && (
                              <>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span>{track.genre}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Size + Duration + Download + Add to Playlist + Delete */}
                      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                        <span className="hidden md:inline-block text-[10px] font-mono text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
                          {getTrackEstimatedSizeMb(track)}
                        </span>
                        <span className="text-xs font-mono tabular-nums text-slate-400">
                          {formatTime(track.duration)}
                        </span>

                        {/* Download button */}
                        {onDownloadTrack && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDownloadTrack(track);
                            }}
                            title={`Download "${track.title}" to device Downloads`}
                            className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-950/40 rounded-lg border border-transparent hover:border-cyan-800/50 transition-colors cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}

                        {/* Add to Playlist button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAddToPlaylist(track);
                          }}
                          title="Add to Playlist"
                          className="p-1.5 text-slate-400 hover:text-amber-300 hover:bg-amber-400/10 rounded-lg border border-transparent hover:border-amber-400/30 transition-colors cursor-pointer"
                        >
                          <ListPlus className="w-4 h-4" />
                        </button>

                        {track.sourceType !== 'preset' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTrack(track.id);
                            }}
                            title="Remove track from library"
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
