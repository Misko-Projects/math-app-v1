// mda.addsub (03 §5.6): multi-digit addition and subtraction, a op b = result (or a op ? = result,
// `unknown: change`, on the number pad). K01 (#11) builds six formats for MDA.01, MDA.02, MDA.08
// and MDA.09; balance and number-bond come with the K02 skills that use them.
//
//   number-pad        the equation (a base-ten picture of a on the base-ten/bundles representation)
//   base-ten-build    a is prebuilt; put in (or take away) b's pieces: baseten.value { result }.
//                     Only items with no carry or borrow (they build by adding or removing pieces)
//   base-ten-trade    `compute` on the place-value mat, trading when a column overflows or runs
//                     out, then type the result: trade.result { result, value, regroupTarget },
//                     the result's canonical columns, so the carry or borrow must be made
//   number-line-jump  the open line from a: hops of 1–10 in the item's direction land on result,
//                     then the landing is typed: jumps.reach { start, target, allowedJumps, value }
//   expanded-form     `to-standard`: the tens and the ones grouped, (40 + 30) + (7 + 2) = ?
//   hundred-chart     `move` from a: one row per ten of b, then b's ones along the row
//
// `strategy` shapes the number-line solution: tens-ones (and none) hops ten per ten of b, then the
// ones in one hop; next-ten hops to the next ten (the previous one, subtracting) first, then the
// rest. The checker takes any path of allowed hops. Feature values depend on the params only.
//
// K02 (#17): `strategy: count-up` (subtraction only, MDA.14) counts up from b to a; on the open
// line the child jumps from b to a and types the total jump (goal `difference`). A change unknown
// on the open line (MDA.22) is the same kind of item: a + ? = result jumps from a up to result,
// a − ? = result from result up to a, and the total jump is the missing number.
// `addends` 3 or 4 (MDA.04) adds `c` (and `d`) too: the number pad shows a + b + c (+ d) = ?, and
// expanded-form groups three addends' tens and ones, (40 + 30 + 20) + (7 + 2 + 5) = ? (four do not
// fit its 17 tokens). Several addends only add, ask the result, and use those two formats.
// K02 slice 2b (#17): `strategy: algorithm` (MDA.07, MDA.21, MDA.18) plays base-ten-trade with the
// column algorithm written beside the mat (`showAlgorithm`, the place-value chart). Derived
// `acrossZeros` counts the zero digits of a that a borrow passes through (403 − 127: 1), for
// MDA.18, and `zeroTens` draws such minuends (403, 400). A three-digit sum on expanded-form lists the places in order without brackets,
// 300 + 200 + 40 + 30 + 7 + 2 = ? (the bracketed form needs 19 tokens; the format takes 17), and
// the number pad's worked solution goes place by place from the ones.

import type {
  ExpressionToken,
  LessonStep,
  ParamValues,
  ResponseValue,
  StimulusSpec,
} from '@number-island/shared';
import type { Column, Hto } from '../../formats/place-value';
import { digitCount } from '../../formats/types';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import { chartFor } from '../count/sequence';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

export const MDA_STRATEGIES = ['none', 'tens-ones', 'next-ten', 'count-up', 'algorithm'] as const;
/** The most numbers one item adds (MDA.04: up to four two-digit numbers). */
export const MDA_ADDENDS_MAX = 4;
type Strategy = (typeof MDA_STRATEGIES)[number];

/** The digits of n, ones first (0 → [0]). */
function digits(n: number): number[] {
  const out: number[] = [];
  let v = Math.max(0, Math.trunc(n));
  do {
    out.push(v % 10);
    v = Math.floor(v / 10);
  } while (v > 0);
  return out;
}

/** Columns that carry in a + b (+ more addends) with the standard algorithm. */
export function carriesOf(a: number, b: number, ...more: number[]): number {
  const ds = [a, b, ...more].map(digits);
  const width = Math.max(...ds.map((d) => d.length));
  let carry = 0;
  let count = 0;
  for (let k = 0; k < width || carry > 0; k += 1) {
    const s = ds.reduce((sum, d) => sum + (d[k] ?? 0), carry);
    carry = Math.floor(s / 10);
    if (k < width && carry > 0) count += 1;
  }
  return count;
}

/** Column borrows of a − b (a ≥ b) with the standard algorithm. */
export function borrowsOf(a: number, b: number): number {
  const da = digits(a);
  const db = digits(b);
  let borrow = 0;
  let count = 0;
  for (let k = 0; k < da.length; k += 1) {
    const d = (da[k] ?? 0) - borrow - (db[k] ?? 0);
    borrow = d < 0 ? 1 : 0;
    count += borrow;
  }
  return count;
}

/**
 * Zero digits of a that a borrow of a − b passes through with the standard algorithm: the column
 * lends to the one on its right, has nothing, and borrows in turn (403 − 127 and 400 − 168: 1).
 */
