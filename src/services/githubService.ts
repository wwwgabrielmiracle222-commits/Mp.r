/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AudioTrack, Playlist } from '../types/audio';
import { extractWaveformPeaks } from './audioSynthesizer';
import { audioEngine } from './audioEngine';

export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  public_repos: number;
  total_private_repos?: number;
  followers: number;
  following: number;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  updated_at: string;
  language?: string | null;
}

export interface GitHubAudioFileItem {
  path: string;
  name: string;
  size: number;
  sha: string;
  repoFullName: string;
}

export interface GitHubGistBackup {
  id: string;
  html_url: string;
  description: string;
  updated_at: string;
  playlistCount: number;
}

const STORAGE_KEY_TOKEN = 'mpr_github_access_token';
const STORAGE_KEY_USER = 'mpr_github_user_profile';
const STORAGE_KEY_CLIENT_ID = 'mpr_github_client_id';

// Exact runtime callback paths
export const OAUTH_CALLBACK_PATH = '/auth/callback';

export function getRedirectUri(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
  }
  return `http://localhost:3000${OAUTH_CALLBACK_PATH}`;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_TOKEN);
  } catch {
    return null;
  }
}

export function getStoredUser(): GitHubUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getStoredClientId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_CLIENT_ID) || '';
  } catch {
    return '';
  }
}

export function storeClientId(clientId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_CLIENT_ID, clientId.trim());
  } catch (e) {
    console.error('Failed to store client ID', e);
  }
}

export function clearGitHubSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
  } catch (e) {
    console.error('Failed to clear GitHub session', e);
  }
}

export async function validateAndSaveToken(token: string): Promise<GitHubUser> {
  const cleanToken = token.trim();
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to authenticate with GitHub (HTTP ${res.status})`);
  }

  const user: GitHubUser = await res.json();
  try {
    localStorage.setItem(STORAGE_KEY_TOKEN, cleanToken);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
  } catch (e) {
    console.error('Failed to cache GitHub user profile', e);
  }

  return user;
}

/**
 * Initiates popup-based GitHub OAuth flow adhering to AI Studio iframe constraints.
 * Opens provider URL directly: https://github.com/login/oauth/authorize
 */
export async function initiateGitHubOAuth(clientId?: string): Promise<GitHubUser> {
  const redirectUri = getRedirectUri();
  const state = Math.random().toString(36).substring(2, 15);

  let targetClientId = clientId || getStoredClientId();

  // If client ID not provided in client, check server config
  if (!targetClientId) {
    try {
      const statusRes = await fetch('/api/auth/github/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.hasClientId) {
          // fetch auth url from server
          const urlRes = await fetch(`/api/auth/github/url?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`);
          if (urlRes.ok) {
            const urlData = await urlRes.json();
            return openPopupAndAwaitAuth(urlData.url, state);
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  if (!targetClientId) {
    throw new Error('Please provide your GitHub OAuth Client ID or connect with a Personal Access Token.');
  }

  const scope = 'repo,read:user,gist';
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(targetClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;

  return openPopupAndAwaitAuth(authUrl, state, targetClientId);
}

function openPopupAndAwaitAuth(authUrl: string, expectedState: string, clientId?: string): Promise<GitHubUser> {
  return new Promise((resolve, reject) => {
    const width = 600;
    const height = 750;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'github_oauth_popup',
      `width=${width},height=${height},left=${left},top=${top},status=0,toolbar=0,menubar=0,location=1`
    );

    if (!popup) {
      reject(new Error('Popup blocked by browser. Please allow popups for this site and try again.'));
      return;
    }

    let timeoutId: number | undefined;

    const messageHandler = async (event: MessageEvent) => {
      // Validate origin: accept same-origin, preview run.app origin, or localhost
      const origin = event.origin;
      const isAllowedOrigin =
        origin === window.location.origin ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1');

      if (!isAllowedOrigin) return;

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === 'github') {
        window.removeEventListener('message', messageHandler);
        if (timeoutId) clearTimeout(timeoutId);

        if (event.data.error) {
          reject(new Error(event.data.error));
          return;
        }

        const code = event.data.code;
        if (!code) {
          reject(new Error('No authorization code received from GitHub.'));
          return;
        }

        try {
          // Exchange code for token via backend proxy
          const exchangeRes = await fetch('/api/auth/github/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code,
              clientId: clientId || getStoredClientId(),
              redirectUri: getRedirectUri(),
            }),
          });

          if (!exchangeRes.ok) {
            const errBody = await exchangeRes.json().catch(() => ({}));
            throw new Error(errBody.error_description || errBody.error || 'Failed to exchange token with server');
          }

          const { accessToken } = await exchangeRes.json();
          if (!accessToken) {
            throw new Error('Server returned empty access token');
          }

          const user = await validateAndSaveToken(accessToken);
          resolve(user);
        } catch (exchangeErr) {
          reject(exchangeErr);
        }
      }
    };

    window.addEventListener('message', messageHandler);

    // Timeout after 3 minutes if user leaves popup open
    timeoutId = window.setTimeout(() => {
      window.removeEventListener('message', messageHandler);
      reject(new Error('Authentication timed out.'));
    }, 180000);
  });
}

/**
 * Fetch all repositories for the authenticated user
 */
export async function fetchUserRepos(token: string): Promise<GitHubRepo[]> {
  const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100&type=all', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load repositories (HTTP ${res.status})`);
  }

  const data: GitHubRepo[] = await res.json();
  return data;
}

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.weba'];

