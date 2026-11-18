// The `gemini` provider (07 §3): `gemini-3.8-flash-tts` on `v1beta`, build time only (never at
// runtime, 07 §0). Interactive `generateContent` calls for small runs, the Batch API (50% cost)
// otherwise. Request shape verified against the live speech-generation guide on 2026-11-18:
// `parts[].speech_metadata.style`, `generationConfig.speechConfig.voiceConfig.voice`, unary responses
// carry a 24 kHz mono 16-bit WAV in `candidates[0].content.parts[].inlineData`.
//
// Batch jobs are resumable: each job's name is saved under the state directory before polling, so a
// later run picks up the same job instead of paying again.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isWav, pcmToWav } from '../audio';
import { pool, type Renderer, type TokenUsage, type TtsOutcome, type TtsRequest } from './types';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Clips per batch job: keeps each job's inline responses well under the API's size limits. */
export const BATCH_CHUNK = 100;
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export interface GeminiOptions {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Milliseconds between batch status polls. */
  pollMs?: number;
  /** Attempts per interactive request (429/5xx/network errors are retried with backoff). */
  attempts?: number;
  now?: () => number;
}

/** The GenerateContentRequest for one clip. */
export function ttsRequestBody(r: TtsRequest) {
  return {
    contents: [
      { role: 'user', parts: [{ text: r.text, speech_metadata: { style: r.styleText } }] },
    ],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { voice: r.voiceName } },
    },
  };
}

