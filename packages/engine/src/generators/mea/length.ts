// mea.length (03 §5.6): compare, order and measure lengths.
// Formats: measure-length, compare-length, numeral-pick, number-pad, order, compare.
//
// Modes (K01 builds the K–1 ones; K02 extends `read` for rulers and adds `estimate`):
// - compare     two to four objects, pick the longer or shorter one (compare-length), or two ruler
//               strips, pick the longer one or "same" (compare, ask longer)               MEA.01
// - order       put the objects in order by length (compare-length ask order, or order: numeral
//               cards, or ruler strips with the `ruler` representation)          MEA.07, MEA.01
// - indirect    two objects that cannot move side by side; compare them with a string   MEA.07
// - difference  how much longer is one than the other (compare-length how-much-longer; K02:
//               number-pad and numeral-pick: both lengths on a ruler from 0 with the `ruler`
//               representation, or no picture; the prompt names `long` and `short`) MEA.10
// - iterate     lay copies of one unit end to end and count them (measure-length), or count the
//               units in a picture (number-pad, numeral-pick)                            MEA.02
// - two-units   measure the same object with two units (measure-length), or say which unit is
//               needed more (or fewer) times (compare, ask more / fewer)                 MEA.22
//               K02 slice 4c-1, centimeters and inches (`unit: cm`, `altUnit: in`): whole
//               centimeters under 10 whose inch reading is at least 0.2 in from a half
//               (2, 3, 5, 7, 8 cm: about 1, 1, 2, 3, 3 in); measure-length draws a centimeter
//               ruler under the object and an inch ruler above it (answer [cm, inches]);
//               number-pad tells the inches ("about") and asks the centimeters on a ruler
//               picture from 0                                                           MEA.09
// - read        read a ruler (measure-length, number-pad, numeral-pick)                 MEA.03
// - estimate    K02 slice 4c-1: about how long? The object beside one unit drawn to the same scale
//               (a 1-inch tile, a 1-centimeter cube, a 1-foot or 1-meter bar), no ruler; three
//               options a factor of about 3 apart: round(length / 3), length, 3 × length
//               (measure-length, pick)                                                    MEA.08
// - unit-sort   K02 slice 4c-1: sort everyday things by the unit to measure them in, inches or
//               feet (shape-sort; things a child knows the size of: INCH_THINGS, FOOT_THINGS)
//                                                                                         MEA.08
//
// Every object length is a param (`length`, and the derived `length2`…`length4` drawn from the
// same domain), so the item key and every feature follow from the params alone (03 §5.3).

import type {
  ItemFormat,
  LessonStep,
  ParamValue,
  ParamValues,
  ResponseValue,
  SortRule,
  StimulusSpec,
  WidgetConfigOf,
} from '@number-island/shared';
import { CM_PER_INCH, TWO_RULER_CM, TWO_RULER_HALF_CLEAR } from '../../formats/measure-length';
import { numberOptionId, optionNumber } from '../../formats/numeral-pick';
import type { Rng } from '../../rng';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  layoutSeed,
  numberOptions,
  type PartialOutput,
  pickVars,
  sampleAll,
  sampleSpec,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

export const LENGTH_MODES = [
  'compare',
  'order',
  'indirect',
  'difference',
  'iterate',
  'two-units',
  'read',
  'estimate',
  'unit-sort',
] as const;
export type LengthMode = (typeof LENGTH_MODES)[number];
const ASKS = ['longer', 'shorter', 'more', 'fewer'] as const;
type LengthUnit = WidgetConfigOf<'measure-length'>['unit'];
const UNITS: LengthUnit[] = ['shell', 'cube', 'stick', 'in', 'cm', 'ft', 'm'];
const STANDARD = new Set<string>(['in', 'cm', 'ft', 'm']);

/**
 * Relative sizes of the non-standard units (cube 1, shell 2, stick 4), so an object can be
 * measured exactly in two of them (MEA.22) and widgets draw them to scale.
 */
export const NONSTANDARD_UNIT_SIZE: Readonly<Record<'cube' | 'shell' | 'stick', number>> = {
  cube: 1,
  shell: 2,
  stick: 4,
};
const unitSize = (u: string): number | undefined =>
  NONSTANDARD_UNIT_SIZE[u as keyof typeof NONSTANDARD_UNIT_SIZE];

/** Stretchable objects to compare or measure (art-kit sprite ids). */
export const LENGTH_SPRITES = ['rope', 'ribbon', 'plank', 'log', 'vine'] as const;

/** Which modes each format builds. */
const FORMAT_MODES: Record<string, readonly LengthMode[]> = {
  'compare-length': ['compare', 'order', 'indirect', 'difference'],
  compare: ['compare', 'two-units'],
  order: ['order'],
  'measure-length': ['iterate', 'two-units', 'read', 'estimate'],
  'shape-sort': ['unit-sort'],
  'number-pad': ['iterate', 'read', 'difference', 'two-units'],
  'numeral-pick': ['iterate', 'read', 'difference'],
};

const OBJECT_MODES = new Set<LengthMode>(['compare', 'order', 'indirect', 'difference']);
const PRECISIONS = [1, 2, 4];
const SIXTEENTHS = 16;

/** Things measured in inches, and in feet (MEA.08 unit-sort): sizes a second-grader knows. */
export const INCH_THINGS = ['pencil', 'shoe', 'spoon', 'cup', 'button'] as const;
export const FOOT_THINGS = ['door', 'table', 'fishing-rod'] as const;

