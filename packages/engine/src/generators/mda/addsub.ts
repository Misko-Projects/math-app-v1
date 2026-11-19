// mda.addsub (03 §5.6): multi-digit addition and subtraction, a op b = result (or a op ? = result,
// `unknown: change`, on the number pad). K01 (#11) builds six formats for MDA.01, MDA.02, MDA.08
// and MDA.09; balance and number-bond come with the K02 skills that use them.
//
//   number-pad        the equation (a base-ten picture of a on the base-ten/bundles representation)
//   base-ten-build    a is prebuilt; put in (or take away) b's pieces: baseten.value { result }.
//                     Only items with no carry or borrow (they build by adding or removing pieces)
//   base-ten-trade    `compute` on the place-value mat, trading when a column overflows or runs
//                     out, then type the result: trade.result { result, value }
//   number-line-jump  the open line from a: hops of 1–10 in the item's direction land on result,
//                     then the landing is typed: jumps.reach { start, target, allowedJumps, value }
//   expanded-form     `to-standard`: the tens and the ones grouped, (40 + 30) + (7 + 2) = ?
//   hundred-chart     `move` from a: one row per ten of b, then b's ones along the row
//
// `strategy` shapes the number-line solution: tens-ones (and none) hops ten per ten of b, then the
// ones in one hop; next-ten hops to the next ten (the previous one, subtracting) first, then the
// rest. The checker takes any path of allowed hops. Feature values depend on the params only.

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

export const MDA_STRATEGIES = ['none', 'tens-ones', 'next-ten'] as const;
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

