// Cost estimate and metering (07 §3 cost guard). Prices are per 1M tokens from the Gemini pricing
// page (research 05 §1.6, verified 2026-11-17); audio is billed at 25 tokens per second. Prices
// double on 2027-01-01. Batch is 50% of standard.
import type { ProviderId } from './config';

export interface TokenPrice {
  inputPerM: number;
  outputPerM: number;
}

export const AUDIO_TOKENS_PER_SEC = 25;
const PRICE_CHANGE = Date.UTC(2027, 0, 1);

const GEMINI_PRICES: Record<string, TokenPrice> = {
  'gemini-3.8-flash-tts': { inputPerM: 0.5, outputPerM: 9 },
  'gemini-3.8-flash-lite-tts': { inputPerM: 0.5, outputPerM: 6 },
};

/** Standard (interactive) price for a model at a time; unknown Gemini models use the flagship's. */
export function priceFor(provider: ProviderId, model: string, now: number): TokenPrice {
  if (provider !== 'gemini') return { inputPerM: 0, outputPerM: 0 };
  const base = GEMINI_PRICES[model] ?? (GEMINI_PRICES['gemini-3.8-flash-tts'] as TokenPrice);
  const factor = now >= PRICE_CHANGE ? 2 : 1;
  return { inputPerM: base.inputPerM * factor, outputPerM: base.outputPerM * factor };
}

export type RenderMode = 'interactive' | 'batch';

export function costUsd(
  price: TokenPrice,
  mode: RenderMode,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const discount = mode === 'batch' ? 0.5 : 1;
  return (
    ((usage.inputTokens * price.inputPerM + usage.outputTokens * price.outputPerM) / 1e6) * discount
  );
}

/**
 * Seconds of audio a line is expected to bill. Deliberately generous so the cap errs safe: slow,
 * child-directed delivery at ~10 characters a second plus a second of the silence Gemini returns
 * around each clip (calibrated on the 2026-11-18 audition: 25 lines billed ~116 s for ~104 s of
 * trimmed speech).
 */
export function estimateSeconds(text: string): number {
  return 1 + text.length / 10;
}

/** Input tokens: the transcript and the style text (~4 characters a token) plus request overhead. */
export function estimateInputTokens(text: string, styleText: string): number {
  return Math.ceil((text.length + styleText.length) / 4) + 16;
}

export interface Estimate {
  clips: number;
  audioSeconds: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export function estimate(
  jobs: readonly { text: string; styleText: string }[],
  price: TokenPrice,
  mode: RenderMode,
): Estimate {
  let audioSeconds = 0;
  let inputTokens = 0;
  for (const j of jobs) {
    audioSeconds += estimateSeconds(j.text);
    inputTokens += estimateInputTokens(j.text, j.styleText);
  }
  const outputTokens = Math.ceil(audioSeconds * AUDIO_TOKENS_PER_SEC);
  return {
    clips: jobs.length,
    audioSeconds,
    inputTokens,
    outputTokens,
    usd: costUsd(price, mode, { inputTokens, outputTokens }),
  };
}
