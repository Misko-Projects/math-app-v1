// Number-line helpers shared by numberline.place, compare.numbers and estimate.quantity: the 03 §5.5
// number-line-place features under their format names and weights (the format has no engine model
// yet, so the generators emit and declare them, K01), the placement answer, and line pictures.

import type { AnswerSpec, NumberLinePlaceConfig, StimulusSpec } from '@number-island/shared';

/** 03 §5.5 number-line-place features (K01: emitted by the generators until the format has a model). */
export const NUMBER_LINE_PLACE_FEATURES: Record<string, { weight: number; doc: string }> = {
  range: { weight: 0.4, doc: 'number line: log10(max − min) − 1, at least 0 (0 for a 0–10 line)' },
  'ticks.hidden': { weight: 0.6, doc: 'number line: no tick marks' },
  'target.offLabel': { weight: 0.4, doc: 'number line: the target is not a labelled number' },
  'target.nearMiddle': { weight: 0.3, doc: 'number line: the target is in the middle 30%' },
  'mode.read': { weight: 0.2, doc: 'number-line-place: read the marked number' },
  halfway: { weight: 0.6, doc: 'number-line-place closer: the target is halfway between' },
  negative: { weight: 0.5, doc: 'number line: below zero' },
  decimal: { weight: 0.5, doc: 'number-line-place: values are hundredths' },
};

/** The features a number-reading item on a line picture carries (numeral-pick, number-pad). */
export const LINE_READING_FEATURES = [
  'range',
  'ticks.hidden',
  'target.offLabel',
  'target.nearMiddle',
] as const;

export interface LineSpec {
  min: number;
  max: number;
  ticksEvery: number | null;
  labelsEvery: number | null;
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Whether `v` carries a label: the two ends always do, and every `labelsEvery` from `min`. */
export function labelled(line: LineSpec, v: number): boolean {
  if (v === line.min || v === line.max) return true;
  return line.labelsEvery !== null && (v - line.min) % line.labelsEvery === 0;
}

/** Whether `v` sits on a tick. */
export function onTick(line: LineSpec, v: number): boolean {
  return line.ticksEvery !== null && (v - line.min) % line.ticksEvery === 0;
}

/** Line features of a target on a line (03 §5.5); a function of the line and target only. */
export function lineFeatures(line: LineSpec, target: number): Record<string, number> {
  const range = line.max - line.min;
  return {
    range: Math.max(0, round2(Math.log10(Math.max(1, range)) - 1)),
    'ticks.hidden': line.ticksEvery === null ? 1 : 0,
    'target.offLabel': labelled(line, target) ? 0 : 1,
    'target.nearMiddle': Math.abs(target - (line.min + line.max) / 2) <= 0.15 * range ? 1 : 0,
    negative: line.min < 0 ? 1 : 0,
  };
}

/** Every 03 §5.5 number-line-place feature of a built config. */
export function numberLinePlaceFeatures(c: NumberLinePlaceConfig): Record<string, number> {
  const [b0, b1] = c.benchmarks ?? [0, 0];
  return {
    ...lineFeatures(c, c.target),
    'mode.read': c.mode === 'read' ? 1 : 0,
    halfway: c.mode === 'closer' && c.benchmarks && 2 * c.target === b0 + b1 ? 1 : 0,
    decimal: c.valueScale === 100 ? 1 : 0,
  };
}

/** 'tick' when the target sits on a tick (the child must hit it), else 'none' (estimation). */
export function snapFor(line: LineSpec, target: number): 'tick' | 'none' {
  return onTick(line, target) ? 'tick' : 'none';
}

/**
 * The placement answer (03 §5.5): half a tick when snapping to ticks, else
 * max(1, 5% of the range).
 */
export function placementAnswer(c: NumberLinePlaceConfig): AnswerSpec {
  const tolerance =
    c.snap === 'tick' && c.ticksEvery !== null
      ? c.ticksEvery / 2
      : Math.max(1, 0.05 * (c.max - c.min));
  return { kind: 'placement', value: c.target, min: c.min, max: c.max, tolerance };
}

/** A tick every 1 up to 20, every 10 up to 200, every 100 up to 2000. */
export function niceTick(range: number): number {
  if (range <= 20) return 1;
  if (range <= 200) return 10;
  if (range <= 2000) return 100;
  return 1000;
}

/**
 * The picture's `labelsEvery`. The line always labels its two ends, but a number-line stimulus
 * (StimulusView → NumberLineView) labels only multiples of `labelsEvery` and nothing for null, so a
 * line with no labels between the ends gets `max − min`: exactly its two ends when `min` is a
 * multiple of the range (0–100, 0–200, 10–20). Lines whose ends that cannot label keep null
 * (numberline.place rejects them for its picture formats).
 */
export function pictureLabelsEvery(line: LineSpec): number | null {
  if (line.labelsEvery !== null) return line.labelsEvery;
  const range = line.max - line.min;
  return range > 0 && line.min % range === 0 ? range : null;
}

/** A number-line picture with arrows (and labels) at the given values; its ends are labelled. */
export function linePicture(
  line: LineSpec,
  marks: { at: number; label?: boolean }[],
): Extract<StimulusSpec, { kind: 'number-line' }> {
  return {
    kind: 'number-line',
    min: line.min,
    max: line.max,
    ticksEvery: line.ticksEvery,
    labelsEvery: pictureLabelsEvery(line),
    marks: marks.map((m) =>
      m.label ? { at: m.at, label: String(m.at), arrow: true } : { at: m.at, arrow: true },
    ),
  };
}
