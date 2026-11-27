// Two names for one amount, and benchmarks (03 §7.2, K02 slice 5c: frac.equiv and frac.compare
// `benchmark` items, FRA.05, FRA.17, FRA.15).
// - MC.fraction-equiv-add: adds the same number to top and bottom (1/2 = 3/4). A missing top
//   number a/b = ?/d answers a + (d − b); a missing bottom a/b = c/? answers b + (c − a).
// - MC.fraction-equiv-one-side: changes only one number (doubling only the bottom keeps the top:
//   1/2 = 1/4). A missing top answers a, a missing bottom b; placing a/b on a line cut into d parts
//   a whole, the dot goes to tick a (a/d).
// - MC.fraction-bigger-numbers: takes the fraction with bigger numbers for the bigger one: a
//   fraction equal to one half (2/4, 3/6, 4/8) against one half answered > (signs), or its strip,
//   with more parts, picked as showing more (pictures).
// - MC.fraction-half-by-top: compares with one half by the top numbers alone (by the shaded part
//   counts on pictures): a/b against 1/2 (not equal) answered as a against 1 (3/8 > 1/2,
//   1/4 = 1/2; pictures: the a/b strip, or the same).
// Each predicts responses and never the right answer, so no right answer is claimed: the adding
// rule equals the answer only when a = b or b = d, which no item draws.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';

const NEAR = 1e-6;

interface EquivItem {
  num: number;
  den: number;
  d: number;
  missingDen: boolean;
  format: GeneratedItem['format'];
}

/** A frac.equiv item (num, den, mult and its pad blank or line), or null. */
function equivItem(item: GeneratedItem): EquivItem | null {
  const p = item.params;
  if (typeof p.num !== 'number' || typeof p.den !== 'number' || typeof p.mult !== 'number')
    return null;
  const w = item.widget;
  const d = p.den * p.mult;
  if (w.format === 'fraction-line' && p.mode === 'place' && w.denominator === d) {
    return { num: p.num, den: p.den, d, missingDen: false, format: w.format };
  }
  if (w.format === 'number-pad' && p.mode === 'pad') {
    const blank = w.blanks[0]?.id;
    if (blank !== 'frac-2-a' && blank !== 'frac-2-b') return null;
    return { num: p.num, den: p.den, d, missingDen: blank === 'frac-2-b', format: w.format };
  }
  return null;
}

function same(a: ResponseValue, b: ResponseValue): boolean {
  if (a.kind === 'placement' && b.kind === 'placement') return Math.abs(a.value - b.value) < NEAR;
  if (a.kind === 'number' && b.kind === 'number') return a.value === b.value;
  if (a.kind === 'choice' && b.kind === 'choice') return a.id === b.id;
  return false;
}

function right(item: GeneratedItem): ResponseValue | null {
  const a = item.answer;
  if (a.kind === 'placement') return { kind: 'placement', value: a.value };
  if (a.kind === 'number') return { kind: 'number', value: a.value };
  if (a.kind === 'choice') return { kind: 'choice', id: a.id };
  return null;
}

function rule(id: string, predicts: (item: GeneratedItem) => ResponseValue[]): MisconceptionRule {
  const list = (item: GeneratedItem): ResponseValue[] => {
    const r = right(item);
    if (!r) return [];
    return predicts(item).filter((p) => !same(p, r));
  };
  return {
    id,
    kind: 'answer',
    predict: (item) => list(item)[0] ?? null,
    match: (item, r) => list(item).some((p) => same(p, r)),
  };
}

const number = (value: number): ResponseValue => ({ kind: 'number', value });

export const fractionEquivAdd = rule('fractionEquivAdd', (item) => {
  const e = equivItem(item);
  if (!e || e.format !== 'number-pad') return [];
  const c = (e.num * e.d) / e.den;
  const r = e.missingDen ? e.den + (c - e.num) : e.num + (e.d - e.den);
  return r > 0 ? [number(r)] : [];
});

export const fractionEquivOneSide = rule('fractionEquivOneSide', (item) => {
  const e = equivItem(item);
  if (!e) return [];
  if (e.format === 'fraction-line') return [{ kind: 'placement', value: e.num / e.d }];
  return [number(e.missingDen ? e.den : e.num)];
});

/**
 * A frac.compare benchmark against one half, a/b on the left: [a, b] and whether it asks a sign
 * (or which picture shows more), or null.
 */
function halfCompare(item: GeneratedItem): { a: number; b: number; signs: boolean } | null {
  const p = item.params;
  const w = item.widget;
  if (p.kind !== 'benchmark' || (p.bench ?? 'half') !== 'half') return null;
  if (w.format !== 'compare' || (w.ask !== 'symbol' && w.ask !== 'more')) return null;
  if (typeof p.num !== 'number' || typeof p.den !== 'number') return null;
  return { a: p.num, b: p.den, signs: w.ask === 'symbol' };
}

const choice = (id: string): ResponseValue => ({ kind: 'choice', id });

export const fractionBiggerNumbers = rule('fractionBiggerNumbers', (item) => {
  const f = halfCompare(item);
  if (!f || 2 * f.a !== f.b) return [];
  return [choice(f.signs ? '>' : 'left')];
});

export const fractionHalfByTop = rule('fractionHalfByTop', (item) => {
  const f = halfCompare(item);
  if (!f || 2 * f.a === f.b) return [];
  if (f.signs) return [choice(f.a > 1 ? '>' : '=')];
  return [choice(f.a > 1 ? 'left' : 'same')];
});
