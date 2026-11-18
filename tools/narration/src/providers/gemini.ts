// The `gemini` provider (07 §3): `gemini-3.8-flash-tts` on `v1beta`, build time only (never at
// runtime, 07 §0). v1 renders with interactive `generateContent` calls; the Batch API (50% cost) is
// a follow-up. Request shape verified against the live speech-generation guide on 2026-11-18:
// `parts[].speech_metadata.style`, `generationConfig.speechConfig.voiceConfig.voice`, unary responses
// carry a 24 kHz mono 16-bit WAV in `candidates[0].content.parts[].inlineData`.
//
// Retries are safe: Gemini bills generateContent only when it returns audio. The API key is redacted
// from every error message.
import { isWav, pcmToWav } from '../audio';
import { pool, type Renderer, type TokenUsage, type TtsOutcome, type TtsRequest } from './types';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export interface GeminiOptions {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Attempts per request (408/429/5xx/network errors are retried with backoff). */
  attempts?: number;
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

export function geminiRenderer(opts: GeminiOptions): Renderer {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const attempts = opts.attempts ?? 5;
  const headers = { 'x-goog-api-key': opts.apiKey, 'content-type': 'application/json' };
  /** Removes the API key from any text that may reach a log, an error or a report. */
  const redact = (text: string) =>
    opts.apiKey ? text.split(opts.apiKey).join('[redacted]') : text;
  const message = (e: unknown) => redact(e instanceof Error ? e.message : String(e));

  async function generate(r: TtsRequest): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(`${GEMINI_BASE}/models/${opts.model}:generateContent`, {
        method: 'POST',
        headers,
        body: JSON.stringify(ttsRequestBody(r)),
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

  /** Retries 408/429/5xx and network errors with backoff (honouring Retry-After). */
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

  return {
    provider: 'gemini',
    model: opts.model,
    async render(requests, ctx) {
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
            const json = await withRetry(() => generate(r));
            outcome = { id: r.id, ok: true, ...audioFromResponse(json as GenerateContentResponse) };
          } catch (e) {
            outcome = { id: r.id, ok: false, error: message(e) };
          }
          await ctx.onResult(outcome);
        },
        () => stopped,
      );
      if (stopped) ctx.log('narration: spend cap reached; stopped before rendering every clip.');
    },
  };
}
