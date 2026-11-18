/// <reference types="node" />
// 04 §8: the graph the simulated-learner harness runs on. It compiles the current content sources
// in memory (the same compiler `pnpm content:build` runs) and binds them to the engine, so the
// harness covers whatever the content holds: the fixture today, the full K–3 graph as content
// issues add skills, with no switch to flip.

import type { GeneratedItem, ItemTemplate, SkillGraph } from '@number-island/shared';
import { generateItem } from '../../src/items/generate';
import { fixtureGraph, loadFixture } from '../fixture';

export interface SimContent {
  graph: SkillGraph;
  template(id: string): ItemTemplate;
  /** The item a probe presents: generated at the reference difficulty d* = 0 (04 §5). */
  probeItem(templateId: string, seed: number): GeneratedItem;
}

let cached: SimContent | null = null;

export function simContent(): SimContent {
  if (cached) return cached;
  loadFixture();
  const graph = fixtureGraph();
  const template = (id: string): ItemTemplate => {
    const t = graph.templates[id];
    if (!t) throw new Error(`no template ${id}`);
    return t;
  };
  cached = {
    graph,
    template,
    probeItem: (id, seed) => generateItem(template(id), seed, { difficulty: 0 }),
  };
  console.log(
    `sim content: ${graph.nodes.length} skills, ${Object.keys(graph.templates).length} templates, contentVersion ${graph.contentVersion}`,
  );
  return cached;
}

/** k for a k-choice item (the BKT guess 1/k), from the options the generator built. */
export function choiceCount(item: GeneratedItem): number | undefined {
  if (item.answer.kind !== 'choice') return undefined;
  const w = item.widget as unknown as {
    options?: unknown[];
    pickOptions?: unknown[];
    ask?: string;
  };
  const n = w.options?.length ?? w.pickOptions?.length;
  if (n !== undefined && n >= 2) return n;
  if (item.format === 'compare') return w.ask === 'symbol' ? 3 : 2;
  return undefined;
}
