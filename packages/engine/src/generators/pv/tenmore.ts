// pv.tenmore (03 §5.6): ten (or a hundred) more or less, in your head or on a model. From `n`,
// `delta` (±10 or ±100) is applied `moves` times, then `ones` (signed) are counted on or back
// (CNT.20: 34, 44, 54, 55). Derived: `result` = n + delta · moves + ones.
//
// Formats:
//   hundred-chart     `move` from n: one row down (up) per ten, then one box right (left) per one;
//                     the ones stay in the row, and every number is on one chart (|delta| = 10)
//   base-ten-build    `build` with n prebuilt (canonical pieces): put in or take away the tens
//                     (hundreds) and ones; never a trade (each digit stays in 0–9);
//                     baseten.value `{ value: result }`
//   number-pad        base-ten or bundles: a picture of n (the prompt says how much more or less);
//                     otherwise the expression n ± |delta · moves| [± |ones|] = ?
//   number-line-jump  an open line from n to result, jumps of `delta` (and ±1 when ones ≠ 0),
//                     the landing typed (`thenAsk: landing`, jumps.reach with `value`)
// Feature values depend on the params only (the learner rebuilds them from params and seed).

import type {
  ExpressionToken,
  LessonStep,
  ParamValues,
  ResponseValue,
  StimulusSpec,
} from '@number-island/shared';
import { canonicalPieces } from '../../formats/place-value';
import { digitCount } from '../../formats/types';
import {
  asNum,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import { chartFor } from '../count/sequence';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const DELTAS = new Set([10, -10, 100, -100]);
const BASE_TEN_REPS = new Set(['base-ten', 'bundles']);

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

/** The parts of an item: start, the value after the tens (hundreds) moves, and the result. */
export function tenMoreParts(p: ParamValues): {
  n: number;
  delta: number;
  moves: number;
  ones: number;
  mid: number;
  result: number;
} {
  const n = asNum(p.n);
  const delta = asNum(p.delta, 10);
  const moves = asNum(p.moves, 1);
  const ones = asNum(p.ones);
  const mid = n + delta * moves;
  return { n, delta, moves, ones, mid, result: mid + ones };
}

/** The row of a number on a chart that starts at `first` (ten cells a row). */
const rowOf = (x: number, first: number): number => Math.floor((x - first) / 10);

/** The digit of n at place k (0 = ones). */
const digitAt = (n: number, k: number): number => Math.floor(n / 10 ** k) % 10;

/** The math features of an item: a function of its params only. */
export function tenMoreFeatures(p: ParamValues): Record<string, number> {
  const { n, delta, moves, ones, result } = tenMoreParts(p);
  return {
    minus: delta < 0 ? 1 : 0,
    crossCentury: Math.floor(n / 100) !== Math.floor(result / 100) ? 1 : 0,
    threeDigit: Math.max(n, result) >= 100 ? 1 : 0,
    extraMoves: Math.max(0, moves - 1),
    withOnes: ones !== 0 ? 1 : 0,
  };
}

/** The ten-or-hundred moves, then the ones, as signed jumps (number-line-jump). */
function jumpsOf(p: ReturnType<typeof tenMoreParts>): number[] {
  const out = new Array<number>(p.moves).fill(p.delta);
  for (let i = 0; i < Math.abs(p.ones); i += 1) out.push(Math.sign(p.ones));
  return out;
}

export const pvTenMore: GeneratorDef = {
  id: 'pv.tenmore',
  formats: ['hundred-chart', 'base-ten-build', 'number-pad', 'number-line-jump'],
  params: {
    n: { type: 'int', default: { kind: 'int', min: 11, max: 89 }, doc: 'the start number' },
    delta: {
      type: 'int',
      default: { kind: 'const', value: 10 },
      doc: '10, −10, 100 or −100: what one move adds',
    },
    moves: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'how many times delta is applied (1–9)',
    },
    ones: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'ones counted on (+) or back (−) after the tens (CNT.20), |ones| ≤ 9',
    },
  },
  derived: ['result'],
  features: {
    minus: { weight: 0.3, doc: 'less (delta < 0)' },
    crossCentury: { weight: 0.6, doc: 'the result is in another hundred than n' },
    threeDigit: { weight: 0.4, doc: 'n or the result has three or more digits' },
    extraMoves: { weight: 0.25, doc: 'moves − 1 (more than one ten or hundred)' },
    withOnes: { weight: 0.3, doc: 'ones are counted on or back after the tens' },
  },
  narration: [
    'gen.pv.tenmore.start',
    'gen.pv.tenmore.row-down',
    'gen.pv.tenmore.row-up',
    'gen.pv.tenmore.box-right',
    'gen.pv.tenmore.box-left',
    'gen.pv.tenmore.add-tens',
    'gen.pv.tenmore.take-tens',
    'gen.pv.tenmore.add-hundreds',
    'gen.pv.tenmore.take-hundreds',
    'gen.pv.tenmore.add-ones',
    'gen.pv.tenmore.take-ones',
    'gen.pv.tenmore.jump-ten',
    'gen.pv.tenmore.jump-back-ten',
    'gen.pv.tenmore.jump-hundred',
    'gen.pv.tenmore.jump-back-hundred',
    'gen.pv.tenmore.jump-one',
    'gen.pv.tenmore.jump-back-one',
    'gen.pv.tenmore.think-more',
    'gen.pv.tenmore.think-less',
    'gen.pv.tenmore.think-hundred-more',
    'gen.pv.tenmore.think-hundred-less',
    'gen.pv.tenmore.think-mixed',
    'gen.pv.tenmore.is',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: (p) => ({ result: tenMoreParts(p).result }),
  accepts(p, t) {
    const { n, delta, moves, ones, mid, result } = tenMoreParts(p);
    if (!DELTAS.has(delta) || !Number.isInteger(moves) || moves < 1 || moves > 9) return false;
    if (!Number.isInteger(ones) || Math.abs(ones) > 9) return false;
    if (!Number.isInteger(n) || n < 1 || mid < 1 || result < 1 || result > 9999) return false;
    switch (t.format) {
      case 'hundred-chart': {
        if (Math.abs(delta) !== 10) return false;
        const lo = Math.min(n, mid, result);
        const hi = Math.max(n, mid, result);
        const chart = chartFor(lo, hi);
        // The ones moves stay in the row (a box right of a row's last cell is not the next one).
        return chart !== null && rowOf(mid, chart.first) === rowOf(result, chart.first);
      }
      case 'base-ten-build': {
        // No trade: the tens (hundreds) digit and the ones digit each stay in 0–9.
        const k = Math.abs(delta) === 100 ? 2 : 1;
        const d = digitAt(n, k) + Math.sign(delta) * moves;
        const o = digitAt(n, 0) + ones;
        return d >= 0 && d <= 9 && o >= 0 && o <= 9;
      }
      default:
        return true;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    const parts = tenMoreParts(params);
    const { n, delta, moves, ones, mid, result } = parts;
    const math = tenMoreFeatures(params);
    // `dir` (a word slot: word.more or word.less) says which way the tens go.
    const vars = pickVars(t, {
      n,
      by: Math.abs(delta) * moves,
      moves,
      ones: Math.abs(ones),
      dir: delta > 0 ? 'more' : 'less',
    });
    let p: PartialOutput;
    switch (t.format) {
      case 'hundred-chart': {
        const lo = Math.min(n, mid, result);
        const hi = Math.max(n, mid, result);
        const chart = chartFor(lo, hi);
        if (!chart) throw new RangeError('pv.tenmore: the moves do not fit one hundred chart');
        const dirs: ('up' | 'down' | 'left' | 'right')[] = [
          ...new Array<'up' | 'down'>(moves).fill(delta > 0 ? 'down' : 'up'),
          ...new Array<'left' | 'right'>(Math.abs(ones)).fill(ones > 0 ? 'right' : 'left'),
        ];
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'hundred-chart',
            first: chart.first,
            rows: chart.rows,
            hidden: [],
            mode: 'move',
            from: n,
            moves: dirs,
          },
          answer: { kind: 'number', value: result },
          nudge: [{ op: 'highlight-col', args: { n } }],
        };
        break;
      }
      case 'base-ten-build': {
        const pre = canonicalPieces(n);
        const top = Math.max(n, result);
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'base-ten-build',
            target: result,
            mode: 'build',
            pieces: { thousands: top >= 1000, hundreds: top >= 100, tens: true, ones: true },
            wholeIs: 'unit',
            prebuilt: {
              ...(pre.thousands > 0 ? { thousands: pre.thousands } : {}),
              hundreds: pre.hundreds,
              tens: pre.tens,
              ones: pre.ones,
            },
          },
          answer: { kind: 'state', checker: 'baseten.value', target: { value: result } },
        };
        break;
      }
      case 'number-pad': {
        const picture = BASE_TEN_REPS.has(t.representation ?? '');
        const pieces = canonicalPieces(n);
        const stimulus: StimulusSpec = picture
          ? {
              kind: 'base-ten',
              ...(pieces.thousands > 0 ? { thousands: pieces.thousands } : {}),
              hundreds: pieces.hundreds,
              tens: pieces.tens,
              ones: pieces.ones,
            }
          : { kind: 'none' };
        const tokens: ExpressionToken[] = [
          { t: 'num', v: n },
          { t: 'op', v: delta > 0 ? '+' : '-' },
          { t: 'num', v: Math.abs(delta) * moves },
          ...(ones !== 0
            ? [
                { t: 'op' as const, v: ones > 0 ? ('+' as const) : ('-' as const) },
                { t: 'num' as const, v: Math.abs(ones) },
              ]
            : []),
          { t: 'rel', v: '=' },
          { t: 'blank', id: 'x' },
        ];
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus,
            ...(picture ? {} : { expression: { tokens } }),
            blanks: [{ id: 'x', maxDigits: digitCount(Math.max(n, result)) + 1 }],
            unit: null,
          },
          answer: { kind: 'number', value: result },
          ...(picture ? {} : { overlay: stimulusOf(n) }),
        };
        break;
      }
      case 'number-line-jump': {
        const lo = Math.min(n, mid, result);
        const hi = Math.max(n, mid, result);
        const allowedJumps = ones !== 0 ? [delta, Math.sign(ones)] : [delta];
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
            start: n,
            goal: result >= n ? 'add' : 'subtract',
            target: result,
            allowedJumps,
            path: 'open',
            thenAsk: 'landing',
          },
          answer: {
            kind: 'state',
            checker: 'jumps.reach',
            target: { start: n, target: result, allowedJumps, value: result },
          },
          nudge: [{ op: 'highlight', args: { at: n } }],
          highlight: [{ op: 'highlight', args: { at: n } }],
        };
        break;
      }
      default:
        throw new Error(`pv.tenmore cannot build ${t.format}`);
    }
    return finish(pvTenMore, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    const parts = tenMoreParts(out.params);
    if (out.widget.format === 'base-ten-build') {
      return { kind: 'state', value: { ...canonicalPieces(parts.result) } };
    }
    return { kind: 'state', value: { jumps: jumpsOf(parts), value: parts.result } };
  },
  solution(out): LessonStep[] {
    const parts = tenMoreParts(out.params);
    const { n, delta, moves, ones, result } = parts;
    const w = out.widget;
    const up = delta > 0;
    const hundred = Math.abs(delta) === 100;
    const is = (action: LessonStep['action']) => say('gen.pv.tenmore.is', { v: result }, action);
    switch (w.format) {
      case 'hundred-chart':
        return [
          say('gen.pv.tenmore.start', { n }, { op: 'highlight-col', args: { n } }),
          ...(w.moves ?? []).map((dir) =>
            say(
              {
                down: 'gen.pv.tenmore.row-down',
                up: 'gen.pv.tenmore.row-up',
                right: 'gen.pv.tenmore.box-right',
                left: 'gen.pv.tenmore.box-left',
              }[dir],
              {},
              { op: 'slide', args: { dir } },
            ),
          ),
          is({ op: 'tap', args: { n: result } }),
        ];
      case 'base-ten-build': {
        const kind = hundred ? 'hundreds' : 'tens';
        const steps: LessonStep[] = [
          say(
            `gen.pv.tenmore.${up ? 'add' : 'take'}-${kind}`,
            { count: moves },
            { op: 'add-piece', args: { kind, count: up ? moves : -moves } },
          ),
        ];
        if (ones !== 0) {
          steps.push(
            say(
              `gen.pv.tenmore.${ones > 0 ? 'add' : 'take'}-ones`,
              { count: Math.abs(ones) },
              { op: 'add-piece', args: { kind: 'ones', count: ones } },
            ),
          );
        }
        steps.push(is({ op: 'count-by', args: { kind: 'ones' } }));
        return steps;
      }
      case 'number-pad': {
        const key =
          ones !== 0
            ? 'gen.pv.tenmore.think-mixed'
            : hundred
              ? `gen.pv.tenmore.think-hundred-${up ? 'more' : 'less'}`
              : `gen.pv.tenmore.think-${up ? 'more' : 'less'}`;
        const picture = w.stimulus.kind !== 'none';
        return [
          say(
            key,
            {},
            picture ? { op: 'show-stimulus' } : { op: 'highlight', args: { token: 'x' } },
          ),
          is({ op: 'type', args: { blank: 'x', value: result } }),
        ];
      }
      case 'number-line-jump': {
        const jumpKey = (j: number): string => {
          const size = Math.abs(j) === 100 ? 'hundred' : Math.abs(j) === 10 ? 'ten' : 'one';
          return `gen.pv.tenmore.jump-${j < 0 ? 'back-' : ''}${size}`;
        };
        return [
          say('gen.pv.tenmore.start', { n }, { op: 'highlight', args: { at: n } }),
          ...jumpsOf(parts).map((j) => say(jumpKey(j), {}, { op: 'hop', args: { by: j } })),
          is({ op: 'label-landing' }),
        ];
      }
      default:
        return [];
    }
  },
};

/** The base-ten picture of n (the representation hint beside a symbols pad). */
function stimulusOf(n: number): StimulusSpec {
  const pc = canonicalPieces(n);
  return {
    kind: 'base-ten',
    ...(pc.thousands > 0 ? { thousands: pc.thousands } : {}),
    hundreds: pc.hundreds,
    tens: pc.tens,
    ones: pc.ones,
  };
}
