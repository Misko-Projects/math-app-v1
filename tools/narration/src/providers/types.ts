// The renderer interface (07 §3): render(lines) → audio. Every provider returns WAV, which the
// pipeline encodes to Opus.
import type { ProviderId } from '../config';
import type { RenderMode } from '../cost';

export interface TtsRequest {
  /**
   * Identifies the audio to produce. The pipeline passes the clip file's content hash, so clips
   * that share a file are one request, and a resumed job matches whichever clip still needs it.
   */
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
  | { id: string; ok: true; wav: Uint8Array; usage?: TokenUsage; billing?: RenderMode }
  | { id: string; ok: false; error: string; usage?: TokenUsage; billing?: RenderMode };

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
  /**
   * Called once per finished request, in completion order, and awaited before the next result.
   * Resolves false when audio arrived but could not be stored (encoding or writing failed), so a
   * provider that can fetch it again (a finished batch job) keeps it for the next run.
   */
  onResult(outcome: TtsOutcome): Promise<boolean>;
  log(message: string): void;
  /** Directory for resumable provider state (batch job names). */
  stateDir: string;
  /** Longest time to wait for batch jobs before leaving them to a later run. */
  maxWaitMs: number;
  /** Estimated cost of these requests at a billing mode (default: the run's mode), for `reserve`. */
  estimateUsd(requests: readonly TtsRequest[], mode?: RenderMode): number;
  /**
   * True for an unfiltered render of every clip the content needs: only then may a provider treat
   * saved work that no current request matches as stale. Filtered renders and auditions leave it.
   */
  complete: boolean;
  /** Drop saved batch submissions that were never confirmed and cannot be found (operator flag). */
  abandonUnconfirmedBatches?: boolean;
}

export interface Renderer {
  readonly provider: ProviderId;
  readonly model: string;
  /** Requests that saved provider work already covers, so the estimate can leave them out. */
  covered?(requests: readonly TtsRequest[], stateDir: string): Set<string>;
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
