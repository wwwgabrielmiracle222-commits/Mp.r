export type VisualizerMode = 'bars' | 'wave' | 'radial' | 'particles';

export interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number; // in seconds
  genre: string;
  bpm?: number;
  url?: string;
  audioBuffer?: AudioBuffer;
  blob?: Blob;
  sourceType: 'preset' | 'upload' | 'recording' | 'radio';
  coverGradient?: string;
  waveformPeaks?: number[];
  notes?: string;
}

export interface RecordingMarker {
  id: string;
  time: number;
  label: string;
}

export interface AudioRecording {
  id: string;
  title: string;
  timestamp: number;
  duration: number;
  blob: Blob;
  url: string;
  audioBuffer?: AudioBuffer;
  markers: RecordingMarker[];
  category: 'Voice Memo' | 'Vocal Take' | 'Field Audio' | 'Podcast' | 'Radio Capture';
  notes: string;
  trimStart: number;
  trimEnd: number;
}

export interface EqPreset {
  name: string;
  gains: number[]; // 10 band gains in dB (-12 to +12)
}

export interface RadioStation {
  id: string;
  name: string;
  callsign: string;
  genre: string;
  streamUrl: string;
  location: string;
  description: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
  color?: string;
}

