import { AudioTrack, AudioRecording, Playlist } from '../types/audio';

const DB_NAME = 'mpr_audio_studio_db';
const DB_VERSION = 2;
const TRACKS_STORE = 'phone_tracks';
const RECORDINGS_STORE = 'voice_recordings';
const PLAYLISTS_STORE = 'playlists';
const LOCALSTORAGE_PLAYLISTS_KEY = 'mpr_user_playlists';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported on this browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(TRACKS_STORE)) {
        db.createObjectStore(TRACKS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(RECORDINGS_STORE)) {
        db.createObjectStore(RECORDINGS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PLAYLISTS_STORE)) {
        db.createObjectStore(PLAYLISTS_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface StoredTrackRecord {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre: string;
  duration: number;
  waveformPeaks?: number[];
  blob: Blob;
  fileName?: string;
  fileSize?: number;
  dateAdded: number;
  sourceType: 'upload';
}

/**
 * Save an imported track from phone/device to persistent IndexedDB
 */
export async function persistPhoneTrack(
  track: AudioTrack,
  fileBlob: Blob
): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TRACKS_STORE, 'readwrite');
      const store = tx.objectStore(TRACKS_STORE);

      const record: StoredTrackRecord = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album || 'Device Library',
        genre: track.genre || 'Phone Audio',
        duration: track.duration,
        waveformPeaks: track.waveformPeaks || [],
        blob: fileBlob,
        fileName: fileBlob instanceof File ? fileBlob.name : `${track.title}.mp3`,
        fileSize: fileBlob.size,
        dateAdded: Date.now(),
        sourceType: 'upload',
      };

      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not persist track to IndexedDB:', err);
  }
}

/**
 * Retrieve all persisted phone/device tracks from IndexedDB
 */
export async function loadPersistedPhoneTracks(): Promise<AudioTrack[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TRACKS_STORE, 'readonly');
      const store = tx.objectStore(TRACKS_STORE);
      const req = store.getAll();

      req.onsuccess = () => {
        const records: StoredTrackRecord[] = req.result || [];
        const loadedTracks: AudioTrack[] = records.map((rec) => {
          const url = URL.createObjectURL(rec.blob);
          return {
            id: rec.id,
            title: rec.title,
            artist: rec.artist,
            album: rec.album,
            duration: rec.duration,
            genre: rec.genre,
            waveformPeaks: rec.waveformPeaks,
            blob: rec.blob,
            url,
            sourceType: 'upload',
          };
        });
        resolve(loadedTracks);
      };

      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to load phone tracks from IndexedDB:', err);
    return [];
  }
}

/**
 * Remove a track from persistent storage
 */
export async function removePersistedPhoneTrack(trackId: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TRACKS_STORE, 'readwrite');
      const store = tx.objectStore(TRACKS_STORE);
      const req = store.delete(trackId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to delete track from IndexedDB:', err);
  }
}

/**
 * Get statistics of locally stored phone tracks in IndexedDB
 */
export async function getLocalMusicStats(): Promise<{ count: number; totalSizeBytes: number }> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(TRACKS_STORE, 'readonly');
      const store = tx.objectStore(TRACKS_STORE);
      const req = store.getAll();

      req.onsuccess = () => {
        const records: StoredTrackRecord[] = req.result || [];
        let totalSize = 0;
        for (const rec of records) {
          totalSize += rec.fileSize || (rec.blob ? rec.blob.size : 0);
        }
        resolve({ count: records.length, totalSizeBytes: totalSize });
      };

      req.onerror = () => resolve({ count: 0, totalSizeBytes: 0 });
    });
  } catch {
    return { count: 0, totalSizeBytes: 0 };
  }
}

/**
 * Clear all locally cached device tracks from IndexedDB
 */
export async function clearPersistedPhoneTracks(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TRACKS_STORE, 'readwrite');
      const store = tx.objectStore(TRACKS_STORE);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to clear phone tracks from IndexedDB:', err);
  }
}

/**
 * Persist a custom named playlist to IndexedDB and localStorage
 */
export async function persistPlaylist(playlist: Playlist): Promise<void> {
  // Sync to localStorage immediately
  try {
    const local = localStorage.getItem(LOCALSTORAGE_PLAYLISTS_KEY);
    const playlists: Playlist[] = local ? JSON.parse(local) : [];
    const existingIdx = playlists.findIndex((p) => p.id === playlist.id);
    if (existingIdx >= 0) {
      playlists[existingIdx] = playlist;
    } else {
      playlists.push(playlist);
    }
    localStorage.setItem(LOCALSTORAGE_PLAYLISTS_KEY, JSON.stringify(playlists));
  } catch (e) {
    console.warn('Could not save playlist to localStorage:', e);
  }

  // Also persist to IndexedDB
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PLAYLISTS_STORE, 'readwrite');
      const store = tx.objectStore(PLAYLISTS_STORE);
      const req = store.put(playlist);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not persist playlist to IndexedDB:', err);
  }
}

/**
 * Load all custom playlists from IndexedDB (with localStorage backup fallback)
 */
export async function loadPersistedPlaylists(): Promise<Playlist[]> {
  let loadedFromIdb: Playlist[] = [];

  try {
    const db = await openDatabase();
    loadedFromIdb = await new Promise((resolve, reject) => {
      const tx = db.transaction(PLAYLISTS_STORE, 'readonly');
      const store = tx.objectStore(PLAYLISTS_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to load playlists from IndexedDB:', err);
  }

  if (loadedFromIdb.length > 0) {
    return loadedFromIdb;
  }

  // Fallback to localStorage
  try {
    const local = localStorage.getItem(LOCALSTORAGE_PLAYLISTS_KEY);
    if (local) {
      const parsed: Playlist[] = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse localStorage playlists:', e);
  }

  return [];
}

/**
 * Remove a playlist from persistent storage
 */
export async function removePersistedPlaylist(playlistId: string): Promise<void> {
  // Remove from localStorage
  try {
    const local = localStorage.getItem(LOCALSTORAGE_PLAYLISTS_KEY);
    if (local) {
      const playlists: Playlist[] = JSON.parse(local);
      const filtered = playlists.filter((p) => p.id !== playlistId);
      localStorage.setItem(LOCALSTORAGE_PLAYLISTS_KEY, JSON.stringify(filtered));
    }
  } catch (e) {
    console.warn('Could not remove playlist from localStorage:', e);
  }

  // Remove from IndexedDB
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PLAYLISTS_STORE, 'readwrite');
      const store = tx.objectStore(PLAYLISTS_STORE);
      const req = store.delete(playlistId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to delete playlist from IndexedDB:', err);
  }
}
