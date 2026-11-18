// Cross-package check for A02 (07 §3) against A01 (02 §5.5): the narration renderer's output is
// something the AudioManager actually plays. It lives in the repo-level `scripts` project because
// tools/narration may not import packages/ui, nor the reverse (02 §2).
//
// 1. The stub provider renders the real content build; A01's manifest loader accepts the manifest,
//    and A01's planner finds every clip of every line in it (so no line falls back to Web Speech).
// 2. A01's WebAudioManager plays stitched lines from those files, using the sentence-final
//    `num.<n>.end#0` clip when a number ends the sentence.
// 3. The committed render (apps/web/public/audio) is a valid manifest whose files all exist.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AudioManifest, NarrationJson } from '../packages/shared/src/index';
import {
  type AudioEvent,
  createAudioManager,
  loadAudioManifest,
  parseSlotToken,
  planLine,
  SlotError,
} from '../packages/ui/src/audio/index';
import type { SpeechBackend } from '../packages/ui/src/audio/speech';
import {
  asAudioContext,
  FakeAudioContext,
  fakeEncodedClip,
} from '../packages/ui/src/audio/testing/fakeAudioContext';
import {
  loadStyles,
  loadVoicesConfig,
  runPipeline,
  stubRenderer,
  wavEncoder,
} from '../tools/narration/src/index';

const ROOT = join(import.meta.dirname, '..');
const narration = JSON.parse(
  readFileSync(join(ROOT, 'packages/content/dist/narration.json'), 'utf8'),
) as NarrationJson;

let outDir = '';
let manifest: AudioManifest | null = null;

/** A fetch over the rendered directory, as the browser would see it under /audio/. */
const fetchFromOut = (async (url: string) => {
  const file = join(outDir, url.replace(/^\/audio\//, ''));
  if (!existsSync(file)) return new Response('not found', { status: 404 });
  return new Response(readFileSync(file));
}) as unknown as typeof fetch;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'narration-playback-'));
  const report = await runPipeline({
    narration,
    styles: loadStyles(join(ROOT, 'packages/content/narration')),
    config: loadVoicesConfig(join(ROOT, 'packages/content/narration/voices.yaml')),
    provider: 'stub',
    renderer: stubRenderer(),
    encoder: wavEncoder,
    outDir,
    maxUsd: 0,
    concurrency: 1,
    dryRun: false,
  });
  expect(report.failed).toEqual([]);
  manifest = await loadAudioManifest('/audio/manifest.json', fetchFromOut, (m) => {
    throw new Error(m);
  });
});

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

/** One sample value per slot type, so every line can be planned (03 §8.3). */
function sampleVars(clips: readonly string[]): Record<string, string | number> {
  const firstId = (ns: string) =>
    Object.keys(narration)
      .find((k) => k.startsWith(`${ns}.`))
      ?.split('.')[1] ?? '';
  const vars: Record<string, string | number> = {};
  for (const clip of clips) {
    const token = clip.startsWith('$') ? parseSlotToken(clip) : null;
    if (!token) continue;
    const samples: Record<string, string | number> = {
      num: 23,
      digits: 345,
      ord: 3,
      cents: 25,
      dollars: 125,
      time: '7:05',
      frac: '3/4',
      dec: 47,
      noun: firstId('noun'),
      unit: firstId('unit'),
      shape: firstId('shape'),
      name: firstId('res'),
      word: 'and',
    };
    vars[token.name] = samples[token.type ?? 'num'] ?? 23;
    if (token.suffix && /^[A-Za-z_]/.test(token.suffix)) vars[token.suffix] = 2;
  }
  return vars;
}

describe('stub render → A01 AudioManager', () => {
  it('A01 loads the manifest, and every planned clip of every line is in it', () => {
    expect(manifest).not.toBeNull();
    const missing: string[] = [];
    let planned = 0;
    for (const [key, entry] of Object.entries(narration)) {
      let plan: ReturnType<typeof planLine>;
      try {
        plan = planLine(narration, key, sampleVars(entry.clips));
      } catch (e) {
        if (e instanceof SlotError) continue;
        throw e;
      }
      if (!plan?.clips) continue;
      planned += 1;
      for (const clip of plan.clips) {
        if (clip.optional) continue;
        if (!clip.candidates.some((c) => manifest?.clips[c]))
          missing.push(`${key}: ${clip.candidates.join(' | ')}`);
      }
    }
    expect(planned).toBeGreaterThan(Object.keys(narration).length * 0.9);
    expect(missing).toEqual([]);
  });

  it('plays a stitched line from the rendered files, ending on the `.end` number clip', async () => {
    const ctx = new FakeAudioContext();
    const spoken: string[] = [];
    const speech: SpeechBackend = {
      available: true,
      speak: (text) => {
        spoken.push(text);
        return { done: Promise.resolve(), cancel: () => {} };
      },
      cancel: () => {},
      prime: () => {},
    };
    const fetched: string[] = [];
    const events: AudioEvent[] = [];
    const manager = createAudioManager({
      narration,
      manifest,
      createContext: () => asAudioContext(ctx),
      fetchClip: async (url) => {
        fetched.push(url);
        const res = await fetchFromOut(url);
        if (!res.ok) throw new Error(`missing ${url}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        expect(bytes.length).toBeGreaterThan(44);
        return fakeEncodedClip(url, 0.3);
      },
      speech,
      warn: (m) => {
        throw new Error(m);
      },
    });
    manager.subscribe((e) => events.push(e));
    await manager.unlock();

    // "I count each one once. I stop at {n}." (Pip, CNT.03): the number ends the sentence.
    const line = manager.say('ls.CNT.03.w1.s2', { n: 23 });
    for (let i = 0; i < 50; i += 1) await Promise.resolve();
    const start = events.find((e) => e.type === 'line-start');
    expect(start).toMatchObject({ via: 'clips', voice: 'pip' });
    expect(start?.type === 'line-start' && start.clips).toEqual([
      'ls.CNT.03.w1.s2#0',
      'num.23.end#0',
    ]);
    expect(fetched).toEqual([
      `/audio/${manifest?.clips['ls.CNT.03.w1.s2#0']?.file}`,
      `/audio/${manifest?.clips['num.23.end#0']?.file}`,
    ]);
    expect(spoken).toEqual([]);
    manager.stop();
    await line;
  });
});

describe('the committed render (apps/web/public/audio)', () => {
  const dir = join(ROOT, 'apps/web/public/audio');

  it('is a valid manifest whose clip files all exist, with no orphan files', async () => {
    const committed = await loadAudioManifest(
      '/audio/manifest.json',
      (async (url: string) =>
        new Response(
          readFileSync(join(dir, url.replace(/^\/audio\//, ''))),
        )) as unknown as typeof fetch,
      (m) => {
        throw new Error(m);
      },
    );
    expect(committed).not.toBeNull();
    const files = new Set(Object.values(committed?.clips ?? {}).map((c) => c.file));
    for (const clip of Object.values(committed?.clips ?? {})) {
      expect(clip.file).toMatch(/^[0-9a-f]{16}\.ogg$/);
      expect(clip.durationMs).toBeGreaterThan(0);
    }
    const onDisk = readdirSync(dir).filter(
      (f) => f !== 'manifest.json' && f !== '.narration-render.lock',
    );
    expect(onDisk.sort()).toEqual([...files].sort());
    // Every clip is a real Ogg Opus file.
    for (const f of files) {
      const head = readFileSync(join(dir, f)).subarray(0, 36).toString('latin1');
      expect(head.startsWith('OggS') && head.includes('OpusHead')).toBe(true);
    }
  });
});
