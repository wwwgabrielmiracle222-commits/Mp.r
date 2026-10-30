/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { Header, ActiveTab } from './components/Header';
import { BottomPlayerBar } from './components/BottomPlayerBar';
import { PlayerView } from './components/PlayerView';
import { LibraryView } from './components/LibraryView';
import { RecorderView } from './components/RecorderView';
import { EqualizerView } from './components/EqualizerView';
import { RadioView } from './components/RadioView';
import { SoundPadView } from './components/SoundPadView';
import { AudioTrack, AudioRecording, VisualizerMode, RadioStation, Playlist } from './types/audio';
import { audioEngine } from './services/audioEngine';
import { generateProceduralTrackBuffer, extractWaveformPeaks } from './services/audioSynthesizer';
import {
  persistPhoneTrack,
  loadPersistedPhoneTracks,
  removePersistedPhoneTrack,
  clearPersistedPhoneTracks,
  persistPlaylist,
  loadPersistedPlaylists,
  removePersistedPlaylist,
} from './services/storageService';
import { downloadTrackAsFile } from './services/downloadService';
import { AddToPlaylistModal } from './components/AddToPlaylistModal';
import { GitHubModal } from './components/GitHubModal';
import { getStoredUser, GitHubUser } from './services/githubService';
import { CheckCircle2 } from 'lucide-react';

function parseAudioFilename(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^/.]+$/, '').trim();
  const cleaned = base.replace(/^\d+[\s.-]+/, '').trim();
  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim().replace(/_/g, ' '),
        title: parts.slice(1).join(' - ').trim().replace(/_/g, ' '),
      };
    }
  }
  return {
    title: cleaned.replace(/_/g, ' ') || 'Phone Audio Track',
    artist: 'My Phone',
  };
}

