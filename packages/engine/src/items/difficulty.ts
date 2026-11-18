// 03 §5.4 / 04 §2.2 LLTM-style difficulty:
//   d_item = t.difficulty.base + Σ_f w_f · x_f
//   w_f    = t.difficulty.features[f] ?? generator.features[f].weight ?? FORMAT_FEATURES[t.format][f].weight

import type { ItemTemplate } from '@number-island/shared';
import { formatFeatures } from '../formats';
import type { GeneratorDef } from '../generators/types';

/** The resolved weight of one feature for a template, or undefined when nothing weights it (V13). */
export function featureWeight(
  t: ItemTemplate,
  g: GeneratorDef,
  feature: string,
): number | undefined {
  return (
    t.difficulty.features[feature] ??
    g.features[feature]?.weight ??
    formatFeatures(t.format)[feature]?.weight
  );
}

/** Every resolved weight a template's items can use (generator features, then format features). */
export function resolvedWeights(t: ItemTemplate, g: GeneratorDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [f, { weight }] of Object.entries(formatFeatures(t.format))) out[f] = weight;
  for (const [f, { weight }] of Object.entries(g.features)) out[f] = weight;
  for (const [f, w] of Object.entries(t.difficulty.features)) out[f] = w;
  return out;
}

export function difficulty(
  t: ItemTemplate,
  g: GeneratorDef,
  features: Readonly<Record<string, number>>,
): number {
  let d = t.difficulty.base;
  for (const [f, x] of Object.entries(features)) {
    if (x === 0) continue;
    d += (featureWeight(t, g, f) ?? 0) * x;
  }
  // Round away floating-point noise so equal items compare equal on every device.
  return Math.round(d * 1e9) / 1e9;
}
