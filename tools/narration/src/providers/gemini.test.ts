import { describe, expect, it } from 'vitest';
import { stubWav, wavDurationMs } from '../audio';
import { audioFromResponse, GEMINI_BASE, geminiRenderer, ttsRequestBody } from './gemini';
import type { RenderContext, TtsOutcome, TtsRequest } from './types';

const KEY = 'test-key-not-real';
const req = (id: string, text = 'three'): TtsRequest => ({
  id,
  text,
  voiceName: 'Sulafat',
  styleText: 'warm',
});
const audioJson = (wav = stubWav(100)) => ({
  candidates: [
    {
      content: {
        parts: [
          { inlineData: { mimeType: 'audio/wav', data: Buffer.from(wav).toString('base64') } },
        ],
      },
    },
  ],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 30 },
});

function context(overrides: Partial<RenderContext> = {}) {
  const results: TtsOutcome[] = [];
  const ctx: RenderContext = {
    concurrency: 2,
    reserve: () => true,
    onResult: async (o) => {
      results.push(o);
    },
    log: () => {},
    estimateUsd: () => 0.001,
    ...overrides,
  };
  return { ctx, results };
}

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };
function fakeFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    const call = {
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const noSleep = async () => {};

describe('ttsRequestBody', () => {
  it('matches the v1beta speech-generation request shape', () => {
    expect(ttsRequestBody(req('a', 'Hello!'))).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'Hello!', speech_metadata: { style: 'warm' } }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { voice: 'Sulafat' } },
      },
    });
  });
});

describe('audioFromResponse', () => {
  it('returns WAV bytes and token usage', () => {
    const wav = stubWav(200);
    const out = audioFromResponse(audioJson(wav));
    expect(out.wav).toEqual(wav);
    expect(out.usage).toEqual({ inputTokens: 12, outputTokens: 30 });
  });

  it('wraps headerless L16 PCM in a WAV header', () => {
    const pcm = new Uint8Array(24000 * 2); // one second at 24 kHz
    const out = audioFromResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/L16;codec=pcm;rate=24000',
                  data: Buffer.from(pcm).toString('base64'),
                },
              },
            ],
          },
        },
      ],
    });
    expect(wavDurationMs(out.wav)).toBe(1000);
  });

  it('explains a response without audio', () => {
    expect(() => audioFromResponse({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(
      /SAFETY/,
    );
    expect(() => audioFromResponse({ candidates: [{ finishReason: 'OTHER' }] })).toThrow(/OTHER/);
  });
});

describe('geminiRenderer, interactive', () => {
  it('posts one generateContent call per clip with the key header', async () => {
    const { fn, calls } = fakeFetch(() => json(audioJson()));
    const r = geminiRenderer({
      apiKey: KEY,
      model: 'gemini-3.8-flash-tts',
      fetch: fn,
      sleep: noSleep,
    });
    const { ctx, results } = context();
    await r.render([req('a'), req('b')], ctx);
    expect(calls.map((c) => c.url)).toEqual([
      `${GEMINI_BASE}/models/gemini-3.8-flash-tts:generateContent`,
      `${GEMINI_BASE}/models/gemini-3.8-flash-tts:generateContent`,
    ]);
    expect(calls[0]?.headers['x-goog-api-key']).toBe(KEY);
    expect(results.map((o) => [o.id, o.ok])).toEqual(
      expect.arrayContaining([
        ['a', true],
        ['b', true],
      ]),
    );
  });

  it('retries 429 and 5xx with backoff, then reports a failure without the key', async () => {
    let n = 0;
    const { fn } = fakeFetch(() => {
      n += 1;
      if (n === 1) return json({ error: { message: 'slow down' } }, 429, { 'retry-after': '1' });
      if (n === 2) return json({ error: { message: 'oops' } }, 503);
      return json(audioJson());
    });
    const waits: number[] = [];
    const r = geminiRenderer({
      apiKey: KEY,
      model: 'm',
      fetch: fn,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    const { ctx, results } = context({ concurrency: 1 });
    await r.render([req('a')], ctx);
    expect(results[0]?.ok).toBe(true);
    expect(waits).toEqual([1000, 2000]);

    const bad = fakeFetch(() => json({ error: { message: 'API key not valid' } }, 400));
    const r2 = geminiRenderer({ apiKey: KEY, model: 'm', fetch: bad.fn, sleep: noSleep });
    const second = context();
    await r2.render([req('a')], second.ctx);
    expect(bad.calls).toHaveLength(1);
    const failure = second.results[0];
    expect(failure?.ok).toBe(false);
    expect(JSON.stringify(failure)).toContain('HTTP 400');
    expect(JSON.stringify(failure)).not.toContain(KEY);
  });

  it('stops starting requests once the spend cap says no', async () => {
    const { fn, calls } = fakeFetch(() => json(audioJson()));
    const r = geminiRenderer({ apiKey: KEY, model: 'm', fetch: fn, sleep: noSleep });
    let budget = 2;
    const { ctx } = context({ concurrency: 1, reserve: () => budget-- > 0 });
    await r.render([req('a'), req('b'), req('c'), req('d')], ctx);
    expect(calls).toHaveLength(2);
  });
});

describe('key redaction', () => {
  it('redacts the API key from HTTP and transport errors', async () => {
    const http = fakeFetch(() => json({ error: { message: `API key ${KEY} is not valid` } }, 400));
    const r1 = geminiRenderer({ apiKey: KEY, model: 'm', fetch: http.fn, sleep: noSleep });
    const a = context();
    await r1.render([req('a')], a.ctx);
    expect(JSON.stringify(a.results)).toContain('[redacted]');
    expect(JSON.stringify(a.results)).not.toContain(KEY);

    const transport = fakeFetch(() => {
      throw new TypeError(`connect failed for key=${KEY}`);
    });
    const r2 = geminiRenderer({
      apiKey: KEY,
      model: 'm',
      fetch: transport.fn,
      sleep: noSleep,
      attempts: 1,
    });
    const b = context();
    await r2.render([req('a')], b.ctx);
    expect(JSON.stringify(b.results)).toContain('network error');
    expect(JSON.stringify(b.results)).not.toContain(KEY);
  });
});