function isAudioFilePath(path: string): boolean {
  const lower = path.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Scan a repository's full tree for audio files using GitHub Git Trees API
 */
export async function scanRepoForAudioFiles(
  token: string,
  repo: GitHubRepo
): Promise<GitHubAudioFileItem[]> {
  const treeUrl = `https://api.github.com/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`;
  const res = await fetch(treeUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    // If recursive tree fails or repo is empty, try contents API
    return scanRepoContentsFallback(token, repo, '');
  }

  const data = await res.json();
  if (!Array.isArray(data.tree)) {
    return [];
  }

  interface TreeItem {
    path: string;
    mode: string;
    type: string;
    size?: number;
    sha: string;
  }

  const audioItems: GitHubAudioFileItem[] = (data.tree as TreeItem[])
    .filter((item) => item.type === 'blob' && isAudioFilePath(item.path))
    .map((item) => {
      const parts = item.path.split('/');
      const name = parts[parts.length - 1];
      return {
        path: item.path,
        name,
        size: item.size || 0,
        sha: item.sha,
        repoFullName: repo.full_name,
      };
    });

  return audioItems;
}

async function scanRepoContentsFallback(
  token: string,
  repo: GitHubRepo,
  path: string = ''
): Promise<GitHubAudioFileItem[]> {
  try {
    const url = `https://api.github.com/repos/${repo.full_name}/contents/${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (!res.ok) return [];

    const items = await res.json();
    if (!Array.isArray(items)) return [];

    let results: GitHubAudioFileItem[] = [];
    for (const item of items) {
      if (item.type === 'file' && isAudioFilePath(item.name)) {
        results.push({
          path: item.path,
          name: item.name,
          size: item.size,
          sha: item.sha,
          repoFullName: repo.full_name,
        });
      } else if (item.type === 'dir') {
        // scan 1 level deep to avoid rate limits
        const subRes = await scanRepoContentsFallback(token, repo, item.path);
        results = results.concat(subRes);
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Downloads an audio file from GitHub, decodes its buffer, and generates peaks
 */
export async function importGitHubAudioTrack(
  token: string,
  fileItem: GitHubAudioFileItem,
  onProgress?: (msg: string) => void
): Promise<AudioTrack> {
  onProgress?.(`Fetching ${fileItem.name} from GitHub...`);

  // Download raw blob using GitHub API with custom accept header
  const contentUrl = `https://api.github.com/repos/${fileItem.repoFullName}/contents/${encodeURIComponent(
    fileItem.path
  )}`;

  const res = await fetch(contentUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.raw+json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to download audio file (HTTP ${res.status})`);
  }

  onProgress?.(`Decoding audio waveform...`);
  const blob = await res.blob();
  const arrayBuffer = await blob.arrayBuffer();

  const ctx = audioEngine.initContext();
  let audioBuffer: AudioBuffer | undefined;
  let duration = 0;
  let peaks: number[] = [];

  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    duration = audioBuffer.duration;
    peaks = extractWaveformPeaks(audioBuffer, 80);
  } catch {
    duration = 0;
    peaks = Array.from({ length: 64 }, () => 0.2 + Math.random() * 0.5);
  }

  const url = URL.createObjectURL(blob);

  // Parse title and artist from filename
  const cleanBase = fileItem.name.replace(/\.[^/.]+$/, '').trim();
  let title = cleanBase;
  let artist = fileItem.repoFullName;
  if (cleanBase.includes(' - ')) {
    const parts = cleanBase.split(' - ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  }

  const track: AudioTrack = {
    id: `github_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title,
    artist,
    album: fileItem.repoFullName,
    duration,
    genre: 'GitHub Audio',
    audioBuffer,
    waveformPeaks: peaks.length > 0 ? peaks : Array.from({ length: 64 }, () => 0.2 + Math.random() * 0.5),
    sourceType: 'upload', // Can be played, downloaded, and put into playlists
    blob,
    url,
    notes: `Imported from GitHub repo: ${fileItem.repoFullName}/${fileItem.path}`,
  };

  return track;
}

/**
 * Backup playlists and metadata to a GitHub Gist
 */
export async function backupPlaylistsToGist(
  token: string,
  playlists: Playlist[],
  tracks: AudioTrack[],
  existingGistId?: string
): Promise<{ id: string; html_url: string; updated_at: string }> {
  const payload = {
    app: 'MP.R Audio Studio',
    version: '1.0.0',
    exportDate: new Date().toISOString(),
    playlists,
    tracksSummary: tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      genre: t.genre,
      sourceType: t.sourceType,
      notes: t.notes,
    })),
  };

  const gistContent = JSON.stringify(payload, null, 2);

  const gistBody = {
    description: `MP.R Audio Studio - Playlists & Track Metadata Backup (${playlists.length} playlists, ${tracks.length} tracks)`,
    public: false,
    files: {
      'mpr-studio-playlists.json': {
        content: gistContent,
      },
      'README.md': {
        content: `# MP.R Audio Studio Backup\n\nGenerated automatically on ${new Date().toLocaleString()}.\nContains ${playlists.length} playlists and ${tracks.length} cataloged audio tracks.\n\nYou can restore this backup anytime in MP.R Studio by connecting GitHub.`,
      },
    },
  };

  const url = existingGistId
    ? `https://api.github.com/gists/${existingGistId}`
    : 'https://api.github.com/gists';

  const method = existingGistId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(gistBody),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to create/update Gist (HTTP ${res.status})`);
  }

  const data = await res.json();
  return {
    id: data.id,
    html_url: data.html_url,
    updated_at: data.updated_at,
  };
}

/**
 * List existing MP.R backups in the user's Gists
 */
export async function listUserGistBackups(token: string): Promise<GitHubGistBackup[]> {
  const res = await fetch('https://api.github.com/gists?per_page=30', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) return [];

  interface RawGist {
    id: string;
    html_url: string;
    description: string;
    updated_at: string;
    files: Record<string, { filename: string }>;
  }

  const gists: RawGist[] = await res.json();
  const backups: GitHubGistBackup[] = [];

  for (const gist of gists) {
    if (gist.files && gist.files['mpr-studio-playlists.json']) {
      backups.push({
        id: gist.id,
        html_url: gist.html_url,
        description: gist.description || 'MP.R Studio Backup',
        updated_at: gist.updated_at,
        playlistCount: 0,
      });
    }
  }

  return backups;
}

/**
 * Restore playlists from a GitHub Gist backup
 */
export async function restorePlaylistsFromGist(
  token: string,
  gistId: string
): Promise<{ playlists: Playlist[]; tracksSummary: Array<{ id: string; title: string; artist: string }> }> {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load Gist (HTTP ${res.status})`);
  }

  const data = await res.json();
  const file = data.files?.['mpr-studio-playlists.json'];
  if (!file || !file.content) {
    throw new Error('Gist does not contain valid MP.R playlist data');
  }

  const parsed = JSON.parse(file.content);
  return {
    playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
    tracksSummary: Array.isArray(parsed.tracksSummary) ? parsed.tracksSummary : [],
  };
}
