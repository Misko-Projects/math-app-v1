// numberline.place (03 §5.6): find a number's place on a number line (CMP.04, CMP.09; CMP.10–12 and
// CMP.14 later). Formats: number-line-place, numeral-pick, number-pad, number-line-jump, order.
//
// The line runs from `min` to `max`, with a tick every `ticksEvery` (0: no ticks) and a label every
// `labelsEvery` (0: only the two ends are labelled; the ends always are).
// - number-line-place: `mode` place (drop `target`), read (type the number at the marked tick), or
//   closer (is `target` closer to the benchmark below or above it, `benchmarks` apart: `b0` | `b1`).
// - numeral-pick: an arrow on the line, pick its number. With the `symbols` representation the other
//   way round: the numeral is given and each option is a line with an arrow ("which arrow shows 37?").
//   Options are near misses one and two ticks away when the target sits on a tick, else a quarter
//   and a half of the line away, so an estimate can tell them apart.
// - number-pad: type the number at the arrow: exactly when the target is on a tick; on a line with
//   no ticks (only the ends labelled) an estimate within 10% of the line (READ_ESTIMATE_PCT), with
//   the target at least that far from both ends, so no accepted answer is off the line.
// - number-line-jump: hop from `min` to `target` by ticks and, when labels are sparser, by labels.
// - order: put `target` and the two numbers around it in order (`benchmarks` apart, or the two ends
//   when `benchmarks` is 0).
// The picture formats (numeral-pick, number-pad, order) draw a number-line stimulus whose two ends
// are always labelled (linePicture: labelsEvery max − min on a line with no labels between).

import type { LessonStep, ResponseValue } from '@number-island/shared';
import { numberOptionId, optionNumber } from '../../formats/numeral-pick';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import { say } from '../compare/shared';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';
import {
  LINE_READING_FEATURES,
  type LineSpec,
  lineFeatures,
  linePicture,
  NUMBER_LINE_PLACE_FEATURES,
  numberLinePlaceFeatures,
  onTick,
  pictureLabelsEvery,
  placementAnswer,
  snapFor,
} from './line';

const MODES = ['place', 'read', 'closer'] as const;

/** A number read off a line with no ticks is an estimate: correct within this % of the line. */
export const READ_ESTIMATE_PCT = 10;

/** The number-pad tolerance for reading a line with no ticks (READ_ESTIMATE_PCT of the line). */
export function readTolerance(line: LineSpec): number {
  return Math.max(1, Math.round(((line.max - line.min) * READ_ESTIMATE_PCT) / 100));
}

/** The line a param set describes. */
export function lineOf(p: Record<string, unknown>): LineSpec {
  const ticks = asNum(p.ticksEvery as number);
  const labels = asNum(p.labelsEvery as number);
  return {
    min: asNum(p.min as number),
    max: asNum(p.max as number),
    ticksEvery: ticks > 0 ? ticks : null,
    labelsEvery: labels > 0 ? labels : null,
  };
}

/** The benchmark pair `k` apart around `target`, counted from `min`. */
export function benchmarkPair(min: number, target: number, k: number): [number, number] {
  const b0 = min + Math.floor((target - min) / k) * k;
  return [b0, b0 + k];
}

/**
 * Two distractor values for a number-reading pick: one and two ticks away when the target sits on
 * a tick, else a quarter and a half of the line away. Only values on the line; null when fewer than
 * two fit.
 */
export function readingDistractors(line: LineSpec, target: number): number[] | null {
  const gap =
    line.ticksEvery !== null && onTick(line, target)
      ? line.ticksEvery
      : Math.max(1, Math.round((line.max - line.min) / 4));
  const out = [target + gap, target - gap, target + 2 * gap, target - 2 * gap].filter(
    (v) => v >= line.min && v <= line.max,
  );
  return out.length >= 2 ? out.slice(0, 2) : null;
}

/** The largest labelled number at or below `v`. */
function labelBelow(line: LineSpec, v: number): number {
  if (line.labelsEvery === null) return line.min;
  return line.min + Math.floor((v - line.min) / line.labelsEvery) * line.labelsEvery;
}

/** Hops from min to target: the label step while it fits, then ticks (03 §5.5 jumps.reach). */
function hopsTo(min: number, target: number, small: number, big: number | null): number[] {
  const hops: number[] = [];
  let at = min;
  while (big !== null && at + big <= target) {
    hops.push(big);
    at += big;
  }
  while (at < target) {
    hops.push(small);
    at += small;
  }
  return hops;
}

