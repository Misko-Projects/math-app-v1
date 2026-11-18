// count.ordinal (03 §5.6, CNT.15): fixed params → answer, widget and solution per format, the
// position words on numeral-pick options, feature extremes and validity (03 §10.2 step 4).

import type { ItemFormat, ItemTemplate, ParamValues } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { GenerationError, registry } from '..';
import { ordinalIndex } from './ordinal';

function tpl(format: ItemFormat, over: Partial<ItemTemplate> = {}): ItemTemplate {
  return {
    id: `T.ordinal.${format}`,
    skillId: 'CNT.15',
    format,
    tier: 'pictorial',
    generator: 'count.ordinal',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
    ...over,
  };
}

const ORD = (text: string) => ({ text, clips: [] });

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

/** The item is valid, its example is correct and its solution replays to a correct response. */
function expectSound(t: ItemTemplate, params: ParamValues) {
  const item = generateItemFromParams(t, params);
  const parsed = formatModel(t.format)?.configSchema.safeParse(item.widget);
  expect(parsed?.success, JSON.stringify(parsed?.error?.issues)).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const replayed = replaySteps(item, itemSolution(item, t));
  expect(replayed && checkResponse(item, replayed).correct).toBe(true);
  return item;
}

describe('ordinalIndex', () => {
  it.each([
    [1, 5, 'left', 0],
    [3, 5, 'left', 2],
    [1, 5, 'right', 4],
    [3, 5, 'right', 2],
    [10, 10, 'right', 0],
  ] as const)('k=%i of %i from the %s → index %i', (k, n, from, want) => {
    expect(ordinalIndex(k, n, from)).toBe(want);
  });
});

describe('count.ordinal tap-count', () => {
  it('third from the left in a line of 7 is obj-2', () => {
    const t = tpl('tap-count', { tier: 'concrete' });
    const item = expectSound(t, { k: 3, n: 7, from: 'left' });
    expect(item.answer).toEqual({ kind: 'choice', id: 'obj-2' });
    expect(item.widget).toMatchObject({
      format: 'tap-count',
      mode: 'ordinal',
      ordinal: { k: 3, from: 'left' },
      set: { count: 7, layout: 'line' },
      marks: true,
      countAloud: true,
    });
    // Every other object is rejected.
    for (let i = 0; i < 7; i += 1) {
      if (i !== 2)
        expect(checkResponse(item, { kind: 'choice', id: `obj-${i}` }).correct).toBe(false);
    }
  });

  it('second from the right in a line of 7 is obj-5; the solution starts at the right end', () => {
    const t = tpl('tap-count');
    const item = expectSound(t, { k: 2, n: 7, from: 'right' });
    expect(item.answer).toEqual({ kind: 'choice', id: 'obj-5' });
    const steps = itemSolution(item, t);
    expect(steps.map((s) => s.say)).toEqual([
      'gen.count.ordinal.start-right',
      'gen.count.ordinal.this-one',
    ]);
    expect(steps[0]?.action).toEqual({ op: 'tap', args: { index: 6 } });
    expect(steps[1]?.action).toEqual({ op: 'ring', args: { index: 5 } });
    expect(item.widget).toMatchObject({ marks: false, countAloud: false });
  });

  it('tenth in a line of ten (more objects than a pick has options)', () => {
    const item = expectSound(tpl('tap-count'), { k: 10, n: 10, from: 'left' });
    expect(item.answer).toEqual({ kind: 'choice', id: 'obj-9' });
  });
});

describe('count.ordinal numeral-pick', () => {
  it('marks object k as its own colour group and offers three nearby positions', () => {
    const t = tpl('numeral-pick', { representation: 'words' });
    const item = expectSound(t, { k: 4, n: 8, from: 'left' });
    expect(item.answer).toEqual({ kind: 'choice', id: 'opt-4' });
    if (item.widget.format !== 'numeral-pick') throw new Error('expected numeral-pick');
    expect(item.widget.stimulus).toMatchObject({
      kind: 'objects',
      set: { count: 8, layout: 'line', groups: [3, 1, 4] },
    });
    const ids = item.widget.options.map((o) => o.id).sort();
    expect(ids).toEqual(['opt-3', 'opt-4', 'opt-5']);
    for (const o of item.widget.options) expect(o.speak).toBe(`ord.${o.id.slice(4)}`);
  });

  it('counting from the right, the marked group sits at index n − k', () => {
    const item = expectSound(tpl('numeral-pick'), { k: 1, n: 5, from: 'right' });
    if (item.widget.format !== 'numeral-pick') throw new Error('expected numeral-pick');
    expect(item.widget.stimulus).toMatchObject({ set: { groups: [4, 1, 0] } });
    expect(item.widget.options.map((o) => o.id).sort()).toEqual(['opt-1', 'opt-2', 'opt-3']);
  });

  it('labels options with the ord.<k> clip text, or "3rd" without narration', () => {
    const t = tpl('numeral-pick');
    const bare = generateItemFromParams(t, { k: 3, n: 6, from: 'left' });
    if (bare.widget.format !== 'numeral-pick') throw new Error('expected numeral-pick');
    expect(bare.widget.options.find((o) => o.id === 'opt-3')?.label).toBe('3rd');
    initContent({
      templates: [],
      narration: { 'ord.2': ORD('second'), 'ord.3': ORD('third'), 'ord.4': ORD('fourth') },
      misconceptions: [],
    });
    const named = generateItemFromParams(t, { k: 3, n: 6, from: 'left' });
    if (named.widget.format !== 'numeral-pick') throw new Error('expected numeral-pick');
    expect(named.widget.options.map((o) => o.label).sort()).toEqual(['fourth', 'second', 'third']);
  });
});

describe('count.ordinal features and validity', () => {
  it.each<[string, ItemFormat, ParamValues, Record<string, number>]>([
    [
      'first from the left is the easiest',
      'tap-count',
      { k: 1, n: 5, from: 'left' },
      { 'k.over5': 0, 'ordinal.fromRight': 0 },
    ],
    [
      'tenth from the right',
      'tap-count',
      { k: 10, n: 10, from: 'right' },
      { 'k.over5': 1, 'ordinal.fromRight': 1 },
    ],
    [
      'seventh on a pick',
      'numeral-pick',
      { k: 7, n: 9, from: 'left' },
      { 'k.over5': 0.4, 'ordinal.fromRight': 0 },
    ],
    [
      'from the right on a pick',
      'numeral-pick',
      { k: 2, n: 4, from: 'right' },
      { 'ordinal.fromRight': 1 },
    ],
  ])('%s', (_label, format, params, want) => {
    const t = tpl(format);
    const got = itemFeatures(generateItemFromParams(t, params), t);
    for (const [k, v] of Object.entries(want)) expect(got[k], k).toBeCloseTo(v, 9);
  });

  it.each<[string, ParamValues]>([
    ['k beyond the line', { k: 6, n: 5 }],
    ['k = 0', { k: 0, n: 5 }],
    ['k = 11 (no clip past tenth)', { k: 11, n: 12 }],
    ['a line shorter than 3', { k: 2, n: 2 }],
  ])('rejects %s', (_label, params) => {
    expect(() => generateItemFromParams(tpl('tap-count'), params)).toThrow(GenerationError);
  });

  it('declares its narration and both formats', () => {
    const g = registry.get('count.ordinal');
    expect(g?.formats).toEqual(['tap-count', 'numeral-pick']);
    expect(g?.narration).toEqual([
      'gen.count.ordinal.start-left',
      'gen.count.ordinal.start-right',
      'gen.count.ordinal.this-one',
    ]);
  });
});
