// Audio Synthesizer: Generates rich, studio-grade procedural tracks and sound pad samples using Web Audio API

/**
 * Creates a synthetic procedural AudioBuffer for default library tracks
 */
export function generateProceduralTrackBuffer(
  ctx: AudioContext,
  style: 'lofi' | 'synthwave' | 'ambient' | 'techno',
  durationSeconds: number = 30
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const numFrames = sampleRate * durationSeconds;
  const buffer = ctx.createBuffer(2, numFrames, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  if (style === 'lofi') {
    renderLofiTrack(left, right, sampleRate, durationSeconds);
  } else if (style === 'synthwave') {
    renderSynthwaveTrack(left, right, sampleRate, durationSeconds);
  } else if (style === 'ambient') {
    renderAmbientTrack(left, right, sampleRate, durationSeconds);
  } else {
    renderTechnoTrack(left, right, sampleRate, durationSeconds);
  }

  return buffer;
}

/**
 * Render Lo-Fi Chillhop track (76 BPM)
 */
function renderLofiTrack(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  duration: number
) {
  const bpm = 76;
  const beatSec = 60 / bpm;
  const chordProgression = [
    [261.63, 311.13, 392.0, 466.16], // Cm7
    [349.23, 415.3, 523.25, 622.25], // Fm7
    [233.08, 293.66, 349.23, 440.0],  // Bb7
    [311.13, 392.0, 466.16, 587.33], // Ebmaj7
  ];

  for (let i = 0; i < left.length; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / beatSec);
    const barBeat = beatIndex % 16;
    const chordIndex = Math.floor(barBeat / 4) % chordProgression.length;
    const chord = chordProgression[chordIndex];

    // Chords (warm rhodes electric piano simulation)
    let chordVal = 0;
    const chordBeatFrac = (t % (beatSec * 2)) / (beatSec * 2);
    const chordEnv = Math.exp(-chordBeatFrac * 1.8) * 0.22;
    for (let c = 0; c < chord.length; c++) {
      const freq = chord[c];
      const tone = Math.sin(2 * Math.PI * freq * t) * 0.6 +
                   Math.sin(4 * Math.PI * freq * t) * 0.25 * Math.sin(t * 3.5);
      chordVal += tone;
    }
    chordVal *= chordEnv;

    // Sub Bass
    const bassFreq = chord[0] / 2;
    const bassEnv = Math.exp(-((t % beatSec) / beatSec) * 2.2) * 0.28;
    const bassVal = Math.sin(2 * Math.PI * bassFreq * t) * bassEnv;

    // Lo-Fi Beat: Kick on beats 0, 2.5, Snare on beats 1, 3
    let drumValL = 0;
    let drumValR = 0;
    const measureT = t % (beatSec * 4);
    const beatFrac = (measureT % beatSec);

    // Kick on beat 0 and 2.5
    const isKick1 = measureT < beatSec;
    const isKick2 = measureT >= beatSec * 2.5 && measureT < beatSec * 3.5;
    if (isKick1 || isKick2) {
      const kickT = isKick1 ? measureT : measureT - beatSec * 2.5;
      if (kickT < 0.25) {
        const kPitch = 120 * Math.exp(-kickT * 28) + 45;
        const kEnv = Math.exp(-kickT * 12);
        const kickWave = Math.sin(2 * Math.PI * kPitch * kickT) * kEnv * 0.45;
        drumValL += kickWave;
        drumValR += kickWave;
      }
    }

    // Snare on beats 1 and 3
    const isSnare1 = measureT >= beatSec && measureT < beatSec * 2;
    const isSnare2 = measureT >= beatSec * 3;
    if (isSnare1 || isSnare2) {
      const snareT = isSnare1 ? measureT - beatSec : measureT - beatSec * 3;
      if (snareT < 0.2) {
        const noise = (Math.random() * 2 - 1) * Math.exp(-snareT * 18) * 0.18;
        const snap = Math.sin(2 * Math.PI * 185 * snareT) * Math.exp(-snareT * 22) * 0.2;
        drumValL += noise + snap;
        drumValR += noise * 0.9 + snap;
      }
    }

    // Hi-hat 8th notes
    const eighthT = t % (beatSec / 2);
    if (eighthT < 0.08) {
      const hhNoise = (Math.random() * 2 - 1) * Math.exp(-eighthT * 60) * 0.08;
      drumValL += hhNoise * 0.8;
      drumValR += hhNoise * 1.1;
    }

    // Vinyl crackle & gentle warmth
    const crackle = Math.random() > 0.997 ? (Math.random() * 0.06 - 0.03) : 0;

    left[i] = (chordVal * 0.9 + bassVal + drumValL + crackle) * 0.75;
    right[i] = (chordVal * 1.1 + bassVal + drumValR + crackle) * 0.75;
  }
}

