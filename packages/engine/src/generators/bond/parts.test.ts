// bond.parts branches added for K01 (03 §5.6): new ways with `found` ways shown (CPS.08), the
// split to finish a ten with `addend` (CPS.11), and the whole.upTo5 / missing.over4 features.

import type { ItemFormat, ItemTemplate, ParamValues, Representation } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { GenerationError } from '../types';
import { bondParts, freshSplit, knownWays } from './parts';

let nextId = 0;
function tpl(
  format: ItemFormat,
  tier: ItemTemplate['tier'] = 'pictorial',
  representation?: Representation,
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.bond.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier,
    ...(representation ? { representation } : {}),
    generator: 'bond.parts',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  };
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

/** Builds from fixed params and checks the schema, exampleCorrect and the solution replay. */
function build(t: ItemTemplate, params: ParamValues) {
  const item = generateItemFromParams(t, params);
  const parsed = formatModel(t.format)?.configSchema.safeParse(item.widget);
  expect(parsed?.success, JSON.stringify(parsed?.error?.issues)).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const steps = itemSolution(item, t);
  const replayed = replaySteps(item, steps);
  expect(replayed).not.toBeNull();
  expect(checkResponse(item, replayed as NonNullable<typeof replayed>).correct).toBe(true);
  return { item, steps, features: itemFeatures(item, t) };
}

describe('new ways (CPS.08)', () => {
  it('lists the found ways in a fixed order: ten and the rest first', () => {
    expect(knownWays(13, 3)).toEqual([
      [10, 3],
      [12, 1],
      [7, 6],
    ]);
    expect(knownWays(8, 2)).toEqual([
      [7, 1],
      [4, 4],
    ]);
  });

  it('demos the most even split not found yet that fits the widget', () => {
    expect(freshSplit(13, [])).toEqual([6, 7]);
    expect(freshSplit(12, [[6, 6]])).toEqual([5, 7]);
    expect(freshSplit(20, [[10, 10]], 10)).toBeNull();
  });

  it.each<[string, ItemTemplate]>([
    ['number-bond', tpl('number-bond')],
    ['tenframe-fill', tpl('tenframe-fill', 'concrete', 'double-ten-frame')],
    ['rekenrek', tpl('rekenrek', 'concrete')],
  ])('%s asks for a way not in found', (_name, t) => {
    const { item, steps } = build(t, { whole: 13, unknown: 'new-way', found: 1 });
    expect(item.answer).toEqual({
      kind: 'state',
      checker: 'bond.newWay',
      target: { whole: 13, found: [[10, 3]] },
    });
    // The already-found way is not accepted again.
    const again =
      t.format === 'tenframe-fill'
        ? {
            cells: [10, 3].map((p) => Array.from({ length: 10 }, (_, i) => (i < p ? 1 : 0))),
          }
        : t.format === 'rekenrek'
          ? { rows: [3, 10] }
          : { parts: [3, 10] };
    expect(checkResponse(item, { kind: 'state', value: again }).correct).toBe(false);
    expect(steps.length).toBe(2);
  });

  it('the number bond shows the found ways (mode.newWay grows with them)', () => {
    const t = tpl('number-bond');
    const one = build(t, { whole: 14, unknown: 'new-way', found: 1 });
    const two = build(t, { whole: 14, unknown: 'new-way', found: 2 });
    expect(two.item.widget).toMatchObject({
      mode: 'new-way',
      found: [
        [10, 4],
        [13, 1],
      ],
    });
    expect(
      (two.features['mode.newWay'] as number) - (one.features['mode.newWay'] as number),
    ).toBeCloseTo(0.2, 9);
  });

  it('rejects found outside new-way, and a whole with no way left on the frames', () => {
    expect(() =>
      generateItemFromParams(tpl('number-bond'), { whole: 7, part: 3, unknown: 'part', found: 1 }),
    ).toThrow(GenerationError);
    expect(() =>
      generateItemFromParams(tpl('rekenrek', 'concrete'), {
        whole: 20,
        unknown: 'new-way',
        found: 1,
      }),
    ).toThrow(GenerationError);
  });
});

