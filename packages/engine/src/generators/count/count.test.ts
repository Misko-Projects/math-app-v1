// K01 extensions of count.set and count.sequence (03 §5.6): one more on a ten-frame (CNT.14), the
// empty set (CNT.13), missing numbers between two given terms (CNT.18), decade crossings
// (CNT.09, CNT.10, CNT.16), counting back to zero, and number-pad pictures that never label a
// blank. Fixed params → answer, widget and solution; feature values at the extremes.

import type { ItemFormat, ItemTemplate, ParamValues } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { GenerationError } from '..';
import { hiddenTerms } from './sequence';

function tpl(
  generator: 'count.set' | 'count.sequence',
  format: ItemFormat,
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  return {
    id: `T.${generator}.${format}`,
    skillId: 'CNT.01',
    format,
    tier: 'pictorial',
    generator,
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

function expectSound(t: ItemTemplate, params: ParamValues) {
  const item = generateItemFromParams(t, params);
  const parsed = formatModel(t.format)?.configSchema.safeParse(item.widget);
  expect(parsed?.success, JSON.stringify(parsed?.error?.issues)).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const replayed = replaySteps(item, itemSolution(item, t));
  expect(replayed && checkResponse(item, replayed).correct).toBe(true);
  return item;
}

describe('count.set: one more on a ten-frame (add-more)', () => {
  const t = tpl('count.set', 'tenframe-fill', { tier: 'concrete' });

  it('5 and one more: 5 prefilled counters, goal one-more, the new total is asked', () => {
    const item = expectSound(t, { n: 6, start: 5, mode: 'add-more' });
    expect(item.widget).toMatchObject({
      frames: 1,
      prefilled: [{ frame: 0, color: 'a', count: 5 }],
      goal: 'one-more',
      n: 6,
      thenAsk: 'total',
    });
    expect(item.answer).toEqual({
      kind: 'state',
      checker: 'tenframe.total',
      target: { n: 6, value: 6 },
    });
    // The counters alone are not enough: the total must be said too.
    const cells = [[1, 1, 1, 1, 1, 2, 0, 0, 0, 0]];
    expect(checkResponse(item, { kind: 'state', value: { cells } }).correct).toBe(false);
    expect(checkResponse(item, { kind: 'state', value: { cells, value: 6 } }).correct).toBe(true);
    expect(itemSolution(item, t).map((s) => s.say)).toEqual([
      'gen.count.set.add-to',
      'gen.count.set.last-number',
    ]);
  });

  it('10 and one more spills onto a second frame', () => {
    const item = expectSound(t, { n: 11, start: 10, mode: 'add-more' });
    expect(item.widget).toMatchObject({
      frames: 2,
      prefilled: [{ frame: 0, color: 'a', count: 10 }],
      goal: 'one-more',
    });
  });

  it('13 and one more prefills both frames', () => {
    const item = expectSound(t, { n: 14, start: 13, mode: 'add-more' });
    expect(item.widget).toMatchObject({
      frames: 2,
      prefilled: [
        { frame: 0, color: 'a', count: 10 },
        { frame: 1, color: 'a', count: 3 },
      ],
    });
  });

  it('add-more by more than one shows n (goal show-n) and still asks the total', () => {
    const item = expectSound(t, { n: 7, start: 4, mode: 'add-more' });
    expect(item.widget).toMatchObject({ goal: 'show-n', thenAsk: 'total' });
  });

  it('make mode is unchanged: an empty frame, no total asked', () => {
    const item = expectSound(t, { n: 7, mode: 'make' });
    expect(item.widget).toMatchObject({ prefilled: [], goal: 'show-n', thenAsk: null });
    expect(item.answer).toEqual({ kind: 'state', checker: 'tenframe.total', target: { n: 7 } });
  });

  it('make-set add-more narrates the start (one more in the boat)', () => {
    const boat = tpl('count.set', 'make-set', { tier: 'concrete' });
    const item = expectSound(boat, { n: 6, start: 5, mode: 'add-more' });
    const steps = itemSolution(item, boat);
    expect(steps[0]).toMatchObject({
      say: 'gen.count.set.add-to',
      vars: { start: 5, n: 6 },
      action: { op: 'drag', args: { count: 1 } },
    });
  });
});

describe('count.set: the empty set (CNT.13)', () => {
  it.each<[ItemFormat, 'concrete' | 'pictorial' | 'abstract']>([
    ['tap-count', 'concrete'],
    ['numeral-pick', 'pictorial'],
    ['number-pad', 'abstract'],
  ])('%s with n = 0 answers 0 and narrates none', (format, tier) => {
    const t = tpl('count.set', format, { tier });
    const item = expectSound(t, { n: 0 });
    const keys = itemSolution(item, t).map((s) => s.say);
    expect(keys[0]).toBe('gen.count.set.none');
    if (format === 'tap-count') expect(keys).toEqual(['gen.count.set.none', 'gen.count.set.zero']);
  });
});

describe('count.sequence: hide', () => {
  it.each<[string, 'last' | 'all-after' | 'between', number[]]>([
    ['all-after', 'all-after', [6, 7, 8]],
    ['last', 'last', [8]],
    ['between', 'between', [6, 7]],
  ])('%s of 5, 6, 7, 8', (_label, hide, want) => {
    expect(hiddenTerms([5, 6, 7, 8], hide)).toEqual(want);
  });

  it('between on a number pad: 45, _, _, 48 asks 46 and 47', () => {
    const t = tpl('count.sequence', 'number-pad', { tier: 'abstract' });
    const item = expectSound(t, { start: 45, length: 3, hide: 'between' });
    expect(item.answer).toEqual({ kind: 'numbers', values: [46, 47], ordered: true });
    if (item.widget.format !== 'number-pad') throw new Error('expected number-pad');
    expect(item.widget.expression?.tokens).toEqual([
      { t: 'num', v: 45 },
      { t: 'blank', id: 't1' },
      { t: 'blank', id: 't2' },
      { t: 'num', v: 48 },
    ]);
    expect(item.widget.stimulus).toEqual({ kind: 'none' });
  });

  it('between on a hundred chart (by tens): 23, _, _, 53', () => {
    const t = tpl('count.sequence', 'hundred-chart');
    const item = expectSound(t, { start: 23, step: 10, length: 3, hide: 'between' });
    expect(item.widget).toMatchObject({ mode: 'fill', hidden: [33, 43] });
    expect(item.answer).toEqual({ kind: 'numbers', values: [33, 43], ordered: true });
  });

  it('between needs a term between start and last', () => {
    const t = tpl('count.sequence', 'number-pad');
    expect(() => generateItemFromParams(t, { start: 4, length: 1, hide: 'between' })).toThrow(
      GenerationError,
    );
  });

  it('a number pad on the number path labels only the given terms', () => {
    const t = tpl('count.sequence', 'number-pad', { representation: 'number-path' });
    const item = expectSound(t, { start: 110, length: 4, hide: 'between' });
    if (item.widget.format !== 'number-pad') throw new Error('expected number-pad');
    expect(item.widget.stimulus).toEqual({
      kind: 'number-line',
      min: 109,
      max: 115,
      ticksEvery: 1,
      labelsEvery: null,
      marks: [
        { at: 110, label: '110' },
        { at: 111, label: '?' },
        { at: 112, label: '?' },
        { at: 113, label: '?' },
        { at: 114, label: '114' },
      ],
    });
    // The representation rung keeps the blanks hidden too.
    const overlay = item.hints.find((h) => h.level === 3)?.overlay;
    expect(overlay).toMatchObject({ labelsEvery: null });
  });

  it('a numeral pick on the number line shows the line', () => {
    const t = tpl('count.sequence', 'numeral-pick', { representation: 'number-line' });
    const item = expectSound(t, { start: 39 });
    if (item.widget.format !== 'numeral-pick') throw new Error('expected numeral-pick');
    expect(item.widget.stimulus).toMatchObject({ kind: 'number-line', marks: [{ at: 39 }] });
  });
});

describe('count.sequence: cross', () => {
  const t = tpl('count.sequence', 'number-pad');
  it.each<[string, ParamValues]>([
    ['39 → 40', { start: 39 }],
    ['38 → 40', { start: 38, length: 2 }],
    ['40 back to 39', { start: 40, dir: -1 }],
  ])('decade accepts a crossing: %s', (_label, params) => {
    expect(() => generateItemFromParams(t, { ...params, cross: 'decade' })).not.toThrow();
  });

  it.each<[string, ParamValues]>([
    ['40 → 41', { start: 40 }],
    ['41 back to 40', { start: 41, dir: -1 }],
    ['5 → 7', { start: 5, length: 2 }],
  ])('decade rejects a sequence inside one ten: %s', (_label, params) => {
    expect(() => generateItemFromParams(t, { ...params, cross: 'decade' })).toThrow(
      GenerationError,
    );
  });
});

describe('count.sequence: counting back', () => {
  it('narrates counting back and reaches zero (zero feature)', () => {
    const t = tpl('count.sequence', 'numeral-pick', { tier: 'abstract' });
    const item = expectSound(t, { start: 1, dir: -1 });
    expect(item.answer).toEqual({ kind: 'choice', id: 'opt-0' });
    expect(itemSolution(item, t)[0]?.say).toBe('gen.count.sequence.say-back');
    expect(itemFeatures(item, t)).toMatchObject({ zero: 1, backward: 1 });
  });

  it('zero is 0 when the sequence stays above 0, and on forward sequences from 0', () => {
    const t = tpl('count.sequence', 'numeral-pick', { tier: 'abstract' });
    expect(itemFeatures(generateItemFromParams(t, { start: 3, dir: -1 }), t).zero).toBe(0);
    expect(itemFeatures(generateItemFromParams(t, { start: 0 }), t).zero).toBe(0);
  });
});
