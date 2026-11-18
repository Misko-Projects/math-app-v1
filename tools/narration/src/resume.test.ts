// End-to-end resumability and spend safety (cross-model review rounds 1–2): runPipeline with the real
// Gemini provider against a fake Batch API, checking that paid work is never submitted twice and that
// partial runs never remove working audio.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audioManifestSchema, type NarrationJson } from '@number-island/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { stubWav } from './audio';
import { costUsd, priceFor } from './cost';
import { type Encoder, wavEncoder } from './encode';
import { type PipelineOptions, runPipeline } from './pipeline';
import { geminiRenderer } from './providers/gemini';
import type { Renderer } from './providers/types';
import { fixtureNarration, repoVoices } from './testing';

const KEY = 'test-key-not-real-0123456789';
const MODEL = 'gemini-3.8-flash-tts';
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const audioJson = () => ({
  candidates: [
    {
      content: {
        parts: [
          {
            inlineData: {
              mimeType: 'audio/wav',
              data: Buffer.from(stubWav(100)).toString('base64'),
            },
          },
        ],
      },
    },
  ],
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 10_000 },
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fake Gemini API: batch jobs finish only when told to; every paid POST is counted. */
function fakeGemini() {
  const jobs = new Map<string, { keys: string[]; displayName: string; done: boolean }>();
  const paidPosts: string[] = [];
  let next = 0;
  let createFailure: 'network' | null = null;
  let listFails = false;
  let autoFinish = false;
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.endsWith(':batchGenerateContent')) {
      const keys = (
        body.batch.input_config.requests.requests as { metadata: { key: string } }[]
      ).map((x) => x.metadata.key);
      const name = `batches/job${next++}`;
      paidPosts.push(name);
      jobs.set(name, { keys, displayName: body.batch.display_name, done: autoFinish });
      if (createFailure === 'network') {
        createFailure = null;
        throw new TypeError('socket hang up');
      }
      return json({ name });
    }
    if (url.endsWith(':generateContent')) {
      paidPosts.push('interactive');
      return json(audioJson());
    }
    if (url.includes('/batches?')) {
      if (listFails) return json({ error: { message: 'unavailable' } }, 503);
      return json({
        batches: [...jobs].map(([name, j]) => ({ name, displayName: j.displayName })),
      });
    }
    const name = url.slice(url.indexOf('batches/'));
    const job = jobs.get(name);
    if (!job) return json({ error: { message: 'not found' } }, 404);
    if (!job.done) return json({ name, metadata: { state: 'BATCH_STATE_RUNNING' } });
    return json({
      name,
      metadata: { state: 'BATCH_STATE_SUCCEEDED' },
      response: {
        inlinedResponses: {
          inlinedResponses: job.keys.map((k) => ({ metadata: { key: k }, response: audioJson() })),
        },
      },
    });
  }) as unknown as typeof globalThis.fetch;
  return {
    fetch: fakeFetch,
    paidPosts,
    finishAll: () => {
      for (const j of jobs.values()) j.done = true;
    },
    failNextCreate: () => {
      createFailure = 'network';
    },
    setListFails: (v: boolean) => {
      listFails = v;
    },
    setAutoFinish: (v: boolean) => {
      autoFinish = v;
    },
    forget: () => jobs.clear(),
  };
}

