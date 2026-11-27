// 03 §5.5 measure-length: measure an object by laying units along it or by reading a ruler.
// The object is `object.length` units of `unit` long (in sixteenths of the unit when
// `precision < 1`). Non-standard units are drawn to scale: cube 1, shell 2, stick 4 (UNIT_SIZE,
// the generator's NONSTANDARD_UNIT_SIZE); a standard unit is its own scale.
// - `iterate`: the child lays copies of `unit` from the object's start (`lay-unit {index, at?}`:
//   unit `index` starts `at` unit lengths from the start, default `index`; `remove: true` takes it
//   away) and types the count (`answer {value}`). Answers state `{ units, value }`
//   (`units.iterate`): every laid unit's start, smallest first, and the typed count.
// - `two-units` (MEA.22): the same with `unit` and then `altUnit` (`lay-unit {index, unit}`), then
//   both counts (`answer {values}`); answers `numbers` `[in unit, in altUnit]`.
// - `read`: the object lies on a ruler, its start at mark `startOffset`. `pad` answers the typed
//   length (`number`); `tap-tick` answers the tapped mark (`placement`, `answer {value}`: the
//   object's end mark on the ruler, startOffset + length); `pick` answers an option (`choice`,
//   `opt-<n>`).
// - `two-units` on a ruler (MEA.09, `tool: 'ruler'`): the object, a whole number of centimeters
//   (`unit: 'cm'`), lies on a centimeter ruler with an inch ruler above it on the same px scale
//   (`altUnit: 'in'`); the child reads both: `answer {values}` → `numbers` `[cm, inches]`, the
//   inches to the nearest inch ("about"), never within 0.2 in of a half (TWO_RULER_HALF_CLEAR).
//   The ruler runs to TWO_RULER_CM cm, so every centimeter keeps its numeral at 960 × 600.
// - `estimate` (MEA.08): the child picks an option (`choice`, `opt-<n>`).
// Visual ops: `slide-ruler {to}` puts ruler mark `to` under the object's start, `align-zero`
// marks where the object starts on the ruler, `read-end` marks where it ends, `count-units`
// numbers the laid units.