export function acrossZerosOf(a: number, b: number): number {
  const da = digits(a);
  const db = digits(b);
  let borrow = 0;
  let count = 0;
  for (let k = 0; k < da.length; k += 1) {
    if (borrow > 0 && da[k] === 0) count += 1;
    const d = (da[k] ?? 0) - borrow - (db[k] ?? 0);
    borrow = d < 0 ? 1 : 0;
  }
  return count;
}

/** A zero digit below the leading digit (40, 305). */
const hasZeroBelowLead = (n: number): boolean => digits(n).slice(0, -1).includes(0);
/** A zero digit strictly between the leading digit and the ones (305). */
const hasInternalZero = (n: number): boolean => {
  const d = digits(n);
  return d.length > 2 && d.slice(1, -1).includes(0);
};

const hto = (n: number): Hto => ({
  hundreds: Math.floor(n / 100),
  tens: Math.floor(n / 10) % 10,
  ones: n % 10,
});

const plusOf = (p: ParamValues): boolean => asStr(p.op, '+') !== '-';
/** The addends after a and b: c, then d (`addends` 3 or 4, MDA.04). */
export const moreAddends = (p: ParamValues): number[] =>
  [asNum(p.c), asNum(p.d)].slice(0, Math.max(0, asNum(p.addends, 2) - 2));
const resultOf = (p: ParamValues): number =>
  plusOf(p)
    ? moreAddends(p).reduce((sum, x) => sum + x, asNum(p.a) + asNum(p.b))
    : asNum(p.a) - asNum(p.b);

/** Free hops of 1–10 in one direction (the open number line, as addsub.facts). */
const freeJumps = (dir: 1 | -1): number[] => Array.from({ length: 10 }, (_, i) => dir * (i + 1));

/** The hops a number-line solution takes from a, per strategy (all within 1–10). */
export function jumpPath(a: number, b: number, plus: boolean, strategy: Strategy): number[] {
  const dir = plus ? 1 : -1;
  const hops: number[] = [];
  let rest = b;
  if (strategy === 'next-ten') {
    const a0 = a % 10;
    const gap = plus ? (a0 === 0 ? 0 : 10 - a0) : a0;
    if (gap > 0 && gap <= rest) {
      hops.push(dir * gap);
      rest -= gap;
    }
  }
  for (let t = Math.floor(rest / 10); t > 0; t -= 1) hops.push(dir * 10);
  if (rest % 10 > 0) hops.push(dir * (rest % 10));
  return hops;
}

/**
 * The next-ten split of a ± b (37 + 5: gap 3 to 40, rest 2; 42 − 5: gap 2 to 40, rest 3), or null
 * when a is a ten already or b does not reach the ten. rest 0 is an exact landing (37 + 3).
 */
export function nextTenSplit(
  a: number,
  b: number,
  plus: boolean,
): { gap: number; ten: number; rest: number } | null {
  const a0 = a % 10;
  if (a0 === 0) return null;
  const gap = plus ? 10 - a0 : a0;
  if (gap > b) return null;
  return { gap, ten: plus ? a + gap : a - gap, rest: b - gap };
}

/**
 * A difference item on the open line (count-up subtraction, or a change unknown): the child jumps
 * up from `from` to `to` and types the total jump, `value`. Null for a landing item.
 */
export function differenceLine(p: ParamValues): { from: number; to: number; value: number } | null {
  const a = asNum(p.a);
  const b = asNum(p.b);
  const plus = plusOf(p);
  const result = resultOf(p);
  if (asStr(p.unknown, 'result') === 'change') {
    return plus ? { from: a, to: result, value: b } : { from: result, to: a, value: b };
  }
  if (!plus && asStr(p.strategy, 'none') === 'count-up') return { from: b, to: a, value: result };
  return null;
}

/** The row of a cell on a hundred chart that starts at `first`. */
const chartRow = (x: number, first: number): number => Math.floor((x - first) / 10);

/** The hundred-chart moves: one row per ten of b, then b's ones along the row. */
export function chartMoves(b: number, plus: boolean): ('up' | 'down' | 'left' | 'right')[] {
  const rows = Math.floor(b / 10);
  const ones = b % 10;
  return [
    ...new Array<'up' | 'down'>(rows).fill(plus ? 'down' : 'up'),
    ...new Array<'left' | 'right'>(ones).fill(plus ? 'right' : 'left'),
  ];
}

