// addsub.facts (03 §5.6): single-digit and within-20 addition and subtraction facts.
// `unknown`: result (a op b = _), change (a op _ = result), start (_ op b = result).
// `family` restricts the fact to a strategy group (plus1, doubles, make-ten, …); it is enforced by
// drawing within the template's param domains, never by overriding them. Derived: `result`.
// Formats: number-pad, numeral-pick, tenframe-fill, rekenrek, number-line-jump, dot-flash,
// number-bond. Each family's worked solution follows its strategy: make-ten moves counters from
// frame 1 to fill frame 0, back-to-ten takes the ones first, plus9 adds a ten and takes one away,
// and the open number line bridges through ten with free jumps. K01 (#11) adds the rekenrek,
// dot-flash and number-bond builds and the family strategies; `balance` comes with ADD.05.

import type {
  ExpressionToken,
  ItemTemplate,
  LessonStep,
  ParamSpec,
  ParamValues,
  ResponseValue,
  StimulusSpec,
} from '@number-island/shared';
import { numberOptionId } from '../../formats/numeral-pick';
import { BEADS_PER_ROW } from '../../formats/rekenrek';
import type { Rng } from '../../rng';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  numberOptions,
  type PartialOutput,
  pickVars,
  sampleAll,
  specDomain,
  tenFrameOverlay,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

export const FAMILIES = [
  'any',
  'plus1',
  'plus2',
  'doubles',
  'near-doubles',
  'make-ten',
  'plus9',
  'ten-plus',
  'teen-minus-ten',
  'back-to-ten',
  'count-up',
  'think-add',
] as const;

/**
 * Whether (a, b, op) belongs to the family.
 * - plus1, plus2: adding 1 or 2 (either addend), or taking away 1 or 2 (ADD.15).
 * - make-ten: both addends 2–9 and the sum 11–18, so it passes ten (8 + 5 = 8 + 2 + 3, ADD.08).
 * - back-to-ten: a teen minus a one-digit number that reaches or passes ten (13 − 4, ADD.18).
 * - count-up: addition with an addend ≤ 4 to count on (ADD.03); subtraction where counting up
 *   from b to a is no longer than counting back b, a − b ≤ b (13 − 8, ADD.04 and ADD.19).
 */
export function inFamily(family: string, a: number, b: number, op: string): boolean {
  switch (family) {
    case 'plus1':
      return op === '+' ? a === 1 || b === 1 : b === 1;
    case 'plus2':
      return op === '+' ? a === 2 || b === 2 : b === 2;
    case 'doubles':
      return op === '+' && a === b;
    case 'near-doubles':
      return op === '+' && Math.abs(a - b) === 1;
    case 'make-ten':
      return op === '+' && a >= 2 && a <= 9 && b >= 2 && b <= 9 && a + b >= 11;
    case 'plus9':
      return op === '+' && (a === 9 || b === 9);
    case 'ten-plus':
      return op === '+' && (a === 10 || b === 10);
    case 'teen-minus-ten':
      return op === '-' && a >= 11 && a <= 19 && b === 10;
    case 'back-to-ten':
      return op === '-' && a >= 11 && a <= 19 && b >= 1 && b <= 9 && a - b <= 10;
    case 'count-up':
      return op === '+' ? Math.min(a, b) <= 4 : b >= 1 && a - b <= b;
    case 'think-add':
      return op === '-';
    default:
      return true;
  }
}

/** The strategy a fact's solution follows (from its family; `count` counts on or back). */
export type FactStrategy =
  | 'count'
  | 'double'
  | 'near-double'
  | 'make-ten'
  | 'nine'
  | 'ten-plus'
  | 'take-ten'
  | 'back-to-ten'
  | 'count-up'
  | 'think-add';

export function factStrategy(family: string, op: string): FactStrategy {
  switch (family) {
    case 'doubles':
      return 'double';
    case 'near-doubles':
      return 'near-double';
    case 'make-ten':
      return 'make-ten';
    case 'plus9':
      return 'nine';
    case 'ten-plus':
      return 'ten-plus';
    case 'teen-minus-ten':
      return 'take-ten';
    case 'back-to-ten':
      return 'back-to-ten';
    case 'count-up':
      return op === '-' ? 'count-up' : 'count';
    case 'think-add':
      return 'think-add';
    default:
      return 'count';
  }
}

/** The opening line of a worked solution: count on for addition, count back for subtraction. */
const startKey = (op: string): string =>
  op === '-' ? 'gen.addsub.facts.start-back' : 'gen.addsub.facts.start-at';

export function factResult(a: number, b: number, op: string): number {
  return op === '-' ? a - b : a + b;
}

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

