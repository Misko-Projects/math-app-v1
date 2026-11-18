// End-to-end resumability and spend safety (cross-model review rounds 1–2): runPipeline with the real
// Gemini provider against a fake Batch API, checking that paid work is never submitted twice and that
// partial runs never remove working audio.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audioManifestSchema, type NarrationJson } from '@number-island/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { stubWav } from './audio';
import { checkLegacyLedger, lockFileFor, stateDirFor } from './cli';
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
  let failed = false;
  let rejectNext = false;
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.endsWith(':batchGenerateContent')) {
      if (rejectNext) {
        rejectNext = false;
        return json({ error: { message: 'invalid request' } }, 400);
      }
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
    if (failed && !job.done) return json({ name, metadata: { state: 'BATCH_STATE_FAILED' } });
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
      failed = false;
    },
    failAll: () => {
      failed = true;
    },
    rejectNextCreate: () => {
      rejectNext = true;
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

describe('review round 3', () => {
  it('keeps a finished job saved for the requests a filtered run did not store', async () => {
    const { server, run, ledger } = setup();
    await run(); // one job for every clip, left running
    expect(server.paidPosts).toHaveLength(1);
    server.finishAll();
    await run({ only: /^fb\./ }); // stores only fb.correct.1 from the finished job
    expect(Object.keys(ledger().jobs)).toHaveLength(1);
    const report = await run(); // the rest comes from the same job, with no new POST
    expect(server.paidPosts).toHaveLength(1);
    expect(report.complete).toBe(true);
    expect(ledger().jobs).toEqual({});
  });

  it('gives each output target its own ledger', () => {
    const a = stateDirFor('/tmp/out-a', 'opus');
    expect(stateDirFor('/tmp/out-a', 'opus')).toBe(a);
    expect(stateDirFor('/tmp/out-a', 'wav')).not.toBe(a);
    expect(stateDirFor('/tmp/out-b', 'opus')).not.toBe(a);
  });

  it('refuses a ledger in an older format instead of ignoring its paid jobs', async () => {
    const { run, outDir } = setup();
    mkdirSync(join(outDir, '.state'), { recursive: true });
    writeFileSync(
      join(outDir, '.state', 'gemini-batches.json'),
      JSON.stringify({ version: 2, jobs: { 'batches/x': { model: MODEL, requests: { a: 'b' } } } }),
    );
    const report = await run();
    expect(report.aborted).toMatch(/not a batch ledger this version understands/);
  });

  it('a filtered run keeps an unselected entry even when another cached file for it exists', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'narration-r3-'));
    dirs.push(outDir);
    const stub: Renderer = {
      provider: 'gemini',
      model: MODEL,
      async render(requests, ctx) {
        for (const r of requests) await ctx.onResult({ id: r.id, ok: true, wav: stubWav(50) });
      },
    };
    const run = (narration: NarrationJson, only?: RegExp) =>
      runPipeline({
        narration,
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
        only,
      });
    const original = fixtureNarration();
    await run(original); // A = fb.correct.1 at its original text
    const changed = {
      ...original,
      'fb.correct.1': { text: 'You did it again!', clips: ['fb.correct.1#0'] },
    };
    await run(changed, /^fb\./); // A updated; its original file stays (filtered runs delete nothing)
    const updated = read(outDir).clips['fb.correct.1#0'];
    await run(original, /^num\./); // A's text restored, but only num.* is selected
    expect(read(outDir).clips['fb.correct.1#0']).toEqual(updated);
  });

  it('a filtered run leaves partial files alone', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'narration-r3-'));
    dirs.push(outDir);
    writeFileSync(join(outDir, 'fedcba9876543210.ogg.partial'), 'x');
    const stub: Renderer = {
      provider: 'gemini',
      model: MODEL,
      async render(requests, ctx) {
        for (const r of requests) await ctx.onResult({ id: r.id, ok: true, wav: stubWav(50) });
      },
    };
    await runPipeline({
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
      only: /^nothing-matches$/,
    });
    expect(existsSync(join(outDir, 'fedcba9876543210.ogg.partial'))).toBe(true);
  });
});

