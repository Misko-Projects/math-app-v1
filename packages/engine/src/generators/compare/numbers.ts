// compare.numbers (03 §5.6): compare and order numbers (CMP.02, CMP.06, CMP.07; CMP.08, PV.02,
// PV.06, PV.17 and PV.22 later). Formats: compare, order, numeral-pick, balance, number-line-place.
//
// `a` and `b` are the two numbers compared (left and right); `extra` more values (x1, x2, x3, drawn
// in [min, max], distinct from each other and from a and b) join them for order, numeral-pick and
// number-line-place. Templates for compare and balance set `extra: 0`.
// - compare: `ask` more ("which is greater?"), fewer ("which is less?"), answered left | right |
//   same; or symbol (<, > or = between a and b). Each side is drawn in the template's representation:
//   numerals (symbols), a number path or line with the number marked, ten-frames, base-ten blocks or
//   a line of objects.
// - order: a, b and the extras, smallest first (`ask: more`: greatest first). Each card shows the
//   number in the representation; a picture of the quantity (frames, blocks, objects) has no
//   numeral on it.
// - numeral-pick: the greatest (`ask: more`) or the least (`ask: fewer`) of a, b and the extras.
// - balance: a and b on the two pans, tilt hidden: which side goes down? (`ask: more`)
// - number-line-place: put `a` on the min–max line; b and x1 are marked as labelled benchmarks.

import type { LessonStep, ParamValues, ResponseValue, StimulusSpec } from '@number-island/shared';
import { numberOptionId } from '../../formats/numeral-pick';
import type { Rng } from '../../rng';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  inDomain,
  layoutSeed,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import {
  type LineSpec,
  linePicture,
  NUMBER_LINE_PLACE_FEATURES,
  niceTick,
  numberLinePlaceFeatures,
  placementAnswer,
  snapFor,
} from '../numberline/line';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';
import {
  BALANCE_FEATURES,
  COMPARE_FEATURES,
  closeness,
  digits,
  featureSubset,
  relation,
  say,
  sideAnswer,
} from './shared';

const ASKS = ['more', 'fewer', 'symbol'] as const;
const EXTRA_NAMES = ['x1', 'x2', 'x3'] as const;
const MAX_EXTRA = EXTRA_NAMES.length;

/** a, b, then the extra values, as drawn. */
export function comparedValues(p: ParamValues): number[] {
  const extra = Math.max(0, Math.min(MAX_EXTRA, asNum(p.extra)));
  const out = [asNum(p.a), asNum(p.b)];
  for (const name of EXTRA_NAMES.slice(0, extra)) {
    if (typeof p[name] === 'number') out.push(p[name] as number);
  }
  return out;
}

/**
 * Draws the extra values: distinct from a, b and each other, uniform in [min, max]. Extra values
 * the caller fixed (lesson or misconception examples) are kept.
 */
function withExtras(p: ParamValues, rng: Rng): ParamValues {
  const extra = Math.max(0, Math.min(MAX_EXTRA, asNum(p.extra)));
  const names = EXTRA_NAMES.slice(0, extra);
  const taken = new Set([asNum(p.a), asNum(p.b)]);
  for (const name of names) if (typeof p[name] === 'number') taken.add(p[name] as number);
  const free: number[] = [];
  for (let v = asNum(p.min); v <= asNum(p.max) && free.length <= 2000; v += 1) {
    if (!taken.has(v)) free.push(v);
  }
  const r = rng.fork('extra');
  for (const name of names) {
    if (typeof p[name] === 'number') continue;
    if (free.length === 0) break;
    const i = r.int(0, free.length - 1);
    p[name] = free[i] as number;
    free.splice(i, 1);
  }
  return p;
}

const tens = (n: number): number => Math.floor(n / 10);

/** All values ≥ 10 and in the same ten, so the ones decide. */
function sameTens(values: number[]): number {
  return values.every((v) => v >= 10 && tens(v) === tens(values[0] as number)) ? 1 : 0;
}

/** The values do not all have the same number of digits. */
function digitsDiffer(values: number[]): number {
  return new Set(values.map(digits)).size > 1 ? 1 : 0;
}

/** A line for the min–max range: a tick per unit up to 20, every 10 up to 200, … */
function rangeLine(min: number, max: number, labels: 'every' | 'fives' | 'ends'): LineSpec {
  const range = max - min;
  const tick = niceTick(range);
  const labelsEvery =
    labels === 'every' ? tick : labels === 'fives' ? (range <= 20 ? 5 : tick * 5) : null;
  return {
    min,
    max,
    ticksEvery: range % tick === 0 ? tick : null,
    labelsEvery: labelsEvery !== null && range % labelsEvery === 0 ? labelsEvery : null,
  };
}

