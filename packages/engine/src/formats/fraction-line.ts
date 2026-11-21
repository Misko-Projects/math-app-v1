// 03 §5.5 fraction-line. A line (or a ruler, or a strip) from 0 to `max` wholes; ticks every
// 1/denominator when `ticksShown` (engine README, "Sharing and fraction formats"):
// - `partition`: the child marks the line into `denominator` equal parts per whole; responds
//   state `{ cuts }` (marks in units from 0, sorted) for `fraction.partition`. `drop {at}` adds a
//   mark (`remove: true` takes away the mark nearest `at`); `partition {b}` marks every
//   non-whole k/b at once (the demo's "mark the parts").
// - `place`: the child puts the point at `target` a/b; responds `placement` with the value in
//   units. `drop {at}` puts it at `at`; `hop {k}` hops k ticks (k/denominator) from 0.
// - `read`: the point is drawn at `target`; the child types [a, b] (`numbers`), or with
//   `decimalLabels` a decimal (`number`). `equivalent`: types a fraction equal to the target.
// `label {a, b}` writes a/b under its tick and `hop {k}` draws k hops from 0 in any mode
// (visual), and `partition {b}` draws the b-ticks as a hint outside partition mode.
// `drop {remove: true}` in `place` takes the point back off the line.
//
// Supported domain (the schema and `apply` enforce it): `max` 1 to 3 wholes; 1 to
// MAX_LINE_DENOMINATOR parts a whole (so at most MAX_LINE_TICKS parts on the whole line, which
// the smallest area draws: story TwelfthsToThreeLandscapeMinK); `partition` 2 parts a whole or
// more and at most MAX_PARTITION_PARTS on the whole line (every mark's pin is a full target, K
// size included, 12 px from the next in the smallest area: stories SixthsMarksLandscapeMin and
// SixthsMarksLandscapeMinK); a target a/b with b 1 to
// MAX_TARGET_DENOMINATOR on the line; at most MAX_LINE_MARKS marks; typed numbers are whole, 0 to
// MAX_TYPED_NUMBER (a decimal: 0 to `max`). A dropped point lands where `snapPlacement` says: on
// the nearest tick when ticks are shown, else at the place itself (to a millionth), so the
// widget and the checker read one value.