const read = (dir: string) =>
  audioManifestSchema.parse(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')));

describe('own pre-review checks (before round 4)', () => {
  it('a lost creation response after a failed earlier job adopts the new job, not the old one', async () => {
    const { server, run, ledger } = setup();
    await run({ only: /^fb\./ }); // job0 for fb.correct.1, left running
    server.failAll(); // job0 ends FAILED
    const failed = await run({ only: /^fb\./, maxWaitMs: 0 });
    expect(failed.failed).toHaveLength(1);
    expect(ledger().jobs).toEqual({});
    // Same chunk again: the POST lands, the response is lost, and the lookup must find the new job.
    server.failNextCreate();
    server.setAutoFinish(true);
    const report = await run({ only: /^fb\./ });
    expect(server.paidPosts).toHaveLength(2);
    expect(report).toMatchObject({ rendered: 1, failed: [], aborted: null });
    expect(ledger().jobs).toEqual({});
  });

  it('a rejected batch creation still collects the jobs already known before it stops', async () => {
    const { server, run, ledger } = setup();
    await run({ only: /^fb\./ }); // a saved job, left running
    server.finishAll();
    server.rejectNextCreate(); // the new chunk is rejected with HTTP 400
    const report = await run();
    expect(report.aborted).toMatch(/HTTP 400/);
    expect(report.rendered).toBe(1); // fb.correct.1 collected from the saved job anyway
    expect(ledger().jobs).toEqual({});
  });

  it('refuses a second concurrent render on the same ledger', async () => {
    const { run, outDir } = setup();
    mkdirSync(join(outDir, '.state'), { recursive: true });
    writeFileSync(join(outDir, '.state', 'render.lock'), '');
    const report = await run();
    expect(report.aborted).toMatch(/another narration render is writing/);
  });

  it('leaves clips a saved job already covers out of the estimate', async () => {
    const { run } = setup();
    await run({ only: /^fb\./ }); // fb.correct.1 is now covered by a saved job
    const covered = await run({ only: /^fb\./, dryRun: true });
    expect(covered.toRender).toBe(1);
    expect(covered.estimate.usd).toBe(0);
  });

  it('refuses to run when the existing manifest cannot be read', async () => {
    const { run, outDir } = setup();
    writeFileSync(join(outDir, 'manifest.json'), '{"version": "trunc');
    const report = await run();
    expect(report.aborted).toMatch(/cannot be read/);
    expect(readFileSync(join(outDir, 'manifest.json'), 'utf8')).toBe('{"version": "trunc');
  });
});

describe('review round 4', () => {
  it('refuses to run while the earlier global ledger lists jobs', () => {
    const root = mkdtempSync(join(tmpdir(), 'narration-legacy-'));
    dirs.push(root);
    expect(() => checkLegacyLedger(root)).not.toThrow(); // absent
    writeFileSync(join(root, 'gemini-batches.json'), '{}');
    expect(() => checkLegacyLedger(root)).not.toThrow(); // empty
    writeFileSync(
      join(root, 'gemini-batches.json'),
      JSON.stringify({ abc: { name: 'batches/old', createdAt: 'x' } }),
    );
    expect(() => checkLegacyLedger(root)).toThrow(/earlier version and may list paid jobs/);
  });

  it('an unfiltered run that fails keeps saved requests it no longer needs, for a later revert', async () => {
    const { server, run, ledger } = setup();
    await run(); // one job covering every clip, left running
    expect(server.paidPosts).toHaveLength(1);
    server.finishAll();
    const edited: NarrationJson = {
      ...fixtureNarration(),
      'fb.correct.1': { text: 'You did it again!', clips: ['fb.correct.1#0'] },
    };
    server.rejectNextCreate(); // the edited line's new submission is rejected
    const failed = await run({ narration: edited });
    expect(failed.complete).toBe(false);
    // The original fb.correct.1 request is still saved, so reverting the edit costs nothing.
    expect(Object.keys(ledger().jobs)).toHaveLength(1);
    const reverted = await run();
    expect(server.paidPosts).toHaveLength(1);
    expect(reverted.complete).toBe(true);
    expect(ledger().jobs).toEqual({});
  });

  it('one lock per output directory covers every format, from planning through pruning', async () => {
    expect(lockFileFor('/tmp/out-a')).toBe(lockFileFor('/tmp/out-a/'));
    const { run, outDir, manifest } = setup();
    const lockFile = join(outDir, 'held.lock');
    writeFileSync(lockFile, '');
    writeFileSync(join(outDir, 'manifest.json'), '{"version":"v","clips":{}}\n');
    const report = await run({ lockFile });
    expect(report.aborted).toMatch(/another narration render is writing/);
    expect(manifest()).toEqual({ version: 'v', clips: {} }); // untouched
  });

  it('counts unconfirmed submissions in the estimate when they may be abandoned', async () => {
    const { server, run } = setup();
    server.failNextCreate();
    server.setListFails(true);
    await run(); // an unconfirmed submission covering every clip
    server.forget();
    server.setListFails(false);
    const kept = await run({ dryRun: true });
    expect(kept.estimate.usd).toBe(0); // still covered while it may exist
    const abandoning = await run({ dryRun: true, abandonUnconfirmedBatches: true });
    expect(abandoning.estimate.usd).toBeGreaterThan(0);
    const capped = await run({ abandonUnconfirmedBatches: true, maxUsd: 0.000001 });
    expect(capped.aborted).toMatch(/exceeds --max-usd/);
    expect(server.paidPosts).toHaveLength(1);
  });
});

describe('review round 5', () => {
  it('locks the physical output directory, whatever path or symlink names it', () => {
    const real = mkdtempSync(join(tmpdir(), 'narration-real-'));
    dirs.push(real);
    const link = `${real}-link`;
    symlinkSync(real, link);
    dirs.push(link);
    expect(lockFileFor(link)).toBe(lockFileFor(real));
    expect(lockFileFor(link)).toBe(join(realpathSync(real), '.narration-render.lock'));
    expect(stateDirFor(link, 'opus')).toBe(stateDirFor(real, 'opus'));
  });

  it('keeps the ledger when publishing the manifest fails after a complete render', async () => {
    const { server, run, ledger, outDir } = setup();
    await run(); // job0 covers every clip, left running
    server.finishAll();
    server.setAutoFinish(true);
    const edited: NarrationJson = {
      ...fixtureNarration(),
      'fb.correct.1': { text: 'You did it again!', clips: ['fb.correct.1#0'] },
    };
    // The edited render gets every clip (job0 plus a new job for the edit), but publishing the
    // manifest fails: its temporary file cannot be written.
    mkdirSync(join(outDir, 'manifest.json.tmp'));
    await expect(run({ narration: edited })).rejects.toThrow();
    expect(server.paidPosts).toHaveLength(2);
    // job0 still holds the original fb.correct.1 request, so reverting the edit costs nothing.
    expect(Object.keys(ledger().jobs)).toHaveLength(1);
    rmSync(join(outDir, 'manifest.json.tmp'), { recursive: true });
    const reverted = await run();
    expect(reverted.complete).toBe(true);
    expect(server.paidPosts).toHaveLength(2);
    expect(ledger().jobs).toEqual({});
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
