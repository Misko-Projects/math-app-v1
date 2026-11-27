// Fractions on the number line (03 §7.2, K02 slice 5b: frac.line items, FRA.04, FRA.10–12).
// - MC.fraction-line-ticks: counts tick marks instead of spaces. Placing a/b, the 0 tick is
//   counted as the first, so the dot lands one tick short, (a − 1)/b. Reading, the ticks of a
//   whole are counted as its parts, [a, b + 1], or the 0 tick is counted too, [a + 1, b].
// - MC.fraction-line-whole: on a line past 1, takes the whole line as the whole. Reading, the
//   bottom number counts every part on the line, [a, b·max]; placing, a/b of the line,
//   (a/b)·max (on the line only when a ≤ b).
// - MC.fraction-line-at-whole: puts a/b at the whole number a (a ≤ max), or a proper fraction
//   at 1 (counting b ticks from 0).
// - MC.fraction-over-one: thinks a fraction cannot be more than 1. Placing a/b > 1, stops in the
//   first whole at (a − b)/b; between, answers [0, 1].
// - MC.fraction-whole-count: takes b/b (or k·b/b) for the count of its parts: `wholes` answers
//   a; placing k·b/b, puts it at the whole number k·b when that is on the line (not where the
//   whole-line rule predicts the same point).
// Each predicts responses and never the right answer (`differs`), so no right answer is claimed.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';

const NEAR = 1e-6;

interface LineItem {
  mode: string;
  num: number;
  den: number;
  max: number;
  format: GeneratedItem['format'];
}

function lineItem(item: GeneratedItem): LineItem | null {
  if (item.params.mode === undefined || item.templateId === undefined) return null;
  const p = item.params;
  if (typeof p.num !== 'number' || typeof p.den !== 'number') return null;
  // Only frac.line items carry these modes with these formats.
  const w = item.widget;
  const mode = String(p.mode);
  const ok =
    (w.format === 'fraction-line' && (mode === 'place' || mode === 'read')) ||
    (w.format === 'fraction-pick' && mode === 'name' && w.stimulus?.kind === 'number-line') ||
    (w.format === 'number-pad' && (mode === 'between' || mode === 'wholes'));
  if (!ok) return null;
  const max = w.format === 'fraction-line' ? w.max : typeof p.max === 'number' ? p.max : 1;
  return { mode, num: p.num, den: p.den, max, format: w.format };
}

function same(a: ResponseValue, b: ResponseValue): boolean {
  if (a.kind === 'placement' && b.kind === 'placement') return Math.abs(a.value - b.value) < NEAR;
  if (a.kind === 'numbers' && b.kind === 'numbers') {
    return a.values.length === b.values.length && a.values.every((v, i) => v === b.values[i]);
  }
  if (a.kind === 'number' && b.kind === 'number') return a.value === b.value;
  return false;
}

/** The right response of an item, as the checker reads it. */
function right(item: GeneratedItem): ResponseValue | null {
  const a = item.answer;
  if (a.kind === 'placement') return { kind: 'placement', value: a.value };
  if (a.kind === 'numbers') return { kind: 'numbers', values: [...a.values] };
  if (a.kind === 'number') return { kind: 'number', value: a.value };
  return null;
}

const place = (value: number): ResponseValue => ({ kind: 'placement', value });
const numbers = (...values: number[]): ResponseValue => ({ kind: 'numbers', values });

function rule(id: string, predicts: (l: LineItem) => ResponseValue[]): MisconceptionRule {
  const list = (item: GeneratedItem): ResponseValue[] => {
    const l = lineItem(item);
    const r = right(item);
    if (!l || !r) return [];
    return predicts(l).filter((p) => {
      if (same(p, r)) return false;
      // A placement off the line cannot be made.
      return p.kind !== 'placement' || (p.value >= -NEAR && p.value <= l.max + NEAR);
    });
  };
  return {
    id,
    kind: 'answer',
    predict: (item) => list(item)[0] ?? null,
    match: (item, r) => list(item).some((p) => same(p, r)),
  };
}

export const fractionLineTicks = rule('fractionLineTicks', ({ mode, num, den }) => {
  if (mode === 'place') return [place((num - 1) / den)];
  if (mode === 'read' || mode === 'name') return [numbers(num, den + 1), numbers(num + 1, den)];
  return [];
});

export const fractionLineWhole = rule('fractionLineWhole', ({ mode, num, den, max }) => {
  if (max < 2) return [];
  if (mode === 'read') return [numbers(num, den * max)];
  if (mode === 'place') return [place((num / den) * max)];
  return [];
});

export const fractionLineAtWhole = rule('fractionLineAtWhole', ({ mode, num, den, max }) => {
  if (mode !== 'place') return [];
  const out: ResponseValue[] = [];
  if (num <= max && num % den !== 0) out.push(place(num));
  if (num < den) out.push(place(1));
  return out;
});

export const fractionOverOne = rule('fractionOverOne', ({ mode, num, den }) => {
  if (num <= den || num % den === 0) return [];
  if (mode === 'place') return [place((num % den) / den)];
  if (mode === 'between') return [numbers(0, 1)];
  return [];
});

export const fractionWholeCount = rule('fractionWholeCount', ({ mode, num, den, max }) => {
  if (num % den !== 0) return [];
  if (mode === 'wholes') return [{ kind: 'number', value: num }];
  // Where a/b of the whole line is the same point (max = den), the whole-line rule claims it.
  if (mode === 'place' && max !== den) return [place(num)];
  return [];
});
