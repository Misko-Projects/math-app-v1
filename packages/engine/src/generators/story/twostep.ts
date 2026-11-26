// story.twostep (03 §5.6): two-step addition and subtraction stories within 100 (MDA.19; MDA.20
// adds × and ÷ later). Format: story-problem, one answer box (`steps: 2`).
//
// The story tells a start `a`, then two changes in turn: `b` by the first operation of `ops`, `c`
// by the second ("+-": finds b more, gives away c). The answer is (a op1 b) op2 c; the first step's
// result `r1` is never told and is what MC.first-step-only answers. Contexts: the beach's shells,
// the sawmill's planks in a length unit and the market's money in cents (story.addsub's lines).
//
// The bar model (pictorial tier; the abstract tier shows it only in the hint ladder) is two bars,
// the second under the first, sharing the first step's result (`null`, a blank piece): the order
// of the steps is the order of the bars.

import type { LessonStep, ParamValues, StimulusSpec } from '@number-island/shared';
import { asNum, asStr, correctFromAnswer, finish, sampleAll } from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput, ParamDecl } from '../types';
import { MEASURE_UNITS, STORY_CONTEXTS } from './contexts';

export const TWOSTEP_OPS = ['++', '+-', '--', '-+'] as const;
export type TwoStepOps = (typeof TWOSTEP_OPS)[number];
export const TWOSTEP_CONTEXTS = ['beach-shells', 'sawmill-planks', 'market-stall'] as const;
/** The largest number a two-step story tells or reaches (MDA.19: within 100). */
export const TWOSTEP_MAX_N = 100;

export interface TwoStep {
  ops: TwoStepOps;
  a: number;
  b: number;
  c: number;
  /** The first step's result (never told). */
  r1: number;
  result: number;
}

const num = (v: unknown) => (typeof v === 'number' ? v : 0);
const apply = (x: number, op: string, y: number) => (op === '+' ? x + y : x - y);

export function twoStep(p: ParamValues): TwoStep {
  const ops = (TWOSTEP_OPS as readonly unknown[]).includes(p.ops) ? (p.ops as TwoStepOps) : '+-';
  const a = num(p.a);
  const b = num(p.b);
  const c = num(p.c);
  const r1 = apply(a, ops[0] as string, b);
  return { ops, a, b, c, r1, result: apply(r1, ops[1] as string, c) };
}

const PARAMS: Record<string, ParamDecl> = {
  ops: {
    type: 'string',
    values: [...TWOSTEP_OPS],
    default: { kind: 'choice', values: [...TWOSTEP_OPS] },
    doc: 'the two operations in telling order: ++, +-, --, -+',
  },
  a: { type: 'int', default: { kind: 'int', min: 20, max: 60 }, doc: 'the start' },
  b: { type: 'int', default: { kind: 'int', min: 5, max: 30 }, doc: 'the first change' },
  c: { type: 'int', default: { kind: 'int', min: 5, max: 30 }, doc: 'the second change' },
  context: {
    type: 'string',
    values: [...TWOSTEP_CONTEXTS],
    default: { kind: 'const', value: 'beach-shells' },
    doc: 'beach-shells (shells), sawmill-planks (a plank in `unit`) or market-stall (cents)',
  },
  unit: {
    type: 'string',
    values: ['in', 'cm', 'cent'],
    default: { kind: 'const', value: 'in' },
    doc: 'sawmill-planks: in or cm; market-stall: cent',
  },
  maxN: { type: 'int', default: { kind: 'const', value: 100 }, doc: 'largest number, 100 at most' },
  askReasonable: {
    type: 'int',
    default: { kind: 'const', value: 0 },
    doc: '03 §5.6: is the answer reasonable (MDA.20); 0 here',
  },
};

function valid(p: ParamValues): boolean {
  const s = twoStep(p);
  const maxN = asNum(p.maxN, 100);
  if (maxN > TWOSTEP_MAX_N || asNum(p.askReasonable, 0) !== 0) return false;
  if (Math.min(s.a, s.b, s.c) < 1) return false;
  if (s.r1 < 1 || s.result < 1 || Math.max(s.a, s.b, s.c, s.r1, s.result) > maxN) return false;
  // The answer is never a told number, so the story cannot give it away.
  if ([s.a, s.b, s.c].includes(s.result)) return false;
  const context = asStr(p.context, 'beach-shells');
  if (!(TWOSTEP_CONTEXTS as readonly string[]).includes(context)) return false;
  const measure = STORY_CONTEXTS[context]?.measure;
  const unit = asStr(p.unit, 'in');
  if (measure === 'money') return unit === 'cent';
  if (measure === 'length') return MEASURE_UNITS.length.includes(unit) && unit !== 'cent';
  return true;
}

type Line = { key: string; vars: Record<string, string | number> };