import {
  type AnswerSpec,
  fractionLineConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import {
  argNumber,
  argNumbers,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'fraction-line'>;

export interface FractionLineState extends FormatState<'fraction-line'> {
  /** partition: the marks placed, in units from 0, sorted. */
  cuts: number[];
  /** place: where the point is, in units (null until placed). */
  marker: number | null;
  /** Hops drawn from 0 (visual; in place mode they also move the point). */
  hops: number;
  /** Fraction labels written under ticks (visual). */
  labels: { a: number; b: number }[];
  /** partition {b} as a hint outside partition mode: the b-ticks drawn. */
  hintPartition: number | null;
  /** read / equivalent: the typed fraction [a, b] (an entry is null until typed). */
  values: [number | null, number | null];
  /** read with decimal labels: the typed decimal. */
  value: number | null;
}

/** Most parts per whole the line draws (ticks stay ≥ 32 px numerals apart at 1 whole). */
export const MAX_LINE_DENOMINATOR = 12;
/** Most parts on the whole line: MAX_LINE_DENOMINATOR parts a whole on 3 wholes. */
export const MAX_LINE_TICKS = MAX_LINE_DENOMINATOR * 3;
/** Most parts a partition asks for on the whole line (denominator × max): pins stay a finger apart. */
export const MAX_PARTITION_PARTS = 6;
/** Largest denominator of a target (a point to place, read or match). */
export const MAX_TARGET_DENOMINATOR = 24;
/** Most marks a child can put on a line (more than any partition needs). */
export const MAX_LINE_MARKS = 12;
/** The largest number typed on the pad (two digits). */
export const MAX_TYPED_NUMBER = 99;
/** Marks closer than this (in units) are the same mark. */
const SAME_MARK = 1e-6;

/** The tick positions k/denominator from 0 to max, wholes included. */
export function fractionLineTicks(denominator: number, max: number): number[] {
  return Array.from({ length: denominator * max + 1 }, (_, k) => k / denominator);
}

/** The target's value in units. */
export const targetValue = (c: Config): number | null =>
  c.target ? c.target.a / c.target.b : null;

/**
 * Where a point dropped at `at` lands: on the line, then on the nearest tick when ticks are shown
 * (a tie goes to the smaller tick), else at the place itself to a millionth.
 */
export function snapPlacement(c: Config, at: number): number {
  const v = Math.min(c.max, Math.max(0, at));
  if (!c.ticksShown) return Math.round(v * 1e6) / 1e6;
  const k = Math.ceil(v * c.denominator - 0.5 - 1e-9);
  return Math.min(c.denominator * c.max, Math.max(0, k)) / c.denominator;
}

const configSchema = fractionLineConfigSchema.superRefine((c, ctx) => {
  if (c.denominator > MAX_LINE_DENOMINATOR) {
    ctx.addIssue({
      code: 'custom',
      path: ['denominator'],
      message: `at most ${MAX_LINE_DENOMINATOR} parts a whole`,
    });
  }
  if (c.target && c.target.b > MAX_TARGET_DENOMINATOR) {
    ctx.addIssue({
      code: 'custom',
      path: ['target', 'b'],
      message: `a target has at most ${MAX_TARGET_DENOMINATOR} parts a whole`,
    });
  }
  if (c.mode === 'partition') {
    if (c.denominator < 2) {
      ctx.addIssue({ code: 'custom', path: ['denominator'], message: 'partition into 2 or more' });
    }
    if (c.denominator * c.max > MAX_PARTITION_PARTS) {
      ctx.addIssue({
        code: 'custom',
        path: ['denominator'],
        message: `partition into at most ${MAX_PARTITION_PARTS} parts on the whole line`,
      });
    }
    if (c.target) {
      ctx.addIssue({ code: 'custom', path: ['target'], message: 'partition has no target' });
    }
  } else {
    if (!c.target) {
      ctx.addIssue({ code: 'custom', path: ['target'], message: `${c.mode} has a target` });
    } else {
      const { a, b } = c.target;
      if (a / b > c.max) {
        ctx.addIssue({ code: 'custom', path: ['target'], message: 'the target is on the line' });
      }
      // A point to read sits on a tick; with ticks shown, a point to place is a tick (03 §5.5).
      const onTickNeeded =
        c.mode === 'read' || c.mode === 'equivalent' || (c.mode === 'place' && c.ticksShown);
      if (onTickNeeded && (a * c.denominator) % b !== 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['target'],
          message: 'the point sits on a tick',
        });
      }
      if (c.mode === 'read' && !c.decimalLabels && b !== c.denominator) {
        ctx.addIssue({
          code: 'custom',
          path: ['target', 'b'],
          message: 'read asks for the line’s own parts',
        });
      }
    }
  }
  if (c.decimalLabels && c.denominator !== 10) {
    ctx.addIssue({
      code: 'custom',
      path: ['decimalLabels'],
      message: 'decimal labels are tenths',
    });
  }
});