const INITIAL_TRACK_DEFS = [
  {
    id: 'track_lofi_1',
    title: 'Midnight Reverie',
    artist: 'Studio Resonance',
    genre: 'Lo-Fi Chillhop',
    bpm: 76,
    style: 'lofi' as const,
    duration: 30,
    notes: 'Key of C minor. Rhodes chords with vinyl surface warmth and sub-bass groove.',
  },
  {
    id: 'track_synth_2',
    title: 'Neon Horizon',
    artist: 'Retro Pulse',
    genre: 'Synthwave 80s',
    bpm: 110,
    style: 'synthwave' as const,
    duration: 30,
    notes: 'Analog saw arpeggio, gated reverb snare, four-on-the-floor electro rhythm.',
  },
  {
    id: 'track_ambient_3',
    title: 'Deep Focus Sanctuary',
    artist: 'Ethereal Space',
    genre: 'Ambient Piano',
    bpm: 60,
    style: 'ambient' as const,
    duration: 30,
    notes: 'Warm acoustic piano arpeggio floating in long shimmer reverb hall.',
  },
  {
    id: 'track_techno_4',
    title: 'Cyber Pulse Drive',
    artist: 'Vector Grid',
    genre: 'Techno Groove',
    bpm: 128,
    style: 'techno' as const,
    duration: 30,
    notes: 'Punchy 909 kick, syncopated 16th-note acid bassline, and open hi-hat swing.',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('player');
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [recordings, setRecordings] = useState<AudioRecording[]>([]);
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>('bars');
  const [loopMode, setLoopMode] = useState<'none' | 'all' | 'single'>('none');
  const [isShuffle, setIsShuffle] = useState(false);
  const [abLoop, setAbLoop] = useState<{ start: number; end: number; active: boolean }>({
    start: 0,
    end: 0,
    active: false,
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [trackForPlaylistModal, setTrackForPlaylistModal] = useState<AudioTrack | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [gitHubUser, setGitHubUser] = useState<GitHubUser | null>(null);

  // Initialize tracks and restore persisted phone tracks and playlists
  useEffect(() => {
    async function initTracks() {
      // Check stored GitHub user session
      const storedUser = getStoredUser();
      if (storedUser) {
        setGitHubUser(storedUser);
      }

      const defaultTracks: AudioTrack[] = INITIAL_TRACK_DEFS.map((def) => ({
        id: def.id,
        title: def.title,
        artist: def.artist,
        duration: def.duration,
        genre: def.genre,
        bpm: def.bpm,
        sourceType: 'preset',
        notes: def.notes,
        waveformPeaks: Array.from({ length: 64 }, (_, i) => 0.2 + Math.abs(Math.sin(i * 0.3)) * 0.6),
      }));

      // Load user's phone tracks from browser's persistent IndexedDB
      const persistedPhoneTracks = await loadPersistedPhoneTracks();
      const combinedTracks = [...persistedPhoneTracks, ...defaultTracks];

      // Load user's custom playlists from browser's persistent storage
      const persistedPlaylists = await loadPersistedPlaylists();
      setPlaylists(persistedPlaylists);

      setTracks(combinedTracks);
      if (combinedTracks.length > 0) {
        setCurrentTrack(combinedTracks[0]);
        setDuration(combinedTracks[0].duration);
      }
    }

    initTracks();
  }, []);

  // Listen to AudioEngine state updates
  useEffect(() => {
    audioEngine.onTimeUpdate = (curr, dur) => {
      setCurrentTime(curr);
      if (dur > 0) setDuration(dur);
    };

    audioEngine.onPlayStateChange = (playing) => {
      setIsPlaying(playing);
    };

    audioEngine.onTrackEnded = () => {
      handleNextTrack();
    };
  }, [tracks, currentTrack, loopMode, isShuffle]);

  // Buffer preparation helper for preset tracks
  const ensureTrackAudioBuffer = (track: AudioTrack): AudioTrack => {
    if (track.audioBuffer || track.url) return track;

    const ctx = audioEngine.initContext();
    const def = INITIAL_TRACK_DEFS.find((d) => d.id === track.id);
    const style = def ? def.style : 'lofi';
    const buffer = generateProceduralTrackBuffer(ctx, style, track.duration);
    const peaks = extractWaveformPeaks(buffer, 80);

    const updated = {
      ...track,
      audioBuffer: buffer,
      waveformPeaks: peaks,
    };

    setTracks((prev) => prev.map((t) => (t.id === track.id ? updated : t)));
    return updated;
  };

  const handleSelectTrack = async (track: AudioTrack) => {
    const preparedTrack = ensureTrackAudioBuffer(track);
    setCurrentTrack(preparedTrack);
    setCurrentTime(0);
    setDuration(preparedTrack.duration);
    await audioEngine.playTrack(preparedTrack, 0);
  };

  const handleTogglePlay = async () => {
    if (!currentTrack) {
      if (tracks.length > 0) {
        handleSelectTrack(tracks[0]);
      }
      return;
    }

    if (!currentTrack.audioBuffer && !currentTrack.url) {
      const prepared = ensureTrackAudioBuffer(currentTrack);
      setCurrentTrack(prepared);
      await audioEngine.playTrack(prepared, 0);
    } else {
      await audioEngine.togglePlayPause();
    }
  };

  const handleNextTrack = useCallback(() => {
    if (tracks.length === 0) return;
    if (loopMode === 'single' && currentTrack) {
      audioEngine.seek(0);
      return;
    }

    let nextIndex = 0;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack?.id);

    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * tracks.length);
    } else if (currentIndex >= 0) {
      nextIndex = (currentIndex + 1) % tracks.length;
    }

    handleSelectTrack(tracks[nextIndex]);
  }, [tracks, currentTrack, loopMode, isShuffle]);

  const handlePrevTrack = () => {
    if (tracks.length === 0) return;
    if (currentTime > 3) {
      audioEngine.seek(0);
      return;
    }

    const currentIndex = tracks.findIndex((t) => t.id === currentTrack?.id);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : tracks.length - 1;
    handleSelectTrack(tracks[prevIndex]);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    audioEngine.seek(time);
  };

  const handleToggleLoop = () => {
    const modes: Array<'none' | 'all' | 'single'> = ['none', 'all', 'single'];
    const nextMode = modes[(modes.indexOf(loopMode) + 1) % modes.length];
    setLoopMode(nextMode);
    audioEngine.loopMode = nextMode;
  };

  const handleToggleShuffle = () => {
    setIsShuffle(!isShuffle);
  };

  const handleSetAbLoop = (start: number, end: number, active: boolean) => {
    setAbLoop({ start, end, active });
    audioEngine.setAbLoop(start, end, active);
  };

  const handleDeleteTrack = async (trackId: string) => {
    if (currentTrack?.id === trackId) {
      audioEngine.stop();
      setCurrentTrack(null);
    }
    await removePersistedPhoneTrack(trackId);
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.trackIds.includes(trackId)) {
          const updated: Playlist = {
            ...pl,
            trackIds: pl.trackIds.filter((id) => id !== trackId),
            updatedAt: Date.now(),
          };
          persistPlaylist(updated).catch(console.error);
          return updated;
        }
        return pl;
      })
    );
  };

  const handleCreatePlaylist = (name: string, description?: string): string => {
    const newPlaylist: Playlist = {
      id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      description: description?.trim(),
      trackIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setPlaylists((prev) => [newPlaylist, ...prev]);
    persistPlaylist(newPlaylist).catch(console.error);
    return newPlaylist.id;
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    await removePersistedPlaylist(playlistId);
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
  };

  const handleToggleTrackInPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const exists = pl.trackIds.includes(trackId);
        const newTrackIds = exists
          ? pl.trackIds.filter((id) => id !== trackId)
          : [...pl.trackIds, trackId];
        const updated: Playlist = {
          ...pl,
          trackIds: newTrackIds,
          updatedAt: Date.now(),
        };
        persistPlaylist(updated).catch(console.error);
        return updated;
      })
    );
  };

  const handleRemoveTrackFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const newTrackIds = pl.trackIds.filter((id) => id !== trackId);
        const updated: Playlist = {
          ...pl,
          trackIds: newTrackIds,
          updatedAt: Date.now(),
        };
        persistPlaylist(updated).catch(console.error);
        return updated;
      })
    );
  };

  const handlePlayPlaylist = (playlist: Playlist, shuffle: boolean = false) => {
    const playlistTracks = playlist.trackIds
      .map((id) => tracks.find((t) => t.id === id))
      .filter((t): t is AudioTrack => Boolean(t));

    if (playlistTracks.length === 0) return;

    if (shuffle) {
      setIsShuffle(true);
      const randomIndex = Math.floor(Math.random() * playlistTracks.length);
      handleSelectTrack(playlistTracks[randomIndex]);
    } else {
      handleSelectTrack(playlistTracks[0]);
    }
  };

  const handleFilesUpload = async (inputFiles: FileList | File[] | File) => {
    const fileArray: File[] =
      inputFiles instanceof FileList
        ? Array.from(inputFiles)
        : Array.isArray(inputFiles)
        ? inputFiles
        : [inputFiles];

    if (fileArray.length === 0) return;

    setIsImporting(true);
    setImportProgress({ current: 0, total: fileArray.length });
    const ctx = audioEngine.initContext();
    const newLoadedTracks: AudioTrack[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const { title, artist } = parseAudioFilename(file.name);
      const url = URL.createObjectURL(file);
      let audioBuffer: AudioBuffer | undefined;
      let peaks: number[] = [];
      let duration = 0;

      try {
        const arrayBuffer = await file.arrayBuffer();
        audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        duration = audioBuffer.duration;
        peaks = extractWaveformPeaks(audioBuffer, 80);
      } catch {
        duration = 0;
      }

      const track: AudioTrack = {
        id: `phone_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
        title,
        artist,
        album: 'Phone Library',
        duration,
        genre: 'Phone Audio',
        audioBuffer,
        waveformPeaks: peaks.length > 0 ? peaks : Array.from({ length: 64 }, () => 0.2 + Math.random() * 0.5),
        sourceType: 'upload',
        blob: file,
        url,
      };

      await persistPhoneTrack(track, file);
      newLoadedTracks.push(track);
      setImportProgress({ current: i + 1, total: fileArray.length });
    }

    setTracks((prev) => [...newLoadedTracks, ...prev]);
    setIsImporting(false);
    setImportProgress(null);

    if (newLoadedTracks.length > 0) {
      handleSelectTrack(newLoadedTracks[0]);
      const msg =
        newLoadedTracks.length === 1
          ? `Added "${newLoadedTracks[0].title}" from File Manager`
          : `Added ${newLoadedTracks.length} songs from File Manager`;
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleAddRecordingToLibrary = (track: AudioTrack) => {
    setTracks((prev) => [track, ...prev]);
    handleSelectTrack(track);
  };

  const handleDeleteRecording = (id: string) => {
    setRecordings((prev) => prev.filter((r) => r.id !== id));
  };

  const handleTuneStation = (station: RadioStation) => {
    const radioTrack: AudioTrack = {
      id: `station_${station.id}`,
      title: station.name,
      artist: `${station.callsign} · ${station.location}`,
      genre: station.genre,
      duration: 0,
      sourceType: 'radio',
      url: station.streamUrl,
    };

    setCurrentTrack(radioTrack);
    audioEngine.playTrack(radioTrack, 0);
  };

  const handleDownloadTrack = async (track: AudioTrack) => {
    const preparedTrack = ensureTrackAudioBuffer(track);
    const result = await downloadTrackAsFile(preparedTrack, (msg) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3500);
    });
    return result;
  };

  const handleDownloadAllLocalTracks = async () => {
    const localTracks = tracks.filter((t) => t.sourceType === 'upload');
    if (localTracks.length === 0) {
      setToastMessage('No local phone tracks to download');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    setToastMessage(`Downloading ${localTracks.length} tracks to device...`);
    for (const track of localTracks) {
      await handleDownloadTrack(track);
    }
  };

  const handleClearLocalTracks = async () => {
    await clearPersistedPhoneTracks();
    setTracks((prev) => prev.filter((t) => t.sourceType !== 'upload'));
    if (currentTrack?.sourceType === 'upload') {
      audioEngine.stop();
      setCurrentTrack(null);
    }
    setToastMessage('Cleared all local device tracks from storage');
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleGitHubTrackImported = (track: AudioTrack) => {
    setTracks((prev) => [track, ...prev]);
    handleSelectTrack(track);
    setToastMessage(`Imported "${track.title}" from GitHub`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleGitHubPlaylistsRestored = (restoredPlaylists: Playlist[]) => {
    setPlaylists(restoredPlaylists);
    for (const pl of restoredPlaylists) {
      persistPlaylist(pl).catch(console.error);
    }
    setToastMessage(`Restored ${restoredPlaylists.length} playlists from GitHub`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="min-h-screen bg-[#090D14] text-slate-100 flex flex-col font-sans selection:bg-amber-400/20 selection:text-amber-200">
      {/* Top Bar Header with 3-Zone Contract */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAudioUpload={handleFilesUpload}
        isRecording={isRecording}
        phoneTracksCount={tracks.filter((t) => t.sourceType === 'upload').length}
        onOpenGitHub={() => setIsGitHubModalOpen(true)}
        isGitHubConnected={Boolean(gitHubUser)}
        githubUserLogin={gitHubUser?.login}
      />

      {/* Main Workspace Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 pb-28">
        {activeTab === 'player' && (
          <PlayerView
            tracks={tracks}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            visualizerMode={visualizerMode}
            onVisualizerModeChange={setVisualizerMode}
            onSelectTrack={handleSelectTrack}
            onTogglePlay={handleTogglePlay}
            onDeleteTrack={handleDeleteTrack}
            onFileUpload={handleFilesUpload}
            onOpenLibrary={() => setActiveTab('library')}
            onOpenAddToPlaylist={setTrackForPlaylistModal}
            onDownloadTrack={handleDownloadTrack}
            abLoop={abLoop}
            onSetAbLoop={handleSetAbLoop}
            onSeek={handleSeek}
          />
        )}

        {(activeTab === 'library' || activeTab === 'downloads') && (
          <LibraryView
            tracks={tracks}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onSelectTrack={handleSelectTrack}
            onTogglePlay={handleTogglePlay}
            onDeleteTrack={handleDeleteTrack}
            onFilesUpload={handleFilesUpload}
            playlists={playlists}
            onCreatePlaylist={handleCreatePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            onPlayPlaylist={handlePlayPlaylist}
            onRemoveTrackFromPlaylist={handleRemoveTrackFromPlaylist}
            onOpenAddToPlaylist={setTrackForPlaylistModal}
            onDownloadTrack={handleDownloadTrack}
            onDownloadAllLocalTracks={handleDownloadAllLocalTracks}
            onClearLocalTracks={handleClearLocalTracks}
            onOpenGitHub={() => setIsGitHubModalOpen(true)}
            initialFilter={activeTab === 'downloads' ? 'upload' : 'all'}
            isImporting={isImporting}
            importProgress={importProgress}
          />
        )}

        {activeTab === 'recorder' && (
          <RecorderView
            recordings={recordings}
            onAddRecordingToLibrary={handleAddRecordingToLibrary}
            onDeleteRecording={handleDeleteRecording}
          />
        )}

        {activeTab === 'equalizer' && <EqualizerView />}

        {activeTab === 'radio' && (
          <RadioView
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onTuneStation={handleTuneStation}
            onTogglePlay={handleTogglePlay}
          />
        )}

        {activeTab === 'pads' && <SoundPadView />}
      </main>

      {/* Persistent Bottom Audio Player Bar */}
      <BottomPlayerBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onPlayPause={handleTogglePlay}
        onNext={handleNextTrack}
        onPrev={handlePrevTrack}
        onSeek={handleSeek}
        onOpenEq={() => setActiveTab('equalizer')}
        loopMode={loopMode}
        onToggleLoop={handleToggleLoop}
        isShuffle={isShuffle}
        onToggleShuffle={handleToggleShuffle}
        onDownloadTrack={handleDownloadTrack}
      />

      {/* Add To Playlist Modal */}
      <AddToPlaylistModal
        track={trackForPlaylistModal}
        playlists={playlists}
        onClose={() => setTrackForPlaylistModal(null)}
        onToggleTrackInPlaylist={handleToggleTrackInPlaylist}
        onCreatePlaylist={handleCreatePlaylist}
      />

      {/* GitHub Cloud Audio & Backup Modal */}
      <GitHubModal
        isOpen={isGitHubModalOpen}
        onClose={() => {
          setIsGitHubModalOpen(false);
          // Sync active user state if changed
          setGitHubUser(getStoredUser());
        }}
        onTrackImported={handleGitHubTrackImported}
        playlists={playlists}
        tracks={tracks}
        onPlaylistsRestored={handleGitHubPlaylistsRestored}
      />

      {/* Floating Status Notification Toast */}
      {toastMessage && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed top-18 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900/95 border border-amber-400/40 text-slate-100 shadow-2xl text-xs backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{toastMessage}</span>
        </aside>
      )}
    </div>
  );
}
