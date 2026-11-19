// pv.number (03 §5.6): place value. One number `n` (or a number with `digits` digits), shown,
// built, read, written from its tens and ones, named, expanded, or asked what one digit is worth.
//
// Modes and the formats that build them (any other pair throws, so a template error is loud):
//   build        base-ten-build `build` (baseten.value `{ value }`: any pieces of the right value;
//                with nonCanonical the tray `limits` hold one piece too few at the lowest non-zero
//                place and none below it, so no tray-only mat is worth n and the child splits a
//                piece of the next place: forcedTrade),
//                tenframe-fill and rekenrek (show n, a full ten first), expanded-form `build` (pick
//                the place-value cards)
//   exact        base-ten-build `build-exact` (baseten.exact `{ value, exact }`: the canonical
//                counts, or with nonCanonical one unit of the lowest place above the ones broken
//                into ten: 34 as 2 tens 14 ones)
//   read         a picture of n (by representation: base-ten or bundles, ten-frames, rekenrek, dots)
//                → number-pad, numeral-pick, dot-flash, rekenrek `read`, base-ten-build `read`
//   write        n given as its tens and ones in the prompt ({tens} tens and {ones} ones, or
//                ten and {o} more) → number-pad, numeral-pick, hundred-chart `find`, or
//                tenframe-fill and rekenrek (build it, then type how many: thenAsk)
//   words        expanded-form `words` (hear the number name, type the numeral) or numeral-pick
//                (see the numeral, pick its name; n ≤ 99, the names are the num.* clips)
//   expanded     the expanded form (10 + 4) with a blank: `place` −1 asks for n (10 + 4 = ?),
//                place k for the term at place k (14 = 10 + ?) → number-pad, numeral-pick,
//                expanded-form `to-standard` / `fill`, hundred-chart (find 30 + 4)
//   digit-value  the value of the digit at `place` (−1: the leading digit) → number-pad,
//                numeral-pick, expanded-form `digit-value`
//
// `wholeIs: flat` (decimals) reads every count in hundredths (flat 100, rod 10, unit 1); it is
// drawn only as base-ten pieces. Feature values depend on the params (and the template's format)
// only: the learner rebuilds difficulty from params and seed with another RNG stream.
// Responses and targets follow U04's base-ten-build and expanded-form models (engine README,
// "Conventions the U04 formats fix"): the mat is `{ thousands, hundreds, tens, ones }`, and
// `digitIndex` / `highlight-digit {index}` count digits from the left (`place` counts from the ones).

import {
  type ExpressionToken,
  FORMAT_DEFAULT_REPRESENTATION,
  type ItemFormat,
  type LessonStep,
  type ParamValues,
  type Representation,
  type ResponseValue,
  type StimulusSpec,
  type WidgetConfig,
} from '@number-island/shared';
import { numberOptionId, optionNumber } from '../../formats/numeral-pick';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  numberOptions,
  type PartialOutput,
  pickVars,
  sampleAll,
  sampleSpec,
  tenFrameOverlay,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

export const PV_MODES = [
  'auto',
  'build',
  'read',
  'write',
  'words',
  'expanded',
  'digit-value',
  'exact',
] as const;
export type PvMode = (typeof PV_MODES)[number];
export const PV_ZEROS = ['any', 'none', 'internal', 'trailing', 'some'] as const;

/** Place names, ones first (narration keys gen.pv.number.<name> and place-<name>). */
const PLACES = ['ones', 'tens', 'hundreds', 'thousands', 'ten-thousands', 'hundred-thousands'];
const BASE_TEN_KINDS = ['ones', 'tens', 'hundreds', 'thousands'] as const;
type Kind = (typeof BASE_TEN_KINDS)[number];

/** Pictures with ten-frames, rekenrek rows or frame dots hold at most twenty. */
const TWENTY_REPS = new Set(['ten-frame', 'double-ten-frame', 'rekenrek', 'dots']);
const BASE_TEN_REPS = new Set(['base-ten', 'bundles']);

// ---------- digits, zeros, counts ----------

/** The digits of n, ones first (0 → [0]). */
export function digitsOf(n: number): number[] {
  const out: number[] = [];
  let v = Math.max(0, Math.trunc(n));
  do {
    out.push(v % 10);
    v = Math.floor(v / 10);
  } while (v > 0);
  return out;
}

/** A 0 digit with a non-zero digit to its right (305, 1,045); 340 and 300 have none. */
export function zeroInternal(n: number): boolean {
  const d = digitsOf(n);
  return d.some((x, i) => i > 0 && x === 0 && d.slice(0, i).some((y) => y !== 0));
}

/** Ends in a zero (60, 450, 300). */
export function zeroTrailing(n: number): boolean {
  return n >= 10 && n % 10 === 0;
}

export function zerosMatch(n: number, zeros: string): boolean {
  const hasZero = digitsOf(n).includes(0);
  switch (zeros) {
    case 'none':
      return !hasZero;
    case 'internal':
      return zeroInternal(n);
    case 'trailing':
      return zeroTrailing(n);
    case 'some':
      return hasZero && n >= 10;
    default:
      return true;
  }
}

/**
 * How many units of each place the item shows, ones first: the digits, or with `nonCanonical` one
 * unit of the lowest non-zero place above the ones broken into ten of the place below
 * (34 → 2 tens 14 ones; 305 → 2 hundreds 10 tens 5 ones; 340 → 3 hundreds 3 tens 10 ones).
 */
