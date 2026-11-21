// U05 (#14): every real template of the fraction formats (FRA.01, FRA.07, FRA.08 from K01) builds
// a widget the format model's schema accepts, and its solution replays through the model to a
// correct response (03 §9.4 steps 3 and 4, spelled out per template). The pictures every
// fraction stimulus asks for (including compare and order's) have exactly `parts` parts with
// `shaded` filled, equal when the spec says so.

import type { ItemTemplate, StimulusSpec } from '@number-island/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { formatModel } from '../src/formats';
import { fractionPicture, pictureShares } from '../src/formats/fraction-geometry';
import { checkResponse } from '../src/items/check';
import { generateItem } from '../src/items/generate';
import { itemSolution, replaySteps } from '../src/items/solution';
import { loadFixture } from './fixture';

const FORMATS = new Set(['fraction-cut', 'fraction-pick', 'fraction-line']);
const SEEDS = 60;

let templates: ItemTemplate[] = [];
beforeAll(() => {
  templates = loadFixture().templates;
});

function fractionsIn(s: unknown, out: Extract<StimulusSpec, { kind: 'fraction' }>[] = []) {
  if (s && typeof s === 'object') {
    const o = s as Record<string, unknown>;
    if (o.kind === 'fraction') out.push(o as Extract<StimulusSpec, { kind: 'fraction' }>);
    for (const v of Object.values(o)) fractionsIn(v, out);
  }
  return out;
}

describe('U05 fraction templates', () => {
  it('the K01 fraction templates exist for all three formats', () => {
    const ids = templates.filter((t) => FORMATS.has(t.format)).map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'FRA.01.t1',
        'FRA.01.t2',
        'FRA.01.t3',
        'FRA.01.t4',
        'FRA.07.t3',
        'FRA.07.t4',
      ]),
    );
  });

  it('every template: schema accepts the widget, the solution replays to a correct response', () => {
    const fra = templates.filter((t) => FORMATS.has(t.format));
    for (const t of fra) {
      const model = formatModel(t.format);
      expect(model, t.format).toBeDefined();
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const item = generateItem(t, seed);
        const parsed = model?.configSchema.safeParse(item.widget);
        expect(
          parsed?.success,
          `${t.id} seed ${seed}: ${JSON.stringify(parsed?.error?.issues)}`,
        ).toBe(true);
        const r = replaySteps(item, itemSolution(item, t));
        expect(r, `${t.id} seed ${seed}`).not.toBeNull();
        expect(checkResponse(item, r as never).correct, `${t.id} seed ${seed}`).toBe(true);
      }
    }
  });

  it('every fraction picture any template shows has the stated parts, equal when stated', () => {
    for (const t of templates) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const item = generateItem(t, seed);
        for (const f of fractionsIn(item.widget)) {
          const shares = pictureShares(fractionPicture(f.shape, f.parts, f.equalParts));
          expect(shares.length, t.id).toBe(f.parts);
          expect(f.shaded, t.id).toBeLessThanOrEqual(f.parts);
          const equal = shares.every((x) => Math.abs(x - 1 / f.parts) < 1e-9);
          expect(equal, `${t.id} seed ${seed}`).toBe(f.equalParts || f.parts === 1);
        }
      }
    }
  });
});
