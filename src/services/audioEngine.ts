import { AudioTrack, AudioRecording, RecordingMarker } from '../types/audio';
import { extractWaveformPeaks } from './audioSynthesizer';

export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private audioElement: HTMLAudioElement;
  private mediaElementSource: MediaElementAudioSourceNode | null = null;
  private bufferSource: AudioBufferSourceNode | null = null;
  private isBufferPlaying: boolean = false;
  private bufferStartTime: number = 0;
  private bufferPauseOffset: number = 0;
  private currentBuffer: AudioBuffer | null = null;

  // DSP Nodes
  private analyser: AnalyserNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private pannerNode: StereoPannerNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode | null = null;

  // Recording
  private mediaRecorder: MediaRecorder | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micMonitorGain: GainNode | null = null;
  private micGain: GainNode | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartTime: number = 0;
  private recordingElapsed: number = 0;
  private recordingTimer: number | null = null;
  private recordingMarkers: RecordingMarker[] = [];

  // State
  public currentTrack: AudioTrack | null = null;
  public isPlaying: boolean = false;
  public isRecording: boolean = false;
  public isRecordingPaused: boolean = false;
  public isRadio: boolean = false;
  public isMuted: boolean = false;
  public volume: number = 0.85;
  public speed: number = 1.0;
  public pan: number = 0;
  public reverbAmount: number = 0; // 0 to 1
  public compressorEnabled: boolean = true;
  public loopMode: 'none' | 'all' | 'single' = 'none';
  public abLoop: { start: number; end: number; active: boolean } = { start: 0, end: 0, active: false };

  // Listeners
  public onTimeUpdate?: (currentTime: number, duration: number) => void;
  public onTrackEnded?: () => void;
  public onPlayStateChange?: (playing: boolean) => void;
  public onRecordingTimeUpdate?: (seconds: number) => void;
  public onRecordingComplete?: (recording: AudioRecording) => void;

  constructor() {
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = 'anonymous';

    this.audioElement.addEventListener('timeupdate', () => {
      if (!this.isBufferPlaying && this.onTimeUpdate) {
        if (this.abLoop.active && this.audioElement.currentTime >= this.abLoop.end) {
          this.audioElement.currentTime = this.abLoop.start;
        }
        this.onTimeUpdate(this.audioElement.currentTime, this.audioElement.duration || 0);
      }
    });

    this.audioElement.addEventListener('ended', () => {
      if (this.loopMode === 'single') {
        this.audioElement.currentTime = 0;
        this.audioElement.play().catch(() => {});
      } else {
        this.isPlaying = false;
        if (this.onPlayStateChange) this.onPlayStateChange(false);
        if (this.onTrackEnded) this.onTrackEnded();
      }
    });
  }

  /**
   * Initializes Web Audio Context and DSP graph
   */
  public initContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);

      // Analyser
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.82;

      // Dynamics Compressor (Studio mastering)
      this.compressorNode = this.ctx.createDynamicsCompressor();
      this.compressorNode.threshold.setValueAtTime(-20, this.ctx.currentTime);
      this.compressorNode.knee.setValueAtTime(30, this.ctx.currentTime);
      this.compressorNode.ratio.setValueAtTime(4, this.ctx.currentTime);
      this.compressorNode.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressorNode.release.setValueAtTime(0.25, this.ctx.currentTime);

      // Stereo Panner
      if (this.ctx.createStereoPanner) {
        this.pannerNode = this.ctx.createStereoPanner();
      }

      // Reverb Setup (Impulse synthesis)
      this.reverbConvolver = this.ctx.createConvolver();
      this.reverbConvolver.buffer = this.createImpulseResponse(2.2, 2.0);
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.dryGain = this.ctx.createGain();
      this.dryGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

      // Build 10-Band EQ filters
      this.eqFilters = EQ_FREQUENCIES.map((freq, index) => {
        const filter = this.ctx!.createBiquadFilter();
        if (index === 0) {
          filter.type = 'lowshelf';
        } else if (index === EQ_FREQUENCIES.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.setValueAtTime(1.4, this.ctx!.currentTime);
        }
        filter.frequency.setValueAtTime(freq, this.ctx!.currentTime);
        filter.gain.setValueAtTime(0, this.ctx!.currentTime);
        return filter;
      });

      // Chain EQ filters in series
      for (let i = 0; i < this.eqFilters.length - 1; i++) {
        this.eqFilters[i].connect(this.eqFilters[i + 1]);
      }

      // Output DSP Chain:
      // Last EQ Filter -> Split to Dry + ReverbConvolver
      const lastEq = this.eqFilters[this.eqFilters.length - 1];
      lastEq.connect(this.dryGain);
      lastEq.connect(this.reverbConvolver);
      this.reverbConvolver.connect(this.reverbGain);

      // Mix Dry + Wet into Compressor or Panner
      const postMixNode = this.pannerNode || this.masterGain;
      this.dryGain.connect(postMixNode);
      this.reverbGain.connect(postMixNode);

      if (this.pannerNode) {
        this.pannerNode.connect(this.compressorNode);
      }

      this.compressorNode.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      // Wire HTMLAudioElement
      try {
        this.mediaElementSource = this.ctx.createMediaElementSource(this.audioElement);
        this.mediaElementSource.connect(this.eqFilters[0]);
      } catch (e) {
        console.warn('MediaElementSource already connected or cross-origin restricted:', e);
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    return this.ctx;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public getMasterInputNode(): AudioNode | null {
    return this.eqFilters[0] || null;
  }

  /**
   * Generates a synthetic hall impulse response buffer for clean spatial reverb
   */
  private createImpulseResponse(duration: number, decay: number): AudioBuffer {
    const rate = this.ctx!.sampleRate;
    const length = rate * duration;
    const impulse = this.ctx!.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i;
      const decayFactor = Math.pow(1 - n / length, decay);
      left[i] = (Math.random() * 2 - 1) * decayFactor;
      right[i] = (Math.random() * 2 - 1) * decayFactor;
    }
    return impulse;
  }

  /**
   * Load and play a track
   */
  public async playTrack(track: AudioTrack, startTime: number = 0) {
    this.initContext();
    this.stop();

    this.currentTrack = track;
    this.isRadio = track.sourceType === 'radio';

    if (track.audioBuffer) {
      // Buffer playback
      this.currentBuffer = track.audioBuffer;
      this.playBufferFrom(startTime);
    } else if (track.url) {
      // HTMLAudioElement stream / blob URL
      this.audioElement.src = track.url;
      this.audioElement.playbackRate = this.speed;
      this.audioElement.currentTime = startTime;
      await this.audioElement.play();
      this.isPlaying = true;
      if (this.onPlayStateChange) this.onPlayStateChange(true);
    }
  }

  private playBufferFrom(offset: number) {
    if (!this.ctx || !this.currentBuffer) return;

    this.bufferSource = this.ctx.createBufferSource();
    this.bufferSource.buffer = this.currentBuffer;
    this.bufferSource.playbackRate.setValueAtTime(this.speed, this.ctx.currentTime);
    this.bufferSource.connect(this.eqFilters[0]);

    if (this.loopMode === 'single') {
      this.bufferSource.loop = true;
    }

    this.bufferStartTime = this.ctx.currentTime - offset / this.speed;
    this.bufferPauseOffset = offset;
    this.bufferSource.start(0, offset);
    this.isBufferPlaying = true;
    this.isPlaying = true;

    this.bufferSource.onended = () => {
      if (this.isBufferPlaying) {
        this.isBufferPlaying = false;
        if (this.loopMode === 'single') {
          this.playBufferFrom(0);
        } else {
          this.isPlaying = false;
          if (this.onPlayStateChange) this.onPlayStateChange(false);
          if (this.onTrackEnded) this.onTrackEnded();
        }
      }
    };

    if (this.onPlayStateChange) this.onPlayStateChange(true);

    // Buffer progress ticker
    const checkBufferProgress = () => {
      if (this.isBufferPlaying && this.ctx && this.currentBuffer) {
        const currentSec = (this.ctx.currentTime - this.bufferStartTime) * this.speed;
        if (this.abLoop.active && currentSec >= this.abLoop.end) {
          this.seek(this.abLoop.start);
          return;
        }
        if (this.onTimeUpdate) {
          this.onTimeUpdate(Math.min(currentSec, this.currentBuffer.duration), this.currentBuffer.duration);
        }
        requestAnimationFrame(checkBufferProgress);
      }
    };
    requestAnimationFrame(checkBufferProgress);
  }

  public async togglePlayPause() {
    this.initContext();

    if (this.isPlaying) {
      this.pause();
    } else {
      if (this.currentBuffer && !this.isBufferPlaying) {
        this.playBufferFrom(this.bufferPauseOffset);
      } else if (this.currentTrack) {
        await this.audioElement.play();
        this.isPlaying = true;
        if (this.onPlayStateChange) this.onPlayStateChange(true);
      }
    }
  }

  public pause() {
    if (this.isBufferPlaying && this.bufferSource && this.ctx) {
      this.bufferPauseOffset = (this.ctx.currentTime - this.bufferStartTime) * this.speed;
      this.isBufferPlaying = false;
      try {
        this.bufferSource.stop();
        this.bufferSource.disconnect();
      } catch {}
      this.isPlaying = false;
      if (this.onPlayStateChange) this.onPlayStateChange(false);
    } else if (this.isPlaying) {
      this.audioElement.pause();
      this.isPlaying = false;
      if (this.onPlayStateChange) this.onPlayStateChange(false);
    }
  }

  public stop() {
    this.pause();
    if (this.isBufferPlaying && this.bufferSource) {
      try {
        this.bufferSource.stop();
        this.bufferSource.disconnect();
      } catch {}
      this.isBufferPlaying = false;
    }
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    this.bufferPauseOffset = 0;
    this.isPlaying = false;
    if (this.onPlayStateChange) this.onPlayStateChange(false);
  }

  public seek(seconds: number) {
    if (this.currentBuffer) {
      const wasPlaying = this.isPlaying;
      if (this.isBufferPlaying && this.bufferSource) {
        this.isBufferPlaying = false;
        try {
          this.bufferSource.stop();
          this.bufferSource.disconnect();
        } catch {}
      }
      this.bufferPauseOffset = seconds;
      if (wasPlaying) {
        this.playBufferFrom(seconds);
      } else if (this.onTimeUpdate && this.currentBuffer) {
        this.onTimeUpdate(seconds, this.currentBuffer.duration);
      }
    } else {
      this.audioElement.currentTime = seconds;
    }
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
    this.audioElement.volume = this.isMuted ? 0 : this.volume;
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    this.setVolume(this.volume);
    return this.isMuted;
  }

  public setSpeed(val: number) {
    this.speed = val;
    this.audioElement.playbackRate = val;
    if (this.bufferSource && this.ctx) {
      this.bufferSource.playbackRate.setValueAtTime(val, this.ctx.currentTime);
    }
  }

  public setPan(val: number) {
    this.pan = Math.max(-1, Math.min(1, val));
    if (this.pannerNode && this.ctx) {
      this.pannerNode.pan.setValueAtTime(this.pan, this.ctx.currentTime);
    }
  }

  public setEqBand(bandIndex: number, gainDb: number) {
    if (this.eqFilters[bandIndex] && this.ctx) {
      this.eqFilters[bandIndex].gain.setValueAtTime(gainDb, this.ctx.currentTime);
    }
  }

  public setAllEqBands(gains: number[]) {
    gains.forEach((gain, idx) => {
      this.setEqBand(idx, gain);
    });
  }

  public setReverb(amount: number) {
    this.reverbAmount = Math.max(0, Math.min(1, amount));
    if (this.reverbGain && this.dryGain && this.ctx) {
      this.reverbGain.gain.setValueAtTime(this.reverbAmount * 0.8, this.ctx.currentTime);
      this.dryGain.gain.setValueAtTime(1 - this.reverbAmount * 0.3, this.ctx.currentTime);
    }
  }

  public toggleCompressor(enabled: boolean) {
    this.compressorEnabled = enabled;
    if (this.compressorNode && this.ctx) {
      this.compressorNode.ratio.setValueAtTime(enabled ? 4 : 1, this.ctx.currentTime);
    }
  }

  public setAbLoop(start: number, end: number, active: boolean) {
    this.abLoop = { start, end, active };
  }

  /**
   * Retrieves live audio frequency and time domain data for Visualizer
   */
  public getVisualizerData(freqArray: Uint8Array<ArrayBuffer>, waveArray: Uint8Array<ArrayBuffer>) {
    const activeAnalyser = this.isRecording && this.micAnalyser ? this.micAnalyser : this.analyser;
    if (activeAnalyser) {
      activeAnalyser.getByteFrequencyData(freqArray);
      activeAnalyser.getByteTimeDomainData(waveArray);
    } else {
      freqArray.fill(0);
      waveArray.fill(128);
    }
  }

  // ==========================================
  // MICROPHONE & AUDIO RECORDER
  // ==========================================

  public async startRecording(monitorAudio: boolean = false, inputGainFactor: number = 1.0) {
    this.initContext();
    this.recordedChunks = [];
    this.recordingMarkers = [];
    this.recordingElapsed = 0;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    this.micStream = stream;

    // Mic routing
    this.micSource = this.ctx!.createMediaStreamSource(stream);
    this.micGain = this.ctx!.createGain();
    this.micGain.gain.setValueAtTime(inputGainFactor, this.ctx!.currentTime);

    this.micAnalyser = this.ctx!.createAnalyser();
    this.micAnalyser.fftSize = 512;

    this.micMonitorGain = this.ctx!.createGain();
    this.micMonitorGain.gain.setValueAtTime(monitorAudio ? 0.8 : 0, this.ctx!.currentTime);

    this.micSource.connect(this.micGain);
    this.micGain.connect(this.micAnalyser);
    this.micGain.connect(this.micMonitorGain);
    this.micMonitorGain.connect(this.ctx!.destination);

    // Setup MediaRecorder
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
    }

    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
    this.mediaRecorder = new MediaRecorder(stream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
      const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
      const url = URL.createObjectURL(blob);

      // Decode audio buffer for visual waveform and editing
      let audioBuffer: AudioBuffer | undefined;
      try {
        const arrayBuffer = await blob.arrayBuffer();
        audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
      } catch (err) {
        console.warn('Could not decode recorded buffer directly, using duration fallback:', err);
      }

      const duration = audioBuffer ? audioBuffer.duration : this.recordingElapsed;

      const recording: AudioRecording = {
        id: `rec_${Date.now()}`,
        title: `Take ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
        timestamp: Date.now(),
        duration,
        blob,
        url,
        audioBuffer,
        markers: [...this.recordingMarkers],
        category: 'Vocal Take',
        notes: '',
        trimStart: 0,
        trimEnd: duration,
      };

      if (this.onRecordingComplete) {
        this.onRecordingComplete(recording);
      }

      // Cleanup tracks
      if (this.micStream) {
        this.micStream.getTracks().forEach((track) => track.stop());
        this.micStream = null;
      }
    };

    this.mediaRecorder.start(100);
    this.isRecording = true;
    this.isRecordingPaused = false;
    this.recordingStartTime = Date.now();

    // Timer loop
    this.recordingTimer = window.setInterval(() => {
      if (!this.isRecordingPaused) {
        this.recordingElapsed += 0.1;
        if (this.onRecordingTimeUpdate) {
          this.onRecordingTimeUpdate(this.recordingElapsed);
        }
      }
    }, 100);
  }

  public pauseRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.isRecordingPaused = true;
    }
  }

  public resumeRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.isRecordingPaused = false;
    }
  }

  public addRecordingMarker(label?: string) {
    const marker: RecordingMarker = {
      id: `mark_${Date.now()}`,
      time: this.recordingElapsed,
      label: label || `Marker ${this.recordingMarkers.length + 1}`,
    };
    this.recordingMarkers.push(marker);
    return marker;
  }

  public setRecordingMonitoring(enabled: boolean) {
    if (this.micMonitorGain && this.ctx) {
      this.micMonitorGain.gain.setValueAtTime(enabled ? 0.8 : 0, this.ctx.currentTime);
    }
  }

  public setMicGain(gainFactor: number) {
    if (this.micGain && this.ctx) {
      this.micGain.gain.setValueAtTime(gainFactor, this.ctx.currentTime);
    }
  }

  public stopRecording() {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    this.isRecording = false;
    this.isRecordingPaused = false;
  }

  /**
   * Calculates live VU meter peak and RMS in dB
   */
  public getLiveMeterLevels(): { rmsDb: number; peakDb: number; clipping: boolean } {
    if (!this.micAnalyser) return { rmsDb: -60, peakDb: -60, clipping: false };

    const data = new Uint8Array(this.micAnalyser.fftSize);
    this.micAnalyser.getByteTimeDomainData(data);

    let sum = 0;
    let peak = 0;

    for (let i = 0; i < data.length; i++) {
      const sample = (data[i] - 128) / 128;
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;
      sum += sample * sample;
    }

    const rms = Math.sqrt(sum / data.length);
    const rmsDb = rms > 0.0001 ? 20 * Math.log10(rms) : -60;
    const peakDb = peak > 0.0001 ? 20 * Math.log10(peak) : -60;

    return {
      rmsDb: Math.max(-60, Math.min(0, rmsDb)),
      peakDb: Math.max(-60, Math.min(0, peakDb)),
      clipping: peak >= 0.98,
    };
  }

  /**
   * Helper to create trimmed audio blob/buffer
   */
  public async createTrimmedClip(
    originalBuffer: AudioBuffer,
    trimStart: number,
    trimEnd: number
  ): Promise<{ buffer: AudioBuffer; peaks: number[] }> {
    this.initContext();
    const rate = originalBuffer.sampleRate;
    const startSample = Math.max(0, Math.floor(trimStart * rate));
    const endSample = Math.min(originalBuffer.length, Math.floor(trimEnd * rate));
    const newLength = Math.max(1, endSample - startSample);

    const newBuffer = this.ctx!.createBuffer(
      originalBuffer.numberOfChannels,
      newLength,
      rate
    );

    for (let c = 0; c < originalBuffer.numberOfChannels; c++) {
      const origData = originalBuffer.getChannelData(c);
      const newData = newBuffer.getChannelData(c);
      for (let i = 0; i < newLength; i++) {
        newData[i] = origData[startSample + i];
      }
    }

    const peaks = extractWaveformPeaks(newBuffer, 80);
    return { buffer: newBuffer, peaks };
  }
}

// Global Singleton Instance
export const audioEngine = new AudioEngine();