/** One number in the template's representation (compare sides, order cards). */
function numberStimulus(
  v: number,
  rep: string,
  p: ParamValues,
  seed: number,
): StimulusSpec | undefined {
  const min = asNum(p.min);
  const max = asNum(p.max);
  switch (rep) {
    case 'number-path':
      return linePicture(rangeLine(min, max, 'every'), [{ at: v }]);
    case 'number-line':
      return linePicture(rangeLine(min, max, 'fives'), [{ at: v, label: true }]);
    case 'ten-frame':
    case 'double-ten-frame': {
      const frames: 1 | 2 = v > 10 || rep === 'double-ten-frame' ? 2 : 1;
      return {
        kind: 'ten-frame',
        frames,
        filled: frames === 2 ? [Math.min(10, v), Math.max(0, v - 10)] : [v],
      };
    }
    case 'base-ten':
      return {
        kind: 'base-ten',
        hundreds: Math.floor(v / 100),
        tens: Math.floor(v / 10) % 10,
        ones: v % 10,
      };
    case 'objects':
    case 'dots':
      return {
        kind: 'objects',
        set: {
          count: v,
          sprite: rep === 'dots' ? 'dot' : 'shell',
          layout: 'line',
          layoutSeed: seed,
        },
      };
    default:
      return undefined;
  }
}

/** Representations whose picture shows the quantity itself (numberStimulus). */
const QUANTITY_PICTURES = new Set(['ten-frame', 'double-ten-frame', 'base-ten', 'objects', 'dots']);

const numeral = (v: number): StimulusSpec => ({
  kind: 'expression',
  expr: { tokens: [{ t: 'num', v }] },
});

/** The opening line of a comparison: look at the tens, the ones, or count up. */
function firstLook(values: number[]): string {
  if (sameTens(values)) return 'gen.compare.numbers.ones';
  if (values.every((v) => v >= 10)) return 'gen.compare.numbers.tens';
  return 'gen.compare.numbers.count';
}

