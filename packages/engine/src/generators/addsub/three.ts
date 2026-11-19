// addsub.three (03 §5.6): add three numbers, making ten first when two of them make ten (ADD.13).
// Formats: number-pad, tenframe-fill, number-bond. Derived: `result` (a + b + c) and `hasTenPair`
// (1 when two of the addends make ten). The worked solution adds the ten pair first (in the order
// a + b, a + c, b + c), then the third number; without a pair it adds in order.
//
// - tenframe-fill: two frames (one when the sum is at most 10), `a` counters prefilled in frame 0;
//   the child puts in b and c and types the total (`tenframe.total` with `value`). When a is in the
//   ten pair, its partner fills frame 0 first; when b and c make ten, they fill frame 1.
// - number-pad: a + b + c = _. The pictorial tier shows ten-frames (each addend in turn coloured a,
//   b, a) or a number bond of the ten pair's sum and the third number.
// - number-bond: the whole is missing; the parts are the ten pair's sum and the third number (with
//   no pair, a + b and c).

import type { LessonStep, ParamValues, ResponseValue, StimulusSpec } from '@number-island/shared';
import {
  asNum,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

export interface ThreeParts {
  a: number;
  b: number;
  c: number;
  result: number;
  /** The two addends added first (the ten pair when there is one) and the one left. */
  first: [number, number];
  firstIdx: [number, number];
  other: number;
  tenPair: boolean;
}

export function threeParts(p: ParamValues): ThreeParts {
  const a = asNum(p.a);
  const b = asNum(p.b);
  const c = asNum(p.c);
  const xs = [a, b, c];
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  const pair = pairs.find(([i, j]) => (xs[i] as number) + (xs[j] as number) === 10);
  const [i, j] = pair ?? [0, 1];
  const k = [0, 1, 2].find((x) => x !== i && x !== j) as number;
  return {
    a,
    b,
    c,
    result: a + b + c,
    first: [xs[i] as number, xs[j] as number],
    firstIdx: [i, j],
    other: xs[k] as number,
    tenPair: pair !== undefined,
  };
}

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

/** Ten-frames holding the three addends in turn (colours a, b, a). */
function framesPicture(f: ThreeParts): StimulusSpec {
  const frames: 1 | 2 = f.result > 10 ? 2 : 1;
  const filled = frames === 2 ? [10, f.result - 10] : [f.result];
  const colorAt = (k: number): 'a' | 'b' => (k < f.a ? 'a' : k < f.a + f.b ? 'b' : 'a');
  return {
    kind: 'ten-frame',
    frames,
    filled,
    colors: filled.map((n, fr) => Array.from({ length: n }, (_, i) => colorAt(fr * 10 + i))),
  };
}

/** The first line of a solution: the ten pair, or the first two numbers (never the answer). */
function firstLine(f: ThreeParts, action?: LessonStep['action']): LessonStep {
  const [x, y] = f.first;
  return f.tenPair
    ? say('gen.addsub.three.find-ten', { x, y }, action)
    : say('gen.addsub.three.first-two', { x, y, n: x + y }, action);
}

/** The answer line: ten and the rest, or the total. */
function lastLine(f: ThreeParts, action: LessonStep['action']): LessonStep {
  return f.tenPair
    ? say('gen.addsub.three.ten-and', { k: f.other, n: f.result }, action)
    : say('gen.addsub.three.answer', { n: f.result }, action);
}

export const addsubThree: GeneratorDef = {
  id: 'addsub.three',
  formats: ['number-pad', 'tenframe-fill', 'number-bond'],
  params: {
    a: { type: 'int', default: { kind: 'int', min: 1, max: 9 }, doc: 'first number' },
    b: { type: 'int', default: { kind: 'int', min: 1, max: 9 }, doc: 'second number' },
    c: { type: 'int', default: { kind: 'int', min: 1, max: 9 }, doc: 'third number' },
    maxSum: { type: 'int', default: { kind: 'const', value: 20 }, doc: 'largest sum' },
  },
  derived: ['result', 'hasTenPair'],
  features: {
    'sum.over10': { weight: 0.4, doc: 'the sum is more than 10' },
    hasTenPair: { weight: -0.4, doc: 'two of the numbers make ten' },
    bridge10: { weight: 0.3, doc: 'no ten pair, and the sum passes ten' },
    size: { weight: 0.3, doc: 'max(0, sum − 10) / 5: the ones past the ten' },
  },
  narration: [
    'gen.addsub.three.find-ten',
    'gen.addsub.three.first-two',
    'gen.addsub.three.put',
    'gen.addsub.three.ten-and',
    'gen.addsub.three.answer',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive(p) {
    const f = threeParts(p);
    return { result: f.result, hasTenPair: f.tenPair ? 1 : 0 };
  },
  accepts(p) {
    const f = threeParts(p);
    return Math.min(f.a, f.b, f.c) >= 0 && f.result <= Math.min(20, asNum(p.maxSum, 20));
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    const f = threeParts(params);
    if (f.result > 20 || Math.min(f.a, f.b, f.c) < 0) {
      throw new RangeError('addsub.three: the sum must be 0–20');
    }
    const vars = pickVars(t, { a: f.a, b: f.b, c: f.c });
    const math = {
      'sum.over10': f.result > 10 ? 1 : 0,
      hasTenPair: f.tenPair ? 1 : 0,
      bridge10: !f.tenPair && f.result > 10 ? 1 : 0,
      size: Math.max(0, f.result - 10) / 5,
    };
    const expression = {
      tokens: [
        { t: 'num' as const, v: f.a },
        { t: 'op' as const, v: '+' as const },
        { t: 'num' as const, v: f.b },
        { t: 'op' as const, v: '+' as const },
        { t: 'num' as const, v: f.c },
        { t: 'rel' as const, v: '=' as const },
        { t: 'blank' as const, id: 'x' },
      ],
    };
    const bond: StimulusSpec = {
      kind: 'number-bond',
      whole: '?',
      parts: [f.first[0] + f.first[1], f.other],
    };
    let p: PartialOutput;
    switch (t.format) {
      case 'number-pad': {
        const picture = t.representation === 'number-bond' ? bond : framesPicture(f);
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: t.tier === 'abstract' ? { kind: 'none' } : picture,
            expression,
            blanks: [{ id: 'x', maxDigits: 2 }],
            unit: null,
          },
          answer: { kind: 'number', value: f.result },
          overlay: picture,
        };
        break;
      }
      case 'tenframe-fill': {
        const frames: 1 | 2 = f.result > 10 ? 2 : 1;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'tenframe-fill',
            frames,
            size: 10,
            prefilled: f.a > 0 ? [{ frame: 0, color: 'a', count: f.a }] : [],
            goal: 'add',
            a: f.a,
            b: f.b + f.c,
            requireStandardFill: false,
            thenAsk: 'total',
            skin: 'frame',
          },
          answer: {
            kind: 'state',
            checker: 'tenframe.total',
            target: { n: f.result, value: f.result },
          },
          highlight: [{ op: 'show-addends' }],
        };
        break;
      }
      case 'number-bond':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-bond',
            whole: null,
            parts: [f.first[0] + f.first[1], f.other],
            mode: 'missing-whole',
            counters: t.tier === 'concrete',
            nonZero: false,
          },
          answer: { kind: 'number', value: f.result },
          highlight: [{ op: 'highlight', args: { slot: 'part-0' } }],
        };
        break;
      default:
        throw new Error(`addsub.three cannot build ${t.format}`);
    }
    return finish(addsubThree, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state' || out.widget.format !== 'tenframe-fill') {
      return correctFromAnswer(out.answer);
    }
    const f = threeParts(out.params);
    const cells = Array.from({ length: out.widget.frames }, (_, fr) =>
      Array.from({ length: 10 }, (_, i) => {
        const k = fr * 10 + i;
        return k < f.a ? 1 : k < f.result ? 2 : 0;
      }),
    );
    return { kind: 'state', value: { cells, value: f.result } };
  },
  solution(out): LessonStep[] {
    const f = threeParts(out.params);
    const w = out.widget;
    switch (w.format) {
      case 'number-pad':
        return [
          firstLine(
            f,
            w.stimulus.kind !== 'none'
              ? { op: 'show-stimulus' }
              : { op: 'highlight', args: { token: 'x' } },
          ),
          lastLine(f, { op: 'type', args: { blank: 'x', value: f.result } }),
        ];
      case 'number-bond':
        return [
          firstLine(f, { op: 'highlight', args: { slot: 'part-0' } }),
          lastLine(f, { op: 'fill', args: { slot: 'whole', value: f.result } }),
        ];
      case 'tenframe-fill': {
        // a is in frame 0. Put in the numbers to add in the pair-first order: a's partner fills
        // frame 0; when b and c make ten, they fill frame 1 together.
        // Pairs are (a, b), (a, c) or (b, c), and no pair adds a + b first, so `first` starts
        // with a unless b and c make ten.
        const withA = f.firstIdx[0] === 0;
        const rest = withA ? [f.first[1], f.other] : [f.first[0], f.first[1]];
        const pairInFrameOne = !withA && w.frames === 2;
        const steps: LessonStep[] = [firstLine(f, { op: 'show-addends' })];
        for (const n of rest) {
          if (n <= 0) continue;
          steps.push(
            say(
              'gen.addsub.three.put',
              { n },
              { op: 'place', args: { frame: pairInFrameOne ? 1 : 0, count: n, color: 'b' } },
            ),
          );
        }
        steps.push(lastLine(f, { op: 'count-total' }));
        return steps;
      }
      default:
        return [];
    }
  },
};