function jumpSizes(line: LineSpec): { small: number; big: number | null } {
  const small = line.ticksEvery ?? 1;
  const big = line.labelsEvery !== null && line.labelsEvery > small ? line.labelsEvery : null;
  return { small, big };
}

function orderValues(p: Record<string, unknown>): number[] {
  const line = lineOf(p);
  const target = asNum(p.target as number);
  const k = asNum(p.benchmarks as number);
  return k > 0 ? [...benchmarkPair(line.min, target, k), target] : [line.min, line.max, target];
}

export const numberlinePlace: GeneratorDef = {
  id: 'numberline.place',
  formats: ['number-line-place', 'numeral-pick', 'number-pad', 'number-line-jump', 'order'],
  params: {
    min: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'left (bottom) end of the line',
    },
    max: { type: 'int', default: { kind: 'const', value: 20 }, doc: 'right (top) end of the line' },
    target: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 19 },
      doc: 'the number to place, read or find (never an end)',
    },
    ticksEvery: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'units between ticks; 0 = no ticks',
    },
    labelsEvery: {
      type: 'int',
      default: { kind: 'const', value: 5 },
      doc: 'units between labels (a multiple of ticksEvery); 0 = only the two ends are labelled',
    },
    mode: {
      type: 'string',
      values: [...MODES],
      default: { kind: 'const', value: 'place' },
      doc: 'number-line-place: place, read (the marked tick) or closer (to which benchmark)',
    },
    benchmarks: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'closer and order: the two benchmarks around the target, this far apart (0 = none; order then uses the ends)',
    },
    vertical: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'number-line-place: an upright line (thermometer)',
    },
  },
  features: { ...NUMBER_LINE_PLACE_FEATURES },
  narration: [
    'gen.numberline.place.ends',
    'gen.numberline.place.from',
    'gen.numberline.place.middle',
    'gen.numberline.place.drop',
    'gen.numberline.place.reads',
    'gen.numberline.place.reads-about',
    'gen.numberline.place.benchmarks',
    'gen.numberline.place.closer',
    'gen.numberline.place.think',
    'gen.numberline.place.this-line',
    'gen.numberline.place.start',
    'gen.numberline.place.hop',
    'gen.numberline.place.order-first',
    'gen.numberline.place.order-next',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const line = lineOf(p);
    const target = asNum(p.target);
    const k = asNum(p.benchmarks);
    const range = line.max - line.min;
    if (range <= 0 || target <= line.min || target >= line.max) return false;
    if (asNum(p.ticksEvery) < 0 || asNum(p.labelsEvery) < 0 || k < 0) return false;
    if (line.ticksEvery !== null && range % line.ticksEvery !== 0) return false;
    if (line.labelsEvery !== null) {
      if (range % line.labelsEvery !== 0) return false;
      if (line.ticksEvery !== null && line.labelsEvery % line.ticksEvery !== 0) return false;
    }
    // A benchmark pair strictly around the target, inside the line, and not halfway (closer).
    const pairOk = (halfwayOk: boolean) => {
      if (k <= 0 || (target - line.min) % k === 0) return false;
      const [b0, b1] = benchmarkPair(line.min, target, k);
      return b1 <= line.max && (halfwayOk || 2 * target !== b0 + b1);
    };
    // Picture formats draw the line as a number-line stimulus, which must label both ends.
    if (
      (t.format === 'numeral-pick' || t.format === 'number-pad' || t.format === 'order') &&
      pictureLabelsEvery(line) === null
    ) {
      return false;
    }
    switch (t.format) {
      case 'number-line-place': {
        const mode = asStr(p.mode, 'place');
        if (mode === 'read') return onTick(line, target);
        if (mode === 'closer') return pairOk(false);
        return true;
      }
      case 'numeral-pick':
        return readingDistractors(line, target) !== null;
      case 'number-pad': {
        if (onTick(line, target)) return true;
        if (line.ticksEvery !== null) return false;
        // An estimate within the tolerance: the target is at least that far from both ends, so
        // every accepted answer lies on the line (for 0–100, targets 10–90).
        const tol = readTolerance(line);
        return target - line.min >= tol && line.max - target >= tol;
      }
      case 'number-line-jump':
        return (target - line.min) % jumpSizes(line).small === 0;
      case 'order':
        return k === 0 || pairOk(true);
      default:
        return false;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const line = lineOf(params);
    const { min, max } = line;
    const target = asNum(params.target);
    const k = asNum(params.benchmarks);
    const pair = k > 0 ? benchmarkPair(min, target, k) : null;
    const vars = pickVars(t, {
      min,
      max,
      target,
      ...(pair ? { b0: pair[0], b1: pair[1] } : {}),
    });
    const lf = lineFeatures(line, target);
    const readingMath = Object.fromEntries(LINE_READING_FEATURES.map((f) => [f, lf[f] ?? 0]));
    const arrow = linePicture(line, [{ at: target }]);
    let p: PartialOutput;
    switch (t.format) {
      case 'number-line-place': {
        const mode = asStr(params.mode, 'place') as (typeof MODES)[number];
        const widget = {
          format: 'number-line-place' as const,
          min,
          max,
          ticksEvery: line.ticksEvery,
          labelsEvery: line.labelsEvery,
          target,
          mode,
          snap: mode === 'place' ? snapFor(line, target) : ('tick' as const),
          ...(mode === 'closer' && pair ? { benchmarks: pair } : {}),
          vertical: params.vertical === true,
          valueScale: 1 as const,
        };
        const nearer =
          pair && Math.abs(target - pair[0]) < Math.abs(pair[1] - target) ? 'b0' : 'b1';
        p = {
          params,
          vars,
          math: numberLinePlaceFeatures(widget),
          widget,
          answer:
            mode === 'read'
              ? { kind: 'number', value: target }
              : mode === 'closer'
                ? { kind: 'choice', id: nearer }
                : placementAnswer(widget),
        };
        break;
      }
      case 'numeral-pick': {
        const others = readingDistractors(line, target) ?? [];
        const values = rng.fork('layout').shuffle([target, ...others]);
        const symbols = t.representation === 'symbols';
        p = {
          params,
          vars,
          math: readingMath,
          widget: {
            format: 'numeral-pick',
            stimulus: symbols
              ? { kind: 'expression', expr: { tokens: [{ t: 'num', v: target }] } }
              : arrow,
            options: values.map((v) =>
              symbols
                ? { id: numberOptionId(v), stimulus: linePicture(line, [{ at: v }]) }
                : { id: numberOptionId(v), label: String(v) },
            ),
            layout: symbols ? 'grid' : 'row',
          },
          answer: { kind: 'choice', id: numberOptionId(target) },
        };
        break;
      }
      case 'number-pad':
        p = {
          params,
          vars,
          math: readingMath,
          widget: {
            format: 'number-pad',
            stimulus: arrow,
            blanks: [{ id: 'n', maxDigits: String(Math.max(Math.abs(min), Math.abs(max))).length }],
            unit: null,
          },
          answer: onTick(line, target)
            ? { kind: 'number', value: target }
            : { kind: 'number', value: target, tolerance: readTolerance(line) },
        };
        break;
      case 'number-line-jump': {
        const { small, big } = jumpSizes(line);
        const allowedJumps = big !== null ? [small, big] : [small];
        p = {
          params,
          vars,
          math: {},
          widget: {
            format: 'number-line-jump',
            min,
            max,
            ticksEvery: line.ticksEvery,
            labelsEvery: line.labelsEvery,
            start: min,
            goal: 'land-on',
            target,
            allowedJumps,
            path: t.tier === 'concrete' ? 'stones' : line.ticksEvery === null ? 'open' : 'line',
            thenAsk: null,
          },
          answer: {
            kind: 'state',
            checker: 'jumps.reach',
            target: { start: min, target, allowedJumps },
          },
          nudge: [{ op: 'highlight', args: { at: min } }],
          highlight: [{ op: 'highlight', args: { at: min } }],
        };
        break;
      }
      case 'order': {
        const values = orderValues(params);
        const shuffled = rng.fork('layout').shuffle(values);
        p = {
          params,
          vars,
          math: {},
          widget: {
            format: 'order',
            items: shuffled.map((v, i) => ({ id: `item-${i}`, value: v, label: String(v) })),
            direction: 'asc',
          },
          answer: { kind: 'numbers', values: [...values].sort((x, y) => x - y), ordered: true },
          overlay: linePicture(line, []),
        };
        break;
      }
      default:
        throw new Error(`numberline.place cannot build ${t.format}`);
    }
    return finish(numberlinePlace, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    if (out.widget.format !== 'number-line-jump') throw new Error('numberline.place: no state');
    const w = out.widget;
    const [small, big] = w.allowedJumps as [number, number | undefined];
    return {
      kind: 'state',
      value: { jumps: hopsTo(w.start, w.target ?? w.start, small, big ?? null) },
    };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const target = asNum(out.params.target);
    const line = lineOf(out.params);
    const ends = say('gen.numberline.place.ends', { min: line.min, max: line.max });
    // A known labelled number below the target to count on from (never the target itself).
    const from = labelBelow(line, target);
    const fromStep =
      line.ticksEvery !== null && from !== target
        ? [say('gen.numberline.place.from', { at: from }, { op: 'show-tick', args: { at: from } })]
        : [];
    switch (w.format) {
      case 'number-line-place': {
        if (w.mode === 'closer' && w.benchmarks) {
          const [b0, b1] = w.benchmarks;
          const id = out.answer.kind === 'choice' ? out.answer.id : 'b0';
          return [
            say(
              'gen.numberline.place.benchmarks',
              { b0, b1 },
              { op: 'show-tick', args: { at: b0 } },
            ),
            say(
              'gen.numberline.place.closer',
              { n: target, m: id === 'b0' ? b0 : b1 },
              { op: 'answer', args: { id } },
            ),
          ];
        }
        const mid = (line.min + line.max) / 2;
        const middle =
          line.ticksEvery === null && Number.isInteger(mid) && mid !== target
            ? [say('gen.numberline.place.middle', { mid }, { op: 'show-tick', args: { at: mid } })]
            : [];
        const opening = { ...ends, action: { op: 'zoom', args: { from: line.min, to: line.max } } };
        if (w.mode === 'read') {
          return [
            opening,
            ...fromStep,
            say(
              'gen.numberline.place.reads',
              { n: target },
              { op: 'answer', args: { value: target } },
            ),
          ];
        }
        return [
          opening,
          ...middle,
          ...fromStep,
          say('gen.numberline.place.drop', { n: target }, { op: 'drop', args: { at: target } }),
        ];
      }
      case 'numeral-pick': {
        const id = out.answer.kind === 'choice' ? out.answer.id : numberOptionId(target);
        const n = optionNumber(id) ?? target;
        const symbols = w.stimulus.kind === 'expression';
        return symbols
          ? [
              say('gen.numberline.place.think', { min: line.min, max: line.max }),
              say('gen.numberline.place.this-line', { n }, { op: 'tap', args: { id } }),
            ]
          : [ends, say('gen.numberline.place.reads', { n }, { op: 'tap', args: { id } })];
      }
      case 'number-pad': {
        if (!onTick(line, target)) {
          // No ticks: estimate from the ends and the middle (spoken over the picture).
          const mid = (line.min + line.max) / 2;
          return [
            { ...ends, action: { op: 'show-stimulus' } },
            ...(Number.isInteger(mid) && mid !== target
              ? [say('gen.numberline.place.middle', { mid })]
              : []),
            say(
              'gen.numberline.place.reads-about',
              { n: target },
              { op: 'type', args: { blank: 'n', value: target } },
            ),
          ];
        }
        // The pad has no tick op: the counting line is spoken over the picture.
        return [
          { ...ends, action: { op: 'show-stimulus' } },
          ...fromStep.map(({ action: _action, ...s }) => s),
          say(
            'gen.numberline.place.reads',
            { n: target },
            { op: 'type', args: { blank: 'n', value: target } },
          ),
        ];
      }
      case 'number-line-jump': {
        const [small, big] = w.allowedJumps as [number, number | undefined];
        const hops = hopsTo(w.start, target, small, big ?? null);
        const steps: LessonStep[] = [
          say(
            'gen.numberline.place.start',
            { n: w.start },
            { op: 'highlight', args: { at: w.start } },
          ),
        ];
        let at = w.start;
        for (const h of hops) {
          at += h;
          steps.push(say('gen.numberline.place.hop', { n: at }, { op: 'hop', args: { by: h } }));
        }
        return steps;
      }
      case 'order': {
        const sorted = [...w.items].sort((x, y) => x.value - y.value);
        return sorted.map((item, slot) =>
          say(
            slot === 0 ? 'gen.numberline.place.order-first' : 'gen.numberline.place.order-next',
            { n: item.value },
            { op: 'drag', args: { id: item.id, slot } },
          ),
        );
      }
      default:
        return [];
    }
  },
};