/** Column carries of a + b with the standard algorithm. */
export function carriesOf(a: number, b: number): number {
  const da = digits(a);
  const db = digits(b);
  let carry = 0;
  let count = 0;
  for (let k = 0; k < Math.max(da.length, db.length); k += 1) {
    const s = (da[k] ?? 0) + (db[k] ?? 0) + carry;
    carry = s >= 10 ? 1 : 0;
    count += carry;
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
const resultOf = (p: ParamValues): number =>
  plusOf(p) ? asNum(p.a) + asNum(p.b) : asNum(p.a) - asNum(p.b);

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
  const carries = plus ? carriesOf(a, b) : 0;
  const borrows = plus ? 0 : borrowsOf(a, b);
  return {
    digits: Math.max(0, digitCount(Math.max(a, b)) - 2),
    regroups: carries + borrows,
    'zero.minuend': !plus && hasInternalZero(a) && borrows > 0 ? 1 : 0,
    sub: plus ? 0 : 1,
    'unknown.change': asStr(p.unknown, 'result') === 'change' ? 1 : 0,
    'addends.extra': Math.max(0, asNum(p.addends, 2) - 2),
    crossDecade: plus ? ((a % 10) + (b % 10) >= 10 ? 1 : 0) : a % 10 < b % 10 ? 1 : 0,
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

/** (40 + 30) + (7 + 2): the tens and the ones grouped, a zero term dropped. */
export function groupedTokens(a: number, b: number, plus: boolean): ExpressionToken[] {
  const op: ExpressionToken = { t: 'op', v: plus ? '+' : '-' };
  const group = (x: number, y: number): ExpressionToken[] => {
    // Subtracting, the first term always stays (40 − 0 is 40, not − 0).
    const terms = plus ? [x, y].filter((v) => v > 0) : y > 0 ? [x, y] : [x];
    if (terms.length === 0) return [];
    if (terms.length === 1) return [{ t: 'num', v: terms[0] as number }];
    return [
      { t: 'paren', v: '(' },
      { t: 'num', v: terms[0] as number },
      op,
      { t: 'num', v: terms[1] as number },
      { t: 'paren', v: ')' },
    ];
  };
  const tens = group(a - (a % 10), b - (b % 10));
  const ones = group(a % 10, b % 10);
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
    zeroInMinuend: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'true: subtraction whose a has a zero digit below its leading digit (40, 305)',
    },
    unknown: {
      type: 'string',
      values: ['result', 'change'],
      default: { kind: 'const', value: 'result' },
      doc: 'result, or change (a op ? = result, number-pad only)',
    },
    strategy: {
      type: 'string',
      values: [...MDA_STRATEGIES],
      default: { kind: 'const', value: 'none' },
      doc: 'number-line solution: tens-ones (and none) hops tens then the ones; next-ten hops to the next ten first',
    },
    addends: {
      type: 'int',
      default: { kind: 'const', value: 2 },
      doc: 'numbers added (K01: 2 only; MDA.04 adds more in K02)',
    },
  },
  derived: ['result', 'carries', 'borrows'],
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
    'gen.mda.addsub.slide-ones',
    'gen.mda.addsub.slide-back',
    'gen.mda.addsub.tens-then-ones',
    'gen.mda.addsub.take-tens-then-ones',
    'gen.mda.addsub.sum-tens',
    'gen.mda.addsub.sum-ones',
    'gen.mda.addsub.diff-tens',
    'gen.mda.addsub.diff-ones',
    'gen.mda.addsub.count-on',
    'gen.mda.addsub.count-back',
    'gen.mda.addsub.is',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive(p): ParamValues {
    const a = asNum(p.a);
    const b = asNum(p.b);
    const plus = plusOf(p);
    return {
      result: resultOf(p),
      carries: plus ? carriesOf(a, b) : 0,
      borrows: plus || a < b ? 0 : borrowsOf(a, b),
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
    const carries = plus ? carriesOf(a, b) : 0;
    const borrows = plus ? 0 : borrowsOf(a, b);
    const regroups = asNum(p.regroups, -1);
    if (regroups >= 0 && carries + borrows !== regroups) return false;
    if (p.zeroInMinuend === true && (plus || !hasZeroBelowLead(a))) return false;
    if (asNum(p.addends, 2) !== 2) return false;
    if (asStr(p.unknown, 'result') === 'change' && t.format !== 'number-pad') return false;
    switch (t.format) {
      case 'base-ten-build':
        // Built by putting in or taking away b's pieces: no trade.
        return carries + borrows === 0;
      case 'base-ten-trade':
        return a <= 999 && b <= 999 && result <= 999;
      case 'expanded-form':
        return plus || borrows === 0;
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
    const vars = pickVars(t, {
      a,
      b,
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
              opToken,
              { t: 'num', v: b },
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
            showAlgorithm: false,
            thenAsk: true,
          },
          answer: { kind: 'state', checker: 'trade.result', target: { result, value: result } },
        };
        break;
      case 'number-line-jump': {
        const dir: 1 | -1 = plus ? 1 : -1;
        const allowedJumps = freeJumps(dir);
        const lo = Math.min(a, result);
        const hi = Math.max(a, result);
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
            start: a,
            goal: plus ? 'add' : 'subtract',
            target: result,
            allowedJumps,
            path: 'open',
            thenAsk: 'landing',
          },
          answer: {
            kind: 'state',
            checker: 'jumps.reach',
            target: { start: a, target: result, allowedJumps, value: result },
          },
          nudge: [{ op: 'highlight', args: { at: a } }],
          highlight: [{ op: 'highlight', args: { at: a } }],
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
            expression: { tokens: groupedTokens(a, b, plus) },
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
        const first = change
          ? say(plus ? 'gen.mda.addsub.count-on' : 'gen.mda.addsub.count-back', { a, result })
          : say(plus ? 'gen.mda.addsub.tens-then-ones' : 'gen.mda.addsub.take-tens-then-ones', {});
        return [
          { ...first, action: { op: 'highlight', args: { token: 'x' } } },
          final({ op: 'type', args: { blank: 'x', value: answer } }),
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
        for (let i = 0; i < Math.floor(b / 10); i += 1) {
          steps.push(
            say(
              plus ? 'gen.mda.addsub.row-down' : 'gen.mda.addsub.row-up',
              {},
              {
                op: 'slide',
                args: { dir: plus ? 'down' : 'up' },
              },
            ),
          );
        }
        if (bo > 0) {
          steps.push(
            say(
              plus ? 'gen.mda.addsub.slide-ones' : 'gen.mda.addsub.slide-back',
              { count: bo },
              {
                op: 'slide',
                args: { dir: plus ? 'right' : 'left' },
              },
            ),
          );
        }
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