function sampleFact(spec: Record<string, ParamSpec>, rng: Rng): ParamValues {
  const p = sampleAll(spec, rng);
  const family = asStr(p.family, 'any');
  const op = asStr(p.op, '+');
  const bSpec = spec.b;
  // Each domain entry keeps its own authored weight: a choice may repeat a value, and every entry
  // carries its own weight (03 §5.2). Other specs are uniform.
  const bEntries: { value: number; weight: number }[] = !bSpec
    ? []
    : bSpec.kind === 'choice'
      ? bSpec.values.flatMap((v, i) =>
          typeof v === 'number' ? [{ value: v, weight: bSpec.weights?.[i] ?? 1 }] : [],
        )
      : specDomain(bSpec)
          .filter((v): v is number => typeof v === 'number')
          .map((value) => ({ value, weight: 1 }));
  // Draw a until some b in b's domain completes a valid fact of the family. Keep the b already
  // drawn (with its authored weights) when it fits; otherwise redraw b among the entries that fit,
  // still weighted as authored.
  for (let i = 0; i < 64; i += 1) {
    const a = asNum(p.a);
    const fits = (b: number) => inFamily(family, a, b, op) && factResult(a, b, op) >= 0;
    if (typeof p.b === 'number' && fits(p.b)) return p;
    const ok = bEntries.filter((e) => fits(e.value));
    if (ok.length > 0) {
      p.b = rng.weighted(
        ok.map((e) => e.value),
        ok.map((e) => e.weight),
      );
      return p;
    }
    const aSpec = spec.a;
    if (!aSpec) break;
    p.a = sampleAll({ a: aSpec }, rng).a as number;
  }
  return p; // constraints and validity checks reject it; generateItem draws again
}

function expression(a: number, b: number, op: string, unknown: string): ExpressionToken[] {
  const r = factResult(a, b, op);
  const num = (v: number): ExpressionToken => ({ t: 'num', v });
  const blank: ExpressionToken = { t: 'blank', id: 'x' };
  const o: ExpressionToken = { t: 'op', v: op === '-' ? '-' : '+' };
  const eq: ExpressionToken = { t: 'rel', v: '=' };
  if (unknown === 'change') return [num(a), o, blank, eq, num(r)];
  if (unknown === 'start') return [blank, o, num(b), eq, num(r)];
  return [num(a), o, num(b), eq, blank];
}

/** The numbers a fact's strategy talks about (solution lines and prompt or hint slots). */
export interface FactParts {
  a: number;
  b: number;
  op: string;
  result: number;
  strategy: FactStrategy;
  /** make-ten: a is made ten (it sits in frame 0); b splits into give (moved over) and keep. */
  give: number;
  keep: number;
  /** near doubles: the smaller addend and its double. */
  small: number;
  double: number;
  /** plus9: the addend that is not 9. */
  other: number;
  /** teens: the ones of a; back-to-ten: what is taken after reaching ten. */
  ones: number;
  rest: number;
}

export function factParts(p: ParamValues): FactParts {
  const a = asNum(p.a);
  const b = asNum(p.b);
  const op = asStr(p.op, '+');
  const give = Math.max(0, 10 - a);
  const small = Math.min(a, b);
  const ones = Math.max(0, a - 10);
  return {
    a,
    b,
    op,
    result: factResult(a, b, op),
    strategy: factStrategy(asStr(p.family, 'any'), op),
    give,
    keep: b - give,
    small,
    double: 2 * small,
    other: a === 9 ? b : a,
    ones,
    rest: Math.max(0, b - ones),
  };
}

/** Slot values a template's lines may use, by strategy (pickVars keeps only the used ones). */
function varPool(f: FactParts): Record<string, number> {
  const pool: Record<string, number> = { a: f.a, b: f.b, result: f.result };
  if (f.strategy === 'make-ten') pool.give = f.give;
  if (f.strategy === 'nine') pool.other = f.other;
  if (f.strategy === 'near-double') Object.assign(pool, { small: f.small, double: f.double });
  if (f.strategy === 'back-to-ten' || f.strategy === 'take-ten') pool.ones = f.ones;
  return pool;
}

const SPLIT_PICTURE = new Set<FactStrategy>([
  'double',
  'near-double',
  'make-ten',
  'nine',
  'ten-plus',
]);

/** Two frames, one addend in each (a in colour a, b in colour b). */
function splitFrames(a: number, b: number): StimulusSpec {
  return {
    kind: 'ten-frame',
    frames: 2,
    filled: [a, b],
    colors: [new Array<'a'>(a).fill('a'), new Array<'b'>(b).fill('b')],
  };
}

/**
 * The picture of a fact (pictorial number-pad stimulus, level-3 hint overlay), by the template's
 * representation: dots in two groups, a number bond (make-ten: b split into give and keep), a bar
 * model, base-ten pieces, or ten-frames. Strategy facts show one addend per frame; the others keep
 * the E01 frames (the total in colours a and b, or the minuend).
 */
