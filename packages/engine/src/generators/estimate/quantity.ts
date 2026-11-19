// estimate.quantity (03 §5.6): estimate how many are in a big group (CMP.13).
// Formats: dot-flash, numeral-pick, number-line-place.
//
// `n` objects (20–200) are scattered. `benchmarks` (0 = none) is a reference size: on a picture,
// that many objects form a coloured group to compare with ("here are 10"); on a number line, every
// multiple of it is labelled (otherwise only the ends are).
// - dot-flash: the group flashes; type about how many. Correct within 25% (03 §5.5 `estimate`).
// - numeral-pick: about how many? The options are n rounded to ten, and about half and about double
//   n (rounded to ten), so an estimate can tell them apart. With the `number-line` representation
//   each option is a line with an arrow at its value instead of a numeral.
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

/** The pick options: n rounded to ten (the answer), about half and about double n. */
export function estimateOptions(n: number): { answer: number; others: [number, number] } {
  return { answer: round10(n), others: [round10(n / 2), round10(n * 2)] };
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
  formats: ['dot-flash', 'numeral-pick', 'number-line-place'],
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
        const { answer, others } = estimateOptions(n);
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
