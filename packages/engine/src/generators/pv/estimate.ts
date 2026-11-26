// pv.estimate (03 §5.6): estimate a + b or a − b by rounding each number to the nearest `place`
// (10 or 100) first (PV.19). Derived: `result` (the exact answer) and `estimate` (the rounded
// numbers added or taken away); the estimate is the answer. Neither number is a multiple of
// `place` (it would round to itself), and a subtraction keeps a > b and an estimate above 0.
//
// Formats:
//   numeral-pick  a op b as an expression; three options: the estimate, the estimate with every
//                 number cut down to the place (MC.round-down-always) when that differs, and the
//                 estimate one `place` off on the other side (or above, when below would be 0)
//   number-pad    a op b as an expression, or (number-line representation, place 100) a line
//                 from the hundred below the smaller number to the hundred above the larger, a
//                 tick at every hundred, both numbers marked; the estimate is typed. Marks stay at
//                 least a hundred apart so their labels never touch
// Feature values depend on the params only.

import type { LessonStep, ParamValues, ResponseValue } from '@number-island/shared';
import { numberOptionId } from '../../formats/numeral-pick';
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
import { linePicture } from '../numberline/line';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';
import { roundTo } from './round-model';

const PLACES = new Set([10, 100]);

/** The numbers of an item: a, b, the place, both rounded, the exact result and the estimate. */
export function estimateParts(p: ParamValues): {
  a: number;
  b: number;
  plus: boolean;
  place: number;
  ra: number;
  rb: number;
  result: number;
  estimate: number;
} {
  const a = asNum(p.a);
  const b = asNum(p.b);
  const place = asNum(p.place, 100);
  const plus = asStr(p.op, '+') !== '-';
  const ra = roundTo(a, place);
  const rb = roundTo(b, place);
  return {
    a,
    b,
    plus,
    place,
    ra,
    rb,
    result: plus ? a + b : a - b,
    estimate: plus ? ra + rb : ra - rb,
  };
}

/**
 * The estimate with both numbers cut down to the place, or null when that is the estimate. A
 * typed 0 (180 − 120 cut down to 100 − 100) is a slip MC.round-down-always reads; as an option
 * (`positive`) it is left out.
 */
export function roundedDownEstimate(p: ParamValues, positive = false): number | null {
  const { a, b, plus, place, estimate } = estimateParts(p);
  const ta = Math.floor(a / place) * place;
  const tb = Math.floor(b / place) * place;
  const r = plus ? ta + tb : ta - tb;
  return r !== estimate && r >= (positive ? 1 : 0) ? r : null;
}

/** The three numeral-pick values: the estimate first (see the header). */
export function estimateOptions(p: ParamValues): number[] {
  const { place, estimate } = estimateParts(p);
  const down = roundedDownEstimate(p, true);
  const out = [estimate];
  if (down !== null) out.push(down);
  // One place off, away from the cut-down distractor where there is one.
  const off = [estimate + place, estimate - place, estimate + 2 * place].filter(
    (v) => v > 0 && !out.includes(v),
  );
  for (const v of off) if (out.length < 3) out.push(v);
  return out;
}

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const pvEstimate: GeneratorDef = {
  id: 'pv.estimate',
  formats: ['numeral-pick', 'number-pad'],
  params: {
    a: { type: 'int', default: { kind: 'int', min: 101, max: 899 }, doc: 'the first number' },
    b: { type: 'int', default: { kind: 'int', min: 101, max: 899 }, doc: 'the second number' },
    op: {
      type: 'string',
      values: ['+', '-'],
      default: { kind: 'const', value: '+' },
      doc: '+ or -',
    },
    place: {
      type: 'int',
      default: { kind: 'const', value: 100 },
      doc: 'round each number to the nearest 10 or 100',
    },
  },
  derived: ['result', 'estimate'],
  features: {
    'place.hundred': { weight: 0.4, doc: 'rounding to the nearest hundred' },
    sub: { weight: 0.3, doc: 'subtraction' },
    roundsUp: { weight: 0.4, doc: 'numbers that round up, / 2' },
  },
  narration: ['gen.pv.estimate.round', 'gen.pv.estimate.add', 'gen.pv.estimate.take'],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive(p) {
    const { result, estimate } = estimateParts(p);
    return { result, estimate };
  },
  accepts(p, t) {
    const { a, b, plus, place, rb, estimate } = estimateParts(p);
    if (!PLACES.has(place) || !Number.isInteger(a) || !Number.isInteger(b)) return false;
    if (a < 1 || b < 1 || a % place === 0 || b % place === 0) return false;
    if (!plus && (a <= b || rb <= 0 || estimate <= 0)) return false;
    if (t.representation === 'number-line') {
      // One line, a tick per hundred, two labelled marks a hundred apart or more.
      if (t.format !== 'number-pad' || place !== 100) return false;
      if (Math.abs(a - b) < 100 || Math.max(a, b) > 999) return false;
    }
    return estimate <= 9999;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const { a, b, plus, place, ra, rb, estimate } = estimateParts(params);
    const math = {
      'place.hundred': place === 100 ? 1 : 0,
      sub: plus ? 0 : 1,
      roundsUp: ((ra > a ? 1 : 0) + (rb > b ? 1 : 0)) / 2,
    };
    const vars = pickVars(t, { a, b, place });
    const expression = {
      kind: 'expression' as const,
      expr: {
        tokens: [
          { t: 'num' as const, v: a },
          { t: 'op' as const, v: plus ? ('+' as const) : ('-' as const) },
          { t: 'num' as const, v: b },
        ],
      },
    };
    let p: PartialOutput;
    switch (t.format) {
      case 'numeral-pick': {
        const values = rng.fork('layout').shuffle(estimateOptions(params));
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'numeral-pick',
            stimulus: expression,
            options: values.map((v) => ({ id: numberOptionId(v), label: String(v) })),
            layout: 'row',
          },
          answer: { kind: 'choice', id: numberOptionId(estimate) },
        };
        break;
      }
      case 'number-pad': {
        const lo = Math.floor(Math.min(a, b) / 100) * 100;
        const hi = Math.ceil(Math.max(a, b) / 100) * 100;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus:
              t.representation === 'number-line'
                ? linePicture({ min: lo, max: hi, ticksEvery: 100, labelsEvery: 100 }, [
                    { at: a, label: true },
                    { at: b, label: true },
                  ])
                : expression,
            // One digit to spare, so the box size never hints the answer.
            blanks: [{ id: 'r', maxDigits: digitCount(estimate) + 1 }],
            unit: null,
          },
          answer: { kind: 'number', value: estimate },
        };
        break;
      }
      default:
        throw new Error(`pv.estimate cannot build ${t.format}`);
    }
    return finish(pvEstimate, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    return correctFromAnswer(out.answer);
  },
  solution(out): LessonStep[] {
    const { a, b, plus, ra, rb, estimate } = estimateParts(out.params);
    const action: LessonStep['action'] =
      out.widget.format === 'numeral-pick'
        ? { op: 'tap', args: { id: numberOptionId(estimate) } }
        : { op: 'type', args: { blank: 'r', value: estimate } };
    return [
      say('gen.pv.estimate.round', { n: a, v: ra }),
      say('gen.pv.estimate.round', { n: b, v: rb }),
      say(plus ? 'gen.pv.estimate.add' : 'gen.pv.estimate.take', { ra, rb, v: estimate }, action),
    ];
  },
};
