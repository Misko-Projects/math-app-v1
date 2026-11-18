// The renderer interface (07 §3): render(lines) → audio. Every provider returns WAV, which the
// pipeline encodes to Opus.
import type { ProviderId } from '../config';
import type { RenderMode } from '../cost';

export interface TtsRequest {
  /** Clip id, used to match results to requests. */
  id: string;
  text: string;
  /** Provider voice name. */
  voiceName: string;
  /** Delivery style text (ignored by providers without style control). */
  styleText: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type TtsOutcome =
  | { id: string; ok: true; wav: Uint8Array; usage?: TokenUsage }
  | { id: string; ok: false; error: string; usage?: TokenUsage };

export interface RenderContext {
  mode: RenderMode;
  /** Requests in flight at once (interactive mode). */
  concurrency: number;
  /**
   * Asked before each paid request or batch: reserves `usd` (the estimate) for those clip ids
   * until their results arrive. False means measured spend plus outstanding reservations plus this
   * one would pass the cap, so nothing new may start. `force` records spending that already
   * happened (an adopted batch job) and always succeeds.
   */
  reserve(ids: readonly string[], usd: number, opts?: { force?: boolean }): boolean;
  /** Called once per finished request, in completion order. Awaited before the next result. */
  onResult(outcome: TtsOutcome): Promise<void>;
  log(message: string): void;
  /** Directory for resumable provider state (batch job names). */
  stateDir: string;
  /** Longest time to wait for batch jobs before leaving them to a later run. */
  maxWaitMs: number;
  /** Estimated cost of these requests, for `reserve`. */
  estimateUsd(requests: readonly TtsRequest[]): number;
}

export interface Renderer {
  readonly provider: ProviderId;
  readonly model: string;
  /** Renders every request; failures are reported through `onResult`, never thrown per clip. */
  render(requests: readonly TtsRequest[], ctx: RenderContext): Promise<void>;
}

/** Runs `task` over `items` with at most `limit` in flight; stops taking new items when `stop()`. */
export async function pool<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
  stop: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !stop()) {
      const item = items[next] as T;
      next += 1;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}
