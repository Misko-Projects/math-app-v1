// `pnpm content:build` (03 §9.1): `template-stats.json` is a build output. A seeded lesson example
// aims at it (03 §6.1), so the file must be in every build and be the same bytes whatever else ran.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DIST_FILES } from '@number-island/content';
import { readContentFiles, readDist, writeDist } from '@number-island/content/node';
import type { ItemTemplate } from '@number-island/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildContent } from './build';
import { staleStatsDiagnostic, TEMPLATE_STATS_FILE, type TemplateStats } from './stats';

// Two or three builds of the whole catalog, 500 seeds a template each.
const BUILDS = { timeout: 120_000 };

const build = () => {
  const built = buildContent(readContentFiles());
  if (!built.ok) throw new Error(built.errors.join('\n'));
  return built.outputs;
};

afterEach(() => vi.unstubAllEnvs());

describe('content:build', BUILDS, () => {
  it('writes the compiled files and the template stats, one entry per template', () => {
    const dir = mkdtempSync(join(tmpdir(), 'content-build-'));
    try {
      writeDist(build(), dir);
      const dist = readDist(dir) ?? {};
      expect(Object.keys(dist).sort()).toEqual([...DIST_FILES, TEMPLATE_STATS_FILE].sort());
      const templates = JSON.parse(dist['templates.json'] as string) as ItemTemplate[];
      const stats = JSON.parse(dist[TEMPLATE_STATS_FILE] as string) as TemplateStats;
      expect(Object.keys(stats).sort()).toEqual(templates.map((t) => t.id).sort());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gives the same stats bytes on every build, whatever CONTENT_PROPERTY_N is', () => {
    const first = build();
    // The seed count of the V15 property test (100 on pull requests, 500 nightly) is not the
    // stats' seed count: a nightly build must ship the same lesson examples as a pull request's.
    vi.stubEnv('CONTENT_PROPERTY_N', '7');
    const second = build();
    expect(second[TEMPLATE_STATS_FILE]).toBe(first[TEMPLATE_STATS_FILE]);
    expect(second).toEqual(first);
  });

  it('fails, naming the template, when one cannot generate', () => {
    const files = { ...readContentFiles() };
    const name = Object.keys(files).find((f) => f.startsWith('templates/')) as string;
    const source = files[name] as string;
    const generator = /^\s*generator: (\S+)$/m.exec(source);
    if (!generator) throw new Error(`no generator line in ${name}`);
    files[name] = source.replace(
      generator[0],
      generator[0].replace(generator[1] as string, 'no.such'),
    );
    const built = buildContent(files);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.errors.join('\n')).toMatch(/template-stats\.json: \S+: /);
  });
});

describe('content:validate on the built stats (V24)', () => {
  const stats: TemplateStats = {
    'T.a': { min: -1, p10: -0.5, median: 0, p90: 0.5, max: 1, distinct: 9 },
  };
  const text = '{"T.a":{"distinct":9,"max":1,"median":0,"min":-1,"p10":-0.5,"p90":0.5}}\n';

  it('accepts the exact bytes the content gives', () => {
    expect(staleStatsDiagnostic(stats, text)).toBeNull();
  });

  it.each([
    ['a missing file', null],
    ['other numbers', text.replace('"median":0', '"median":0.1')],
    ['other bytes for the same numbers', text.trimEnd()],
  ])('reports %s as an error', (_name, built) => {
    expect(staleStatsDiagnostic(stats, built)).toMatchObject({
      check: 'V24',
      severity: 'error',
      file: 'dist/template-stats.json',
    });
  });
});
