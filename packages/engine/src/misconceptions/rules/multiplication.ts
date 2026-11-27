// K02 multiplication rules (03 §7.2). They read the product an item asks for:
// - mul.groups items whose total is asked (`unknown: total`): v = groups × perGroup (slice 3a);
// - mul.facts and mul.tens items of two factors that ask the product (slice 3b): v = a × b, the
//   last asked value (a strategy sentence asks its steps first, and every step must be right).
//   Turn-around items (the answer is a factor) and three-factor items are not read.
// Rules:
// - MC.add-instead-of-multiply (addInsteadOfMultiply): 4 × 3 → 7, r = a + b (7 × 1 → 8 is this
//   too). Items where that equals v (2 × 2) cannot discriminate.
// - MC.skip-count-slip (skipCountSlip): one group too few or too many, r ∈ {v ± a, v ± b} \ {v},
//   r > 0 (an add-a-group item that forgets the extra group: 6 × 7 → 35); predict is v − b.
// - MC.times-zero-keeps (timesZeroKeeps): 7 × 0 → 7, r = the other factor on a fact with a 0.
// - MC.double-once (doubleOnce): stops doubling too soon on a mul.facts fact with a factor 4 or
//   8: 4 × 7 → 14 (r = v ÷ 2); when the 8 is doubled, 8 × 6 → 12 or 24 (r = v ÷ 4 or v ÷ 2).
// - MC.tens-dropped (tensDropped): 4 × 30 → 12, r = a × (b ÷ 10) on mul.tens.
// - MC.partial-product-dropped (partialProductDropped): 7 × 6 as 5 × 6 + 2 × 6 → 30, r = one
//   partial product on a number-pad break-apart item; on a split array, one of the two parts the
//   child's own line makes (rows × split, rows × (cols − split)).
// Split arrays (array-build `split`) are read through their typed total (target.value).

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

interface Product {
  g: number;
  p: number;
  v: number;
  asked: number[];
}

/** The two factors and the product an item asks for (its last asked value), else null. */
function totalItem(item: GeneratedItem): Product | null {
  const ps = item.params;
  let g: number;
  let p: number;
  if (typeof ps.groups === 'number' && typeof ps.perGroup === 'number') {
    if ((ps.unknown ?? 'total') !== 'total') return null;
    g = ps.groups;
    p = ps.perGroup;
  } else if (typeof ps.a === 'number' && typeof ps.b === 'number') {
    if ((ps.form ?? 'fact') !== 'fact' || (typeof ps.c === 'number' && ps.c > 0)) return null;
    // ÷ and missing-factor sentences (slice 3c) ask a factor or quotient: rules/division.ts.
    if ((ps.op ?? '×') !== '×' || (ps.unknown ?? 'result') !== 'result') return null;
    g = ps.a;
    p = ps.b;
  } else return null;
  const v = g * p;
  const asked = askedNumbers(item);
  if (!asked || asked.at(-1) !== v) return null;
  return { g, p, v, asked };
}

/** The response with every step right and the product given as x. */
const withTotal = (item: GeneratedItem, t: Product, x: number): ResponseValue | null =>
  responseWith(item, [...t.asked.slice(0, -1), x]);

/** Whether r gives every step right and the product as one of `wrong`. */
const totalIs = (item: GeneratedItem, t: Product, r: ResponseValue, wrong: number[]) =>
  rewritesAsked(item, r, (v, given) => v === t.v && wrong.includes(given));

export const addInsteadOfMultiply: MisconceptionRule = {
  id: 'addInsteadOfMultiply',
  kind: 'answer',
  applies: (item) => totalItem(item) !== null,
  predict(item): ResponseValue | null {
    const t = totalItem(item);
    if (!t || t.g + t.p === t.v) return null;
    return withTotal(item, t, t.g + t.p);
  },
  match(item, r) {
    const t = totalItem(item);
    if (!t || t.g + t.p === t.v) return false;
    return totalIs(item, t, r, [t.g + t.p]);
  },
};

/** The totals one group too few or too many gives. */
function slips(t: Product): number[] {
  return [t.v - t.p, t.v + t.p, t.v - t.g, t.v + t.g].filter((x) => x > 0 && x !== t.v);
}

export const skipCountSlip: MisconceptionRule = {
  id: 'skipCountSlip',
  kind: 'answer',
  applies: (item) => totalItem(item) !== null,
  predict(item): ResponseValue | null {
    const t = totalItem(item);
    if (!t || t.v - t.p <= 0) return null;
    return withTotal(item, t, t.v - t.p);
  },
  match(item, r) {
    const t = totalItem(item);
    if (!t) return false;
    return totalIs(item, t, r, slips(t));
  },
};