export function placeCounts(n: number, nonCanonical: boolean): number[] {
  const c = digitsOf(n);
  if (!nonCanonical) return c;
  const k = c.findIndex((x, i) => i > 0 && x > 0);
  if (k < 1) return c;
  c[k] = (c[k] as number) - 1;
  c[k - 1] = (c[k - 1] as number) + 10;
  return c;
}

/** The non-zero expanded-form terms, largest place first (345 → 300, 40, 5; 34 regrouped → 20, 14). */
export function expandedTerms(counts: readonly number[]): { place: number; value: number }[] {
  const out: { place: number; value: number }[] = [];
  for (let k = counts.length - 1; k >= 0; k -= 1) {
    const c = counts[k] as number;
    if (c > 0) out.push({ place: k, value: c * 10 ** k });
  }
  return out;
}

/** Base-ten pieces from place counts (thousands collects every place from the thousands up). */
function piecesFrom(counts: readonly number[]): Record<Kind, number> {
  const at = (k: number) => counts[k] ?? 0;
  let thousands = 0;
  for (let k = counts.length - 1; k >= 3; k -= 1) thousands = thousands * 10 + at(k);
  return { thousands, hundreds: at(2), tens: at(1), ones: at(0) };
}

/**
 * The mode an item uses: `auto` (the default) is the format's natural task: build on base-ten-build,
 * tenframe-fill and rekenrek, the expanded form to the number on expanded-form, find the number
 * from its tens and ones (write) on the hundred chart, and read a picture on the others.
 */
export function pvMode(p: ParamValues, format: string): Exclude<PvMode, 'auto'> {
  const mode = asStr(p.mode, 'auto') as PvMode;
  if (mode !== 'auto') return mode;
  switch (format) {
    case 'base-ten-build':
    case 'tenframe-fill':
    case 'rekenrek':
      return 'build';
    case 'expanded-form':
      return 'expanded';
    case 'hundred-chart':
      return 'write';
    default:
      return 'read';
  }
}

/** The template's representation, or its format's default (03 §5.5). */
const repOf = (t: { format: ItemFormat; representation?: Representation }): Representation =>
  t.representation ?? FORMAT_DEFAULT_REPRESENTATION[t.format];

/** The place a digit-value or expanded item asks about (−1: the leading place for digit-value). */
function askedPlace(p: ParamValues): number {
  const place = asNum(p.place, -1);
  if (place >= 0) return place;
  return asStr(p.mode) === 'digit-value' ? digitsOf(asNum(p.n)).length - 1 : -1;
}

// ---------- the generator ----------

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

/**
 * The trade a `nonCanonical` base-ten-build `build` forces (03 §5.6). The tray holds one piece too
 * few at the lowest non-zero place of n (34: 3 ones) and none below it, so no set of tray pieces
 * is worth n: a tray mat's pieces at that place fall short of n's digit there, and every other
 * piece is a whole number of the next place. The child splits one piece of the next place up
 * (fusing and splitting never use the tray, and keep the value) and puts back what is not needed.
 * Null when the lowest non-zero place is above the tens, or nothing above it can be split (40).
 */
export function forcedTrade(n: number): {
  place: 'ones' | 'tens';
  up: 'tens' | 'hundreds';
  digit: number;
  limits: Partial<Record<'hundreds' | 'tens' | 'ones', number>>;
} | null {
  const d = digitsOf(n);
  const z = d.findIndex((x) => x > 0);
  if (z < 0 || z > 1 || !d.some((x, i) => i > z && x > 0)) return null;
  const digit = d[z] as number;
  return z === 0
    ? { place: 'ones', up: 'tens', digit, limits: { ones: digit - 1 } }
    : { place: 'tens', up: 'hundreds', digit, limits: { tens: digit - 1, ones: 0 } };
}

/**
 * The options of a numeral-pick `words` item (PR #83 review): n's name class, two reversal pairs
 * of the digits 1 … digitMax. The unordered digit pairs {p < q} are listed in order (12, 13, …,
 * 45) and paired off two at a time, so every class has exactly four options (numeral-pick allows
 * at most five). Every member of a class has the same options, the set never depends on which
 * member is the key, every option is a possible key, and each option's reversal (the
 * MC.place-swap and MC.teen-reversal answer) is an option too. Ascending; null when n's digits are
 * not two distinct digits in 1 … digitMax, or n's pair is the unpaired last one when the count of
 * pairs is odd (PR #83 review round 2: it used to join the class before it, making six options).
 */
export function nameClass(n: number, digitMax: number): number[] | null {
  if (!Number.isInteger(n) || n < 10 || n > 99) return null;
  const lo = Math.min(Math.floor(n / 10), n % 10);
  const hi = Math.max(Math.floor(n / 10), n % 10);
  const max = Math.min(9, Math.trunc(digitMax));
  if (lo < 1 || lo === hi || hi > max) return null;
  const pairs: [number, number][] = [];
  for (let p = 1; p <= max; p += 1) for (let q = p + 1; q <= max; q += 1) pairs.push([p, q]);
  const classes = Math.floor(pairs.length / 2);
  const classOf = (i: number) => Math.floor(i / 2);
  const mine = classOf(pairs.findIndex(([p, q]) => p === lo && q === hi));
  if (mine >= classes) return null;
  return pairs
    .filter((_, i) => classOf(i) === mine)
    .flatMap(([p, q]) => [10 * p + q, 10 * q + p])
    .sort((x, y) => x - y);
}

