// 03 §5.6 data.sort and data.chart (K01 data): fixed params → answer, widget and solution per
// format, exampleCorrect is correct, solutions replay through the models that exist (order,
// number-pad), feature values at the extremes, validity (accepts), and the chart.values checker.

import type { GeneratedItem, ItemFormat, ItemTemplate, ParamValues } from '@number-island/shared';
import { widgetConfigSchema } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { chartValues } from '../../check/state/chart.values';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItem, generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { GenerationError } from '../types';
import { SORT_KINDS } from './sort';

let nextId = 0;
function tpl(
  generator: 'data.sort' | 'data.chart',
  format: ItemFormat,
  params: ItemTemplate['params'] = {},
  tier: ItemTemplate['tier'] = 'pictorial',
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.${generator}.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier,
    generator,
    params,
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  };
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, params, { seed: 7 });

function expectSound(item: GeneratedItem, t: ItemTemplate) {
  expect(widgetConfigSchema.safeParse(item.widget).success).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const steps = itemSolution(item, t);
  expect(steps.length).toBeGreaterThan(1);
  if (formatModel(item.format)) {
    const r = replaySteps(item, steps);
    expect(r && checkResponse(item, r).correct).toBe(true);
  }
}

describe('data.sort', () => {
  it('shape-sort objects: one bin per kind, every card sorted by kind', () => {
    const t = tpl(
      'data.sort',
      'shape-sort',
      { cardSet: { kind: 'const', value: 'objects' } },
      'concrete',
    );
    const item = make(t, { cardSet: 'objects', attribute: 'kind', bins: 3, a: 2, b: 3, c: 1 });
    const w = item.widget as Extract<GeneratedItem['widget'], { format: 'shape-sort' }>;
    expect(w.mode).toBe('sort');
    expect(w.cards).toHaveLength(6);
    expect(w.bins?.map((b) => b.label.startsWith('noun.') && b.label.endsWith('.many'))).toEqual([
      true,
      true,
      true,
    ]);
    expect(item.answer).toMatchObject({ kind: 'state', checker: 'sort.byRule' });
    expectSound(item, t);
    // A card in the wrong bin is rejected.
    const ex = itemExampleCorrect(item, t);
    if (ex.kind !== 'state') throw new Error('state expected');
    const bins = ex.value.bins as Record<string, string[]>;
    const moved = {
      b0: [...(bins.b0 ?? []), ...(bins.b1 ?? []).slice(0, 1)],
      b1: (bins.b1 ?? []).slice(1),
      b2: bins.b2 ?? [],
    };
    expect(checkResponse(item, { kind: 'state', value: { bins: moved } }).correct).toBe(false);
    expect(itemFeatures(item, t)).toMatchObject({
      cards: 2,
      'bins.over2': 1,
      'attribute.subtle': 0,
    });
  });

  it.each(['color', 'shape', 'size'])('shape-sort shapes by %s', (attribute) => {
    const t = tpl('data.sort', 'shape-sort');
    const item = make(t, { cardSet: 'shapes', attribute, bins: 2, a: 2, b: 2 });
    const w = item.widget as Extract<GeneratedItem['widget'], { format: 'shape-sort' }>;
    expect(w.cards.every((c) => 'shape' in c.card)).toBe(true);
    expectSound(item, t);
    expect(itemFeatures(item, t)['attribute.subtle']).toBe(attribute === 'size' ? 1 : 0);
  });

  it('rejects shapes sorted by kind, objects by colour, and three size bins', () => {
    const t = tpl('data.sort', 'shape-sort');
    expect(() => make(t, { cardSet: 'shapes', attribute: 'kind', bins: 2, a: 1, b: 1 })).toThrow(
      GenerationError,
    );
    expect(() => make(t, { cardSet: 'objects', attribute: 'color', bins: 2, a: 1, b: 1 })).toThrow(
      GenerationError,
    );
    expect(() =>
      make(t, { cardSet: 'shapes', attribute: 'size', bins: 3, a: 1, b: 1, c: 1 }),
    ).toThrow(GenerationError);
  });

  it('number-pad: counts one kind among the others', () => {
    const t = tpl('data.sort', 'number-pad');
    const item = make(t, { attribute: 'kind', bins: 2, a: 7, b: 5 });
    expect(item.answer).toEqual({ kind: 'number', value: 7 });
    const w = item.widget as Extract<GeneratedItem['widget'], { format: 'number-pad' }>;
    expect(w.stimulus).toMatchObject({
      kind: 'objects',
      set: { count: 7, distractors: { count: 5 } },
    });
    expectSound(item, t);
    expect(itemFeatures(item, t)).toMatchObject({ 'count.over5': 0.4, mix: 1 });
  });

  it('bar-graph-read: how many in group a, and the group with the most or fewest', () => {
    const t = tpl('data.sort', 'bar-graph-read');
    const many = make(t, { attribute: 'kind', bins: 3, a: 6, b: 2, c: 4, ask: 'how-many' });
    expect(many.answer).toEqual({ kind: 'number', value: 6 });
    expectSound(many, t);
    const most = make(t, { attribute: 'kind', bins: 3, a: 2, b: 5, c: 4, ask: 'most' });
    const w = most.widget as Extract<GeneratedItem['widget'], { format: 'bar-graph-read' }>;
    const top = w.chart.categories.find((c) => c.value === 5);
    expect(most.answer).toEqual({ kind: 'choice', id: top?.id });
    expect(itemFeatures(most, t).closeness).toBe(1);
    expectSound(most, t);
    const least = make(t, { attribute: 'kind', bins: 2, a: 1, b: 5, ask: 'least' });
    const lw = least.widget as Extract<GeneratedItem['widget'], { format: 'bar-graph-read' }>;
    expect(least.answer).toEqual({
      kind: 'choice',
      id: lw.chart.categories.find((c) => c.value === 1)?.id,
    });
    expect(itemFeatures(least, t).closeness).toBe(0);
    // A tie for the most is never asked.
    expect(() => make(t, { attribute: 'kind', bins: 3, a: 5, b: 5, c: 1, ask: 'most' })).toThrow(
      GenerationError,
    );
  });

  it('order: groups as pictures, fewest first, sizes all different', () => {
    const t = tpl('data.sort', 'order');
    const item = make(t, { attribute: 'kind', bins: 3, a: 6, b: 2, c: 3 });
    expect(item.answer).toEqual({ kind: 'numbers', values: [2, 3, 6], ordered: true });
    const w = item.widget as Extract<GeneratedItem['widget'], { format: 'order' }>;
    expect(w.items.every((i) => i.label === undefined && i.stimulus?.kind === 'objects')).toBe(
      true,
    );
    expectSound(item, t);
    expect(itemFeatures(item, t)).toMatchObject({ closeness: 1, 'count.over5': 0.2 });
    // The first step places nothing (the worked-step hint plays it).
    expect(itemSolution(item, t)[0]?.action).toBeUndefined();
    expect(() => make(t, { attribute: 'kind', bins: 3, a: 2, b: 2, c: 3 })).toThrow(
      GenerationError,
    );
  });

  it('builds every format from defaults over many seeds', () => {
    for (const format of ['shape-sort', 'number-pad', 'bar-graph-read', 'order'] as const) {
      const t = tpl('data.sort', format);
      for (let seed = 1; seed <= 40; seed += 1) {
        const item = generateItem(t, seed);
        expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
        const kinds: readonly string[] = SORT_KINDS;
        if (item.widget.format === 'bar-graph-read')
          expect(item.widget.chart.categories.every((c) => kinds.includes(c.id))).toBe(true);
      }
    }
  });
});