function factPicture(t: ItemTemplate, f: FactParts, unknown = 'result'): StimulusSpec {
  const plus = f.op === '+';
  if (
    unknown !== 'result' &&
    (t.representation === 'number-bond' || t.representation === 'bar-model')
  ) {
    // K01 (ADD.11, ADD.12): a change or start unknown leaves its own slot empty, so the picture
    // never shows the asked number. a + b = r: whole r, parts a and b; a − b = r: whole a, parts b
    // and r.
    const q = (show: boolean, v: number): number | '?' => (show ? v : '?');
    const whole = plus ? f.result : q(unknown !== 'start', f.a);
    const parts = plus
      ? [q(unknown !== 'start', f.a), q(unknown !== 'change', f.b)]
      : [q(unknown !== 'change', f.b), f.result];
    return t.representation === 'bar-model'
      ? { kind: 'bar-model', parts, whole }
      : { kind: 'number-bond', whole, parts };
  }
  switch (t.representation) {
    case 'number-line': {
      // K01 (ADD.12): a 0–20 line with the numbers the fact shows marked (never the asked one).
      const shown =
        unknown === 'change' ? [f.a, f.result] : unknown === 'start' ? [f.result] : [f.a];
      return {
        kind: 'number-line',
        min: 0,
        max: 20,
        ticksEvery: 1,
        labelsEvery: 5,
        marks: shown.map((at) => ({ at, label: String(at) })),
      };
    }
    case 'dots':
      return { kind: 'dots', arrangement: 'groups', groups: plus ? [f.a, f.b] : [f.a] };
    case 'number-bond':
      if (plus && f.strategy === 'make-ten') {
        return { kind: 'number-bond', whole: f.b, parts: [f.give, f.keep] };
      }
      return plus
        ? { kind: 'number-bond', whole: '?', parts: [f.a, f.b] }
        : { kind: 'number-bond', whole: f.a, parts: [f.b, '?'] };
    case 'bar-model':
      return plus
        ? { kind: 'bar-model', parts: [f.a, f.b], whole: '?' }
        : { kind: 'bar-model', parts: [f.b, '?'], whole: f.a };
    case 'base-ten': {
      const tens = Math.floor(f.a / 10) + (plus ? Math.floor(f.b / 10) : 0);
      const ones = (f.a % 10) + (plus ? f.b % 10 : 0);
      return { kind: 'base-ten', hundreds: 0, tens, ones };
    }
    default:
      if (plus && SPLIT_PICTURE.has(f.strategy) && f.a <= 10 && f.b <= 10) {
        return splitFrames(f.a, f.b);
      }
      if (!plus && f.strategy === 'count-up') return tenFrameOverlay(f.a, [f.b, f.result]);
      return plus ? tenFrameOverlay(f.result, [f.a, f.b]) : tenFrameOverlay(f.a);
  }
}

/** Signed jump sizes 1–10 in one direction (free jumps, strategy freedom, 03 §5.5). */
const freeJumps = (dir: 1 | -1): number[] => Array.from({ length: 10 }, (_, i) => dir * (i + 1));

/** A jump item whose goal is the distance from b up to a (count up to subtract). */
const isDifference = (f: FactParts): boolean => f.op === '-' && f.strategy === 'count-up';

/** Counting up from b to a passes ten (8 → 10 → 13). */
const upThroughTen = (f: FactParts): boolean => f.b < 10 && f.a > 10;

/**
 * The beads already pushed over on a rekenrek fact. make-ten: a on the top row, b below; slide
 * beads up to fill the top row. plus9: the other addend below; add a full ten on top, then take
 * one away. Otherwise a sits on the top row and the child slides b more.
 */
function rekenrekPreset(f: FactParts): [number, number] {
  if (f.strategy === 'make-ten') return [f.a, f.b];
  if (f.strategy === 'nine') return [0, f.other];
  return [f.a, 0];
}

/** The preset fits two rows of ten, and so does the total. */
const rekenrekFits = (f: FactParts): boolean =>
  rekenrekPreset(f).every((n) => n <= BEADS_PER_ROW) && f.result <= 2 * BEADS_PER_ROW;

interface Line {
  key: string;
  vars: Record<string, number>;
}

/**
 * The lines of a strategy solution before the step that gives the answer. They name the steps,
 * never the answer (the level-4 hint plays the first ones).
 */
function strategyLines(f: FactParts, unknown: string): Line[] {
  const { a, b, op, result } = f;
  if (unknown === 'change') {
    return [
      {
        key: op === '-' ? 'gen.addsub.facts.back-to' : 'gen.addsub.facts.up-to',
        vars: { a, n: result },
      },
    ];
  }
  if (unknown === 'start') {
    // ? + b = r: start at r and count back b; ? − b = r: start at r and count on b.
    return [{ key: startKey(op === '-' ? '+' : '-'), vars: { a: result, b } }];
  }
  switch (f.strategy) {
    case 'double':
      return [{ key: 'gen.addsub.facts.double', vars: { a } }];
    case 'near-double':
      return [{ key: 'gen.addsub.facts.near-double', vars: { small: f.small, double: f.double } }];
    case 'make-ten': {
      // Without frames, make ten from the bigger addend (3 + 9: 9 needs 1).
      const big = Math.max(a, b);
      const give = 10 - big;
      return [
        { key: 'gen.addsub.facts.make-ten.need', vars: { a: big, give } },
        {
          key: 'gen.addsub.facts.make-ten.split',
          vars: { b: Math.min(a, b), give, keep: result - 10 },
        },
      ];
    }
    case 'nine':
      return [
        { key: 'gen.addsub.facts.nine.ten', vars: { other: f.other, ten: f.other + 10 } },
        { key: 'gen.addsub.facts.nine.take-one', vars: {} },
      ];
    case 'ten-plus':
      return [{ key: 'gen.addsub.facts.ten-plus', vars: { n: a === 10 ? b : a } }];
    case 'take-ten':
      return [{ key: 'gen.addsub.facts.take-ten', vars: { a } }];
    case 'back-to-ten':
      return f.rest > 0
        ? [
            { key: 'gen.addsub.facts.back-to-ten', vars: { ones: f.ones } },
            { key: 'gen.addsub.facts.back-rest', vars: { rest: f.rest } },
          ]
        : [{ key: 'gen.addsub.facts.back-to-ten', vars: { ones: f.ones } }];
    case 'count-up':
      return upThroughTen(f)
        ? [
            { key: 'gen.addsub.facts.up-to-ten', vars: { b } },
            { key: 'gen.addsub.facts.up-rest', vars: { a } },
          ]
        : [{ key: 'gen.addsub.facts.up-from', vars: { b, a } }];
    case 'think-add':
      return [{ key: 'gen.addsub.facts.think-add', vars: { b, a } }];
    default:
      return [{ key: startKey(op), vars: { a, b } }];
  }
}

