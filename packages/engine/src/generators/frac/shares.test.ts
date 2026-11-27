// 03 §5.6 frac.shares (FRA.16, K02 slice 4c-2): every cut is a valid grid-parts picture of
// rectangles of at least 2 squares; the equal cuts are equal and look different (not all the same
// rectangle, turned or not); the unequal ones differ by at least one whole square; answers,
// solutions and the two misconception rules.

import {
  type GeneratedItem,
  gridPartRect,
  type ItemFormat,
  type ItemTemplate,
  stimulusSpecSchema,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { checkResponse } from '../../items/check';
import { generateItemFromParams } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { fractionUnequalParts } from '../../misconceptions/rules/fractionUnequalParts';
import {
  equalSharesLookAlike,
  shareCountedWhole,
} from '../../misconceptions/rules/k02SharesMachines';
import { partSizes, SHARE_CUTS, sharePicture, UNEQUAL_CUTS } from './shares';

const tpl = (format: ItemFormat): ItemTemplate =>
  ({
    id: `T.frac.shares.${format}`,
    skillId: 'X.01',
    format,
    tier: 'pictorial',
    generator: 'frac.shares',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  }) as ItemTemplate;

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

const shapeKey = (cells: number[], cols: number) => {
  const r = gridPartRect(cells, cols);
  return r ? [Math.min(r.w, r.h), Math.max(r.w, r.h)].join('x') : 'none';
};

describe('frac.shares cuts', () => {
  it.each([false, true])('every cut draws as a valid picture (mirror %s)', (mirror) => {
    for (const cut of [...SHARE_CUTS, ...UNEQUAL_CUTS]) {
      const g = sharePicture(cut, mirror);
      expect(stimulusSpecSchema.safeParse(g).success).toBe(true);
      for (const p of g.parts) {
        expect(p.length).toBeGreaterThanOrEqual(2);
        expect(gridPartRect(p, g.cols)).not.toBeNull();
      }
    }
  });

  it('equal cuts: every part the same size, and not all the same rectangle (turned or not)', () => {
    for (const cut of SHARE_CUTS) {
      const g = sharePicture(cut, false);
      expect(new Set(partSizes(g)).size).toBe(1);
      expect(new Set(g.parts.map((p) => shapeKey(p, g.cols))).size).toBeGreaterThan(1);
    }
  });

  it('unequal cuts: the sizes differ by at least one whole square', () => {
    for (const cut of UNEQUAL_CUTS) {
      const sizes = partSizes(sharePicture(cut, false));
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('frac.shares items', () => {
  const build = (format: ItemFormat, params: Record<string, number | boolean>) =>
    generateItemFromParams(tpl(format), params, { seed: 7 });

  it('number-pad: the squares in each part; the solution replays; all squares is the misconception', () => {
    for (let cut = 0; cut < SHARE_CUTS.length; cut += 1) {
      for (const mirror of [false, true]) {
        const item = build('number-pad', { cut, mirror, equalParts: true });
        const g = sharePicture(SHARE_CUTS[cut] as (typeof SHARE_CUTS)[number], mirror);
        expect(item.answer).toEqual({ kind: 'number', value: g.parts[0]?.length });
        const t = tpl('number-pad');
        expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
        const r = replaySteps(item, itemSolution(item, t));
        expect(r && checkResponse(item, r).correct).toBe(true);
        expect(shareCountedWhole.predict?.(item)).toEqual({
          kind: 'number',
          value: g.cols * g.rows,
        });
        expect(fractionUnequalParts.applies?.(item)).toBe(false);
      }
    }
  });

  it('fraction-pick: equal parts are yes (not alike is the misconception); unequal are no', () => {
    for (let cut = 0; cut < 8; cut += 1) {
      const yes: GeneratedItem = build('fraction-pick', { cut, mirror: false, equalParts: true });
      expect(yes.answer).toEqual({ kind: 'choice', id: 'yes' });
      expect(equalSharesLookAlike.predict?.(yes)).toEqual({ kind: 'choice', id: 'no' });
      const no = build('fraction-pick', { cut, mirror: true, equalParts: false });
      expect(no.answer).toEqual({ kind: 'choice', id: 'no' });
      expect(equalSharesLookAlike.applies?.(no)).toBe(false);
      expect(fractionUnequalParts.predict?.(no)).toEqual({ kind: 'choice', id: 'yes' });
      for (const item of [yes, no]) {
        const r = replaySteps(item, itemSolution(item, tpl('fraction-pick')));
        expect(r && checkResponse(item, r).correct).toBe(true);
      }
    }
  });
});
