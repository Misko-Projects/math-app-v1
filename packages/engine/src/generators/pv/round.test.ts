// pv.round (03 §5.6, K02 #17): rounding to the nearest ten or hundred, and its misconception rules
// MC.round-down-always and MC.round-wrong-place (03 §7.2).

import type { ItemFormat, ItemTemplate, ParamValues, Representation } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { roundDownAlways, roundWrongPlace } from '../../misconceptions/rules/rounding';
import { GenerationError } from '../types';
import { roundOptions } from './round';
import { roundTo } from './round-model';

function tpl(format: ItemFormat, representation: Representation = 'symbols'): ItemTemplate {
  return {
    id: `T.round.${format}.${representation}`,
    skillId: 'PV.08',
    format,
    tier: representation === 'symbols' ? 'abstract' : 'pictorial',
    representation,
    generator: 'pv.round',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  };
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

function sound(t: ItemTemplate, params: ParamValues) {
  const item = generateItemFromParams(t, params);
  const parsed = formatModel(t.format)?.configSchema.safeParse(item.widget);
  expect(parsed?.success, JSON.stringify(parsed?.error?.issues)).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const replayed = replaySteps(item, itemSolution(item, t));
  expect(replayed && checkResponse(item, replayed).correct).toBe(true);
  return item;
}

describe('pv.round', () => {
  it.each([
    [47, 10, 50],
    [43, 10, 40],
    [45, 10, 50],
    [347, 100, 300],
    [350, 100, 400],
    [951, 100, 1000],
  ])('rounds %i to the nearest %i as %i (halfway up)', (n, place, v) => {
    expect(roundTo(n, place)).toBe(v);
    expect(sound(tpl('number-pad'), { n, place }).answer).toEqual({ kind: 'number', value: v });
  });

  it('a multiple of the place is never drawn', () => {
    expect(() => generateItemFromParams(tpl('number-pad'), { n: 40, place: 10 })).toThrow(
      GenerationError,
    );
  });

  it.each<[number, number, number[]]>([
    [47, 10, [50, 40, 30]],
    [43, 10, [40, 50, 60]],
    [7, 10, [10, 0, 20]],
    [347, 100, [300, 400, 350]],
    [302, 100, [300, 400, 500]],
    [960, 100, [1000, 900, 960]],
  ])('the pick for %i to the nearest %i offers %j', (n, place, values) => {
    expect(roundOptions({ n, place })).toEqual(values);
    const item = sound(tpl('numeral-pick'), { n, place });
    if (item.widget.format !== 'numeral-pick') throw new Error('format');
    expect(item.widget.options.map((o) => o.label).sort()).toEqual(values.map(String).sort());
  });

  it('the number-line pad draws the stretch from one benchmark to the other with n marked', () => {
    const item = sound(tpl('number-pad', 'number-line'), { n: 347, place: 100 });
    if (item.widget.format !== 'number-pad') throw new Error('format');
    expect(item.widget.stimulus).toMatchObject({
      kind: 'number-line',
      min: 300,
      max: 400,
      ticksEvery: 10,
      labelsEvery: 100,
      marks: [{ at: 347, label: '347', arrow: true }],
    });
  });

  it('features follow the params', () => {
    const t = tpl('number-pad');
    const f = (n: number, place: number) =>
      itemFeatures(generateItemFromParams(t, { n, place }), t);
    expect(f(45, 10)).toMatchObject({ halfway: 1, crossesUp: 1, 'place.hundred': 0 });
    expect(f(341, 100)).toMatchObject({ halfway: 0, crossesUp: 0, 'place.hundred': 1 });
  });
});

describe('rounding misconception rules', () => {
  const item = (n: number, place: number) =>
    generateItemFromParams(tpl('number-pad'), { n, place });

  it('round-down-always: n rounds up and r is n cut down', () => {
    expect(roundDownAlways.predict?.(item(47, 10))).toEqual({ kind: 'number', value: 40 });
    expect(roundDownAlways.match(item(47, 10), { kind: 'number', value: 40 })).toBe(true);
    expect(roundDownAlways.match(item(350, 100), { kind: 'number', value: 300 })).toBe(true);
    // 43 rounds down anyway: nothing to tell apart.
    expect(roundDownAlways.predict?.(item(43, 10))).toBeNull();
    expect(roundDownAlways.match(item(43, 10), { kind: 'number', value: 40 })).toBe(false);
  });

  it('round-wrong-place: r is n rounded to the ten when asked for the hundred', () => {
    expect(roundWrongPlace.predict?.(item(347, 100))).toEqual({ kind: 'number', value: 350 });
    expect(roundWrongPlace.match(item(347, 100), { kind: 'number', value: 350 })).toBe(true);
    expect(roundWrongPlace.match(item(347, 100), { kind: 'number', value: 400 })).toBe(false);
    // 302 to the ten is 300, the answer; rounding to a ten has no smaller place.
    expect(roundWrongPlace.predict?.(item(302, 100))).toBeNull();
    expect(roundWrongPlace.predict?.(item(47, 10))).toBeNull();
  });
});
