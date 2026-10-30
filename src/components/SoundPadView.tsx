import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, Music, Clock } from 'lucide-react';
import { audioEngine } from '../services/audioEngine';
import { playSoundPad } from '../services/audioSynthesizer';

interface PadConfig {
  id: number;
  name: string;
  key: string;
  color: string;
  category: 'Kick' | 'Snare' | 'Hat' | 'Bass' | 'Perc' | 'Melody';
}

const PADS: PadConfig[] = [
  { id: 0, name: 'Kick Drum', key: '1 / Q', color: 'from-amber-500/30 to-amber-600/10 border-amber-500/40 text-amber-300', category: 'Kick' },
  { id: 1, name: 'Snare Snip', key: '2 / W', color: 'from-orange-500/30 to-orange-600/10 border-orange-500/40 text-orange-300', category: 'Snare' },
  { id: 2, name: 'Closed Hat', key: '3 / E', color: 'from-yellow-500/30 to-yellow-600/10 border-yellow-500/40 text-yellow-300', category: 'Hat' },
  { id: 3, name: 'Open Hat', key: '4 / R', color: 'from-cyan-500/30 to-cyan-600/10 border-cyan-500/40 text-cyan-300', category: 'Hat' },
  { id: 4, name: '808 Sub', key: '5 / A', color: 'from-red-500/30 to-red-600/10 border-red-500/40 text-red-300', category: 'Bass' },
  { id: 5, name: 'Studio Clap', key: '6 / S', color: 'from-emerald-500/30 to-emerald-600/10 border-emerald-500/40 text-emerald-300', category: 'Perc' },
  { id: 6, name: 'Low Tom', key: '7 / D', color: 'from-blue-500/30 to-blue-600/10 border-blue-500/40 text-blue-300', category: 'Perc' },
  { id: 7, name: 'Synth Stab', key: '8 / F', color: 'from-purple-500/30 to-purple-600/10 border-purple-500/40 text-purple-300', category: 'Melody' },
];

export function SoundPadView() {
  const [activePad, setActivePad] = useState<number | null>(null);
  const [bpm, setBpm] = useState(120);
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);
  const [metronomeBeat, setMetronomeBeat] = useState(0);

  const metroTimerRef = useRef<number | null>(null);
  const tapTimesRef = useRef<number[]>([]);

  const triggerPad = (padIndex: number) => {
    const ctx = audioEngine.initContext();
    const destination = audioEngine.getMasterInputNode() || ctx.destination;
    playSoundPad(ctx, padIndex, destination);

    setActivePad(padIndex);
    setTimeout(() => {
      setActivePad((curr) => (curr === padIndex ? null : curr));
    }, 120);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const keyMap: Record<string, number> = {
      '1': 0, 'q': 0, 'Q': 0,
      '2': 1, 'w': 1, 'W': 1,
      '3': 2, 'e': 2, 'E': 2,
      '4': 3, 'r': 3, 'R': 3,
      '5': 4, 'a': 4, 'A': 4,
      '6': 5, 's': 5, 'S': 5,
      '7': 6, 'd': 6, 'D': 6,
      '8': 7, 'f': 7, 'F': 7,
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      const pad = keyMap[e.key];
      if (pad !== undefined) {
        triggerPad(pad);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Metronome loop
  useEffect(() => {
    if (isMetronomeActive) {
      const intervalMs = (60 / bpm) * 1000;
      let beat = 0;

      metroTimerRef.current = window.setInterval(() => {
        beat = (beat + 1) % 4;
        setMetronomeBeat(beat);

        // Click sound
        const ctx = audioEngine.initContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(beat === 0 ? 1200 : 800, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.04);
      }, intervalMs);
    } else {
      if (metroTimerRef.current) clearInterval(metroTimerRef.current);
      setMetronomeBeat(0);
    }

    return () => {
      if (metroTimerRef.current) clearInterval(metroTimerRef.current);
    };
  }, [isMetronomeActive, bpm]);

  const handleTapTempo = () => {
    const now = performance.now();
    const taps = tapTimesRef.current;
    taps.push(now);

    // Keep only last 4 taps within 2.5s
    if (taps.length > 4) taps.shift();
    if (taps.length >= 2) {
      const intervals = [];
      for (let i = 1; i < taps.length; i++) {
        intervals.push(taps[i] - taps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgInterval > 200 && avgInterval < 2000) {
        const calculatedBpm = Math.round(60000 / avgInterval);
        setBpm(Math.max(40, Math.min(240, calculatedBpm)));
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar with Metronome & Tempo */}
      <div className="p-6 rounded-xl bg-[#0D121D] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <span>Hardware Synthesis</span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-400 font-medium">8-Pad Soundboard</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">MP.R Drum & Sound Pads</h2>
          <p className="text-xs text-slate-400">
            Real-time Web Audio percussive synthesizers. Play with mouse, touch, or keyboard hotkeys (1-8 / Q-F).
          </p>
        </div>

        {/* Metronome & BPM Controls */}
        <div className="flex items-center gap-3 bg-slate-900 p-2 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 px-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-300 font-medium">BPM:</span>
            <input
              type="number"
              min="40"
              max="240"
              value={bpm}
              onChange={(e) => setBpm(parseInt(e.target.value) || 120)}
              className="w-16 px-2 py-1 text-xs font-mono font-bold tabular-nums text-white bg-slate-800 border border-slate-700 rounded-md text-center focus:outline-none focus:border-amber-400"
            />
          </div>

          <button
            onClick={handleTapTempo}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
          >
            Tap Tempo
          </button>

          <button
            onClick={() => setIsMetronomeActive(!isMetronomeActive)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              isMetronomeActive
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
            }`}
          >
            {isMetronomeActive ? (
              <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping" />
            ) : null}
            <span>{isMetronomeActive ? `Beat ${metronomeBeat + 1}` : 'Metronome'}</span>
          </button>
        </div>
      </div>

      {/* 8 Drum Pads Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {PADS.map((pad) => {
          const isActive = activePad === pad.id;
          return (
            <button
              key={pad.id}
              onClick={() => triggerPad(pad.id)}
              className={`h-36 sm:h-44 rounded-xl border p-4 flex flex-col justify-between text-left transition-all select-none active:scale-95 ${
                isActive
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-xl shadow-amber-400/20 scale-[0.98]'
                  : `bg-gradient-to-b ${pad.color} bg-[#0D121D] hover:border-slate-600`
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                    isActive ? 'bg-slate-950/20 text-slate-950 font-bold' : 'bg-slate-900/60 text-slate-400 border border-slate-800'
                  }`}
                >
                  {pad.key}
                </span>
                <span
                  className={`text-[10px] font-medium uppercase tracking-wider ${
                    isActive ? 'text-slate-950' : 'text-slate-500'
                  }`}
                >
                  {pad.category}
                </span>
              </div>

              <div>
                <h3
                  className={`text-base font-bold tracking-tight ${
                    isActive ? 'text-slate-950' : 'text-white'
                  }`}
                >
                  {pad.name}
                </h3>
                <span
                  className={`text-[11px] ${
                    isActive ? 'text-slate-900' : 'text-slate-400'
                  }`}
                >
                  Trigger Sample
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
