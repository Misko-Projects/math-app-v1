// 03 §5.5 number-line-place. `place` answers `placement` (where the child put the marker), `read`
// answers `number` (the value of the marked point, typed on the pad) and `closer` answers `choice`
// `b0` | `b1` (the benchmark the target is closer to). The model never judges: tolerance and
// closeness live in the AnswerSpec and `checkResponse`. Values are in config units throughout:
// with `valueScale: 100` they are hundredths (DEC.03), so 47 is drawn and read as 0.47.

import {
  type AnswerSpec,
  numberLinePlaceConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import {
  argNumber,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'number-line-place'>;

export type BenchmarkId = 'b0' | 'b1';

export interface NumberLinePlaceState extends FormatState<'number-line-place'> {
  /** Where the marker sits on the line (snapped when `snap: 'tick'`), or null before a drop. */
  placed: number | null;
  /** The typed value in `read` mode. */
  value: number | null;
  /** The picked benchmark in `closer` mode. */
  choice: BenchmarkId | null;
  /** Ticks a demo revealed (`show-tick`), in order, without duplicates. */
  shownTicks: number[];
  /** The tick run a demo counted (`count-ticks`). */
  counted: { from: number; to: number } | null;
  /** The segment a demo zoomed into (`zoom`). */
  zoom: { from: number; to: number } | null;
}

const round6 = (v: number) => Number(v.toFixed(6));

/**
 * The multiples of `every` inside [min, max], ascending, at 6-decimal precision: THE tick and
 * label positions of a number line. The model and the kit's `NumberLineView` (through
 * `stepsBetween`) both use this one function, so a drawn tick is always a tick the model snaps
 * to. The first multiple is found from the quotient rounded to 6 decimals, so 0.07 / 0.01
 * (7.000000000000001 in floating point) still starts the line at 0.07, and no step lies past either
 * end of the line.
 */
export function lineSteps(min: number, max: number, every: number | null): number[] {
  if (every === null || !(every > 0)) return [];
  // Floating-point slack, in units of the step: a quotient within a billionth of a step of a whole
  // number counts as that number at either end, and nothing past an end is ever produced (a
  // 0–19.999999 line by tens stops at 10; rounding the quotient 1.9999999 to 2 would add 20).
  const EPS = 1e-9;
  const k0 = Math.ceil(min / every - EPS);
  const k1 = Math.floor(max / every + EPS);
  const out: number[] = [];
  for (let k = k0; k <= k1 && out.length < 2000; k++) {
    const v = round6(k * every);
    if (v >= min - EPS * every && v <= max + EPS * every) out.push(v);
  }
  return out;
}

/** Ticks drawn on the line: multiples of `ticksEvery` inside [min, max] (as the kit draws them). */
export function lineTicks(c: Config): number[] {
  return lineSteps(c.min, c.max, c.ticksEvery);
}

/**
 * Numbers printed on the line: multiples of `labelsEvery`, plus both ends (an estimation line
 * with `labelsEvery: null` still shows where it starts and ends).
 */
export function lineLabels(c: Config): number[] {
  const out = new Set<number>([c.min, c.max, ...lineSteps(c.min, c.max, c.labelsEvery)]);
  return [...out].sort((a, b) => a - b);
}

/**
 * Where a drop at `at` lands: clamped to the line, then snapped to the nearest tick when
 * `snap: 'tick'` (ties go to the smaller tick).
 */
export function snapPlacement(c: Config, at: number): number {
  const v = Math.min(c.max, Math.max(c.min, at));
  if (c.snap !== 'tick') return round6(v);
  const ticks = lineTicks(c);
  if (ticks.length === 0) return round6(v);
  let best = ticks[0] as number;
  for (const t of ticks) if (Math.abs(t - v) < Math.abs(best - v) - 1e-9) best = t;
  return best;
}

const configSchema = numberLinePlaceConfigSchema.superRefine((c, ctx) => {
  if (c.min >= c.max) {
    ctx.addIssue({ code: 'custom', path: ['max'], message: 'max must exceed min' });
    return;
  }
  if (c.ticksEvery !== null && !(c.ticksEvery > 0)) {
    ctx.addIssue({ code: 'custom', path: ['ticksEvery'], message: 'ticks must be positive' });
  }
  if (c.labelsEvery !== null && !(c.labelsEvery > 0)) {
    ctx.addIssue({ code: 'custom', path: ['labelsEvery'], message: 'labels must be positive' });
  }
  // The target is drawn on the line in every mode (closer shows it between its benchmarks).
  if (c.target < c.min || c.target > c.max) {
    ctx.addIssue({ code: 'custom', path: ['target'], message: 'target is off the line' });
  }
  if (c.snap === 'tick' && c.ticksEvery === null) {
    ctx.addIssue({ code: 'custom', path: ['snap'], message: 'snapping to ticks needs ticks' });
  }
  if (c.mode === 'closer') {
    const b = c.benchmarks;
    if (!b) {
      ctx.addIssue({ code: 'custom', path: ['benchmarks'], message: 'closer needs benchmarks' });
    } else {
      if (b[0] >= b[1]) {
        ctx.addIssue({
          code: 'custom',
          path: ['benchmarks'],
          message: 'benchmarks are two increasing numbers',
        });
      }
      if (b.some((x) => x < c.min || x > c.max)) {
        ctx.addIssue({
          code: 'custom',
          path: ['benchmarks'],
          message: 'benchmarks are on the line',
        });
      }
    }
  }
});

const isOneOf = (v: number, xs: readonly number[]) => xs.some((x) => Math.abs(x - v) < 1e-9);

export const numberLinePlace: FormatModel<'number-line-place', NumberLinePlaceState> = {
  format: 'number-line-place',
  configSchema,
  features: {
    range: { weight: 0.4, doc: 'log10 of the shown span (max − min) − 1, 0 up to a 0–10 line' },
    'ticks.hidden': { weight: 0.6, doc: 'no tick marks (estimation)' },
    'target.offLabel': { weight: 0.4, doc: 'the target is not a printed number' },
    'target.nearMiddle': { weight: 0.3, doc: 'the target is within the middle 30% of the line' },
    'mode.read': { weight: 0.2, doc: 'read the marked number instead of placing it' },
    halfway: {
      weight: 0.6,
      doc: 'the target is exactly halfway between its benchmarks (closer) or two printed numbers',
    },
    negative: { weight: 0.5, doc: 'the line goes below zero' },
    decimal: { weight: 0.5, doc: 'values are hundredths (valueScale 100)' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    const span = c.max - c.min;
    const shownSpan = span / c.valueScale;
    const labels = lineLabels(c);
    const onLabel = isOneOf(c.target, labels);
    let halfway = 0;
    if (c.mode === 'closer' && c.benchmarks) {
      const [b0, b1] = c.benchmarks;
      halfway = Math.abs(c.target - b0 - (b1 - c.target)) < 1e-9 ? 1 : 0;
    } else if (!onLabel) {
      const below = labels.filter((l) => l < c.target).at(-1);
      const above = labels.find((l) => l > c.target);
      if (below !== undefined && above !== undefined) {
        halfway = Math.abs(c.target - below - (above - c.target)) < 1e-9 ? 1 : 0;
      }
    }
    return {
      range: shownSpan > 0 ? Math.max(0, Math.log10(shownSpan) - 1) : 0,
      'ticks.hidden': c.ticksEvery === null ? 1 : 0,
      'target.offLabel': onLabel ? 0 : 1,
      'target.nearMiddle': Math.abs(c.target - (c.min + c.max) / 2) <= 0.15 * span ? 1 : 0,
      'mode.read': c.mode === 'read' ? 1 : 0,
      halfway,
      negative: c.min < 0 ? 1 : 0,
      decimal: c.valueScale === 100 ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    placed: null,
    value: null,
    choice: null,
    shownTicks: [],
    counted: null,
    zoom: null,
  }),
  apply(s, a) {
    const c = s.config;
    switch (a.op) {
      case 'drop': {
        const at = argNumber(a, 'at');
        return at === undefined ? s : { ...s, placed: snapPlacement(c, at) };
      }
      case 'show-tick': {
        const at = argNumber(a, 'at');
        if (at === undefined || at < c.min || at > c.max || s.shownTicks.includes(at)) return s;
        return { ...s, shownTicks: [...s.shownTicks, at] };
      }
      case 'count-ticks':
      case 'zoom': {
        const from = argNumber(a, 'from');
        const to = argNumber(a, 'to');
        if (from === undefined || to === undefined) return s;
        const run = { from: Math.min(from, to), to: Math.max(from, to) };
        return a.op === 'zoom' ? { ...s, zoom: run } : { ...s, counted: run };
      }
      case 'answer': {
        if (c.mode === 'closer') {
          const id = argString(a, 'id');
          return id === 'b0' || id === 'b1' ? { ...s, choice: id } : s;
        }
        const v = argNumber(a, 'value');
        if (v === undefined) return s;
        return c.mode === 'place' ? { ...s, placed: snapPlacement(c, v) } : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('number-line-place', a.op);
    }
  },
  toResponse(s) {
    switch (s.config.mode) {
      case 'place':
        return s.placed === null ? null : { kind: 'placement', value: s.placed };
      case 'read':
        return s.value === null ? null : { kind: 'number', value: s.value };
      case 'closer':
        return s.choice === null ? null : { kind: 'choice', id: s.choice };
    }
  },
};
