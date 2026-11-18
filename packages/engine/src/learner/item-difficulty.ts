// d_item of a logged attempt (04 §2.2). The attempt event carries the item's template, params and
// seed but not its difficulty, so the learner rebuilds the generator's features from the params
// (features never depend on layout randomness) and applies the template's weights. A template
// whose generator is unknown, or whose params no longer build, falls back to its base.

import type { ItemTemplate } from '@number-island/shared';
import { registry } from '../generators';
import { difficulty } from '../items/difficulty';
import { createRng } from '../rng';

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
