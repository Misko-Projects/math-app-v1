// frac.compare (03 §5.6): compare fractions of the same whole. K01 builds `kind: sameNum` with one
// part of each whole (FRA.08: more equal parts means smaller parts) in two formats:
// - compare: two wholes of the same size, cut into `den` and `den2` equal parts with one part
//   shaded; which shaded piece is bigger (`left`, `right` or `same` when den = den2)?
// - order: two or three strips (`den3` = 0: two) cut into `den`, `den2` (and `den3`) equal
//   parts, one part shaded each, all cut differently; put them in order, biggest piece first.
//   Each item's value is the piece size in 24ths of the whole (24 / den, so 2 → 12, 3 → 8,
//   4 → 6, 6 → 4, 8 → 3), and the answer lists them largest first. With the `symbols`
//   representation (FRA.08's abstract tier) a card has no picture: its label is the part count
//   (`"<den>"`), so the order rests on "more parts, smaller pieces" alone.
// Pictures carry no numeral or name: the child compares by looking at the parts.

import type { LessonStep, ParamValues, ResponseValue, StimulusSpec } from '@number-island/shared';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';
import { fractionPicture } from './partition';

const KINDS = ['sameNum', 'sameDen', 'benchmark'] as const;
const SHAPES = ['bar', 'circle', 'rect'] as const;
/** Denominators whose pieces are whole 24ths, so piece sizes are integers. */
export const PIECE_DENS = [2, 3, 4, 6, 8] as const;

/** Piece size in 24ths of the whole. */
export const pieceSize = (den: number): number => 24 / den;

/** The dens an item compares (den3 = 0: two). */
export function itemDens(p: ParamValues): number[] {
  const d3 = asNum(p.den3);
  return [asNum(p.den), asNum(p.den2), ...(d3 > 0 ? [d3] : [])];
}

/**
 * Closeness of the hardest pair: smaller ÷ larger denominator of the two closest wholes (0 when
 * two are equal, which the `equal` feature weighs instead). 2 and 4 → 0.5; 6 and 8 → 0.75.
 */
export function denRatio(dens: readonly number[]): number {
  const s = [...dens].sort((a, b) => a - b);
  let best = 0;
  for (let i = 1; i < s.length; i += 1) {
    const a = s[i - 1] as number;
    const b = s[i] as number;
    if (a !== b) best = Math.max(best, a / b);
  }
  return Math.round(best * 100) / 100;
}

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const fracCompare: GeneratorDef = {
  id: 'frac.compare',
  formats: ['compare', 'order'],
  params: {
    kind: {
      type: 'string',
      values: [...KINDS],
      default: { kind: 'const', value: 'sameNum' },
      doc: 'sameNum (K01: one part of each whole), sameDen or benchmark (K02)',
    },
    num: { type: 'int', default: { kind: 'const', value: 1 }, doc: 'shaded parts of each whole' },
    den: { type: 'int', default: { kind: 'choice', values: [...PIECE_DENS] }, doc: 'first whole' },
    den2: {
      type: 'int',
      default: { kind: 'choice', values: [...PIECE_DENS] },
      doc: 'second whole',
    },
    den3: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'order: third whole (0: compare two)',
    },
    shape: {
      type: 'string',
      values: [...SHAPES],
      default: { kind: 'const', value: 'bar' },
      doc: 'bar (a strip), circle or rect; order always uses strips',
    },
  },
  features: {
    sameNum: { weight: 0.6, doc: 'same numerator, different denominators' },
    benchmark: { weight: 0.4, doc: 'compared with 1/2 or 1 (K02)' },
    equal: { weight: 0.4, doc: 'both wholes are cut the same way' },
    ratio: {
      weight: 0.6,
      doc: 'smaller ÷ larger denominator of the closest pair (close sizes are harder to tell)',
    },
  },
  narration: [
    // its order retry line (items/check.ts retryFeedback)
    'fb.order.retry-pieces',
    'gen.frac.compare.look',
    'gen.frac.compare.bigger',
    'gen.frac.compare.same',
    'gen.frac.compare.fewer',
    'gen.frac.compare.order-first',
    'gen.frac.compare.order-next',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    if (asStr(p.kind) !== 'sameNum' || asNum(p.num) !== 1) return false;
    const dens = itemDens(p);
    if (!dens.every((d) => (PIECE_DENS as readonly number[]).includes(d))) return false;
    if (t.format === 'order') {
      return new Set(dens).size === dens.length && asStr(p.shape) === 'bar';
    }
    return t.format === 'compare' && dens.length === 2;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const dens = itemDens(params);
    const shape = asStr(params.shape, 'bar') as (typeof SHAPES)[number];
    const pic = (den: number): StimulusSpec => fractionPicture(shape, den, 1, true);
    const vars = pickVars(t, {});
    const equal = dens.length === 2 && dens[0] === dens[1];
    const math: Record<string, number> = {
      sameNum: equal ? 0 : 1,
      equal: equal ? 1 : 0,
      ratio: denRatio(dens),
    };
    let p: PartialOutput;
    if (t.format === 'compare') {
      const [a, b] = dens as [number, number];
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'compare',
          left: pic(a),
          right: pic(b),
          ask: 'more',
          allowMatchLines: false,
        },
        answer: { kind: 'choice', id: a === b ? 'same' : a < b ? 'left' : 'right' },
      };
    } else {
      const shown = rng.fork('layout').shuffle(dens);
      const counts = t.representation === 'symbols';
      p = {
        params,
        vars,
        // The order model's magnitude feature counts digits of the values; piece sizes in 24ths
        // are not magnitudes, so it is always 0 here.
        math: { ...math, magnitude: 0 },
        widget: {
          format: 'order',
          items: shown.map((d, i) => ({
            id: `obj-${i}`,
            value: pieceSize(d),
            ...(counts ? { label: String(d) } : { stimulus: pic(d) }),
          })),
          direction: 'desc',
        },
        answer: {
          kind: 'numbers',
          values: dens.map(pieceSize).sort((x, y) => y - x),
          ordered: true,
        },
      };
    }
    return finish(fracCompare, ctx, p);
  },
  exampleCorrect: (out): ResponseValue => correctFromAnswer(out.answer),
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = out.answer;
    if (w.format === 'compare') {
      const id = a.kind === 'choice' ? a.id : 'same';
      return [
        // No highlight: the worked-step hint plays this step and must not point at the answer.
        say('gen.frac.compare.look', {}),
        say(
          id === 'same' ? 'gen.frac.compare.same' : 'gen.frac.compare.bigger',
          {},
          {
            op: 'answer',
            args: { id },
          },
        ),
      ];
    }
    if (w.format === 'order' && a.kind === 'numbers') {
      const used = new Set<string>();
      return [
        say('gen.frac.compare.fewer', {}),
        ...a.values.map((v, slot) => {
          const item = w.items.find((x) => x.value === v && !used.has(x.id));
          const id = item?.id ?? 'obj-0';
          used.add(id);
          return say(
            slot === 0 ? 'gen.frac.compare.order-first' : 'gen.frac.compare.order-next',
            {},
            { op: 'drag', args: { id, slot } },
          );
        }),
      ];
    }
    return [];
  },
};
