import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audioManifestSchema, type NarrationJson } from '@number-island/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { stubWav } from './audio';
import { wavEncoder } from './encode';
import { type PipelineOptions, runPipeline } from './pipeline';
import { stubRenderer } from './providers/stub';
import type { Renderer } from './providers/types';
import { fixtureNarration, repoVoices } from './testing';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function options(overrides: Partial<PipelineOptions> = {}): PipelineOptions {
  const outDir = mkdtempSync(join(tmpdir(), 'narration-out-'));
  dirs.push(outDir);
  return {
    narration: fixtureNarration(),
    styles: new Map(),
    config: repoVoices(),
    provider: 'stub',
    renderer: stubRenderer(),
    encoder: wavEncoder,
    outDir,
    stateDir: join(outDir, '.state'),
    mode: 'auto',
    maxUsd: 5,
    concurrency: 2,
    maxWaitMs: 0,
    dryRun: false,
    ...overrides,
  };
}

const manifestOf = (dir: string) =>
  audioManifestSchema.parse(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')));
const clipFiles = (dir: string) => readdirSync(dir).filter((f) => /^[0-9a-f]{16}\.wav$/.test(f));

describe('runPipeline with the stub provider', () => {
  it('writes a valid manifest whose clips all exist, with durations', async () => {
    const opts = options();
    const report = await runPipeline(opts);
    expect(report.failed).toEqual([]);
    const manifest = manifestOf(opts.outDir);
    expect(Object.keys(manifest.clips)).toEqual(
      expect.arrayContaining(['fb.correct.1#0', 'tp.ADD.08.t1.prompt#0', 'num.7.end#0']),
    );
    for (const clip of Object.values(manifest.clips)) {
      expect(existsSync(join(opts.outDir, clip.file))).toBe(true);
      expect(clip.durationMs).toBeGreaterThan(0);
    }
    expect(report.manifest).toEqual(manifest);
  });

  it('renders nothing on a re-run and writes identical bytes (idempotent)', async () => {
    const opts = options();
    await runPipeline(opts);
    const first = readFileSync(join(opts.outDir, 'manifest.json'), 'utf8');
    const again = await runPipeline(opts);
    expect(again).toMatchObject({ toRender: 0, rendered: 0, pruned: [] });
    expect(again.cached).toBe(again.total);
    expect(readFileSync(join(opts.outDir, 'manifest.json'), 'utf8')).toBe(first);
  });

  it('renders only changed clips and prunes the replaced file', async () => {
    const opts = options();
    await runPipeline(opts);
    const before = manifestOf(opts.outDir);
    const edited: NarrationJson = {
      ...fixtureNarration(),
      'fb.correct.1': { text: 'You did it again!', clips: ['fb.correct.1#0'] },
    };
    const report = await runPipeline({ ...opts, narration: edited });
    expect(report).toMatchObject({ toRender: 1, rendered: 1 });
    expect(report.pruned).toEqual([before.clips['fb.correct.1#0']?.file]);
    const after = manifestOf(opts.outDir);
    for (const [id, clip] of Object.entries(after.clips)) {
      if (id !== 'fb.correct.1#0') expect(clip).toEqual(before.clips[id]);
    }
    expect(after.version).not.toBe(before.version);
    expect(clipFiles(opts.outDir).sort()).toEqual(
      [...new Set(Object.values(after.clips).map((c) => c.file))].sort(),
    );
  });

  it('renders a shared file once when clips have the same voice, style and text', async () => {
    const requested: string[] = [];
    const inner = stubRenderer();
    const renderer: Renderer = {
      ...inner,
      render: (requests, ctx) => {
        requested.push(...requests.map((r) => r.text));
        return inner.render(requests, ctx);
      },
    };
    const narration: NarrationJson = {
      ...fixtureNarration(),
      'fb.correct.2': { text: 'You did it!', clips: ['fb.correct.2#0'] },
    };
    const opts = options({ narration, renderer });
    const report = await runPipeline(opts);
    expect(requested.filter((t) => t === 'You did it!')).toHaveLength(1);
    const manifest = manifestOf(opts.outDir);
    expect(manifest.clips['fb.correct.1#0']).toEqual(manifest.clips['fb.correct.2#0']);
    expect(report.failed).toEqual([]);
  });

  it('cleans up a partial file left by an interrupted run', async () => {
    const opts = options();
    mkdirSync(opts.outDir, { recursive: true });
    writeFileSync(join(opts.outDir, '0123456789abcdef.wav.partial'), 'x');
    await runPipeline(opts);
    expect(readdirSync(opts.outDir).filter((f) => f.endsWith('.partial'))).toEqual([]);
  });

  it('cleans up only renderer-owned partial files', async () => {
    const opts = options();
    mkdirSync(opts.outDir, { recursive: true });
    writeFileSync(join(opts.outDir, 'fedcba9876543210.ogg.partial'), 'x');
    writeFileSync(join(opts.outDir, 'download.partial'), 'keep me');
    await runPipeline(opts);
    expect(existsSync(join(opts.outDir, 'fedcba9876543210.ogg.partial'))).toBe(false);
    expect(existsSync(join(opts.outDir, 'download.partial'))).toBe(true);
  });

  it('a filtered run (--only) keeps the working entries of clips it did not select', async () => {
    const opts = options();
    await runPipeline(opts);
    const before = manifestOf(opts.outDir);
    const edited: NarrationJson = {
      ...fixtureNarration(),
      'fb.correct.1': { text: 'You did it again!', clips: ['fb.correct.1#0'] },
      'ls.CNT.03.w1.s2': {
        text: 'I count each one. I stop at {n}.',
        voice: 'pip',
        clips: ['ls.CNT.03.w1.s2#0', '$n', 'ls.CNT.03.w1.s2#1'],
      },
    };
    const report = await runPipeline({ ...opts, narration: edited, only: /^fb\./ });
    expect(report).toMatchObject({ toRender: 1, rendered: 1, skipped: 1, pruned: [] });
    const after = manifestOf(opts.outDir);
    expect(after.clips['fb.correct.1#0']?.file).not.toBe(before.clips['fb.correct.1#0']?.file);
    // The unselected changed line still plays its previous audio rather than Web Speech.
    expect(after.clips['ls.CNT.03.w1.s2#0']).toEqual(before.clips['ls.CNT.03.w1.s2#0']);
  });

  it('writes the manifest for what finished even when the renderer fails part-way', async () => {
    const renderer: Renderer = {
      provider: 'stub',
      model: 'stub-1',
      async render(requests, ctx) {
        const [first] = requests;
        if (first) await ctx.onResult({ id: first.id, ok: true, wav: stubWav(50) });
        throw new Error('network down');
      },
    };
    const opts = options({ renderer });
    const report = await runPipeline(opts);
    expect(report.aborted).toBe('network down');
    expect(report.rendered).toBe(1);
    expect(Object.keys(manifestOf(opts.outDir).clips).length).toBeGreaterThan(0);
  });

  it('a dry run reports counts and the estimate and writes nothing', async () => {
    const opts = options({ dryRun: true, provider: 'gemini', renderer: null });
    const report = await runPipeline(opts);
    expect(report.total).toBeGreaterThan(0);
    // Both "plus" segments (t1 and t4) share one file, so one fewer file than clips.
    expect(report.cached).toBe(0);
    expect(report.toRender).toBe(report.total - 1);
    expect(report.mode).toBe('interactive');
    expect(report.estimate.usd).toBeGreaterThan(0);
    expect(readdirSync(opts.outDir)).toEqual([]);
  });

  it('aborts before rendering when the estimate exceeds --max-usd', async () => {
    let called = false;
    const renderer: Renderer = {
      provider: 'gemini',
      model: 'gemini-3.8-flash-tts',
      async render() {
        called = true;
      },
    };
    const opts = options({ provider: 'gemini', renderer, maxUsd: 0.000001 });
    const report = await runPipeline(opts);
    expect(called).toBe(false);
    expect(report.aborted).toMatch(/exceeds --max-usd/);
    // Only the (released) lock's state directory exists; nothing was rendered or written.
    expect(readdirSync(opts.outDir).filter((f) => f !== '.state')).toEqual([]);
  });

  it('stops spending at the cap and meters actual cost from token usage', async () => {
    const asked: number[] = [];
    const renderer: Renderer = {
      provider: 'gemini',
      model: 'gemini-3.8-flash-tts',
      async render(requests, ctx) {
        for (const r of requests) {
          const est = ctx.estimateUsd([r]);
          asked.push(est);
          if (!ctx.reserve([r.id], est)) return;
          await ctx.onResult({
            id: r.id,
            ok: true,
            wav: stubWav(50),
            usage: { inputTokens: 1_000_000, outputTokens: 0 },
          });
        }
      },
    };
    // Each clip "costs" $0.50 of input tokens; the cap admits as many estimates as fit.
    const opts = options({ provider: 'gemini', renderer, maxUsd: 0.01, mode: 'interactive' });
    const report = await runPipeline(opts);
    // The first clip's measured $0.50 already exceeds the cap, so nothing further is started.
    expect(report.rendered).toBe(1);
    expect(report.pending).toBe(report.toRender - 1);
    expect(report.spentUsd).toBeCloseTo(0.5, 6);
    expect(asked).toHaveLength(2);
    expect(Object.keys(manifestOf(opts.outDir).clips)).toHaveLength(1);
  });

  it('leaves failed clips out of the manifest so they fall back to Web Speech', async () => {
    const renderer: Renderer = {
      provider: 'stub',
      model: 'stub-1',
      async render(requests, ctx) {
        for (const r of requests) {
          await ctx.onResult(
            r.text === 'You did it!'
              ? { id: r.id, ok: false, error: 'boom' }
              : { id: r.id, ok: true, wav: stubWav(50) },
          );
        }
      },
    };
    const opts = options({ renderer });
    const report = await runPipeline(opts);
    expect(report.failed).toEqual([{ id: 'fb.correct.1#0', error: 'boom' }]);
    expect(manifestOf(opts.outDir).clips['fb.correct.1#0']).toBeUndefined();
    const retry = await runPipeline({ ...opts, renderer: stubRenderer() });
    expect(retry).toMatchObject({ toRender: 1, rendered: 1 });
  });
});
