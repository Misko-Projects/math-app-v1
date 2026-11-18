// Small audio helpers: 16-bit PCM WAV build/parse and Ogg Opus duration (for the manifest's
// `durationMs`, 02 §5.5), without an ffprobe binary.

export interface Pcm {
  sampleRate: number;
  channels: number;
  /** Interleaved signed 16-bit little-endian samples. */
  data: Uint8Array;
}

/** Wraps 16-bit PCM in a RIFF/WAVE header. */
export function pcmToWav({ sampleRate, channels, data }: Pcm): Uint8Array {
  const out = new Uint8Array(44 + data.length);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) out[offset + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + data.length, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, data.length, true);
  out.set(data, 44);
  return out;
}

/** True when the bytes start with a RIFF/WAVE header. */
export function isWav(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WAVE'
  );
}

/** Duration of a 16-bit PCM WAV in milliseconds (reads the fmt and data chunks). */
export function wavDurationMs(bytes: Uint8Array): number {
  if (!isWav(bytes)) throw new Error('not a WAV file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') byteRate = view.getUint32(offset + 16, true);
    if (id === 'data') {
      if (!byteRate) throw new Error('WAV data chunk before its fmt chunk');
      const available = Math.min(size, bytes.length - offset - 8);
      return Math.round((available / byteRate) * 1000);
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV file has no data chunk');
}

/** A deterministic test tone: a soft 660 Hz blip with fades, then silence (the stub renderer). */
export function stubWav(durationMs: number, sampleRate = 24000): Uint8Array {
  const samples = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const data = new Uint8Array(samples * 2);
  const view = new DataView(data.buffer);
  const blip = Math.min(samples, Math.round(0.08 * sampleRate));
  const fade = Math.round(0.01 * sampleRate);
  for (let i = 0; i < blip; i += 1) {
    const env = Math.min(1, i / fade, (blip - i) / fade);
    const v = Math.round(Math.sin((2 * Math.PI * 660 * i) / sampleRate) * env * 0.2 * 32767);
    view.setInt16(i * 2, v, true);
  }
  return pcmToWav({ sampleRate, channels: 1, data });
}

/**
 * Duration of an Ogg Opus file in milliseconds: the last page's granule position (48 kHz samples)
 * minus the OpusHead pre-skip.
 */
export function oggOpusDurationMs(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isPage = (i: number) =>
    bytes[i] === 0x4f && bytes[i + 1] === 0x67 && bytes[i + 2] === 0x67 && bytes[i + 3] === 0x53;
  if (!isPage(0)) throw new Error('not an Ogg file');
  // OpusHead is the first packet: page header (27 bytes + segment table), then "OpusHead".
  const segments = bytes[26] ?? 0;
  const head = 27 + segments;
  if (String.fromCharCode(...bytes.subarray(head, head + 8)) !== 'OpusHead') {
    throw new Error('not an Ogg Opus file');
  }
  const preSkip = view.getUint16(head + 10, true);
  for (let i = bytes.length - 27; i >= 0; i -= 1) {
    if (!isPage(i)) continue;
    const granule = view.getBigInt64(i + 6, true);
    if (granule < 0n) continue;
    return Math.max(0, Math.round(((Number(granule) - preSkip) / 48000) * 1000));
  }
  throw new Error('Ogg file has no page with a granule position');
}
