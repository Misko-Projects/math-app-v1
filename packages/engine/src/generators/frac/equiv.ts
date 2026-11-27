// frac.equiv (03 §5.6): two names for the same amount (#17 slice 5c: FRA.05, FRA.17). `num`/`den`
// is a/b and `mult` m makes the second bottom number d = m·b; only d ≤ 8 is drawn, so the pairs are
// 1/2 = 2/4 = 3/6 = 4/8, 1/3 = 2/6, 2/3 = 4/6, 1/4 = 2/8, 3/4 = 6/8 (and, on a line to 2, the
// halves past one: 3/2 = 6/4).
// - fraction-line `place`: a line (or a strip) cut into d parts a whole, the goal card shows a/b;
//   put the dot at a/b. It lands on tick m·a. Ticks the child taps stay ≥ 64 px apart at 960 × 600
//   (frac.line's bound: d ≤ 8 on 0–1; on 0–2 d ≤ 4).
// - number-pad `pad`: a/b = [?]/d (`missing: num`) or a/b = c/[?] (`missing: den`, c = m·a), the
//   unknown a box inside the stacked fraction. With `picture`, two strips of one whole stand above
//   it: the top in b parts with a shaded, the bottom in d parts with none shaded (missing top
//   number only; for a missing bottom number the strip would show it).
// The other number is always given, so exactly one answer is true (no equivalent-answer rule).
// Every line says a fraction in words (`fracw`); steps before the last name no asked number.

import type { LessonStep, ResponseValue, StimulusSpec } from '@number-island/shared';
import { asNum, asStr, correctFromAnswer, finish, pickVars, sampleAll } from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';
import { lineFits, lineLabels } from './line';

export const EQUIV_DENS = [2, 3, 4] as const;
/** The biggest second bottom number d = m·b. */
export const EQUIV_MAX_DEN = 8;
const MODES = ['place', 'pad'] as const;
const MISSING = ['num', 'den'] as const;
const SKINS = ['line', 'strip'] as const;

const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));

/** The second bottom number. */
export const equivDen = (den: number, mult: number): number => den * mult;

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const frac = (a: number, b: number) => `${a}/${b}`;

/** The expression `a/b = c/d` with the asked number a box (token 2, top or bottom). */
function sentence(a: number, b: number, c: number, d: number, missing: string): StimulusSpec {
  return {
    kind: 'expression',
    expr: {
      tokens: [
        { t: 'frac', a, b },
        { t: 'rel', v: '=' },
        missing === 'den' ? { t: 'frac', a: c, b: 'blank' } : { t: 'frac', a: 'blank', b: d },
      ],
    },
  };
}