export const addsubFacts: GeneratorDef = {
  id: 'addsub.facts',
  formats: [
    'number-pad',
    'numeral-pick',
    'tenframe-fill',
    'rekenrek',
    'number-line-jump',
    'dot-flash',
    'number-bond',
  ],
  params: {
    a: { type: 'int', default: { kind: 'int', min: 0, max: 10 }, doc: 'first number' },
    b: { type: 'int', default: { kind: 'int', min: 0, max: 10 }, doc: 'second number' },
    op: {
      type: 'string',
      values: ['+', '-'],
      default: { kind: 'const', value: '+' },
      doc: 'operation',
    },
    unknown: {
      type: 'string',
      values: ['result', 'change', 'start'],
      default: { kind: 'const', value: 'result' },
      doc: 'which number the child finds',
    },
    family: {
      type: 'string',
      values: [...FAMILIES],
      default: { kind: 'const', value: 'any' },
      doc: 'fact family (strategy group)',
    },
    maxSum: {
      type: 'int',
      default: { kind: 'const', value: 20 },
      doc: 'largest number in the fact (a, b and result)',
    },
    jumps: {
      type: 'string',
      values: ['ones', 'free'],
      default: { kind: 'const', value: 'ones' },
      doc: 'number-line-jump hop sizes: ones (±1) or free (1–10, any strategy); the open number line always has free jumps',
    },
    flashMs: {
      type: 'int',
      default: { kind: 'const', value: 1000 },
      doc: 'dot-flash: how long the picture shows (ms)',
    },
  },
  derived: ['result'],
  features: {
    size: { weight: 0.3, doc: 'per 5 above 5 of max(a, b, result)' },
    bridge10: { weight: 0.7, doc: 'the fact crosses ten (ones regroup)' },
    sub: { weight: 0.35, doc: 'subtraction' },
    'unknown.change': { weight: 0.6, doc: 'change unknown' },
    'unknown.start': { weight: 0.9, doc: 'start unknown' },
    zeroOrOne: { weight: -0.6, doc: 'adding or taking away 0 or 1' },
    double: { weight: -0.4, doc: 'a double (a + a)' },
    nearDouble: { weight: -0.1, doc: 'a near double' },
    nine: { weight: -0.1, doc: 'adding 9' },
    plusTen: { weight: -0.5, doc: 'adding 10' },
  },
  narration: [
    'gen.addsub.facts.start-at',
    'gen.addsub.facts.start-back',
    'gen.addsub.facts.take-away',
    'gen.addsub.facts.count-on',
    'gen.addsub.facts.answer',
    'gen.addsub.facts.join',
    'gen.addsub.facts.up-to',
    'gen.addsub.facts.back-to',
    'gen.addsub.facts.double',
    'gen.addsub.facts.near-double',
    'gen.addsub.facts.put-more',
    'gen.addsub.facts.make-ten.need',
    'gen.addsub.facts.make-ten.split',
    'gen.addsub.facts.make-ten.move',
    'gen.addsub.facts.make-ten.full',
    'gen.addsub.facts.ten-and',
    'gen.addsub.facts.nine.ten',
    'gen.addsub.facts.nine.take-one',
    'gen.addsub.facts.ten-plus',
    'gen.addsub.facts.full-ten',
    'gen.addsub.facts.take-ten',
    'gen.addsub.facts.back-to-ten',
    'gen.addsub.facts.back-rest',
    'gen.addsub.facts.up-to-ten',
    'gen.addsub.facts.up-rest',
    'gen.addsub.facts.up-from',
    'gen.addsub.facts.jump-to-ten',
    'gen.addsub.facts.jump-double',
    'gen.addsub.facts.jump-rest',
    'gen.addsub.facts.jump-back-ten',
    'gen.addsub.facts.jump-back-rest',
    'gen.addsub.facts.hops',
    'gen.addsub.facts.last-hop',
    'gen.addsub.facts.think-add',
    'gen.addsub.facts.see-groups',
  ],
  sample: sampleFact,
  derive: (p) => ({ result: factResult(asNum(p.a), asNum(p.b), asStr(p.op, '+')) }),
  accepts(p, t) {
    const a = asNum(p.a);
    const b = asNum(p.b);
    const op = asStr(p.op, '+');
    const r = factResult(a, b, op);
    const family = asStr(p.family, 'any');
    if (r < 0 || Math.max(a, b, r) > asNum(p.maxSum, 20)) return false;
    if (!inFamily(family, a, b, op)) return false;
    const unknown = asStr(p.unknown, 'result');
    switch (t.format) {
      case 'number-line-jump':
        // A jump item needs at least one hop; counting up from b to a needs a > b.
        if (unknown !== 'result') return false;
        return op === '-' && factStrategy(family, op) === 'count-up' ? a > b : b > 0;
      case 'tenframe-fill':
        return unknown === 'result';
      case 'rekenrek':
        // Two rows of ten: addition with the total asked, and a preset that fits the rows (plus9
        // puts the other addend on a row of its own, so 9 + 11 cannot be laid out).
        return op === '+' && unknown === 'result' && rekenrekFits(factParts(p));
      case 'dot-flash':
        return op === '+' && unknown === 'result';
      default:
        return true;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const f = factParts(params);
    const { a, b, op, result, strategy } = f;
    const unknown = asStr(params.unknown, 'result');
    const family = asStr(params.family, 'any');
    if (result < 0) throw new RangeError('addsub.facts: negative result');
    if (Math.max(a, b, result) > asNum(params.maxSum, 20)) {
      throw new RangeError('addsub.facts: a number exceeds maxSum');
    }
    if (!inFamily(family, a, b, op)) throw new RangeError(`addsub.facts: not a ${family} fact`);
    const answerValue = unknown === 'change' ? b : unknown === 'start' ? a : result;
    const plus = op === '+';
    const bridge = plus
      ? (a % 10) + (b % 10) >= 10 && a !== 10 && b !== 10 && result !== 10
      : a > 10 && result < 10 && a % 10 < b % 10;
    const math: Record<string, number> = {
      size: Math.max(0, Math.max(a, b, result) - 5) / 5,
      bridge10: bridge ? 1 : 0,
      sub: plus ? 0 : 1,
      'unknown.change': unknown === 'change' ? 1 : 0,
      'unknown.start': unknown === 'start' ? 1 : 0,
      zeroOrOne: (plus ? Math.min(a, b) : b) <= 1 ? 1 : 0,
      double: plus && a === b ? 1 : 0,
      nearDouble: plus && Math.abs(a - b) === 1 ? 1 : 0,
      nine: plus && (a === 9 || b === 9) ? 1 : 0,
      plusTen: plus && (a === 10 || b === 10) ? 1 : 0,
    };
    const vars = pickVars(t, varPool(f));
    const overlay = factPicture(t, f, unknown);
    let p: PartialOutput;
    switch (t.format) {
      case 'number-pad': {
        const abstract = t.tier === 'abstract';
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: abstract ? { kind: 'none' } : overlay,
            expression: { tokens: expression(a, b, op, unknown) },
            blanks: [{ id: 'x', maxDigits: 2 }],
            unit: null,
          },
          answer: { kind: 'number', value: answerValue },
          overlay,
        };
        break;
      }
      case 'numeral-pick': {
        const opts = numberOptions(t, params, answerValue, rng);
        p = {
          params,
          vars,
          math: opts.diagnostic > 0 ? { ...math, 'distractors.diagnostic': opts.diagnostic } : math,
          widget: {
            format: 'numeral-pick',
            stimulus: { kind: 'expression', expr: { tokens: expression(a, b, op, unknown) } },
            options: opts.options,
            layout: 'row',
          },
          answer: { kind: 'choice', id: numberOptionId(answerValue) },
          overlay,
        };
        break;
      }
      case 'tenframe-fill': {
        if (unknown !== 'result')
          throw new RangeError('addsub.facts: tenframe-fill needs result unknown');
        if (strategy === 'make-ten') {
          // Both addends shown (03 §4.3, §4.5): a in frame 0 (colour a), b in frame 1 (colour b).
          // Moving 10 − a counters over fills the ten; then the child gives the total.
          p = {
            params,
            vars,
            math,
            widget: {
              format: 'tenframe-fill',
              frames: 2,
              size: 10,
              prefilled: [
                { frame: 0, color: 'a', count: a },
                { frame: 1, color: 'b', count: b },
              ],
              goal: 'make-ten',
              a,
              b,
              requireStandardFill: false,
              thenAsk: 'total',
              skin: 'frame',
            },
            answer: {
              kind: 'state',
              checker: 'tenframe.makeTen',
              target: { total: result, value: result },
            },
            highlight: [{ op: 'highlight', args: { target: 'empty-cells' } }],
          };
          break;
        }
        const twoFrames = t.representation === 'double-ten-frame' || Math.max(a, result) > 10;
        const frames: 1 | 2 = twoFrames ? 2 : 1;
        const prefilled =
          a > 10
            ? [
                { frame: 0, color: 'a' as const, count: 10 },
                { frame: 1, color: 'a' as const, count: a - 10 },
              ]
            : a > 0
              ? [{ frame: 0, color: 'a' as const, count: a }]
              : [];
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'tenframe-fill',
            frames,
            size: 10,
            prefilled,
            goal: plus ? 'add' : 'subtract',
            a,
            b,
            requireStandardFill: false,
            thenAsk: 'total',
            skin: 'frame',
          },
          answer: {
            kind: 'state',
            checker: 'tenframe.total',
            target: { n: result, value: result },
          },
          highlight: [{ op: 'show-addends' }],
        };
        break;
      }
      case 'rekenrek': {
        if (!plus || unknown !== 'result' || !rekenrekFits(f)) {
          throw new RangeError('addsub.facts: rekenrek adds on two rows of ten, total asked');
        }
        const makeTen = strategy === 'make-ten';
        const nine = strategy === 'nine';
        const preset = rekenrekPreset(f);
        const rowRule = makeTen ? 'fill-top-first' : 'any';
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'rekenrek',
            rows: 2,
            preset,
            mode: makeTen ? 'make-ten' : 'add',
            target: result,
            a,
            b,
            rowRule,
            thenAsk: 'total',
          },
          answer: {
            kind: 'state',
            checker: 'rekenrek.total',
            target: { n: result, rowRule, value: result },
          },
          highlight: [{ op: 'highlight', args: { row: nine ? 1 : 0, upTo: nine ? f.other : a } }],
        };
        break;
      }
      case 'number-line-jump': {
        if (unknown !== 'result')
          throw new RangeError('addsub.facts: number-line-jump needs result unknown');
        // The open number line (no ticks) and `jumps: free` allow hops of 1–10, so a child can
        // bridge through ten (8 → 10 → 13) or jump a double; otherwise hops are ±1.
        const open = t.representation === 'open-number-line';
        const stones = t.tier === 'concrete' && !open;
        const difference = isDifference(f);
        const dir: 1 | -1 = plus || difference ? 1 : -1;
        const free = open || asStr(params.jumps, 'ones') === 'free';
        const allowedJumps = free ? freeJumps(dir) : [dir];
        const start = difference ? b : a;
        const target = difference ? a : result;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-line-jump',
            min: 0,
            max: Math.max(10, Math.max(a, result) + 2),
            ticksEvery: open ? null : 1,
            labelsEvery: open ? null : stones ? 1 : 5,
            start,
            goal: difference ? 'difference' : plus ? 'add' : 'subtract',
            target,
            allowedJumps,
            path: open ? 'open' : stones ? 'stones' : 'line',
            thenAsk: difference ? 'total-jump' : 'landing',
          },
          answer: {
            kind: 'state',
            checker: 'jumps.reach',
            target: { start, target, allowedJumps, value: result },
          },
          nudge: [{ op: 'highlight', args: { at: start } }],
          highlight: [{ op: 'highlight', args: { at: start } }],
        };
        break;
      }
      case 'dot-flash': {
        if (!plus || unknown !== 'result') {
          throw new RangeError('addsub.facts: dot-flash shows two groups to add');
        }
        const stimulus: StimulusSpec =
          t.representation === 'double-ten-frame' && a <= 10 && b <= 10
            ? splitFrames(a, b)
            : t.representation === 'ten-frame'
              ? tenFrameOverlay(result, [a, b])
              : { kind: 'dots', arrangement: 'groups', groups: [a, b] };
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'dot-flash',
            stimulus,
            flashMs: asNum(params.flashMs, 1000),
            reflashes: 1,
            input: 'pad',
          },
          answer: { kind: 'number', value: result },
          overlay,
        };
        break;
      }
      case 'number-bond': {
        // The fact as a part–part–whole; the asked number is the empty slot.
        let whole: number | null;
        let parts: (number | null)[];
        if (plus) {
          whole = unknown === 'result' ? null : result;
          parts = unknown === 'change' ? [a, null] : unknown === 'start' ? [null, b] : [a, b];
        } else {
          whole = unknown === 'start' ? null : a;
          parts =
            unknown === 'change' ? [null, result] : unknown === 'start' ? [b, result] : [b, null];
        }
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-bond',
            whole,
            parts,
            mode: whole === null ? 'missing-whole' : 'missing-part',
            counters: t.tier === 'concrete',
            nonZero: false,
          },
          answer: { kind: 'number', value: answerValue },
          highlight: [{ op: 'highlight', args: { slot: 'whole' } }],
        };
        break;
      }
      default:
        throw new Error(`addsub.facts cannot build ${t.format}`);
    }
    return finish(addsubFacts, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    const f = factParts(out.params);
    const { a, b, op, result } = f;
    const w = out.widget;
    if (w.format === 'number-line-jump') {
      const jumps = isDifference(f)
        ? new Array<number>(a - b).fill(1)
        : new Array<number>(b).fill(op === '-' ? -1 : 1);
      return { kind: 'state', value: { jumps, value: result } };
    }
    if (w.format === 'rekenrek') {
      return {
        kind: 'state',
        value: { rows: [Math.min(10, result), Math.max(0, result - 10)], value: result },
      };
    }
    if (w.format === 'tenframe-fill' && w.goal === 'make-ten') {
      // Frame 0 full (a, then the moved counters), the rest of b left in frame 1.
      const first = Array.from({ length: 10 }, (_, i) => (i < a ? 1 : 2));
      const second = Array.from({ length: 10 }, (_, i) => (i < result - 10 ? 2 : 0));
      return { kind: 'state', value: { cells: [first, second], value: result } };
    }
    const frames = w.format === 'tenframe-fill' ? w.frames : 1;
    const cells = Array.from({ length: frames }, (_, fr) =>
      Array.from({ length: 10 }, (_, i) => {
        const k = fr * 10 + i;
        if (op === '-') return k < result ? 1 : 0;
        return k < a ? 1 : k < result ? 2 : 0;
      }),
    );
    return { kind: 'state', value: { cells, value: result } };
  },
  solution(out): LessonStep[] {
    const f = factParts(out.params);
    const unknown = asStr(out.params.unknown, 'result');
    const w = out.widget;
    switch (w.format) {
      case 'number-pad':
        return padSolution(f, unknown, w.stimulus.kind !== 'none');
      case 'numeral-pick': {
        const answer = askedValue(f, unknown);
        return [
          ...strategyLines(f, unknown).map((l) => say(l.key, l.vars)),
          say(
            'gen.addsub.facts.answer',
            { n: answer },
            { op: 'tap', args: { id: numberOptionId(answer) } },
          ),
        ];
      }
      case 'dot-flash':
        return [
          f.strategy === 'double'
            ? say('gen.addsub.facts.double', { a: f.a }, { op: 'show' })
            : say('gen.addsub.facts.see-groups', { a: f.a, b: f.b }, { op: 'show' }),
          say(
            'gen.addsub.facts.answer',
            { n: f.result },
            { op: 'answer', args: { value: f.result } },
          ),
        ];
      case 'number-bond': {
        const answer = askedValue(f, unknown);
        const slot = w.whole === null ? 'whole' : w.parts[0] === null ? 'part-0' : 'part-1';
        const known = (w.parts[0] ?? w.parts[1] ?? 0) as number;
        const first =
          slot === 'whole'
            ? say(
                'gen.addsub.facts.join',
                { a: (w.parts[0] ?? 0) as number, b: (w.parts[1] ?? 0) as number },
                { op: 'highlight', args: { slot } },
              )
            : say(
                'gen.addsub.facts.think-add',
                { b: known, a: w.whole ?? 0 },
                { op: 'highlight', args: { slot } },
              );
        return [
          first,
          say(
            'gen.addsub.facts.answer',
            { n: answer },
            { op: 'fill', args: { slot, value: answer } },
          ),
        ];
      }
      case 'rekenrek':
        return rekenrekSolution(f, w.mode === 'make-ten', w.preset[0]);
      case 'tenframe-fill':
        return tenframeSolution(f, w.goal === 'make-ten', w.frames);
      case 'number-line-jump':
        return jumpSolution(f, w.path === 'open', w.start);
      default:
        return [];
    }
  },
};