/** Math features: a function of the params only. */
export function mdaFeatures(p: ParamValues): Record<string, number> {
  const a = asNum(p.a);
  const b = asNum(p.b);
  const plus = plusOf(p);
  const more = moreAddends(p);
  const carries = plus ? carriesOf(a, b, ...more) : 0;
  const borrows = plus ? 0 : borrowsOf(a, b);
  const ones = more.reduce((sum, x) => sum + (x % 10), (a % 10) + (b % 10));
  return {
    digits: Math.max(0, digitCount(Math.max(a, b)) - 2),
    regroups: carries + borrows,
    'zero.minuend': !plus && hasInternalZero(a) && borrows > 0 ? 1 : 0,
    sub: plus ? 0 : 1,
    'unknown.change': asStr(p.unknown, 'result') === 'change' ? 1 : 0,
    'addends.extra': Math.max(0, asNum(p.addends, 2) - 2),
    crossDecade: plus ? (ones >= 10 ? 1 : 0) : a % 10 < b % 10 ? 1 : 0,
    // How much of b moves (K01): tens past the first, ones past four, and both places at once.
    'tens.moved': Math.max(0, (Math.floor(b / 10) % 10) - 1) / 4,
    'ones.moved': Math.max(0, (b % 10) - 4) / 5,
    bothPlaces: b % 10 > 0 && Math.floor(b / 10) % 10 > 0 ? 1 : 0,
  };
}

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const basePicture = (n: number): StimulusSpec => ({ kind: 'base-ten', ...hto(n) });

/**
 * (40 + 30) + (7 + 2): the tens and the ones grouped, a zero term dropped. A two-digit subtraction
 * with a borrow shows the traded ten (K02, MDA.12): 52 − 27 is (40 − 20) + (12 − 7).
 */
export function groupedTokens(
  a: number,
  b: number,
  plus: boolean,
  more: number[] = [],
): ExpressionToken[] {
  const op: ExpressionToken = { t: 'op', v: plus ? '+' : '-' };
  if (plus && Math.max(a, b, ...more) >= 100) {
    // Three-digit sums: every hundred, then every ten, then every one, a zero term dropped.
    const nums = [a, b, ...more];
    const terms = [100, 10, 1]
      .flatMap((u) => nums.map((x) => (Math.floor(x / u) % 10) * u))
      .filter((v) => v > 0);
    return [
      ...terms.flatMap((v, i): ExpressionToken[] =>
        i === 0 ? [{ t: 'num', v }] : [op, { t: 'num', v }],
      ),
      { t: 'rel', v: '=' },
      { t: 'blank', id: 'x' },
    ];
  }
  const group = (x: number, ys: number[]): ExpressionToken[] => {
    // Subtracting, the first term always stays (40 − 0 is 40, not − 0).
    const terms = plus ? [x, ...ys].filter((v) => v > 0) : [x, ...ys.filter((v) => v > 0)];
    if (terms.length === 0) return [];
    if (terms.length === 1) return [{ t: 'num', v: terms[0] as number }];
    return [
      { t: 'paren', v: '(' },
      { t: 'num', v: terms[0] as number },
      ...terms.slice(1).flatMap((v): ExpressionToken[] => [op, { t: 'num', v }]),
      { t: 'paren', v: ')' },
    ];
  };
  const trade = !plus && a % 10 < b % 10 ? 10 : 0;
  const rest = [b, ...more];
  const tens = group(
    a - (a % 10) - trade,
    rest.map((x) => x - (x % 10)),
  );
  const ones = group(
    (a % 10) + trade,
    rest.map((x) => x % 10),
  );
  const parts = [tens, ones].filter(
    (g) => g.length > 0 && !(g.length === 1 && g[0]?.t === 'num' && g[0].v === 0),
  );
  const out: ExpressionToken[] = [];
  parts.forEach((g, i) => {
    if (i > 0) out.push({ t: 'op', v: '+' });
    out.push(...g);
  });
  return [...out, { t: 'rel', v: '=' }, { t: 'blank', id: 'x' }];
}

