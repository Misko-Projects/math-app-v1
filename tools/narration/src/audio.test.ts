import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isWav, oggOpusDurationMs, pcmToWav, stubWav, wavDurationMs } from './audio';
import { costUsd, estimate, priceFor, SpendGuard } from './cost';
import { ffmpegStaticPath, opusEncoder } from './encode';

describe('WAV helpers', () => {
  it('builds and measures 16-bit PCM WAV', () => {
    const wav = pcmToWav({ sampleRate: 24000, channels: 1, data: new Uint8Array(24000) });
    expect(isWav(wav)).toBe(true);
    expect(wavDurationMs(wav)).toBe(500);
  });

  it('makes deterministic stub audio of the requested length', () => {
    expect(stubWav(300)).toEqual(stubWav(300));
    expect(wavDurationMs(stubWav(300))).toBe(300);
  });

  it('rejects non-WAV and non-Ogg bytes', () => {
    expect(() => wavDurationMs(new Uint8Array(20))).toThrow(/not a WAV/);
    expect(() => oggOpusDurationMs(new Uint8Array(40))).toThrow(/not an Ogg/);
  });
});

const ffmpeg = ffmpegStaticPath();
describe.skipIf(!ffmpeg || !existsSync(ffmpeg))(
  'Opus encoding (local only: CI has no ffmpeg)',
  () => {
    it('encodes WAV to Ogg Opus, trims silence and measures the result', async () => {
      const encoder = opusEncoder(ffmpeg as string);
      const ogg = await encoder.encode(stubWav(1000));
      expect(String.fromCharCode(...ogg.subarray(0, 4))).toBe('OggS');
      // The 80 ms blip survives; most of the trailing silence is trimmed.
      const ms = encoder.durationMs(ogg);
      expect(ms).toBeGreaterThan(80);
      expect(ms).toBeLessThan(400);
      // Bit-exact: the same input gives the same bytes.
      expect(await encoder.encode(stubWav(1000))).toEqual(ogg);
    });
  },
);

describe('cost', () => {
  it('prices Gemini Flash TTS, halves it for batch and doubles it from 2027', () => {
    const now = Date.UTC(2026, 10, 18);
    const price = priceFor('gemini', 'gemini-3.8-flash-tts', now);
    expect(price).toEqual({ inputPerM: 0.5, outputPerM: 9 });
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(costUsd(price, 'interactive', usage)).toBeCloseTo(9.5);
    expect(costUsd(price, 'batch', usage)).toBeCloseTo(4.75);
    expect(priceFor('gemini', 'gemini-3.8-flash-tts', Date.UTC(2027, 0, 1))).toEqual({
      inputPerM: 1,
      outputPerM: 18,
    });
    expect(priceFor('stub', 'stub-1', now)).toEqual({ inputPerM: 0, outputPerM: 0 });
  });

  it('caps measured spend plus every outstanding reservation', () => {
    // Review round 1: $0.35 cap, two $0.10 requests in flight, the first settles at $0.21.
    const guard = new SpendGuard(0.35);
    expect(guard.reserve(['a'], 0.1)).toBe(true);
    expect(guard.reserve(['b'], 0.1)).toBe(true);
    guard.settle('a', 0.21);
    // 0.21 measured + 0.10 outstanding (b) + 0.10 new = 0.41 > 0.35.
    expect(guard.reserve(['c'], 0.1)).toBe(false);
    guard.settle('b', 0.05);
    // 0.26 measured + 0.05 new = 0.31 ≤ 0.35.
    expect(guard.reserve(['c'], 0.05)).toBe(true);
    expect(guard.spentUsd).toBeCloseTo(0.26);
    expect(guard.outstandingUsd).toBeCloseTo(0.05);
    // Spending that already happened (an adopted batch) is recorded even past the cap.
    expect(guard.reserve(['d', 'e'], 1, { force: true })).toBe(true);
    expect(guard.reserve(['f'], 0.001)).toBe(false);
  });

  it('estimates audio length and cost generously from the text', () => {
    const price = priceFor('gemini', 'gemini-3.8-flash-tts', Date.UTC(2026, 10, 18));
    const e = estimate([{ text: 'x'.repeat(40), styleText: 'warm' }], price, 'interactive');
    expect(e.audioSeconds).toBeCloseTo(5);
    expect(e.outputTokens).toBe(125);
    expect(e.usd).toBeGreaterThan(125 * 9e-6);
  });
});
