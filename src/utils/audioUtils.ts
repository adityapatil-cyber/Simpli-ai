export function encodeWavPcm16(
  samples: Float32Array,
  sampleRate = 16000
): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      offset,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true
    );
    offset += 2;
  }

  return buffer;
}

export function resampleFloat32(
  input: Float32Array,
  inputRate: number,
  targetRate = 16000
): Float32Array {
  if (!input.length || inputRate === targetRate || inputRate <= 0) {
    return input;
  }
  const ratio = inputRate / targetRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio;
    const low = Math.floor(srcIdx);
    const high = Math.min(low + 1, input.length - 1);
    const frac = srcIdx - low;
    output[i] = input[low] * (1 - frac) + input[high] * frac;
  }
  return output;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(
      String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)))
    );
  }
  if (typeof btoa === 'function') {
    return btoa(parts.join(''));
  }
  return Buffer.from(bytes).toString('base64');
}

export function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export function float32ToPcm16Base64(
  samples: Float32Array,
  inputSampleRate = 16000,
  targetSampleRate = 16000
): string {
  const resampled = resampleFloat32(samples, inputSampleRate, targetSampleRate);
  const buffer = new ArrayBuffer(resampled.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < resampled.length; i++) {
    const clamped = Math.max(-1, Math.min(1, resampled[i]));
    view.setInt16(
      i * 2,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true
    );
  }
  return bytesToBase64(new Uint8Array(buffer));
}

export function pcm16Base64ToFloat32(base64: string): Float32Array {
  const bytes = base64ToBytes(base64);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff;
  }
  return float32;
}

export function pickSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return candidates.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

export function normalizeAudioMimeType(rawMime?: string): string {
  const base = (rawMime || 'audio/webm').split(';')[0].trim().toLowerCase();
  if (!base || base === 'application/octet-stream') return 'audio/webm';
  if (base === 'audio/x-wav' || base === 'audio/wave') return 'audio/wav';
  if (base === 'video/webm') return 'audio/webm';
  return base;
}

export async function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read recorded audio'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Preserves native compressed microphone recordings (audio/webm, audio/ogg, audio/mp4)
 * because Gemini 4 Hydrogen natively decodes Opus/WebM/OGG/MP4 with highest fidelity
 * and avoids lossy client-side re-encoding issues across browsers.
 */
export async function prepareAudioForTranscription(
  blob: Blob
): Promise<{ audioBase64: string; mimeType: string }> {
  const mimeType = normalizeAudioMimeType(blob.type);
  const dataUrl = await blobToBase64DataUrl(blob);
  return {
    audioBase64: dataUrl,
    mimeType,
  };
}