const isNamePick = (p: ParamValues, format: string): boolean =>
  format === 'numeral-pick' && pvMode(p, format) === 'words';

/** The math features of an item: a function of its params and the template's format only. */
export function pvFeatures(p: ParamValues, format: string): Record<string, number> {
  const n = asNum(p.n);
  const mode = pvMode(p, format);
  const nonCanonical = p.nonCanonical === true;
  const o = n % 10;
  const f: Record<string, number> = {
    digits: digitsOf(n).length - 1,
    'zero.internal': zeroInternal(n) ? 1 : 0,
    'zero.trailing': zeroTrailing(n) ? 1 : 0,
    teen: n >= 11 && n <= 19 ? 1 : 0,
    nonCanonical: nonCanonical ? 1 : 0,
    // expanded-form has its own words feature (mode.words), so words counts once.
    words: mode === 'words' && format !== 'expanded-form' ? 1 : 0,
    'ones.over5': n < 100 ? Math.max(0, o - 5) / 4 : 0,
    'tens.over5': n < 100 ? Math.max(0, (Math.floor(n / 10) % 10) - 5) / 4 : 0,
    unusualOrder: p.unusualOrder === true && mode === 'expanded' ? 1 : 0,
    decimal: asStr(p.wholeIs, 'unit') === 'flat' ? 1 : 0,
  };
  // The 03 §5.5 base-ten-build and expanded-form features (the format models' names and weights),
  // computed from the params so the learner's replay rebuilds them without the widget.
  if (format === 'base-ten-build') {
    f.exact = mode === 'exact' ? 1 : 0;
    f['mode.read'] = mode === 'read' ? 1 : 0;
    f['limits.tight'] = mode === 'build' && nonCanonical ? 1 : 0;
  }
  if (format === 'expanded-form') f['mode.words'] = mode === 'words' ? 1 : 0;
  // A name pick's size features belong to its option set, not to the key (rule 4: the same for
  // every member of the class). A class is closed under reversal, so its largest ones digit is
  // its largest tens digit.
  const names = isNamePick(p, format) ? nameClass(n, asNum(p.digitMax, 9)) : null;
  if (names) {
    const top = Math.max(...names.map((x) => x % 10));
    f.teen = names.some((x) => x <= 19) ? 1 : 0;
    f['ones.over5'] = Math.max(0, top - 5) / 4;
    f['tens.over5'] = Math.max(0, top - 5) / 4;
  }
  return f;
}

/** The picture of n for a representation (none for symbols, words and expanded cards). */
function pictureOf(
  rep: string | undefined,
  n: number,
  counts: readonly number[],
  wholeIs: 'unit' | 'flat',
): StimulusSpec {
  if (rep && BASE_TEN_REPS.has(rep)) {
    const pieces = piecesFrom(counts);
    return {
      kind: 'base-ten',
      ...(pieces.thousands > 0 ? { thousands: pieces.thousands } : {}),
      hundreds: pieces.hundreds,
      tens: pieces.tens,
      ones: pieces.ones,
      ...(wholeIs === 'flat' ? { wholeIs } : {}),
    };
  }
  const top = Math.min(10, n);
  const rest = Math.max(0, n - 10);
  switch (rep) {
    case 'ten-frame':
    case 'double-ten-frame':
      return n > 10 || rep === 'double-ten-frame'
        ? { kind: 'ten-frame', frames: 2, filled: [top, rest] }
        : { kind: 'ten-frame', frames: 1, filled: [n] };
    case 'rekenrek':
      return { kind: 'rekenrek', rows: [top, rest] };
    case 'dots':
      return n > 10
        ? { kind: 'dots', arrangement: 'double-ten-frame', groups: [top, rest] }
        : { kind: 'dots', arrangement: 'ten-frame', groups: [n] };
    default:
      return { kind: 'none' };
  }
}

/** Expression tokens of the expanded form, joined by +, with the term at `blankPlace` blank. */
function termTokens(
  terms: { place: number; value: number }[],
  unusualOrder: boolean,
  blankPlace: number | null,
): ExpressionToken[] {
  const ordered = unusualOrder ? [...terms].reverse() : terms;
  const out: ExpressionToken[] = [];
  ordered.forEach((term, i) => {
    if (i > 0) out.push({ t: 'op', v: '+' });
    out.push(term.place === blankPlace ? { t: 'blank', id: 'x' } : { t: 'num', v: term.value });
  });
  return out;
}

/** Place-value cards for expanded-form build: the terms plus near misses (14: 10, 4, 1, 40). */
function expandedCards(terms: { place: number; value: number }[], digits: number): number[] {
  const values = terms.map((x) => x.value);
  const extra: number[] = [];
  const add = (v: number) => {
    if (Number.isInteger(v) && v > 0 && !values.includes(v) && !extra.includes(v)) extra.push(v);
  };
  // The digits in the wrong places first (14 read as 41 picks 40 and 1), then one place further.
  for (const x of terms) add(x.value / 10);
  for (const x of [...terms].reverse()) add(x.value * 10);
  const count = digits <= 2 ? 2 : 3;
  return [...values, ...extra.slice(0, count)];
}

