// U05 (#14): every TIM clock template (#84, K01) through the clock-set and clock-read models:
// the generated widget passes the model's configSchema, and the solution replays through the
// model to a correct response (03 §9.4 steps 3 and 4, at more seeds than the content check).

import type { ItemTemplate } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { formatModel } from '../src/formats';
import { checkResponse } from '../src/items/check';
import { generateItem } from '../src/items/generate';
import { itemSolution, replaySteps } from '../src/items/solution';
import { loadFixture } from './fixture';

const fixture = loadFixture();
const templates = fixture.templates.filter(
  (t: ItemTemplate) => t.format === 'clock-set' || t.format === 'clock-read',
);

describe('TIM clock templates replay through the U05 clock models', () => {
  it('covers TIM.01, TIM.04 and TIM.09', () => {
    const skills = new Set(templates.map((t) => t.skillId));
    for (const s of ['TIM.01', 'TIM.04', 'TIM.09']) expect(skills.has(s)).toBe(true);
  });
  for (const t of templates) {
    it(`${t.id}: schema, solution and answer agree for 120 seeds`, () => {
      loadFixture();
      const model = formatModel(t.format);
      expect(model).toBeDefined();
      for (let seed = 1; seed <= 120; seed++) {
        const item = generateItem(t, seed);
        const parsed = model?.configSchema.safeParse(item.widget);
        expect(parsed?.success, `${t.id} seed ${seed}`).toBe(true);
        const r = replaySteps(item, itemSolution(item, t));
        expect(r, `${t.id} seed ${seed}`).not.toBeNull();
        if (r) expect(checkResponse(item, r).correct, `${t.id} seed ${seed}`).toBe(true);
      }
    });
  }
});
