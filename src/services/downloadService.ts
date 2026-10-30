/**
 * Download Service for MP.R Audio Studio
 * Enables saving any audio track (local phone files, recordings, or procedural studio masters)
 * directly to the user device's Downloads directory as standard playable audio files.
 */

import { AudioTrack } from '../types/audio';

/**
 * Encodes an AudioBuffer into standard 16-bit stereo/mono PCM WAV Blob
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const length = buffer.length;
  const dataByteLength = length * blockAlign;
  const headerByteLength = 44;
  const totalLength = headerByteLength + dataByteLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF identifier
  writeString(0, 'RIFF');
  // File length minus 8 bytes
  view.setUint32(4, 36 + dataByteLength, true);
  // RIFF type
  writeString(8, 'WAVE');
  // format chunk identifier
  writeString(12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, format, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * blockAlign, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, blockAlign, true);
  // bits per sample
  view.setUint16(34, bitDepth, true);
  // data chunk identifier
  writeString(36, 'data');
  // data chunk length
  view.setUint32(40, dataByteLength, true);

  // Write interleaved PCM samples
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      // Clamp sample between -1 and 1
      const sample = Math.max(-1, Math.min(1, channelData[c][i]));
      // Convert float [-1, 1] to signed 16-bit integer [-32768, 32767]
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Clean a string so it is safe to use as a file name across operating systems
 */
function sanitizeFileName(str: string): string {
  return str.replace(/[\\/:*?"<>|]+/g, '_').trim();
}

/**
 * Trigger immediate browser download of an audio track to the device's Downloads directory
 */
export async function downloadTrackAsFile(
  track: AudioTrack,
  onNotify?: (message: string) => void
): Promise<{ success: boolean; fileName: string }> {
  try {
    let fileBlob: Blob | null = null;
    let fileName = '';

    const safeTitle = sanitizeFileName(track.title || 'audio_track');
    const safeArtist = sanitizeFileName(track.artist || 'Artist');

    // 1. If track has original raw file blob (e.g. from phone upload or mic recording)
    if (track.blob) {
      fileBlob = track.blob;
      if (fileBlob instanceof File && fileBlob.name) {
        fileName = fileBlob.name;
      } else {
        const ext = fileBlob.type.includes('wav')
          ? 'wav'
          : fileBlob.type.includes('mp3')
          ? 'mp3'
          : fileBlob.type.includes('webm')
          ? 'webm'
          : fileBlob.type.includes('ogg')
          ? 'ogg'
          : 'mp3';
        fileName = `${safeArtist} - ${safeTitle}.${ext}`;
      }
    }
    // 2. If track has AudioBuffer (e.g. decoded stream or procedural synthesizer master)
    else if (track.audioBuffer) {
      fileBlob = audioBufferToWavBlob(track.audioBuffer);
      fileName = `${safeArtist} - ${safeTitle}.wav`;
    }
    // 3. If track has a URL (e.g. blob URL or remote resource)
    else if (track.url && !track.url.startsWith('data:audio/')) {
      try {
        const response = await fetch(track.url);
        fileBlob = await response.blob();
        fileName = `${safeArtist} - ${safeTitle}.mp3`;
      } catch (fetchErr) {
        console.warn('Could not fetch audio URL for download:', fetchErr);
      }
    }

    if (!fileBlob) {
      throw new Error('No audio data available for this track.');
    }

    // Trigger browser file download via temporary anchor element
    const blobUrl = URL.createObjectURL(fileBlob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();

    // Clean up temporary DOM & object URL
    setTimeout(() => {
      if (anchor.parentNode) {
        document.body.removeChild(anchor);
      }
      URL.revokeObjectURL(blobUrl);
    }, 1500);

    onNotify?.(`Saved "${fileName}" to Downloads`);
    return { success: true, fileName };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Download failed';
    console.error('Track download failed:', err);
    onNotify?.(`Error downloading "${track.title}": ${errorMsg}`);
    return { success: false, fileName: '' };
  }
}

/**
 * Estimate file size in MB for display
 */
export function getTrackEstimatedSizeMb(track: AudioTrack): string {
  if (track.blob && track.blob.size) {
    const mb = track.blob.size / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }
  if (track.audioBuffer) {
    // 16-bit stereo at sampleRate
    const rawBytes = track.audioBuffer.length * track.audioBuffer.numberOfChannels * 2;
    const mb = rawBytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }
  // Approximate standard 192kbps MP3 calculation
  if (track.duration > 0) {
    const approxBytes = track.duration * (192 * 1000 / 8);
    const mb = approxBytes / (1024 * 1024);
    return `~${mb.toFixed(1)} MB`;
  }
  return 'Local File';
}
