import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { measure } from './bundle-size.mjs';

const budgets = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'bundle-budgets.json'), 'utf8'),
);

const manifest = {
  'index.html': { file: 'assets/index.js', isEntry: true, imports: ['_vendor.js'] },
  '_vendor.js': { file: 'assets/vendor.js' },
  '_shared-widget.js': { file: 'assets/shared-widget.js' },
  'src/workshops/bakery/index.tsx': {
    file: 'assets/bakery.js',
    src: 'src/workshops/bakery/index.tsx',
    isDynamicEntry: true,
    imports: ['_vendor.js', '_shared-widget.js'],
  },
  'src/workshops/dock/index.tsx': {
    file: 'assets/dock.js',
    src: 'src/workshops/dock/index.tsx',
    isDynamicEntry: true,
    imports: ['_vendor.js'],
  },
  'src/pixi.ts': { file: 'assets/pixi.js', src: 'src/pixi.ts', isDynamicEntry: true },
};

const sizes: Record<string, number> = {
  'assets/index.js': 50 * 1024,
  'assets/vendor.js': 100 * 1024,
  'assets/shared-widget.js': 30 * 1024,
  'assets/bakery.js': 80 * 1024,
  'assets/dock.js': 10 * 1024,
  'assets/pixi.js': 400 * 1024,
};

describe('bundle-size', () => {
  it('reads the 02 §6 budgets from bundle-budgets.json', () => {
    expect(budgets.initialJsKbGzip).toBe(350);
    expect(budgets.workshopChunkKbGzip).toBe(120);
  });

  it('sums the initial static closure and each workshop beyond it; lazy chunks are excluded', () => {
    const report = measure({ manifest, budgets, gzipSizeOf: (f: string) => sizes[f] ?? 0 });
    expect(report.initial.kbGzip).toBe(150);
    expect(report.workshops).toEqual([
      { id: 'bakery', kbGzip: 110, budgetKbGzip: 120, ok: true },
      { id: 'dock', kbGzip: 10, budgetKbGzip: 120, ok: true },
    ]);
    expect(report.ok).toBe(true);
  });

  it('fails when a budget is exceeded', () => {
    const big: Record<string, number> = {
      ...sizes,
      'assets/bakery.js': 100 * 1024,
      'assets/index.js': 300 * 1024,
    };
    const report = measure({ manifest, budgets, gzipSizeOf: (f: string) => big[f] ?? 0 });
    expect(report.initial.ok).toBe(false);
    expect(report.workshops.find((w: { id: string }) => w.id === 'bakery')?.ok).toBe(false);
    expect(report.ok).toBe(false);
  });
});
