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
    reserve: () => true,
    onResult: async (o) => {
      results.push(o);
      return true;
    },
    log: () => {},
    stateDir,
    maxWaitMs: 60_000,
    estimateUsd: () => 0.001,
    complete: true,
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
    expect(state).toEqual({ version: 2, jobs: {} });
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
        return true;
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

describe('geminiRenderer, resuming and safety (review round 1)', () => {
  type Item = { metadata: { key: string }; response: ReturnType<typeof audioJson> };
  /** A fake Batch API: jobs finish when `finish` is called; every POST is counted. */
  function batchServer() {
    const jobs = new Map<string, { keys: string[]; done: boolean }>();
    let next = 0;
    const posts: string[] = [];
    const { fn, calls } = fakeFetch((call) => {
      if (call.url.endsWith(':batchGenerateContent')) {
        const body = call.body as {
          batch: { input_config: { requests: { requests: { metadata: { key: string } }[] } } };
        };
        const keys = body.batch.input_config.requests.requests.map((x) => x.metadata.key);
        const name = `batches/job${next++}`;
        posts.push(name);
        jobs.set(name, { keys, done: false });
        return json({ name });
      }
      if (call.url.endsWith(':generateContent')) {
        posts.push('interactive');
        return json(audioJson());
      }
      const name = call.url.slice(GEMINI_BASE.length + 1);
      const job = jobs.get(name);
      if (!job) return json({ error: { message: 'not found' } }, 404);
      if (!job.done) return json({ name, metadata: { state: 'BATCH_STATE_RUNNING' } });
      const items: Item[] = job.keys.map((k) => ({ metadata: { key: k }, response: audioJson() }));
      return json({
        name,
        metadata: { state: 'BATCH_STATE_SUCCEEDED' },
        response: { inlinedResponses: { inlinedResponses: items } },
      });
    });
    const finish = (name: string) => {
      const job = jobs.get(name);
      if (job) job.done = true;
    };
    return { fn, calls, posts, finish };
  }

  it('a later interactive run with fewer missing clips adopts the saved jobs instead of paying again', async () => {
    const server = batchServer();
    let now = 0;
    const r = geminiRenderer({
      apiKey: KEY,
      model: 'm',
      fetch: server.fn,
      pollMs: 1,
      now: () => now,
      sleep: async () => {
        now += 60_000;
      },
    });
    const all = Array.from({ length: BATCH_CHUNK + 1 }, (_, i) => req(`c${i}`, `text ${i}`));
    const first = context({ mode: 'batch', maxWaitMs: 60_000 });
    await r.render(all, first.ctx);
    expect(server.posts).toEqual(['batches/job0', 'batches/job1']);
    expect(first.results).toEqual([]);

    // Only job1 finishes; meanwhile the clips of job0 were (say) written by another means, so the
    // next run asks for only the last clip, below the batch threshold, in interactive mode.
    server.finish('batches/job1');
    const second = context({ mode: 'interactive', maxWaitMs: 60_000 });
    await r.render([all[BATCH_CHUNK] as TtsRequest], {
      ...second.ctx,
      stateDir: first.ctx.stateDir,
    });
    expect(server.posts).toEqual(['batches/job0', 'batches/job1']);
    expect(second.results.map((o) => [o.id, o.ok])).toEqual([[`c${BATCH_CHUNK}`, true]]);
  });

  it('keeps a finished job saved until every result is handled, so a failed run can resume', async () => {
    const server = batchServer();
    const r = geminiRenderer({
      apiKey: KEY,
      model: 'm',
      fetch: server.fn,
      sleep: noSleep,
      pollMs: 1,
    });
    const requests = [req('a', 'one'), req('b', 'two')];
    const { ctx } = context({ mode: 'batch' });
    // The job finishes as soon as it is started; handling its results then fails (disk full).
    await expect(
      r.render(requests, {
        ...ctx,
        log: (m) => {
          if (m.startsWith('narration: started batch')) server.finish('batches/job0');
        },
        onResult: async () => {
          throw new Error('disk full');
        },
      }),
    ).rejects.toThrow(/disk full/);
    const saved = JSON.parse(readFileSync(join(ctx.stateDir, 'gemini-batches.json'), 'utf8'));
    expect(Object.values(saved.jobs).map((j) => (j as { name: string }).name)).toEqual([
      'batches/job0',
    ]);
    // The re-run adopts the saved job and gets both results without a new POST.
    const results: TtsOutcome[] = [];
    await r.render(requests, {
      ...ctx,
      onResult: async (o) => {
        results.push(o);
        return true;
      },
    });
    expect(server.posts).toEqual(['batches/job0']);
    expect(results.map((o) => o.ok)).toEqual([true, true]);
  });

  it('never re-sends a batch creation after an ambiguous failure; it recovers the job by name', async () => {
    let posts = 0;
    let listed = 0;
    let displayName = '';
    const { fn } = fakeFetch((call) => {
      if (call.method === 'POST') {
        posts += 1;
        displayName = (call.body as { batch: { display_name: string } }).batch.display_name;
        throw new TypeError('socket hang up'); // the server queued it; the response was lost
      }
      if (call.url.includes('/batches?')) {
        listed += 1;
        return json({ batches: [{ name: 'batches/lost', displayName }] });
      }
      return json({
        name: 'batches/lost',
        metadata: { state: 'BATCH_STATE_SUCCEEDED' },
        response: {
          inlinedResponses: {
            inlinedResponses: [{ metadata: { key: 'a' }, response: audioJson() }],
          },
        },
      });
    });
    const r = geminiRenderer({ apiKey: KEY, model: 'm', fetch: fn, sleep: noSleep, pollMs: 1 });
    const { ctx, results } = context({ mode: 'batch' });
    await r.render([req('a')], ctx);
    expect(posts).toBe(1);
    expect(listed).toBe(1);
    expect(results.map((o) => o.ok)).toEqual([true]);
  });

  it('stops, without a second POST, when an ambiguously failed batch cannot be found', async () => {
    let posts = 0;
    const { fn } = fakeFetch((call) => {
      if (call.method === 'POST') {
        posts += 1;
        return json({ error: { message: 'backend error' } }, 503);
      }
      return json({ batches: [] });
    });
    const r = geminiRenderer({ apiKey: KEY, model: 'm', fetch: fn, sleep: noSleep, pollMs: 1 });
    const { ctx } = context({ mode: 'batch' });
    await expect(r.render([req('a')], ctx)).rejects.toThrow(/failed ambiguously/);
    expect(posts).toBe(1);
  });

  it('retries a batch creation only after a 429, which creates nothing', async () => {
    let posts = 0;
    const { fn } = fakeFetch((call) => {
      if (call.method === 'POST') {
        posts += 1;
        return posts === 1
          ? json({ error: { message: 'quota' } }, 429)
          : json({ name: 'batches/x' });
      }
      return json({
        name: 'batches/x',
        state: 'JOB_STATE_SUCCEEDED',
        dest: { inlinedResponses: [{ metadata: { key: 'a' }, response: audioJson() }] },
      });
    });
    const r = geminiRenderer({ apiKey: KEY, model: 'm', fetch: fn, sleep: noSleep, pollMs: 1 });
    const { ctx, results } = context({ mode: 'batch' });
    await r.render([req('a')], ctx);
    expect(posts).toBe(2);
    expect(results.map((o) => o.ok)).toEqual([true]);
  });

  it('redacts the API key from HTTP, transport and batch item errors', async () => {
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
    expect(JSON.stringify(b.results)).not.toContain(KEY);

    const item = fakeFetch((call) =>
      call.method === 'POST'
        ? json({ name: 'batches/k' })
        : json({
            name: 'batches/k',
            state: 'JOB_STATE_SUCCEEDED',
            dest: {
              inlinedResponses: [{ metadata: { key: 'a' }, error: { message: `bad key ${KEY}` } }],
            },
          }),
    );
    const r3 = geminiRenderer({
      apiKey: KEY,
      model: 'm',
      fetch: item.fn,
      sleep: noSleep,
      pollMs: 1,
    });
    const c = context({ mode: 'batch' });
    await r3.render([req('a')], c.ctx);
    expect(JSON.stringify(c.results)).toContain('[redacted]');
    expect(JSON.stringify(c.results)).not.toContain(KEY);

    // A thrown failure (here: listing fails after an ambiguous creation) is redacted too.
    const thrown = fakeFetch(() => {
      throw new TypeError(`reset by peer ${KEY}`);
    });
    const r4 = geminiRenderer({
      apiKey: KEY,
      model: 'm',
      fetch: thrown.fn,
      sleep: noSleep,
      attempts: 1,
    });
    const d = context({ mode: 'batch' });
    const err = await r4.render([req('a')], d.ctx).catch((e: Error) => e);
    expect(String(err)).not.toContain(KEY);
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