/**
 * Render Synthwave / Retro track (110 BPM)
 */
function renderSynthwaveTrack(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  duration: number
) {
  const bpm = 110;
  const beatSec = 60 / bpm;
  const bassNotes = [110, 110, 130.81, 146.83, 110, 98, 123.47, 110];

  for (let i = 0; i < left.length; i++) {
    const t = i / sampleRate;
    const sixteenth = t % (beatSec / 4);
    const stepIdx = Math.floor(t / (beatSec / 4)) % bassNotes.length;

    // Running 16th Arp Bass
    const bFreq = bassNotes[stepIdx];
    const bEnv = Math.exp(-sixteenth * 18) * 0.35;
    const saw = ((2 * (bFreq * t % 1)) - 1) * bEnv;

    // Four-on-the-floor kick
    const kickT = t % beatSec;
    let kick = 0;
    if (kickT < 0.22) {
      const kPitch = 140 * Math.exp(-kickT * 32) + 50;
      kick = Math.sin(2 * Math.PI * kPitch * kickT) * Math.exp(-kickT * 10) * 0.45;
    }

    // Big 80s Snare on 2 and 4
    const barT = t % (beatSec * 2);
    let snare = 0;
    if (barT >= beatSec && (barT - beatSec) < 0.28) {
      const sT = barT - beatSec;
      const noise = (Math.random() * 2 - 1) * Math.exp(-sT * 12) * 0.22;
      const body = Math.sin(2 * Math.PI * 220 * sT) * Math.exp(-sT * 16) * 0.25;
      snare = noise + body;
    }

    // Synth Lead melody
    const leadBar = Math.floor(t / (beatSec * 2)) % 4;
    const leadPitches = [440, 523.25, 659.25, 587.33];
    const leadFreq = leadPitches[leadBar];
    const leadEnv = 0.15 * (0.5 + 0.5 * Math.sin(t * 8));
    const lead = Math.sin(2 * Math.PI * leadFreq * t) * leadEnv;

    left[i] = (saw * 0.8 + kick + snare * 0.9 + lead * 0.7) * 0.7;
    right[i] = (saw * 1.1 + kick + snare * 1.1 + lead * 0.9) * 0.7;
  }
}

/**
 * Render Deep Focus Ambient Piano track (60 BPM)
 */
function renderAmbientTrack(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  duration: number
) {
  const notes = [220, 261.63, 329.63, 392.0, 440, 523.25];
  for (let i = 0; i < left.length; i++) {
    const t = i / sampleRate;
    
    // Slow evolving drone
    const drone = (
      Math.sin(2 * Math.PI * 110 * t) * 0.15 +
      Math.sin(2 * Math.PI * 164.81 * t) * 0.12 +
      Math.sin(2 * Math.PI * 220 * t + Math.sin(t * 0.4)) * 0.08
    );

    // Occasional gentle bell/piano note
    const noteCycle = t % 4;
    const noteIdx = Math.floor(t / 4) % notes.length;
    let piano = 0;
    if (noteCycle < 2.5) {
      const f = notes[noteIdx];
      const pEnv = Math.exp(-noteCycle * 1.2) * 0.22;
      piano = (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t)) * pEnv;
    }

    // Atmospheric warm shimmer
    const shimmerL = Math.sin(t * 1.1) * 0.04;
    const shimmerR = Math.cos(t * 1.3) * 0.04;

    left[i] = (drone + piano * 0.85 + shimmerL) * 0.7;
    right[i] = (drone + piano * 1.15 + shimmerR) * 0.7;
  }
}

/**
 * Render Cyber Pulse Techno track (128 BPM)
 */
