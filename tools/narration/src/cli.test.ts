import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { geminiKey, main, readEnvKey } from './cli';
import { kokoroRenderer } from './providers/kokoro';

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function captureLog() {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.join(' '));
  });
  return lines;
}

describe('the Gemini key', () => {
  it('reads GEMINI_API_KEY from the environment first, then the secrets file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'narration-secrets-'));
    dirs.push(dir);
    const file = join(dir, 'secrets.env');
    writeFileSync(file, '# keys\nOPENAI_API_KEY=o\nexport GEMINI_API_KEY="from-file" # note\n');
    expect(geminiKey({ MATH_APP_SECRETS: file })).toBe('from-file');
    expect(geminiKey({ MATH_APP_SECRETS: file, GEMINI_API_KEY: 'from-env' })).toBe('from-env');
    expect(geminiKey({ MATH_APP_SECRETS: join(dir, 'missing.env') })).toBeUndefined();
    expect(readEnvKey('GEMINI_API_KEY=\n', 'GEMINI_API_KEY')).toBeUndefined();
    expect(readEnvKey("GEMINI_API_KEY='a b'", 'GEMINI_API_KEY')).toBe('a b');
  });
});

describe('pnpm narration:render without a key', () => {
  const noKey = (dir: string) => ({ MATH_APP_SECRETS: join(dir, 'none.env'), PATH: '' });

  it('--dry-run lists counts and the estimate, then exits 0 with instructions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'narration-nokey-'));
    dirs.push(dir);
    const lines = captureLog();
    const code = await main(['render', '--dry-run', '--provider', 'gemini'], noKey(dir));
    expect(code).toBe(0);
    const out = lines.join('\n');
    expect(out).toMatch(/clips: \d+ needed, \d+ already rendered, \d+ to render/);
    expect(out).toMatch(/estimate: .*→ \$\d+\.\d{4} \(cap \$5\.0000\)/);
    expect(out).toContain('live render pending a key');
    expect(out).toContain('GEMINI_API_KEY');
  });

  it('a real run also exits 0 with instructions and renders nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'narration-nokey-'));
    dirs.push(dir);
    const lines = captureLog();
    const out = join(dir, 'audio');
    const code = await main(['render', '--provider', 'gemini', '--out', out], noKey(dir));
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('live render pending a key');
  });

  it('rejects an unknown provider', async () => {
    await expect(main(['render', '--provider', 'nope'], {})).rejects.toThrow();
  });
});

describe('kokoro', () => {
  const ctx = {
    mode: 'interactive' as const,
    concurrency: 1,
    reserve: () => true,
    onResult: async () => {},
    log: () => {},
    stateDir: tmpdir(),
    maxWaitMs: 0,
    estimateUsd: () => 0,
  };

  it('never runs in CI, so it never downloads its model there', async () => {
    const load = vi.fn();
    const r = kokoroRenderer({ model: 'm', env: { CI: 'true' }, load });
    await expect(r.render([], ctx)).rejects.toThrow(/never runs in CI/);
    expect(load).not.toHaveBeenCalled();
  });

  it('explains how to install kokoro-js when it is missing', async () => {
    const r = kokoroRenderer({
      model: 'm',
      env: {},
      load: () => Promise.reject(new Error('Cannot find package')),
    });
    await expect(r.render([], ctx)).rejects.toThrow(/add kokoro-js/);
  });

  it('turns generated samples into WAV clips', async () => {
    const results: unknown[] = [];
    const r = kokoroRenderer({
      model: 'm',
      env: {},
      load: async () => ({
        KokoroTTS: {
          from_pretrained: async () => ({
            generate: async () => ({ audio: new Float32Array(2400), sampling_rate: 24000 }),
          }),
        },
      }),
    });
    await r.render([{ id: 'a', text: 'hi', voiceName: 'af_heart', styleText: '' }], {
      ...ctx,
      onResult: async (o) => {
        results.push(o);
      },
    });
    expect(results).toMatchObject([{ id: 'a', ok: true }]);
  });
});