export const mdaAddSub: GeneratorDef = {
  id: 'mda.addsub',
  formats: [
    'number-pad',
    'base-ten-build',
    'base-ten-trade',
    'number-line-jump',
    'expanded-form',
    'hundred-chart',
  ],
  params: {
    a: { type: 'int', default: { kind: 'int', min: 10, max: 89 }, doc: 'the first number' },
    b: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 9 },
      doc: 'the number added or taken away',
    },
    op: {
      type: 'string',
      values: ['+', '-'],
      default: { kind: 'const', value: '+' },
      doc: '+ or -',
    },
    digitsA: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: '0: off; otherwise a has exactly this many digits',
    },
    digitsB: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: '0: off; otherwise b has exactly this many digits',
    },
    regroups: {
      type: 'int',
      default: { kind: 'const', value: -1 },
      doc: '−1: any; otherwise exactly this many carries (+) or borrows (−)',
    },
    checkByAdding: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'true: a subtraction on the number pad whose worked solution ends with the addition check, result + b = a (MDA.16)',
    },
    zeroTens: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: "true: a three-digit a has no tens (sampling sets a's tens digit to 0), for borrows across a zero (MDA.18)",
    },
    zeroInMinuend: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'true: subtraction whose a has a zero digit below its leading digit (40, 305)',
    },
    unknown: {
      type: 'string',
      values: ['result', 'change'],
      default: { kind: 'const', value: 'result' },
      doc: 'result, or change (a op ? = result, number-pad and the open line)',
    },
    strategy: {
      type: 'string',
      values: [...MDA_STRATEGIES],
      default: { kind: 'const', value: 'none' },
      doc: 'number-line solution: tens-ones (and none) hops tens then the ones; next-ten hops to the next ten first; count-up (−) jumps from b up to a; algorithm writes the column algorithm beside the trade mat',
    },
    addends: {
      type: 'int',
      default: { kind: 'const', value: 2 },
      doc: 'numbers added: 2, or 3–4 (MDA.04: number-pad, and expanded-form with 3)',
    },
    c: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'the third addend (addends ≥ 3)',
    },
    d: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'the fourth addend (addends 4)',
    },
  },
  derived: ['result', 'carries', 'borrows', 'acrossZeros'],
  features: {
    digits: { weight: 0.5, doc: 'digits of the larger number − 2 (two-digit work is 0)' },
    regroups: { weight: 0.7, doc: 'carries (+) or borrows (−) in the column algorithm' },
    'zero.minuend': {
      weight: 0.8,
      doc: 'subtracting from a number with an internal zero, with a borrow',
    },
    sub: { weight: 0.3, doc: 'subtraction' },
    'unknown.change': { weight: 0.6, doc: 'the missing number is the change (a + ? = c)' },
    'addends.extra': { weight: 0.4, doc: 'addends − 2' },
    crossDecade: { weight: 0.4, doc: 'the ones cross a ten (37 + 5; 42 − 5)' },
    'tens.moved': {
      weight: 0.3,
      doc: "b's tens past the first, / 4 (adding 50 is more counting than adding 10)",
    },
    'ones.moved': { weight: 0.4, doc: "b's ones past four, / 5 (counted on, not seen)" },
    bothPlaces: { weight: 0.3, doc: 'b has tens and ones, so both places change' },
  },
  narration: [
    'gen.mda.addsub.start',
    'gen.mda.addsub.add-tens',
    'gen.mda.addsub.add-ones',
    'gen.mda.addsub.take-tens',
    'gen.mda.addsub.take-ones',
    'gen.mda.addsub.add-hundreds',
    'gen.mda.addsub.take-hundreds',
    'gen.mda.addsub.join-ones',
    'gen.mda.addsub.join-tens',
    'gen.mda.addsub.join-hundreds',
    'gen.mda.addsub.trade-ones',
    'gen.mda.addsub.trade-tens',
    'gen.mda.addsub.split-ten',
    'gen.mda.addsub.split-hundred',
    'gen.mda.addsub.jump-ten',
    'gen.mda.addsub.jump-back-ten',
    'gen.mda.addsub.jump',
    'gen.mda.addsub.jump-back',
    'gen.mda.addsub.to-ten',
    'gen.mda.addsub.back-to-ten',
    'gen.mda.addsub.row-down',
    'gen.mda.addsub.row-up',
    'gen.mda.addsub.box-right',
    'gen.mda.addsub.box-left',
    'gen.mda.addsub.tens-then-ones',
    'gen.mda.addsub.take-tens-then-ones',
    'gen.mda.addsub.sum-tens',
    'gen.mda.addsub.sum-ones',
    'gen.mda.addsub.diff-tens',
    'gen.mda.addsub.diff-ones',
    'gen.mda.addsub.count-on',
    'gen.mda.addsub.count-back',
    'gen.mda.addsub.make-next-ten',
    'gen.mda.addsub.then-add-rest',
    'gen.mda.addsub.fills-next-ten',
    'gen.mda.addsub.take-to-ten',
    'gen.mda.addsub.then-take-rest',
    'gen.mda.addsub.back-to-the-ten',
    'gen.mda.addsub.is',
    'gen.mda.addsub.count-up',
    'gen.mda.addsub.jumped',
    'gen.mda.addsub.columns-add',
    'gen.mda.addsub.columns-take',
    'gen.mda.addsub.sum-hundreds',
    'gen.mda.addsub.check-add',
  ],
  sample(spec, rng) {
    const p = sampleAll(spec, rng);
    // MDA.18: an across-zero minuend is one draw in ten; zeroing the tens keeps sampling cheap.
    if (p.zeroTens === true && typeof p.a === 'number' && p.a >= 100)
      p.a -= (Math.floor(p.a / 10) % 10) * 10;
    return p;
  },
  derive(p): ParamValues {
    const a = asNum(p.a);
    const b = asNum(p.b);
    const plus = plusOf(p);
    return {
      result: resultOf(p),
      carries: plus ? carriesOf(a, b, ...moreAddends(p)) : 0,
      borrows: plus || a < b ? 0 : borrowsOf(a, b),
      acrossZeros: plus || a < b ? 0 : acrossZerosOf(a, b),
    };
  },
  accepts(p, t) {
    const a = asNum(p.a);
    const b = asNum(p.b);
    const plus = plusOf(p);
    const result = resultOf(p);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) return false;
    if (!plus && a < b) return false;
    if (result < 1 || result > 9999) return false;
    const digitsA = asNum(p.digitsA);
    const digitsB = asNum(p.digitsB);
    if (digitsA > 0 && digitCount(a) !== digitsA) return false;
    if (digitsB > 0 && digitCount(b) !== digitsB) return false;
    const n = asNum(p.addends, 2);
    if (!Number.isInteger(n) || n < 2 || n > MDA_ADDENDS_MAX) return false;
    const more = moreAddends(p);
    if (n > 2) {
      // Several addends: add, ask the result, on the pad (or expanded-form with three).
      if (!plus || asStr(p.unknown, 'result') !== 'result') return false;
      if (more.some((x) => !Number.isInteger(x) || x < 1 || x > 99)) return false;
      if (asStr(p.strategy, 'none') !== 'none') return false;
      if (t.format !== 'number-pad' && !(t.format === 'expanded-form' && n === 3)) return false;
    }
    const carries = plus ? carriesOf(a, b, ...more) : 0;
    const borrows = plus ? 0 : borrowsOf(a, b);
    const regroups = asNum(p.regroups, -1);
    if (regroups >= 0 && carries + borrows !== regroups) return false;
    if (p.zeroInMinuend === true && (plus || !hasZeroBelowLead(a))) return false;
    if (p.checkByAdding === true && (plus || t.format !== 'number-pad')) return false;
    if (p.zeroTens === true && (a < 100 || Math.floor(a / 10) % 10 !== 0)) return false;
    const change = asStr(p.unknown, 'result') === 'change';
    if (change && t.format !== 'number-pad' && t.format !== 'number-line-jump') return false;
    // Counting up from b to a subtracts; it asks for the result.
    if (asStr(p.strategy, 'none') === 'count-up' && (plus || change)) return false;
    // The column algorithm is written beside the trade mat only.
    if (asStr(p.strategy, 'none') === 'algorithm' && t.format !== 'base-ten-trade') return false;
    const diff = differenceLine(p);
    if (t.format === 'number-line-jump' && diff && diff.from >= diff.to) return false;
    switch (t.format) {
      case 'base-ten-build':
        // Built by putting in or taking away b's pieces: no trade.
        return carries + borrows === 0;
      case 'base-ten-trade':
        return a <= 999 && b <= 999 && result <= 999;
      case 'expanded-form':
        // A borrow is shown as the traded ten, for two-digit numbers only.
        return plus || borrows === 0 || (a <= 99 && borrows === 1);
      case 'hundred-chart': {
        const mid = plus ? a + (b - (b % 10)) : a - (b - (b % 10));
        const chart = chartFor(Math.min(a, mid, result), Math.max(a, mid, result));
        if (!chart || chart.first === 0) return false;
        return chartRow(mid, chart.first) === chartRow(result, chart.first);
      }
      default:
        return true;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    const a = asNum(params.a);
    const b = asNum(params.b);
    const plus = plusOf(params);
    const result = resultOf(params);
    if (!plus && a < b) throw new RangeError('mda.addsub: a − b is below 0');
    const change = asStr(params.unknown, 'result') === 'change';
    const math = mdaFeatures(params);
    const bh = hto(b);
    const more = moreAddends(params);
    const vars = pickVars(t, {
      a,
      b,
      ...(more.length > 0 ? { c: more[0] as number } : {}),
      ...(more.length > 1 ? { d: more[1] as number } : {}),
      tens: Math.floor(b / 10),
      ones: b % 10,
      ...(change ? { result } : {}),
    });
    const opToken: ExpressionToken = { t: 'op', v: plus ? '+' : '-' };
    let p: PartialOutput;
    switch (t.format) {
      case 'number-pad': {
        const tokens: ExpressionToken[] = change
          ? [
              { t: 'num', v: a },
              opToken,
              { t: 'blank', id: 'x' },
              { t: 'rel', v: '=' },
              { t: 'num', v: result },
            ]
          : [
              { t: 'num', v: a },
              ...[b, ...more].flatMap((x): ExpressionToken[] => [opToken, { t: 'num', v: x }]),
              { t: 'rel', v: '=' },
              { t: 'blank', id: 'x' },
            ];
        const picture = t.representation === 'base-ten' || t.representation === 'bundles';
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: picture ? basePicture(a) : { kind: 'none' },
            expression: { tokens },
            blanks: [{ id: 'x', maxDigits: digitCount(Math.max(a, result)) + 1 }],
            unit: null,
          },
          answer: { kind: 'number', value: change ? b : result },
          overlay: basePicture(a),
        };
        break;
      }
      case 'base-ten-build': {
        const big = Math.max(a, result);
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'base-ten-build',
            target: result,
            mode: 'build',
            pieces: { thousands: big >= 1000, hundreds: big >= 100, tens: true, ones: true },
            wholeIs: 'unit',
            prebuilt: {
              ...(a >= 1000 ? { thousands: Math.floor(a / 1000) } : {}),
              hundreds: Math.floor(a / 100) % 10,
              tens: Math.floor(a / 10) % 10,
              ones: a % 10,
            },
          },
          answer: { kind: 'state', checker: 'baseten.value', target: { value: result } },
        };
        break;
      }
      case 'base-ten-trade':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'base-ten-trade',
            start: hto(a),
            operation: { op: plus ? '+' : '-', operand: bh },
            goal: 'compute',
            showAlgorithm: asStr(params.strategy, 'none') === 'algorithm',
            thenAsk: true,
          },
          // The mat must end canonical (PR #83 review): a carry or borrow shows in the checked
          // state, so 3 tens 12 ones with 42 typed is not 37 + 5 until ten ones are bundled.
          answer: {
            kind: 'state',
            checker: 'trade.result',
            target: { result, value: result, regroupTarget: hto(result) },
          },
        };
        break;
      case 'number-line-jump': {
        // A difference item jumps up from `from` to `to` and asks the total jump (K02).
        const diff = differenceLine(params);
        const dir: 1 | -1 = diff || plus ? 1 : -1;
        const allowedJumps = freeJumps(dir);
        const start = diff ? diff.from : a;
        const target = diff ? diff.to : result;
        const value = diff ? diff.value : result;
        const lo = Math.min(start, target);
        const hi = Math.max(start, target);
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-line-jump',
            min: Math.max(0, Math.floor(lo / 10) * 10 - 10),
            max: Math.ceil(hi / 10) * 10 + 10,
            ticksEvery: null,
            labelsEvery: null,
            start,
            goal: diff ? 'difference' : plus ? 'add' : 'subtract',
            target,
            allowedJumps,
            path: 'open',
            thenAsk: diff ? 'total-jump' : 'landing',
          },
          answer: {
            kind: 'state',
            checker: 'jumps.reach',
            target: { start, target, allowedJumps, value },
          },
          nudge: [{ op: 'highlight', args: { at: start } }],
          highlight: [{ op: 'highlight', args: { at: start } }],
        };
        break;
      }
      case 'expanded-form':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'expanded-form',
            target: result,
            mode: 'to-standard',
            expression: { tokens: groupedTokens(a, b, plus, more) },
            unusualOrder: false,
          },
          answer: { kind: 'number', value: result },
          overlay: basePicture(a),
        };
        break;
      case 'hundred-chart': {
        const mid = plus ? a + (b - (b % 10)) : a - (b - (b % 10));
        const chart = chartFor(Math.min(a, mid, result), Math.max(a, mid, result));
        if (!chart) throw new RangeError('mda.addsub: the moves do not fit one hundred chart');
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'hundred-chart',
            ...chart,
            hidden: [],
            mode: 'move',
            from: a,
            moves: chartMoves(b, plus),
          },
          answer: { kind: 'number', value: result },
          nudge: [{ op: 'highlight-row', args: { n: a } }],
        };
        break;
      }
      default:
        throw new Error(`mda.addsub cannot build ${t.format}`);
    }
    return finish(mdaAddSub, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    const p = out.params;
    const a = asNum(p.a);
    const b = asNum(p.b);
    const plus = plusOf(p);
    const result = resultOf(p);
    const w = out.widget;
    switch (w.format) {
      case 'base-ten-build':
        return {
          kind: 'state',
          value: {
            thousands: Math.floor(result / 1000),
            hundreds: Math.floor(result / 100) % 10,
            tens: Math.floor(result / 10) % 10,
            ones: result % 10,
          },
        };
      case 'base-ten-trade':
        return { kind: 'state', value: { ...hto(result), value: result } };
      case 'number-line-jump': {
        const diff = differenceLine(p);
        if (diff) {
          const hops = jumpPath(diff.from, diff.to - diff.from, true, 'next-ten');
          return { kind: 'state', value: { jumps: hops, value: diff.value } };
        }
        const strategy = asStr(p.strategy, 'none') as Strategy;
        return { kind: 'state', value: { jumps: jumpPath(a, b, plus, strategy), value: result } };
      }
      default:
        throw new Error(`mda.addsub: no example for ${w.format}`);
    }
  },
  solution(out): LessonStep[] {
    const p = out.params;
    const w = out.widget;
    const a = asNum(p.a);
    const b = asNum(p.b);
    const plus = plusOf(p);
    const result = resultOf(p);
    const change = asStr(p.unknown, 'result') === 'change';
    const answer = change ? b : result;
    const final = (action: LessonStep['action']) => say('gen.mda.addsub.is', { v: answer }, action);
    const bt = Math.floor(b / 10) % 10;
    const bo = b % 10;
    switch (w.format) {
      case 'number-pad': {
        const strategy = asStr(p.strategy, 'none') as Strategy;
        const split = strategy === 'next-ten' && !change ? nextTenSplit(a, b, plus) : null;
        if (split) {
          // Make the next ten, then the rest (37 + 5: 37 and 3 make 40, then 2 more). Only the
          // last step names the answer: an exact landing (37 + 3) never names the ten it reaches.
          const mark = { op: 'highlight', args: { token: 'x' } } as const;
          const steps: LessonStep[] =
            split.rest > 0
              ? [
                  say(
                    plus ? 'gen.mda.addsub.make-next-ten' : 'gen.mda.addsub.take-to-ten',
                    { a, gap: split.gap, ten: split.ten },
                    mark,
                  ),
                  say(plus ? 'gen.mda.addsub.then-add-rest' : 'gen.mda.addsub.then-take-rest', {
                    ten: split.ten,
                    rest: split.rest,
                  }),
                ]
              : [
                  say(
                    plus ? 'gen.mda.addsub.fills-next-ten' : 'gen.mda.addsub.back-to-the-ten',
                    { a, b },
                    mark,
                  ),
                ];
          return [...steps, final({ op: 'type', args: { blank: 'x', value: answer } })];
        }
        const first = change
          ? say(plus ? 'gen.mda.addsub.count-on' : 'gen.mda.addsub.count-back', { a, result })
          : strategy === 'count-up'
            ? say('gen.mda.addsub.count-up', { a, b })
            : a >= 100
              ? say(plus ? 'gen.mda.addsub.columns-add' : 'gen.mda.addsub.columns-take', {})
              : say(
                  plus ? 'gen.mda.addsub.tens-then-ones' : 'gen.mda.addsub.take-tens-then-ones',
                  {},
                );
        // MDA.16: the answer is checked by adding it back (25 + 27 = 52).
        const check =
          p.checkByAdding === true && !plus && !change
            ? [say('gen.mda.addsub.check-add', { r: result, b, a })]
            : [];
        return [
          { ...first, action: { op: 'highlight', args: { token: 'x' } } },
          final({ op: 'type', args: { blank: 'x', value: answer } }),
          ...check,
        ];
      }
      case 'base-ten-build': {
        const steps: LessonStep[] = [say('gen.mda.addsub.start', { a })];
        const bh = Math.floor(b / 100);
        if (bh > 0) {
          steps.push(
            say(
              plus ? 'gen.mda.addsub.add-hundreds' : 'gen.mda.addsub.take-hundreds',
              { count: bh },
              {
                op: 'add-piece',
                args: { kind: 'hundreds', count: plus ? bh : -bh },
              },
            ),
          );
        }
        if (bt > 0) {
          steps.push(
            say(
              plus ? 'gen.mda.addsub.add-tens' : 'gen.mda.addsub.take-tens',
              { count: bt },
              {
                op: 'add-piece',
                args: { kind: 'tens', count: plus ? bt : -bt },
              },
            ),
          );
        }
        if (bo > 0) {
          steps.push(
            say(
              plus ? 'gen.mda.addsub.add-ones' : 'gen.mda.addsub.take-ones',
              { count: bo },
              {
                op: 'add-piece',
                args: { kind: 'ones', count: plus ? bo : -bo },
              },
            ),
          );
        }
        return [...steps, final({ op: 'count-by', args: { kind: 'ones' } })];
      }
      case 'base-ten-trade':
        return [...tradeSteps(a, b, plus), final({ op: 'answer', args: { value: result } })];
      case 'number-line-jump': {
        const diff = differenceLine(p);
        if (diff) {
          // Up from `from` to the next ten, by tens, then the ones; the total jump is the answer.
          const steps: LessonStep[] = [
            say(
              'gen.mda.addsub.start',
              { a: diff.from },
              { op: 'highlight', args: { at: diff.from } },
            ),
          ];
          const gap = diff.from % 10 === 0 ? 0 : 10 - (diff.from % 10);
          jumpPath(diff.from, diff.to - diff.from, true, 'next-ten').forEach((h, i) => {
            const key =
              i === 0 && gap > 0 && gap <= diff.to - diff.from
                ? 'gen.mda.addsub.to-ten'
                : h === 10
                  ? 'gen.mda.addsub.jump-ten'
                  : 'gen.mda.addsub.jump';
            steps.push(say(key, { count: h }, { op: 'hop', args: { by: h } }));
          });
          return [
            ...steps,
            say('gen.mda.addsub.jumped', { v: diff.value, to: diff.to }, { op: 'label-landing' }),
          ];
        }
        const strategy = asStr(p.strategy, 'none') as Strategy;
        const hops = jumpPath(a, b, plus, strategy);
        const gap = plus ? (a % 10 === 0 ? 0 : 10 - (a % 10)) : a % 10;
        const toTen = strategy === 'next-ten' && gap > 0 && gap <= b;
        const steps: LessonStep[] = [
          say('gen.mda.addsub.start', { a }, { op: 'highlight', args: { at: a } }),
        ];
        hops.forEach((h, i) => {
          const count = Math.abs(h);
          const key =
            i === 0 && toTen
              ? plus
                ? 'gen.mda.addsub.to-ten'
                : 'gen.mda.addsub.back-to-ten'
              : count === 10
                ? plus
                  ? 'gen.mda.addsub.jump-ten'
                  : 'gen.mda.addsub.jump-back-ten'
                : plus
                  ? 'gen.mda.addsub.jump'
                  : 'gen.mda.addsub.jump-back';
          steps.push(say(key, { count }, { op: 'hop', args: { by: h } }));
        });
        return [...steps, final({ op: 'label-landing' })];
      }
      case 'expanded-form':
        if (plus && a >= 100) {
          // Place by place, each line only for a place with a term on the card.
          const nums = [a, b, ...moreAddends(p)];
          const has = (u: number) => nums.some((x) => Math.floor(x / u) % 10 > 0);
          const lines: LessonStep[] = [
            say('gen.mda.addsub.sum-hundreds', {}, { op: 'stack-cards' }),
          ];
          if (has(10)) lines.push(say('gen.mda.addsub.sum-tens', {}));
          if (has(1)) lines.push(say('gen.mda.addsub.sum-ones', {}));
          return [...lines, final({ op: 'answer', args: { value: result } })];
        }
        return [
          say(
            plus ? 'gen.mda.addsub.sum-tens' : 'gen.mda.addsub.diff-tens',
            {},
            {
              op: 'stack-cards',
            },
          ),
          say(plus ? 'gen.mda.addsub.sum-ones' : 'gen.mda.addsub.diff-ones', {}),
          final({ op: 'answer', args: { value: result } }),
        ];
      case 'hundred-chart': {
        const steps: LessonStep[] = [
          say('gen.mda.addsub.start', { a }, { op: 'highlight-row', args: { n: a } }),
        ];
        // One slide per configured move (PR #83 review), as pv.tenmore: 34 + 3 slides right
        // three times, never one slide for all the ones.
        const line = {
          down: 'gen.mda.addsub.row-down',
          up: 'gen.mda.addsub.row-up',
          right: 'gen.mda.addsub.box-right',
          left: 'gen.mda.addsub.box-left',
        } as const;
        for (const dir of w.moves ?? [])
          steps.push(say(line[dir], {}, { op: 'slide', args: { dir } }));
        return [...steps, final({ op: 'tap', args: { n: result } })];
      }
      default:
        return [];
    }
  },
};