function setup(server = fakeGemini()) {
  const outDir = mkdtempSync(join(tmpdir(), 'narration-resume-'));
  dirs.push(outDir);
  let clock = 0;
  const renderer = geminiRenderer({
    apiKey: KEY,
    model: MODEL,
    fetch: server.fetch,
    pollMs: 1,
    attempts: 2,
    now: () => clock,
    sleep: async () => {
      clock += 60_000;
    },
  });
  const run = (o: Partial<PipelineOptions> = {}) =>
    runPipeline({
      narration: fixtureNarration(),
      styles: new Map(),
      config: repoVoices(),
      provider: 'gemini',
      renderer,
      encoder: wavEncoder,
      outDir,
      stateDir: join(outDir, '.state'),
      mode: 'batch',
      maxUsd: 5,
      concurrency: 1,
      maxWaitMs: 60_000,
      dryRun: false,
      ...o,
    });
  const ledger = () => {
    const file = join(outDir, '.state', 'gemini-batches.json');
    return existsSync(file)
      ? (JSON.parse(readFileSync(file, 'utf8')) as { jobs: Record<string, { name?: string }> })
      : { jobs: {} };
  };
  const manifest = () =>
    audioManifestSchema.parse(JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')));
  return { server, run, ledger, manifest, outDir };
}

describe('resuming batch work without paying twice', () => {
  it('keeps a saved job that a filtered run does not need, and adopts it later', async () => {
    const { server, run, ledger } = setup();
    await run({ only: /^fb\./ }); // one job for fb.correct.1, left running at the deadline
    await run({ only: /^num\./ }); // a disjoint filtered run must not forget the fb job
    expect(server.paidPosts).toHaveLength(2);
    expect(Object.keys(ledger().jobs)).toHaveLength(2);
    server.finishAll();
    server.setAutoFinish(true);
    const report = await run(); // adopts both saved jobs, submits only the rest (one new job)
    expect(report.complete).toBe(true);
    expect(server.paidPosts).toHaveLength(3);
    expect(ledger().jobs).toEqual({});
  });

  it('a complete run forgets a saved job none of whose clips are still needed', async () => {
    const { server, run, ledger } = setup();
    await run({ only: /^fb\./ });
    expect(Object.keys(ledger().jobs)).toHaveLength(1);
    const edited: NarrationJson = {
      ...fixtureNarration(),
      'fb.correct.1': { text: 'You did it again!', clips: ['fb.correct.1#0'] },
    };
    server.setAutoFinish(true);
    const report = await run({ narration: edited });
    expect(report.complete).toBe(true);
    expect(ledger().jobs).toEqual({});
  });

  it('records a batch before submitting it and recovers it after a lost creation response', async () => {
    const { server, run, ledger } = setup();
    server.failNextCreate();
    server.setListFails(true);
    const first = await run();
    expect(first.aborted).toMatch(/could not be found|failed ambiguously/);
    expect(server.paidPosts).toHaveLength(1);
    const saved = Object.values(ledger().jobs);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBeUndefined();

    // The next run finds the job by name instead of submitting it again.
    server.setListFails(false);
    server.finishAll();
    const second = await run();
    expect(second.failed).toEqual([]);
    expect(server.paidPosts).toHaveLength(1);
    expect(second.complete).toBe(true);
  });

  it('stops before paying when an unconfirmed submission cannot be found, unless told to abandon it', async () => {
    const { server, run } = setup();
    server.failNextCreate();
    server.setListFails(true);
    await run();
    server.forget(); // Gemini never actually created it
    server.setListFails(false);
    const blocked = await run();
    expect(blocked.aborted).toMatch(/never confirmed/);
    expect(server.paidPosts).toHaveLength(1);
    server.finishAll();
    const abandoned = await run({ abandonUnconfirmedBatches: true, maxWaitMs: 0 });
    expect(server.paidPosts).toHaveLength(2);
    expect(abandoned.aborted).toBeNull();
  });

  it('adopts a shared-audio job when a filtered run selects a different clip id', async () => {
    const narration: NarrationJson = {
      ...fixtureNarration(),
      'fb.correct.2': { text: 'You did it!', clips: ['fb.correct.2#0'] },
    };
    const { server, run, manifest } = setup();
    await run({ narration }); // fb.correct.1 and .2 share one request; left running
    const posts = server.paidPosts.length;
    server.finishAll();
    const report = await run({ narration, only: /^fb\.correct\.2#/ });
    expect(server.paidPosts).toHaveLength(posts);
    expect(report.failed).toEqual([]);
    expect(manifest().clips['fb.correct.2#0']).toBeDefined();
    expect(manifest().clips['fb.correct.1#0']).toEqual(manifest().clips['fb.correct.2#0']);
  });

  it('keeps a finished job when a result cannot be stored, and fetches it again next run', async () => {
    const { server, run, ledger } = setup();
    server.setAutoFinish(true);
    let failOnce = true;
    const flaky: Encoder = {
      ...wavEncoder,
      encode: async (wav) => {
        if (failOnce) {
          failOnce = false;
          throw new Error('disk full');
        }
        return wav;
      },
    };
    const first = await run({ encoder: flaky, only: /^fb\./ });
    expect(first.failed.map((f) => f.error)).toEqual(['disk full']);
    expect(Object.keys(ledger().jobs)).toHaveLength(1);
    const posts = server.paidPosts.length;
    const retry = await run({ only: /^fb\./ });
    expect(retry).toMatchObject({ rendered: 1, failed: [] });
    expect(server.paidPosts).toHaveLength(posts);
    expect(ledger().jobs).toEqual({});
  });

  it('bills results adopted from a batch at the batch rate, even in an interactive run', async () => {
    const { server, run } = setup();
    await run({ only: /^fb\./ });
    server.finishAll();
    const report = await run({ only: /^fb\./, mode: 'interactive' });
    const price = priceFor('gemini', MODEL, Date.now());
    const perClip = costUsd(price, 'batch', { inputTokens: 1000, outputTokens: 10_000 });
    expect(report.rendered).toBe(1);
    expect(report.spentUsd).toBeCloseTo(perClip, 9);
    expect(server.paidPosts.filter((p) => p === 'interactive')).toEqual([]);
  });
});

describe('partial runs never remove working audio', () => {
  function stubRun(outDir: string) {
    const stub: Renderer = {
      provider: 'gemini',
      model: MODEL,
      async render(requests, ctx) {
        for (const r of requests) {
          await ctx.onResult({ id: r.id, ok: true, wav: stubWav(50) });
        }
      },
    };
    return (o: Partial<PipelineOptions> = {}) =>
      runPipeline({
        narration: fixtureNarration(),
        styles: new Map(),
        config: repoVoices(),
        provider: 'gemini',
        renderer: stub,
        encoder: wavEncoder,
        outDir,
        stateDir: join(outDir, '.state'),
        mode: 'interactive',
        maxUsd: 5,
        concurrency: 1,
        maxWaitMs: 0,
        dryRun: false,
        ...o,
      });
  }
  const read = (dir: string) =>
    audioManifestSchema.parse(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')));

  it('a filtered run keeps entries for clips absent from the current plan', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'narration-partial-'));
    dirs.push(outDir);
    const run = stubRun(outDir);
    await run();
    const before = read(outDir);
    const { 'noun.shell.many': _removed, ...rest } = fixtureNarration();
    await run({ narration: rest, only: /^fb\./ });
    expect(read(outDir).clips['noun.shell.many#0']).toEqual(before.clips['noun.shell.many#0']);
  });

  it('an aborted run prunes nothing and keeps the previous audio', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'narration-partial-'));
    dirs.push(outDir);
    await stubRun(outDir)();
    const before = read(outDir);
    const failing: Renderer = {
      provider: 'gemini',
      model: MODEL,
      async render() {
        throw new Error('provider down');
      },
    };
    // A voice change makes every clip new; the provider fails before producing any of them.
    const config = repoVoices();
    config.gemini.voices.narrator = 'Leda';
    config.gemini.voices.pip = 'Leda';
    const report = await runPipeline({
      narration: fixtureNarration(),
      styles: new Map(),
      config,
      provider: 'gemini',
      renderer: failing,
      encoder: wavEncoder,
      outDir,
      stateDir: join(outDir, '.state'),
      mode: 'interactive',
      maxUsd: 5,
      concurrency: 1,
      maxWaitMs: 0,
      dryRun: false,
    });
    expect(report.aborted).toBe('provider down');
    expect(report.complete).toBe(false);
    expect(report.pruned).toEqual([]);
    expect(read(outDir).clips).toEqual(before.clips);
    for (const c of Object.values(before.clips))
      expect(existsSync(join(outDir, c.file))).toBe(true);
  });
});

describe('key redaction', () => {
  it('redacts the key before truncating a long provider error', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'narration-redact-'));
    dirs.push(outDir);
    // The key starts 10 characters before the 300-character cut-off.
    const longMessage = `${'x'.repeat(285)} key=${KEY} trailing`;
    const fetch = (async () =>
      json({ error: { message: longMessage } }, 400)) as unknown as typeof globalThis.fetch;
    const renderer = geminiRenderer({ apiKey: KEY, model: MODEL, fetch, sleep: async () => {} });
    const report = await runPipeline({
      narration: { 'fb.correct.1': { text: 'You did it!', clips: ['fb.correct.1#0'] } },
      styles: new Map(),
      config: repoVoices(),
      provider: 'gemini',
      renderer,
      encoder: wavEncoder,
      outDir,
      stateDir: join(outDir, '.state'),
      mode: 'interactive',
      maxUsd: 5,
      concurrency: 1,
      maxWaitMs: 0,
      dryRun: false,
    });
    const text = JSON.stringify(report.failed);
    expect(text).toContain('HTTP 400');
    expect(text).not.toContain(KEY.slice(0, 10));
  });
});
