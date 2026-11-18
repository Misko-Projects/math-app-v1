// Demo clips for the Storybook Audio Lab: until tools/narration (A02) renders real narration, each
// clip id is served as a short, soft sung tone (a WAV built in memory) so stitching order, gapless
// scheduling, cancellation and ducking can be heard. Every word gets its own pitch from a C-major
// pentatonic scale, so the sequence of clips is audible as a little melody.

const SAMPLE_RATE = 22_050;
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A mono 16-bit WAV: a soft vowel-like tone with a gentle attack and release. */
export function demoClipWav(clipId: string, durationMs: number): ArrayBuffer {
  const n = Math.max(1, Math.round((durationMs / 1000) * SAMPLE_RATE));
  const semis = PENTATONIC[hash(clipId) % PENTATONIC.length] ?? 0;
  const freq = 261.63 * 2 ** (semis / 12);
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, n * 2, true);
  const attack = Math.min(n / 4, SAMPLE_RATE * 0.02);
  const release = Math.min(n / 3, SAMPLE_RATE * 0.08);
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const env = Math.min(1, i / attack, (n - i) / release);
    // Fundamental plus soft 2nd and 3rd partials, with a slow vibrato: a hummed "ooh".
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t);
    const ph = 2 * Math.PI * freq * vib * t;
    const s = Math.sin(ph) + 0.3 * Math.sin(2 * ph) + 0.1 * Math.sin(3 * ph);
    view.setInt16(44 + i * 2, Math.round(s * env * 0.28 * 32767), true);
  }
  return buffer;
}
