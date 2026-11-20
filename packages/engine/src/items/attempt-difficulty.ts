// d_item of a logged attempt (04 §2.2). The attempt event carries the item's template, params and
// seed but not its difficulty, so the learner rebuilds the generator's features from the params
// (features never depend on layout randomness) and applies the template's weights. A template
// whose generator is unknown, or whose params no longer build, falls back to its base.
//
// Item core: this runs generators, so the learner model reaches it through the `item-core.ts`
// port and never imports it (02 §6a, #95).

import type { ItemTemplate } from '@number-island/shared';
import { registry } from '../generators';
import { createRng } from '../rng';
import { difficulty } from './difficulty';

export function attemptDifficulty(
  t: ItemTemplate,
  params: Readonly<Record<string, number | string | boolean>>,
  seed: number,
): number {
  const g = registry.get(t.generator);
  if (!g?.formats.includes(t.format)) return t.difficulty.base;
  try {
    const out = g.build({
      params: { ...params },
      template: t,
      rng: createRng(seed).fork('features'),
    });
    return difficulty(t, g, out.features);
  } catch {
    return t.difficulty.base;
  }
}