/**
 * The trades and moves on the place-value mat. Adding: put the ones together, trade ten ones for
 * a ten when they overflow, then the tens (trading ten tens for a hundred) and the hundreds.
 * Subtracting: when a column is short, trade one piece of the next column first (splitting a
 * hundred when the tens are empty), then take b's pieces column by column.
 */
function tradeSteps(a: number, b: number, plus: boolean): LessonStep[] {
  const steps: LessonStep[] = [];
  const mat = hto(a);
  const o = hto(b);
  if (plus) {
    const columns: [Column, Column | null][] = [
      ['ones', 'tens'],
      ['tens', 'hundreds'],
      ['hundreds', null],
    ];
    for (const [col, up] of columns) {
      if (o[col] === 0 && mat[col] < 10) continue;
      if (o[col] > 0) {
        mat[col] += o[col];
        steps.push(say(`gen.mda.addsub.join-${col}`, {}, { op: 'combine', args: { column: col } }));
      }
      if (up && mat[col] >= 10) {
        mat[col] -= 10;
        mat[up] += 1;
        steps.push(
          say(`gen.mda.addsub.trade-${col}`, {}, { op: 'trade', args: { from: col, to: up } }),
        );
      }
    }
    return steps;
  }
  const split = (from: 'hundreds' | 'tens', to: 'tens' | 'ones') => {
    mat[from] -= 1;
    mat[to] += 10;
    steps.push(
      say(
        from === 'tens' ? 'gen.mda.addsub.split-ten' : 'gen.mda.addsub.split-hundred',
        {},
        {
          op: 'trade',
          args: { from, to },
        },
      ),
    );
  };
  if (mat.ones < o.ones) {
    if (mat.tens === 0) split('hundreds', 'tens');
    split('tens', 'ones');
  }
  if (o.ones > 0) {
    mat.ones -= o.ones;
    steps.push(
      say(
        'gen.mda.addsub.take-ones',
        { count: o.ones },
        {
          op: 'take',
          args: { column: 'ones', count: o.ones },
        },
      ),
    );
  }
  if (mat.tens < o.tens) split('hundreds', 'tens');
  if (o.tens > 0) {
    mat.tens -= o.tens;
    steps.push(
      say(
        'gen.mda.addsub.take-tens',
        { count: o.tens },
        {
          op: 'take',
          args: { column: 'tens', count: o.tens },
        },
      ),
    );
  }
  if (o.hundreds > 0) {
    steps.push(
      say(
        'gen.mda.addsub.take-hundreds',
        { count: o.hundreds },
        {
          op: 'take',
          args: { column: 'hundreds', count: o.hundreds },
        },
      ),
    );
  }
  return steps;
}
