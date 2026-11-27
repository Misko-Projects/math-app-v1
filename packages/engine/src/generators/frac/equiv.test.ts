// K02 slice 5c (#17): frac.equiv, frac.compare `benchmark` and frac.shares `name` over their whole
// ranges. Every draw a template can make builds a valid widget whose example answer checks correct
// and whose solution replays; the pairs are the ones the slice names (second bottom ≤ 8); every
// benchmark pair is decided by the benchmark (never two fractions on one side of one half); and
// the misconception rules never claim a right answer.

import {
  type GeneratedItem,
  type ItemFormat,
  type ItemTemplate,
  type ParamValues,
  type ResponseValue,
  widgetConfigSchema,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import {
  fractionBiggerNumbers,
  fractionEquivAdd,
  fractionEquivOneSide,
  fractionHalfByTop,
} from '../../misconceptions/rules/fractionEquiv';
import { benchSide, fracCompare, PIECE_DENS } from './compare';
import { EQUIV_DENS, fracEquiv } from './equiv';
import { fracShares, SHARE_CUTS } from './shares';

const RULES = [fractionEquivAdd, fractionEquivOneSide, fractionBiggerNumbers, fractionHalfByTop];

let nextId = 0;
function tpl(
  generator: string,
  format: ItemFormat,
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.equiv.${format}.${nextId}`,
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
  const right = itemExampleCorrect(item, owner.get(item));
  expect(checkResponse(item, right).correct).toBe(true);
  const steps = itemSolution(item, owner.get(item));
  expect(steps.length).toBeGreaterThan(0);
  // Only the last step acts toward the answer (a hint or a faded demo never answers first).
  for (const s of steps.slice(0, -1)) {
    if (item.widget.format !== 'order')
      expect(['hop', 'type', 'answer']).not.toContain(s.action?.op);
  }
  const replayed = replaySteps(item, steps);
  if (replayed) expect(checkResponse(item, replayed).correct).toBe(true);
  for (const r of RULES) {
    expect(r.match(item, right, { latencyMs: 1000 })).toBe(false);
    const p = r.predict?.(item);
    if (p) expect(checkResponse(item, p as ResponseValue).correct).toBe(false);
  }
}

/** The equal pairs the slice draws: a/b < 1 with b in 2, 3, 4 and m·b ≤ 8. */
const PAIRS = new Set([
  '1/2=2/4',
  '1/2=3/6',
  '1/2=4/8',
  '1/3=2/6',
  '2/3=4/6',
  '1/4=2/8',
  '3/4=6/8',
]);

function equivDraws(t: ItemTemplate, base: ParamValues) {
  const out: ParamValues[] = [];
  for (const den of [...EQUIV_DENS, 6, 8])
    for (const mult of [1, 2, 3, 4, 5])
      for (let num = 0; num <= 2 * den; num += 1)
        for (const max of [1, 2]) {
          const p = { ...base, den, mult, num, max };
          if (fracEquiv.accepts?.(p, t)) out.push(p);
        }
  return out;
}

describe('frac.equiv', () => {
  const line = tpl('frac.equiv', 'fraction-line');
  const pad = tpl('frac.equiv', 'number-pad');

  it.each(['line', 'strip'])('place on a %s: every draw lands on a tap-sized tick', (skin) => {
    const all = equivDraws(line, { mode: 'place', skin });
    expect(all.length).toBeGreaterThan(5);
    for (const p of all) {
      const item = build(line, p);
      const w = item.widget;
      if (w.format !== 'fraction-line') throw new Error('format');
      const { num, den, mult, max } = p as { num: number; den: number; mult: number; max: number };
      const d = den * mult;
      expect(w.denominator).toBe(d);
      expect(w.target).toEqual({ a: num, b: den });
      // Tapped ticks ≥ 64 px at 960 × 600 (frac.line's bound): ≤ 8 parts on the line.
      expect(d * max).toBeLessThanOrEqual(8);
      if (skin === 'strip') expect(max).toBe(1);
      expect(num % den).not.toBe(0);
      if (max === 1) expect(PAIRS.has(`${num}/${den}=${num * mult}/${d}`)).toBe(true);
      expect(['ends', 'wholes']).toContain(w.labels);
      expect(item.answer).toEqual({
        kind: 'placement',
        value: num / den,
        min: 0,
        max,
        tolerance: 1 / (2 * d),
      });
      roundTrip(item);
    }
  });

  it('the line to 2 draws the halves past one (3/2 = 6/4)', () => {
    const past = equivDraws(line, { mode: 'place', skin: 'line' }).filter((p) => p.max === 2);
    expect(past.map((p) => `${p.num}/${p.den}`).sort()).toEqual(['1/2', '3/2']);
  });

  it.each([
    ['num', false],
    ['num', true],
    ['den', false],
  ] as const)('pad, missing %s, picture %s: every pair, one true answer', (missing, picture) => {
    const all = equivDraws(pad, { mode: 'pad', missing, picture });
    const seen = new Set<string>();
    for (const p of all) {
      const item = build(pad, p);
      const w = item.widget;
      if (w.format !== 'number-pad') throw new Error('format');
      const { num, den, mult } = p as { num: number; den: number; mult: number };
      const d = den * mult;
      const key = `${num}/${den}=${num * mult}/${d}`;
      expect(PAIRS.has(key)).toBe(true);
      seen.add(key);
      expect(w.blanks).toEqual([{ id: missing === 'den' ? 'frac-2-b' : 'frac-2-a', maxDigits: 1 }]);
      expect(item.answer).toEqual({ kind: 'number', value: missing === 'den' ? d : num * mult });
      if (picture) {
        // Two strips of one whole, the bottom unshaded: the picture never shows the answer.
        expect(w.stimulus).toEqual({
          kind: 'fraction',
          shape: 'bar',
          parts: den,
          shaded: num,
          equalParts: true,
          below: { parts: d, shaded: 0 },
        });
        expect(w.expression?.tokens[2]).toEqual({ t: 'frac', a: 'blank', b: d });
      } else {
        expect(w.stimulus.kind).toBe('expression');
      }
      roundTrip(item);
    }
    expect(seen).toEqual(PAIRS);
  });

  it('never a picture with a missing bottom number (the strip would show it)', () => {
    expect(equivDraws(pad, { mode: 'pad', missing: 'den', picture: true })).toEqual([]);
  });

  it('the adding and one-side rules name the classic answers', () => {
    const item = build(pad, { mode: 'pad', missing: 'num', num: 1, den: 2, mult: 2 });
    expect(fractionEquivAdd.predict?.(item)).toEqual({ kind: 'number', value: 3 });
    expect(fractionEquivOneSide.predict?.(item)).toEqual({ kind: 'number', value: 1 });
    const den = build(pad, { mode: 'pad', missing: 'den', num: 2, den: 3, mult: 2 });
    expect(fractionEquivAdd.predict?.(den)).toEqual({ kind: 'number', value: 5 });
    expect(fractionEquivOneSide.predict?.(den)).toEqual({ kind: 'number', value: 3 });
    const placed = build(line, { mode: 'place', skin: 'line', num: 3, den: 4, mult: 2, max: 1 });
    expect(fractionEquivOneSide.predict?.(placed)).toEqual({ kind: 'placement', value: 3 / 8 });
  });
});

describe('frac.compare benchmark (FRA.15)', () => {
  const pic = tpl('frac.compare', 'compare');
  const sym = tpl('frac.compare', 'compare', { tier: 'abstract', representation: 'symbols' });
  const order = tpl('frac.compare', 'order');
  const order3 = tpl('frac.compare', 'order', { tier: 'abstract', representation: 'symbols' });
  const base = { kind: 'benchmark', symbols: true, shape: 'bar', den3: 0 };

  function draws(t: ItemTemplate, over: ParamValues) {
    const out: ParamValues[] = [];
    for (const den of PIECE_DENS)
      for (let num = 1; num <= 2 * den; num += 1)
        for (const den2 of PIECE_DENS)
          for (let num2 = 1; num2 < den2; num2 += 1) {
            const p = { ...base, ...over, den, num, den2, num2 };
            if (fracCompare.accepts?.(p, t)) out.push(p);
            if (over.pair !== true) break;
          }
    return out;
  }

  it('against one half: pictures and signs, equal for 2/4, 3/6 and 4/8 only', () => {
    for (const t of [pic, sym]) {
      const all = draws(t, { bench: 'half' });
      expect(all.length).toBeGreaterThan(15);
      for (const p of all) {
        const item = build(t, p);
        const { num, den } = p as { num: number; den: number };
        expect(num).toBeLessThan(den);
        const side = benchSide(num, den, 'half');
        const want =
          t === sym
            ? side === 0
              ? '='
              : side > 0
                ? '>'
                : '<'
            : side === 0
              ? 'same'
              : side > 0
                ? 'left'
                : 'right';
        expect(item.answer).toEqual({ kind: 'choice', id: want });
        if (side === 0) expect([2, 3, 4]).toContain(num);
        roundTrip(item);
      }
    }
  });

  it('against 1: bottoms 2, 3, 4, 6, 8, tops b − 2 to b + 2, and b/b is equal', () => {
    const all = draws(sym, { bench: 'one' });
    expect(draws(pic, { bench: 'one' })).toEqual([]);
    for (const p of all) {
      const item = build(sym, p);
      const { num, den } = p as { num: number; den: number };
      expect(PIECE_DENS as readonly number[]).toContain(den);
      expect(Math.abs(num - den)).toBeLessThanOrEqual(2);
      const w = item.widget;
      if (w.format !== 'compare') throw new Error('format');
      expect(w.right).toEqual({ kind: 'expression', expr: { tokens: [{ t: 'num', v: 1 }] } });
      expect(item.answer).toEqual({
        kind: 'choice',
        id: num === den ? '=' : num > den ? '>' : '<',
      });
      roundTrip(item);
    }
    expect(all.some((p) => p.num === p.den)).toBe(true);
    expect(all.some((p) => (p.num as number) > (p.den as number))).toBe(true);
  });

  it('orders: one half and fractions on its other side, never one half twice', () => {
    const two = draws(order, { bench: 'half' });
    const three = draws(order3, { bench: 'half', pair: true });
    expect(two.length).toBeGreaterThan(10);
    expect(three.length).toBeGreaterThan(50);
    expect(draws(order3, { bench: 'half' })).toEqual([]);
    expect(draws(order, { bench: 'half', pair: true })).toEqual([]);
    for (const [t, all] of [
      [order, two],
      [order3, three],
    ] as const) {
      for (const p of all) {
        const item = build(t, p);
        const w = item.widget;
        if (w.format !== 'order') throw new Error('format');
        const labels = w.items.map((i) => i.label);
        expect(labels).toContain('1/2');
        // Every fraction but one half is on a side of it; two fractions are on different sides,
        // so each pair is decided by the benchmark (task 0 answer, condition 1).
        const others = w.items
          .filter((i) => i.label !== '1/2')
          .map((i) =>
            benchSide(...((i.label as string).split('/').map(Number) as [number, number]), 'half'),
          );
        expect(others.every((s) => s !== 0)).toBe(true);
        if (others.length === 2) expect(others[0]).toBe(-(others[1] as number));
        expect(new Set(w.items.map((i) => i.value)).size).toBe(w.items.length);
        if (t === order) expect(w.items.every((i) => i.stimulus?.kind === 'fraction')).toBe(true);
        else expect(w.items.every((i) => i.stimulus === undefined)).toBe(true);
        roundTrip(item);
      }
    }
  });

  it('the sign rules: 4/8 > 1/2 is the bigger-numbers answer, 3/8 > 1/2 the top-number one', () => {
    const eq = build(sym, { ...base, bench: 'half', num: 4, den: 8 });
    expect(fractionBiggerNumbers.predict?.(eq)).toEqual({ kind: 'choice', id: '>' });
    expect(fractionHalfByTop.predict?.(eq)).toBeNull();
    const below = build(sym, { ...base, bench: 'half', num: 3, den: 8 });
    expect(fractionHalfByTop.predict?.(below)).toEqual({ kind: 'choice', id: '>' });
    const unit = build(sym, { ...base, bench: 'half', num: 1, den: 4 });
    expect(fractionHalfByTop.predict?.(unit)).toEqual({ kind: 'choice', id: '=' });
    // A fraction above one half with a top above 1: the top-number answer is right, so no claim.
    const above = build(sym, { ...base, bench: 'half', num: 3, den: 4 });
    expect(fractionHalfByTop.predict?.(above)).toBeNull();
  });
});

describe('frac.shares name (FRA.14)', () => {
  const name = tpl('frac.shares', 'fraction-pick');
  it('every cut: each part is 1/n of the whole, and every true name of it is right', () => {
    for (let cut = 0; cut < SHARE_CUTS.length; cut += 1)
      for (const mirror of [false, true]) {
        const item = build(name, { cut, mirror, equalParts: true, name: true });
        const w = item.widget;
        if (w.format !== 'fraction-pick') throw new Error('format');
        expect(w.mode).toBe('name');
        expect(w.stimulus?.kind).toBe('grid-parts');
        const g = w.stimulus?.kind === 'grid-parts' ? w.stimulus : null;
        const n = g?.parts.length as number;
        const squares = (g?.cols as number) * (g?.rows as number);
        expect(item.answer).toEqual({
          kind: 'numbers',
          values: [1, n],
          ordered: true,
          fraction: { equivalentOk: true },
        });
        const say = (a: number, b: number) =>
          checkResponse(item, { kind: 'numbers', values: [a, b] }).correct;
        // The squares of a part out of all the squares (4/16) is the same amount: right.
        expect(say(squares / n, squares)).toBe(true);
        expect(say(2, 2 * n)).toBe(true);
        expect(say(1, n + 1)).toBe(false);
        expect(say(1, 0)).toBe(false);
        expect(say(squares / n, n)).toBe(false);
        roundTrip(item);
      }
  });

  it('is never drawn for unequal parts or on number-pad', () => {
    const pad = tpl('frac.shares', 'number-pad');
    expect(fracShares.accepts?.({ cut: 0, mirror: false, name: true }, pad)).toBe(false);
    expect(
      fracShares.accepts?.({ cut: 0, mirror: false, name: true, equalParts: false }, name),
    ).toBe(false);
  });
});

describe('PR #141 review round 1', () => {
  it('benchmark items carry the benchmark feature (its weight moves their difficulty)', () => {
    const sym = tpl('frac.compare', 'compare', { tier: 'abstract', representation: 'symbols' });
    const p = {
      kind: 'benchmark',
      bench: 'half',
      symbols: true,
      shape: 'bar',
      den3: 0,
      num: 3,
      den: 8,
    };
    expect(itemFeatures(build(sym, p), sym).benchmark).toBe(1);
  });

  it('number-pad refuses a stacked-fraction box in an expression picture that is not a blank', () => {
    const pad = tpl('frac.equiv', 'number-pad');
    const item = build(pad, { mode: 'pad', missing: 'den', num: 2, den: 3, mult: 2 });
    const w = item.widget;
    if (w.format !== 'number-pad') throw new Error('format');
    const model = formatModel('number-pad');
    expect(model?.configSchema.safeParse(w).success).toBe(true);
    const wrong = { ...w, blanks: [{ id: 'frac-2-a', maxDigits: 1 }] };
    expect(model?.configSchema.safeParse(wrong).success).toBe(false);
  });
});
