// Column bugs of multi-digit addition and subtraction (03 §7.2), answer rules on `a op b = ?`
// items (result unknown) that regroup:
//   MC.forgot-to-regroup-add  47 + 38 → 75: each column's sum mod 10, the carried ten dropped
//   MC.smaller-from-larger    52 − 27 → 35: each column takes the smaller digit from the larger
//   MC.borrow-no-decrement    53 − 27 → 36: a short column takes ten more, the next column is not
//                             reduced
//   MC.borrow-across-zero     403 − 127 → 376: borrowing from a zero turns it into 9, and the column
//                             past the zero is not reduced (K02 slice 2b)
// Each applies only with a carry (addition) or a borrow (subtraction), where the buggy answer
// differs from the right one; elsewhere predict is null and nothing matches.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';
import { askedNumbers, responseWith, rewritesAsked } from './asked';

/** The digits of n, ones first. */
function digitsOf(n: number): number[] {
  const out: number[] = [];
  let v = n;
  do {
    out.push(v % 10);
    v = Math.floor(v / 10);
  } while (v > 0);
  return out;
}

type ColumnBug = (a: number[], b: number[]) => number;

/** Builds a number from one digit a column, ones first. */
const fromColumns = (cols: number[]): number => cols.reduce((n, d, k) => n + d * 10 ** k, 0);

const columns = (a: number[], b: number[], f: (x: number, y: number) => number): number =>
  fromColumns(
    Array.from({ length: Math.max(a.length, b.length) }, (_, k) => f(a[k] ?? 0, b[k] ?? 0)),
  );

const BUGS: Record<string, { op: '+' | '-'; bug: ColumnBug }> = {
  forgotToRegroupAdd: { op: '+', bug: (a, b) => columns(a, b, (x, y) => (x + y) % 10) },
  smallerFromLarger: { op: '-', bug: (a, b) => columns(a, b, (x, y) => Math.abs(x - y)) },
  borrowNoDecrement: {
    op: '-',
    bug: (a, b) => columns(a, b, (x, y) => (x < y ? x + 10 - y : x - y)),
  },
  borrowAcrossZero: {
    op: '-',
    bug: (a, b) => {
      // The column algorithm, except that a zero lent from becomes 9 and borrows from no one.
      const c = [...a];
      const out: number[] = [];
      for (let k = 0; k < c.length; k += 1) {
        let x = c[k] as number;
        const y = b[k] ?? 0;
        if (x < y) {
          x += 10;
          if (c[k + 1] === 0) c[k + 1] = 9;
          else if (c[k + 1] !== undefined) c[k + 1] = (c[k + 1] as number) - 1;
        }
        out.push(x - y);
      }
      return fromColumns(out);
    },
  },
};

/** The right answer and the buggy one, or null when the rule does not apply to the item. */
export function columnBug(id: string, item: GeneratedItem): { v: number; r: number } | null {
  const spec = BUGS[id];
  const { a, b, op } = item.params;
  if (!spec || typeof a !== 'number' || typeof b !== 'number' || op !== spec.op) return null;
  if ((item.params.unknown ?? 'result') !== 'result' || a < 0 || b < 0) return null;
  if (op === '-' && a < b) return null;
  // MDA.04 adds `c` (and `d`): the dropped carries are read over every addend's column.
  const n = typeof item.params.addends === 'number' ? item.params.addends : 2;
  const more = [item.params.c, item.params.d].slice(0, Math.max(0, n - 2));
  if (more.some((x) => typeof x !== 'number' || x < 0)) return null;
  if (op === '-' && more.length > 0) return null;
  const nums = [a, b, ...(more as number[])];
  const v = op === '+' ? nums.reduce((s, x) => s + x, 0) : a - b;
  const ds = nums.map(digitsOf);
  const width = Math.max(...ds.map((d) => d.length));
  const r =
    op === '+'
      ? fromColumns(
          Array.from({ length: width }, (_, k) => ds.reduce((s, d) => s + (d[k] ?? 0), 0) % 10),
        )
      : spec.bug(digitsOf(a), digitsOf(b));
  return r === v ? null : { v, r };
}

function columnRule(id: string): MisconceptionRule {
  return {
    id,
    kind: 'answer',
    predict(item: GeneratedItem): ResponseValue | null {
      const w = columnBug(id, item);
      const values = askedNumbers(item);
      if (!w || values?.length !== 1 || values[0] !== w.v) return null;
      return responseWith(item, [w.r]);
    },
    match(item, r) {
      const w = columnBug(id, item);
      if (!w) return false;
      return rewritesAsked(item, r, (v, g) => v === w.v && g === w.r);
    },
  };
}

export const forgotToRegroupAdd = columnRule('forgotToRegroupAdd');
export const smallerFromLarger = columnRule('smallerFromLarger');
export const borrowNoDecrement = columnRule('borrowNoDecrement');
export const borrowAcrossZero = columnRule('borrowAcrossZero');
