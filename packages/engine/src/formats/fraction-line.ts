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
/** Marks closer than this (in units) are the same mark. */
const SAME_MARK = 1e-6;

/** The tick positions k/denominator from 0 to max, wholes included. */
export function lineTicks(denominator: number, max: number): number[] {
  return Array.from({ length: denominator * max + 1 }, (_, k) => k / denominator);
}

/** The target's value in units. */
export const targetValue = (c: Config): number | null =>
  c.target ? c.target.a / c.target.b : null;

const configSchema = fractionLineConfigSchema.superRefine((c, ctx) => {
  if (c.denominator > MAX_LINE_DENOMINATOR) {
    ctx.addIssue({
      code: 'custom',
      path: ['denominator'],
      message: `at most ${MAX_LINE_DENOMINATOR} parts a whole`,
    });
  }
  if (c.mode === 'partition') {
    if (c.denominator < 2) {
      ctx.addIssue({ code: 'custom', path: ['denominator'], message: 'partition into 2 or more' });
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
      if ((c.mode === 'read' || c.mode === 'equivalent') && (a * c.denominator) % b !== 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['target'],
          message: 'the point to read sits on a tick',
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

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

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
        if (b === undefined || !Number.isInteger(b) || b < 1 || b > MAX_LINE_DENOMINATOR * 2) {
          return s;
        }
        if (c.mode !== 'partition') return { ...s, hintPartition: b };
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
        if (lb < 1 || la < 0 || la / lb > c.max) return s;
        if (s.labels.some((l) => l.a === la && l.b === lb)) return s;
        return { ...s, labels: [...s.labels, { a: la, b: lb }] };
      }
      case 'drop': {
        const at = argNumber(a, 'at');
        if (at === undefined) return s;
        if (c.mode === 'place') return { ...s, marker: clamp(at, 0, c.max) };
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
        return { ...s, cuts: [...s.cuts, at].sort((x, y) => x - y) };
      }
      case 'answer': {
        const v = argNumbers(a, 'values');
        const one = argNumber(a, 'value');
        if (c.mode === 'place')
          return one === undefined ? s : { ...s, marker: clamp(one, 0, c.max) };
        if (c.mode === 'partition') {
          if (!v) return s;
          const cuts = [...new Set(v.filter((x) => x > 0 && x < c.max))].sort((x, y) => x - y);
          return { ...s, cuts };
        }
        if (c.decimalLabels && c.mode === 'read') {
          return one === undefined ? s : { ...s, value: one };
        }
        if (v && v.length === 2) return { ...s, values: [v[0] as number, v[1] as number] };
        if (one !== undefined) {
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
