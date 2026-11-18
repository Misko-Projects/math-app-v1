// The `gemini` provider (07 §3): `gemini-3.8-flash-tts` on `v1beta`, build time only (never at
// runtime, 07 §0). Interactive `generateContent` calls for small runs, the Batch API (50% cost)
// otherwise. Request shape verified against the live speech-generation guide on 2026-11-18:
// `parts[].speech_metadata.style`, `generationConfig.speechConfig.voiceConfig.voice`, unary responses
// carry a 24 kHz mono 16-bit WAV in `candidates[0].content.parts[].inlineData`.
//
// Batch jobs are resumable: each job's name and its clips' request hashes are saved under the state
// directory before polling, so any later run adopts the job for every clip still needed instead of
// paying again. The API key is redacted from every error message.
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

/** A short description of an error response (the caller redacts the key). */
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

/**
 * Saved batch jobs (`<stateDir>/gemini-batches.json`), keyed by job name. Each job records which clip
 * it renders and a hash of that clip's request, so a later run (in any mode, with any subset of
 * clips still missing) adopts the job for every clip whose request is unchanged instead of paying
 * for it again.
 */
interface BatchStateFile {
  version: 2;
  jobs: Record<
    string,
    { model: string; displayName: string; createdAt: string; requests: Record<string, string> }
  >;
}

/** Hash of everything that decides a clip's audio, so a changed line never adopts an old result. */
export function requestHash(model: string, r: TtsRequest): string {
  return createHash('sha256')
    .update(JSON.stringify([model, r.id, r.voiceName, r.styleText, r.text]))
    .digest('hex')
    .slice(0, 16);
}

function readState(file: string): BatchStateFile {
  if (!existsSync(file)) return { version: 2, jobs: {} };
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<BatchStateFile>;
    if (data.version === 2 && data.jobs && typeof data.jobs === 'object') {
      return { version: 2, jobs: data.jobs };
    }
  } catch {
    // unreadable: start empty
  }
  return { version: 2, jobs: {} };
}

/** Statuses that prove the server rejected a batch creation without creating it. */
const DEFINITE_REJECTION = (status: number) => status >= 400 && status < 500 && status !== 408;