describe('data.chart', () => {
  it('bar-graph-read: how-many, total, difference', () => {
    const t = tpl('data.chart', 'bar-graph-read');
    const base = { kind: 'picture', categories: 3, a: 7, b: 3, c: 4 };
    expect(make(t, { ...base, question: 'how-many' }).answer).toEqual({ kind: 'number', value: 7 });
    const total = make(t, { ...base, question: 'total' });
    expect(total.answer).toEqual({ kind: 'number', value: 14 });
    expect(itemFeatures(total, t)).toMatchObject({ 'q.total': 1, 'categories.over2': 1 });
    const diff = make(t, { ...base, kind: 'bar', question: 'difference' });
    expect(diff.answer).toEqual({ kind: 'number', value: 4 });
    expect(itemFeatures(diff, t)).toMatchObject({ 'q.difference': 1, 'count.over5': 0 });
    for (const item of [total, diff]) expectSound(item, t);
    // How many more needs a bigger first category; totals stay within 20.
    expect(() => make(t, { ...base, question: 'difference', a: 3, b: 7 })).toThrow(GenerationError);
    expect(() => make(t, { ...base, question: 'total', a: 10, b: 10, c: 1 })).toThrow(
      GenerationError,
    );
  });

  it('bar-graph-read: most and least on a table, never a tie', () => {
    const t = tpl('data.chart', 'bar-graph-read');
    const item = make(t, { kind: 'table', categories: 3, a: 4, b: 9, c: 8, question: 'most' });
    const w = item.widget as Extract<GeneratedItem['widget'], { format: 'bar-graph-read' }>;
    expect(w.chart.kind).toBe('table');
    expect(item.answer).toEqual({
      kind: 'choice',
      id: w.chart.categories.find((c) => c.value === 9)?.id,
    });
    expect(itemFeatures(item, t).closeness).toBe(1);
    expectSound(item, t);
    expect(() =>
      make(t, { kind: 'table', categories: 3, a: 2, b: 2, c: 8, question: 'least' }),
    ).toThrow(GenerationError);
  });

  it('number-pad: the chart is the stimulus', () => {
    const t = tpl('data.chart', 'number-pad');
    const item = make(t, { kind: 'picture', categories: 2, a: 8, b: 5, question: 'total' });
    expect(item.answer).toEqual({ kind: 'number', value: 13 });
    expect((item.widget as { stimulus: { kind: string } }).stimulus.kind).toBe('chart');
    expectSound(item, t);
    expect(() => make(t, { kind: 'picture', categories: 2, a: 8, b: 5, question: 'most' })).toThrow(
      GenerationError,
    );
  });

  it('compare: two one-bar charts; more, fewer and the same', () => {
    const t = tpl('data.chart', 'compare');
    for (const [a, b, q] of [
      [7, 3, 'more'],
      [7, 3, 'fewer'],
      [4, 4, 'more'],
    ] as const) {
      const item = make(t, { kind: 'bar', categories: 2, a, b, question: q });
      const w = item.widget as Extract<GeneratedItem['widget'], { format: 'compare' }>;
      const value = (s: typeof w.left) =>
        s.kind === 'chart' ? (s.chart.categories[0]?.value ?? 0) : 0;
      const [l, r] = [value(w.left), value(w.right)];
      const want = l === r ? 'same' : l > r === (q === 'more') ? 'left' : 'right';
      expect(item.answer).toEqual({ kind: 'choice', id: want });
      expect(itemFeatures(item, t).closeness).toBe(a === b ? 1 : 0);
      expectSound(item, t);
    }
  });

  it('bar-graph-build: an empty chart, the counts in the data, chart.values', () => {
    const t = tpl('data.chart', 'bar-graph-build', {}, 'concrete');
    const item = make(t, {
      kind: 'tally',
      data: 'objects',
      mode: 'tally',
      categories: 3,
      a: 6,
      b: 2,
      c: 4,
    });
    const w = item.widget as Extract<GeneratedItem['widget'], { format: 'bar-graph-build' }>;
    expect(w.chart.categories.every((c) => c.value === 0)).toBe(true);
    expect([...w.data.values].sort()).toEqual([2, 4, 6]);
    expect(item.answer).toEqual({
      kind: 'state',
      checker: 'chart.values',
      target: { values: w.data.values },
    });
    expect(itemFeatures(item, t)).toMatchObject({ 'data.raw': 1, marks: 0.9 });
    expectSound(item, t);
    const bars = make(t, { kind: 'bar', data: 'table', mode: 'bars', categories: 2, a: 1, b: 1 });
    expect(itemFeatures(bars, t)).toMatchObject({ 'data.raw': 0, marks: 0 });
    expect(itemSolution(bars, t)[0]?.action?.op).toBe('raise-bar');
  });
});

describe('chart.values', () => {
  const target = { values: [3, 0, 5] };
  it.each([
    ['the right counts', { values: [3, 0, 5] }, true],
    [
      'the same counts, built another way (the response only counts marks)',
      { values: [3, 0, 5], marks: 'bars' },
      true,
    ],
    ['one count one more', { values: [4, 0, 5] }, false],
    ['the counts in another order', { values: [5, 0, 3] }, false],
    ['a category missing', { values: [3, 0] }, false],
    ['not numbers', { values: ['3', 0, 5] }, false],
    ['no values', {}, false],
  ])('%s', (_, value, ok) => {
    expect(chartValues.check(target, value as Record<string, unknown>)).toBe(ok);
  });
});