/** The three estimate options: about a third, the length, three times (MEA.08). */
export function estimateOptions(length: number): number[] {
  return [Math.max(1, Math.round(length / 3)), length, 3 * length];
}

/** Centimeters and inches on rulers (MEA.09): the inches to the nearest inch. */
const isCmIn = (unit: string, alt: string): boolean => unit === 'cm' && alt === 'in';
/** The inch reading of a whole-centimeter length, and whether it is clear of a half inch. */
function cmToInches(cm: number): { inches: number; clear: boolean } {
  const exact = cm / CM_PER_INCH;
  const frac = exact - Math.floor(exact);
  return { inches: Math.round(exact), clear: Math.abs(frac - 0.5) >= TWO_RULER_HALF_CLEAR };
}

/** The object lengths of an item: `length`, then `length2` … `length<objects>`. */
export function objectLengths(p: Readonly<ParamValues>): number[] {
  const out = [asNum(p.length)];
  for (let k = 2; k <= 4; k += 1) {
    const v = p[`length${k}`];
    if (typeof v === 'number') out.push(v);
  }
  return out;
}

/** Smallest difference between any two lengths (0 with fewer than two). */
function smallestGap(ls: number[]): number {
  const s = [...ls].sort((a, b) => a - b);
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < s.length; i += 1)
    gap = Math.min(gap, (s[i] as number) - (s[i - 1] as number));
  return Number.isFinite(gap) ? gap : 0;
}

/** The closest pair's ratio (shorter ÷ longer), 0–1: 03 §5.5 compare-length `closeness`. */
export function lengthCloseness(ls: number[]): number {
  const s = [...ls].sort((a, b) => a - b);
  let best = 0;
  for (let i = 1; i < s.length; i += 1) {
    const hi = s[i] as number;
    if (hi > 0) best = Math.max(best, (s[i - 1] as number) / hi);
  }
  return best;
}

/** Whole units of a length (lengths are in sixteenths when precision > 1). */
const wholeUnits = (length: number, precision: number): number =>
  precision > 1 ? length / SIXTEENTHS : length;

const ratio100 = (x: number): number => Math.round(x * 100) / 100;

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const objId = (i: number): string => `obj-${i}`;

/** Unit sprite for a picture of laid units (standard units are drawn as cubes). */
const unitSprite = (u: string): string => (unitSize(u) !== undefined ? u : 'cube');

/** A ruler strip from 0 with the object's end marked (the `ruler` representation in compare). */
function rulerStrip(length: number, max: number): StimulusSpec {
  return {
    kind: 'number-line',
    min: 0,
    max,
    ticksEvery: 1,
    labelsEvery: null,
    marks: [{ at: length, arrow: true }],
  };
}

function isAsk(v: ParamValue | undefined): v is (typeof ASKS)[number] {
  return typeof v === 'string' && (ASKS as readonly string[]).includes(v);
}

