// estimate.quantity (03 §5.6): estimate how many are in a big group (CMP.13).
// Formats: dot-flash, numeral-pick, number-pad, number-line-place.
//
// `n` objects (20–200) are scattered. `benchmarks` (0 = none) is a reference size: on a picture,
// that many objects form a coloured group to compare with ("here are 10"); on a number line, every
// multiple of it is labelled (otherwise only the ends are).
// - dot-flash: the group flashes; type about how many. Correct within 25% (03 §5.5 `estimate`).
// - numeral-pick: about how many? The options are n rounded to ten and two distractors rounded to
//   ten: about half and double n, both doubles (2n, 4n) or both halves (n/2, n/4), so the answer
//   is the middle, lowest or highest option (drawn from the ranks whose neighbouring options are
//   ≥ 1.5× apart, so an estimate can tell them apart, and fit a 0–500 line). With the
//   `number-line` representation each option is a line with an arrow at its value.
// - number-pad: the picture stays up; type about how many (correct within 25%, as dot-flash). The
//   pad always takes three digits, so its size never hints at n.
// - number-line-place: show where n goes on a 0–100 (n ≤ 100) or 0–200 line with no ticks.

import type { LessonStep, ResponseValue, StimulusSpec } from '@number-island/shared';
import { numberOptionId } from '../../formats/numeral-pick';
import {
  asNum,
  correctFromAnswer,
  DEFAULT_SPRITES,
  finish,
  layoutSeed,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import { say } from '../compare/shared';
import {
  type LineSpec,
  linePicture,
  NUMBER_LINE_PLACE_FEATURES,
  numberLinePlaceFeatures,
  placementAnswer,
} from '../numberline/line';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

/** 03 §5.5 dot-flash `estimate`: answers within this percentage of n are correct. */
export const ESTIMATE_TOLERANCE_PCT = 25;
/** Estimates flash long enough to see the whole group, too short to count it. */
export const ESTIMATE_FLASH_MS = 2000;

const round10 = (x: number): number => Math.max(10, Math.round(x / 10) * 10);

/** Where the answer sits among the three pick options, smallest first. */
export type EstimateRank = 'lowest' | 'middle' | 'highest';
export const ESTIMATE_RANKS: readonly EstimateRank[] = ['lowest', 'middle', 'highest'];
/**
 * Neighbouring pick options differ by at least this factor, so none is within the 25% estimate
 * tolerance of another (1.5 > 1.25 and 1 / 1.5 < 0.75): a good estimate tells them apart.
 */
export const ESTIMATE_OPTION_RATIO = 1.5;
/** The longest line an option can be drawn on (lineEnd). */
const MAX_OPTION = 500;

/** The three options for a rank, smallest first: n rounded to ten with halves or doubles of n. */
function optionsAt(n: number, rank: EstimateRank): [number, number, number] {
  switch (rank) {
    case 'lowest':
      return [round10(n), round10(n * 2), round10(n * 4)];
    case 'middle':
      return [round10(n / 2), round10(n), round10(n * 2)];
    case 'highest':
      return [round10(n / 4), round10(n / 2), round10(n)];
  }
}

const distinguishable = (v: readonly number[]): boolean =>
  (v[2] as number) <= MAX_OPTION &&
  (v[1] as number) / (v[0] as number) >= ESTIMATE_OPTION_RATIO &&
  (v[2] as number) / (v[1] as number) >= ESTIMATE_OPTION_RATIO;

/** The ranks whose options n can use (middle always can for 20–200). */
export function estimateRanks(n: number): EstimateRank[] {
  return ESTIMATE_RANKS.filter((r) => distinguishable(optionsAt(n, r)));
}

/**
 * The pick options: n rounded to ten (the answer) and two distractors, about half and double n,
 * or both doubles (answer lowest), or both halves (answer highest), so the answer's place among
 * the options never gives it away.
 */
export function estimateOptions(
  n: number,
  rank: EstimateRank = 'middle',
): { answer: number; others: [number, number] } {
  const v = optionsAt(n, rank);
  const i = ESTIMATE_RANKS.indexOf(rank);
  return { answer: v[i] as number, others: v.filter((_, k) => k !== i) as [number, number] };
}

/** The shortest of the 0–100, 0–200 and 0–500 lines that shows `v`. */
const lineEnd = (v: number): number => (v <= 100 ? 100 : v <= 200 ? 200 : 500);

function lineFor(end: number, benchmarks: number): LineSpec {
  return {
    min: 0,
    max: end,
    ticksEvery: null,
    labelsEvery: benchmarks > 0 && end % benchmarks === 0 ? benchmarks : null,
  };
}

export const estimateQuantity: GeneratorDef = {
  id: 'estimate.quantity',
  formats: ['dot-flash', 'numeral-pick', 'number-pad', 'number-line-place'],
  params: {
    n: { type: 'int', default: { kind: 'int', min: 20, max: 100 }, doc: 'how many (20–200)' },
    benchmarks: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'reference size: a coloured group of this many in the picture; on a line, a label at every multiple (0 = none)',
    },
  },
  features: {
    'n.per50': { weight: 0.3, doc: 'max(0, n − 20) / 50' },
    ...NUMBER_LINE_PLACE_FEATURES,
  },
  narration: [
    'gen.estimate.quantity.look',
    'gen.estimate.quantity.reference',
    'gen.estimate.quantity.about',
    'gen.estimate.quantity.this-line',
    'gen.estimate.quantity.ends',
    'gen.estimate.quantity.drop',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p) {
    const n = asNum(p.n);
    const b = asNum(p.benchmarks);
    // A reference group is at most half the group, so it never names the answer.
    return n >= 20 && n <= 200 && b >= 0 && (b === 0 || 2 * b <= n);
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const n = asNum(params.n);
    const b = asNum(params.benchmarks);
    const rep = t.representation ?? 'dots';
    const vars = pickVars(t, { n, b });
    const math: Record<string, number> = {
      'n.per50': Math.round((Math.max(0, n - 20) / 50) * 100) / 100,
    };
    const sprite = rep === 'objects' ? rng.fork('layout').pick([...DEFAULT_SPRITES]) : 'dot';
    const picture: StimulusSpec =
      rep !== 'objects' && b === 0
        ? { kind: 'dots', arrangement: 'scatter', groups: [n] }
        : {
            kind: 'objects',
            set: {
              count: n,
              sprite,
              layout: 'scatter',
              ...(b > 0 ? { groups: [b, n - b] } : {}),
              layoutSeed: layoutSeed(rng),
            },
          };
    let p: PartialOutput;
    switch (t.format) {
      case 'dot-flash':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'dot-flash',
            stimulus: picture,
            flashMs: ESTIMATE_FLASH_MS,
            reflashes: 1,
            input: 'pad',
            estimate: { tolerancePct: ESTIMATE_TOLERANCE_PCT },
          },
          answer: {
            kind: 'number',
            value: n,
            tolerance: Math.round((n * ESTIMATE_TOLERANCE_PCT) / 100),
          },
        };
        break;
      case 'numeral-pick': {
        // Where the answer sits among the options is a layout choice (no feature depends on it).
        const rank = rng.fork('rank').pick(estimateRanks(n));
        const { answer, others } = estimateOptions(n, rank);
        const values = rng.fork('layout').shuffle([answer, ...others]);
        const onLine = rep === 'number-line';
        const line = lineFor(lineEnd(Math.max(...values)), b);
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'numeral-pick',
            stimulus: picture,
            options: values.map((v) =>
              onLine
                ? { id: numberOptionId(v), stimulus: linePicture(line, [{ at: v }]) }
                : { id: numberOptionId(v), label: String(v) },
            ),
            layout: onLine ? 'grid' : 'row',
          },
          answer: { kind: 'choice', id: numberOptionId(answer) },
        };
        break;
      }
      case 'number-pad':
        // The picture stays up; the estimate is accepted within the same 25% as dot-flash's.
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: picture,
            // Three digits for every n (20–200), so the pad never hints at the size.
            blanks: [{ id: 'n', maxDigits: 3 }],
            unit: null,
          },
          answer: {
            kind: 'number',
            value: n,
            tolerance: Math.round((n * ESTIMATE_TOLERANCE_PCT) / 100),
          },
        };
        break;
      case 'number-line-place': {
        const line = lineFor(lineEnd(n), b);
        const widget = {
          format: 'number-line-place' as const,
          ...line,
          target: n,
          mode: 'place' as const,
          snap: 'none' as const,
          vertical: false,
          valueScale: 1 as const,
        };
        p = {
          params,
          vars,
          math: { ...math, ...numberLinePlaceFeatures(widget) },
          widget,
          answer: placementAnswer(widget),
        };
        break;
      }
      default:
        throw new Error(`estimate.quantity cannot build ${t.format}`);
    }
    return finish(estimateQuantity, ctx, p);
  },
  exampleCorrect: (out): ResponseValue => correctFromAnswer(out.answer),
  solution(out): LessonStep[] {
    const w = out.widget;
    const n = asNum(out.params.n);
    const b = asNum(out.params.benchmarks);
    const about = estimateOptions(n).answer;
    const reference =
      b > 0 && w.format !== 'number-line-place'
        ? [
            say(
              'gen.estimate.quantity.reference',
              { b },
              w.format === 'dot-flash' ? { op: 'circle-groups', args: { groups: [b] } } : undefined,
            ),
          ]
        : [];
    switch (w.format) {
      case 'dot-flash':
        return [
          say('gen.estimate.quantity.look', {}, { op: 'show' }),
          ...reference,
          say(
            'gen.estimate.quantity.about',
            { n: about },
            { op: 'answer', args: { value: about } },
          ),
        ];
      case 'numeral-pick': {
        const id = numberOptionId(about);
        const onLine = w.options.some((o) => o.stimulus !== undefined);
        return [
          say('gen.estimate.quantity.look', {}),
          ...reference,
          say(
            onLine ? 'gen.estimate.quantity.this-line' : 'gen.estimate.quantity.about',
            { n: about },
            { op: 'tap', args: { id } },
          ),
        ];
      }
      case 'number-pad':
        return [
          say('gen.estimate.quantity.look', {}, { op: 'show-stimulus' }),
          ...reference,
          say(
            'gen.estimate.quantity.about',
            { n: about },
            { op: 'type', args: { blank: 'n', value: about } },
          ),
        ];
      case 'number-line-place':
        return [
          say(
            'gen.estimate.quantity.ends',
            { max: w.max },
            { op: 'zoom', args: { from: w.min, to: w.max } },
          ),
          say('gen.estimate.quantity.drop', { n }, { op: 'drop', args: { at: n } }),
        ];
      default:
        return [];
    }
  },
};