export const fracEquiv: GeneratorDef = {
  id: 'frac.equiv',
  formats: ['fraction-line', 'number-pad'],
  params: {
    mode: {
      type: 'string',
      values: [...MODES],
      default: { kind: 'choice', values: [...MODES] },
      doc: 'place (fraction-line) or pad (number-pad)',
    },
    num: { type: 'int', default: { kind: 'int', min: 1, max: 3 }, doc: 'the top number a' },
    den: {
      type: 'int',
      default: { kind: 'choice', values: [...EQUIV_DENS] },
      doc: 'the bottom number b: 2, 3 or 4',
    },
    mult: {
      type: 'int',
      default: { kind: 'choice', values: [2, 3, 4] },
      doc: 'm: the second fraction has m·b parts (m·b ≤ 8)',
    },
    max: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'place: the line runs from 0 to max wholes (1 or 2)',
    },
    skin: {
      type: 'string',
      values: [...SKINS],
      default: { kind: 'const', value: 'line' },
      doc: 'place: a line or a strip (filled to the dot)',
    },
    missing: {
      type: 'string',
      values: [...MISSING],
      default: { kind: 'const', value: 'num' },
      doc: 'pad: the box is the top number (num) or the bottom number (den)',
    },
    picture: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'pad with missing num: two strips of one whole above the sentence',
    },
  },
  features: {
    'k.over2': { weight: 0.3, doc: 'the parts are cut into more than 2 (m > 2)' },
    'missing.den': { weight: 0.3, doc: 'the bottom number is the box' },
    nonUnit: { weight: 0.3, doc: 'more than one part (a > 1)' },
    beyondOne: { weight: 0.6, doc: 'past one whole (a line to 2)' },
  },
  narration: [
    'gen.frac.line.parts',
    'gen.frac.equiv.group',
    'gen.frac.equiv.here',
    'gen.frac.equiv.same-whole',
    'gen.frac.equiv.cut',
    'gen.frac.equiv.same',
    'gen.frac.equiv.look-top',
    'gen.frac.equiv.count-bottom',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const num = asNum(p.num);
    const den = asNum(p.den);
    const mult = asNum(p.mult);
    const max = asNum(p.max, 1);
    const mode = asStr(p.mode);
    const d = equivDen(den, mult);
    if (!(EQUIV_DENS as readonly number[]).includes(den) || num < 1) return false;
    if (mult < 2 || d > EQUIV_MAX_DEN) return false;
    // a/b in lowest terms: the named pairs (2/4 = 4/8 is drawn as 1/2 = 4/8).
    if (gcd(num, den) !== 1) return false;
    if (t.format === 'fraction-line') {
      if (mode !== 'place' || p.picture === true || asStr(p.missing, 'num') !== 'num') return false;
      if (max !== 1 && max !== 2) return false;
      // A strip is one whole; a line past 1 keeps its ticks tap-sized.
      if (asStr(p.skin, 'line') === 'strip' && max !== 1) return false;
      if (!lineFits('place', d, max)) return false;
      // Never a whole: a whole is named by its number, not by two fractions.
      return num % den !== 0 && num < den * max;
    }
    if (t.format === 'number-pad') {
      if (mode !== 'pad' || max !== 1 || asStr(p.skin, 'line') !== 'line') return false;
      if (p.picture === true && asStr(p.missing) !== 'num') return false;
      return num < den;
    }
    return false;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    const num = asNum(params.num);
    const den = asNum(params.den);
    const mult = asNum(params.mult);
    const max = asNum(params.max, 1);
    const d = equivDen(den, mult);
    const c = num * mult;
    const missingDen = asStr(params.missing, 'num') === 'den';
    const math: Record<string, number> = {
      'k.over2': mult > 2 ? 1 : 0,
      'missing.den': t.format === 'number-pad' && missingDen ? 1 : 0,
      nonUnit: num > 1 ? 1 : 0,
      beyondOne: num > den ? 1 : 0,
    };
    const vars = pickVars(t, { f: frac(num, den), d, m: mult });
    if (t.format === 'fraction-line') {
      return finish(fracEquiv, ctx, {
        params,
        vars,
        math,
        widget: {
          format: 'fraction-line',
          max: max as 1 | 2,
          denominator: d,
          ticksShown: true,
          labels: lineLabels(num, den, max),
          mode: 'place',
          target: { a: num, b: den },
          skin: asStr(params.skin, 'line') as (typeof SKINS)[number],
          decimalLabels: false,
        },
        answer: { kind: 'placement', value: num / den, min: 0, max, tolerance: 1 / (2 * d) },
      });
    }
    const picture = params.picture === true;
    const expr = sentence(num, den, c, d, missingDen ? 'den' : 'num');
    return finish(fracEquiv, ctx, {
      params,
      vars,
      math,
      widget: {
        format: 'number-pad',
        ...(picture
          ? {
              stimulus: {
                kind: 'fraction',
                shape: 'bar',
                parts: den,
                shaded: num,
                equalParts: true,
                below: { parts: d, shaded: 0 },
              },
              expression: expr.kind === 'expression' ? expr.expr : undefined,
            }
          : { stimulus: expr }),
        blanks: [{ id: missingDen ? 'frac-2-b' : 'frac-2-a', maxDigits: 1 }],
        unit: null,
      },
      answer: { kind: 'number', value: missingDen ? d : c },
    });
  },
  exampleCorrect(out): ResponseValue {
    return correctFromAnswer(out.answer);
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const num = asNum(out.params.num);
    const den = asNum(out.params.den);
    const mult = asNum(out.params.mult);
    const d = equivDen(den, mult);
    const f = frac(num, den);
    const g = frac(num * mult, d);
    // Steps before the last name no asked number: the worked-step hint (level 4) plays them.
    if (w.format === 'fraction-line') {
      return [
        say('gen.frac.line.parts', { u: frac(1, d) }),
        say('gen.frac.equiv.group', { w: frac(1, den) }),
        say('gen.frac.equiv.here', { f, g }, { op: 'hop', args: { k: num * mult } }),
      ];
    }
    if (w.format !== 'number-pad') return [];
    const blank = w.blanks[0]?.id ?? 'frac-2-a';
    const value = blank === 'frac-2-b' ? d : num * mult;
    const type = { op: 'type', args: { blank, value } } as const;
    return w.stimulus.kind === 'fraction'
      ? [
          say('gen.frac.equiv.look-top', {}),
          say('gen.frac.equiv.count-bottom', {}),
          say('gen.frac.equiv.same', { f, g }, type),
        ]
      : [
          say('gen.frac.equiv.same-whole', {}),
          say('gen.frac.equiv.cut', {}),
          say('gen.frac.equiv.same', { f, g }, type),
        ];
  },
};
