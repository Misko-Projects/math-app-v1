// frac.line (03 §5.6): fractions as numbers on a number line (#17 slice 5b: FRA.04, FRA.10,
// FRA.11, FRA.12). `num`/`den` is the fraction a/b, `max` the line's length in wholes.
// - fraction-line `place`: put the dot at a/b on a line (skin line, strip or ruler) with the
//   ticks given, b parts a whole; it must land on the tick. `read`: a flag stands at a/b, type
//   [a, b] on the pads (exact: an equal fraction is wrong and claims no misconception).
// - fraction-pick `name`: a number-line picture from 0 to 1 in b parts with a dot at a/b (named
//   by the dot's counted tick), or with `words` no picture: a path of b equal steps, 1 or more
//   taken (the abstract tier). Answer [a, b].
// - number-pad `between`: a/b > 1 drawn stacked between two blanks, `[ ] < a/b < [ ]`: the
//   whole numbers it lies between, smaller first. Never a whole (a is not a multiple of b).
// - number-pad `wholes`: `a/b = [ ]` with a = k·b, k 1–3: how many wholes.
// Bounds at 960 × 600 (task 0 of the slice): a tick the child taps is ≥ 64 px from the next, so a
// place line is 0–1 in any of 2, 3, 4, 6, 8 parts, 0–2 in halves, thirds or fourths, or 0–3 in
// halves; a read line (count only, ≥ 22 px) is 0–1 in any of them or 0–2 in halves to fourths.
// Labels: only numbers that are wholes, never a fraction, so the asked point is never labelled. A
// whole target (FRA.12) labels only the ends and stands inside the line, so its number is not
// shown either. Every line says a fraction in words (`fracw`), never as a/b text.

import type { LessonStep, ResponseValue } from '@number-island/shared';
import { asNum, asStr, correctFromAnswer, finish, pickVars, sampleAll } from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

export const LINE_DENS = [2, 3, 4, 6, 8] as const;
const MODES = ['place', 'read', 'name', 'between', 'wholes'] as const;
const SKINS = ['line', 'strip', 'ruler'] as const;

/** The most parts on a line the child taps (≥ 64 px a tick at 960 × 600). */
export const PLACE_MAX_PARTS = 8;
/** The most parts on a line the child only counts (≥ 22 px a tick beside the pads). */
export const READ_MAX_PARTS = 8;

/** Whether `den` parts a whole on `max` wholes fit the mode's bound. */
export function lineFits(mode: string, den: number, max: number): boolean {
  if (max === 1) return true;
  const parts = den * max;
  return parts <= (mode === 'place' ? PLACE_MAX_PARTS : READ_MAX_PARTS) && den <= 4;
}

/** The labels a line draws: wholes past 1; a whole target labels only the ends (FRA.12). */
export function lineLabels(num: number, den: number, max: number): 'ends' | 'wholes' {
  return max === 1 || num % den === 0 ? 'ends' : 'wholes';
}

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const frac = (a: number, b: number) => `${a}/${b}`;

