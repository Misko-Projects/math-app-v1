// 03 §5.6 addsub.three: the ten pair is found in every order, fixed params → answer, widget and
// solution per format (each replays through its model), features at the extremes.

import type { GeneratedItem, ItemFormat, ItemTemplate, ParamValues } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { addsubThree, threeParts } from './three';

let nextId = 0;
function tpl(format: ItemFormat, over: Partial<ItemTemplate> = {}): ItemTemplate {
  nextId += 1;
  return {
    id: `T.three.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier: 'pictorial',
    generator: 'addsub.three',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
    ...over,
  };
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, params);

function replays(t: ItemTemplate, item: GeneratedItem): void {
  expect(formatModel(item.widget.format)?.configSchema.safeParse(item.widget).success).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const steps = itemSolution(item, t);
  const r = replaySteps(item, steps);
  expect(r).not.toBeNull();
  expect(checkResponse(item, r as never).correct).toBe(true);
}

describe('threeParts', () => {
  it.each<[ParamValues, [number, number], number, boolean]>([
    [{ a: 7, b: 3, c: 5 }, [7, 3], 5, true],
    [{ a: 6, b: 5, c: 4 }, [6, 4], 5, true],
    [{ a: 2, b: 8, c: 2 }, [2, 8], 2, true],
    [{ a: 5, b: 6, c: 4 }, [6, 4], 5, true],
    [{ a: 3, b: 4, c: 5 }, [3, 4], 5, false],
  ])('%o', (p, first, other, tenPair) => {
    const f = threeParts(p);
    expect(f.first).toEqual(first);
    expect(f.other).toBe(other);
    expect(f.tenPair).toBe(tenPair);
    expect(addsubThree.derive(p)).toEqual({ result: f.result, hasTenPair: tenPair ? 1 : 0 });
  });
});

describe('formats', () => {
  it('number-pad: a + b + c = _ (abstract and with a bond of the ten pair)', () => {
    const abstract = tpl('number-pad', { tier: 'abstract' });
    const item = make(abstract, { a: 6, b: 5, c: 4 });
    expect(item.answer).toEqual({ kind: 'number', value: 15 });
    expect(item.widget).toMatchObject({ stimulus: { kind: 'none' } });
    replays(abstract, item);
    const bond = tpl('number-pad', { representation: 'number-bond' });
    const pic = make(bond, { a: 6, b: 5, c: 4 });
    expect(pic.widget.format === 'number-pad' && pic.widget.stimulus).toEqual({
      kind: 'number-bond',
      whole: '?',
      parts: [10, 5],
    });
    replays(bond, pic);
  });

  it('number-bond: the whole is missing, the parts are the ten and the rest', () => {
    const t = tpl('number-bond');
    const item = make(t, { a: 7, b: 3, c: 5 });
    expect(item.widget).toMatchObject({ whole: null, parts: [10, 5], mode: 'missing-whole' });
    replays(t, item);
  });

  it.each<[ParamValues, number[]]>([
    // a's partner fills frame 0, then the third number flows into frame 1
    [{ a: 7, b: 3, c: 5 }, [3, 5]],
    [{ a: 6, b: 5, c: 4 }, [4, 5]],
    // b and c make ten: they fill frame 1 together
    [{ a: 5, b: 6, c: 4 }, [6, 4]],
    // no pair: in order
    [{ a: 3, b: 4, c: 5 }, [4, 5]],
  ])('tenframe-fill %o places %o, then counts', (p, placed) => {
    const t = tpl('tenframe-fill', { tier: 'concrete', representation: 'ten-frame' });
    const item = make(t, p);
    const f = threeParts(p);
    expect(item.answer).toEqual({
      kind: 'state',
      checker: 'tenframe.total',
      target: { n: f.result, value: f.result },
    });
    const steps = itemSolution(item, t);
    expect(steps.filter((s) => s.action?.op === 'place').map((s) => s.action?.args?.count)).toEqual(
      placed,
    );
    expect(steps[steps.length - 1]?.action?.op).toBe('count-total');
    replays(t, item);
  });
});

describe('features', () => {
  it('a ten pair lowers, a sum past ten raises', () => {
    const t = tpl('number-pad', { tier: 'abstract' });
    expect(itemFeatures(make(t, { a: 1, b: 2, c: 3 }), t)).toMatchObject({
      'sum.over10': 0,
      hasTenPair: 0,
      bridge10: 0,
      size: 0,
    });
    expect(itemFeatures(make(t, { a: 7, b: 3, c: 5 }), t)).toMatchObject({
      'sum.over10': 1,
      hasTenPair: 1,
      bridge10: 0,
      size: 1,
    });
    expect(itemFeatures(make(t, { a: 4, b: 4, c: 5 }), t)).toMatchObject({ bridge10: 1 });
  });

  it('rejects a sum over 20', () => {
    expect(addsubThree.accepts?.({ a: 9, b: 9, c: 9, maxSum: 20 }, tpl('number-pad'))).toBe(false);
  });
});
