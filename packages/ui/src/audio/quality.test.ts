import { describe, expect, it } from 'vitest';
import {
  type AudioMeasurement,
  measureAudio,
  QUALITY_LIMITS,
  qualityFailures,
  sfxQualityKind,
} from './quality';

const SR = 48_000;

function signal(seconds: number, fn: (t: number) => number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i += 1) out[i] = fn(i / SR);
  return out;
}

const sine = (hz: number, amp: number) => (t: number) => amp * Math.sin(2 * Math.PI * hz * t);

describe('measureAudio', () => {
  it('measures silence as all zeros', () => {
    const m = measureAudio(new Float32Array(SR), SR);
    expect(m).toEqual({
      peak: 0,
      rms: 0,
      highBandRatio: 0,
      startClick: 0,
      endLevel: 0,
      durationSec: 1,
    });
  });

  it('measures a low sine: peak, rms, no high band, no click', () => {
    const m = measureAudio(signal(1, sine(440, 0.5)), SR);
    expect(m.peak).toBeCloseTo(0.5, 3);
    expect(m.rms).toBeCloseTo(0.5 / Math.SQRT2, 3);
    expect(m.highBandRatio).toBeLessThan(0.001);
    expect(m.startClick).toBe(0);
    expect(m.endLevel).toBeCloseTo(0.5 / Math.SQRT2, 2);
    expect(m.durationSec).toBe(1);
  });

  it('puts high sines mostly in the high band (24 dB/octave roll-off below 6 kHz)', () => {
    expect(measureAudio(signal(1, sine(15_000, 0.3)), SR).highBandRatio).toBeGreaterThan(0.95);
    expect(measureAudio(signal(1, sine(10_000, 0.3)), SR).highBandRatio).toBeGreaterThan(0.8);
    expect(measureAudio(signal(1, sine(3_000, 0.3)), SR).highBandRatio).toBeLessThan(0.1);
  });

  it('splits energy between bands for a two-tone mix', () => {
    const mix = (t: number) => sine(440, 0.3)(t) + sine(15_000, 0.3)(t);
    const ratio = measureAudio(signal(1, mix), SR).highBandRatio;
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.55);
  });

  it('reports a click at the start and a decayed tail at the end', () => {
    const decaying = (t: number) => 0.4 * Math.exp(-t * 20) * Math.cos(2 * Math.PI * 300 * t);
    const m = measureAudio(signal(1, decaying), SR);
    expect(m.startClick).toBeCloseTo(0.4, 5);
    expect(m.endLevel).toBeLessThan(1e-6);
  });

  it('reports no high band when 6 kHz is above Nyquist', () => {
    const m = measureAudio(
      Float32Array.from({ length: 8000 }, (_, i) => Math.sin(i)),
      8000,
    );
    expect(m.highBandRatio).toBe(0);
  });
});

describe('qualityFailures', () => {
  const good: AudioMeasurement = {
    peak: 0.3,
    rms: 0.05,
    highBandRatio: 0.001,
    startClick: 0,
    endLevel: 0.0001,
    durationSec: 0.5,
  };

  it('passes a measurement inside the limits', () => {
    expect(qualityFailures('sfx', good)).toEqual([]);
    expect(qualityFailures('music', { ...good, endLevel: 0.1 })).toEqual([]);
  });

  it('names every broken limit', () => {
    const bad = {
      ...good,
      peak: 0.9,
      rms: 0.001,
      highBandRatio: 0.5,
      startClick: 0.2,
      endLevel: 0.1,
    };
    expect(qualityFailures('sfx', bad)).toHaveLength(5);
  });

  it('gives the delicate bright sounds a higher, still bounded, high-band limit', () => {
    expect(sfxQualityKind('twinkle')).toBe('sfxBright');
    expect(sfxQualityKind('knock')).toBe('sfx');
    expect(QUALITY_LIMITS.sfxBright.maxHighBand).toBeGreaterThan(QUALITY_LIMITS.sfx.maxHighBand);
    expect(QUALITY_LIMITS.sfxBright.maxHighBand).toBeLessThanOrEqual(0.05);
  });
});