const askedValue = (f: FactParts, unknown: string): number =>
  unknown === 'change' ? f.b : unknown === 'start' ? f.a : f.result;

function padSolution(f: FactParts, unknown: string, picture: boolean): LessonStep[] {
  const answer = askedValue(f, unknown);
  const lines = strategyLines(f, unknown);
  const makeTen = f.strategy === 'make-ten' && unknown === 'result';
  return [
    ...lines.map((l, i) =>
      i === 0
        ? say(
            l.key,
            l.vars,
            picture ? { op: 'show-stimulus' } : { op: 'highlight', args: { token: 'x' } },
          )
        : say(l.key, l.vars),
    ),
    say(
      makeTen ? 'gen.addsub.facts.ten-and' : 'gen.addsub.facts.answer',
      makeTen ? { keep: f.result - 10, n: answer } : { n: answer },
      { op: 'type', args: { blank: 'x', value: answer } },
    ),
  ];
}

function rekenrekSolution(f: FactParts, makeTen: boolean, top: number): LessonStep[] {
  const { a, b, result } = f;
  if (makeTen) {
    return [
      say(
        'gen.addsub.facts.make-ten.need',
        { a, give: f.give },
        { op: 'slide', args: { row: 1, count: -f.give } },
      ),
      say('gen.addsub.facts.make-ten.full', {}, { op: 'slide', args: { row: 0, count: f.give } }),
      say('gen.addsub.facts.ten-and', { keep: f.keep, n: result }, { op: 'count-total' }),
    ];
  }
  if (f.strategy === 'nine') {
    return [
      say(
        'gen.addsub.facts.nine.ten',
        { other: f.other, ten: f.other + 10 },
        { op: 'slide', args: { row: 0, count: 10 } },
      ),
      say('gen.addsub.facts.nine.take-one', {}, { op: 'slide', args: { row: 0, count: -1 } }),
      say('gen.addsub.facts.answer', { n: result }, { op: 'count-total' }),
    ];
  }
  const onTop = Math.min(b, 10 - top);
  const steps: LessonStep[] = [
    say('gen.addsub.facts.put-more', { b }, { op: 'slide', args: { row: 0, count: onTop } }),
  ];
  if (b > onTop) {
    steps.push(
      say('gen.addsub.facts.full-ten', {}, { op: 'slide', args: { row: 1, count: b - onTop } }),
    );
  }
  steps.push(say('gen.addsub.facts.answer', { n: result }, { op: 'count-total' }));
  return steps;
}

