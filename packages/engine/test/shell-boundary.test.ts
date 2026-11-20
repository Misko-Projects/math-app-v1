// The loading boundary of 02 §6a (#95): the shell entry reaches no item-core module through static
// imports, the full entry installs the item core, and the learner model refuses to run without it.
//
// The import walk reads the sources (Node, so it lives in test/). It follows every `import` and
// `export … from` that survives compilation: with `verbatimModuleSyntax`, `import { type X }` stays
// as a side-effect import, so only whole-statement `import type` / `export type` are skipped.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Directories and modules of the item core: none may be in the shell's static closure. */
const ITEM_CORE = [
  'generators/',
  'check/',
  'misconceptions/',
  'formats/',
  'strategies/',
  'items/',
  'planner/',
  'placement/',
  'content/',
  'hooks.ts',
  'index.ts',
];

function resolveModule(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`cannot resolve ${spec} from ${from}`);
}

/** The relative specifiers a module keeps at runtime. */
function runtimeImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const out: string[] = [];
  const statement = /^(?:import|export)\b([^;]*?)\bfrom\s*'([^']+)'|^import\s*'([^']+)'/gm;
  for (const m of text.matchAll(statement)) {
    const clause = (m[1] ?? '').trim();
    if (clause.startsWith('type ') || clause.startsWith('type{')) continue;
    out.push((m[2] ?? m[3]) as string);
  }
  return out;
}

function staticClosure(entry: string): Map<string, string | null> {
  const seen = new Map<string, string | null>();
  const stack: [string, string | null][] = [[join(src, entry), null]];
  while (stack.length > 0) {
    const [file, parent] = stack.pop() as [string, string | null];
    if (seen.has(file)) continue;
    seen.set(file, parent);
    for (const spec of runtimeImports(file)) {
      const target = resolveModule(file, spec);
      if (target && !seen.has(target)) stack.push([target, file]);
    }
  }
  return seen;
}

const rel = (file: string): string => relative(src, file).replaceAll('\\', '/');

describe('engine shell entry (02 §6a)', () => {
  it('reaches no item-core module through static imports', () => {
    const closure = staticClosure('shell.ts');
    const leaks: string[] = [];
    for (const [file, parent] of closure) {
      const path = rel(file);
      if (ITEM_CORE.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p))) {
        leaks.push(`${path} (imported by ${parent ? rel(parent) : 'the entry'})`);
      }
    }
    expect(leaks).toEqual([]);
    // The walk really follows the graph: it finds the learner model and the folds.
    expect([...closure.keys()].map(rel)).toEqual(
      expect.arrayContaining(['learner/elo-fire.ts', 'learner/graph.ts', 'folds/index.ts']),
    );
  });

  it('the full entry reaches the three registries', () => {
    const closure = new Set([...staticClosure('index.ts').keys()].map(rel));
    expect(closure).toContain('items/install.ts');
    expect(closure).toContain('generators/index.ts');
    expect(closure).toContain('check/state/index.ts');
    expect(closure).toContain('misconceptions/index.ts');
  });
});

describe('item core port (02 §6a)', () => {
  it('the learner model throws until the full entry is loaded, then works', async () => {
    // Fresh module instances: the setup file installed the item core into the first ones.
    vi.resetModules();
    const shell = await import('../src/shell');
    expect(shell.itemCoreLoaded()).toBe(false);

    const graph = shell.buildSkillGraph({
      contentVersion: 'test',
      skills: [],
      templates: [],
      graph: { nodes: [], roots: [], gateways: [], depth: {}, descendants2: {} },
    } as never);
    const opts = { childId: '019a0000-0000-7000-8000-0000000ac001', isK: true } as never;
    expect(() => shell.learnerModelFor(graph, opts)).toThrow(shell.ItemCoreNotLoadedError);
    expect(() => shell.foldLearnerState([], graph, opts)).toThrow(shell.ItemCoreNotLoadedError);

    const full = await import('../src/index');
    expect(shell.itemCoreLoaded()).toBe(true);
    expect(full.itemCore().parts).toEqual(full.ITEM_CORE_MARKS);
    expect(full.ITEM_CORE_MARKS).toEqual([
      'number-island:item-core/generators',
      'number-island:item-core/state-checkers',
      'number-island:item-core/misconception-rules',
    ]);
    expect(() => shell.learnerModelFor(graph, opts)).not.toThrow();
    expect(() => shell.foldLearnerState([], graph, opts)).not.toThrow();
  });
});
