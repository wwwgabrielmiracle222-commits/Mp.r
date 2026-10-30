import { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../services/audioEngine';
import { VisualizerMode } from '../types/audio';
import { Maximize2, Minimize2, BarChart3, Activity, Disc, Sparkles } from 'lucide-react';

interface VisualizerProps {
  mode: VisualizerMode;
  onModeChange: (mode: VisualizerMode) => void;
  className?: string;
  isRecording?: boolean;
}

export function Visualizer({ mode, onModeChange, className = '', isRecording = false }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const peaksRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const freqData = new Uint8Array(256);
    const timeData = new Uint8Array(256);

    const render = () => {
      animId = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;

      // Ensure dimensions match display
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }

      audioEngine.getVisualizerData(freqData, timeData);

      // Background clear with slight trail decay
      ctx.fillStyle = '#090D14';
      ctx.fillRect(0, 0, width, height);

      // Draw subtle grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let y = height / 4; y < height; y += height / 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (mode === 'bars') {
        renderBars(ctx, freqData, width, height);
      } else if (mode === 'wave') {
        renderWaveform(ctx, timeData, width, height, isRecording);
      } else if (mode === 'radial') {
        renderRadial(ctx, freqData, width, height);
      } else if (mode === 'particles') {
        renderParticles(ctx, freqData, timeData, width, height);
      }
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [mode, isRecording]);

  const renderBars = (
    ctx: CanvasRenderingContext2D,
    data: Uint8Array,
    width: number,
    height: number
  ) => {
    const barCount = 48;
    const barWidth = (width / barCount) * 0.75;
    const gap = (width / barCount) * 0.25;

    // Initialize or adapt peak holds
    if (peaksRef.current.length !== barCount) {
      peaksRef.current = new Array(barCount).fill(0);
    }

    for (let i = 0; i < barCount; i++) {
      // Logarithmic distribution to emphasize low-mid musical frequencies
      const dataIdx = Math.floor(Math.pow(i / barCount, 1.4) * (data.length * 0.75));
      const val = data[dataIdx] || 0;
      const percent = val / 255;
      const barHeight = Math.max(3, percent * (height - 24));
      const x = i * (barWidth + gap) + gap / 2;
      const y = height - barHeight - 12;

      // Decay peak hold
      if (barHeight > peaksRef.current[i]) {
        peaksRef.current[i] = barHeight;
      } else {
        peaksRef.current[i] = Math.max(0, peaksRef.current[i] - 1.2);
      }

      // Bar gradient
      const grad = ctx.createLinearGradient(0, height - 12, 0, height - barHeight - 12);
      grad.addColorStop(0, '#06B6D4'); // Cyan
      grad.addColorStop(0.65, '#F59E0B'); // Amber
      grad.addColorStop(1, '#EF4444'); // Crimson top

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
      ctx.fill();

      // Peak hold dot
      const peakY = height - peaksRef.current[i] - 14;
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(x, peakY, barWidth, 2);
    }
  };

  const renderWaveform = (
    ctx: CanvasRenderingContext2D,
    data: Uint8Array,
    width: number,
    height: number,
    isRec: boolean
  ) => {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = isRec ? '#EF4444' : '#F59E0B';
    ctx.shadowBlur = 10;
    ctx.shadowColor = isRec ? 'rgba(239, 68, 68, 0.5)' : 'rgba(245, 158, 11, 0.4)';

    ctx.beginPath();
    const sliceWidth = width / data.length;
    let x = 0;

    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.stroke();
    ctx.shadowBlur = 0; // reset
  };

  const renderRadial = (
    ctx: CanvasRenderingContext2D,
    data: Uint8Array,
    width: number,
    height: number
  ) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = Math.min(centerX, centerY) * 0.42;
    const rayCount = 64;

    // Center vinyl circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, baseRadius * 0.65, 0, Math.PI * 2);
    ctx.fillStyle = '#111827';
    ctx.fill();
    ctx.strokeStyle = '#1F2937';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center spindle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#F59E0B';
    ctx.fill();

    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2;
      const dataIdx = Math.floor((i / rayCount) * (data.length * 0.7));
      const val = data[dataIdx] || 0;
      const rayLen = (val / 255) * (baseRadius * 0.85) + 4;

      const x1 = centerX + Math.cos(angle) * (baseRadius * 0.72);
      const y1 = centerY + Math.sin(angle) * (baseRadius * 0.72);
      const x2 = centerX + Math.cos(angle) * (baseRadius * 0.72 + rayLen);
      const y2 = centerY + Math.sin(angle) * (baseRadius * 0.72 + rayLen);

      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, '#06B6D4');
      grad.addColorStop(1, '#F59E0B');

      ctx.strokeStyle = grad;
      ctx.lineWidth = (width / 500) * 2.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  };

  const renderParticles = (
    ctx: CanvasRenderingContext2D,
    freqData: Uint8Array,
    timeData: Uint8Array,
    width: number,
    height: number
  ) => {
    const centerX = width / 2;
    const centerY = height / 2;

    // Low freq energy for pulse radius
    let bassEnergy = 0;
    for (let i = 0; i < 16; i++) {
      bassEnergy += freqData[i] || 0;
    }
    const pulseFactor = bassEnergy / (16 * 255);

    // Glowing energy orb
    const orbRadius = 40 + pulseFactor * 50;
    const orbGrad = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, orbRadius);
    orbGrad.addColorStop(0, 'rgba(245, 158, 11, 0.8)');
    orbGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.4)');
    orbGrad.addColorStop(1, 'rgba(6, 182, 212, 0)');

    ctx.fillStyle = orbGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, orbRadius, 0, Math.PI * 2);
    ctx.fill();

    // Sound wave orbit ring
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    const ringRadius = orbRadius + 30;
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const sample = (timeData[i % timeData.length] - 128) / 128;
      const r = ringRadius + sample * 24;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-xl bg-[#0B0F18] border border-slate-800/80 overflow-hidden flex flex-col ${className}`}
    >
      {/* Visualizer Header Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60 bg-[#0E1420]/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
          <span className="text-slate-200">Visualizer</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="capitalize">{mode} Mode</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center bg-[#131B2B] p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => onModeChange('bars')}
              title="Spectrum Bars"
              className={`p-1.5 rounded-md transition-colors ${
                mode === 'bars' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onModeChange('wave')}
              title="Oscilloscope Waveform"
              className={`p-1.5 rounded-md transition-colors ${
                mode === 'wave' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onModeChange('radial')}
              title="Radial Equalizer"
              className={`p-1.5 rounded-md transition-colors ${
                mode === 'radial' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Disc className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onModeChange('particles')}
              title="Particle Field"
              className={`p-1.5 rounded-md transition-colors ${
                mode === 'particles' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="p-1.5 text-slate-400 hover:text-slate-200 bg-[#131B2B] hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 min-h-[220px] w-full bg-[#090D14]">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full block"
        />
      </div>
    </div>
  );
}