export const fracLine: GeneratorDef = {
  id: 'frac.line',
  formats: ['fraction-line', 'fraction-pick', 'number-pad'],
  params: {
    mode: {
      type: 'string',
      values: [...MODES],
      // Templates always set it; the default lets every format build from defaults.
      default: { kind: 'choice', values: [...MODES] },
      doc: 'place or read (fraction-line), name (fraction-pick), between or wholes (number-pad)',
    },
    num: { type: 'int', default: { kind: 'int', min: 1, max: 16 }, doc: 'the top number a' },
    den: {
      type: 'int',
      default: { kind: 'choice', values: [...LINE_DENS] },
      doc: 'the bottom number b: 2, 3, 4, 6 or 8',
    },
    max: {
      type: 'int',
      default: { kind: 'choice', values: [1, 2, 3] },
      doc: 'the line runs from 0 to max wholes (1–3)',
    },
    skin: {
      type: 'string',
      values: [...SKINS],
      default: { kind: 'const', value: 'line' },
      doc: 'fraction-line: a line, a strip (its parts are the jumps) or a ruler',
    },
    words: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'name: no picture; a path of den equal steps, num taken (abstract tier)',
    },
  },
  features: {
    denominator: { weight: 0.1, doc: 'den − 2 (the fraction-line feature, 03 §5.5)' },
    nonUnit: { weight: 0.3, doc: 'more than one part (a > 1)' },
    beyondOne: { weight: 0.6, doc: 'past one whole (the fraction-line feature, 03 §5.5)' },
  },
  narration: [
    'gen.frac.line.parts',
    'gen.frac.line.hop',
    'gen.frac.line.here',
    'gen.frac.line.count-bottom',
    'gen.frac.line.count-top',
    'gen.frac.line.flag-at',
    'gen.frac.line.dot-at',
    'gen.frac.line.path-bottom',
    'gen.frac.line.path-top',
    'gen.frac.line.path-walked',
    'gen.frac.line.group-whole',
    'gen.frac.line.between',
    'gen.frac.line.groups',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const num = asNum(p.num);
    const den = asNum(p.den);
    const max = asNum(p.max, 1);
    const mode = asStr(p.mode);
    const skin = asStr(p.skin, 'line');
    if (!(LINE_DENS as readonly number[]).includes(den) || num < 1) return false;
    if (max < 1 || max > 3) return false;
    if (p.words === true && (mode !== 'name' || t.format !== 'fraction-pick')) return false;
    switch (t.format) {
      case 'fraction-line': {
        if (mode !== 'place' && mode !== 'read') return false;
        if (!lineFits(mode, den, max) || num > den * max) return false;
        // A strip (one bar a whole, its parts the jumps) is for placing; a read line is a line or
        // a ruler, and a ruler is one whole.
        if (skin === 'strip' && mode !== 'place') return false;
        if (skin === 'ruler' && max !== 1) return false;
        // A whole target stands inside a line labelled only at its ends (its number not shown).
        if (num % den === 0) return num < den * max;
        return true;
      }
      case 'fraction-pick':
        return mode === 'name' && max === 1 && num < den;
      case 'number-pad':
        if (mode === 'between') return num > den && num % den !== 0 && num < 3 * den;
        if (mode === 'wholes') return num % den === 0 && num / den <= 3;
        return false;
      default:
        return false;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    const num = asNum(params.num);
    const den = asNum(params.den);
    const max = asNum(params.max, 1);
    const mode = asStr(params.mode);
    const v = num / den;
    const lo = Math.floor(v);
    const math: Record<string, number> = {
      denominator: den - 2,
      nonUnit: num > 1 ? 1 : 0,
      beyondOne: v > 1 ? 1 : 0,
    };
    const vars = pickVars(t, {
      f: frac(num, den),
      num,
      den,
      max,
      k: num / den,
      lo,
      hi: lo + 1,
    });
    if (t.format === 'fraction-line') {
      const widget = {
        format: 'fraction-line' as const,
        max: max as 1 | 2 | 3,
        denominator: den,
        ticksShown: true,
        labels: lineLabels(num, den, max),
        mode: mode as 'place' | 'read',
        target: { a: num, b: den },
        skin: asStr(params.skin, 'line') as (typeof SKINS)[number],
        decimalLabels: false,
      };
      return finish(fracLine, ctx, {
        params,
        vars,
        math,
        widget,
        answer:
          mode === 'place'
            ? { kind: 'placement', value: v, min: 0, max, tolerance: 1 / (2 * den) }
            : { kind: 'numbers', values: [num, den], ordered: true },
      });
    }
    if (t.format === 'fraction-pick') {
      const words = params.words === true;
      return finish(fracLine, ctx, {
        params,
        vars,
        math,
        widget: {
          format: 'fraction-pick',
          mode: 'name',
          nameInput: 'pads',
          ...(words
            ? {}
            : {
                stimulus: {
                  kind: 'number-line',
                  min: 0,
                  max: 1,
                  ticksEvery: 1 / den,
                  labelsEvery: 1,
                  marks: [{ at: v }],
                },
              }),
        },
        answer: { kind: 'numbers', values: [num, den], ordered: true },
      });
    }
    // number-pad
    if (mode === 'between') {
      return finish(fracLine, ctx, {
        params,
        vars,
        math,
        widget: {
          format: 'number-pad',
          stimulus: {
            kind: 'expression',
            expr: {
              tokens: [
                { t: 'blank', id: 'lo' },
                { t: 'rel', v: '<' },
                { t: 'frac', a: num, b: den },
                { t: 'rel', v: '<' },
                { t: 'blank', id: 'hi' },
              ],
            },
          },
          blanks: [
            { id: 'lo', maxDigits: 1 },
            { id: 'hi', maxDigits: 1 },
          ],
          unit: null,
        },
        answer: { kind: 'numbers', values: [lo, lo + 1], ordered: true },
      });
    }
    return finish(fracLine, ctx, {
      params,
      vars,
      math,
      widget: {
        format: 'number-pad',
        stimulus: {
          kind: 'expression',
          expr: {
            tokens: [
              { t: 'frac', a: num, b: den },
              { t: 'rel', v: '=' },
              { t: 'blank', id: 'x' },
            ],
          },
        },
        blanks: [{ id: 'x', maxDigits: 2 }],
        unit: null,
      },
      answer: { kind: 'number', value: num / den },
    });
  },
  exampleCorrect(out): ResponseValue {
    return correctFromAnswer(out.answer);
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const num = asNum(out.params.num);
    const den = asNum(out.params.den);
    const f = frac(num, den);
    const unit = frac(1, den);
    const whole = frac(den, den);
    // Steps before the last name no asked number: the worked-step hint (level 4) plays them.
    // Placing, only the last step acts: its hops put the dot (a hop moves it), so neither a hint
    // nor the demo before a faded example's child step places the dot for the child (PR #140
    // review).
    if (w.format === 'fraction-line' && w.mode === 'place') {
      return [
        say('gen.frac.line.parts', { u: unit }),
        say('gen.frac.line.hop', {}),
        say('gen.frac.line.here', { f }, { op: 'hop', args: { k: num } }),
      ];
    }
    const answer = { op: 'answer', args: { values: [num, den] } } as const;
    if (w.format === 'fraction-line') {
      return [
        say('gen.frac.line.count-bottom', {}),
        say('gen.frac.line.count-top', {}),
        say('gen.frac.line.flag-at', { f }, answer),
      ];
    }
    if (w.format === 'fraction-pick') {
      return w.stimulus
        ? [
            say('gen.frac.line.count-bottom', {}),
            say('gen.frac.line.count-top', {}),
            say('gen.frac.line.dot-at', { f }, answer),
          ]
        : [
            say('gen.frac.line.path-bottom', {}),
            say('gen.frac.line.path-top', {}),
            say('gen.frac.line.path-walked', { f }, answer),
          ];
    }
    const a = out.answer;
    if (a.kind === 'numbers') {
      const [lo, hi] = a.values as [number, number];
      return [
        say('gen.frac.line.group-whole', {}),
        say('gen.frac.line.between', { f, lo, hi }, { op: 'answer', args: { values: [lo, hi] } }),
      ];
    }
    const k = a.kind === 'number' ? a.value : 0;
    return [
      say('gen.frac.line.group-whole', {}),
      say(
        'gen.frac.line.groups',
        { w: whole, f, k },
        { op: 'type', args: { blank: 'x', value: k } },
      ),
    ];
  },
};