export const fractionLine: FormatModel<'fraction-line', FractionLineState> = {
  format: 'fraction-line',
  configSchema,
  features: {
    denominator: { weight: 0.1, doc: 'denominator − 2' },
    beyondOne: { weight: 0.6, doc: 'the line goes past 1' },
    'ticks.hidden': {
      weight: 0.6,
      doc: 'no ticks to place or read by (partition never shows the ticks it asks for)',
    },
    'mode.partition': { weight: 0.4, doc: 'partition mode' },
    'mode.read': { weight: 0.2, doc: 'read mode' },
    equivalent: { weight: 0.5, doc: 'equivalent mode' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    return {
      denominator: Math.max(0, c.denominator - 2),
      beyondOne: c.max > 1 ? 1 : 0,
      'ticks.hidden': !c.ticksShown && c.mode !== 'partition' ? 1 : 0,
      'mode.partition': c.mode === 'partition' ? 1 : 0,
      'mode.read': c.mode === 'read' ? 1 : 0,
      equivalent: c.mode === 'equivalent' ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    cuts: [],
    marker: null,
    hops: 0,
    labels: [],
    hintPartition: null,
    values: [null, null],
    value: null,
  }),
  apply(s, a) {
    const c = s.config;
    switch (a.op) {
      case 'partition': {
        const b = argNumber(a, 'b');
        if (b === undefined || !Number.isInteger(b) || b < 1 || b > MAX_TARGET_DENOMINATOR) {
          return s;
        }
        if (c.mode !== 'partition') return { ...s, hintPartition: b };
        if (b * c.max - c.max > MAX_LINE_MARKS) return s;
        const cuts: number[] = [];
        for (let k = 1; k < b * c.max; k += 1) if (k % b !== 0) cuts.push(k / b);
        return { ...s, cuts };
      }
      case 'hop': {
        const k = argNumber(a, 'k');
        if (k === undefined || !Number.isInteger(k) || k < 0) return s;
        const hops = Math.min(k, c.denominator * c.max);
        return c.mode === 'place' ? { ...s, hops, marker: hops / c.denominator } : { ...s, hops };
      }
      case 'label': {
        const la = argNumber(a, 'a');
        const lb = argNumber(a, 'b');
        if (la === undefined || lb === undefined || !Number.isInteger(la) || !Number.isInteger(lb))
          return s;
        if (lb < 1 || lb > MAX_TARGET_DENOMINATOR || la < 0 || la / lb > c.max) return s;
        if (s.labels.some((l) => l.a === la && l.b === lb)) return s;
        if (s.labels.length >= MAX_LINE_TICKS) return s;
        return { ...s, labels: [...s.labels, { a: la, b: lb }] };
      }
      case 'drop': {
        const at = argNumber(a, 'at');
        if (c.mode === 'place') {
          // Taking the point back off the line needs no place.
          if (a.args?.remove === true)
            return s.marker === null ? s : { ...s, marker: null, hops: 0 };
          return at === undefined ? s : { ...s, marker: snapPlacement(c, at) };
        }
        if (at === undefined) return s;
        if (c.mode !== 'partition') return s;
        if (a.args?.remove === true) {
          if (s.cuts.length === 0) return s;
          let best = 0;
          s.cuts.forEach((x, i) => {
            if (Math.abs(x - at) < Math.abs((s.cuts[best] as number) - at)) best = i;
          });
          return { ...s, cuts: s.cuts.filter((_, i) => i !== best) };
        }
        if (!(at > 0 && at < c.max)) return s;
        if (s.cuts.some((x) => Math.abs(x - at) < SAME_MARK)) return s;
        if (s.cuts.length >= MAX_LINE_MARKS) return s;
        return { ...s, cuts: [...s.cuts, at].sort((x, y) => x - y) };
      }
      case 'answer': {
        const v = argNumbers(a, 'values');
        const one = argNumber(a, 'value');
        if (c.mode === 'place')
          return one === undefined ? s : { ...s, marker: snapPlacement(c, one) };
        if (c.mode === 'partition') {
          if (!v) return s;
          const cuts = [...new Set(v.filter((x) => x > 0 && x < c.max))].sort((x, y) => x - y);
          return cuts.length > MAX_LINE_MARKS ? s : { ...s, cuts };
        }
        if (c.decimalLabels && c.mode === 'read') {
          return one === undefined || one < 0 || one > c.max ? s : { ...s, value: one };
        }
        const typed = (x: number) => Number.isInteger(x) && x >= 0 && x <= MAX_TYPED_NUMBER;
        if (v && v.length === 2) {
          return v.every(typed) ? { ...s, values: [v[0] as number, v[1] as number] } : s;
        }
        if (one !== undefined) {
          if (!typed(one)) return s;
          const i = argNumber(a, 'slot') === 1 ? 1 : 0;
          const values: [number | null, number | null] = [...s.values];
          values[i] = one;
          return { ...s, values };
        }
        return s;
      }
      default:
        throw new UnsupportedOpError('fraction-line', a.op);
    }
  },
  toResponse(s) {
    const c = s.config;
    switch (c.mode) {
      case 'partition':
        return s.cuts.length === 0 ? null : { kind: 'state', value: { cuts: [...s.cuts] } };
      case 'place':
        return s.marker === null ? null : { kind: 'placement', value: s.marker };
      case 'read':
      case 'equivalent': {
        if (c.decimalLabels && c.mode === 'read') {
          return s.value === null ? null : { kind: 'number', value: s.value };
        }
        const [a, b] = s.values;
        return a === null || b === null ? null : { kind: 'numbers', values: [a, b] };
      }
    }
  },
};
