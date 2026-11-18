import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pcmToWav, stubWav, wavDurationMs } from '../audio';
import {
  audioFromResponse,
  BATCH_CHUNK,
  batchResults,
  batchState,
  GEMINI_BASE,
  geminiRenderer,
  ttsRequestBody,
} from './gemini';
import type { RenderContext, TtsOutcome, TtsRequest } from './types';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

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
  const stateDir = mkdtempSync(join(tmpdir(), 'narration-state-'));
  dirs.push(stateDir);
  const ctx: RenderContext = {
    mode: 'interactive',
    concurrency: 2,
    canSpend: () => true,
    onResult: async (o) => {
      results.push(o);
    },
    log: () => {},
    stateDir,
    maxWaitMs: 60_000,
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
    const { ctx } = context({ concurrency: 1, canSpend: () => budget-- > 0 });
    await r.render([req('a'), req('b'), req('c'), req('d')], ctx);
    expect(calls).toHaveLength(2);
  });
});

describe('geminiRenderer, batch', () => {
  it('creates inline batches, saves their names, polls and reads the results', async () => {
    const requests = Array.from({ length: BATCH_CHUNK + 5 }, (_, i) => req(`c${i}`));
    let polls = 0;
    const { fn, calls } = fakeFetch((call) => {
      if (call.url.endsWith(':batchGenerateContent')) {
        const body = call.body as {
          batch: { input_config: { requests: { requests: { metadata: { key: string } }[] } } };
        };
        const keys = body.batch.input_config.requests.requests.map((x) => x.metadata.key);
        return json({ name: `batches/${keys[0]}`, metadata: { state: 'BATCH_STATE_PENDING' } });
      }
      polls += 1;
      const name = call.url.slice(GEMINI_BASE.length + 1);
      const chunk =
        name === 'batches/c0' ? requests.slice(0, BATCH_CHUNK) : requests.slice(BATCH_CHUNK);
      if (polls <= 2) return json({ name, metadata: { state: 'BATCH_STATE_RUNNING' } });
      return json({
        name,
        metadata: { state: 'BATCH_STATE_SUCCEEDED' },
        done: true,
        response: {
          inlinedResponses: {
            inlinedResponses: chunk.map((r) => ({
              metadata: { key: r.id },
              response: audioJson(),
            })),
          },
        },
      });
    });
    const r = geminiRenderer({ apiKey: KEY, model: 'm', fetch: fn, sleep: noSleep, pollMs: 1 });
    const { ctx, results } = context({ mode: 'batch' });
    await r.render(requests, ctx);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    expect(results).toHaveLength(requests.length);
    expect(results.every((o) => o.ok)).toBe(true);
    // Finished jobs are forgotten, so the state file is empty again.
    const state = JSON.parse(readFileSync(join(ctx.stateDir, 'gemini-batches.json'), 'utf8'));
    expect(state).toEqual({});
  });

  it('leaves running jobs saved at the deadline and resumes them without paying again', async () => {
    let now = 0;
    let finished = false;
    const { fn, calls } = fakeFetch((call) => {
      if (call.method === 'POST') return json({ name: 'batches/one' });
      if (!finished) return json({ name: 'batches/one', state: 'JOB_STATE_RUNNING' });
      return json({
        name: 'batches/one',
        state: 'JOB_STATE_SUCCEEDED',
        dest: { inlinedResponses: [{ metadata: { key: 'a' }, response: audioJson() }] },
      });
    });
    const r = geminiRenderer({
      apiKey: KEY,
      model: 'm',
      fetch: fn,
      pollMs: 1,
      now: () => now,
      sleep: async () => {
        now += 60_000;
      },
    });
    const first = context({ mode: 'batch', maxWaitMs: 120_000 });
    await r.render([req('a')], first.ctx);
    expect(first.results).toEqual([]);
    const stateFile = join(first.ctx.stateDir, 'gemini-batches.json');
    expect(existsSync(stateFile)).toBe(true);
    expect(readFileSync(stateFile, 'utf8')).toContain('batches/one');

    finished = true;
    const results: TtsOutcome[] = [];
    await r.render([req('a')], {
      ...first.ctx,
      onResult: async (o) => {
        results.push(o);
      },
    });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(results.map((o) => o.ok)).toEqual([true]);
  });

  it('reports every clip of a failed batch as failed', async () => {
    const { fn } = fakeFetch((call) =>
      call.method === 'POST'
        ? json({ name: 'batches/x' })
        : json({ name: 'batches/x', metadata: { state: 'BATCH_STATE_FAILED' } }),
    );
    const r = geminiRenderer({ apiKey: KEY, model: 'm', fetch: fn, sleep: noSleep, pollMs: 1 });
    const { ctx, results } = context({ mode: 'batch' });
    await r.render([req('a'), req('b')], ctx);
    expect(results.map((o) => [o.id, o.ok])).toEqual([
      ['a', false],
      ['b', false],
    ]);
  });
});

describe('batch helpers', () => {
  it('normalises REST and SDK state names', () => {
    expect(batchState({ metadata: { state: 'BATCH_STATE_RUNNING' } })).toBe('running');
    expect(batchState({ state: 'JOB_STATE_SUCCEEDED' })).toBe('succeeded');
    expect(batchState({ state: 'JOB_STATE_EXPIRED' })).toBe('failed');
    expect(batchState({ metadata: { state: 'BATCH_STATE_CANCELLED' } })).toBe('failed');
    expect(batchState({})).toBe('running');
  });

  it('reads a JSONL responses file', async () => {
    const wav = pcmToWav({ sampleRate: 24000, channels: 1, data: new Uint8Array(480) });
    const line = JSON.stringify({ key: 'a', response: audioJson(wav) });
    const items = await batchResults({ response: { responsesFile: 'files/out' } }, async (file) =>
      file === 'files/out' ? `${line}\n` : '',
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.key).toBe('a');
  });
});