/** The story: the start, the two changes in turn, and the question. */
export function twoStepLines(s: TwoStep, context: string, unit: string): Line[] {
  const measure = STORY_CONTEXTS[context]?.measure;
  const last = s.ops[1];
  if (!measure) {
    const base = { who: '@resident', item: 'shell', many: 2 };
    const L = (key: string, vars: Record<string, string | number> = {}): Line => ({
      key,
      vars: { ...base, ...vars },
    });
    const change = (op: string, n: number) =>
      L(`p.story.beach-shells.${op === '+' ? 'add' : 'take'}`, { b: n });
    return [
      L('p.story.has', { a: s.a }),
      change(s.ops[0] as string, s.b),
      change(last as string, s.c),
      L(last === '+' ? 'p.story.q.now' : 'p.story.q.left'),
    ];
  }
  const p = measure === 'length' ? 'p.story.len' : 'p.story.money';
  const L = (k: string, vars: Record<string, string | number> = {}): Line => ({
    key: `${p}.${k}`,
    vars: { who: '@resident', unit, many: 2, ...vars },
  });
  // Money spends on an apple, then on a kite.
  const take2 = measure === 'money' && s.ops === '--' ? 'take2' : 'take';
  return [
    L('has', { n: s.a }),
    L(s.ops[0] === '+' ? 'add' : 'take', { n: s.b }),
    L(last === '+' ? 'add' : take2, { n: s.c }),
    L(measure === 'money' && last === '-' ? 'q.left' : 'q.now'),
  ];
}

/** The two bars: the first step over the second, sharing the first step's result (null). */
export function twoStepBar(s: TwoStep): StimulusSpec {
  const top =
    s.ops[0] === '+'
      ? { parts: [s.a, s.b], whole: null }
      : { parts: [s.b, null], whole: s.a };
  const lower =
    s.ops[1] === '+'
      ? { parts: [null, s.c], whole: '?' as const }
      : { parts: [s.c, '?' as const], whole: null };
  return { kind: 'bar-model', ...top, lower };
}

const say = (key: string, vars: Record<string, string | number>, action?: LessonStep['action']) =>
  (action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars }) as LessonStep;

/** A step's line: "34 and 18 make 52." or "52 take away 25 leaves 27." */
const stepLine = (x: number, op: string, y: number, n: number, parts: number[]) =>
  say(op === '+' ? 'gen.story.twostep.join' : 'gen.story.twostep.take', { x, y, n }, {
    op: 'draw-bar',
    args: { parts },
  });

export const storyTwostep: GeneratorDef = {
  id: 'story.twostep',
  formats: ['story-problem'],
  params: PARAMS,
  derived: ['result'],
  features: {
    'ops.mixed': { weight: 0.4, doc: 'one step adds and the other takes away' },
    mulDiv: { weight: 0.5, doc: 'a step multiplies or divides (MDA.20; 0 here)' },
    reasonable: { weight: 0.3, doc: 'asks whether the answer is reasonable (MDA.20; 0 here)' },
    size: { weight: 0.3, doc: 'the largest number of the story, per 20' },
  },
  narration: [
    'p.story.has',
    'p.story.q.now',
    'p.story.q.left',
    'p.story.beach-shells.add',
    'p.story.beach-shells.take',
    'p.story.len.has',
    'p.story.len.add',
    'p.story.len.take',
    'p.story.len.q.now',
    'p.story.money.has',
    'p.story.money.add',
    'p.story.money.take',
    'p.story.money.take2',
    'p.story.money.q.now',
    'p.story.money.q.left',
    'gen.story.twostep.listen',
    'gen.story.twostep.join',
    'gen.story.twostep.take',
    'gen.story.twostep.answer',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: (p) => ({ result: twoStep(p).result }),
  accepts: (p) => valid(p),
  exampleCorrect: (out) => correctFromAnswer(out.answer),
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    if (!valid(params)) throw new RangeError('story.twostep: invalid story');
    const s = twoStep(params);
    const context = asStr(params.context, 'beach-shells');
    const unit = asStr(params.unit, 'in');
    const bar = twoStepBar(s);
    return finish(storyTwostep, ctx, {
      params,
      vars: { a: s.a, b: s.b, c: s.c },
      math: {
        'ops.mixed': s.ops[0] === s.ops[1] ? 0 : 1,
        mulDiv: 0,
        reasonable: 0,
        size: Math.max(s.a, s.b, s.c, s.r1, s.result) / 20,
      },
      widget: {
        format: 'story-problem',
        context,
        scene: t.tier === 'abstract' ? { kind: 'none' } : bar,
        lines: twoStepLines(s, context, unit),
        situation: 'two-step',
        steps: 2,
        workspace: 'none',
        blanks: [{ id: 'x', maxDigits: asNum(params.maxN, 100) >= 100 ? 3 : 2 }],
        showText: true,
      },
      answer: { kind: 'number', value: s.result },
      overlay: bar,
    });
  },
  solution(out): LessonStep[] {
    const s = twoStep(out.params);
    const w = out.widget;
    const lines = w.format === 'story-problem' ? w.lines.length : 1;
    const [op1, op2] = [s.ops[0] as string, s.ops[1] as string];
    return [
      say('gen.story.twostep.listen', {}, { op: 'highlight-line', args: { index: lines - 1 } }),
      stepLine(s.a, op1, s.b, s.r1, op1 === '+' ? [s.a, s.b] : [s.b, s.r1]),
      stepLine(s.r1, op2, s.c, s.result, op2 === '+' ? [s.r1, s.c] : [s.c, s.result]),
      say(
        'gen.story.twostep.answer',
        { n: s.result },
        { op: 'answer', args: { value: s.result } },
      ),
    ];
  },
};
