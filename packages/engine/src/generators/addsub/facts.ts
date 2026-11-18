// addsub.facts (03 §5.6): single-digit and within-20 addition and subtraction facts.
// `unknown`: result (a op b = _), change (a op _ = result), start (_ op b = result).
// `family` restricts the fact (plus1, doubles, make-ten, …); it is enforced by drawing within the
// template's param domains, never by overriding them. Derived: `result`.
// Formats: number-pad, numeral-pick, tenframe-fill, number-line-jump.

import type {
  ExpressionToken,
  LessonStep,
  ParamSpec,
  ParamValues,
  ResponseValue,
  StimulusSpec,
} from '@number-island/shared';
import { numberOptionId } from '../../formats/numeral-pick';
import type { Rng } from '../../rng';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  numberOptions,
  type PartialOutput,
  pickVars,
  sampleAll,
  specDomain,
  tenFrameOverlay,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

export const FAMILIES = [
  'any',
  'plus1',
  'plus2',
  'doubles',
  'near-doubles',
  'make-ten',
  'plus9',
  'ten-plus',
  'teen-minus-ten',
  'back-to-ten',
  'count-up',
  'think-add',
] as const;

/** Whether (a, b, op) belongs to the family. */
export function inFamily(family: string, a: number, b: number, op: string): boolean {
  switch (family) {
    case 'plus1':
      return op === '+' && (a === 1 || b === 1);
    case 'plus2':
      return op === '+' && (a === 2 || b === 2);
    case 'doubles':
      return op === '+' && a === b;
    case 'near-doubles':
      return op === '+' && Math.abs(a - b) === 1;
    case 'make-ten':
      return op === '+' && a + b === 10;
    case 'plus9':
      return op === '+' && (a === 9 || b === 9);
    case 'ten-plus':
      return op === '+' && (a === 10 || b === 10);
    case 'teen-minus-ten':
      return op === '-' && a >= 11 && a <= 19 && b === 10;
    case 'back-to-ten':
      return op === '-' && a >= 11 && a <= 19 && a - b === 10;
    case 'count-up':
      return op === '+' ? Math.min(a, b) <= 4 : b <= 4;
    case 'think-add':
      return op === '-';
    default:
      return true;
  }
}

export function factResult(a: number, b: number, op: string): number {
  return op === '-' ? a - b : a + b;
}

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

function sampleFact(spec: Record<string, ParamSpec>, rng: Rng): ParamValues {
  const p = sampleAll(spec, rng);
  const family = asStr(p.family, 'any');
  const op = asStr(p.op, '+');
  const bSpec = spec.b;
  const bDomain = (bSpec ? specDomain(bSpec) : []).filter(
    (v): v is number => typeof v === 'number',
  );
  // Draw a until some b in b's domain completes a valid fact of the family; then pick that b.
  for (let i = 0; i < 64; i += 1) {
    const a = asNum(p.a);
    const ok = bDomain.filter((b) => inFamily(family, a, b, op) && factResult(a, b, op) >= 0);
    if (ok.length > 0) {
      p.b = rng.pick(ok);
      return p;
    }
    const aSpec = spec.a;
    if (!aSpec) break;
    p.a = sampleAll({ a: aSpec }, rng).a as number;
  }
  return p; // constraints and validity checks reject it; generateItem draws again
}

function expression(a: number, b: number, op: string, unknown: string): ExpressionToken[] {
  const r = factResult(a, b, op);
  const num = (v: number): ExpressionToken => ({ t: 'num', v });
  const blank: ExpressionToken = { t: 'blank', id: 'x' };
  const o: ExpressionToken = { t: 'op', v: op === '-' ? '-' : '+' };
  const eq: ExpressionToken = { t: 'rel', v: '=' };
  if (unknown === 'change') return [num(a), o, blank, eq, num(r)];
  if (unknown === 'start') return [blank, o, num(b), eq, num(r)];
  return [num(a), o, num(b), eq, blank];
}