function tenframeSolution(f: FactParts, makeTen: boolean, frames: number): LessonStep[] {
  const { a, b, op, result, strategy } = f;
  const total = say('gen.addsub.facts.answer', { n: result }, { op: 'count-total' });
  if (makeTen) {
    return [
      say('gen.addsub.facts.make-ten.need', { a, give: f.give }, { op: 'show-addends' }),
      say(
        'gen.addsub.facts.make-ten.move',
        { give: f.give },
        { op: 'move-counters', args: { fromFrame: 1, toFrame: 0, count: f.give } },
      ),
      say('gen.addsub.facts.ten-and', { keep: f.keep, n: result }, { op: 'count-total' }),
    ];
  }
  const steps: LessonStep[] = [];
  if (strategy === 'double') {
    steps.push(say('gen.addsub.facts.double', { a }, { op: 'show-addends' }));
  } else if (strategy === 'near-double') {
    steps.push(
      say(
        'gen.addsub.facts.near-double',
        { small: f.small, double: f.double },
        { op: 'show-addends' },
      ),
    );
  } else if (strategy === 'ten-plus' && a === 10) {
    steps.push(say('gen.addsub.facts.full-ten', {}, { op: 'show-addends' }));
  } else {
    steps.push(
      say(
        op === '-' ? 'gen.addsub.facts.take-away' : 'gen.addsub.facts.join',
        { a, b },
        { op: 'show-addends' },
      ),
    );
  }
  if (op === '-' && strategy === 'take-ten') {
    steps.push(
      say('gen.addsub.facts.take-ten', { a }, { op: 'remove', args: { frame: 0, count: 10 } }),
    );
  } else if (op === '-') {
    // Take away from the last frame that has counters, then the one before it (back to ten).
    let left = b;
    let k = 0;
    for (let fr = frames - 1; fr >= 0 && left > 0; fr -= 1) {
      const inFrame = Math.max(0, Math.min(10, a - fr * 10));
      const n = Math.min(left, inFrame);
      if (n > 0) {
        const remove = { op: 'remove', args: { frame: fr, count: n } };
        if (strategy === 'back-to-ten') {
          steps.push(
            k === 0
              ? say('gen.addsub.facts.back-to-ten', { ones: n }, remove)
              : say('gen.addsub.facts.back-rest', { rest: n }, remove),
          );
        } else {
          steps.push(say('gen.addsub.facts.count-on', { n }, remove));
        }
        k += 1;
      }
      left -= n;
    }
  } else {
    // Doubles and near doubles put the second addend in its own frame; a ten plus ones puts the
    // ones beside the full ten; counting on fills on from a.
    const ownFrame =
      (strategy === 'double' || strategy === 'near-double') && frames === 2 && a <= 10;
    const frame = ownFrame || a >= 10 ? 1 : 0;
    const place = { op: 'place', args: { frame, count: b, color: 'b' } };
    steps.push(
      ownFrame || strategy === 'ten-plus'
        ? say('gen.addsub.facts.put-more', { b }, place)
        : say('gen.addsub.facts.count-on', { n: b }, place),
    );
  }
  steps.push(total);
  return steps;
}

