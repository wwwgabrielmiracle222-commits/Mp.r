/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  X,
  Key,
  ExternalLink,
  FolderGit2,
  Music,
  Download,
  CloudUpload,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  Sliders,
  ShieldCheck,
  Search,
} from 'lucide-react';
import {
  GitHubUser,
  GitHubRepo,
  GitHubAudioFileItem,
  GitHubGistBackup,
  getStoredToken,
  getStoredUser,
  getStoredClientId,
  storeClientId,
  validateAndSaveToken,
  initiateGitHubOAuth,
  clearGitHubSession,
  fetchUserRepos,
  scanRepoForAudioFiles,
  importGitHubAudioTrack,
  backupPlaylistsToGist,
  listUserGistBackups,
  restorePlaylistsFromGist,
} from '../services/githubService';
import { AudioTrack, Playlist } from '../types/audio';
import { persistPhoneTrack } from '../services/storageService';

// Exact runtime callback URLs provided by AI Studio preview environment
const DEV_CALLBACK_URL = 'https://ais-dev-3b7rtk7b2ugxbxjp2ik7h2-696025426267.europe-west2.run.app/auth/callback';
const SHARED_CALLBACK_URL = 'https://ais-pre-3b7rtk7b2ugxbxjp2ik7h2-696025426267.europe-west2.run.app/auth/callback';

interface GitHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTrackImported: (track: AudioTrack) => void;
  playlists: Playlist[];
  tracks: AudioTrack[];
  onPlaylistsRestored: (restoredPlaylists: Playlist[]) => void;
}