/** A two-factor fact with a 0 and a non-zero factor: the non-zero factor. */
function zeroOther(item: GeneratedItem): { t: Product; other: number } | null {
  const t = totalItem(item);
  if (!t || item.params.a === undefined || t.v !== 0) return null;
  const other = t.g === 0 ? t.p : t.g;
  return other === 0 ? null : { t, other };
}

export const timesZeroKeeps: MisconceptionRule = {
  id: 'timesZeroKeeps',
  kind: 'answer',
  applies: (item) => zeroOther(item) !== null,
  predict(item) {
    const z = zeroOther(item);
    return z ? withTotal(item, z.t, z.other) : null;
  },
  match(item, r) {
    const z = zeroOther(item);
    return z !== null && totalIs(item, z.t, r, [z.other]);
  },
};

/**
 * A mul.facts item with a factor 4 or 8 and a product above 0, with the totals of stopping
 * doubling too soon: v ÷ 2, and v ÷ 4 when the 8 is the factor doubled (8 × 4 doubles the 8's
 * partner as a × 4 would, so 4 × 8 counts as × 4).
 */
function doubled(item: GeneratedItem): { t: Product; short: number[] } | null {
  const t = totalItem(item);
  if (!t || item.params.a === undefined || item.params.steps !== undefined || t.v === 0) {
    return null;
  }
  const four = t.g === 4 || t.p === 4;
  const eight = t.g === 8 || t.p === 8;
  if (!four && !eight) return null;
  // The factor doubled is the generator's family factor (4 × 8 in family x8 doubles from 4 three
  // times, PR #131 R2); without a family, an 8 is doubled unless the other factor is 4.
  const family = item.params.family;
  const doubledFactor =
    family === 'x8' && eight ? 8 : family === 'x4' && four ? 4 : eight && !four ? 8 : 4;
  return { t, short: doubledFactor === 8 ? [t.v / 2, t.v / 4] : [t.v / 2] };
}

/** A split array must have its line in the middle before a too-short total says "double again". */
function splitInMiddle(item: GeneratedItem, r: ResponseValue): boolean {
  if (item.widget.format !== 'array-build' || item.answer.kind !== 'state') return true;
  const at = item.answer.target.splitAt;
  return typeof at !== 'number' || (r.kind === 'state' && r.value.split === at);
}

export const doubleOnce: MisconceptionRule = {
  id: 'doubleOnce',
  kind: 'answer',
  applies: (item) => doubled(item) !== null,
  predict(item) {
    const d = doubled(item);
    return d ? withTotal(item, d.t, d.t.v / 2) : null;
  },
  match(item, r) {
    const d = doubled(item);
    return d !== null && splitInMiddle(item, r) && totalIs(item, d.t, r, d.short);
  },
};

/** A mul.tens item (it has `steps`): the product with the zero dropped. */
function tens(item: GeneratedItem): { t: Product; dropped: number } | null {
  const t = totalItem(item);
  if (!t || typeof item.params.steps !== 'boolean' || t.p % 10 !== 0) return null;
  return { t, dropped: t.v / 10 };
}

export const tensDropped: MisconceptionRule = {
  id: 'tensDropped',
  kind: 'answer',
  applies: (item) => tens(item) !== null,
  predict(item) {
    const d = tens(item);
    return d ? withTotal(item, d.t, d.dropped) : null;
  },
  match(item, r) {
    const d = tens(item);
    return d !== null && totalIs(item, d.t, r, [d.dropped]);
  },
};

/**
 * A break-apart item: its partial products other than the total. On a number pad they are the
 * first two asked values; on a split array they come from the line in `r` (or, to predict, the
 * line after 5 columns the worked solution draws).
 */
function partials(item: GeneratedItem, r?: ResponseValue): { t: Product; parts: number[] } | null {
  const t = totalItem(item);
  if (!t || item.params.strategy !== 'break-apart') return null;
  let parts: number[];
  if (item.widget.format === 'array-build' && item.answer.kind === 'state') {
    const rows = Number(item.answer.target.rows);
    const cols = Number(item.answer.target.cols);
    const line = r?.kind === 'state' ? Number(r.value.split) : Math.min(5, cols - 1);
    if (!Number.isInteger(line) || line < 1 || line >= cols) return null;
    parts = [rows * line, rows * (cols - line)];
  } else if (t.asked.length === 3) {
    parts = [t.asked[0] as number, t.asked[1] as number];
  } else return null;
  parts = parts.filter((x) => x !== t.v);
  return parts.length > 0 ? { t, parts } : null;
}

export const partialProductDropped: MisconceptionRule = {
  id: 'partialProductDropped',
  kind: 'answer',
  applies: (item) => partials(item) !== null,
  predict(item) {
    const p = partials(item);
    return p ? withTotal(item, p.t, p.parts[0] as number) : null;
  },
  match(item, r) {
    const p = partials(item, r);
    return p !== null && totalIs(item, p.t, r, p.parts);
  },
};