describe('split to finish a ten (CPS.11)', () => {
  const params = { addend: 8, whole: 5, part: 2, unknown: 'part' };

  it('tenframe-fill: the addend in frame 0, the whole in frame 1; move the give, say the keep', () => {
    const { item, steps } = build(tpl('tenframe-fill', 'concrete'), params);
    expect(item.widget).toMatchObject({
      frames: 2,
      goal: 'make-ten',
      thenAsk: 'missing',
      prefilled: [
        { frame: 0, color: 'a', count: 8 },
        { frame: 1, color: 'b', count: 5 },
      ],
    });
    expect(item.answer).toEqual({
      kind: 'state',
      checker: 'tenframe.makeTen',
      target: { total: 13, value: 3 },
    });
    expect(steps[0]?.action).toEqual({
      op: 'move-counters',
      args: { fromFrame: 1, toFrame: 0, count: 2 },
    });
  });

  it('rekenrek: the addend on top, the whole below; fill the top row', () => {
    const { item } = build(tpl('rekenrek', 'concrete'), params);
    expect(item.widget).toMatchObject({
      rows: 2,
      preset: [8, 5],
      mode: 'make-ten',
      rowRule: 'fill-top-first',
      target: 13,
    });
    expect(checkResponse(item, { kind: 'state', value: { rows: [8, 5] } }).correct).toBe(false);
    expect(checkResponse(item, { kind: 'state', value: { rows: [10, 3] } }).correct).toBe(true);
  });

  it('number-bond: the whole split into the give and the missing keep', () => {
    const { item } = build(tpl('number-bond'), params);
    expect(item.widget).toMatchObject({ whole: 5, parts: [2, null], mode: 'missing-part' });
    expect(item.answer).toEqual({ kind: 'number', value: 3 });
  });

  it.each<[string, ParamValues, ItemFormat]>([
    [
      'the part must finish the ten',
      { addend: 8, whole: 5, part: 3, unknown: 'part' },
      'number-bond',
    ],
    ['something must be kept', { addend: 8, whole: 2, part: 2, unknown: 'part' }, 'number-bond'],
    ['only a part unknown', { addend: 8, whole: 5, part: 2, unknown: 'whole' }, 'number-bond'],
    ['a format that cannot show it', { addend: 8, whole: 5, part: 2, unknown: 'part' }, 'make-set'],
  ])('rejects: %s', (_name, p, format) => {
    expect(() => generateItemFromParams(tpl(format, 'concrete'), p)).toThrow(GenerationError);
  });
});

describe('K01 features', () => {
  it('whole.upTo5 sizes a small whole: 0 at 2, 3 at 5 and above', () => {
    const t = tpl('number-bond');
    const f = (whole: number) => build(t, { whole, unknown: 'split' }).features['whole.upTo5'];
    expect([2, 3, 4, 5, 9].map(f)).toEqual([0, 1, 2, 3, 3]);
  });

  it('missing.over4 grows with the missing part, part unknowns only', () => {
    const t = tpl('number-bond');
    expect(build(t, { whole: 10, part: 6, unknown: 'part' }).features['missing.over4']).toBe(0);
    expect(build(t, { whole: 10, part: 1, unknown: 'part' }).features['missing.over4']).toBeCloseTo(
      1,
      9,
    );
    expect(build(t, { whole: 10, part: 1, unknown: 'whole' }).features['missing.over4']).toBe(0);
  });

  it('the rekenrek gets whole.over5 (its n.over10 only marks the second row)', () => {
    const f = build(tpl('rekenrek', 'concrete'), { whole: 10, unknown: 'split' }).features;
    expect(f['whole.over5']).toBe(1);
    expect(
      build(tpl('tenframe-fill', 'concrete'), { whole: 10, unknown: 'split' }).features,
    ).not.toHaveProperty(['whole.over5']);
  });

  it('declares every feature it emits', () => {
    const declared = new Set(Object.keys(bondParts.features));
    const f = build(tpl('number-pad', 'abstract'), { whole: 9, part: 2, unknown: 'part' }).features;
    for (const k of [
      'zeroPart',
      'whole.over20',
      'tensBond',
      'whole.upTo5',
      'missing.over4',
      'whole.over5',
    ]) {
      expect(declared.has(k), k).toBe(true);
      expect(f, k).toHaveProperty([k]);
    }
  });
});
