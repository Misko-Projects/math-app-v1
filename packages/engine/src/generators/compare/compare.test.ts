// 03 §5.6 compare.sets and compare.numbers: fixed params → answer, widget and solution per format,
// exampleCorrect is correct, solutions replay through the format models that exist (make-set,
// order, numeral-pick) and end with the answer, feature values at the extremes and as a function of
// the params only, validity (accepts), and the MC.perceptual-size rule.

import {
  type GeneratedItem,
  type ItemFormat,
  type ItemTemplate,
  type ParamValues,
  widgetConfigSchema,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItem, generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { perceptualSize } from '../../misconceptions/rules/perceptualSize';
import { createRng } from '../../rng';
import { registry } from '..';
import { GenerationError } from '../types';
import { comparedValues } from './numbers';
import { bigLookingSide, closeness, relation, sideAnswer } from './shared';

let nextId = 0;
function tpl(
  generator: 'compare.sets' | 'compare.numbers',
  format: ItemFormat,
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.${generator}.${format}.${nextId}`,
    skillId: 'X.01',
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

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, params);

/** The item is valid, its example is correct, and its solution ends with the answer. */
function checkItem(t: ItemTemplate, item: GeneratedItem): void {
  expect(widgetConfigSchema.safeParse(item.widget).success).toBe(true);
  const model = formatModel(item.widget.format);
  if (model) expect(model.configSchema.safeParse(item.widget).success).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
  const steps = itemSolution(item, t);
  expect(steps.length).toBeGreaterThanOrEqual(2);
  if (model) {
    const r = replaySteps(item, steps);
    expect(r).not.toBeNull();
    expect(checkResponse(item, r as never).correct).toBe(true);
  } else {
    const last = steps[steps.length - 1]?.action;
    expect(['answer', 'place-symbol', 'drop']).toContain(last?.op);
  }
  // Steps before the last (the worked-step hint replays them) never enter or point at the answer.
  for (const s of steps.slice(0, -1)) expect(s.action?.op).not.toBe('answer');
}

/** Features are a function of the params: rebuilding with another layout stream changes none. */
function featuresStable(t: ItemTemplate, item: GeneratedItem): void {
  const g = registry.get(t.generator);
  const again = g?.build({ params: item.params, template: t, rng: createRng(987).fork('x') });
  expect(again?.features).toEqual(itemFeatures(item, t));
}

describe('shared comparison helpers', () => {
  it('answers which side has more or fewer, and the relation', () => {
    expect(sideAnswer(7, 3, 'more')).toBe('left');
    expect(sideAnswer(7, 3, 'fewer')).toBe('right');
    expect(sideAnswer(4, 4, 'fewer')).toBe('same');
    expect(relation(2, 9)).toBe('<');
    expect(relation(9, 2)).toBe('>');
    expect(relation(5, 5)).toBe('=');
    expect(closeness(3, 6)).toBe(0.5);
    expect(closeness(4, 4)).toBe(1);
  });
});

// ---------- compare.sets ----------

describe('compare.sets', () => {
  it('compare: left is a, right is b; more, fewer and same', () => {
    const t = tpl('compare.sets', 'compare', { representation: 'objects' });
    const more = make(t, { a: 6, b: 2, ask: 'more', conflict: false, sprite: 'fish' });
    expect(more.answer).toEqual({ kind: 'choice', id: 'left' });
    expect(more.widget).toMatchObject({
      format: 'compare',
      ask: 'more',
      left: { kind: 'objects', set: { count: 6, sprite: 'fish', layout: 'line' } },
      right: { kind: 'objects', set: { count: 2, sprite: 'fish', layout: 'line' } },
    });
    const fewer = make(t, { a: 6, b: 2, ask: 'fewer', conflict: false });
    expect(fewer.answer).toEqual({ kind: 'choice', id: 'right' });
    const same = make(t, { a: 5, b: 5, ask: 'fewer', conflict: false });
    expect(same.answer).toEqual({ kind: 'choice', id: 'same' });
    for (const item of [more, fewer, same]) checkItem(t, item);
    expect(itemSolution(same, t).at(-1)?.say).toBe('gen.compare.sets.same');
  });

  it('compare, concrete: match lines first; the conflict cue draws the fewer side big', () => {
    const t = tpl('compare.sets', 'compare', { tier: 'concrete', representation: 'objects' });
    const item = make(t, { a: 3, b: 7, ask: 'more', conflict: true });
    expect(item.widget).toMatchObject({
      allowMatchLines: true,
      left: { set: { count: 3, layout: 'line', sizeVaries: true } },
      right: { set: { count: 7, layout: 'array', rows: 2 } },
    });
    expect(item.answer).toEqual({ kind: 'choice', id: 'right' });
    const steps = itemSolution(item, t);
    expect(steps.map((s) => s.say)).toEqual([
      'gen.compare.sets.not-size',
      'gen.compare.sets.match',
      'gen.compare.sets.left-over',
      'gen.compare.sets.has-more',
    ]);
    checkItem(t, item);
    // Equal groups: one side (either) is drawn big, the other bunched.
    const eq = make(t, { a: 5, b: 5, ask: 'more', conflict: true });
    if (eq.widget.format !== 'compare') throw new Error('compare');
    expect(bigLookingSide(eq.widget)).not.toBeNull();
    expect(eq.answer).toEqual({ kind: 'choice', id: 'same' });
  });

  it('compare: the dots representation draws dots; frames draw ten-frames', () => {
    const dots = make(tpl('compare.sets', 'compare', { representation: 'dots' }), {
      a: 4,
      b: 6,
      conflict: true,
    });
    expect(dots.widget).toMatchObject({ left: { set: { sprite: 'dot', sizeVaries: true } } });
    const frames = make(tpl('compare.sets', 'compare', { representation: 'ten-frame' }), {
      a: 4,
      b: 9,
    });
    expect(frames.widget).toMatchObject({
      left: { kind: 'ten-frame', frames: 1, filled: [4] },
      right: { kind: 'ten-frame', frames: 1, filled: [9] },
    });
  });

  it('compare: features at the extremes, and only from the params', () => {
    const t = tpl('compare.sets', 'compare', { representation: 'objects' });
    const easy = make(t, { a: 1, b: 5, ask: 'more', conflict: false });
    expect(itemFeatures(easy, t)).toEqual({
      'bigger.over5': 0,
      closeness: 0.2,
      conflict: 0,
      'ask.fewer': 0,
      equal: 0,
      magnitude: 0,
    });
    const hard = make(t, { a: 10, b: 10, ask: 'fewer', conflict: true });
    expect(itemFeatures(hard, t)).toEqual({
      'bigger.over5': 1,
      closeness: 1,
      conflict: 1,
      'ask.fewer': 1,
      equal: 1,
      magnitude: 1,
    });
    for (let seed = 1; seed <= 20; seed += 1) {
      const ct = tpl('compare.sets', 'compare', {
        representation: 'objects',
        params: { conflict: { kind: 'bool', p: 0.5 } },
      });
      featuresStable(ct, generateItem(ct, seed));
    }
  });

  it('make-set: start with a, make it b (add or take away)', () => {
    const t = tpl('compare.sets', 'make-set', { tier: 'concrete', representation: 'ten-frame' });
    const add = make(t, { a: 2, b: 6 });
    expect(add.widget).toMatchObject({
      format: 'make-set',
      mode: 'add-more',
      start: 2,
      target: 6,
      container: 'raft',
    });
    expect(add.answer).toEqual({ kind: 'state', checker: 'set.count', target: { count: 6 } });
    const take = make(t, { a: 9, b: 4 });
    expect(take.widget).toMatchObject({ mode: 'take-away', start: 9, target: 4 });
    const fromEmpty = make(t, { a: 0, b: 3 });
    expect(fromEmpty.widget).toMatchObject({ mode: 'add-more', start: 0 });
    for (const item of [add, take, fromEmpty]) checkItem(t, item);
    // The steps before the last name the start, never the target.
    expect(itemSolution(take, t)[0]?.vars).toEqual({ n: 9 });
    expect(() => make(t, { a: 4, b: 4 })).toThrow(GenerationError);
  });

  it('balance: which side goes down, or does it balance', () => {
    const t = tpl('compare.sets', 'balance');
    const heavier = make(t, { a: 3, b: 5, ask: 'more', sprite: 'shell' });
    expect(heavier.widget).toMatchObject({
      format: 'balance',
      mode: 'which-heavier',
      left: { terms: [{ object: 'shell', count: 3 }] },
      right: { terms: [{ object: 'shell', count: 5 }] },
      showTilt: false,
    });
    expect(heavier.answer).toEqual({ kind: 'choice', id: 'right' });
    const judge = make(t, { a: 4, b: 4, ask: 'same' });
    expect(judge.widget).toMatchObject({ mode: 'judge' });
    expect(judge.answer).toEqual({ kind: 'choice', id: 'true' });
    const unequal = make(t, { a: 4, b: 6, ask: 'same' });
    expect(unequal.answer).toEqual({ kind: 'choice', id: 'false' });
    expect(itemFeatures(unequal, t)['judge.false']).toBe(1);
    for (const item of [heavier, judge, unequal]) checkItem(t, item);
    expect(() => make(t, { a: 4, b: 6, ask: 'fewer' })).toThrow(GenerationError);
  });

  it('rejects the conflict cue where it cannot be drawn', () => {
    expect(() =>
      make(tpl('compare.sets', 'compare', { representation: 'ten-frame' }), {
        a: 3,
        b: 6,
        conflict: true,
      }),
    ).toThrow(GenerationError);
    expect(() =>
      make(tpl('compare.sets', 'make-set', { tier: 'concrete' }), { a: 3, b: 6, conflict: true }),
    ).toThrow(GenerationError);
  });
});

describe('MC.perceptual-size (perceptualSize)', () => {
  const t = tpl('compare.sets', 'compare', { representation: 'objects' });

  it('predicts the bigger-looking side when asked for more', () => {
    const item = make(t, { a: 3, b: 6, ask: 'more', conflict: true });
    expect(perceptualSize.predict?.(item)).toEqual({ kind: 'choice', id: 'left' });
    expect(perceptualSize.match(item, { kind: 'choice', id: 'left' })).toBe(true);
    expect(perceptualSize.match(item, { kind: 'choice', id: 'same' })).toBe(false);
    expect(checkResponse(item, { kind: 'choice', id: 'left' }).correct).toBe(false);
  });

  it('predicts the smaller-looking side when asked for fewer', () => {
    const item = make(t, { a: 7, b: 4, ask: 'fewer', conflict: true });
    expect(item.answer).toEqual({ kind: 'choice', id: 'right' });
    expect(perceptualSize.predict?.(item)).toEqual({ kind: 'choice', id: 'left' });
  });

  it('predicts the big side when the groups are equal (conservation)', () => {
    const item = make(t, { a: 6, b: 6, ask: 'more', conflict: true });
    if (item.widget.format !== 'compare') throw new Error('compare');
    const big = bigLookingSide(item.widget);
    expect(perceptualSize.predict?.(item)).toEqual({ kind: 'choice', id: big });
  });

  it('returns null on items that cannot discriminate', () => {
    // No conflict cue.
    const plain = make(t, { a: 3, b: 6, ask: 'more', conflict: false });
    expect(perceptualSize.predict?.(plain)).toBeNull();
    expect(perceptualSize.match(plain, { kind: 'choice', id: 'left' })).toBe(false);
    // Not a compare item.
    const set = make(tpl('compare.sets', 'make-set', { tier: 'concrete' }), { a: 2, b: 5 });
    expect(perceptualSize.predict?.(set)).toBeNull();
    // The big-looking side also has more (a hand-made item): the buggy answer is the correct one.
    const conflict = make(t, { a: 3, b: 6, ask: 'more', conflict: true });
    if (conflict.widget.format !== 'compare') throw new Error('compare');
    expect(bigLookingSide(conflict.widget)).toBe('left');
    const congruent: GeneratedItem = { ...conflict, answer: { kind: 'choice', id: 'left' } };
    expect(perceptualSize.predict?.(congruent)).toBeNull();
    expect(perceptualSize.match(congruent, { kind: 'choice', id: 'left' })).toBe(false);
    // A compare.numbers item never carries the cue.
    const numbers = make(tpl('compare.numbers', 'compare'), { a: 3, b: 6, extra: 0 });
    expect(perceptualSize.predict?.(numbers)).toBeNull();
  });
});

// ---------- compare.numbers ----------

describe('compare.numbers', () => {
  it('compare: greater, less, same and the symbol', () => {
    const t = tpl('compare.numbers', 'compare', { tier: 'abstract', representation: 'symbols' });
    const greater = make(t, { a: 4, b: 9, extra: 0, ask: 'more' });
    expect(greater.answer).toEqual({ kind: 'choice', id: 'right' });
    expect(greater.widget).toMatchObject({
      ask: 'more',
      left: { kind: 'expression', expr: { tokens: [{ t: 'num', v: 4 }] } },
      right: { kind: 'expression', expr: { tokens: [{ t: 'num', v: 9 }] } },
    });
    const less = make(t, { a: 4, b: 9, extra: 0, ask: 'fewer' });
    expect(less.answer).toEqual({ kind: 'choice', id: 'left' });
    const same = make(t, { a: 7, b: 7, extra: 0, ask: 'more' });
    expect(same.answer).toEqual({ kind: 'choice', id: 'same' });
    const symbol = make(t, { a: 12, b: 8, extra: 0, min: 0, max: 20, ask: 'symbol' });
    expect(symbol.widget).toMatchObject({ ask: 'symbol' });
    expect(symbol.answer).toEqual({ kind: 'choice', id: '>' });
    expect(make(t, { a: 3, b: 3, extra: 0, ask: 'symbol' }).answer).toEqual({
      kind: 'choice',
      id: '=',
    });
    expect(itemSolution(symbol, t).at(-1)).toMatchObject({
      say: 'gen.compare.numbers.greater',
      vars: { n: 12, m: 8 },
      action: { op: 'place-symbol', args: { symbol: '>' } },
    });
    for (const item of [greater, less, same, symbol]) checkItem(t, item);
  });

  it('compare: each representation draws its own sides', () => {
    const path = make(tpl('compare.numbers', 'compare', { representation: 'number-path' }), {
      a: 3,
      b: 8,
      extra: 0,
      min: 1,
      max: 10,
    });
    expect(path.widget).toMatchObject({
      left: {
        kind: 'number-line',
        min: 1,
        max: 10,
        ticksEvery: 1,
        labelsEvery: 1,
        marks: [{ at: 3 }],
      },
    });
    const frames = make(
      tpl('compare.numbers', 'compare', { tier: 'concrete', representation: 'double-ten-frame' }),
      { a: 14, b: 9, extra: 0, min: 0, max: 20 },
    );
    expect(frames.widget).toMatchObject({
      left: { kind: 'ten-frame', frames: 2, filled: [10, 4] },
      right: { kind: 'ten-frame', frames: 2, filled: [9, 0] },
    });
    const blocks = make(tpl('compare.numbers', 'compare', { representation: 'base-ten' }), {
      a: 46,
      b: 64,
      extra: 0,
      min: 0,
      max: 99,
    });
    expect(blocks.widget).toMatchObject({ left: { kind: 'base-ten', tens: 4, ones: 6 } });
  });

  it('compare: sameTens and digitsDiffer at the extremes', () => {
    const t = tpl('compare.numbers', 'compare', { tier: 'abstract' });
    const teens = make(t, { a: 13, b: 17, extra: 0, min: 0, max: 20 });
    expect(itemFeatures(teens, t)).toMatchObject({ sameTens: 1, digitsDiffer: 0, magnitude: 1 });
    const mixed = make(t, { a: 9, b: 12, extra: 0, min: 0, max: 20 });
    expect(itemFeatures(mixed, t)).toMatchObject({ sameTens: 0, digitsDiffer: 1 });
    const easy = make(t, { a: 2, b: 9, extra: 0 });
    expect(itemFeatures(easy, t)).toEqual({
      sameTens: 0,
      digitsDiffer: 0,
      closeness: 0.22,
      'ask.fewer': 0,
      'ask.symbol': 0,
      equal: 0,
      magnitude: 0,
    });
  });

  it('steers toward close pairs on a large range (sampleToward)', () => {
    const int = (min: number, max: number) => ({ kind: 'int' as const, min, max });
    const t = tpl('compare.numbers', 'compare', {
      tier: 'abstract',
      params: {
        a: int(100, 999),
        b: int(100, 999),
        extra: { kind: 'const', value: 0 },
        min: { kind: 'const', value: 100 },
        max: { kind: 'const', value: 999 },
      },
    });
    // Same ten, nearly equal: 0.5 + ~1.0 + 0.6 (three digits). A random pair is rarely in one ten.
    let sameTen = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const item = generateItem(t, seed, { difficulty: 2.1 });
      if (Math.floor(Number(item.params.a) / 10) === Math.floor(Number(item.params.b) / 10)) {
        sameTen += 1;
      }
      expect(Math.abs(item.difficulty - 2.1)).toBeLessThanOrEqual(0.5);
    }
    expect(sameTen).toBeGreaterThanOrEqual(15);
  });

  it('draws the extra values distinct, inside [min, max]', () => {
    const t = tpl('compare.numbers', 'order', {
      params: {
        a: { kind: 'int', min: 0, max: 5 },
        b: { kind: 'int', min: 0, max: 5 },
        extra: { kind: 'const', value: 3 },
        min: { kind: 'const', value: 0 },
        max: { kind: 'const', value: 5 },
      },
    });
    for (let seed = 1; seed <= 30; seed += 1) {
      const item = generateItem(t, seed);
      const values = comparedValues(item.params);
      expect(values).toHaveLength(5);
      expect(new Set(values).size).toBe(5);
      expect(values.every((v) => v >= 0 && v <= 5)).toBe(true);
      featuresStable(t, item);
    }
  });

  it('order: smallest first, or greatest first; the solution replays', () => {
    const t = tpl('compare.numbers', 'order', { representation: 'number-path' });
    const asc = make(t, { a: 12, b: 3, extra: 1, x1: 8, min: 0, max: 20, ask: 'fewer' });
    expect(asc.answer).toEqual({ kind: 'numbers', values: [3, 8, 12], ordered: true });
    expect(asc.widget).toMatchObject({ format: 'order', direction: 'asc' });
    if (asc.widget.format !== 'order') throw new Error('order');
    expect(asc.widget.items.every((i) => i.stimulus?.kind === 'number-line')).toBe(true);
    const desc = make(t, { a: 12, b: 3, extra: 1, x1: 8, min: 0, max: 20, ask: 'more' });
    expect(desc.answer).toEqual({ kind: 'numbers', values: [12, 8, 3], ordered: true });
    for (const item of [asc, desc]) checkItem(t, item);
    expect(() => make(t, { a: 5, b: 5, extra: 1, x1: 2, min: 0, max: 20 })).toThrow(
      GenerationError,
    );
  });

  it('numeral-pick: the greatest or the least of three to five', () => {
    const t = tpl('compare.numbers', 'numeral-pick', { tier: 'abstract' });
    const greatest = make(t, { a: 4, b: 9, extra: 1, x1: 7, ask: 'more' });
    expect(greatest.answer).toEqual({ kind: 'choice', id: 'opt-9' });
    if (greatest.widget.format !== 'numeral-pick') throw new Error('numeral-pick');
    expect(greatest.widget.options.map((o) => o.id).sort()).toEqual(['opt-4', 'opt-7', 'opt-9']);
    expect(itemFeatures(greatest, t)).toMatchObject({ closeness: 0.78, 'ask.fewer': 0 });
    const least = make(t, { a: 4, b: 9, extra: 1, x1: 7, ask: 'fewer' });
    expect(least.answer).toEqual({ kind: 'choice', id: 'opt-4' });
    for (const item of [greatest, least]) checkItem(t, item);
    expect(() => make(t, { a: 4, b: 9, extra: 0 })).toThrow(GenerationError);
    expect(() => make(t, { a: 4, b: 9, extra: 1, ask: 'symbol' })).toThrow(GenerationError);
  });

  it('balance: the greater number goes down', () => {
    const t = tpl('compare.numbers', 'balance');
    const item = make(t, { a: 15, b: 11, extra: 0, min: 0, max: 20, ask: 'more' });
    expect(item.widget).toMatchObject({
      format: 'balance',
      mode: 'which-heavier',
      left: { terms: [{ n: 15 }] },
      right: { terms: [{ n: 11 }] },
    });
    expect(item.answer).toEqual({ kind: 'choice', id: 'left' });
    expect(itemFeatures(item, t)).toMatchObject({ size: 1.5, sameTens: 1, equal: 0 });
    checkItem(t, item);
  });

  it('number-line-place: put a among the two marked numbers', () => {
    const t = tpl('compare.numbers', 'number-line-place', { representation: 'number-path' });
    const item = make(t, { a: 12, b: 15, extra: 1, x1: 6, min: 0, max: 20 });
    expect(item.widget).toMatchObject({
      format: 'number-line-place',
      min: 0,
      max: 20,
      ticksEvery: 1,
      labelsEvery: null,
      target: 12,
      mode: 'place',
      snap: 'tick',
      benchmarks: [6, 15],
    });
    expect(item.answer).toEqual({ kind: 'placement', value: 12, min: 0, max: 20, tolerance: 0.5 });
    expect(itemSolution(item, t)[0]).toMatchObject({
      say: 'gen.compare.numbers.between',
      vars: { lo: 6, hi: 15 },
    });
    expect(itemFeatures(item, t)).toMatchObject({ range: 0.3, 'target.offLabel': 1 });
    checkItem(t, item);
    expect(() => make(t, { a: 12, b: 15, extra: 0, min: 0, max: 20 })).toThrow(GenerationError);
  });
});