interface InlineData {
  mimeType?: string;
  data?: string;
}
interface GenerateContentResponse {
  candidates?: { content?: { parts?: { inlineData?: InlineData }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

/** Audio and token usage from a generateContent response; throws with the reason when absent. */
export function audioFromResponse(json: GenerateContentResponse): {
  wav: Uint8Array;
  usage: TokenUsage;
} {
  const usage = {
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens:
      json.usageMetadata?.candidatesTokenCount ??
      Math.max(
        0,
        (json.usageMetadata?.totalTokenCount ?? 0) - (json.usageMetadata?.promptTokenCount ?? 0),
      ),
  };
  const candidate = json.candidates?.[0];
  const inline = candidate?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!inline?.data) {
    const reason =
      json.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'no audio in the response';
    throw new Error(`Gemini returned no audio (${reason})`);
  }
  const bytes = new Uint8Array(Buffer.from(inline.data, 'base64'));
  if (isWav(bytes)) return { wav: bytes, usage };
  const mime = (inline.mimeType ?? '').toLowerCase();
  if (/l16|pcm/.test(mime)) {
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
    return { wav: pcmToWav({ sampleRate: rate, channels: 1, data: bytes }), usage };
  }
  throw new Error(`Gemini returned unsupported audio (${inline.mimeType ?? 'unknown type'})`);
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs: number | null,
  ) {
    super(message);
  }
}

/** A short, key-free description of an error response. */
async function describe(res: Response): Promise<string> {
  let detail = '';
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string } };
    detail = body.error?.message ?? body.error?.status ?? '';
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`;
}

export function geminiRenderer(opts: GeminiOptions): Renderer {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const attempts = opts.attempts ?? 5;
  const headers = { 'x-goog-api-key': opts.apiKey, 'content-type': 'application/json' };

  async function call(method: 'GET' | 'POST', url: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new HttpError(0, `network error: ${e instanceof Error ? e.message : String(e)}`, null);
    }
    if (!res.ok) {
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new HttpError(
        res.status,
        await describe(res),
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
      );
    }
    return res.json();
  }

  async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await fn();
      } catch (e) {
        const retryable = e instanceof HttpError && (e.status === 0 || RETRY_STATUS.has(e.status));
        if (!retryable || attempt >= attempts) throw e;
        await sleep(e.retryAfterMs ?? Math.min(30_000, 1000 * 2 ** (attempt - 1)));
      }
    }
  }

  async function interactive(
    requests: readonly TtsRequest[],
    ctx: Parameters<Renderer['render']>[1],
  ) {
    let stopped = false;
    await pool(
      requests,
      ctx.concurrency,
      async (r) => {
        if (!ctx.canSpend(ctx.estimateUsd([r]))) {
          stopped = true;
          return;
        }
        let outcome: TtsOutcome;
        try {
          const json = await withRetry(() =>
            call('POST', `${GEMINI_BASE}/models/${opts.model}:generateContent`, ttsRequestBody(r)),
          );
          outcome = { id: r.id, ok: true, ...audioFromResponse(json as GenerateContentResponse) };
        } catch (e) {
          outcome = { id: r.id, ok: false, error: e instanceof Error ? e.message : String(e) };
        }
        await ctx.onResult(outcome);
      },
      () => stopped,
    );
    if (stopped) ctx.log('narration: spend cap reached; stopped before rendering every clip.');
  }

  async function batch(requests: readonly TtsRequest[], ctx: Parameters<Renderer['render']>[1]) {
    const stateFile = join(ctx.stateDir, 'gemini-batches.json');
    const state = readState(stateFile);
    const save = () => {
      mkdirSync(ctx.stateDir, { recursive: true });
      writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
    };

    type Job = { key: string; name: string; requests: TtsRequest[] };
    const active: Job[] = [];
    for (let i = 0; i < requests.length; i += BATCH_CHUNK) {
      const chunk = requests.slice(i, i + BATCH_CHUNK);
      const key = chunkKey(opts.model, chunk);
      const saved = state[key];
      if (saved) {
        ctx.log(`narration: resuming batch ${saved.name} (${chunk.length} clips)`);
        active.push({ key, name: saved.name, requests: chunk });
        continue;
      }
      if (!ctx.canSpend(ctx.estimateUsd(chunk))) {
        ctx.log('narration: spend cap reached; not starting further batches.');
        break;
      }
      const created = (await withRetry(() =>
        call('POST', `${GEMINI_BASE}/models/${opts.model}:batchGenerateContent`, {
          batch: {
            display_name: `number-island-narration-${key.slice(0, 12)}`,
            input_config: {
              requests: {
                requests: chunk.map((r) => ({
                  request: ttsRequestBody(r),
                  metadata: { key: r.id },
                })),
              },
            },
          },
        }),
      )) as { name?: string };
      if (!created.name) throw new Error('Gemini batch creation returned no job name');
      state[key] = { name: created.name, createdAt: new Date(now()).toISOString() };
      save();
      ctx.log(`narration: started batch ${created.name} (${chunk.length} clips)`);
      active.push({ key, name: created.name, requests: chunk });
    }

    const deadline = now() + ctx.maxWaitMs;
    const pollMs = opts.pollMs ?? 30_000;
    while (active.length > 0) {
      for (const job of [...active]) {
        const json = await withRetry(() => call('GET', `${GEMINI_BASE}/${job.name}`));
        const status = batchState(json);
        if (status === 'running') continue;
        active.splice(active.indexOf(job), 1);
        delete state[job.key];
        save();
        if (status !== 'succeeded') {
          ctx.log(`narration: batch ${job.name} ended ${status}; its clips were not rendered.`);
          for (const r of job.requests) {
            await ctx.onResult({ id: r.id, ok: false, error: `batch ${status}` });
          }
          continue;
        }
        const results = await batchResults(json, (file) =>
          withRetry(async () => {
            const res = await doFetch(
              `${GEMINI_BASE.replace('/v1beta', '/download/v1beta')}/${file}:download?alt=media`,
              { headers },
            );
            if (!res.ok) throw new HttpError(res.status, await describe(res), null);
            return res.text();
          }),
        );
        const seen = new Set<string>();
        for (const item of results) {
          if (!item.key || seen.has(item.key)) continue;
          seen.add(item.key);
          let outcome: TtsOutcome;
          try {
            if (item.error) throw new Error(item.error.message ?? 'batch item failed');
            outcome = { id: item.key, ok: true, ...audioFromResponse(item.response ?? {}) };
          } catch (e) {
            outcome = {
              id: item.key,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            };
          }
          await ctx.onResult(outcome);
        }
        for (const r of job.requests) {
          if (!seen.has(r.id)) {
            await ctx.onResult({ id: r.id, ok: false, error: 'missing from batch results' });
          }
        }
      }
      if (active.length === 0) break;
      if (now() >= deadline) {
        ctx.log(
          `narration: ${active.length} batch job(s) still running after ${Math.round(ctx.maxWaitMs / 60000)} min; re-run the same command to resume them (no new spend).`,
        );
        return;
      }
      await sleep(pollMs);
    }
  }

  return {
    provider: 'gemini',
    model: opts.model,
    render: (requests, ctx) =>
      ctx.mode === 'batch' ? batch(requests, ctx) : interactive(requests, ctx),
  };
}

type BatchState = Record<string, { name: string; createdAt: string }>;

function readState(file: string): BatchState {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as BatchState;
  } catch {
    return {};
  }
}

/** Identifies a chunk by model and the exact clips in it, so a resumed run finds its job. */
export function chunkKey(model: string, chunk: readonly TtsRequest[]): string {
  const h = createHash('sha256').update(model);
  for (const r of chunk) h.update(`\n${r.id}\t${r.voiceName}\t${r.styleText}\t${r.text}`);
  return h.digest('hex');
}

/** Normalises a batch's state (`BATCH_STATE_*` in REST, `JOB_STATE_*` in the SDK docs). */
export function batchState(json: unknown): 'running' | 'succeeded' | 'failed' {
  const j = json as { state?: string; metadata?: { state?: string }; done?: boolean };
  const raw = (j.metadata?.state ?? j.state ?? '').toUpperCase();
  if (raw.endsWith('SUCCEEDED')) return 'succeeded';
  if (/(FAILED|CANCELLED|EXPIRED)$/.test(raw)) return 'failed';
  if (j.done && !raw) return 'succeeded';
  return 'running';
}

interface BatchItem {
  key?: string;
  response?: GenerateContentResponse;
  error?: { message?: string };
}

/**
 * Results of a finished batch: inline responses (either documented location) or a JSONL responses
 * file, fetched with `download`.
 */
export async function batchResults(
  json: unknown,
  download: (file: string) => Promise<string>,
): Promise<BatchItem[]> {
  type Inlined = { metadata?: { key?: string }; key?: string } & BatchItem;
  type Holder = {
    inlinedResponses?: Inlined[] | { inlinedResponses?: Inlined[] };
    responsesFile?: string;
    fileName?: string;
  };
  const j = json as { response?: Holder; dest?: Holder; metadata?: { output?: Holder } };
  for (const holder of [j.response, j.dest, j.metadata?.output]) {
    if (!holder) continue;
    const inl = holder.inlinedResponses;
    const list = Array.isArray(inl) ? inl : inl?.inlinedResponses;
    if (list) {
      return list.map((x) => ({
        key: x.metadata?.key ?? x.key,
        response: x.response,
        error: x.error,
      }));
    }
    const file = holder.responsesFile ?? holder.fileName;
    if (file) {
      const text = await download(file);
      return text
        .split('\n')
        .filter((l) => l.trim() !== '')
        .map((l) => {
          const x = JSON.parse(l) as Inlined;
          return { key: x.key ?? x.metadata?.key, response: x.response, error: x.error };
        });
    }
  }
  throw new Error('finished batch has no results');
}
