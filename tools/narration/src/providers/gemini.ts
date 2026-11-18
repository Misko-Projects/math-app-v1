// The `gemini` provider (07 §3): `gemini-3.8-flash-tts` on `v1beta`, build time only (never at
// runtime, 07 §0). Interactive `generateContent` calls for small runs, the Batch API (50% cost)
// otherwise. Request shape verified against the live speech-generation guide on 2026-11-18:
// `parts[].speech_metadata.style`, `generationConfig.speechConfig.voiceConfig.voice`, unary responses
// carry a 24 kHz mono 16-bit WAV in `candidates[0].content.parts[].inlineData`.
//
// Batch jobs are resumable: each job's name and its clips' request hashes are saved under the state
// directory before polling, so any later run adopts the job for every clip still needed instead of
// paying again. The API key is redacted from every error message.
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

/** A short description of an error response, redacted before it is truncated. */
async function describe(res: Response, redact: (text: string) => string): Promise<string> {
  let detail = '';
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string } };
    detail = redact(body.error?.message ?? body.error?.status ?? '');
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`;
}

/**
 * The batch ledger (`<stateDir>/gemini-batches.json`), keyed by each job's display name. A record is
 * written before its creation request is sent, gains the job name once Gemini confirms it, and is
 * removed only when the job is known to be finished and every one of its results has been stored
 * (or failed at the provider). Each record lists its requests by id (the clip file's content hash)
 * with a hash of the request, so any later run adopts the job for every request still needed.
 */
interface BatchLedger {
  version: 3;
  jobs: Record<
    string,
    { model: string; name?: string; createdAt: string; requests: Record<string, string> }
  >;
}

/** Hash of everything that decides a request's audio, so a changed line never adopts an old job. */
export function requestHash(model: string, r: TtsRequest): string {
  return createHash('sha256')
    .update(JSON.stringify([model, r.id, r.voiceName, r.styleText, r.text]))
    .digest('hex')
    .slice(0, 16);
}

function readLedger(file: string): BatchLedger {
  if (!existsSync(file)) return { version: 3, jobs: {} };
  const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<BatchLedger>;
  if (data.version === 3 && data.jobs && typeof data.jobs === 'object') {
    return { version: 3, jobs: data.jobs };
  }
  if (Object.keys(data).length === 0) return { version: 3, jobs: {} };
  // Never discard records silently: they may describe paid work.
  throw new Error(
    `${file} is not a batch ledger this version understands; move it aside to continue`,
  );
}

/** Statuses that prove the server rejected a batch creation without creating it. */
const DEFINITE_REJECTION = (status: number) =>
  status >= 400 && status < 500 && status !== 408 && status !== 429;

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
        await describe(res, redact),
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
        if (!ctx.reserve([r.id], ctx.estimateUsd([r], 'interactive'))) {
          stopped = true;
          return;
        }
        let outcome: TtsOutcome;
        try {
          const json = await withRetry(() =>
            call('POST', `${GEMINI_BASE}/models/${opts.model}:generateContent`, ttsRequestBody(r)),
          );
          outcome = {
            id: r.id,
            ok: true,
            billing: 'interactive',
            ...audioFromResponse(json as GenerateContentResponse),
          };
        } catch (e) {
          outcome = { id: r.id, ok: false, error: message(e) };
        }
        await ctx.onResult(outcome);
      },
      () => stopped,
    );
    if (stopped) ctx.log('narration: spend cap reached; stopped before rendering every clip.');
  }

  /**
   * Finds a batch by its display name (recovers a job whose creation response was lost). Names are
   * unique per submission; more than one match, or more pages than it reads, means "unknown".
   */
  async function findBatch(displayName: string): Promise<string | null> {
    let pageToken = '';
    const matches = new Set<string>();
    for (let page = 0; page < 20; page += 1) {
      const json = (await withRetry(() =>
        call(
          'GET',
          `${GEMINI_BASE}/batches?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
        ),
      )) as {
        batches?: { name?: string; displayName?: string; metadata?: { displayName?: string } }[];
        operations?: { name?: string; metadata?: { displayName?: string; name?: string } }[];
        nextPageToken?: string;
      };
      for (const b of json.batches ?? []) {
        if ((b.displayName ?? b.metadata?.displayName) === displayName && b.name)
          matches.add(b.name);
      }
      for (const op of json.operations ?? []) {
        const name = op.metadata?.name ?? op.name;
        if (op.metadata?.displayName === displayName && name) matches.add(name);
      }
      if (!json.nextPageToken) {
        if (matches.size > 1) throw new Error(`${matches.size} batches are named ${displayName}`);
        return [...matches][0] ?? null;
      }
      pageToken = json.nextPageToken;
    }
    throw new Error('too many batches to search');
  }

  /** Looks a job up by name; null when the lookup itself fails (unknown, not "absent"). */
  async function tryFind(displayName: string): Promise<string | null | undefined> {
    try {
      return await findBatch(displayName);
    } catch {
      return undefined;
    }
  }

  /** Requests a saved job already covers (they cost nothing new); read-only, for the estimate. */
  function covered(requests: readonly TtsRequest[], stateDir: string): Set<string> {
    const ledger = readLedger(join(stateDir, 'gemini-batches.json'));
    const out = new Set<string>();
    const byId = new Map(requests.map((r) => [r.id, r]));
    for (const job of Object.values(ledger.jobs)) {
      if (job.model !== opts.model) continue;
      for (const [id, hash] of Object.entries(job.requests)) {
        const r = byId.get(id);
        if (r && requestHash(opts.model, r) === hash) out.add(id);
      }
    }
    return out;
  }

  /** One render at a time per ledger: a second concurrent run fails fast instead of clobbering it. */
  async function locked(ctx: Ctx, fn: () => Promise<void>) {
    mkdirSync(ctx.stateDir, { recursive: true });
    const lock = join(ctx.stateDir, 'gemini-batches.lock');
    let fd: number;
    try {
      fd = openSync(lock, 'wx');
    } catch {
      throw new Error(
        `another narration render is using ${ctx.stateDir}. If none is running, delete ${lock}.`,
      );
    }
    try {
      await fn();
    } finally {
      closeSync(fd);
      rmSync(lock, { force: true });
    }
  }

  async function render(requests: readonly TtsRequest[], ctx: Ctx) {
    const ledgerFile = join(ctx.stateDir, 'gemini-batches.json');
    const ledger = readLedger(ledgerFile);
    /** Problems that stop new submissions; reported after every known job has been collected. */
    const errors: string[] = [];
    const save = () => {
      mkdirSync(ctx.stateDir, { recursive: true });
      // Write then rename: an interrupted save never truncates the only record of a paid job.
      writeFileSync(`${ledgerFile}.tmp`, `${JSON.stringify(ledger, null, 2)}\n`);
      renameSync(`${ledgerFile}.tmp`, ledgerFile);
    };
    const byId = new Map(requests.map((r) => [r.id, r]));
    const unconfirmed = (displayName: string, why: string) =>
      new Error(
        `batch ${displayName} was submitted but never confirmed (${why}). Check your batches in Google AI Studio. Re-run later to resume it, or with --abandon-unconfirmed-batches once you know it does not exist.`,
      );

    // 1. Adopt saved jobs for every request still needed, whatever the mode.
    type Job = { displayName: string; name: string; requests: TtsRequest[] };
    const active: Job[] = [];
    const covered = new Set<string>();
    for (const [displayName, job] of Object.entries(ledger.jobs)) {
      if (job.model !== opts.model) continue;
      const adopted = Object.entries(job.requests).flatMap(([id, hash]) => {
        const r = byId.get(id);
        return r && !covered.has(id) && requestHash(opts.model, r) === hash ? [r] : [];
      });
      if (adopted.length === 0) {
        // A job this run does not need stays saved, unless a complete run proves it is stale.
        if (ctx.complete && job.name) {
          ctx.log(`narration: forgetting batch ${job.name}: none of its clips are still needed.`);
          delete ledger.jobs[displayName];
          save();
        }
        continue;
      }
      let name = job.name;
      if (!name) {
        const found = await tryFind(displayName);
        if (found) {
          name = found;
          job.name = found;
          save();
        } else if (found === null && ctx.abandonUnconfirmedBatches) {
          ctx.log(
            `narration: abandoning unconfirmed batch ${displayName}; its clips are resubmitted.`,
          );
          delete ledger.jobs[displayName];
          save();
          continue;
        } else {
          // Its requests stay covered (never resubmitted) while other jobs are still collected.
          errors.push(
            unconfirmed(displayName, found === null ? 'not found' : 'lookup failed').message,
          );
          for (const r of adopted) covered.add(r.id);
          continue;
        }
      }
      // Already paid for: reserve it at the batch rate so new spending counts it, even past the cap.
      ctx.reserve(
        adopted.map((r) => r.id),
        ctx.estimateUsd(adopted, 'batch'),
        { force: true },
      );
      for (const r of adopted) covered.add(r.id);
      ctx.log(`narration: resuming batch ${name} (${adopted.length} clips)`);
      active.push({ displayName, name, requests: adopted });
    }
    const remaining = requests.filter((r) => !covered.has(r.id));

    // 2. New work: interactive calls, or new batch jobs recorded before they are submitted. Nothing
    // new starts while an unconfirmed submission is unresolved.
    if (errors.length > 0) {
      // fall through to collect the jobs already known
    } else if (ctx.mode === 'interactive') {
      await interactive(remaining, ctx);
    } else {
      for (let i = 0; i < remaining.length; i += BATCH_CHUNK) {
        const chunk = remaining.slice(i, i + BATCH_CHUNK);
        if (
          !ctx.reserve(
            chunk.map((r) => r.id),
            ctx.estimateUsd(chunk, 'batch'),
          )
        ) {
          ctx.log('narration: spend cap reached; not starting further batches.');
          break;
        }
        // Unique per submission, so recovering a lost response can never adopt an older job.
        const displayName = `number-island-narration-${chunkKey(opts.model, chunk).slice(0, 12)}-${randomUUID().slice(0, 8)}`;
        ledger.jobs[displayName] = {
          model: opts.model,
          createdAt: new Date(now()).toISOString(),
          requests: Object.fromEntries(chunk.map((r) => [r.id, requestHash(opts.model, r)])),
        };
        save();
        let name: string;
        try {
          name = await createBatch(chunk, displayName, () => {
            delete ledger.jobs[displayName];
            save();
          });
        } catch (e) {
          // Stop submitting, but still collect every job already known below.
          errors.push(message(e));
          break;
        }
        const record = ledger.jobs[displayName];
        if (record) record.name = name;
        save();
        ctx.log(`narration: started batch ${name} (${chunk.length} clips)`);
        active.push({ displayName, name, requests: chunk });
      }
    }

    // 3. Poll. A record is removed only after every one of its results is stored.
    const deadline = now() + ctx.maxWaitMs;
    const pollMs = opts.pollMs ?? 30_000;
    while (active.length > 0) {
      for (const job of [...active]) {
        const json = await withRetry(() => call('GET', `${GEMINI_BASE}/${job.name}`));
        const status = batchState(json);
        if (status === 'running') continue;
        // Ids whose outcome is final: stored, or failed at the provider.
        const handled = new Set<string>();
        const report = async (outcome: TtsOutcome) => {
          if (await ctx.onResult(outcome)) handled.add(outcome.id);
        };
        if (status !== 'succeeded') {
          ctx.log(`narration: batch ${job.name} ended ${status}; its clips were not rendered.`);
          for (const r of job.requests) {
            await report({ id: r.id, ok: false, error: `batch ${status}` });
          }
        } else {
          const results = await batchResults(json, (file) =>
            withRetry(async () => {
              const res = await doFetch(
                `${GEMINI_BASE.replace('/v1beta', '/download/v1beta')}/${file}:download?alt=media`,
                { headers },
              );
              if (!res.ok) throw new HttpError(res.status, await describe(res, redact), null);
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
              outcome = {
                id: item.key,
                ok: true,
                billing: 'batch',
                ...audioFromResponse(item.response ?? {}),
              };
            } catch (e) {
              outcome = { id: item.key, ok: false, error: message(e) };
            }
            // Not handled when the audio arrived but could not be stored: the job is kept for it.
            await report(outcome);
          }
          for (const r of job.requests) {
            if (!seen.has(r.id)) {
              await report({ id: r.id, ok: false, error: 'missing from batch results' });
            }
          }
        }
        active.splice(active.indexOf(job), 1);
        // The record keeps every request of the job that is not final yet, including requests this
        // run did not select (a later run stores them from the same finished job). A failed job
        // can produce nothing more, and a complete run drops requests nothing needs any more.
        const record = ledger.jobs[job.displayName];
        if (record) {
          for (const id of Object.keys(record.requests)) {
            const stale = ctx.complete && !byId.has(id);
            if (status !== 'succeeded' || handled.has(id) || stale) delete record.requests[id];
          }
          if (Object.keys(record.requests).length === 0) {
            delete ledger.jobs[job.displayName];
          } else {
            ctx.log(`narration: keeping batch ${job.name} saved for its remaining clips.`);
          }
          save();
        }
      }
      if (active.length === 0) break;
      if (now() >= deadline) {
        ctx.log(
          `narration: ${active.length} batch job(s) still running after ${Math.round(ctx.maxWaitMs / 60000)} min; re-run the same command to resume them (no new spend).`,
        );
        break;
      }
      await sleep(pollMs);
    }
    if (errors.length > 0) throw new Error(errors.join(' | '));
  }

  /**
   * Submits one batch job, whose ledger record already exists. A creation POST is never repeated
   * blindly: only a 429 (rejected, nothing created) is retried. A definite rejection removes the
   * record. After an ambiguous failure the job is looked up by display name; if it cannot be found
   * the run stops and the record stays, so the next run looks again before paying for anything.
   */
  async function createBatch(
    chunk: readonly TtsRequest[],
    displayName: string,
    rejected: () => void,
  ): Promise<string> {
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
        if (e instanceof HttpError && (DEFINITE_REJECTION(e.status) || e.status === 429)) {
          rejected();
          throw e;
        }
        const found = await tryFind(displayName);
        if (found) return found;
        throw new Error(
          `creating batch ${displayName} failed ambiguously (${message(e)}) and it could not be found. Check your batches in Google AI Studio; the next run looks for it again before submitting anything, or pass --abandon-unconfirmed-batches once you know it does not exist.`,
        );
      }
    }
  }

  return {
    provider: 'gemini',
    model: opts.model,
    covered,
    async render(requests, ctx) {
      try {
        await locked(ctx, () => render(requests, ctx));
      } catch (e) {
        throw new Error(message(e));
      }
    },
  };
}

/** Identifies a chunk by model and the exact requests in it (its batch display name). */
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
