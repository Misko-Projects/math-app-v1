import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkRepo, checkSource, packageFiles } from './check-boundaries.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = (dir: string) => join(root, dir, 'src', 'probe.ts');

describe('import-boundary lint (02 §2)', () => {
  it('fails when packages/engine imports React', () => {
    const v = checkSource(
      'engine',
      file('packages/engine'),
      "import { useState } from 'react';\n",
      root,
    );
    expect(v.join('\n')).toMatch(/engine is pure and must not import "react"/);
  });

  it('fails when packages/engine touches window (directly or via globalThis)', () => {
    const v = checkSource(
      'engine',
      file('packages/engine'),
      'export const w = window.innerWidth;\nexport const h = globalThis.document;\n',
      root,
    );
    expect(v.some((x) => x.includes('browser global window'))).toBe(true);
    expect(v.some((x) => x.includes('globalThis.document'))).toBe(true);
  });

  it('does not flag a property or local that happens to be named window', () => {
    const v = checkSource(
      'engine',
      file('packages/engine'),
      'const o = { window: 1 };\nexport const n = o.window;\nexport interface P { document: string }\n',
      root,
    );
    expect(v).toEqual([]);
  });

  it('fails when packages/content imports packages/engine (by name or relative path)', () => {
    const byName = checkSource(
      'content',
      file('packages/content'),
      "import { createRng } from '@number-island/engine';\n",
      root,
    );
    expect(byName.join('\n')).toMatch(/content must not import engine/);
    const byPath = checkSource(
      'content',
      file('packages/content'),
      "export * from '../../engine/src/index';\n",
      root,
    );
    expect(byPath.join('\n')).toMatch(/content must not import engine/);
  });

  it('enforces the rest of the direction', () => {
    const ok = (pkg: string, dir: string, spec: string) =>
      checkSource(pkg, file(dir), `import '${spec}';\n`, root);
    expect(ok('engine', 'packages/engine', '@number-island/content')).toEqual([]);
    expect(ok('engine', 'packages/engine', '@number-island/ui')).not.toEqual([]);
    expect(ok('shared', 'packages/shared', '@number-island/content')).not.toEqual([]);
    expect(ok('api', 'apps/api', '@number-island/engine')).toEqual([]);
    expect(ok('api', 'apps/api', '@number-island/ui')).not.toEqual([]);
    expect(ok('ui', 'packages/ui', '@number-island/web')).not.toEqual([]);
    expect(ok('web', 'apps/web', '@number-island/ui')).toEqual([]);
  });

  it('bans Dexie, Node built-ins, Math.random and Date.now where the spec says so', () => {
    expect(
      checkSource('shared', file('packages/shared'), "import Dexie from 'dexie';\n", root),
    ).not.toEqual([]);
    expect(
      checkSource(
        'engine',
        file('packages/engine'),
        "import { readFileSync } from 'node:fs';\n",
        root,
      ),
    ).not.toEqual([]);
    expect(
      checkSource('engine', file('packages/engine'), 'export const r = Math.random();\n', root),
    ).not.toEqual([]);
    expect(
      checkSource('engine', file('packages/engine'), 'export const t = Date.now();\n', root),
    ).not.toEqual([]);
    expect(
      checkSource('content', file('packages/content'), 'export const r = Math.random();\n', root),
    ).not.toEqual([]);
    // the web app may use the clock and React
    expect(
      checkSource(
        'web',
        file('apps/web'),
        "import { useState } from 'react';\nexport const t = Date.now();\n",
        root,
      ),
    ).toEqual([]);
  });

  it('does not flag locally bound names that shadow browser globals', () => {
    const v = checkSource(
      'engine',
      file('packages/engine'),
      [
        'export function f(document: string) { return document.length; }',
        'const location = { x: 1 };',
        'export const x = location.x;',
        'export const g = ({ navigator }: { navigator: number }) => navigator + 1;',
        'try { f("a"); } catch (self) { void self; }',
      ].join('\n'),
      root,
    );
    expect(v).toEqual([]);
  });

  it('resolves names lexically: a local in one scope does not hide the global in another', () => {
    const v = checkSource(
      'engine',
      file('packages/engine'),
      [
        'export function a() { const location = 1; return location; }',
        'export function b() { return location.href; }',
        'export function c(data: { location: number }) { const { location: point } = data; return point; }',
      ].join('\n'),
      root,
    );
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/probe\.ts:2:\d+ .*browser global location/);
  });

  it('binds files given Windows-style paths (TypeScript hands the host forward slashes)', () => {
    const winPath = 'C:\\repo\\packages\\engine\\src\\probe.ts';
    const local = checkSource(
      'engine',
      winPath,
      'export function f(document: string) { return document; }\n',
      root,
    );
    expect(local).toEqual([]);
    const global = checkSource('engine', winPath, 'export const w = window;\n', root);
    expect(global.join('\n')).toMatch(/browser global window/);
  });

  it('flags a shorthand property whose value is the browser global', () => {
    const v = checkSource(
      'engine',
      file('packages/engine'),
      'export const o = { window };\n',
      root,
    );
    expect(v.join('\n')).toMatch(/browser global window/);
  });

  it('scans checked-in dot directories such as packages/ui/.storybook', () => {
    const uiFiles = [...packageFiles(root, 'ui')].map((f) => f.file);
    expect(uiFiles.some((f) => f.endsWith(join('.storybook', 'main.ts')))).toBe(true);
  });

  it('scans every file in a package: direction everywhere, purity only under src/', () => {
    const contentFiles = [...packageFiles(root, 'content')];
    const build = contentFiles.find((f) => f.file.endsWith(join('scripts', 'build.mjs')));
    expect(build?.runtime).toBe(false);
    expect(contentFiles.some((f) => f.runtime)).toBe(true);

    const script = join(root, 'packages/content/scripts/probe.mjs');
    // a content build script must not import the engine (03 §9.1 / 02 §2)…
    expect(
      checkSource('content', script, "import '@number-island/engine';\n", root, { runtime: false }),
    ).not.toEqual([]);
    // …but Node-only scripts outside src/ may use Node built-ins and the clock
    expect(
      checkSource(
        'engine',
        join(root, 'packages/engine/scripts/probe.mjs'),
        "import { readFileSync } from 'node:fs';\nexport const t = Date.now();\n",
        root,
        { runtime: false },
      ),
    ).toEqual([]);
  });

  it('passes on the repository as committed', () => {
    expect(checkRepo(root)).toEqual([]);
  });
});