export const addsubFacts: GeneratorDef = {
  id: 'addsub.facts',
  formats: ['number-pad', 'numeral-pick', 'tenframe-fill', 'number-line-jump'],
  params: {
    a: { type: 'int', default: { kind: 'int', min: 0, max: 10 }, doc: 'first number' },
    b: { type: 'int', default: { kind: 'int', min: 0, max: 10 }, doc: 'second number' },
    op: {
      type: 'string',
      values: ['+', '-'],
      default: { kind: 'const', value: '+' },
      doc: 'operation',
    },
    unknown: {
      type: 'string',
      values: ['result', 'change', 'start'],
      default: { kind: 'const', value: 'result' },
      doc: 'which number the child finds',
    },
    family: {
      type: 'string',
      values: [...FAMILIES],
      default: { kind: 'const', value: 'any' },
      doc: 'fact family (strategy group)',
    },
    maxSum: {
      type: 'int',
      default: { kind: 'const', value: 20 },
      doc: 'largest number in the fact (a, b and result)',
    },
  },
  derived: ['result'],
  features: {
    size: { weight: 0.3, doc: 'per 5 above 5 of max(a, b, result)' },
    bridge10: { weight: 0.7, doc: 'the fact crosses ten (ones regroup)' },
    sub: { weight: 0.35, doc: 'subtraction' },
    'unknown.change': { weight: 0.6, doc: 'change unknown' },
    'unknown.start': { weight: 0.9, doc: 'start unknown' },
    zeroOrOne: { weight: -0.6, doc: 'adding or taking away 0 or 1' },
    double: { weight: -0.4, doc: 'a double (a + a)' },
    nearDouble: { weight: -0.1, doc: 'a near double' },
    nine: { weight: -0.1, doc: 'adding 9' },
    plusTen: { weight: -0.5, doc: 'adding 10' },
  },
  narration: [
    'gen.addsub.facts.start-at',
    'gen.addsub.facts.count-on',
    'gen.addsub.facts.answer',
    'gen.addsub.facts.join',
  ],
  sample: sampleFact,
  derive: (p) => ({ result: factResult(asNum(p.a), asNum(p.b), asStr(p.op, '+')) }),
  accepts(p, t) {
    const a = asNum(p.a);
    const b = asNum(p.b);
    const op = asStr(p.op, '+');
    const r = factResult(a, b, op);
    if (r < 0 || Math.max(a, b, r) > asNum(p.maxSum, 20)) return false;
    if (!inFamily(asStr(p.family, 'any'), a, b, op)) return false;
    // A jump item needs at least one hop.
    return t.format !== 'number-line-jump' || b > 0;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const a = asNum(params.a);
    const b = asNum(params.b);
    const op = asStr(params.op, '+');
    const unknown = asStr(params.unknown, 'result');
    const result = factResult(a, b, op);
    const family = asStr(params.family, 'any');
    if (result < 0) throw new RangeError('addsub.facts: negative result');
    if (Math.max(a, b, result) > asNum(params.maxSum, 20)) {
      throw new RangeError('addsub.facts: a number exceeds maxSum');
    }
    if (!inFamily(family, a, b, op)) throw new RangeError(`addsub.facts: not a ${family} fact`);
    const answerValue = unknown === 'change' ? b : unknown === 'start' ? a : result;
    const plus = op === '+';
    const bridge = plus
      ? (a % 10) + (b % 10) >= 10 && a !== 10 && b !== 10 && result !== 10
      : a > 10 && result < 10 && a % 10 < b % 10;
    const math: Record<string, number> = {
      size: Math.max(0, Math.max(a, b, result) - 5) / 5,
      bridge10: bridge ? 1 : 0,
      sub: plus ? 0 : 1,
      'unknown.change': unknown === 'change' ? 1 : 0,
      'unknown.start': unknown === 'start' ? 1 : 0,
      zeroOrOne: (plus ? Math.min(a, b) : b) <= 1 ? 1 : 0,
      double: plus && a === b ? 1 : 0,
      nearDouble: plus && Math.abs(a - b) === 1 ? 1 : 0,
      nine: plus && (a === 9 || b === 9) ? 1 : 0,
      plusTen: plus && (a === 10 || b === 10) ? 1 : 0,
    };
    const vars = pickVars(t, { a, b, result });
    const overlay: StimulusSpec = plus ? tenFrameOverlay(result, [a, b]) : tenFrameOverlay(a);
    let p: PartialOutput;
    switch (t.format) {
      case 'number-pad': {
        const abstract = t.tier === 'abstract';
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: abstract ? { kind: 'none' } : overlay,
            expression: { tokens: expression(a, b, op, unknown) },
            blanks: [{ id: 'x', maxDigits: 2 }],
            unit: null,
          },
          answer: { kind: 'number', value: answerValue },
          overlay,
        };
        break;
      }
      case 'numeral-pick': {
        const opts = numberOptions(t, params, answerValue, rng);
        p = {
          params,
          vars,
          math: opts.diagnostic > 0 ? { ...math, 'distractors.diagnostic': opts.diagnostic } : math,
          widget: {
            format: 'numeral-pick',
            stimulus: { kind: 'expression', expr: { tokens: expression(a, b, op, unknown) } },
            options: opts.options,
            layout: 'row',
          },
          answer: { kind: 'choice', id: numberOptionId(answerValue) },
          overlay,
        };
        break;
      }
      case 'tenframe-fill': {
        if (unknown !== 'result')
          throw new RangeError('addsub.facts: tenframe-fill needs result unknown');
        const frames: 1 | 2 = Math.max(a, result) > 10 ? 2 : 1;
        const prefilled =
          a > 10
            ? [
                { frame: 0, color: 'a' as const, count: 10 },
                { frame: 1, color: 'a' as const, count: a - 10 },
              ]
            : a > 0
              ? [{ frame: 0, color: 'a' as const, count: a }]
              : [];
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'tenframe-fill',
            frames,
            size: 10,
            prefilled,
            goal: plus ? 'add' : 'subtract',
            a,
            b,
            requireStandardFill: false,
            thenAsk: 'total',
            skin: 'frame',
          },
          answer: {
            kind: 'state',
            checker: 'tenframe.total',
            target: { n: result, value: result },
          },
          highlight: [{ op: 'show-addends' }],
        };
        break;
      }
      case 'number-line-jump': {
        if (unknown !== 'result')
          throw new RangeError('addsub.facts: number-line-jump needs result unknown');
        const stones = t.tier === 'concrete';
        const jump = plus ? 1 : -1;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-line-jump',
            min: 0,
            max: Math.max(10, Math.max(a, result) + 2),
            ticksEvery: 1,
            labelsEvery: stones ? 1 : 5,
            start: a,
            goal: plus ? 'add' : 'subtract',
            target: result,
            allowedJumps: [jump],
            path: stones ? 'stones' : 'line',
            thenAsk: 'landing',
          },
          answer: {
            kind: 'state',
            checker: 'jumps.reach',
            target: { start: a, target: result, allowedJumps: [jump], value: result },
          },
          nudge: [{ op: 'highlight', args: { at: a } }],
          highlight: [{ op: 'highlight', args: { at: a } }],
        };
        break;
      }
      default:
        throw new Error(`addsub.facts cannot build ${t.format}`);
    }
    return finish(addsubFacts, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    const a = asNum(out.params.a);
    const b = asNum(out.params.b);
    const op = asStr(out.params.op, '+');
    const result = factResult(a, b, op);
    if (out.widget.format === 'number-line-jump') {
      return {
        kind: 'state',
        value: { jumps: new Array<number>(b).fill(op === '-' ? -1 : 1), value: result },
      };
    }
    const frames = out.widget.format === 'tenframe-fill' ? out.widget.frames : 1;
    const cells = Array.from({ length: frames }, (_, f) =>
      Array.from({ length: 10 }, (_, i) => {
        const k = f * 10 + i;
        if (op === '-') return k < result ? 1 : 0;
        return k < a ? 1 : k < result ? 2 : 0;
      }),
    );
    return { kind: 'state', value: { cells, value: result } };
  },
  solution(out): LessonStep[] {
    const a = asNum(out.params.a);
    const b = asNum(out.params.b);
    const op = asStr(out.params.op, '+');
    const unknown = asStr(out.params.unknown, 'result');
    const result = factResult(a, b, op);
    const answer = unknown === 'change' ? b : unknown === 'start' ? a : result;
    const w = out.widget;
    switch (w.format) {
      case 'number-pad':
        return [
          say('gen.addsub.facts.start-at', { a, b }, { op: 'highlight', args: { token: 'x' } }),
          say(
            'gen.addsub.facts.answer',
            { n: answer },
            { op: 'type', args: { blank: 'x', value: answer } },
          ),
        ];
      case 'numeral-pick':
        return [
          say('gen.addsub.facts.start-at', { a, b }),
          say(
            'gen.addsub.facts.answer',
            { n: answer },
            { op: 'tap', args: { id: numberOptionId(answer) } },
          ),
        ];
      case 'tenframe-fill': {
        const steps: LessonStep[] = [
          say('gen.addsub.facts.join', { a, b }, { op: 'show-addends' }),
        ];
        if (op === '-') {
          // Take away from the last frame that has counters, then the one before it.
          let left = b;
          for (let f = w.frames - 1; f >= 0 && left > 0; f -= 1) {
            const inFrame = Math.max(0, Math.min(10, a - f * 10));
            const n = Math.min(left, inFrame);
            if (n > 0)
              steps.push(
                say(
                  'gen.addsub.facts.count-on',
                  { n },
                  { op: 'remove', args: { frame: f, count: n } },
                ),
              );
            left -= n;
          }
        } else {
          steps.push(
            say(
              'gen.addsub.facts.count-on',
              { n: b },
              {
                op: 'place',
                args: { frame: a >= 10 ? 1 : 0, count: b, color: 'b' },
              },
            ),
          );
        }
        steps.push(say('gen.addsub.facts.answer', { n: result }, { op: 'count-total' }));
        return steps;
      }
      case 'number-line-jump': {
        const jump = op === '-' ? -1 : 1;
        const steps: LessonStep[] = [
          say('gen.addsub.facts.start-at', { a, b }, { op: 'highlight', args: { at: a } }),
        ];
        for (let i = 1; i <= b; i += 1) {
          steps.push(
            say(
              'gen.addsub.facts.count-on',
              { n: a + jump * i },
              { op: 'hop', args: { by: jump } },
            ),
          );
        }
        steps.push(say('gen.addsub.facts.answer', { n: result }, { op: 'label-landing' }));
        return steps;
      }
      default:
        return [];
    }
  },
};
