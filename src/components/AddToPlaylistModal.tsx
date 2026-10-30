import { useState } from 'react';
import { X, Plus, Check, Music, FolderPlus, Sparkles } from 'lucide-react';
import { AudioTrack, Playlist } from '../types/audio';

interface AddToPlaylistModalProps {
  track: AudioTrack | null;
  playlists: Playlist[];
  onClose: () => void;
  onToggleTrackInPlaylist: (playlistId: string, trackId: string) => void;
  onCreatePlaylist: (name: string, description?: string) => string; // returns new playlist id
}

export function AddToPlaylistModal({
  track,
  playlists,
  onClose,
  onToggleTrackInPlaylist,
  onCreatePlaylist,
}: AddToPlaylistModalProps) {
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!track) return null;

  const handleCreateAndAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    const newId = onCreatePlaylist(newPlaylistName.trim(), newPlaylistDesc.trim());
    onToggleTrackInPlaylist(newId, track.id);
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    setIsCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-md rounded-2xl bg-[#0E1422] border border-slate-800 shadow-2xl p-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium mb-1">
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Add to Custom Playlist</span>
            </div>
            <h3 className="text-base font-bold text-white truncate">
              {track.title}
            </h3>
            <p className="text-xs text-slate-400 truncate">{track.artist}</p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Existing Playlists List */}
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1 my-3">
          {playlists.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              No playlists created yet. Create your first collection below!
            </div>
          ) : (
            playlists.map((playlist) => {
              const isInPlaylist = playlist.trackIds.includes(track.id);

              return (
                <div
                  key={playlist.id}
                  onClick={() => onToggleTrackInPlaylist(playlist.id, track.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                    isInPlaylist
                      ? 'bg-amber-400/10 border-amber-400/40 text-amber-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0 pr-3">
                    <h4 className="text-xs font-semibold truncate text-white">
                      {playlist.name}
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                      {playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'song' : 'songs'}
                      {playlist.description ? ` · ${playlist.description}` : ''}
                    </p>
                  </div>

                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isInPlaylist
                        ? 'bg-amber-400 text-slate-950 font-bold'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {isInPlaylist ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : <Plus className="w-3.5 h-3.5" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Create New Playlist Form Toggle */}
        <div className="pt-3 border-t border-slate-800">
          {!isCreating ? (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Create New Playlist</span>
            </button>
          ) : (
            <form onSubmit={handleCreateAndAdd} className="space-y-2.5">
              <input
                type="text"
                autoFocus
                required
                placeholder="Playlist name (e.g. Chill Evening, Workout Beats)"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={newPlaylistDesc}
                onChange={(e) => setNewPlaylistDesc(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors"
                >
                  Create & Add Song
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 rounded-lg border border-slate-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Done Button */}
        <div className="mt-4 pt-2">
          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
