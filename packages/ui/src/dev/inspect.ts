// Dev-only (Content Browser): what `pnpm content:sample` prints for an item (describeItem in
// tools/content-check/src/sample.ts), as data the browser renders. Keep the two in step.
import {
  featureWeight,
  generateItem,
  itemFeatures,
  itemKey,
  registry,
  render,
} from '@number-island/engine';
import type { GeneratedItem, ItemTemplate } from '@number-island/shared';

export interface DifficultyTerm {
  feature: string;
  weight: number;
  value: number;
  contribution: number;
}

export interface DifficultyBreakdown {
  base: number;
  terms: DifficultyTerm[];
  /** `item.difficulty`: base + Σ weight × value, rounded the way the engine rounds it. */
  total: number;
}

/** base + Σ w_f · x_f over the item's non-zero features (03 §5.4). */
export function difficultyBreakdown(t: ItemTemplate, item: GeneratedItem): DifficultyBreakdown {
  const g = registry.get(t.generator);
  const terms = Object.entries(itemFeatures(item, t))
    .filter(([, x]) => x !== 0)
    .map(([feature, value]) => {
      const weight = g ? (featureWeight(t, g, feature) ?? 0) : 0;
      return { feature, weight, value, contribution: weight * value };
    });
  return { base: t.difficulty.base, terms, total: item.difficulty };
}

/** The one-line answer summary `content:sample` prints. */
export function answerSummary(item: GeneratedItem): string {
  const a = item.answer;
  switch (a.kind) {
    case 'number':
      return `number ${a.value}${a.tolerance ? ` ± ${a.tolerance}` : ''}`;
    case 'numbers':
      return `numbers ${JSON.stringify(a.values)}${a.ordered ? ' (ordered)' : ''}`;
    case 'choice':
      return `choice ${a.id}`;
    case 'placement':
      return `placement ${a.value} ± ${a.tolerance}`;
    case 'state':
      return `state ${a.checker}`;
  }
}

export interface HintRow {
  level: number;
  kind: string;
  key: string;
  text: string;
  ops: string[];
  overlay: string | null;
}

/** The hint ladder with rendered text, demo ops and overlay kind. */
export function hintRows(item: GeneratedItem): HintRow[] {
  return item.hints.map((h) => ({
    level: h.level,
    kind: h.kind,
    key: h.say,
    text: render(h.say, h.vars ?? {}),
    ops: (h.actions ?? []).map((a) => a.op),
    overlay: h.overlay?.kind ?? null,
  }));
}

export interface DifficultySpread {
  min: number;
  p10: number;
  median: number;
  p90: number;
  max: number;
  distinct: number;
  n: number;
}

const quantile = (sorted: number[], q: number): number =>
  sorted[Math.floor(q * (sorted.length - 1))] as number;

/**
 * Untargeted difficulty quantiles over seeds 1 … n: the same computation as `difficultyStats` in
 * `@number-island/engine/testing` (template-stats.json, 03 §9.2), which can't be imported here
 * because that module pulls in fast-check. Null when the template generates nothing.
 */
export function difficultySpread(t: ItemTemplate, n = 200): DifficultySpread | null {
  const ds: number[] = [];
  const keys = new Set<string>();
  for (let seed = 1; seed <= n; seed += 1) {
    try {
      const item = generateItem(t, seed);
      ds.push(item.difficulty);
      keys.add(itemKey(item));
    } catch {
      // A seed that fails to generate is shown when the author picks it; skip it here.
    }
  }
  if (ds.length === 0) return null;
  ds.sort((a, b) => a - b);
  return {
    min: ds[0] as number,
    p10: quantile(ds, 0.1),
    median: quantile(ds, 0.5),
    p90: quantile(ds, 0.9),
    max: ds[ds.length - 1] as number,
    distinct: keys.size,
    n: ds.length,
  };
}

/** Rounds to 3 decimals for display (feature values and weights are short decimals). */
export const fmt = (x: number): string => String(Number(x.toFixed(3)));