/** The worked solution on a number line: hops of one, or bridging ten on the open line. */
function jumpSolution(f: FactParts, open: boolean, start: number): LessonStep[] {
  const { a, b, op, result } = f;
  if (isDifference(f)) {
    const hops = say('gen.addsub.facts.hops', { n: result }, { op: 'label-landing' });
    if (open) {
      return upThroughTen(f)
        ? [
            say('gen.addsub.facts.up-to-ten', { b }, { op: 'bridge-to', args: { at: 10 } }),
            say('gen.addsub.facts.up-rest', { a }, { op: 'bridge-to', args: { at: a } }),
            hops,
          ]
        : [say('gen.addsub.facts.up-from', { b, a }, { op: 'bridge-to', args: { at: a } }), hops];
    }
    const steps: LessonStep[] = [
      say('gen.addsub.facts.up-from', { b, a }, { op: 'highlight', args: { at: start } }),
    ];
    for (let pos = b + 1; pos <= a; pos += 1) {
      steps.push(say('gen.addsub.facts.count-on', { n: pos }, { op: 'hop', args: { by: 1 } }));
    }
    steps.push(hops);
    return steps;
  }
  const label = say('gen.addsub.facts.answer', { n: result }, { op: 'label-landing' });
  if (open) {
    // A near double from the smaller addend: jump it again to the double, then one more
    // (6 + 7 as 6 + 6 + 1), the jumps strategy.used-doubles reads (03 §5.7).
    if (op === '+' && f.strategy === 'near-double' && b === a + 1) {
      return [
        say('gen.addsub.facts.jump-double', { a }, { op: 'hop', args: { by: a } }),
        say('gen.addsub.facts.jump-rest', { rest: 1 }, { op: 'hop', args: { by: 1 } }),
        label,
      ];
    }
    if (op === '+' && a < 10 && result > 10) {
      return [
        say(
          'gen.addsub.facts.jump-to-ten',
          { give: 10 - a },
          { op: 'bridge-to', args: { at: 10 } },
        ),
        say(
          'gen.addsub.facts.jump-rest',
          { rest: result - 10 },
          { op: 'hop', args: { by: result - 10 } },
        ),
        label,
      ];
    }
    if (op === '-' && a > 10 && result < 10) {
      return [
        say(
          'gen.addsub.facts.jump-back-ten',
          { ones: a - 10 },
          { op: 'bridge-to', args: { at: 10 } },
        ),
        say(
          'gen.addsub.facts.jump-back-rest',
          { rest: 10 - result },
          { op: 'hop', args: { by: result - 10 } },
        ),
        label,
      ];
    }
    return [say(startKey(op), { a, b }, { op: 'hop', args: { by: op === '-' ? -b : b } }), label];
  }
  // Hops of one: say each landing but the last, so the answer is first said in the final step.
  const jump = op === '-' ? -1 : 1;
  const steps: LessonStep[] = [say(startKey(op), { a, b }, { op: 'highlight', args: { at: a } })];
  for (let i = 1; i < b; i += 1) {
    steps.push(
      say('gen.addsub.facts.count-on', { n: a + jump * i }, { op: 'hop', args: { by: jump } }),
    );
  }
  steps.push(say('gen.addsub.facts.last-hop', {}, { op: 'hop', args: { by: jump } }), label);
  return steps;
}
