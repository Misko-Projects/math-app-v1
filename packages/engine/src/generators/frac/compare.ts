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
//
// K02 slice 5a (FRA.06, FRA.13) adds grade 3 comparisons with `symbols: true`:
// - `sameNum` with `num` 1–3 shaded parts of each whole (num < every den), and `sameDen`: one
//   `den` for every whole with `num`, `num2` (and `num3`) shaded parts.
// - compare, pictorial: two wholes of the same size and shape, each with its shaded parts,
//   "which shows more?" (`left`, `right`, `same`). compare with the `symbols` representation: two
//   stacked fractions (expression `frac` tokens), the child places <, > or = between them.
// - order: each card is a strip with its fraction under it ("a/b", drawn stacked), or with the
//   `symbols` representation the fraction alone; biggest first. Values are in 24ths of the whole
//   (24 × num ÷ den), and the cards' fractions are all different.
// Without `symbols` everything is as K01 built it (FRA.08).

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
/** The most shaded parts a same-numerator item shows (03 §3.11 FRA.13; num < every den). */
export const MAX_SAME_NUM = 3;
const SHAPES = ['bar', 'circle', 'rect'] as const;
/** Denominators whose pieces are whole 24ths, so piece sizes are integers. */
export const PIECE_DENS = [2, 3, 4, 6, 8] as const;

/** Piece size in 24ths of the whole. */
export const pieceSize = (den: number): number => 24 / den;

/** The dens an item compares (den3 = 0: two). With `sameDen` every whole has `den`. */
export function itemDens(p: ParamValues): number[] {
  if (asStr(p.kind) === 'sameDen') return itemNums(p).map(() => asNum(p.den));
  const d3 = asNum(p.den3);
  return [asNum(p.den), asNum(p.den2), ...(d3 > 0 ? [d3] : [])];
}

/** The shaded parts of each whole an item compares: `num` each, or with `sameDen` num, num2 (num3). */
export function itemNums(p: ParamValues): number[] {
  if (asStr(p.kind) !== 'sameDen') {
    const d3 = asNum(p.den3);
    return Array.from({ length: d3 > 0 ? 3 : 2 }, () => asNum(p.num, 1));
  }
  const n3 = asNum(p.num3);
  return [asNum(p.num), asNum(p.num2), ...(n3 > 0 ? [n3] : [])];
}

/** A fraction's size in 24ths of the whole. */
export const fractionSize = (num: number, den: number): number => (24 * num) / den;

/**
 * Closeness of the hardest pair of sizes: smaller ÷ larger of the two closest different values (0
 * when none differ). For one part of each whole this is denRatio.
 */
