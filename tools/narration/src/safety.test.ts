// Safety of the render pipeline (cross-model review of A02): partial or failed runs never remove or
// swap working audio, one lock per physical output directory, an interrupted process releases every
// lock, and provider errors never carry the API key.
import {
  chmodSync,
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
import { lockFileFor } from './cli';
import { wavEncoder } from './encode';
import { type PipelineOptions, releaseHeldLocksForTest, runPipeline } from './pipeline';
import { geminiRenderer } from './providers/gemini';
import type { Renderer } from './providers/types';
import { fixtureNarration, repoVoices } from './testing';

const KEY = 'test-key-not-real-0123456789';
const MODEL = 'gemini-3.8-flash-tts';
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      chmodSync(d, 0o755);
    } catch {
      // gone already
    }
    rmSync(d, { recursive: true, force: true });
  }
});

const tempDir = (prefix: string) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
};

/** A provider that renders every request at once (stub audio, Gemini identity). */
const instant: Renderer = {
  provider: 'gemini',
  model: MODEL,
  async render(requests, ctx) {
    for (const r of requests) await ctx.onResult({ id: r.id, ok: true, wav: stubWav(50) });
  },
};

function run(outDir: string, o: Partial<PipelineOptions> = {}) {
  return runPipeline({
    narration: fixtureNarration(),
    styles: new Map(),
    config: repoVoices(),
    provider: 'gemini',
    renderer: instant,
    encoder: wavEncoder,
    outDir,
    maxUsd: 5,
    concurrency: 1,
    dryRun: false,
    ...o,
  });
}

const read = (dir: string) =>
  audioManifestSchema.parse(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')));

describe('partial runs never remove or swap working audio', () => {
  it('a filtered run keeps entries for clips absent from the current plan', async () => {
    const out = tempDir('narration-partial-');
    await run(out);
    const before = read(out);
    const { 'noun.shell.many': _removed, ...rest } = fixtureNarration();
    await run(out, { narration: rest, only: /^fb\./ });
    expect(read(out).clips['noun.shell.many#0']).toEqual(before.clips['noun.shell.many#0']);
  });

  it('a filtered run keeps an unselected entry even when another cached file for it exists', async () => {
    const out = tempDir('narration-partial-');
    const original = fixtureNarration();
    await run(out, { narration: original });
    const changed: NarrationJson = {
      ...original,
      'fb.correct.1': { text: 'You did it again!', clips: ['fb.correct.1#0'] },
    };
    await run(out, { narration: changed, only: /^fb\./ }); // the original file stays on disk
    const updated = read(out).clips['fb.correct.1#0'];
    await run(out, { narration: original, only: /^num\./ }); // fb restored, but not selected
    expect(read(out).clips['fb.correct.1#0']).toEqual(updated);
  });

  it('a filtered run leaves partial files alone', async () => {
    const out = tempDir('narration-partial-');
    writeFileSync(join(out, 'fedcba9876543210.ogg.partial'), 'x');
    await run(out, { only: /^nothing-matches$/ });
    expect(existsSync(join(out, 'fedcba9876543210.ogg.partial'))).toBe(true);
  });

  it('an aborted run prunes nothing and keeps the previous audio', async () => {
    const out = tempDir('narration-partial-');
    await run(out);
    const before = read(out);
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
    const report = await run(out, { renderer: failing, config });
    expect(report).toMatchObject({ aborted: 'provider down', complete: false, pruned: [] });
    expect(read(out).clips).toEqual(before.clips);
    for (const c of Object.values(before.clips)) expect(existsSync(join(out, c.file))).toBe(true);
  });

  it('refuses to run when the existing manifest cannot be read', async () => {
    const out = tempDir('narration-partial-');
    writeFileSync(join(out, 'manifest.json'), '{"version": "trunc');
    const report = await run(out);
    expect(report.aborted).toMatch(/cannot be read/);
    expect(readFileSync(join(out, 'manifest.json'), 'utf8')).toBe('{"version": "trunc');
  });
});

describe('one render per physical output directory', () => {
  it('the lock lives in the physical directory, whatever path or symlink names it', () => {
    const real = tempDir('narration-real-');
    const link = `${real}-link`;
    symlinkSync(real, link);
    dirs.push(link);
    expect(lockFileFor(link)).toBe(lockFileFor(real));
    expect(lockFileFor(link)).toBe(join(realpathSync(real), '.narration-render.lock'));
    expect(lockFileFor(`${real}/`)).toBe(lockFileFor(real));
  });

  it('computing the lock path never creates the output directory (dry runs touch nothing)', () => {
    const parent = tempDir('narration-dry-');
    const out = join(parent, 'not', 'yet');
    expect(lockFileFor(out)).toBe(
      join(realpathSync(parent), 'not', 'yet', '.narration-render.lock'),
    );
    expect(existsSync(join(parent, 'not'))).toBe(false);
  });

  it('a held lock makes a second render write nothing at all', async () => {
    const out = tempDir('narration-lock-');
    writeFileSync(join(out, 'manifest.json'), '{"version":"v","clips":{}}\n');
    const lockFile = join(out, 'held.lock');
    writeFileSync(lockFile, '');
    const report = await run(out, { lockFile });
    expect(report.aborted).toMatch(/another narration render is writing/);
    expect(read(out)).toEqual({ version: 'v', clips: {} });
  });

  it('an interrupted process releases every lock it holds, even if one removal fails', async () => {
    const a = tempDir('narration-lock-a-');
    const b = tempDir('narration-lock-b-');
    const c = tempDir('narration-lock-c-');
    let unblock: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const slow: Renderer = {
      provider: 'gemini',
      model: MODEL,
      async render() {
        await gate;
      },
    };
    // c's lock sits in a directory that becomes read-only, so removing it fails.
    const lockDir = join(c, 'locks');
    mkdirSync(lockDir);
    const runs = [
      run(a, { renderer: slow, lockFile: join(a, 'render.lock') }),
      run(c, { renderer: slow, lockFile: join(lockDir, 'render.lock') }),
      run(b, { renderer: slow, lockFile: join(b, 'render.lock') }),
    ];
    await new Promise((r) => setTimeout(r, 20));
    chmodSync(lockDir, 0o555);
    const result = releaseHeldLocksForTest();
    chmodSync(lockDir, 0o755);
    expect(result.held).toBe(3);
    // Running as root ignores the read-only bit; otherwise exactly c's removal fails.
    expect(result.failures).toBeLessThanOrEqual(1);
    expect(existsSync(join(a, 'render.lock'))).toBe(false);
    expect(existsSync(join(b, 'render.lock'))).toBe(false);
    unblock();
    await Promise.all(runs);
  });
});

describe('key redaction', () => {
  it('redacts the key before truncating a long provider error', async () => {
    const out = tempDir('narration-redact-');
    // The key starts 10 characters before the 300-character cut-off.
    const longMessage = `${'x'.repeat(285)} key=${KEY} trailing`;
    const fetch = (async () =>
      new Response(JSON.stringify({ error: { message: longMessage } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof globalThis.fetch;
    const renderer = geminiRenderer({ apiKey: KEY, model: MODEL, fetch, sleep: async () => {} });
    const report = await run(out, {
      narration: { 'fb.correct.1': { text: 'You did it!', clips: ['fb.correct.1#0'] } },
      renderer,
    });
    const text = JSON.stringify(report.failed);
    expect(text).toContain('HTTP 400');
    expect(text).not.toContain(KEY.slice(0, 10));
  });
});