export function geminiRenderer(opts: GeminiOptions): Renderer {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const attempts = opts.attempts ?? 5;
  const headers = { 'x-goog-api-key': opts.apiKey, 'content-type': 'application/json' };
  /** Removes the API key from any text that may reach a log, an error or a report. */
  const redact = (text: string) =>
    opts.apiKey ? text.split(opts.apiKey).join('[redacted]') : text;
  const message = (e: unknown) => redact(e instanceof Error ? e.message : String(e));

  async function call(method: 'GET' | 'POST', url: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new HttpError(0, `network error: ${message(e)}`, null);
    }
    if (!res.ok) {
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new HttpError(
        res.status,
        redact(await describe(res)),
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
      );
    }
    return res.json();
  }

  const backoff = (e: HttpError, attempt: number) =>
    e.retryAfterMs ?? Math.min(30_000, 1000 * 2 ** (attempt - 1));

  /**
   * Retries 408/429/5xx and network errors. Only for requests that are safe to repeat: reads, and
   * generateContent, which Gemini bills only when it returns audio.
   */
  async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await fn();
      } catch (e) {
        const retryable = e instanceof HttpError && (e.status === 0 || RETRY_STATUS.has(e.status));
        if (!retryable || attempt >= attempts) throw e;
        await sleep(backoff(e, attempt));
      }
    }
  }

  type Ctx = Parameters<Renderer['render']>[1];

  async function interactive(requests: readonly TtsRequest[], ctx: Ctx) {
    let stopped = false;
    await pool(
      requests,
      ctx.concurrency,
      async (r) => {
        if (!ctx.reserve([r.id], ctx.estimateUsd([r]))) {
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
          outcome = { id: r.id, ok: false, error: message(e) };
        }
        await ctx.onResult(outcome);
      },
      () => stopped,
    );
    if (stopped) ctx.log('narration: spend cap reached; stopped before rendering every clip.');
  }

  /** Finds a batch by display name (recovers a job whose creation response was lost). */
  async function findBatch(displayName: string): Promise<string | null> {
    let pageToken = '';
    for (let page = 0; page < 10; page += 1) {
      let json: {
        batches?: { name?: string; displayName?: string; metadata?: { displayName?: string } }[];
        operations?: { name?: string; metadata?: { displayName?: string; name?: string } }[];
        nextPageToken?: string;
      };
      try {
        json = (await withRetry(() =>
          call(
            'GET',
            `${GEMINI_BASE}/batches?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
          ),
        )) as typeof json;
      } catch {
        return null;
      }
      for (const b of json.batches ?? []) {
        if ((b.displayName ?? b.metadata?.displayName) === displayName && b.name) return b.name;
      }
      for (const op of json.operations ?? []) {
        if (op.metadata?.displayName === displayName) return op.metadata.name ?? op.name ?? null;
      }
      if (!json.nextPageToken) return null;
      pageToken = json.nextPageToken;
    }
    return null;
  }

  /**
   * Creates one batch job. A creation POST is never repeated blindly: only a 429 (rejected, nothing
   * created) is retried. After an ambiguous failure (network error, timeout, 5xx) the job is looked
   * up by its display name, and the run stops if it cannot be found, so a lost response never
   * becomes a second paid job.
   */
  async function createBatch(chunk: readonly TtsRequest[], displayName: string): Promise<string> {
    const body = {
      batch: {
        display_name: displayName,
        input_config: {
          requests: {
            requests: chunk.map((r) => ({ request: ttsRequestBody(r), metadata: { key: r.id } })),
          },
        },
      },
    };
    for (let attempt = 1; ; attempt += 1) {
      try {
        const created = (await call(
          'POST',
          `${GEMINI_BASE}/models/${opts.model}:batchGenerateContent`,
          body,
        )) as { name?: string };
        if (created.name) return created.name;
        throw new HttpError(0, 'batch creation returned no job name', null);
      } catch (e) {
        if (e instanceof HttpError && e.status === 429 && attempt < attempts) {
          await sleep(backoff(e, attempt));
          continue;
        }
        if (e instanceof HttpError && DEFINITE_REJECTION(e.status)) throw e;
        const found = await findBatch(displayName);
        if (found) return found;
        throw new Error(
          `creating batch ${displayName} failed ambiguously (${message(e)}) and no batch with that name was found. Check your batches in Google AI Studio before re-running, so nothing is paid for twice.`,
        );
      }
    }
  }

  async function render(requests: readonly TtsRequest[], ctx: Ctx) {
    const stateFile = join(ctx.stateDir, 'gemini-batches.json');
    const state = readState(stateFile);
    const save = () => {
      mkdirSync(ctx.stateDir, { recursive: true });
      writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
    };
    const byId = new Map(requests.map((r) => [r.id, r]));

    // 1. Adopt saved jobs for every clip whose request is unchanged, whatever the mode.
    type Job = { name: string; requests: TtsRequest[] };
    const active: Job[] = [];
    const covered = new Set<string>();
    let changed = false;
    for (const [name, job] of Object.entries(state.jobs)) {
      if (job.model !== opts.model) continue;
      const adopted = Object.entries(job.requests).flatMap(([id, hash]) => {
        const r = byId.get(id);
        return r && !covered.has(id) && requestHash(opts.model, r) === hash ? [r] : [];
      });
      if (adopted.length === 0) {
        ctx.log(`narration: forgetting batch ${name}: none of its clips are still needed.`);
        delete state.jobs[name];
        changed = true;
        continue;
      }
      // Already paid for: reserve it so new spending counts it, even past the cap.
      ctx.reserve(
        adopted.map((r) => r.id),
        ctx.estimateUsd(adopted),
        { force: true },
      );
      for (const r of adopted) covered.add(r.id);
      ctx.log(`narration: resuming batch ${name} (${adopted.length} clips)`);
      active.push({ name, requests: adopted });
    }
    if (changed) save();
    const remaining = requests.filter((r) => !covered.has(r.id));

    // 2. New work: interactive calls, or new batch jobs saved before anything waits on them.
    if (ctx.mode === 'interactive') {
      await interactive(remaining, ctx);
    } else {
      for (let i = 0; i < remaining.length; i += BATCH_CHUNK) {
        const chunk = remaining.slice(i, i + BATCH_CHUNK);
        if (
          !ctx.reserve(
            chunk.map((r) => r.id),
            ctx.estimateUsd(chunk),
          )
        ) {
          ctx.log('narration: spend cap reached; not starting further batches.');
          break;
        }
        const displayName = `number-island-narration-${chunkKey(opts.model, chunk).slice(0, 16)}`;
        const name = await createBatch(chunk, displayName);
        state.jobs[name] = {
          model: opts.model,
          displayName,
          createdAt: new Date(now()).toISOString(),
          requests: Object.fromEntries(chunk.map((r) => [r.id, requestHash(opts.model, r)])),
        };
        save();
        ctx.log(`narration: started batch ${name} (${chunk.length} clips)`);
        active.push({ name, requests: chunk });
      }
    }

    // 3. Poll. A job's saved record is removed only after every one of its results is handled.
    const deadline = now() + ctx.maxWaitMs;
    const pollMs = opts.pollMs ?? 30_000;
    while (active.length > 0) {
      for (const job of [...active]) {
        const json = await withRetry(() => call('GET', `${GEMINI_BASE}/${job.name}`));
        const status = batchState(json);
        if (status === 'running') continue;
        if (status !== 'succeeded') {
          ctx.log(`narration: batch ${job.name} ended ${status}; its clips were not rendered.`);
          for (const r of job.requests) {
            await ctx.onResult({ id: r.id, ok: false, error: `batch ${status}` });
          }
        } else {
          const results = await batchResults(json, (file) =>
            withRetry(async () => {
              const res = await doFetch(
                `${GEMINI_BASE.replace('/v1beta', '/download/v1beta')}/${file}:download?alt=media`,
                { headers },
              );
              if (!res.ok) throw new HttpError(res.status, redact(await describe(res)), null);
              return res.text();
            }),
          );
          const wanted = new Set(job.requests.map((r) => r.id));
          const seen = new Set<string>();
          for (const item of results) {
            if (!item.key || !wanted.has(item.key) || seen.has(item.key)) continue;
            seen.add(item.key);
            let outcome: TtsOutcome;
            try {
              if (item.error) throw new Error(item.error.message ?? 'batch item failed');
              outcome = { id: item.key, ok: true, ...audioFromResponse(item.response ?? {}) };
            } catch (e) {
              outcome = { id: item.key, ok: false, error: message(e) };
            }
            await ctx.onResult(outcome);
          }
          for (const r of job.requests) {
            if (!seen.has(r.id)) {
              await ctx.onResult({ id: r.id, ok: false, error: 'missing from batch results' });
            }
          }
        }
        active.splice(active.indexOf(job), 1);
        delete state.jobs[job.name];
        save();
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
    async render(requests, ctx) {
      try {
        await render(requests, ctx);
      } catch (e) {
        throw new Error(message(e));
      }
    },
  };
}

/** Identifies a chunk by model and the exact clips in it (its batch display name). */
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
