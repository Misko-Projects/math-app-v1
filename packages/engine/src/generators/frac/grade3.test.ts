// K02 slice 5a (#17): grade 3 fractions as parts of a whole. frac.partition `name` (FRA.03, FRA.09)
// and frac.compare with `symbols` (FRA.06, FRA.13) over their whole ranges: answers, widgets,
// exampleCorrect checks correct, solutions replay, validity, and the three new misconception rules
// plus MC.fraction-bigger-denominator on the new items.

import {
  type GeneratedItem,
  type ItemFormat,
  type ItemTemplate,
  type ParamValues,
  widgetConfigSchema,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { checkResponse } from '../../items/check';
import { generateItemFromParams } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { fractionBiggerDenominator } from '../../misconceptions/rules/fractionBiggerDenominator';
import {
  fractionCompareTops,
  fractionPartToPart,
  fractionSwapped,
} from '../../misconceptions/rules/fractionNames';
import { GenerationError } from '../types';
import { fractionSize, MAX_SAME_NUM, PIECE_DENS } from './compare';
import { NAME_DENS } from './partition';

let nextId = 0;
function tpl(
  generator: 'frac.partition' | 'frac.compare',
  format: ItemFormat,
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.g3.${format}.${nextId}`,
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
const owner = new WeakMap<GeneratedItem, ItemTemplate>();
const build = (t: ItemTemplate, params: ParamValues): GeneratedItem => {
  const item = generateItemFromParams(t, params, { seed: 7 });
  owner.set(item, t);
  return item;
};
beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

function roundTrip(item: GeneratedItem) {
  expect(widgetConfigSchema.safeParse(item.widget).success).toBe(true);
  expect(checkResponse(item, itemExampleCorrect(item, owner.get(item))).correct).toBe(true);
  const steps = itemSolution(item, owner.get(item));
  expect(steps.length).toBeGreaterThan(0);
  const replayed = replaySteps(item, steps);
  if (replayed) expect(checkResponse(item, replayed).correct).toBe(true);
}

describe('frac.partition name (FRA.03, FRA.09)', () => {
  const pic = tpl('frac.partition', 'fraction-pick');
  const words = tpl('frac.partition', 'fraction-pick', {
    tier: 'abstract',
    representation: 'symbols',
  });
  it('every shape, denominator and shaded count: a picture of exactly that, answer [num, den]', () => {
    for (const shape of ['circle', 'rect', 'bar'] as const) {
      for (const den of NAME_DENS) {
        for (let num = 1; num <= den; num += 1) {
          const item = build(pic, { mode: 'name', shape, den, num });
          expect(item.answer).toEqual({ kind: 'numbers', values: [num, den], ordered: true });
          const w = item.widget;
          if (w.format !== 'fraction-pick') throw new Error('format');
          expect(w.mode).toBe('name');
          expect(w.nameInput).toBe('pads');
          expect(w.stimulus).toEqual({
            kind: 'fraction',
            shape,
            parts: den,
            shaded: num,
            equalParts: true,
          });
          roundTrip(item);
        }
      }
    }
  });
  it('words: no picture; the solution says the parts and the fraction, copies when num > 1', () => {
    for (const den of NAME_DENS) {
      for (let num = 1; num < den; num += 1) {
        const item = build(words, { mode: 'name', shape: 'circle', den, num, words: true });
        const w = item.widget;
        if (w.format !== 'fraction-pick') throw new Error('format');
        expect(w.stimulus).toBeUndefined();
        const keys = itemSolution(item, owner.get(item)).map((s) => s.say);
        expect(keys[0]).toBe('gen.frac.partition.name-words-bottom');
        expect(keys.at(-1)).toBe(
          num > 1 ? 'gen.frac.partition.name-copies' : 'gen.frac.partition.name-write',
        );
        // Steps before the last carry no vars: the level-4 hint plays them.
        for (const s of itemSolution(item, owner.get(item)).slice(0, -1))
          expect(s.vars).toEqual({});
        roundTrip(item);
      }
    }
  });
  it('refuses denominators past grade 3, grids, no shaded part, and words off the name mode', () => {
    const refused = (t: ItemTemplate, p: ParamValues) =>
      expect(() => build(t, p)).toThrow(GenerationError);
    refused(pic, { mode: 'name', shape: 'circle', den: 5, num: 1 });
    refused(pic, { mode: 'name', shape: 'circle', den: 4, num: 0 });
    refused(pic, { mode: 'name', shape: 'bar', den: 8, num: 9 });
    refused(pic, { mode: 'name', shape: 'square', den: 4, num: 1 });
    refused(pic, { mode: 'fair-or-not', shape: 'circle', den: 4, num: 0, words: true });
  });
  it('an equal fraction is wrong, and no rule claims it (2/4 for halves, 1/2 for 2 of 4)', () => {
    const halves = build(pic, { mode: 'name', shape: 'bar', den: 2, num: 1 });
    const r = { kind: 'numbers' as const, values: [2, 4] };
    expect(checkResponse(halves, r).correct).toBe(false);
    const twoOfFour = build(pic, { mode: 'name', shape: 'bar', den: 4, num: 2 });
    const half = { kind: 'numbers' as const, values: [1, 2] };
    expect(checkResponse(twoOfFour, half).correct).toBe(false);
    for (const rule of [fractionPartToPart, fractionSwapped]) {
      expect(rule.match(halves, r)).toBe(false);
      expect(rule.match(twoOfFour, half)).toBe(false);
    }
  });
});

describe('MC.fraction-part-to-part and MC.fraction-swapped', () => {
  const pic = tpl('frac.partition', 'fraction-pick');
  it('3 of 8 shaded: [3, 5] and [5, 8] are part-to-part, [8, 3] is swapped', () => {
    const item = build(pic, { mode: 'name', shape: 'bar', den: 8, num: 3 });
    const r = (values: number[]) => ({ kind: 'numbers' as const, values });
    expect(fractionPartToPart.match(item, r([3, 5]))).toBe(true);
    expect(fractionPartToPart.match(item, r([5, 8]))).toBe(true);
    expect(fractionPartToPart.match(item, r([3, 8]))).toBe(false);
    expect(fractionSwapped.match(item, r([8, 3]))).toBe(true);
    expect(fractionSwapped.match(item, r([3, 8]))).toBe(false);
  });
  it('never claims the right answer, over every draw', () => {
    for (const den of NAME_DENS) {
      for (let num = 1; num <= den; num += 1) {
        const item = build(pic, { mode: 'name', shape: 'circle', den, num });
        const right = { kind: 'numbers' as const, values: [num, den] };
        expect(fractionPartToPart.match(item, right)).toBe(false);
        expect(fractionSwapped.match(item, right)).toBe(false);
        // Half shaded: the unshaded parts name the same fraction, so only [n, n] is left.
        if (num * 2 === den) {
          expect(fractionPartToPart.predict?.(item)).toEqual({
            kind: 'numbers',
            values: [num, num],
          });
        }
      }
    }
  });
  it('ignores other items', () => {
    const cut = build(tpl('frac.partition', 'fraction-cut', { tier: 'concrete' }), {
      mode: 'cut',
      shape: 'circle',
      den: 4,
      num: 1,
    });
    expect(fractionPartToPart.predict?.(cut)).toBeNull();
    expect(fractionSwapped.predict?.(cut)).toBeNull();
  });
});

describe('frac.compare with symbols (FRA.06, FRA.13)', () => {
  const pictures = tpl('frac.compare', 'compare', { representation: 'fraction-strip' });
  const written = tpl('frac.compare', 'compare', { tier: 'abstract', representation: 'symbols' });
  const strips = tpl('frac.compare', 'order', { representation: 'fraction-strip' });
  const cards = tpl('frac.compare', 'order', { tier: 'abstract', representation: 'symbols' });

  it('sameDen compare: every pair of every denominator, pictures and symbols', () => {
    for (const den of PIECE_DENS) {
      for (let a = 1; a < den; a += 1) {
        for (let b = 1; b < den; b += 1) {
          const p = { kind: 'sameDen', symbols: true, shape: 'bar', den, num: a, num2: b };
          const item = build(pictures, p);
          const w = item.widget;
          if (w.format !== 'compare') throw new Error('format');
          expect(w.ask).toBe('more');
          expect(w.left).toMatchObject({ kind: 'fraction', parts: den, shaded: a });
          expect(w.right).toMatchObject({ kind: 'fraction', parts: den, shaded: b });
          expect(item.answer).toEqual({
            kind: 'choice',
            id: a === b ? 'same' : a > b ? 'left' : 'right',
          });
          roundTrip(item);
          const sym = build(written, p);
          const s = sym.widget;
          if (s.format !== 'compare') throw new Error('format');
          expect(s.ask).toBe('symbol');
          expect(s.left).toEqual({
            kind: 'expression',
            expr: { tokens: [{ t: 'frac', a, b: den }] },
          });
          expect(sym.answer).toEqual({ kind: 'choice', id: a === b ? '=' : a > b ? '>' : '<' });
          roundTrip(sym);
          // Same-size parts: the bigger-denominator rule never fires on FRA.06.
          expect(fractionBiggerDenominator.predict?.(item)).toBeNull();
          expect(fractionBiggerDenominator.predict?.(sym)).toBeNull();
        }
      }
    }
  });

  it('sameNum compare: every numerator 1–3 below both denominators; wholes the same', () => {
    let seen = 0;
    for (let num = 1; num <= MAX_SAME_NUM; num += 1) {
      for (const den of PIECE_DENS) {
        for (const den2 of PIECE_DENS) {
          const p = { kind: 'sameNum', symbols: true, shape: 'bar', num, den, den2 };
          if (num >= den || num >= den2) {
            expect(() => build(pictures, p)).toThrow(GenerationError);
            continue;
          }
          seen += 1;
          const item = build(pictures, p);
          const w = item.widget;
          if (w.format !== 'compare') throw new Error('format');
          expect(w.left).toMatchObject({ kind: 'fraction', shape: 'bar', parts: den, shaded: num });
          expect(w.right).toMatchObject({
            kind: 'fraction',
            shape: 'bar',
            parts: den2,
            shaded: num,
          });
          expect(item.answer).toEqual({
            kind: 'choice',
            id: den === den2 ? 'same' : den < den2 ? 'left' : 'right',
          });
          roundTrip(item);
          const sym = build(written, p);
          expect(sym.answer).toEqual({
            kind: 'choice',
            id: den === den2 ? '=' : den < den2 ? '>' : '<',
          });
          roundTrip(sym);
          if (den !== den2) {
            // Bigger bottom number read as bigger: the side (or symbol) for the larger den.
            expect(fractionBiggerDenominator.predict?.(item)).toEqual({
              kind: 'choice',
              id: den > den2 ? 'left' : 'right',
            });
            expect(fractionBiggerDenominator.predict?.(sym)).toEqual({
              kind: 'choice',
              id: den > den2 ? '>' : '<',
            });
            expect(fractionCompareTops.match(item, { kind: 'choice', id: 'same' })).toBe(true);
            expect(fractionCompareTops.match(sym, { kind: 'choice', id: '=' })).toBe(true);
          } else {
            expect(fractionCompareTops.predict?.(item)).toBeNull();
            // Wholes cut alike: the worked solution says they are equal, not "fewer parts".
            const keys = itemSolution(item, owner.get(item)).map((s) => s.say);
            expect(keys).toContain('gen.frac.compare.same-den-equal');
            expect(keys).not.toContain('gen.frac.compare.same-num-more');
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(30);
  });

  it('order: three different fractions, strips with labels or labels alone, biggest first', () => {
    const cases: ParamValues[] = [
      { kind: 'sameDen', den: 8, num: 3, num2: 7, num3: 1 },
      { kind: 'sameDen', den: 3, num: 1, num2: 2 },
      { kind: 'sameNum', num: 2, den: 3, den2: 8, den3: 4 },
      { kind: 'sameNum', num: 1, den: 2, den2: 6 },
    ];
    for (const c of cases) {
      const p = { ...c, symbols: true, shape: 'bar' };
      for (const t of [strips, cards]) {
        const item = build(t, p);
        const w = item.widget;
        if (w.format !== 'order') throw new Error('format');
        for (const it of w.items) {
          const [a, b] = (it.label ?? '').split('/').map(Number) as [number, number];
          expect(it.value).toBe(fractionSize(a, b));
          if (t === cards) expect(it.stimulus).toBeUndefined();
          else
            expect(it.stimulus).toMatchObject({
              kind: 'fraction',
              shape: 'bar',
              parts: b,
              shaded: a,
            });
        }
        const values = w.items.map((x) => x.value).sort((x, y) => y - x);
        expect(item.answer).toEqual({ kind: 'numbers', values, ordered: true });
        roundTrip(item);
      }
    }
    // Reversed order is the bigger-denominator slip on FRA.13 only.
    const den = build(strips, { ...cases[0], symbols: true, shape: 'bar' });
    expect(fractionBiggerDenominator.predict?.(den)).toBeNull();
    const num = build(strips, { ...cases[2], symbols: true, shape: 'bar' });
    expect(fractionBiggerDenominator.predict?.(num)).toEqual({
      kind: 'numbers',
      values: [6, 12, 16],
    });
  });

  it('refuses equal cards, a whole shaded, num past 3 and a third fraction on compare', () => {
    const refused = (t: ItemTemplate, p: ParamValues) =>
      expect(() => build(t, { symbols: true, shape: 'bar', ...p })).toThrow(GenerationError);
    refused(strips, { kind: 'sameDen', den: 4, num: 1, num2: 1 });
    refused(strips, { kind: 'sameNum', num: 1, den: 4, den2: 8, den3: 4 });
    refused(pictures, { kind: 'sameDen', den: 4, num: 4, num2: 1 });
    refused(pictures, { kind: 'sameNum', num: 4, den: 6, den2: 8 });
    refused(pictures, { kind: 'sameDen', den: 8, num: 1, num2: 2, num3: 3 });
  });

  it('K01 items are unchanged: no symbols, one part each, counts on the symbols tier', () => {
    const t = tpl('frac.compare', 'order', { tier: 'abstract', representation: 'symbols' });
    const item = build(t, { shape: 'bar', den: 2, den2: 4, den3: 8 });
    const w = item.widget;
    if (w.format !== 'order') throw new Error('format');
    expect(w.items.map((x) => x.label).sort()).toEqual(['2', '4', '8']);
  });
});