export function sizeRatio(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  let best = 0;
  for (let i = 1; i < s.length; i += 1) {
    const a = s[i - 1] as number;
    const b = s[i] as number;
    if (a !== b) best = Math.max(best, a / b);
  }
  return Math.round(best * 100) / 100;
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
    num: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'shaded parts of each whole (sameDen: of the first)',
    },
    num2: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'sameDen: shaded parts of the second whole',
    },
    num3: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'sameDen order: shaded parts of the third whole (0: two)',
    },
    symbols: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'grade 3 (FRA.06, FRA.13): fractions in symbols (order labels; the symbols tier compares a/b with <, >, =)',
    },
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
    'gen.frac.compare.same-den',
    'gen.frac.compare.same-den-more',
    'gen.frac.compare.same-den-equal',
    'gen.frac.compare.same-num',
    'gen.frac.compare.same-num-more',
    'gen.frac.compare.symbol',
    'gen.frac.compare.order-den',
    'gen.frac.compare.order-num',
    'gen.frac.compare.order-biggest',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const kind = asStr(p.kind);
    const symbols = p.symbols === true;
    if (kind === 'benchmark') return false;
    if (!symbols && (kind !== 'sameNum' || asNum(p.num) !== 1)) return false;
    const dens = itemDens(p);
    const nums = itemNums(p);
    if (!dens.every((d) => (PIECE_DENS as readonly number[]).includes(d))) return false;
    // Grade 3: every whole shows a part and is not whole (a < b), same numerators at most 3.
    if (nums.some((n, i) => n < 1 || n >= (dens[i] as number))) return false;
    if (kind === 'sameNum' && asNum(p.num) > MAX_SAME_NUM) return false;
    if (kind === 'sameDen' && asNum(p.num3) > 0 && t.format !== 'order') return false;
    if (t.format === 'order') {
      const sizes = nums.map((n, i) => fractionSize(n, dens[i] as number));
      return new Set(sizes).size === sizes.length && asStr(p.shape) === 'bar';
    }
    // The symbols tier compares stacked fractions; a picture compare is the pictorial tier.
    return t.format === 'compare' && dens.length === 2;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const dens = itemDens(params);
    const nums = itemNums(params);
    const symbols = params.symbols === true;
    const sameDen = asStr(params.kind) === 'sameDen';
    const shape = asStr(params.shape, 'bar') as (typeof SHAPES)[number];
    const pic = (den: number, num = 1): StimulusSpec => fractionPicture(shape, den, num, true);
    const vars = pickVars(t, {});
    const sizes = nums.map((n, i) => fractionSize(n, dens[i] as number));
    const equal = sizes.length === 2 && sizes[0] === sizes[1];
    const math: Record<string, number> = {
      sameNum: equal || sameDen ? 0 : 1,
      equal: equal ? 1 : 0,
      ratio: symbols ? sizeRatio(sizes) : denRatio(dens),
    };
    let p: PartialOutput;
    if (t.format === 'compare') {
      const [a, b] = dens as [number, number];
      const [na, nb] = nums as [number, number];
      const [sa, sb] = sizes as [number, number];
      const written = symbols && t.representation === 'symbols';
      const frac = (num: number, den: number): StimulusSpec => ({
        kind: 'expression',
        expr: { tokens: [{ t: 'frac', a: num, b: den }] },
      });
      p = {
        params,
        vars,
        math,
        widget: written
          ? {
              format: 'compare',
              left: frac(na, a),
              right: frac(nb, b),
              ask: 'symbol',
              allowMatchLines: false,
            }
          : {
              format: 'compare',
              left: pic(a, na),
              right: pic(b, nb),
              ask: 'more',
              allowMatchLines: false,
            },
        answer: written
          ? { kind: 'choice', id: sa === sb ? '=' : sa > sb ? '>' : '<' }
          : { kind: 'choice', id: sa === sb ? 'same' : sa > sb ? 'left' : 'right' },
      };
    } else if (symbols) {
      const cards = rng.fork('layout').shuffle(nums.map((n, i) => [n, dens[i] as number] as const));
      const bare = t.representation === 'symbols';
      p = {
        params,
        vars,
        // Sizes in 24ths are not magnitudes: the order model's magnitude feature stays 0.
        math: { ...math, magnitude: 0 },
        widget: {
          format: 'order',
          items: cards.map(([n, d], i) => ({
            id: `obj-${i}`,
            value: fractionSize(n, d),
            label: `${n}/${d}`,
            ...(bare ? {} : { stimulus: pic(d, n) }),
          })),
          direction: 'desc',
        },
        answer: { kind: 'numbers', values: [...sizes].sort((x, y) => y - x), ordered: true },
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
    const symbols = out.params.symbols === true;
    const sameDen = asStr(out.params.kind) === 'sameDen';
    if (w.format === 'compare' && symbols) {
      const id = a.kind === 'choice' ? a.id : 'same';
      const same = id === 'same' || id === '=';
      // Same parts: more shaded parts is more. Same shaded count: fewer parts, bigger parts.
      // Equal (same parts taken of wholes cut alike) says so whichever kind it is.
      const why = same
        ? 'gen.frac.compare.same-den-equal'
        : sameDen
          ? 'gen.frac.compare.same-den-more'
          : 'gen.frac.compare.same-num-more';

      const intro = say(sameDen ? 'gen.frac.compare.same-den' : 'gen.frac.compare.same-num', {});
      const answer = { op: 'answer', args: { id } } as const;
      // The sign line is about < and >: an equal pair ends on its why line.
      return w.ask === 'symbol' && !same
        ? [intro, say(why, {}), say('gen.frac.compare.symbol', {}, answer)]
        : [intro, say(why, {}, answer)];
    }
    if (w.format === 'order' && symbols && a.kind === 'numbers') {
      const used = new Set<string>();
      return [
        say(sameDen ? 'gen.frac.compare.order-den' : 'gen.frac.compare.order-num', {}),
        ...a.values.map((v, slot) => {
          const item = w.items.find((x) => x.value === v && !used.has(x.id));
          const id = item?.id ?? 'obj-0';
          used.add(id);
          // FRA.06's parts are one size: the first card is the biggest, not its pieces.
          return say(
            slot === 0 ? 'gen.frac.compare.order-biggest' : 'gen.frac.compare.order-next',
            {},
            { op: 'drag', args: { id, slot } },
          );
        }),
      ];
    }
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
