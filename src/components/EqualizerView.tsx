import { useState, useId } from 'react';
import { Sliders, RotateCcw, Sparkles, Volume2, Waves } from 'lucide-react';
import { audioEngine, EQ_FREQUENCIES } from '../services/audioEngine';
import { EqPreset } from '../types/audio';

const PRESETS: EqPreset[] = [
  { name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Bass Booster', gains: [7, 6, 5, 2, 0, 0, 0, 0, 0, 0] },
  { name: 'Treble Booster', gains: [0, 0, 0, 0, 0, 1, 3, 5, 7, 8] },
  { name: 'Vocal Clarity', gains: [-2, -1, 0, 3, 5, 5, 3, 1, 0, -1] },
  { name: 'Club / Dance', gains: [6, 5, 2, 0, 0, 2, 4, 5, 4, 0] },
  { name: 'Electronic', gains: [5, 4, 1, 0, -2, 2, 1, 3, 5, 4] },
  { name: 'Acoustic', gains: [3, 2, 1, 1, 2, 2, 3, 3, 4, 3] },
  { name: 'Rock', gains: [5, 3, -1, -2, 1, 2, 4, 5, 5, 4] },
  { name: 'Podcast / Voice', gains: [-4, -2, 1, 4, 4, 2, 1, 0, -2, -4] },
];

export function EqualizerView() {
  const [activePreset, setActivePreset] = useState('Flat');
  const [bandGains, setBandGains] = useState<number[]>(new Array(10).fill(0));
  const [reverb, setReverb] = useState(0);
  const [pan, setPan] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [compressor, setCompressor] = useState(true);

  const handleBandChange = (index: number, val: number) => {
    const updated = [...bandGains];
    updated[index] = val;
    setBandGains(updated);
    setActivePreset('Custom');
    audioEngine.setEqBand(index, val);
  };

  const applyPreset = (preset: EqPreset) => {
    setActivePreset(preset.name);
    setBandGains([...preset.gains]);
    audioEngine.setAllEqBands(preset.gains);
  };

  const handleReset = () => {
    applyPreset(PRESETS[0]); // Flat
  };

  const handleReverbChange = (val: number) => {
    setReverb(val);
    audioEngine.setReverb(val);
  };

  const handlePanChange = (val: number) => {
    setPan(val);
    audioEngine.setPan(val);
  };

  const handleSpeedChange = (val: number) => {
    setSpeed(val);
    audioEngine.setSpeed(val);
  };

  const toggleCompressor = () => {
    const nextVal = !compressor;
    setCompressor(nextVal);
    audioEngine.toggleCompressor(nextVal);
  };

  const formatFreq = (freq: number) => {
    return freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
  };

  // Build SVG path curve for the 10 bands
  const svgWidth = 460;
  const svgHeight = 90;
  const points = bandGains.map((gain, idx) => {
    const x = (idx / (bandGains.length - 1)) * (svgWidth - 40) + 20;
    // Map -12..+12 dB to height (middle is svgHeight / 2)
    const y = (svgHeight / 2) - (gain / 12) * (svgHeight / 2 - 12);
    return { x, y };
  });

  const pathD = points.reduce((acc, pt, idx, arr) => {
    if (idx === 0) return `M ${pt.x} ${pt.y}`;
    const prev = arr[idx - 1];
    const cpX = (prev.x + pt.x) / 2;
    return `${acc} C ${cpX} ${prev.y}, ${cpX} ${pt.y}, ${pt.x} ${pt.y}`;
  }, '');

  return (
    <div className="space-y-6">
      {/* 10-Band Graphic Equalizer */}
      <div className="p-6 rounded-xl bg-[#0D121D] border border-slate-800 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <span>DSP Processing</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-400 font-medium">10-Band Graphic EQ</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-300 font-medium">{activePreset}</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Audio Equalizer</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Flat</span>
            </button>
          </div>
        </div>

        {/* Preset Selector Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                activePreset === p.name
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Dynamic Frequency Response Curve Visualizer */}
        <div className="w-full bg-slate-900/80 rounded-lg border border-slate-800/80 p-3 flex flex-col items-center">
          <div className="w-full flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 mb-1">
            <span>+12 dB</span>
            <span className="text-slate-600">RESPONSE CURVE</span>
            <span>-12 dB</span>
          </div>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-20 overflow-visible"
          >
            {/* 0dB Center Reference Line */}
            <line
              x1="10"
              y1={svgHeight / 2}
              x2={svgWidth - 10}
              y2={svgHeight / 2}
              stroke="rgba(255, 255, 255, 0.1)"
              strokeDasharray="4 4"
            />
            {/* Curve path */}
            <path
              d={pathD}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2.5"
            />
            {/* Gain control points */}
            {points.map((pt, idx) => (
              <circle
                key={idx}
                cx={pt.x}
                cy={pt.y}
                r="3.5"
                className="fill-slate-950 stroke-amber-400 stroke-2"
              />
            ))}
          </svg>
        </div>

        {/* 10 Vertical Slider Sliders */}
        <div className="grid grid-cols-10 gap-2 sm:gap-4 pt-2">
          {EQ_FREQUENCIES.map((freq, idx) => {
            const gain = bandGains[idx] || 0;
            return (
              <div key={freq} className="flex flex-col items-center gap-2">
                {/* Current dB reading */}
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  {gain > 0 ? `+${gain}` : gain}
                </span>

                {/* Vertical Slider */}
                <div className="h-36 sm:h-44 flex items-center justify-center">
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="0.5"
                    value={gain}
                    onChange={(e) => handleBandChange(idx, parseFloat(e.target.value))}
                    className="h-32 sm:h-40 -rotate-90 appearance-none bg-slate-800 accent-amber-400 rounded-lg cursor-pointer"
                    style={{ width: '120px' }}
                  />
                </div>

                {/* Frequency Label */}
                <span className="text-[11px] font-mono font-medium text-slate-300">
                  {formatFreq(freq)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Studio DSP Effects Rack */}
      <div className="p-6 rounded-xl bg-[#0D121D] border border-slate-800 space-y-6">
        <div>
          <h3 className="text-base font-semibold text-white">Studio DSP Effects Rack</h3>
          <p className="text-xs text-slate-400">
            Real-time Web Audio spatial acoustic processing, stereo field, and dynamic limiting.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Spatial Reverb */}
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-200">Spatial Reverb</span>
              <span className="font-mono tabular-nums text-amber-400">
                {Math.round(reverb * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={reverb}
              onChange={(e) => handleReverbChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 accent-amber-400 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>Dry</span>
              <span>Hall</span>
            </div>
          </div>

          {/* Stereo Panner */}
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-200">Stereo Panning</span>
              <span className="font-mono tabular-nums text-amber-400">
                {pan === 0 ? 'Center' : pan < 0 ? `L ${Math.round(Math.abs(pan) * 100)}%` : `R ${Math.round(pan * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={pan}
              onChange={(e) => handlePanChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 accent-amber-400 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>Left</span>
              <span>Center</span>
              <span>Right</span>
            </div>
          </div>

          {/* Playback Pitch & Speed */}
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-200">Speed / Pitch</span>
              <span className="font-mono tabular-nums text-amber-400">
                {speed.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={speed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 accent-amber-400 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0.5x</span>
              <span>1.0x</span>
              <span>2.0x</span>
            </div>
          </div>

          {/* Dynamic Limiter / Compressor */}
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-medium text-slate-200">Dynamic Limiter</span>
              <span className={`text-[11px] font-semibold ${compressor ? 'text-emerald-400' : 'text-slate-500'}`}>
                {compressor ? 'ACTIVE' : 'BYPASS'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              Prevents digital inter-sample clipping and punch-enhances transients.
            </p>
            <button
              onClick={toggleCompressor}
              className={`w-full py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                compressor
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {compressor ? 'Compressor Enabled' : 'Bypassed'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