/** Numeral-pick options for a digit's value: the value, the bare digit, the digit one place off. */
function valueOptions(d: number, place: number, rngShuffle: (xs: number[]) => number[]): number[] {
  const v = d * 10 ** place;
  const picked: number[] = [v];
  const add = (x: number) => {
    if (picked.length < 3 && Number.isInteger(x) && x > 0 && !picked.includes(x)) picked.push(x);
  };
  add(d);
  add(d * 10 ** (place + 1));
  add(d * 10 ** Math.max(0, place - 1));
  for (let k = 1; picked.length < 3; k += 1) add(v + k * 10 ** place);
  return rngShuffle(picked);
}

const chartFor = (n: number): { first: number; rows: number } =>
  n <= 100
    ? { first: 1, rows: 10 }
    : n <= 120
      ? { first: 1, rows: 12 }
      : { first: Math.floor((n - 1) / 100) * 100 + 1, rows: 10 };

export const pvNumber: GeneratorDef = {
  id: 'pv.number',
  formats: [
    'base-ten-build',
    'expanded-form',
    'numeral-pick',
    'number-pad',
    'dot-flash',
    'hundred-chart',
    'tenframe-fill',
    'rekenrek',
  ],
  params: {
    n: {
      type: 'int',
      default: { kind: 'int', min: 11, max: 19 },
      doc: 'the number (in hundredths when wholeIs is flat); with digits, the range it is drawn within (give a range that holds them)',
    },
    digits: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: '0: use n as drawn; otherwise n has exactly this many digits',
    },
    zeros: {
      type: 'string',
      values: [...PV_ZEROS],
      default: { kind: 'const', value: 'any' },
      doc: 'zero digits: any, none, internal (305), trailing (450), some (either)',
    },
    mode: {
      type: 'string',
      values: [...PV_MODES],
      default: { kind: 'const', value: 'auto' },
      doc: "auto (the format's natural task), build, read, write, words, expanded, digit-value or exact (see the file header)",
    },
    nonCanonical: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'one unit of the lowest place above the ones shown as ten of the place below (34 as 2 tens 14 ones)',
    },
    wholeIs: {
      type: 'string',
      values: ['unit', 'flat'],
      default: { kind: 'const', value: 'unit' },
      doc: 'flat: decimals on base-ten pieces (flat = 1, values in hundredths)',
    },
    place: {
      type: 'int',
      default: { kind: 'const', value: -1 },
      doc: 'expanded: the blank term (−1: the number itself); digit-value: the digit asked (−1: the leading digit); 0 is the ones',
    },
    unusualOrder: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'expanded terms smallest place first (4 + 10)',
    },
    flashMs: {
      type: 'int',
      default: { kind: 'const', value: 1000 },
      doc: 'dot-flash: flash time in ms',
    },
    digitMax: {
      type: 'int',
      default: { kind: 'const', value: 9 },
      doc: "numeral-pick words: n's two digits are distinct and in 1 … digitMax, and the options are n's name class (two reversal pairs of those digits, nameClass)",
    },
  },
  derived: ['h', 't', 'o'],
  features: {
    digits: { weight: 0.5, doc: 'digits − 1' },
    'zero.internal': { weight: 0.6, doc: 'a 0 digit with a non-zero digit to its right (305)' },
    'zero.trailing': { weight: 0.2, doc: 'ends in 0 (450)' },
    teen: { weight: 0.3, doc: '11–19: the name says the ones first' },
    nonCanonical: { weight: 0.7, doc: 'regrouped: 34 as 2 tens 14 ones' },
    words: { weight: 0.4, doc: 'number names (mode words; expanded-form uses mode.words)' },
    'ones.over5': {
      weight: 0.4,
      doc: 'n < 100: max(0, ones − 5) / 4 (ones past five are counted, not seen at a glance)',
    },
    'tens.over5': {
      weight: 0.4,
      doc: 'n < 100: max(0, tens − 5) / 4 (tens past five are counted, not seen at a glance)',
    },
    unusualOrder: { weight: 0.5, doc: 'expanded terms smallest place first' },
    decimal: { weight: 0.5, doc: 'wholeIs flat: decimals on base-ten pieces' },
    // 03 §5.5 base-ten-build and expanded-form features (the same names and weights as the models).
    exact: { weight: 0.7, doc: 'base-ten-build: exactly the asked pieces (build-exact)' },
    'mode.read': { weight: -0.2, doc: 'base-ten-build: read a built number' },
    'limits.tight': { weight: 0.5, doc: 'base-ten-build: the pieces on offer force a trade' },
    'mode.words': { weight: 0.4, doc: 'expanded-form: words mode' },
  },
  narration: [
    'gen.pv.number.ones',
    'gen.pv.number.tens',
    'gen.pv.number.hundreds',
    'gen.pv.number.thousands',
    'gen.pv.number.split-tens',
    'gen.pv.number.split-hundreds',
    'gen.pv.number.back-ones',
    'gen.pv.number.back-tens',
    'gen.pv.number.ten-first',
    'gen.pv.number.look',
    'gen.pv.number.join',
    'gen.pv.number.listen',
    'gen.pv.number.is',
    'gen.pv.number.worth',
    'gen.pv.number.place-ones',
    'gen.pv.number.place-tens',
    'gen.pv.number.place-hundreds',
    'gen.pv.number.place-thousands',
    'gen.pv.number.place-ten-thousands',
    'gen.pv.number.place-hundred-thousands',
  ],
  sample(spec, rng) {
    const p = sampleAll(spec, rng);
    const digits = asNum(p.digits);
    const zeros = asStr(p.zeros, 'any');
    const nSpec = spec.n;
    if (!nSpec) return p;
    // Draw n within its domain until the digit count and zeros pattern hold (accepts re-checks, so
    // a draw that still misses is redrawn by the generic rejection loop).
    const fits = (n: number) =>
      (digits <= 0 || digitsOf(n).length === digits) && zerosMatch(n, zeros);
    if (fits(asNum(p.n))) return p;
    let draw = nSpec;
    if (digits > 0 && nSpec.kind === 'int') {
      // Narrow n's range to the d-digit numbers, keeping its step grid (still inside its domain).
      const step = nSpec.step ?? 1;
      const lo = Math.max(nSpec.min, 10 ** (digits - 1));
      const min = nSpec.min + Math.ceil((lo - nSpec.min) / step) * step;
      const max = Math.min(nSpec.max, 10 ** digits - 1);
      if (min > max) return p;
      draw = { ...nSpec, min, max };
    }
    for (let i = 0; i < 64; i += 1) {
      const n = sampleSpec(draw, rng);
      if (fits(asNum(n))) return { ...p, n };
    }
    return p;
  },
  derive(p): ParamValues {
    const d = digitsOf(asNum(p.n));
    return { h: d[2] ?? 0, t: d[1] ?? 0, o: d[0] ?? 0 };
  },
  accepts(p, t) {
    const n = asNum(p.n);
    const mode = pvMode(p, t.format);
    const nonCanonical = p.nonCanonical === true;
    const flat = asStr(p.wholeIs, 'unit') === 'flat';
    const digits = asNum(p.digits);
    const place = asNum(p.place, -1);
    const nd = digitsOf(n).length;
    if (!Number.isInteger(n) || n < 1) return false;
    if (digits > 0 && nd !== digits) return false;
    if (!zerosMatch(n, asStr(p.zeros, 'any'))) return false;
    if (nonCanonical && n < 10) return false;
    if (p.unusualOrder === true && mode !== 'expanded') return false;
    const counts = placeCounts(n, nonCanonical);
    // place: the asked term or digit, which must exist and not be 0.
    if (mode === 'expanded' || mode === 'digit-value') {
      if (place < -1 || place >= nd) return false;
      const k = askedPlace(p);
      if (k >= 0 && (mode === 'digit-value' ? digitsOf(n)[k] : counts[k]) === 0) return false;
      if (mode === 'digit-value' && nonCanonical) return false;
    } else if (place !== -1) return false;
    const rep = repOf(t);
    const basePicture =
      t.format === 'base-ten-build' ||
      (mode === 'read' && rep !== undefined && BASE_TEN_REPS.has(rep));
    if (flat && !basePicture) return false;
    if (basePicture && (n > 9999 || piecesFrom(counts).thousands > 9)) return false;
    if (t.format === 'base-ten-build' && mode === 'exact' && (counts[3] ?? 0) > 0) return false;
    // A forced trade splits a ten or a hundred (forcedTrade).
    if (t.format === 'base-ten-build' && mode === 'build' && nonCanonical && !forcedTrade(n)) {
      return false;
    }
    const twenty =
      t.format === 'tenframe-fill' ||
      t.format === 'rekenrek' ||
      ((mode === 'read' || mode === 'expanded' || mode === 'write') &&
        rep !== undefined &&
        TWENTY_REPS.has(rep) &&
        t.format !== 'hundred-chart');
    if (twenty && n > 20) return false;
    if (isNamePick(p, t.format) && !nameClass(n, asNum(p.digitMax, 9))) return false;
    if (t.format === 'hundred-chart' && n > 999) return false;
    return true;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const n = asNum(params.n);
    const mode = pvMode(params, t.format);
    const nonCanonical = params.nonCanonical === true;
    const wholeIs = asStr(params.wholeIs, 'unit') === 'flat' ? 'flat' : 'unit';
    const unusualOrder = params.unusualOrder === true;
    const digits = digitsOf(n);
    const counts = placeCounts(n, nonCanonical);
    const pieces = piecesFrom(counts);
    const terms = expandedTerms(counts);
    const place = askedPlace(params);
    const d = place >= 0 ? (digits[place] ?? 0) : 0;
    const placeValue = place >= 0 ? (counts[place] ?? 0) * 10 ** place : 0;
    const math = pvFeatures(params, t.format);
    const vars = pickVars(t, {
      n,
      h: digits[2] ?? 0,
      t: digits[1] ?? 0,
      o: digits[0] ?? 0,
      thousands: pieces.thousands,
      hundreds: pieces.hundreds,
      tens: pieces.tens,
      ones: pieces.ones,
      d,
    });
    const picture = pictureOf(repOf(t), n, counts, wholeIs);
    const overlay: StimulusSpec | undefined =
      n <= 20
        ? tenFrameOverlay(n)
        : n <= 9999
          ? pictureOf('base-ten', n, digitsOf(n), wholeIs)
          : undefined;
    const unsupported = (): never => {
      throw new RangeError(`pv.number: ${t.format} has no ${mode} mode`);
    };
    // The expanded form with its blank: the number (place −1) or one term.
    const blankPlace = mode === 'expanded' && place >= 0 ? place : null;
    const expression: ExpressionToken[] =
      blankPlace === null
        ? [...termTokens(terms, unusualOrder, null), { t: 'rel', v: '=' }, { t: 'blank', id: 'x' }]
        : [
            { t: 'num', v: n },
            { t: 'rel', v: '=' },
            ...termTokens(terms, unusualOrder, blankPlace),
          ];
    const asked = mode === 'digit-value' || blankPlace !== null ? placeValue : n;
    const maxDigits = Math.max(1, digitsOf(asked).length);
    const withOverlay = (p: PartialOutput): PartialOutput => (overlay ? { ...p, overlay } : p);
    let p: PartialOutput;
    switch (t.format) {
      case 'base-ten-build': {
        const offer = {
          thousands: n >= 1000,
          hundreds: n >= 100,
          tens: true,
          ones: true,
        };
        if (mode === 'build') {
          // nonCanonical: the tray limits leave no tray-only mat worth n, so the child must split
          // a piece (forcedTrade: 34 with 3 ones on offer). The limits are the widget's: the
          // checker takes any mat worth n.
          const limits = nonCanonical ? forcedTrade(n)?.limits : undefined;
          p = {
            params,
            vars,
            math,
            widget: {
              format: 'base-ten-build',
              target: n,
              mode: 'build',
              pieces: offer,
              ...(limits ? { limits } : {}),
              wholeIs,
            },
            answer: { kind: 'state', checker: 'baseten.value', target: { value: n } },
          };
        } else if (mode === 'exact') {
          const exact = {
            ...(n >= 100 || pieces.hundreds > 0 ? { hundreds: pieces.hundreds } : {}),
            tens: pieces.tens,
            ones: pieces.ones,
          };
          p = {
            params,
            vars,
            math,
            widget: {
              format: 'base-ten-build',
              target: n,
              mode: 'build-exact',
              pieces: offer,
              exact,
              wholeIs,
            },
            answer: { kind: 'state', checker: 'baseten.exact', target: { value: n, exact } },
          };
        } else if (mode === 'read') {
          p = withOverlay({
            params,
            vars,
            math,
            widget: {
              format: 'base-ten-build',
              target: n,
              mode: 'read',
              pieces: offer,
              wholeIs,
              prebuilt: {
                ...(pieces.thousands > 0 ? { thousands: pieces.thousands } : {}),
                hundreds: pieces.hundreds,
                tens: pieces.tens,
                ones: pieces.ones,
              },
            },
            answer: { kind: 'number', value: n },
          });
        } else return unsupported();
        break;
      }
      case 'expanded-form': {
        const base = { format: 'expanded-form' as const, target: n, unusualOrder };
        let widget: WidgetConfig;
        let answer: PartialOutput['answer'];
        if (mode === 'build') {
          const cards = rng.fork('layout').shuffle(expandedCards(terms, digits.length));
          widget = { ...base, mode: 'build', cards };
          answer = { kind: 'numbers', values: terms.map((x) => x.value), ordered: false };
        } else if (mode === 'expanded') {
          widget = {
            ...base,
            mode: blankPlace === null ? 'to-standard' : 'fill',
            expression: { tokens: expression },
          };
          answer = { kind: 'number', value: asked };
        } else if (mode === 'words') {
          // The widget speaks the number name; the child types the numeral.
          widget = { ...base, mode: 'words' };
          answer = { kind: 'number', value: n };
        } else if (mode === 'digit-value') {
          // digitIndex counts from the left; `place` counts from the ones.
          widget = { ...base, mode: 'digit-value', digitIndex: digits.length - 1 - place };
          answer = { kind: 'number', value: asked };
        } else return unsupported();
        p = withOverlay({ params, vars, math, widget, answer });
        break;
      }
      case 'numeral-pick': {
        let stimulus: StimulusSpec = picture;
        let value = n;
        let opts: { options: { id: string; label?: string; speak?: string }[]; diagnostic: number };
        if (mode === 'read' || mode === 'write') {
          opts = numberOptions(t, params, n, rng);
        } else if (mode === 'expanded') {
          stimulus = {
            kind: 'expression',
            expr: {
              tokens: blankPlace === null ? termTokens(terms, unusualOrder, null) : expression,
            },
          };
          value = asked;
          opts = numberOptions(t, params, value, rng, 1);
        } else if (mode === 'words') {
          // See the numeral (in the prompt), pick its name: each option is a num.* name clip. The
          // options are n's name class, built without the key; only the layout is shuffled.
          const names = rng
            .fork('layout')
            .shuffle(nameClass(n, asNum(params.digitMax, 9)) ?? unsupported());
          opts = {
            diagnostic: 0,
            options: names.map((v) => ({ id: numberOptionId(v), speak: `num.${v}` })),
          };
          stimulus = { kind: 'none' };
        } else if (mode === 'digit-value') {
          value = asked;
          const values = valueOptions(d, place, (xs) => rng.fork('layout').shuffle(xs));
          opts = {
            diagnostic: 0,
            options: values.map((v) => ({ id: numberOptionId(v), label: String(v) })),
          };
          stimulus = { kind: 'none' };
        } else return unsupported();
        p = withOverlay({
          params,
          vars,
          math: opts.diagnostic > 0 ? { ...math, 'distractors.diagnostic': opts.diagnostic } : math,
          widget: { format: 'numeral-pick', stimulus, options: opts.options, layout: 'row' },
          answer: { kind: 'choice', id: numberOptionId(value) },
        });
        break;
      }
      case 'number-pad': {
        if (mode !== 'read' && mode !== 'write' && mode !== 'expanded' && mode !== 'digit-value')
          return unsupported();
        p = withOverlay({
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: mode === 'digit-value' ? { kind: 'none' } : picture,
            ...(mode === 'expanded' ? { expression: { tokens: expression } } : {}),
            blanks: [{ id: 'x', maxDigits }],
            unit: null,
          },
          answer: { kind: 'number', value: asked },
        });
        break;
      }
      case 'dot-flash': {
        if (mode !== 'read' || picture.kind === 'none') return unsupported();
        p = withOverlay({
          params,
          vars,
          math,
          widget: {
            format: 'dot-flash',
            stimulus: picture,
            flashMs: asNum(params.flashMs, 1000),
            reflashes: 1,
            input: 'pad',
          },
          answer: { kind: 'number', value: n },
        });
        break;
      }
      case 'hundred-chart': {
        if (mode !== 'write' && !(mode === 'expanded' && blankPlace === null)) return unsupported();
        const chart = chartFor(n);
        p = withOverlay({
          params,
          vars,
          math,
          widget: { format: 'hundred-chart', ...chart, hidden: [], mode: 'find' },
          answer: { kind: 'number', value: n },
        });
        break;
      }
      case 'tenframe-fill': {
        if (mode !== 'build' && mode !== 'write') return unsupported();
        const write = mode === 'write';
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'tenframe-fill',
            frames: n > 10 ? 2 : 1,
            size: 10,
            prefilled: [],
            goal: 'show-n',
            n,
            requireStandardFill: true,
            thenAsk: write ? 'total' : null,
            skin: 'frame',
          },
          answer: {
            kind: 'state',
            checker: 'tenframe.total',
            target: { n, requireStandardFill: true, ...(write ? { value: n } : {}) },
          },
          highlight: [{ op: 'highlight', args: { target: 'frame-0' } }],
        };
        break;
      }
      case 'rekenrek': {
        const rows: [number, number] = [Math.min(10, n), Math.max(0, n - 10)];
        if (mode === 'read') {
          p = withOverlay({
            params,
            vars,
            math,
            widget: {
              format: 'rekenrek',
              rows: n > 10 ? 2 : 1,
              preset: rows,
              mode: 'read',
              rowRule: 'any',
              thenAsk: null,
            },
            answer: { kind: 'number', value: n },
          });
          break;
        }
        if (mode !== 'build' && mode !== 'write') return unsupported();
        const write = mode === 'write';
        const rowRule = n > 10 ? 'fill-top-first' : 'any';
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'rekenrek',
            rows: n > 10 ? 2 : 1,
            preset: [0, 0],
            mode: 'show',
            target: n,
            rowRule,
            thenAsk: write ? 'total' : null,
          },
          answer: {
            kind: 'state',
            checker: 'rekenrek.total',
            target: { n, rowRule, ...(write ? { value: n } : {}) },
          },
          highlight: [{ op: 'highlight', args: { row: 0, upTo: 10 } }],
        };
        break;
      }
      default:
        throw new Error(`pv.number cannot build ${t.format}`);
    }
    return finish(pvNumber, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    const w = out.widget;
    const n = asNum(out.params.n);
    const target = out.answer.target;
    const value = typeof target.value === 'number' && w.format !== 'base-ten-build' ? n : null;
    switch (w.format) {
      case 'base-ten-build': {
        // build: the canonical mat, which the solution's trade ends on.
        const counts =
          w.mode === 'build-exact'
            ? [w.exact?.ones ?? 0, w.exact?.tens ?? 0, w.exact?.hundreds ?? 0]
            : digitsOf(n);
        // The mat, every kind (U04's base-ten-build response).
        const pc = piecesFrom(counts);
        return {
          kind: 'state',
          value: { thousands: pc.thousands, hundreds: pc.hundreds, tens: pc.tens, ones: pc.ones },
        };
      }
      case 'tenframe-fill': {
        const cells = Array.from({ length: w.frames }, (_, f) =>
          Array.from({ length: 10 }, (_, i) => (f * 10 + i < n ? 1 : 0)),
        );
        return { kind: 'state', value: { cells, ...(value !== null ? { value } : {}) } };
      }
      case 'rekenrek':
        return {
          kind: 'state',
          value: {
            rows: [Math.min(10, n), Math.max(0, n - 10)],
            ...(value !== null ? { value } : {}),
          },
        };
      default:
        throw new Error(`pv.number: no example for ${w.format}`);
    }
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const p = out.params;
    const n = asNum(p.n);
    const mode = pvMode(p, w.format);
    const nonCanonical = p.nonCanonical === true;
    const counts = placeCounts(n, nonCanonical);
    const place = askedPlace(p);
    const answer =
      out.answer.kind === 'number'
        ? out.answer.value
        : out.answer.kind === 'choice'
          ? (optionNumber(out.answer.id) ?? n)
          : n;
    const final = (action: LessonStep['action']) =>
      mode === 'digit-value'
        ? say('gen.pv.number.worth', { d: digitsOf(n)[place] ?? 0, v: answer }, action)
        : say('gen.pv.number.is', { v: answer }, action);
    /** One step per non-zero kind of piece, largest first (the counts, not the number). */
    const pieceSteps = (op: 'add-piece' | 'count-by'): LessonStep[] => {
      const pc = piecesFrom(counts);
      return (['thousands', 'hundreds', 'tens', 'ones'] as const)
        .filter((k) => pc[k] > 0)
        .map((k) =>
          say(
            `gen.pv.number.${k}`,
            { count: pc[k] },
            op === 'add-piece'
              ? { op, args: { kind: k, count: pc[k] } }
              : { op, args: { kind: k } },
          ),
        );
    };
    /**
     * A forced trade (nonCanonical build): take the canonical pieces above the short place with
     * one more of the next place up, split that piece, and put back the pieces not needed. 34 with
     * 3 ones on offer: 4 tens, split a ten (3 tens 10 ones), put 6 ones back.
     */
    const tradeSteps = (trade: NonNullable<ReturnType<typeof forcedTrade>>): LessonStep[] => {
      const pc = piecesFrom(digitsOf(n));
      // The kinds above the short place (every kind but the ones is, unless it is the place).
      const above = (['thousands', 'hundreds', 'tens'] as const).filter(
        (k) => k === trade.up || (k !== trade.place && pc[k] > 0),
      );
      const back = 10 - trade.digit;
      return [
        ...above.map((k) => {
          const count = pc[k] + (k === trade.up ? 1 : 0);
          return say(
            `gen.pv.number.${k}`,
            { count },
            { op: 'add-piece', args: { kind: k, count } },
          );
        }),
        say(`gen.pv.number.split-${trade.up}`, {}, { op: 'split', args: { kind: trade.up } }),
        say(
          `gen.pv.number.back-${trade.place}`,
          { count: back },
          { op: 'add-piece', args: { kind: trade.place, count: -back } },
        ),
      ];
    };
    const tenThenOnes = (
      placeOp: (frame: number, count: number) => LessonStep['action'],
    ): LessonStep[] =>
      n > 10
        ? [
            say('gen.pv.number.ten-first', {}, placeOp(0, 10)),
            say('gen.pv.number.ones', { count: n - 10 }, placeOp(1, n - 10)),
          ]
        : [say('gen.pv.number.ones', { count: n }, placeOp(0, n))];
    switch (w.format) {
      case 'base-ten-build':
        if (w.mode === 'read') {
          return [...pieceSteps('count-by'), final({ op: 'answer', args: { value: n } })];
        }
        if (w.mode === 'build' && nonCanonical) {
          const trade = forcedTrade(n);
          if (trade)
            return [...tradeSteps(trade), final({ op: 'count-by', args: { kind: 'ones' } })];
        }
        return [...pieceSteps('add-piece'), final({ op: 'count-by', args: { kind: 'ones' } })];
      case 'expanded-form':
        switch (w.mode) {
          case 'build':
            return [
              ...expandedTerms(counts).map((x) =>
                say(
                  `gen.pv.number.${PLACES[x.place] ?? 'ones'}`,
                  { count: counts[x.place] ?? 0 },
                  { op: 'place-card', args: { value: x.value } },
                ),
              ),
              final({ op: 'stack-cards' }),
            ];
          case 'digit-value':
            return [
              say(
                `gen.pv.number.place-${PLACES[place] ?? 'ones'}`,
                {},
                {
                  op: 'highlight-digit',
                  args: { index: digitsOf(n).length - 1 - place },
                },
              ),
              final({ op: 'answer', args: { value: answer } }),
            ];
          case 'words':
            return [say('gen.pv.number.listen', {}), final({ op: 'answer', args: { value: n } })];
          default:
            return [
              say('gen.pv.number.join', {}, { op: 'stack-cards' }),
              final({ op: 'answer', args: { value: answer } }),
            ];
        }
      case 'numeral-pick':
        return [
          mode === 'digit-value'
            ? say(`gen.pv.number.place-${PLACES[place] ?? 'ones'}`, {})
            : mode === 'expanded'
              ? say('gen.pv.number.join', {})
              : say('gen.pv.number.look', {}),
          final({ op: 'tap', args: { id: numberOptionId(answer) } }),
        ];
      case 'number-pad':
        return [
          mode === 'digit-value'
            ? say(`gen.pv.number.place-${PLACES[place] ?? 'ones'}`, {})
            : mode === 'expanded'
              ? say('gen.pv.number.join', {}, { op: 'highlight', args: { token: 'x' } })
              : say('gen.pv.number.look', {}, { op: 'show-stimulus' }),
          final({ op: 'type', args: { blank: 'x', value: answer } }),
        ];
      case 'dot-flash':
        return [
          say('gen.pv.number.look', {}, { op: 'show' }),
          final({ op: 'answer', args: { value: n } }),
        ];
      case 'hundred-chart': {
        const tensRow = Math.floor((n - 1) / 10) * 10 + 1;
        return [
          say('gen.pv.number.look', {}, { op: 'highlight-row', args: { n: tensRow } }),
          final({ op: 'tap', args: { n } }),
        ];
      }
      case 'tenframe-fill':
        return [
          ...tenThenOnes((frame, count) => ({
            op: 'place',
            args: { frame, count, color: 'a' },
          })),
          final(
            w.thenAsk === 'total' ? { op: 'answer', args: { value: n } } : { op: 'count-total' },
          ),
        ];
      case 'rekenrek':
        if (w.mode === 'read') {
          return [
            say(
              n > 10 ? 'gen.pv.number.ten-first' : 'gen.pv.number.look',
              {},
              {
                op: 'highlight',
                args: { row: 0, upTo: Math.min(10, n) },
              },
            ),
            final({ op: 'answer', args: { value: n } }),
          ];
        }
        return [
          ...tenThenOnes((row, count) => ({ op: 'slide', args: { row, count } })),
          final(
            w.thenAsk === 'total' ? { op: 'answer', args: { value: n } } : { op: 'count-total' },
          ),
        ];
      default:
        return [];
    }
  },
};