import {
  type AnswerSpec,
  measureLengthConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import { numberOptionId } from './numeral-pick';
import {
  argNumber,
  argNumbers,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'measure-length'>;
export type LengthUnit = Config['unit'];

/** Relative unit sizes (cube 1, shell 2, stick 4); standard units are 1 on their own scale. */
export const UNIT_SIZE: Readonly<Record<LengthUnit, number>> = {
  cube: 1,
  shell: 2,
  stick: 4,
  in: 1,
  cm: 1,
  ft: 1,
  m: 1,
};
const NONSTANDARD = new Set<LengthUnit>(['cube', 'shell', 'stick']);
export const isNonStandard = (u: LengthUnit): boolean => NONSTANDARD.has(u);

/** Lengths are in sixteenths of the unit when precision < 1 (03 §5.5). */
export const SIXTEENTHS = 16;

/** The object's length in whole units (fractional with precision < 1). */
export const objectUnits = (c: Config): number =>
  c.precision < 1 ? c.object.length / SIXTEENTHS : c.object.length;

/** Centimeters in an inch. */
export const CM_PER_INCH = 2.54;
/** A two-unit ruler (MEA.09) runs to 10 cm: the widest that labels every centimeter at 960 × 600. */
export const TWO_RULER_CM = 10;
/** On a two-unit ruler the object's end is at least this far (inches) from a half inch. */
export const TWO_RULER_HALF_CLEAR = 0.2;

/** A two-units item measured on rulers (MEA.09): centimeters and inches. */
export const isTwoRuler = (c: Config): boolean =>
  c.mode === 'two-units' && c.tool === 'ruler' && c.unit === 'cm' && c.altUnit === 'in';

/** The object's length in inches, exactly (a two-unit ruler's object is whole centimeters). */
export const exactInches = (c: Config): number => objectUnits(c) / CM_PER_INCH;

/**
 * The object's length in `alt` units, when it is a whole number of them (two-units); on a two-unit
 * ruler, the inches to the nearest inch.
 */
export function lengthIn(c: Config, alt: LengthUnit): number | null {
  if (isTwoRuler(c) && alt === 'in') return Math.round(exactInches(c));
  const base = objectUnits(c) * UNIT_SIZE[c.unit];
  const n = base / UNIT_SIZE[alt];
  return Number.isInteger(n) ? n : null;
}

export interface LaidUnit {
  /** `<unit>-<index>`, the unit's trace id. */
  id: string;
  unit: LengthUnit;
  /** Where the unit starts, in lengths of its own unit from the object's start. */
  at: number;
}

export interface MeasureLengthState extends FormatState<'measure-length'> {
  units: LaidUnit[];
  /** The ruler mark under the object's start (read; `slide-ruler`). */
  rulerStart: number;
  startShown: boolean;
  endShown: boolean;
  /** Units numbered by `count-units`. */
  counted: LengthUnit[];
  value: number | null;
  values: [number | null, number | null];
  choice: string | null;
}

/**
 * The supported domain, above shipped content (lengths to 12, units laid to 12, no offsets) and
 * inside what the widget's stress stories draw at 906 × 373: a 30 cm ruler, 16 units laid.
 */
/** The object's length in its unit (a ruler's last numeral). */
export const ML_LENGTH_MAX = 30;
/** Units of one kind a child lays along the object (iterate, and each unit of two-units). */
export const ML_LAID_MAX = 16;
/** Where the object starts on the ruler; the object still ends by `ML_LENGTH_MAX`. */
export const ML_OFFSET_MAX = 10;
/** Choices of a pick or an estimate. */
export const ML_OPTIONS_MAX = 4;
/** The largest number offered as a choice (the pad's two digits). */
export const ML_OPTION_MAX = 99;

/** Where a config leaves the supported domain: every number and every list has a bound. */
export function domainIssues(c: Config): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = [];
  const whole = objectUnits(c);
  if (!(whole <= ML_LENGTH_MAX)) {
    out.push({
      path: ['object', 'length'],
      message: `the object is at most ${ML_LENGTH_MAX} units long; got ${whole}`,
    });
  }
  if (
    !(c.startOffset <= ML_OFFSET_MAX) ||
    (whole <= ML_LENGTH_MAX && !(c.startOffset + whole <= ML_LENGTH_MAX))
  ) {
    out.push({
      path: ['startOffset'],
      message: `startOffset is at most ${ML_OFFSET_MAX} and the object ends by ${ML_LENGTH_MAX}; got ${c.startOffset} + ${whole}`,
    });
  }
  if (c.startOffset % c.precision !== 0) {
    out.push({ path: ['startOffset'], message: 'the object starts on a ruler mark' });
  }
  if (c.mode === 'iterate' || (c.mode === 'two-units' && c.tool === 'units')) {
    const alt = c.mode === 'two-units' && c.altUnit ? (lengthIn(c, c.altUnit) ?? 0) : 0;
    const most = Math.max(whole, alt);
    if (most > ML_LAID_MAX) {
      out.push({
        path: ['object', 'length'],
        message: `at most ${ML_LAID_MAX} units of a kind are laid; got ${most}`,
      });
    }
  }
  const opts = c.options ?? [];
  if (opts.length > ML_OPTIONS_MAX) {
    out.push({
      path: ['options'],
      message: `at most ${ML_OPTIONS_MAX} options fit; got ${opts.length}`,
    });
  }
  opts.forEach((v, i) => {
    if (!(v >= 0 && v <= ML_OPTION_MAX)) {
      out.push({
        path: ['options', i],
        message: `an option is a number from 0 to ${ML_OPTION_MAX}; got ${v}`,
      });
    }
  });
  return out;
}

const configSchema = measureLengthConfigSchema.superRefine((c, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  for (const d of domainIssues(c)) ctx.addIssue({ code: 'custom', ...d });
  if (!Number.isInteger(c.object.length) || c.object.length < 1) {
    issue(['object', 'length'], 'the length is a whole number ≥ 1 (sixteenths below precision 1)');
  }
  if (c.precision < 1 && c.object.length % (SIXTEENTHS * c.precision) !== 0) {
    issue(['object', 'length'], 'the object ends on a ruler mark');
  }
  if (c.startOffset < 0) issue(['startOffset'], 'startOffset ≥ 0');
  const twoRuler = c.mode === 'two-units' && c.tool === 'ruler';
  const laying = c.mode === 'iterate' || (c.mode === 'two-units' && !twoRuler);
  if (laying && c.tool !== 'units') issue(['tool'], `${c.mode} lays units`);
  if (twoRuler) {
    if (!isTwoRuler(c)) issue(['unit'], 'two rulers measure centimeters and inches');
    else {
      if (c.startOffset !== 0 || c.precision !== 1) {
        issue(['startOffset'], 'two rulers start at 0, in whole centimeters');
      }
      if (objectUnits(c) >= TWO_RULER_CM) {
        issue(['object', 'length'], `the object ends before ${TWO_RULER_CM} cm`);
      }
      const frac = exactInches(c) - Math.floor(exactInches(c));
      if (Math.abs(frac - 0.5) < TWO_RULER_HALF_CLEAR) {
        issue(['object', 'length'], 'the inch reading is clearly nearer one inch mark');
      }
    }
  }
  if (c.mode === 'read' && c.tool !== 'ruler') issue(['tool'], 'read uses a ruler');
  if (laying && (c.startOffset !== 0 || c.precision !== 1)) {
    issue(['startOffset'], 'units are laid from the start, in whole units');
  }
  if (c.mode === 'two-units' && !twoRuler) {
    if (!c.altUnit || c.altUnit === c.unit) issue(['altUnit'], 'two-units needs a second unit');
    else if (lengthIn(c, c.altUnit) === null) {
      issue(['altUnit'], 'the object is a whole number of both units');
    }
  }
  if (c.input === 'tap-tick' && c.mode !== 'read') issue(['input'], 'tap-tick reads a ruler');
  if (c.input === 'pick' || c.mode === 'estimate') {
    const opts = c.options ?? [];
    // 03 §5.1: a pick shows at least three distinct options.
    if (opts.length < 3 || new Set(opts).size !== opts.length) {
      issue(['options'], 'a pick shows ≥ 3 distinct options');
    }
  }
});

const unitId = (u: LengthUnit, index: number): string => `${u}-${index}`;

export const measureLength: FormatModel<'measure-length', MeasureLengthState> = {
  format: 'measure-length',
  configSchema,
  features: {
    offset: { weight: 0.8, doc: 'the object does not start at the ruler’s 0' },
    'precision.half': { weight: 0.5, doc: 'read to the nearest half unit' },
    'precision.quarter': { weight: 0.9, doc: 'read to the nearest quarter unit' },
    'length.over10': { weight: 0.2, doc: 'the object is over 10 whole units long' },
    'mode.estimate': { weight: 0.3, doc: 'estimate the length' },
    'tool.units': { weight: -0.2, doc: 'measured by laying units (not a ruler)' },
    twoUnits: { weight: 0.4, doc: 'measured in two units' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    return {
      offset: c.startOffset !== 0 ? 1 : 0,
      'precision.half': c.precision === 0.5 ? 1 : 0,
      'precision.quarter': c.precision === 0.25 ? 1 : 0,
      'length.over10': objectUnits(c) > 10 ? 1 : 0,
      'mode.estimate': c.mode === 'estimate' ? 1 : 0,
      'tool.units': c.tool === 'units' ? 1 : 0,
      twoUnits: c.mode === 'two-units' ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    units: [],
    rulerStart: config.startOffset,
    startShown: false,
    endShown: false,
    counted: [],
    value: null,
    values: [null, null],
    choice: null,
  }),
  apply(s, a) {
    const c = s.config;
    switch (a.op) {
      case 'lay-unit': {
        if (c.tool !== 'units') return s;
        const index = argNumber(a, 'index');
        if (index === undefined || !Number.isInteger(index) || index < 0) return s;
        const name = argString(a, 'unit') ?? c.unit;
        const unit = name === c.altUnit && c.mode === 'two-units' ? c.altUnit : c.unit;
        if (name !== unit) return s;
        const id = unitId(unit, index);
        const rest = s.units.filter((u) => u.id !== id);
        if (a.args?.remove === true) return { ...s, units: rest };
        const at = argNumber(a, 'at') ?? index;
        if (at < -1) return s;
        return { ...s, units: [...rest, { id, unit, at: Math.round(at * 1000) / 1000 }] };
      }
      case 'slide-ruler': {
        if (c.tool !== 'ruler') return s;
        const to = argNumber(a, 'to');
        // The ruler stays under the object: its mark at the object's start is never below 0 nor
        // so high that the object would run off the ruler's far end.
        if (to === undefined) return s;
        return { ...s, rulerStart: Math.min(ML_LENGTH_MAX, Math.max(0, to)) };
      }
      case 'align-zero':
        return { ...s, startShown: true };
      case 'read-end':
        return { ...s, endShown: true };
      case 'count-units': {
        const name = argString(a, 'unit');
        const laid = [...new Set(s.units.map((u) => u.unit))];
        const unit = (laid.includes(name as LengthUnit) ? name : laid[laid.length - 1]) as
          | LengthUnit
          | undefined;
        if (!unit || s.counted.includes(unit)) return s;
        return { ...s, counted: [...s.counted, unit] };
      }
      case 'answer': {
        const values = argNumbers(a, 'values');
        if (values && c.mode === 'two-units' && values.length === 2) {
          return { ...s, values: [values[0] as number, values[1] as number] };
        }
        const id = argString(a, 'id');
        if (id !== undefined && (c.input === 'pick' || c.mode === 'estimate')) {
          const ok = (c.options ?? []).some((n) => numberOptionId(n) === id);
          return ok ? { ...s, choice: id } : s;
        }
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('measure-length', a.op);
    }
  },
  toResponse(s) {
    const c = s.config;
    if (c.mode === 'estimate' || c.input === 'pick') {
      return s.choice === null ? null : { kind: 'choice', id: s.choice };
    }
    switch (c.mode) {
      case 'iterate': {
        if (s.value === null) return null;
        const units = s.units
          .filter((u) => u.unit === c.unit)
          .map((u) => u.at)
          .sort((x, y) => x - y);
        return { kind: 'state', value: { units, value: s.value } };
      }
      case 'two-units': {
        const [x, y] = s.values;
        return x === null || y === null ? null : { kind: 'numbers', values: [x, y] };
      }
      default:
        if (s.value === null) return null;
        return c.input === 'tap-tick'
          ? { kind: 'placement', value: s.value }
          : { kind: 'number', value: s.value };
    }
  },
};