export function GitHubModal({
  isOpen,
  onClose,
  onTrackImported,
  playlists,
  tracks,
  onPlaylistsRestored,
}: GitHubModalProps) {
  // Auth state
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [authMethod, setAuthMethod] = useState<'pat' | 'oauth'>('pat');
  const [patInput, setPatInput] = useState('');
  const [clientIdInput, setClientIdInput] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<'dev' | 'shared' | null>(null);

  // Connected state tabs
  const [activeTab, setActiveTab] = useState<'repos' | 'backup' | 'settings'>('repos');

  // Repositories & Audio files
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [audioFiles, setAudioFiles] = useState<GitHubAudioFileItem[]>([]);
  const [isScanningRepo, setIsScanningRepo] = useState(false);
  const [importingFileSha, setImportingFileSha] = useState<string | null>(null);
  const [importProgressText, setImportProgressText] = useState<string | null>(null);

  // Backups
  const [gists, setGists] = useState<GitHubGistBackup[]>([]);
  const [isLoadingGists, setIsLoadingGists] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupSuccessMessage, setBackupSuccessMessage] = useState<string | null>(null);

  // Initialize and check stored session
  useEffect(() => {
    if (!isOpen) return;

    const storedToken = getStoredToken();
    const storedUser = getStoredUser();
    const storedCId = getStoredClientId();

    if (storedCId) setClientIdInput(storedCId);

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(storedUser);
      loadRepos(storedToken);
      loadGists(storedToken);
    } else if (storedToken) {
      validateAndSaveToken(storedToken)
        .then((u) => {
          setToken(storedToken);
          setUser(u);
          loadRepos(storedToken);
          loadGists(storedToken);
        })
        .catch(() => {
          clearGitHubSession();
          setToken(null);
          setUser(null);
        });
    }
  }, [isOpen]);

  const loadRepos = async (tok: string) => {
    setIsLoadingRepos(true);
    try {
      const list = await fetchUserRepos(tok);
      setRepos(list);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const loadGists = async (tok: string) => {
    setIsLoadingGists(true);
    try {
      const list = await listUserGistBackups(tok);
      setGists(list);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingGists(false);
    }
  };

  const handleConnectPAT = async () => {
    if (!patInput.trim()) {
      setAuthError('Please enter a GitHub Personal Access Token');
      return;
    }
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const u = await validateAndSaveToken(patInput.trim());
      setToken(patInput.trim());
      setUser(u);
      setPatInput('');
      loadRepos(patInput.trim());
      loadGists(patInput.trim());
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Invalid GitHub token');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleConnectOAuth = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    if (clientIdInput.trim()) {
      storeClientId(clientIdInput.trim());
    }

    try {
      const u = await initiateGitHubOAuth(clientIdInput.trim() || undefined);
      const activeTok = getStoredToken();
      if (activeTok) {
        setToken(activeTok);
        setUser(u);
        loadRepos(activeTok);
        loadGists(activeTok);
      }
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'OAuth authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDisconnect = () => {
    clearGitHubSession();
    setToken(null);
    setUser(null);
    setRepos([]);
    setSelectedRepo(null);
    setAudioFiles([]);
    setGists([]);
  };

  const handleSelectRepo = async (repo: GitHubRepo) => {
    if (!token) return;
    setSelectedRepo(repo);
    setIsScanningRepo(true);
    setAudioFiles([]);
    try {
      const files = await scanRepoForAudioFiles(token, repo);
      setAudioFiles(files);
    } catch (e) {
      console.error(e);
    } finally {
      setIsScanningRepo(false);
    }
  };

  const handleImportAudioFile = async (fileItem: GitHubAudioFileItem) => {
    if (!token) return;
    setImportingFileSha(fileItem.sha);
    setImportProgressText('Starting download from GitHub...');
    try {
      const track = await importGitHubAudioTrack(token, fileItem, (msg) => {
        setImportProgressText(msg);
      });
      if (track.blob) {
        await persistPhoneTrack(track, track.blob as File);
      }
      onTrackImported(track);
      setBackupSuccessMessage(`Imported "${track.title}" into MP.R Studio!`);
      setTimeout(() => setBackupSuccessMessage(null), 4000);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Failed to import audio track');
      setTimeout(() => setAuthError(null), 5000);
    } finally {
      setImportingFileSha(null);
      setImportProgressText(null);
    }
  };

  const handleBackupPlaylists = async () => {
    if (!token) return;
    setIsBackingUp(true);
    setBackupSuccessMessage(null);
    try {
      const res = await backupPlaylistsToGist(token, playlists, tracks);
      setBackupSuccessMessage(`Successfully backed up ${playlists.length} playlists to GitHub Gist!`);
      loadGists(token);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Failed to create Gist backup');
      setTimeout(() => setAuthError(null), 5000);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreBackup = async (gistId: string) => {
    if (!token) return;
    try {
      const restored = await restorePlaylistsFromGist(token, gistId);
      if (restored.playlists.length > 0) {
        onPlaylistsRestored(restored.playlists);
        setBackupSuccessMessage(`Restored ${restored.playlists.length} playlists from GitHub backup!`);
        setTimeout(() => setBackupSuccessMessage(null), 4000);
      } else {
        setBackupSuccessMessage('No playlists found in backup.');
      }
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Failed to restore backup');
      setTimeout(() => setAuthError(null), 5000);
    }
  };

  const copyToClipboard = (text: string, type: 'dev' | 'shared') => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(type);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  if (!isOpen) return null;

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(repoSearch.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0d131f] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-[#090d14]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 flex items-center justify-center text-amber-400 shadow-sm">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">GitHub Cloud Access</h2>
                {user ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700/50">
                    Not connected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Connect your account to import audio from repos & sync studio playlists to GitHub
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Feedback Banner */}
        {authError && (
          <div className="flex items-center gap-2 px-6 py-2.5 bg-red-950/40 border-b border-red-500/30 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{authError}</span>
          </div>
        )}

        {backupSuccessMessage && (
          <div className="flex items-center gap-2 px-6 py-2.5 bg-emerald-950/40 border-b border-emerald-500/30 text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{backupSuccessMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!user ? (
            /* Unauthenticated View: Connect Tabs */
            <div className="max-w-xl mx-auto space-y-5">
              <div className="text-center space-y-1.5">
                <h3 className="text-lg font-semibold text-white">Connect your GitHub Account</h3>
                <p className="text-xs text-slate-400">
                  Select your preferred authentication method to grant MP.R Studio access to your audio repositories and playlist backups.
                </p>
              </div>

              {/* Method Switcher */}
              <div className="flex rounded-xl bg-slate-900/90 p-1 border border-slate-800">
                <button
                  onClick={() => setAuthMethod('pat')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                    authMethod === 'pat'
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Personal Access Token (Instant)</span>
                </button>
                <button
                  onClick={() => setAuthMethod('oauth')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                    authMethod === 'oauth'
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>OAuth 2.0 (App Login)</span>
                </button>
              </div>

              {authMethod === 'pat' ? (
                /* Tab 1: Personal Access Token */
                <div className="space-y-4 p-5 rounded-xl bg-slate-900/50 border border-slate-800/80">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-amber-400/10 text-amber-400 shrink-0">
                      <Key className="w-4 h-4" />
                    </div>
                    <div className="text-xs space-y-1">
                      <span className="font-semibold text-slate-200">Zero-configuration Instant Access</span>
                      <p className="text-slate-400 leading-relaxed">
                        Connect immediately without registering an OAuth application. Simply generate a classic or fine-grained token on GitHub with <code className="text-amber-300 font-mono">repo</code> and <code className="text-amber-300 font-mono">gist</code> scopes.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-300">
                      GitHub Personal Access Token
                    </label>
                    <input
                      type="password"
                      value={patInput}
                      onChange={(e) => setPatInput(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_..."
                      className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo,read:user,gist&description=MP.R+Audio+Studio"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 underline font-medium"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Generate token on GitHub (pre-filled scopes)</span>
                    </a>

                    <button
                      onClick={handleConnectPAT}
                      disabled={isAuthenticating || !patInput.trim()}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm shadow-amber-400/20 transition-all cursor-pointer"
                    >
                      {isAuthenticating ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <>
                          <Key className="w-3.5 h-3.5" />
                          <span>Connect with Token</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Tab 2: OAuth 2.0 Flow */
                <div className="space-y-4 p-5 rounded-xl bg-slate-900/50 border border-slate-800/80">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-amber-400/10 text-amber-400 shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="text-xs space-y-1">
                      <span className="font-semibold text-slate-200">GitHub OAuth 2.0 Application</span>
                      <p className="text-slate-400 leading-relaxed">
                        To enable 1-click popup sign-in, register an OAuth application under your GitHub Developer Settings and add the runtime callback URL below:
                      </p>
                    </div>
                  </div>

                  {/* Callback URL reference */}
                  <div className="space-y-2 text-xs bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                    <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                      <span className="font-mono uppercase font-semibold text-slate-300">Required Callback URL:</span>
                      <a
                        href="https://github.com/settings/developers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-amber-400 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>GitHub Developer Settings</span>
                      </a>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300">
                      <span className="truncate">{DEV_CALLBACK_URL}</span>
                      <button
                        onClick={() => copyToClipboard(DEV_CALLBACK_URL, 'dev')}
                        className="p-1 text-slate-400 hover:text-white"
                        title="Copy Development Callback URL"
                      >
                        {copiedUrl === 'dev' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300">
                      <span className="truncate">{SHARED_CALLBACK_URL}</span>
                      <button
                        onClick={() => copyToClipboard(SHARED_CALLBACK_URL, 'shared')}
                        className="p-1 text-slate-400 hover:text-white"
                        title="Copy Shared Callback URL"
                      >
                        {copiedUrl === 'shared' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-300">
                      OAuth Client ID (Optional if set in environment)
                    </label>
                    <input
                      type="text"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      placeholder="e.g. Ov23li..."
                      className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleConnectOAuth}
                      disabled={isAuthenticating}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm shadow-amber-400/20 transition-all cursor-pointer"
                    >
                      {isAuthenticating ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Waiting for Authorization...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                          </svg>
                          <span>Connect with GitHub (Popup)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Authenticated View: Profile Card + Tabs */
            <div className="space-y-6">
              {/* Profile Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-3">
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    className="w-12 h-12 rounded-xl border border-amber-400/30 object-cover"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{user.name || user.login}</span>
                      <a
                        href={user.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-amber-400 hover:underline inline-flex items-center gap-0.5"
                      >
                        @{user.login}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span>{user.public_repos} Repositories</span>
                      <span>·</span>
                      <span>{user.followers} Followers</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (token) {
                        loadRepos(token);
                        loadGists(token);
                      }
                    }}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="Refresh data"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-300 hover:text-red-200 text-xs transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>

              {/* Sub-Navigation Tabs */}
              <div className="flex border-b border-slate-800 gap-6 text-xs font-semibold">
                <button
                  onClick={() => setActiveTab('repos')}
                  className={`pb-3 flex items-center gap-2 transition-colors relative ${
                    activeTab === 'repos' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FolderGit2 className="w-4 h-4" />
                  <span>Audio Repositories</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                    {repos.length}
                  </span>
                  {activeTab === 'repos' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('backup')}
                  className={`pb-3 flex items-center gap-2 transition-colors relative ${
                    activeTab === 'backup' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>Playlists Cloud Backup (Gists)</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                    {gists.length}
                  </span>
                  {activeTab === 'backup' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('settings')}
                  className={`pb-3 flex items-center gap-2 transition-colors relative ${
                    activeTab === 'settings' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sliders className="w-4 h-4" />
                  <span>Connection Details</span>
                  {activeTab === 'settings' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />
                  )}
                </button>
              </div>

              {/* Tab 1: Audio Repositories Explorer */}
              {activeTab === 'repos' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                  {/* Repo List Column */}
                  <div className="md:col-span-5 space-y-3">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={repoSearch}
                        onChange={(e) => setRepoSearch(e.target.value)}
                        placeholder="Search your repositories..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div className="max-h-[360px] overflow-y-auto space-y-1.5 pr-1">
                      {isLoadingRepos ? (
                        <div className="py-8 text-center text-xs text-slate-500">
                          <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-amber-400" />
                          <span>Loading repositories...</span>
                        </div>
                      ) : filteredRepos.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-500">
                          No repositories found.
                        </div>
                      ) : (
                        filteredRepos.map((repo) => {
                          const isSelected = selectedRepo?.id === repo.id;
                          return (
                            <button
                              key={repo.id}
                              onClick={() => handleSelectRepo(repo)}
                              className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-400/10 border-amber-400/40 text-amber-200'
                                  : 'bg-slate-900/40 border-slate-800 hover:bg-slate-800/50 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-xs text-white truncate max-w-[200px]">
                                  {repo.name}
                                </span>
                                {repo.private && (
                                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                                    private
                                  </span>
                                )}
                              </div>
                              {repo.description && (
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {repo.description}
                                </p>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Audio Files in Selected Repo */}
                  <div className="md:col-span-7 bg-slate-900/30 border border-slate-800/80 rounded-xl p-4 flex flex-col">
                    {selectedRepo ? (
                      <div className="space-y-3 flex-1 flex flex-col">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                          <div>
                            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                              <FolderGit2 className="w-3.5 h-3.5 text-amber-400" />
                              <span>{selectedRepo.full_name}</span>
                            </h4>
                            <span className="text-[11px] text-slate-400">
                              Branch: {selectedRepo.default_branch}
                            </span>
                          </div>
                          <button
                            onClick={() => handleSelectRepo(selectedRepo)}
                            disabled={isScanningRepo}
                            className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300"
                          >
                            <RefreshCw className={`w-3 h-3 ${isScanningRepo ? 'animate-spin' : ''}`} />
                            <span>Re-scan</span>
                          </button>
                        </div>

                        {importProgressText && (
                          <div className="p-2.5 rounded-lg bg-amber-400/10 border border-amber-400/20 text-xs text-amber-300 flex items-center gap-2">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span>{importProgressText}</span>
                          </div>
                        )}

                        <div className="flex-1 max-h-[300px] overflow-y-auto space-y-1.5">
                          {isScanningRepo ? (
                            <div className="py-12 text-center text-xs text-slate-500">
                              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-400" />
                              <span>Scanning repository for audio files (.mp3, .wav, .flac, .ogg, .m4a)...</span>
                            </div>
                          ) : audioFiles.length === 0 ? (
                            <div className="py-12 text-center text-xs text-slate-500 space-y-1">
                              <Music className="w-6 h-6 mx-auto mb-1 text-slate-600" />
                              <p className="font-medium text-slate-400">No audio files detected in this repository</p>
                              <p className="text-[11px] text-slate-500">
                                Add .mp3, .wav, or .m4a files to this repo, or select another repository from the left.
                              </p>
                            </div>
                          ) : (
                            audioFiles.map((file) => {
                              const isThisImporting = importingFileSha === file.sha;
                              return (
                                <div
                                  key={file.sha}
                                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 pr-3">
                                    <div className="w-7 h-7 rounded bg-amber-400/10 text-amber-400 flex items-center justify-center shrink-0">
                                      <Music className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-white truncate">{file.name}</div>
                                      <div className="text-[10px] text-slate-500 truncate font-mono">
                                        {file.path} · {(file.size / (1024 * 1024)).toFixed(2)} MB
                                      </div>
                                    </div>
                                  </div>

                                  <button
                                    onClick={() => handleImportAudioFile(file)}
                                    disabled={Boolean(importingFileSha)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 text-xs font-semibold shrink-0 transition-all cursor-pointer"
                                  >
                                    {isThisImporting ? (
                                      <>
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                        <span>Importing...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Download className="w-3 h-3" />
                                        <span>Import</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-xs text-slate-500">
                        <FolderGit2 className="w-8 h-8 text-slate-600 mb-2" />
                        <span className="font-semibold text-slate-400">Select a repository on the left</span>
                        <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                          MP.R will scan its contents for tracks, music samples, and audio assets to import straight into your player.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: Playlists Cloud Backup via Gist */}
              {activeTab === 'backup' && (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <CloudUpload className="w-4 h-4 text-amber-400" />
                        <span>Cloud Playlist & Metadata Backup</span>
                      </h4>
                      <p className="text-xs text-slate-400">
                        Current Studio: {playlists.length} custom playlists and {tracks.length} active tracks cataloged.
                      </p>
                    </div>

                    <button
                      onClick={handleBackupPlaylists}
                      disabled={isBackingUp}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-lg shadow-sm shadow-amber-400/20 transition-all cursor-pointer shrink-0"
                    >
                      {isBackingUp ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Creating Backup Gist...</span>
                        </>
                      ) : (
                        <>
                          <CloudUpload className="w-3.5 h-3.5" />
                          <span>Backup Now to GitHub Gist</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">Existing Backups on GitHub</span>
                      <button
                        onClick={() => token && loadGists(token)}
                        className="text-xs text-amber-400 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${isLoadingGists ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                      </button>
                    </div>

                    {isLoadingGists ? (
                      <div className="py-8 text-center text-xs text-slate-500">
                        <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-amber-400" />
                        <span>Checking Gists for MP.R backups...</span>
                      </div>
                    ) : gists.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500 bg-slate-900/30 rounded-xl border border-slate-800">
                        No previous MP.R backups found in your GitHub Gists. Click "Backup Now" above to save your playlists.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {gists.map((g) => (
                          <div
                            key={g.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors"
                          >
                            <div className="min-w-0 pr-3">
                              <div className="text-xs font-semibold text-white truncate">{g.description}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                Updated: {new Date(g.updated_at).toLocaleString()}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <a
                                href={g.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                                title="Open Gist on GitHub"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <button
                                onClick={() => handleRestoreBackup(g.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                              >
                                <RotateCcw className="w-3 h-3 text-amber-400" />
                                <span>Restore</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Connection Details */}
              {activeTab === 'settings' && (
                <div className="space-y-4 text-xs text-slate-300">
                  <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
                    <span className="font-semibold text-white block">OAuth 2.0 Provider Configuration</span>
                    <p className="text-slate-400 leading-relaxed text-[11px]">
                      If configuring a dedicated GitHub OAuth App under your organization or personal account, use these exact callback URLs in the GitHub Developer settings:
                    </p>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded bg-slate-950 border border-slate-800 font-mono text-[11px]">
                        <span className="truncate">{DEV_CALLBACK_URL}</span>
                        <button
                          onClick={() => copyToClipboard(DEV_CALLBACK_URL, 'dev')}
                          className="p-1 text-slate-400 hover:text-white"
                          title="Copy Development URL"
                        >
                          {copiedUrl === 'dev' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded bg-slate-950 border border-slate-800 font-mono text-[11px]">
                        <span className="truncate">{SHARED_CALLBACK_URL}</span>
                        <button
                          onClick={() => copyToClipboard(SHARED_CALLBACK_URL, 'shared')}
                          className="p-1 text-slate-400 hover:text-white"
                          title="Copy Shared URL"
                        >
                          {copiedUrl === 'shared' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                    <div>
                      <span className="font-semibold text-white block">Connected Account</span>
                      <span className="text-[11px] text-slate-400">Signed in as {user.login} ({user.id})</span>
                    </div>
                    <button
                      onClick={handleDisconnect}
                      className="px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-300 text-xs transition-colors"
                    >
                      Disconnect Account
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
