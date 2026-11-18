// Objective sound-quality checks for the procedural audio: offline renders (browser only, via
// OfflineAudioContext) and a pure measurement of a rendered signal. AudioQuality.stories.tsx runs
// them in real Chromium and asserts QUALITY_LIMITS; measureAudio is unit-tested in Node.

import { type KnownMusicId, renderTrack } from './music';
import { type KnownSfxId, playSfx } from './sfx';

export interface AudioMeasurement {
  /** Largest absolute sample. */
  peak: number;
  /** Root-mean-square level over the whole signal. */
  rms: number;
  /** Fraction of the signal energy above HIGH_BAND_HZ (0–1); a proxy for harshness/shrillness. */
  highBandRatio: number;
  /** Absolute value of the first sample (a non-zero start is a click). */
  startClick: number;
  /** RMS of the last 20 ms (how well the sound has decayed by its end). */
  endLevel: number;
  durationSec: number;
}

export const HIGH_BAND_HZ = 6000;

export type QualityKind = 'sfx' | 'sfxBright' | 'music';

/** Thresholds asserted by the quality story. `sfxBright` is for the delicate sparkle/metal sounds. */
export const QUALITY_LIMITS: Record<
  QualityKind,
  {
    maxPeak: number;
    minRms: number;
    maxHighBand: number;
    maxStartClick: number;
    maxEndLevel: number;
  }
> = {
  sfx: { maxPeak: 0.6, minRms: 0.01, maxHighBand: 0.01, maxStartClick: 0.001, maxEndLevel: 0.001 },
  sfxBright: {
    maxPeak: 0.6,
    minRms: 0.01,
    maxHighBand: 0.02,
    maxStartClick: 0.001,
    maxEndLevel: 0.001,
  },
  // Music is measured on its first 8 s; it loops, so its end is not expected to be silent.
  music: { maxPeak: 0.45, minRms: 0.02, maxHighBand: 0.002, maxStartClick: 0.001, maxEndLevel: 1 },
};

/** Which limit set applies to a sound. */
export function sfxQualityKind(id: KnownSfxId): QualityKind {
  return id === 'twinkle' || id === 'coin' ? 'sfxBright' : 'sfx';
}

/** Human-readable reasons a measurement breaks its limits (empty when it passes). */
export function qualityFailures(kind: QualityKind, m: AudioMeasurement): string[] {
  const l = QUALITY_LIMITS[kind];
  const failures: string[] = [];
  if (m.peak > l.maxPeak) failures.push(`peak ${m.peak.toFixed(3)} > ${l.maxPeak}`);
  if (m.rms < l.minRms) failures.push(`rms ${m.rms.toFixed(4)} < ${l.minRms}`);
  if (m.highBandRatio > l.maxHighBand) {
    failures.push(`high band ${m.highBandRatio.toFixed(4)} > ${l.maxHighBand}`);
  }
  if (m.startClick > l.maxStartClick) failures.push(`start click ${m.startClick.toFixed(4)}`);
  if (m.endLevel > l.maxEndLevel)
    failures.push(`end level ${m.endLevel.toFixed(4)} > ${l.maxEndLevel}`);
  return failures;
}

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** RBJ cookbook high-pass coefficients, normalised by a0. */
function highPass(cutoff: number, sampleRate: number, q = Math.SQRT1_2): Biquad {
  const w0 = (2 * Math.PI * cutoff) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: (1 + cos) / 2 / a0,
    b1: -(1 + cos) / a0,
    b2: (1 + cos) / 2 / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

function filter(input: Float32Array, c: Biquad): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i += 1) {
    const x = input[i] ?? 0;
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

function energy(samples: Float32Array, from = 0, to = samples.length): number {
  let sum = 0;
  for (let i = from; i < to; i += 1) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return sum;
}

/** Pure measurement of a mono signal. */
export function measureAudio(samples: Float32Array, sampleRate: number): AudioMeasurement {
  const n = samples.length;
  let peak = 0;
  for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(samples[i] ?? 0));
  const total = energy(samples);
  let highBandRatio = 0;
  if (total > 0 && HIGH_BAND_HZ < sampleRate / 2) {
    // Two cascaded 2nd-order sections: a 24 dB/octave high-pass at HIGH_BAND_HZ.
    const c = highPass(HIGH_BAND_HZ, sampleRate);
    highBandRatio = Math.min(1, energy(filter(filter(samples, c), c)) / total);
  }
  const tail = Math.min(n, Math.round(sampleRate * 0.02));
  return {
    peak,
    rms: n > 0 ? Math.sqrt(total / n) : 0,
    highBandRatio,
    startClick: Math.abs(samples[0] ?? 0),
    endLevel: tail > 0 ? Math.sqrt(energy(samples, n - tail, n) / tail) : 0,
    durationSec: n / sampleRate,
  };
}

/** Measures every channel of a buffer and keeps the worst value of each metric. */
export function measureBuffer(buffer: AudioBuffer): AudioMeasurement {
  const per = Array.from({ length: buffer.numberOfChannels }, (_, ch) =>
    measureAudio(buffer.getChannelData(ch), buffer.sampleRate),
  );
  const worst = (key: keyof AudioMeasurement, pick: (...v: number[]) => number) =>
    pick(...per.map((m) => m[key]));
  return {
    peak: worst('peak', Math.max),
    rms: worst('rms', Math.min),
    highBandRatio: worst('highBandRatio', Math.max),
    startClick: worst('startClick', Math.max),
    endLevel: worst('endLevel', Math.max),
    durationSec: buffer.duration,
  };
}

/** Renders one sound effect, from its start to its scheduled end, in a stereo offline context. */
export async function renderSfxOffline(id: KnownSfxId, sampleRate = 44_100): Promise<AudioBuffer> {
  // A throwaway context tells us how long the sound is; it is never rendered.
  const probe = new OfflineAudioContext(2, 1, sampleRate);
  const end = playSfx(probe, probe.destination, id, 0).endTime;
  const ctx = new OfflineAudioContext(2, Math.ceil(end * sampleRate), sampleRate);
  playSfx(ctx, ctx.destination, id, 0);
  return ctx.startRendering();
}

/** Renders the first `seconds` of a music track in a stereo offline context. */
export async function renderMusicOffline(
  id: KnownMusicId,
  seconds: number,
  sampleRate = 44_100,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  renderTrack(ctx, ctx.destination, id, 0, seconds);
  return ctx.startRendering();
}
