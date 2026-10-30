import { useRef } from 'react';
import { Radio, Music2, FolderOpen, Smartphone, HardDrive, Download } from 'lucide-react';
import { openAudioFileManager } from '../services/fileManager';

export type ActiveTab = 'player' | 'library' | 'downloads' | 'recorder' | 'equalizer' | 'radio' | 'pads';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onAudioUpload: (files: FileList | File[]) => void;
  isRecording: boolean;
  phoneTracksCount?: number;
  onOpenGitHub?: () => void;
  isGitHubConnected?: boolean;
  githubUserLogin?: string;
}

export function Header({
  activeTab,
  onTabChange,
  onAudioUpload,
  isRecording,
  phoneTracksCount = 0,
  onOpenGitHub,
  isGitHubConnected = false,
  githubUserLogin,
}: HeaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleLaunchFileManager = async () => {
    const files = await openAudioFileManager({ multiple: true });
    if (files.length > 0) {
      onAudioUpload(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onAudioUpload(files);
      e.target.value = '';
    }
  };

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0B0F18]/90 backdrop-blur-md border-b border-slate-800/80">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="#player"
          onClick={(e) => {
            e.preventDefault();
            onTabChange('player');
          }}
          className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 group"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-sm shadow-amber-500/20">
            <Music2 className="w-4 h-4 fill-current stroke-none" />
          </div>
          <span>MP<span className="text-amber-400">.</span>R</span>
        </a>
      </div>

      {/* Zone 2: 4–5 clean single-line text navigation links */}
      <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
        <button
          onClick={() => onTabChange('player')}
          className={`transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'player'
              ? 'text-white font-semibold'
              : 'hover:text-slate-200'
          }`}
        >
          Player
        </button>
        <button
          onClick={() => onTabChange('library')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'library'
              ? 'text-white font-semibold'
              : 'hover:text-slate-200'
          }`}
        >
          <span>Music Library</span>
        </button>
        <button
          onClick={() => onTabChange('downloads')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'downloads'
              ? 'text-white font-semibold'
              : 'hover:text-slate-200'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
          <span>Downloads & Local</span>
          {phoneTracksCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-400/20 text-cyan-300">
              {phoneTracksCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange('recorder')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'recorder'
              ? 'text-white font-semibold'
              : 'hover:text-slate-200'
          }`}
        >
          {isRecording && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}
          <span>Recorder</span>
        </button>
        <button
          onClick={() => onTabChange('equalizer')}
          className={`transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'equalizer'
              ? 'text-white font-semibold'
              : 'hover:text-slate-200'
          }`}
        >
          Equalizer & FX
        </button>
        <button
          onClick={() => onTabChange('radio')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'radio'
              ? 'text-white font-semibold'
              : 'hover:text-slate-200'
          }`}
        >
          <Radio className="w-3.5 h-3.5 text-amber-400/80" />
          <span>Radio Tuner</span>
        </button>
      </nav>

      {/* Zone 3: Actions - File Manager & GitHub */}
      <div className="flex items-center gap-2 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="audio/*,.mp3,.m4a,.wav,.aac,.flac,.ogg,.opus"
          className="hidden"
          onChange={handleFileSelect}
        />
        {onOpenGitHub && (
          <button
            onClick={onOpenGitHub}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 rounded-lg shadow-sm transition-all active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
            title={isGitHubConnected ? `Connected to GitHub as @${githubUserLogin || 'user'}` : 'Get access to GitHub (audio repos & backup)'}
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span>GitHub</span>
            {isGitHubConnected ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            ) : (
              <span className="text-[10px] text-amber-400/80">Connect</span>
            )}
          </button>
        )}
        <button
          onClick={handleLaunchFileManager}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm shadow-amber-400/20 transition-all active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
          title="Browse and add songs from your device's File Manager"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Add from File Manager</span>
        </button>
      </div>
    </header>
  );
}