export const meaLength: GeneratorDef = {
  id: 'mea.length',
  formats: [
    'measure-length',
    'compare-length',
    'numeral-pick',
    'number-pad',
    'order',
    'compare',
    'shape-sort',
  ],
  params: {
    mode: {
      type: 'string',
      values: [...LENGTH_MODES],
      // Templates always set the mode; the default lets any format build from defaults.
      default: { kind: 'choice', values: [...LENGTH_MODES] },
      doc: 'compare, order, indirect, difference, iterate, two-units or read (see the file header)',
    },
    ask: {
      type: 'string',
      values: [...ASKS],
      default: { kind: 'const', value: 'longer' },
      doc: 'longer or shorter (compare, indirect; order: longer = longest first); more or fewer (two-units on compare)',
    },
    length: {
      type: 'int',
      default: { kind: 'int', min: 2, max: 10 },
      doc: 'the (first) object length in `unit`; in sixteenths of the unit when precision > 1. The other objects draw their lengths from the same domain',
    },
    objects: {
      type: 'int',
      default: { kind: 'const', value: 2 },
      doc: 'how many objects to compare or order (2–4)',
    },
    cards: {
      type: 'int',
      default: { kind: 'const', value: 4 },
      doc: 'unit-sort: things to sort (3–6)',
    },
    hits: {
      type: 'int',
      default: { kind: 'const', value: 2 },
      doc: 'unit-sort: how many of them are measured in feet (1–3, leaving at least one in inches)',
    },
    same: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'compare on the compare format: both lengths are equal (answer "same")',
    },
    unit: {
      type: 'string',
      values: UNITS,
      default: { kind: 'choice', values: ['shell', 'cube', 'stick'] },
      doc: 'the measuring unit: shell, cube, stick (non-standard) or in, cm, ft, m',
    },
    altUnit: {
      type: 'string',
      values: ['none', ...UNITS],
      default: { kind: 'const', value: 'none' },
      doc: 'two-units: the second unit (a different non-standard unit); none otherwise',
    },
    offset: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'read: the ruler mark the object starts at; compare and order: how far the shortest object is shifted (0 = ends lined up)',
    },
    precision: {
      type: 'int',
      default: { kind: 'const', value: 1 },
      doc: 'read: 1 (whole units), 2 (halves) or 4 (quarters); lengths are then in sixteenths',
    },
  },
  derived: ['length2', 'length3', 'length4', 'gap', 'altLength'],
  features: {
    closeness: {
      weight: 0.8,
      doc: 'shorter ÷ longer of the closest pair (compare, order, indirect, difference); smaller ÷ bigger unit (two-units on compare)',
    },
    misaligned: { weight: 0.5, doc: 'the ends are not lined up (offset > 0)' },
    'estimate.long': {
      weight: 0.5,
      doc: 'estimate: max(0, length − 2) / 8 (a longer object is more units to picture)',
    },
    'unitSort.cards': { weight: 0.3, doc: 'unit-sort: cards − 3' },
    'inch.nearHalf': {
      weight: 0.5,
      doc: 'centimeters and inches: how near the inch reading is to a half (0 far, 1 at the 0.2 in limit)',
    },
    'objects.over2': { weight: 0.3, doc: 'objects − 2 (compare-length)' },
    indirect: { weight: 0.5, doc: 'compared through a third object (a string)' },
    'ask.difference': { weight: 0.5, doc: 'how much longer' },
    'ask.shorter': { weight: 0.3, doc: 'asks for the shorter one' },
    'ask.fewer': { weight: 0.3, doc: 'asks which unit is needed fewer times' },
    equal: { weight: 0.4, doc: 'both lengths are the same (answer "same")' },
    offset: { weight: 0.8, doc: 'read: the object does not start at 0' },
    'precision.half': { weight: 0.5, doc: 'read to the nearest half unit' },
    'precision.quarter': { weight: 0.9, doc: 'read to the nearest quarter unit' },
    'length.over10': { weight: 0.2, doc: 'the measured length is over 10 whole units' },
    'tool.units': { weight: -0.2, doc: 'measured by laying units (not a ruler)' },
    twoUnits: { weight: 0.4, doc: 'measured in two units' },
    'units.over5': {
      weight: 0.4,
      doc: 'max(0, units to lay or count − 5) / 5 (the larger count for two-units)',
    },
  },
  narration: [
    // its descending order retry line (items/check.ts retryFeedback)
    'fb.order.retry-desc',
    'gen.mea.length.line-up',
    'gen.mea.length.look-ends',
    'gen.mea.length.pick-longer',
    'gen.mea.length.pick-shorter',
    'gen.mea.length.pick-same',
    'gen.mea.length.string-first',
    'gen.mea.length.string-next',
    'gen.mea.length.order-short-first',
    'gen.mea.length.order-long-first',
    'gen.mea.length.order-start-short',
    'gen.mea.length.order-start-long',
    'gen.mea.length.order-next',
    'gen.mea.length.order-first-short',
    'gen.mea.length.order-first-long',
    'gen.mea.length.order-then',
    'gen.mea.length.sticks-out',
    'gen.mea.length.longer-by',
    'gen.mea.length.take-away',
    'gen.mea.length.lay-first',
    'gen.mea.length.lay-next',
    'gen.mea.length.units-long',
    'gen.mea.length.estimate-unit',
    'gen.mea.length.estimate-about',
    'gen.mea.length.sort-look',
    'gen.mea.length.sort-inches',
    'gen.mea.length.sort-feet',
    'gen.mea.length.two-rulers-zero',
    'gen.mea.length.two-rulers-cm',
    'gen.mea.length.two-rulers-in',
    'gen.mea.length.two-rulers-more',
    'gen.mea.length.use-unit',
    'gen.mea.length.makes',
    'gen.mea.length.two-counts',
    'gen.mea.length.count-units',
    'gen.mea.length.read-start',
    'gen.mea.length.read-end',
    'gen.mea.length.smaller-more',
    'gen.mea.length.need-more',
    'gen.mea.length.need-fewer',
  ],
  sample(spec, rng: Rng) {
    const p = sampleAll(spec, rng);
    const mode = asStr(p.mode) as LengthMode;
    if (OBJECT_MODES.has(mode)) {
      // The other objects draw from the template's own `length` domain (never overridden).
      const n = Math.min(4, Math.max(2, asNum(p.objects, 2)));
      const lengthSpec = spec.length;
      for (let k = 2; k <= n; k += 1) {
        // Fixed lengths (lesson and misconception examples give them as params) are kept.
        if (spec[`length${k}`]) continue;
        p[`length${k}`] =
          k === 2 && p.same === true
            ? asNum(p.length)
            : lengthSpec
              ? (sampleSpec(lengthSpec, rng) as number)
              : asNum(p.length);
      }
    }
    return p;
  },
  derive(p) {
    const ls = objectLengths(p);
    const u = asStr(p.unit);
    const alt = asStr(p.altUnit, 'none');
    const su = unitSize(u);
    const sa = unitSize(alt);
    const base = su !== undefined ? asNum(p.length) * su : 0;
    const altLength = isCmIn(u, alt)
      ? cmToInches(asNum(p.length)).inches
      : sa !== undefined && base % sa === 0
        ? base / sa
        : 0;
    return { gap: smallestGap(ls), altLength };
  },
  accepts(p, t) {
    const mode = asStr(p.mode) as LengthMode;
    const ask = p.ask;
    if (!(FORMAT_MODES[t.format] ?? []).includes(mode) || !isAsk(ask)) return false;
    const n = asNum(p.objects, 2);
    const length = asNum(p.length);
    const precision = asNum(p.precision, 1);
    const offset = asNum(p.offset);
    const unit = asStr(p.unit);
    const alt = asStr(p.altUnit, 'none');
    if (length < 1 || offset < 0 || !PRECISIONS.includes(precision)) return false;
    if (p.same === true && !(t.format === 'compare' && mode === 'compare')) return false;
    if (mode !== 'read' && precision !== 1) return false;
    if (mode !== 'two-units' && alt !== 'none') return false;
    const longShort = ask === 'longer' || ask === 'shorter';
    if (OBJECT_MODES.has(mode)) {
      if (!longShort || n < 2 || n > 4) return false;
      if (t.format === 'compare' && (n !== 2 || ask !== 'longer')) return false;
      if ((mode === 'indirect' || mode === 'difference') && n !== 2) return false;
      const ls = objectLengths(p);
      if (ls.length !== n) return false;
      // Lengths differ (an equal pair only for "same" on the compare format).
      if (p.same !== true && new Set(ls).size !== ls.length) return false;
      return true;
    }
    if (offset !== 0 && mode !== 'read') return false;
    switch (mode) {
      case 'iterate':
        return true;
      case 'two-units': {
        if (isCmIn(unit, alt)) {
          if (t.format === 'compare') return false;
          return length < TWO_RULER_CM && cmToInches(length).clear && asNum(p.altLength) >= 1;
        }
        if (t.format === 'number-pad') return false;
        if (t.format === 'compare')
          return (
            (ask === 'more' || ask === 'fewer') &&
            alt !== unit &&
            unitSize(alt) !== undefined &&
            unitSize(unit) !== undefined
          );
        return (
          alt !== unit &&
          unitSize(alt) !== undefined &&
          unitSize(unit) !== undefined &&
          asNum(p.altLength) > 0
        );
      }
      case 'estimate':
        return (
          t.format === 'measure-length' && STANDARD.has(unit) && length >= 2 && 3 * length <= 99
        );
      case 'unit-sort': {
        const cards = asNum(p.cards, 4);
        const hits = asNum(p.hits, 2);
        return (
          t.format === 'shape-sort' &&
          cards >= 3 &&
          cards <= 6 &&
          hits >= 1 &&
          hits <= FOOT_THINGS.length &&
          cards - hits >= 1 &&
          cards - hits <= INCH_THINGS.length
        );
      }
      case 'read': {
        if (!STANDARD.has(unit)) return false;
        if (precision > 1 && length % (SIXTEENTHS / precision) !== 0) return false;
        // Numeric pick ids are integers (opt-<n>); fractional readings use the pad.
        if (t.format === 'numeral-pick' && precision > 1) return false;
        return true;
      }
      default:
        return false;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const mode = asStr(params.mode) as LengthMode;
    const ask = asStr(params.ask, 'longer');
    const unit = asStr(params.unit, 'cube') as LengthUnit;
    const altUnit = asStr(params.altUnit, 'none');
    const length = asNum(params.length);
    const offset = asNum(params.offset);
    const precision = asNum(params.precision, 1);
    const altLength = asNum(params.altLength);
    const layout = rng.fork('layout');
    const sprite = layout.pick(LENGTH_SPRITES);
    const all = objectLengths(params);
    const vars = pickVars(t, {
      unit,
      altUnit,
      ask,
      inches: altLength,
      many: 2,
      one: 1,
      long: Math.max(...all),
      short: Math.min(...all),
    });
    const math: Record<string, number> = {};
    let p: PartialOutput;

    if (OBJECT_MODES.has(mode)) {
      const lengths = objectLengths(params);
      math.closeness = ratio100(lengthCloseness(lengths));
      if (t.format === 'number-pad' || t.format === 'numeral-pick') {
        // How much longer (difference only): with the `ruler` representation, both lengths on a
        // ruler from 0 (a dot where the short one ends, an arrow where the long one ends);
        // otherwise no picture. The prompt names both lengths either way.
        const long = Math.max(...lengths);
        const short = Math.min(...lengths);
        const value = long - short;
        math['ask.difference'] = 1;
        const stimulus: StimulusSpec =
          t.representation === 'ruler'
            ? {
                kind: 'number-line',
                min: 0,
                max: long + 1,
                ticksEvery: 1,
                labelsEvery: 1,
                marks: [{ at: short }, { at: long, arrow: true }],
              }
            : { kind: 'none' };
        if (t.format === 'numeral-pick') {
          const opts = numberOptions(t, params, value, rng, 1);
          math['distractors.diagnostic'] = opts.diagnostic;
          p = {
            params,
            vars,
            math,
            widget: { format: 'numeral-pick', stimulus, options: opts.options, layout: 'row' },
            answer: { kind: 'choice', id: numberOptionId(value) },
          };
          return finish(meaLength, ctx, p);
        }
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus,
            blanks: [{ id: 'n', maxDigits: 2 }],
            unit: STANDARD.has(unit) ? (unit as 'in' | 'cm' | 'ft' | 'm') : null,
          },
          answer: { kind: 'number', value },
        };
        return finish(meaLength, ctx, p);
      }
      if (t.format === 'compare') {
        // Two ruler strips on one scale; the side of the first length comes from the layout.
        const [a, b] = lengths as [number, number];
        const swap = layout.bool(0.5);
        const [left, right] = swap ? [b, a] : [a, b];
        const max = Math.max(a, b) + 1;
        const id = left === right ? 'same' : left > right ? 'left' : 'right';
        math.equal = a === b ? 1 : 0;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'compare',
            left: rulerStrip(left, max),
            right: rulerStrip(right, max),
            ask: 'longer',
            allowMatchLines: false,
          },
          answer: { kind: 'choice', id },
        };
        return finish(meaLength, ctx, p);
      }
      // Display order from the layout stream; ids follow display order.
      const shown = layout.shuffle(lengths);
      const shortest = Math.min(...shown);
      const objects = shown.map((len, i) => ({
        id: objId(i),
        sprite,
        length: len,
        offset:
          mode === 'indirect' ? (i === 1 ? 2 : 0) : offset > 0 && len === shortest ? offset : 0,
      }));
      const misaligned = mode !== 'indirect' && offset > 0;
      if (mode !== 'indirect') math.misaligned = misaligned ? 1 : 0;
      math['objects.over2'] = Math.max(0, shown.length - 2);
      math.indirect = mode === 'indirect' ? 1 : 0;
      math['ask.difference'] = mode === 'difference' ? 1 : 0;
      math['ask.shorter'] = mode !== 'order' && mode !== 'difference' && ask === 'shorter' ? 1 : 0;
      const widget: WidgetConfigOf<'compare-length'> = {
        format: 'compare-length',
        objects,
        ask:
          mode === 'order'
            ? 'order'
            : mode === 'difference'
              ? 'how-much-longer'
              : mode === 'indirect'
                ? 'indirect'
                : (ask as 'longer' | 'shorter'),
        aligned: !misaligned && mode !== 'indirect',
      };
      if (t.format === 'order') {
        const asc = ask === 'shorter';
        const sorted = [...lengths].sort((x, y) => (asc ? x - y : y - x));
        // The ruler representation (MEA.01) shows each object as a ruler strip on one scale with no
        // numeral, so the child orders what they see: the compare-length closeness applies, and no
        // numeral magnitude. Otherwise each card is the measured length as a numeral (MEA.07).
        const strips = t.representation === 'ruler';
        const max = Math.max(...lengths) + 1;
        p = {
          params,
          vars,
          math: strips ? { closeness: math.closeness ?? 0, magnitude: 0 } : {},
          widget: {
            format: 'order',
            items: shown.map((len, i) =>
              strips
                ? { id: objId(i), value: len, stimulus: rulerStrip(len, max) }
                : { id: objId(i), value: len, label: String(len) },
            ),
            direction: asc ? 'asc' : 'desc',
          },
          answer: { kind: 'numbers', values: sorted, ordered: true },
        };
        return finish(meaLength, ctx, p);
      }
      let answer: PartialOutput['answer'];
      if (mode === 'order') {
        const asc = ask === 'shorter';
        answer = {
          kind: 'numbers',
          values: [...lengths].sort((x, y) => (asc ? x - y : y - x)),
          ordered: true,
        };
      } else if (mode === 'difference') {
        answer = { kind: 'number', value: Math.max(...lengths) - Math.min(...lengths) };
      } else {
        const want = ask === 'shorter' ? Math.min(...shown) : Math.max(...shown);
        answer = { kind: 'choice', id: objId(shown.indexOf(want)) };
      }
      p = { params, vars, math, widget, answer };
      return finish(meaLength, ctx, p);
    }

    if (mode === 'two-units' && t.format === 'compare') {
      // Which unit is needed more (or fewer) times to measure the same object?
      const small = (unitSize(unit) ?? 0) < (unitSize(altUnit) ?? 0) ? unit : altUnit;
      const big = small === unit ? altUnit : unit;
      const swap = layout.bool(0.5);
      const [left, right] = swap ? [altUnit, unit] : [unit, altUnit];
      const want = ask === 'fewer' ? big : small;
      math.closeness = ratio100((unitSize(small) ?? 1) / (unitSize(big) ?? 1));
      math['ask.fewer'] = ask === 'fewer' ? 1 : 0;
      const pic = (u: string): StimulusSpec => ({
        kind: 'objects',
        set: { count: 1, sprite: u, layout: 'line', layoutSeed: layoutSeed(rng) },
      });
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'compare',
          left: pic(left),
          right: pic(right),
          ask: ask === 'fewer' ? 'fewer' : 'more',
          allowMatchLines: false,
        },
        answer: { kind: 'choice', id: left === want ? 'left' : 'right' },
      };
      return finish(meaLength, ctx, p);
    }

    if (mode === 'unit-sort') {
      const cards = asNum(params.cards, 4);
      const hits = asNum(params.hits, 2);
      const draw = rng.fork('cards');
      const feet = draw.shuffle([...FOOT_THINGS]).slice(0, hits);
      const inches = draw.shuffle([...INCH_THINGS]).slice(0, cards - hits);
      const shown = rng
        .fork('layout')
        .shuffle([
          ...feet.map((sprite) => ({ sprite, unit: 'ft' })),
          ...inches.map((sprite) => ({ sprite, unit: 'in' })),
        ]);
      const bins: { id: string; label: string; rule: SortRule }[] = [
        { id: 'b0', label: 'unit.in.many', rule: { prop: 'unit', op: '==', value: 'in' } },
        { id: 'b1', label: 'unit.ft.many', rule: { prop: 'unit', op: '==', value: 'ft' } },
      ];
      const cardList = shown.map((c, i) => ({
        id: `c${i}`,
        sprite: c.sprite,
        props: { unit: c.unit },
      }));
      p = {
        params,
        vars,
        math: { 'unitSort.cards': Math.max(0, cards - 3) },
        widget: {
          format: 'shape-sort',
          cards: cardList.map((c) => ({
            id: c.id,
            card: { kind: 'object', sprite: c.sprite, props: c.props },
          })),
          bins,
          mode: 'sort',
          // A thing's name is what the child sees; the bins ask the unit to measure it in.
          namesGiven: true,
        },
        answer: {
          kind: 'state',
          checker: 'sort.byRule',
          target: {
            cards: cardList.map((c) => ({ id: c.id, props: c.props })),
            bins: bins.map((b) => ({ id: b.id, rule: b.rule })),
          },
        },
      };
      return finish(meaLength, ctx, p);
    }

    if (mode === 'estimate') {
      // Shuffled (review R1): the answer is not always the middle button.
      const options = layout.shuffle(estimateOptions(length));
      p = {
        params,
        vars,
        math: { 'estimate.long': ratio100(Math.max(0, length - 2) / 8) },
        widget: {
          format: 'measure-length',
          object: { sprite, length },
          tool: 'units',
          unit,
          startOffset: 0,
          precision: 1,
          mode: 'estimate',
          input: 'pick',
          options,
        },
        answer: { kind: 'choice', id: numberOptionId(length) },
      };
      return finish(meaLength, ctx, p);
    }

    // Measuring: iterate, two-units, read.
    const whole = wholeUnits(length, precision);
    const value = whole;
    math['length.over10'] = whole > 10 ? 1 : 0;
    if (mode === 'two-units' && isCmIn(unit, altUnit)) {
      const exact = length / CM_PER_INCH;
      const fromHalf = Math.abs(exact - Math.floor(exact) - 0.5);
      math['inch.nearHalf'] = ratio100(
        Math.max(0, 1 - (fromHalf - TWO_RULER_HALF_CLEAR) / (0.5 - TWO_RULER_HALF_CLEAR)),
      );
    }
    if (mode === 'iterate' || (mode === 'two-units' && !isCmIn(unit, altUnit))) {
      math['units.over5'] = ratio100(Math.max(0, Math.max(length, altLength) - 5) / 5);
    }
    if (mode === 'read') {
      math.offset = offset !== 0 ? 1 : 0;
      math['precision.half'] = precision === 2 ? 1 : 0;
      math['precision.quarter'] = precision === 4 ? 1 : 0;
    }
    const padUnit = STANDARD.has(unit) ? (unit as 'in' | 'cm' | 'ft' | 'm') : null;
    // A picture of the measurement: units laid end to end, or the object on a ruler.
    const picture: StimulusSpec =
      mode === 'two-units' && t.format === 'number-pad'
        ? {
            kind: 'number-line',
            min: 0,
            max: whole + 1,
            ticksEvery: 1,
            labelsEvery: 1,
            marks: [{ at: 0 }, { at: whole, arrow: true }],
          }
        : mode === 'read'
          ? {
              kind: 'number-line',
              min: 0,
              max: Math.ceil(offset + whole) + 1,
              ticksEvery: 1 / precision,
              labelsEvery: 1,
              marks: [{ at: offset }, { at: offset + whole, arrow: true }],
            }
          : {
              kind: 'objects',
              set: {
                count: length,
                sprite: unitSprite(unit),
                layout: 'line',
                layoutSeed: layoutSeed(rng),
              },
            };
    switch (t.format) {
      case 'measure-length': {
        math['tool.units'] = mode === 'read' || isCmIn(unit, altUnit) ? 0 : 1;
        if (mode === 'two-units') math.twoUnits = 1;
        const widget: WidgetConfigOf<'measure-length'> = {
          format: 'measure-length',
          object: { sprite, length },
          tool: mode === 'read' || isCmIn(unit, altUnit) ? 'ruler' : 'units',
          unit,
          ...(mode === 'two-units' ? { altUnit: altUnit as LengthUnit } : {}),
          startOffset: mode === 'read' ? offset : 0,
          precision: (1 / precision) as 1 | 0.5 | 0.25,
          mode: mode === 'two-units' ? 'two-units' : mode === 'read' ? 'read' : 'iterate',
          input: 'pad',
        };
        const answer: PartialOutput['answer'] =
          mode === 'iterate'
            ? {
                kind: 'state',
                checker: 'units.iterate',
                target: { length, gapTolerance: 0.1 },
              }
            : mode === 'two-units'
              ? { kind: 'numbers', values: [length, altLength], ordered: true }
              : { kind: 'number', value };
        p = {
          params,
          vars,
          math,
          widget,
          answer,
          nudge:
            mode === 'read' || isCmIn(unit, altUnit)
              ? []
              : [{ op: 'lay-unit', args: { index: 0 } }],
          highlight:
            mode === 'read' || isCmIn(unit, altUnit)
              ? [{ op: 'read-end' }]
              : [{ op: 'count-units' }],
        };
        break;
      }
      case 'number-pad':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: picture,
            blanks: [
              { id: 'n', maxDigits: 2, ...(Number.isInteger(value) ? {} : { allowDecimal: true }) },
            ],
            unit: padUnit,
          },
          answer: { kind: 'number', value },
        };
        break;
      case 'numeral-pick': {
        const opts = numberOptions(t, params, value, rng, 1);
        math['distractors.diagnostic'] = opts.diagnostic;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'numeral-pick',
            stimulus: picture,
            options: opts.options,
            layout: 'row',
          },
          answer: { kind: 'choice', id: numberOptionId(value) },
        };
        break;
      }
      default:
        throw new Error(`mea.length cannot build ${t.format} in mode ${mode}`);
    }
    return finish(meaLength, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind === 'state' && a.checker === 'sort.byRule') {
      // unit-sort (MEA.08): each card in the bin of its unit.
      const cards = a.target.cards as { id: string; props: { unit: string } }[];
      return {
        kind: 'state',
        value: {
          bins: {
            b0: cards.filter((c) => c.props.unit === 'in').map((c) => c.id),
            b1: cards.filter((c) => c.props.unit === 'ft').map((c) => c.id),
          },
        },
      };
    }
    if (a.kind === 'state' && a.checker === 'units.iterate') {
      const length = asNum(a.target.length as ParamValue);
      return {
        kind: 'state',
        value: { units: Array.from({ length }, (_, i) => i), value: length },
      };
    }
    return correctFromAnswer(a);
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const a = out.answer;
    const p = out.params;
    const unit = asStr(p.unit, 'cube');
    const altUnit = asStr(p.altUnit, 'none');
    switch (w.format) {
      case 'compare-length': {
        const steps: LessonStep[] = [];
        const byLength = [...w.objects].sort((x, y) => x.length - y.length);
        const short = byLength[0] as (typeof byLength)[number];
        const long = byLength[byLength.length - 1] as (typeof byLength)[number];
        if (w.ask === 'indirect') {
          steps.push(
            say('gen.mea.length.string-first', {}, { op: 'lay-string', args: { id: long.id } }),
            say('gen.mea.length.string-next', {}, { op: 'lay-string', args: { id: short.id } }),
          );
        } else if (!w.aligned) {
          steps.push(say('gen.mea.length.line-up', {}, { op: 'align', args: { id: short.id } }));
        }
        if (w.ask === 'order' && a.kind === 'numbers') {
          const asc = (a.values[0] ?? 0) <= (a.values[a.values.length - 1] ?? 0);
          steps.push(
            say('gen.mea.length.look-ends', {}),
            say(
              asc ? 'gen.mea.length.order-short-first' : 'gen.mea.length.order-long-first',
              {},
              { op: 'answer', args: { values: [...a.values] } },
            ),
          );
          return steps;
        }
        if (w.ask === 'how-much-longer' && a.kind === 'number') {
          steps.push(
            say('gen.mea.length.sticks-out', {}, { op: 'highlight-difference' }),
            say(
              'gen.mea.length.longer-by',
              { n: a.value },
              { op: 'answer', args: { value: a.value } },
            ),
          );
          return steps;
        }
        const id = a.kind === 'choice' ? a.id : long.id;
        const shorter = w.ask === 'shorter' || (w.ask === 'indirect' && p.ask === 'shorter');
        // Look at both ends first, with no highlight: the worked-step hint (level 4) plays this
        // step, and the part that sticks out is on the longer object.
        if (w.ask !== 'indirect')
          steps.push(
            say('gen.mea.length.look-ends', {}),
            say('gen.mea.length.sticks-out', {}, { op: 'highlight-difference' }),
          );
        steps.push(
          say(
            shorter ? 'gen.mea.length.pick-shorter' : 'gen.mea.length.pick-longer',
            {},
            { op: 'answer', args: { id } },
          ),
        );
        return steps;
      }
      case 'compare': {
        const id = a.kind === 'choice' ? a.id : 'same';
        if (asStr(p.mode) === 'two-units') {
          const small = (unitSize(unit) ?? 0) < (unitSize(altUnit) ?? 0) ? unit : altUnit;
          // Steps before the last carry no highlight: the worked-step hint (level 4) plays them and
          // must not point at the answer.
          return [
            say('gen.mea.length.smaller-more', { unit: small, many: 2 }),
            say(
              w.ask === 'fewer' ? 'gen.mea.length.need-fewer' : 'gen.mea.length.need-more',
              {},
              { op: 'answer', args: { id } },
            ),
          ];
        }
        return [
          say('gen.mea.length.look-ends', {}),
          say(
            id === 'same' ? 'gen.mea.length.pick-same' : 'gen.mea.length.pick-longer',
            {},
            { op: 'answer', args: { id } },
          ),
        ];
      }
      case 'order': {
        if (a.kind !== 'numbers') return [];
        const asc = w.direction === 'asc';
        const used = new Set<string>();
        // Ruler strips carry no numeral: the steps name the strips by length, not by number, and
        // the first only says where to look (the worked-step hint, level 4, plays it).
        const pictures = w.items.every((x) => x.label === undefined);
        const drags = a.values.map((v, slot) => {
          const item = w.items.find((x) => x.value === v && !used.has(x.id));
          const id = item?.id ?? objId(0);
          used.add(id);
          return { id, slot, v };
        });
        if (pictures) {
          return [
            say('gen.mea.length.look-ends', {}),
            ...drags.map(({ id, slot }) =>
              say(
                slot > 0
                  ? 'gen.mea.length.order-then'
                  : asc
                    ? 'gen.mea.length.order-first-short'
                    : 'gen.mea.length.order-first-long',
                {},
                { op: 'drag', args: { id, slot } },
              ),
            ),
          ];
        }
        return drags.map(({ id, slot, v }) => {
          const key =
            slot === 0
              ? asc
                ? 'gen.mea.length.order-start-short'
                : 'gen.mea.length.order-start-long'
              : 'gen.mea.length.order-next';
          return say(key, { n: v }, { op: 'drag', args: { id, slot } });
        });
      }
      case 'shape-sort': {
        if (w.bins === null) return [];
        const steps: LessonStep[] = [say('gen.mea.length.sort-look', {})];
        for (const card of w.cards) {
          if (!('sprite' in card.card)) continue;
          const bin = card.card.props.unit === 'ft' ? 'b1' : 'b0';
          steps.push(
            say(
              bin === 'b1' ? 'gen.mea.length.sort-feet' : 'gen.mea.length.sort-inches',
              {},
              { op: 'drag-card', args: { id: card.id, bin } },
            ),
          );
        }
        return steps;
      }
      case 'measure-length': {
        if (w.mode === 'estimate' && a.kind === 'choice') {
          // Picture the unit along it; the first step says no number.
          return [
            say('gen.mea.length.estimate-unit', { unit, one: 1 }),
            say(
              'gen.mea.length.estimate-about',
              { n: w.object.length, unit },
              { op: 'answer', args: { id: a.id } },
            ),
          ];
        }
        if (w.mode === 'read') {
          const end =
            w.startOffset + (w.precision < 1 ? w.object.length / SIXTEENTHS : w.object.length);
          const n = a.kind === 'number' ? a.value : 0;
          return [
            say('gen.mea.length.read-start', { start: w.startOffset }, { op: 'align-zero' }),
            say('gen.mea.length.read-end', { end }, { op: 'read-end' }),
            say('gen.mea.length.units-long', { n, unit }, { op: 'answer', args: { value: n } }),
          ];
        }
        const lay = (count: number, u: string): LessonStep[] =>
          Array.from({ length: count }, (_, i) =>
            say(
              i === 0 ? 'gen.mea.length.lay-first' : 'gen.mea.length.lay-next',
              { n: i + 1 },
              {
                op: 'lay-unit',
                args: w.mode === 'two-units' ? { index: i, unit: u } : { index: i },
              },
            ),
          );
        if (w.mode === 'two-units' && a.kind === 'numbers' && w.tool === 'ruler') {
          // Two rulers (MEA.09): line up 0, read the centimeter end, then the nearest inch. Only the
          // last step says a number (a faded lesson plays every step before the child's turn).
          const [n, m] = a.values as [number, number];
          return [
            say('gen.mea.length.two-rulers-zero', {}, { op: 'align-zero' }),
            say('gen.mea.length.two-rulers-cm', {}, { op: 'read-end' }),
            say(
              'gen.mea.length.two-rulers-in',
              { n, m, alt: altUnit },
              { op: 'answer', args: { values: [n, m] } },
            ),
          ];
        }
        if (w.mode === 'two-units' && a.kind === 'numbers') {
          const [n, m] = a.values as [number, number];
          return [
            say('gen.mea.length.use-unit', { unit, many: 2 }),
            ...lay(n, unit),
            say('gen.mea.length.makes', { n, unit }, { op: 'count-units' }),
            say('gen.mea.length.use-unit', { unit: altUnit, many: 2 }),
            ...lay(m, altUnit),
            say(
              'gen.mea.length.two-counts',
              { n, unit, m, altUnit },
              { op: 'answer', args: { values: [n, m] } },
            ),
          ];
        }
        const n = w.object.length;
        return [
          ...lay(n, unit),
          say('gen.mea.length.units-long', { n, unit }, { op: 'answer', args: { value: n } }),
        ];
      }
      case 'number-pad':
      case 'numeral-pick': {
        const n =
          a.kind === 'number' ? a.value : a.kind === 'choice' ? (optionNumber(a.id) ?? 0) : 0;
        if (asStr(p.mode) === 'difference') {
          const ls = objectLengths(p);
          return [
            say('gen.mea.length.take-away', {
              long: Math.max(...ls),
              short: Math.min(...ls),
            }),
            say(
              'gen.mea.length.longer-by',
              { n },
              w.format === 'number-pad'
                ? { op: 'type', args: { blank: 'n', value: n } }
                : { op: 'tap', args: { id: numberOptionId(n) } },
            ),
          ];
        }
        if (asStr(p.mode) === 'two-units') {
          // MEA.09 on the pad: the inches are told; read the centimeters on the ruler picture.
          return [
            say('gen.mea.length.read-start', { start: 0 }),
            say(
              'gen.mea.length.two-rulers-more',
              { n, m: asNum(p.altLength) },
              { op: 'type', args: { blank: 'n', value: n } },
            ),
          ];
        }
        const first =
          asStr(p.mode) === 'read'
            ? say('gen.mea.length.read-start', { start: asNum(p.offset) })
            : say('gen.mea.length.count-units', { unit, many: 2 });
        const last =
          w.format === 'number-pad'
            ? say(
                'gen.mea.length.units-long',
                { n, unit },
                { op: 'type', args: { blank: 'n', value: n } },
              )
            : say(
                'gen.mea.length.units-long',
                { n, unit },
                { op: 'tap', args: { id: numberOptionId(n) } },
              );
        return [first, last];
      }
      default:
        return [];
    }
  },
};

/** Formats whose items the generator builds in a mode (exported for tests). */
export function lengthModesFor(format: ItemFormat): readonly LengthMode[] {
  return FORMAT_MODES[format] ?? [];
}
