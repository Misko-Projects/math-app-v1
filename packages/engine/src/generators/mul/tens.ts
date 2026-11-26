// mul.tens (03 §5.6, MUL.11): a one-digit number times a multiple of ten, a × b with a 2–9 and
// b 10–90 in steps of ten. Derived: `result` = a × b.
// - `steps: false` asks a × b = ?; `steps: true` writes it as tens and asks each step:
//   a × b = a × t × 10 = [p] × 10 = [x], t = b ÷ 10 (4 × 30 = 4 × 3 × 10 = 12 × 10 = 120).
// Formats (K02 slice 3b): number-pad and numeral-pick. The number-pad `base-ten` picture is ONE
// group, b as t tens (the child times it by a), never the product; `symbols` shows no picture.
// numeral-pick shows a × b and offers the product among the template's diagnostic distractors
// (the zero dropped, the numbers added) and near misses. The rod of ten has no sprite for
// equal-groups, and a base-ten-build of the product would show it on its goal card, so
// equal-groups and base-ten-build are not built yet.

import type { ExpressionToken, LessonStep, ResponseValue } from '@number-island/shared';
import { numberOptionId } from '../../formats/numeral-pick';
import { asNum, correctFromAnswer, finish, numberOptions, pickVars, sampleAll } from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

export const TENS_A_MIN = 2;
export const TENS_A_MAX = 9;
export const TENS_B_MAX = 90;

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const num = (v: number): ExpressionToken => ({ t: 'num', v });
const times: ExpressionToken = { t: 'op', v: '×' };
const eq: ExpressionToken = { t: 'rel', v: '=' };

/** The sentence and the asked values of a × b (a × b = a × t × 10 = [p] × 10 = [x] with steps). */
export function tensPlan(
  a: number,
  b: number,
  steps: boolean,
): { t: number; values: number[]; tokens: ExpressionToken[] } {
  const t = b / 10;
  const result = a * b;
  const head: ExpressionToken[] = [num(a), times, num(b), eq];
  if (!steps) return { t, values: [result], tokens: [...head, { t: 'blank', id: 'x' }] };
  return {
    t,
    values: [a * t, result],
    tokens: [
      ...head,
      num(a),
      times,
      num(t),
      times,
      num(10),
      eq,
      { t: 'blank', id: 'p' },
      times,
      num(10),
      eq,
      { t: 'blank', id: 'x' },
    ],
  };
}

export const mulTens: GeneratorDef = {
  id: 'mul.tens',
  formats: ['number-pad', 'numeral-pick'],
  params: {
    a: {
      type: 'int',
      default: { kind: 'int', min: TENS_A_MIN, max: TENS_A_MAX },
      doc: 'the one-digit factor, 2–9',
    },
    b: {
      type: 'int',
      default: { kind: 'int', min: 10, max: TENS_B_MAX, step: 10 },
      doc: 'the multiple of ten, 10–90 in steps of 10',
    },
    steps: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'write a × b as a × t × 10 and ask the tens, then the total',
    },
  },
  derived: ['result'],
  features: {
    'product.over100': { weight: 0.5, doc: 'the product is over 100' },
  },
  narration: ['gen.mul.tens.tens', 'gen.mul.tens.times-ten'],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive(p) {
    return { result: asNum(p.a) * asNum(p.b) };
  },
  accepts(p, t) {
    const a = asNum(p.a);
    const b = asNum(p.b);
    return (
      (t.format === 'number-pad' || (t.format === 'numeral-pick' && p.steps !== true)) &&
      a >= TENS_A_MIN &&
      a <= TENS_A_MAX &&
      b >= 10 &&
      b <= TENS_B_MAX &&
      b % 10 === 0
    );
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template, rng } = ctx;
    const a = asNum(params.a);
    const b = asNum(params.b);
    const plan = tensPlan(a, b, params.steps === true);
    const rep = template.representation ?? 'symbols';
    // The tens (p ≤ 81) take two digits; the total three from 100.
    const blanks = plan.tokens.flatMap((tk) =>
      tk.t === 'blank' ? [{ id: tk.id, maxDigits: tk.id === 'x' && a * b >= 100 ? 3 : 2 }] : [],
    );
    const vars = pickVars(template, { a, b, t: plan.t });
    const math = { 'product.over100': a * b > 100 ? 1 : 0 };
    if (template.format === 'numeral-pick') {
      const opts = numberOptions(template, params, a * b, rng, 10, 1000);
      return finish(mulTens, ctx, {
        params,
        vars,
        math,
        widget: {
          format: 'numeral-pick',
          stimulus: {
            kind: 'expression',
            expr: { tokens: [num(a), times, num(b)] },
          },
          options: opts.options,
          layout: 'row',
        },
        answer: { kind: 'choice', id: numberOptionId(a * b) },
      });
    }
    return finish(mulTens, ctx, {
      params,
      vars,
      math,
      widget: {
        format: 'number-pad',
        stimulus:
          rep === 'base-ten'
            ? { kind: 'base-ten', hundreds: 0, tens: plan.t, ones: 0 }
            : { kind: 'none' },
        expression: { tokens: plan.tokens },
        blanks,
        unit: null,
      },
      answer:
        plan.values.length === 1
          ? { kind: 'number', value: plan.values[0] as number }
          : { kind: 'numbers', values: [...plan.values], ordered: true },
    });
  },
  exampleCorrect(out): ResponseValue {
    return correctFromAnswer(out.answer);
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = asNum(out.params.a);
    const b = asNum(out.params.b);
    const t = b / 10;
    const ids = w.format === 'number-pad' ? w.blanks.map((bl) => bl.id) : [];
    const tens = a * t;
    if (w.format === 'numeral-pick') {
      return [
        say('gen.mul.tens.tens', { a, t, tens }),
        say(
          'gen.mul.tens.times-ten',
          { tens, result: a * b },
          { op: 'tap', args: { id: numberOptionId(a * b) } },
        ),
      ];
    }
    const last = ids.length - 1;
    const steps: LessonStep[] = [];
    steps.push(
      say(
        'gen.mul.tens.tens',
        { a, t, tens },
        ids.length > 1 ? { op: 'type', args: { blank: ids[0] as string, value: tens } } : undefined,
      ),
    );
    steps.push(
      say(
        'gen.mul.tens.times-ten',
        { tens, result: a * b },
        { op: 'type', args: { blank: ids[last] as string, value: a * b } },
      ),
    );
    return steps;
  },
};
