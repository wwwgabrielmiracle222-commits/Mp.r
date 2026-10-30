import { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Square,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  Headphones,
  Sliders,
  Flag,
  Scissors,
  Download,
  PlusCircle,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { audioEngine } from '../services/audioEngine';
import { AudioRecording, AudioTrack } from '../types/audio';
import { extractWaveformPeaks } from '../services/audioSynthesizer';

interface RecorderViewProps {
  recordings: AudioRecording[];
  onAddRecordingToLibrary: (track: AudioTrack) => void;
  onDeleteRecording: (id: string) => void;
}

export function RecorderView({
  recordings,
  onAddRecordingToLibrary,
  onDeleteRecording,
}: RecorderViewProps) {
  // Recorder states
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [monitorMic, setMonitorMic] = useState(false);
  const [micGain, setMicGain] = useState(1.2);
  const [activeRecording, setActiveRecording] = useState<AudioRecording | null>(
    recordings[0] || null
  );

  // Meter states
  const [meterLevels, setMeterLevels] = useState({ rmsDb: -60, peakDb: -60, clipping: false });

  // Post-recording editing
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [category, setCategory] = useState<'Voice Memo' | 'Vocal Take' | 'Field Audio' | 'Podcast' | 'Radio Capture'>('Vocal Take');
  const [takeTitle, setTakeTitle] = useState('');
  const [takeNotes, setTakeNotes] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Waveform canvas & audio element for preview
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const meterAnimRef = useRef<number | null>(null);

  useEffect(() => {
    // Meter polling while recording
    if (isRecording && !isPaused) {
      const updateMeter = () => {
        const levels = audioEngine.getLiveMeterLevels();
        setMeterLevels(levels);
        meterAnimRef.current = requestAnimationFrame(updateMeter);
      };
      meterAnimRef.current = requestAnimationFrame(updateMeter);
    } else {
      setMeterLevels({ rmsDb: -60, peakDb: -60, clipping: false });
      if (meterAnimRef.current) cancelAnimationFrame(meterAnimRef.current);
    }

    return () => {
      if (meterAnimRef.current) cancelAnimationFrame(meterAnimRef.current);
    };
  }, [isRecording, isPaused]);

  useEffect(() => {
    audioEngine.onRecordingTimeUpdate = (secs) => {
      setRecordingSeconds(secs);
    };

    audioEngine.onRecordingComplete = (rec) => {
      setActiveRecording(rec);
      setTrimStart(0);
      setTrimEnd(rec.duration);
      setTakeTitle(rec.title);
      setCategory(rec.category);
      setTakeNotes(rec.notes);
      setIsRecording(false);
      setIsPaused(false);
    };
  }, []);

  const handleStartRecording = async () => {
    try {
      await audioEngine.startRecording(monitorMic, micGain);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingSeconds(0);
    } catch (err) {
      alert('Could not access microphone. Please grant microphone permission in your browser.');
    }
  };

  const handlePauseResume = () => {
    if (isPaused) {
      audioEngine.resumeRecording();
      setIsPaused(false);
    } else {
      audioEngine.pauseRecording();
      setIsPaused(true);
    }
  };

  const handleStopRecording = () => {
    audioEngine.stopRecording();
    setIsRecording(false);
    setIsPaused(false);
  };

  const handleAddMarker = () => {
    if (isRecording) {
      const label = `Mark ${formatTime(recordingSeconds)}`;
      audioEngine.addRecordingMarker(label);
    }
  };

  const handleToggleMonitoring = () => {
    const nextVal = !monitorMic;
    setMonitorMic(nextVal);
    audioEngine.setRecordingMonitoring(nextVal);
  };

  const handleGainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setMicGain(val);
    audioEngine.setMicGain(val);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00.0';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const handlePlayPreview = () => {
    if (!previewAudioRef.current || !activeRecording) return;
    if (isPreviewPlaying) {
      previewAudioRef.current.pause();
      setIsPreviewPlaying(false);
    } else {
      previewAudioRef.current.currentTime = trimStart;
      previewAudioRef.current.play();
      setIsPreviewPlaying(true);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!activeRecording) return;

    let finalBuffer = activeRecording.audioBuffer;
    let peaks: number[] = [];

    if (activeRecording.audioBuffer && (trimStart > 0 || trimEnd < activeRecording.duration)) {
      const trimmed = await audioEngine.createTrimmedClip(
        activeRecording.audioBuffer,
        trimStart,
        trimEnd
      );
      finalBuffer = trimmed.buffer;
      peaks = trimmed.peaks;
    } else if (activeRecording.audioBuffer) {
      peaks = extractWaveformPeaks(activeRecording.audioBuffer, 80);
    }

    const duration = trimEnd - trimStart;

    const newTrack: AudioTrack = {
      id: `rec_track_${Date.now()}`,
      title: takeTitle || activeRecording.title,
      artist: 'Live Recording',
      album: category,
      duration: Math.max(0.1, duration),
      genre: category,
      audioBuffer: finalBuffer,
      url: activeRecording.url,
      blob: activeRecording.blob,
      sourceType: 'recording',
      waveformPeaks: peaks,
      notes: takeNotes,
    };

    onAddRecordingToLibrary(newTrack);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleDownloadWav = () => {
    if (!activeRecording) return;
    const a = document.createElement('a');
    a.href = activeRecording.url;
    a.download = `${(takeTitle || activeRecording.title).replace(/\s+/g, '_')}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // VU meter percentage calculation (-60 to 0 dB)
  const meterPercent = Math.max(0, Math.min(100, ((meterLevels.peakDb + 60) / 60) * 100));

  return (
    <div className="space-y-6">
      {/* Top Recording Deck */}
      <div className="p-6 rounded-xl bg-[#0D121D] border border-slate-800">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-slate-800">
          {/* Status & Big Timecode */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <span>Studio Recorder</span>
              <span aria-hidden="true">·</span>
              <span className={isRecording ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
                {isRecording ? (isPaused ? 'Recording Paused' : 'Live Capture') : 'Standby'}
              </span>
            </div>
            <div className="text-4xl sm:text-5xl font-mono tabular-nums font-bold tracking-tight text-white">
              {formatTime(recordingSeconds)}
            </div>
          </div>

          {/* Record Control Buttons */}
          <div className="flex items-center gap-3">
            {!isRecording ? (
              <button
                onClick={handleStartRecording}
                className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-lg shadow-rose-600/25 transition-transform active:scale-95"
              >
                <Mic className="w-5 h-5 fill-current" />
                <span>Start Recording</span>
              </button>
            ) : (
              <>
                <button
                  onClick={handlePauseResume}
                  className="p-3 text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors"
                  title={isPaused ? 'Resume' : 'Pause'}
                >
                  {isPaused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5" />}
                </button>

                <button
                  onClick={handleAddMarker}
                  className="flex items-center gap-1.5 px-3 py-3 text-xs font-semibold text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 rounded-xl border border-amber-500/30 transition-colors"
                  title="Drop Chapter Marker"
                >
                  <Flag className="w-4 h-4" />
                  <span>Marker</span>
                </button>

                <button
                  onClick={handleStopRecording}
                  className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 shadow-sm transition-colors"
                >
                  <Square className="w-4 h-4 fill-current text-rose-500" />
                  <span>Stop & Edit</span>
                </button>
              </>
            )}
          </div>

          {/* Mic Input Settings & Level Monitor */}
          <div className="flex flex-col gap-2 w-full md:w-64">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
                <span>Input Gain ({micGain.toFixed(1)}x)</span>
              </span>
              <button
                onClick={handleToggleMonitoring}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  monitorMic
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                }`}
                title="Hear mic through headphones"
              >
                <Headphones className="w-3 h-3" />
                <span>{monitorMic ? 'Monitor ON' : 'Monitor OFF'}</span>
              </button>
            </div>

            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.1"
              value={micGain}
              onChange={handleGainChange}
              className="w-full h-1.5 bg-slate-800 accent-amber-400 rounded-lg cursor-pointer"
            />

            {/* Stereo VU Meter */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-500">
                <span>VU METER (dB)</span>
                <span className={meterLevels.clipping ? 'text-rose-500 font-bold' : ''}>
                  {meterLevels.clipping ? 'CLIP' : `${meterLevels.peakDb.toFixed(1)} dB`}
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-900 rounded-full border border-slate-800 overflow-hidden flex">
                <div
                  className={`h-full transition-all duration-75 ${
                    meterLevels.clipping
                      ? 'bg-rose-500'
                      : meterPercent > 80
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                  style={{ width: `${meterPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Post-Recording Trimmer & Metadata Editor */}
      {activeRecording ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Waveform Trimmer (7 Cols) */}
          <div className="lg:col-span-7 p-5 rounded-xl bg-[#0D121D] border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Waveform Trimmer</h3>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Take Duration:</span>
                  <span className="font-mono tabular-nums text-slate-300">
                    {formatTime(activeRecording.duration)}
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>Trimmed:</span>
                  <span className="font-mono tabular-nums text-amber-400">
                    {formatTime(Math.max(0, trimEnd - trimStart))}
                  </span>
                </div>
              </div>

              {/* Audition Preview Button */}
              <button
                onClick={handlePlayPreview}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
              >
                {isPreviewPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isPreviewPlaying ? 'Pause Preview' : 'Audition'}</span>
              </button>
            </div>

            {/* Hidden Preview Audio Node */}
            <audio
              ref={previewAudioRef}
              src={activeRecording.url}
              onTimeUpdate={() => {
                if (previewAudioRef.current) {
                  setPreviewTime(previewAudioRef.current.currentTime);
                  if (previewAudioRef.current.currentTime >= trimEnd) {
                    previewAudioRef.current.pause();
                    setIsPreviewPlaying(false);
                  }
                }
              }}
              onEnded={() => setIsPreviewPlaying(false)}
            />

            {/* Interactive Visual Waveform & Trim Handles */}
            <div className="space-y-3">
              <div className="relative h-20 w-full bg-slate-900 rounded-lg border border-slate-800 p-2 flex items-center overflow-hidden">
                {/* Waveform peaks representation */}
                <div className="w-full h-full flex items-center gap-[2px]">
                  {Array.from({ length: 64 }).map((_, idx) => {
                    const ratio = idx / 64;
                    const isTrimmedRegion =
                      ratio >= trimStart / activeRecording.duration &&
                      ratio <= trimEnd / activeRecording.duration;
                    const mockHeight = 20 + Math.sin(idx * 0.4) * 35 + ((idx * 17) % 35);
                    return (
                      <div
                        key={idx}
                        className={`flex-1 rounded-full transition-colors ${
                          isTrimmedRegion ? 'bg-amber-400' : 'bg-slate-800'
                        }`}
                        style={{ height: `${Math.min(100, Math.max(15, mockHeight))}%` }}
                      />
                    );
                  })}
                </div>

                {/* Markers Overlay */}
                {activeRecording.markers.map((mark) => {
                  const leftRatio = (mark.time / activeRecording.duration) * 100;
                  return (
                    <div
                      key={mark.id}
                      className="absolute top-0 bottom-0 w-[2px] bg-cyan-400 pointer-events-none"
                      style={{ left: `${leftRatio}%` }}
                      title={`${mark.label} (${formatTime(mark.time)})`}
                    >
                      <span className="absolute -top-1 -left-2 text-[9px] bg-cyan-500 text-slate-950 font-bold px-1 rounded">
                        M
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Trim Range Sliders */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span className="flex items-center gap-1">
                      <Scissors className="w-3 h-3 text-amber-400" />
                      <span>Start Point</span>
                    </span>
                    <span className="font-mono tabular-nums text-slate-300">
                      {formatTime(trimStart)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={trimEnd}
                    step="0.05"
                    value={trimStart}
                    onChange={(e) => setTrimStart(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 accent-amber-400 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span className="flex items-center gap-1">
                      <Scissors className="w-3 h-3 text-amber-400" />
                      <span>End Point</span>
                    </span>
                    <span className="font-mono tabular-nums text-slate-300">
                      {formatTime(trimEnd)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={trimStart}
                    max={activeRecording.duration}
                    step="0.05"
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 accent-amber-400 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Markers List */}
              {activeRecording.markers.length > 0 && (
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-xs text-slate-400 mb-1.5 font-medium">Dropped Markers:</div>
                  <div className="flex flex-wrap gap-2">
                    {activeRecording.markers.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setTrimStart(m.time);
                          if (previewAudioRef.current) previewAudioRef.current.currentTime = m.time;
                        }}
                        className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white border border-slate-700"
                      >
                        <Flag className="w-3 h-3 text-cyan-400" />
                        <span>{m.label} ({formatTime(m.time)})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Metadata & Destination (5 Cols) */}
          <div className="lg:col-span-5 p-5 rounded-xl bg-[#0D121D] border border-slate-800 space-y-4">
            <h3 className="text-base font-semibold text-white">Save & Export Take</h3>

            {/* Title Input */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Take Name / Title
              </label>
              <input
                type="text"
                value={takeTitle}
                onChange={(e) => setTakeTitle(e.target.value)}
                placeholder="e.g. Lead Vocal Chorus Take 2"
                className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Category
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(['Vocal Take', 'Voice Memo', 'Podcast', 'Field Audio'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      category === cat
                        ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Notes & Comments
              </label>
              <textarea
                value={takeNotes}
                onChange={(e) => setTakeNotes(e.target.value)}
                placeholder="Recording setup, microphone used, lyrics reference..."
                rows={2}
                className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-amber-400 resize-none font-mono"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              <button
                onClick={handleSaveToLibrary}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors"
              >
                {saveSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-800" />
                    <span>Added to Player Playlist!</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Add to Media Player Playlist</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadWav}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Audio File</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center rounded-xl bg-[#0D121D] border border-slate-800 text-slate-500 text-xs">
          Hit "Start Recording" above to capture audio through your microphone, or view previously saved takes below.
        </div>
      )}

      {/* Session Recording Takes History */}
      {recordings.length > 0 && (
        <div className="p-5 rounded-xl bg-[#0D121D] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Session Takes History</h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {recordings.length} {recordings.length === 1 ? 'take' : 'takes'} recorded
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recordings.map((rec) => (
              <div
                key={rec.id}
                onClick={() => {
                  setActiveRecording(rec);
                  setTrimStart(0);
                  setTrimEnd(rec.duration);
                  setTakeTitle(rec.title);
                  setCategory(rec.category);
                  setTakeNotes(rec.notes);
                }}
                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                  activeRecording?.id === rec.id
                    ? 'bg-amber-400/10 border-amber-400/50'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-semibold text-white truncate">{rec.title}</h4>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {formatTime(rec.duration)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{rec.category}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteRecording(rec.id);
                    }}
                    className="p-1 hover:text-rose-400 transition-colors"
                    title="Delete take"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