export const compareNumbers: GeneratorDef = {
  id: 'compare.numbers',
  formats: ['compare', 'order', 'numeral-pick', 'balance', 'number-line-place'],
  params: {
    a: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 10 },
      doc: 'the left number (number-line-place: the number to place)',
    },
    b: { type: 'int', default: { kind: 'int', min: 1, max: 10 }, doc: 'the right number' },
    extra: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'more values (0–3, drawn in [min, max]) for order, numeral-pick and number-line-place',
    },
    min: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'smallest value; the start of a path or line',
    },
    max: {
      type: 'int',
      default: { kind: 'const', value: 10 },
      doc: 'largest value; the end of a path or line',
    },
    ask: {
      type: 'string',
      values: [...ASKS],
      default: { kind: 'const', value: 'more' },
      doc: 'more (greater; order greatest first), fewer (less; order smallest first) or symbol (compare: <, >, =)',
    },
  },
  features: {
    sameTens: {
      weight: 0.5,
      doc: 'every compared value is in the same ten (≥ 10): the ones decide',
    },
    digitsDiffer: { weight: -0.4, doc: 'the compared values have different numbers of digits' },
    ...COMPARE_FEATURES,
    ...featureSubset(BALANCE_FEATURES, ['size']),
    ...NUMBER_LINE_PLACE_FEATURES,
  },
  narration: [
    // its descending order retry line (items/check.ts retryFeedback)
    'fb.order.retry-desc',
    'gen.compare.numbers.count',
    'gen.compare.numbers.tens',
    'gen.compare.numbers.ones',
    'gen.compare.numbers.greater',
    'gen.compare.numbers.less',
    'gen.compare.numbers.same',
    'gen.compare.numbers.look-all',
    'gen.compare.numbers.greatest',
    'gen.compare.numbers.least',
    'gen.compare.numbers.order-first',
    'gen.compare.numbers.order-next',
    'gen.compare.numbers.balance',
    'gen.compare.numbers.goes-down',
    'gen.compare.numbers.balances',
    'gen.compare.numbers.between',
    'gen.compare.numbers.before',
    'gen.compare.numbers.after',
    'gen.compare.numbers.drop',
  ],
  sample: (spec, rng) => withExtras(sampleAll(spec, rng), rng),
  // Large ranges (two- and three-digit numbers) rarely draw close pairs at random, so the hard end
  // of a template is hard to reach. The steered half of the candidates (03 §5.4) moves b into a's
  // ten, or next to a, whenever b's domain allows; targeting then picks the closest candidate.
  sampleToward(spec, rng) {
    const p = sampleAll(spec, rng);
    const a = asNum(p.a);
    const bSpec = spec.b;
    if (bSpec && bSpec.kind !== 'const') {
      const r = rng.fork('toward');
      const ten = Math.floor(a / 10) * 10;
      const near = [ten + r.int(0, 9), a + r.pick([-3, -2, -1, 1, 2, 3])];
      const b = near.find((v) => v !== a && inDomain(bSpec, v));
      if (b !== undefined) p.b = b;
    }
    return withExtras(p, rng);
  },
  derive: () => ({}),
  accepts(p, t) {
    const a = asNum(p.a);
    const b = asNum(p.b);
    const min = asNum(p.min);
    const max = asNum(p.max);
    const extra = asNum(p.extra);
    const ask = asStr(p.ask, 'more');
    if (min >= max || a < min || a > max || b < min || b > max) return false;
    if (extra < 0 || extra > MAX_EXTRA) return false;
    const values = comparedValues(p);
    if (values.length !== 2 + extra) return false;
    const distinct = new Set(values).size === values.length;
    switch (t.format) {
      case 'compare':
        return true;
      case 'balance':
        return ask === 'more';
      case 'numeral-pick':
        return ask !== 'symbol' && distinct && values.length >= 3 && values.length <= 5;
      case 'order':
        return distinct;
      case 'number-line-place':
        return extra >= 1 && distinct && a > min && a < max;
      default:
        return false;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const a = asNum(params.a);
    const b = asNum(params.b);
    const min = asNum(params.min);
    const max = asNum(params.max);
    const ask = asStr(params.ask, 'more') as (typeof ASKS)[number];
    const rep = t.representation ?? 'symbols';
    const values = comparedValues(params);
    const pair = [a, b];
    const vars = pickVars(t, {
      a,
      b,
      min,
      max,
      ask: ask === 'fewer' ? 'less' : 'greater',
      // Where the asked number comes when you count (hints: the less one comes first).
      end: ask === 'fewer' ? 'first' : 'last',
    });
    const seed = layoutSeed(rng);
    let p: PartialOutput;
    switch (t.format) {
      case 'compare': {
        const side = (v: number) => numberStimulus(v, rep, params, seed) ?? numeral(v);
        const id = ask === 'symbol' ? relation(a, b) : sideAnswer(a, b, ask);
        p = {
          params,
          vars,
          math: {
            sameTens: sameTens(pair),
            digitsDiffer: digitsDiffer(pair),
            closeness: closeness(a, b),
            'ask.fewer': ask === 'fewer' ? 1 : 0,
            'ask.symbol': ask === 'symbol' ? 1 : 0,
            equal: a === b ? 1 : 0,
            magnitude: digits(Math.max(a, b)) - 1,
          },
          widget: {
            format: 'compare',
            left: side(a),
            right: side(b),
            ask: ask === 'symbol' ? 'symbol' : ask === 'fewer' ? 'fewer' : 'more',
            allowMatchLines: false,
          },
          answer: { kind: 'choice', id },
          overlay: linePicture(rangeLine(min, max, 'every'), [
            { at: a, label: true },
            { at: b, label: true },
          ]),
        };
        break;
      }
      case 'order': {
        const shuffled = rng.fork('layout').shuffle(values);
        const desc = ask === 'more';
        p = {
          params,
          vars,
          math: { sameTens: sameTens(values), digitsDiffer: digitsDiffer(values) },
          widget: {
            format: 'order',
            // A picture of the quantity (frames, blocks, objects) is the card: a numeral on it
            // would give the order away. Paths and lines mark a place, so they keep the numeral.
            items: shuffled.map((v, i) => {
              const stimulus = numberStimulus(v, rep, params, seed);
              return {
                id: `item-${i}`,
                value: v,
                ...(QUANTITY_PICTURES.has(rep) ? {} : { label: String(v) }),
                ...(stimulus ? { stimulus } : {}),
              };
            }),
            direction: desc ? 'desc' : 'asc',
          },
          answer: {
            kind: 'numbers',
            values: [...values].sort((x, y) => (desc ? y - x : x - y)),
            ordered: true,
          },
          overlay: linePicture(rangeLine(min, max, 'every'), []),
        };
        break;
      }
      case 'numeral-pick': {
        const answer = ask === 'fewer' ? Math.min(...values) : Math.max(...values);
        const rest = values.filter((v) => v !== answer);
        const nearest = rest.reduce(
          (best, v) => (Math.abs(v - answer) < Math.abs(best - answer) ? v : best),
          rest[0] as number,
        );
        const onLine = rep === 'number-path' || rep === 'number-line';
        p = {
          params,
          vars,
          math: {
            sameTens: sameTens(values),
            digitsDiffer: digitsDiffer(values),
            closeness: closeness(answer, nearest),
            'ask.fewer': ask === 'fewer' ? 1 : 0,
            magnitude: digits(Math.max(...values)) - 1,
          },
          widget: {
            format: 'numeral-pick',
            stimulus: onLine
              ? linePicture(
                  rangeLine(min, max, rep === 'number-path' ? 'every' : 'fives'),
                  values.map((v) => ({ at: v, label: true })),
                )
              : { kind: 'none' },
            options: rng
              .fork('layout')
              .shuffle(values)
              .map((v) => ({ id: numberOptionId(v), label: String(v) })),
            layout: 'row',
          },
          answer: { kind: 'choice', id: numberOptionId(answer) },
          overlay: linePicture(rangeLine(min, max, 'every'), []),
        };
        break;
      }
      case 'balance':
        p = {
          params,
          vars,
          math: {
            sameTens: sameTens(pair),
            digitsDiffer: digitsDiffer(pair),
            closeness: closeness(a, b),
            equal: a === b ? 1 : 0,
            size: Math.max(a, b) / 10,
          },
          widget: {
            format: 'balance',
            left: { terms: [{ n: a }] },
            right: { terms: [{ n: b }] },
            mode: 'which-heavier',
            showTilt: false,
          },
          answer: { kind: 'choice', id: sideAnswer(a, b, 'more') },
        };
        break;
      case 'number-line-place': {
        const line = rangeLine(min, max, 'ends');
        const marks = [b, values[2] as number].sort((x, y) => x - y) as [number, number];
        const widget = {
          format: 'number-line-place' as const,
          min,
          max,
          ticksEvery: line.ticksEvery,
          labelsEvery: line.labelsEvery,
          target: a,
          mode: 'place' as const,
          snap: snapFor(line, a),
          benchmarks: marks,
          vertical: false,
          valueScale: 1 as const,
        };
        const placed = [a, ...marks];
        p = {
          params,
          vars,
          math: {
            ...numberLinePlaceFeatures(widget),
            sameTens: sameTens(placed),
            digitsDiffer: digitsDiffer(placed),
          },
          widget,
          answer: placementAnswer(widget),
        };
        break;
      }
      default:
        throw new Error(`compare.numbers cannot build ${t.format}`);
    }
    return finish(compareNumbers, ctx, p);
  },
  exampleCorrect: (out): ResponseValue => correctFromAnswer(out.answer),
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = asNum(out.params.a);
    const b = asNum(out.params.b);
    const id = out.answer.kind === 'choice' ? out.answer.id : '';
    switch (w.format) {
      case 'compare': {
        const open = say(firstLook([a, b]), {});
        const big = Math.max(a, b);
        const small = Math.min(a, b);
        if (w.ask === 'symbol') {
          const line =
            a === b
              ? say('gen.compare.numbers.same', { n: a })
              : a > b
                ? say('gen.compare.numbers.greater', { n: a, m: b })
                : say('gen.compare.numbers.less', { n: a, m: b });
          return [open, { ...line, action: { op: 'place-symbol', args: { symbol: id } } }];
        }
        const line =
          a === b
            ? say('gen.compare.numbers.same', { n: a })
            : w.ask === 'fewer'
              ? say('gen.compare.numbers.less', { n: small, m: big })
              : say('gen.compare.numbers.greater', { n: big, m: small });
        return [open, { ...line, action: { op: 'answer', args: { id } } }];
      }
      case 'numeral-pick': {
        const n = Number(id.slice(4));
        return [
          say('gen.compare.numbers.look-all', {}),
          say(
            out.params.ask === 'fewer'
              ? 'gen.compare.numbers.least'
              : 'gen.compare.numbers.greatest',
            { n },
            { op: 'tap', args: { id } },
          ),
        ];
      }
      case 'order': {
        const sorted = [...w.items].sort((x, y) =>
          w.direction === 'desc' ? y.value - x.value : x.value - y.value,
        );
        return sorted.map((item, slot) =>
          say(
            slot === 0 ? 'gen.compare.numbers.order-first' : 'gen.compare.numbers.order-next',
            { n: item.value },
            { op: 'drag', args: { id: item.id, slot } },
          ),
        );
      }
      case 'balance':
        return [
          say('gen.compare.numbers.balance', {}, { op: 'highlight-side', args: { side: 'left' } }),
          say(
            id === 'same' ? 'gen.compare.numbers.balances' : 'gen.compare.numbers.goes-down',
            {},
            { op: 'answer', args: { id } },
          ),
        ];
      case 'number-line-place': {
        const [lo, hi] = w.benchmarks ?? [w.min, w.max];
        const where =
          w.target < lo
            ? say('gen.compare.numbers.before', { n: lo }, { op: 'show-tick', args: { at: lo } })
            : w.target > hi
              ? say('gen.compare.numbers.after', { n: hi }, { op: 'show-tick', args: { at: hi } })
              : say(
                  'gen.compare.numbers.between',
                  { lo, hi },
                  { op: 'show-tick', args: { at: lo } },
                );
        return [
          where,
          say('gen.compare.numbers.drop', { n: w.target }, { op: 'drop', args: { at: w.target } }),
        ];
      }
      default:
        return [];
    }
  },
};
