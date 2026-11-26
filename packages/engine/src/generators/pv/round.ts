// pv.round (03 §5.6): round `n` to the nearest `place` (10 or 100; PV.08, PV.18), or say which of
// the two benchmarks around it is closer (CMP.12: the same question, asked as "closer to which?").
// Derived: `result`. A number exactly halfway rounds up (45 → 50, 350 → 400); a multiple of
// `place` is never drawn (it would round to itself).
//
// Formats:
//   numeral-pick  `n` as a numeral; three options: the two benchmarks around n (b0 below, b1 above)
//                 and one more `place` away on the far side (47: 40, 50, 30). Rounding down by
//                 habit (MC.round-down-always) picks b0; for a hundred, the third option is n
//                 rounded to the ten instead when that is another number (347: 300, 400, 350;
//                 MC.round-wrong-place)
//   number-pad    `n` as a numeral, or (number-line representation) marked on the stretch of line
//                 from b0 to b1 with ticks a tenth of `place` apart; the rounded number is typed
// The number line with the two benchmarks is numberline.place `closer` (03 §5.5 number-line-place).
// Feature values depend on the params only (the learner rebuilds them from params and seed).

import type { LessonStep, ResponseValue } from '@number-island/shared';
import { numberOptionId, optionNumber } from '../../formats/numeral-pick';
import { digitCount } from '../../formats/types';
import { correctFromAnswer, finish, type PartialOutput, pickVars, sampleAll } from '../common';
import { linePicture } from '../numberline/line';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';
import { roundParts, roundTo } from './round-model';

const PLACES = new Set([10, 100, 1000]);

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

/** The three numeral-pick values: the result, the other benchmark and a third (see the header). */
export function roundOptions(p: Record<string, unknown>): number[] {
  const { n, place, b0, b1, result } = roundParts(p);
  const other = result === b1 ? b0 : b1;
  const toTen = place >= 100 ? roundTo(n, place / 10) : null;
  const far = result === b1 ? (b0 - place >= 0 ? b0 - place : b1 + place) : b1 + place;
  const third = toTen !== null && toTen !== b0 && toTen !== b1 ? toTen : far;
  return [result, other, third];
}

export const pvRound: GeneratorDef = {
  id: 'pv.round',
  formats: ['numeral-pick', 'number-pad'],
  params: {
    n: { type: 'int', default: { kind: 'int', min: 11, max: 99 }, doc: 'the number to round' },
    place: {
      type: 'int',
      default: { kind: 'const', value: 10 },
      doc: 'round to the nearest 10, 100 or 1000',
    },
  },
  derived: ['result'],
  features: {
    'place.hundred': { weight: 0.4, doc: 'rounding to the nearest hundred' },
    'place.big': { weight: 0.6, doc: 'rounding to the nearest thousand or more' },
    halfway: { weight: 0.6, doc: 'n is exactly halfway between the benchmarks (it rounds up)' },
    crossesUp: { weight: 0.6, doc: 'n rounds up to the next ten (hundred)' },
  },
  narration: [
    'gen.pv.round.between',
    'gen.pv.round.middle',
    'gen.pv.round.closer',
    'gen.pv.round.half-up',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: (p) => ({ result: roundParts(p).result }),
  accepts(p) {
    const { n, place } = roundParts(p);
    if (!PLACES.has(place) || !Number.isInteger(n)) return false;
    // A multiple of the place rounds to itself; there is nothing to decide.
    return n > 0 && n % place !== 0;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const parts = roundParts(params);
    const { n, place, b0, b1, mid, result } = parts;
    const math = {
      'place.hundred': place === 100 ? 1 : 0,
      'place.big': place >= 1000 ? 1 : 0,
      halfway: n === mid ? 1 : 0,
      crossesUp: result === b1 ? 1 : 0,
    };
    const vars = pickVars(t, { n, place, b0, b1 });
    const numeral = { kind: 'expression' as const, expr: { tokens: [{ t: 'num' as const, v: n }] } };
    let p: PartialOutput;
    switch (t.format) {
      case 'numeral-pick': {
        const values = rng.fork('layout').shuffle(roundOptions(params));
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'numeral-pick',
            stimulus: numeral,
            options: values.map((v) => ({ id: numberOptionId(v), label: String(v) })),
            layout: 'row',
          },
          answer: { kind: 'choice', id: numberOptionId(result) },
        };
        break;
      }
      case 'number-pad':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            // The number-line representation draws the stretch from b0 to b1 (both labelled),
            // with ticks a tenth of the place apart and n marked.
            stimulus:
              t.representation === 'number-line'
                ? linePicture(
                    { min: b0, max: b1, ticksEvery: place / 10, labelsEvery: place },
                    [{ at: n, label: true }],
                  )
                : numeral,
            // One digit to spare, so the box size never hints the answer.
            blanks: [{ id: 'r', maxDigits: digitCount(b1) + 1 }],
            unit: null,
          },
          answer: { kind: 'number', value: result },
        };
        break;
      default:
        throw new Error(`pv.round cannot build ${t.format}`);
    }
    return finish(pvRound, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    return correctFromAnswer(out.answer);
  },
  solution(out): LessonStep[] {
    const { n, b0, b1, mid, result } = roundParts(out.params);
    const w = out.widget;
    const action: LessonStep['action'] =
      w.format === 'numeral-pick'
        ? { op: 'tap', args: { id: numberOptionId(result) } }
        : { op: 'type', args: { blank: 'r', value: result } };
    const id = out.answer.kind === 'choice' ? out.answer.id : null;
    const v = id !== null ? (optionNumber(id) ?? result) : result;
    return [
      say('gen.pv.round.between', { n, b0, b1 }),
      say('gen.pv.round.middle', { mid }),
      n === mid
        ? say('gen.pv.round.half-up', { n, v }, action)
        : say('gen.pv.round.closer', { n, v }, action),
    ];
  },
};