function renderTechnoTrack(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  duration: number
) {
  const bpm = 128;
  const beatSec = 60 / bpm;

  for (let i = 0; i < left.length; i++) {
    const t = i / sampleRate;
    const beatT = t % beatSec;

    // Punchy 909 Kick
    let kick = 0;
    if (beatT < 0.24) {
      const kPitch = 160 * Math.exp(-beatT * 36) + 48;
      kick = Math.sin(2 * Math.PI * kPitch * beatT) * Math.exp(-beatT * 9) * 0.5;
    }

    // Offbeat Open Hi-Hat
    let hh = 0;
    if (beatT >= beatSec * 0.5 && (beatT - beatSec * 0.5) < 0.18) {
      const hT = beatT - beatSec * 0.5;
      hh = (Math.random() * 2 - 1) * Math.exp(-hT * 22) * 0.16;
    }

    // Acid Saw Bassline
    const sixteenth = t % (beatSec / 4);
    const acidFilter = 400 + 1200 * Math.abs(Math.sin(t * 0.8));
    const rawSaw = (2 * ((110 * t) % 1)) - 1;
    const acid = Math.sin(2 * Math.PI * acidFilter * sixteenth) * rawSaw * Math.exp(-sixteenth * 12) * 0.15;

    // Industrial Clank / Shaker
    const clank = (Math.random() * 0.04) * (t % (beatSec / 2) < 0.05 ? 1 : 0);

    left[i] = (kick + hh * 0.9 + acid + clank) * 0.75;
    right[i] = (kick + hh * 1.1 + acid * 0.95 + clank) * 0.75;
  }
}

/**
 * Play an instant punchy drum sound pad sample via Web Audio API
 */
export function playSoundPad(ctx: AudioContext, padIndex: number, destination: AudioNode) {
  const now = ctx.currentTime;

  switch (padIndex) {
    case 0: { // Kick Drum
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(destination);

      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);

      gain.gain.setValueAtTime(1.0, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.start(now);
      osc.stop(now + 0.35);
      break;
    }
    case 1: { // Snare Drum
      // Noise component
      const bufferSize = ctx.sampleRate * 0.2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1000, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.7, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(destination);

      // Body tone
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.frequency.setValueAtTime(185, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
      oscGain.gain.setValueAtTime(0.5, now);
      oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      osc.connect(oscGain);
      oscGain.connect(destination);

      whiteNoise.start(now);
      osc.start(now);
      whiteNoise.stop(now + 0.2);
      osc.stop(now + 0.15);
      break;
    }
    case 2: { // Closed Hi-Hat
      const bufferSize = ctx.sampleRate * 0.05;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(8000, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(destination);

      source.start(now);
      source.stop(now + 0.05);
      break;
    }
    case 3: { // Open Hi-Hat
      const bufferSize = ctx.sampleRate * 0.35;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(6500, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(destination);

      source.start(now);
      source.stop(now + 0.35);
      break;
    }
    case 4: { // 808 Sub Bass
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.15);

      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

      osc.connect(gain);
      gain.connect(destination);
      osc.start(now);
      osc.stop(now + 0.7);
      break;
    }
    case 5: { // Hand Clap
      for (let burst = 0; burst < 3; burst++) {
        const offset = burst * 0.012;
        const bufferSize = ctx.sampleRate * 0.15;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, now + offset);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.5, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.12);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(destination);

        source.start(now + offset);
        source.stop(now + offset + 0.12);
      }
      break;
    }
    case 6: { // Low Tom
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.2);

      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc.connect(gain);
      gain.connect(destination);
      osc.start(now);
      osc.stop(now + 0.3);
      break;
    }
    case 7: { // Synth Chord Stab
      const freqs = [330, 392, 493.88, 587.33]; // Em9
      freqs.forEach(freq => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2500, now);
        filter.frequency.exponentialRampToValueAtTime(500, now + 0.35);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.4);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(destination);

        osc.start(now);
        osc.stop(now + 0.4);
      });
      break;
    }
  }
}

/**
 * Extract 100 peak points for rendering a smooth static waveform outline
 */
export function extractWaveformPeaks(buffer: AudioBuffer, numPoints: number = 80): number[] {
  const left = buffer.getChannelData(0);
  const blockSize = Math.floor(left.length / numPoints);
  const peaks: number[] = [];

  for (let i = 0; i < numPoints; i++) {
    const start = i * blockSize;
    let max = 0;
    for (let j = 0; j < blockSize; j += 8) {
      const val = Math.abs(left[start + j] || 0);
      if (val > max) max = val;
    }
    peaks.push(Math.min(1, max));
  }

  return peaks;
}
