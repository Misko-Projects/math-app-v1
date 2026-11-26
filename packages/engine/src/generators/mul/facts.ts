// mul.facts (03 §5.6): the fact a × b, each factor 0–10 (FACTOR_MAX). Derived: `result` = a × b.
// K02 slice 3b builds the product facts and their strategies (MUL.06, MUL.07, MUL.13–15):
// - `family` keeps draws where a factor belongs to it (x0x1: 0 or 1; x2, x5, x10, x4, x8, x3, x6,
//   x9: that factor; squares: a = b; any). The family's factor is `a` when `a` belongs, else `b`.
// - `form`: `fact` asks a × b = ?; `turn-around` (MUL.06, the turn-around property) asks
//   a × b = b × ?, whose answer is `a`.
// - `strategy` writes the item as the strategy and asks each step, then the total (a `numbers`
//   answer in reading order). f is the family factor, o the other:
//   - `double` (f = 4 or 8): a × b = h × o + h × o = [p] + [q] = [x], h = f ÷ 2.
//   - `add-group` (f = 3, 6 or 9): 3 → 2 × o + o, 6 → 5 × o + o, 9 → 10 × o − o:
//     a × b = k × o ± o = [p] ± o = [x].
//   - `break-apart` (f = 6–9, the factor broken at 5): a × b = 5 × o + r × o = [p] + [q] = [x].
//   Products are written in the item's order (7 × 4 → 7 × 2 + 7 × 2).
// Formats:
// - number-pad: a picture from the representation (`array`: a rows of b; `groups`: a groups of b;
//   `number-line`: a jumps of b from 0, labelled only at 0; `symbols`: none) and the sentence.
// - equal-groups (`read`): a groups of b, the total asked (a 1–6, b 1–10).
// - array-build: `read` shows a rows of b and asks the total; `split` (break-apart or double)
//   shows o rows of f, the child places a split line anywhere and types the total (the solution
//   splits after 5 columns, or down the middle to double). The `tiles` representation draws the
//   grid.
// Abstract items (symbols) show no countable picture of the product, and the strategy sentences
// never show the total. No factor 0 is drawn on a picture: there is nothing to count (the turn-
// around and × 0 rows ask × 0 in symbols only).
// Not built yet (the division-facts slice adds them, MUL.08, MUL.09, MUL.17, MUL.21): `op` ÷ (a
// quotient from a known product), `unknown: factor` (a × ? = r) with its `unknown.factor` and `div`
// features, family `x7`; also the numeral-pick, area-tiles, number-line-jump and balance formats.

import type {
  ExpressionToken,
  LessonStep,
  ParamValues,
  ResponseValue,
  StimulusSpec,
} from '@number-island/shared';
import { ARRAY_SIDE_MAX } from '../../formats/array-build';
import { GROUP_CAPACITY, GROUPS_MAX } from '../../formats/equal-groups';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import { SHARE_SPRITES } from '../div/share';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';
import { MUL_LINE_MAX, skipCounts } from './groups';

/** The largest factor of a fact (10 × 10). */
export const FACTOR_MAX = 10;
/** The largest product of three factors (MUL.16: 3 × 5 × 2; 2 × 5 × 10). */
export const THREE_PRODUCT_MAX = 100;
export const FACT_FAMILIES = [
  'x0x1',
  'x2',
  'x5',
  'x10',
  'x4',
  'x8',
  'x3',
  'x6',
  'x9',
  'squares',
  'any',
] as const;
export const FACT_STRATEGIES = ['none', 'double', 'add-group', 'break-apart'] as const;
const FORMS = ['fact', 'turn-around'] as const;
const CONTAINERS = ['raft', 'basket', 'plate', 'nest'] as const;
/** Families counted by their own factor (MUL.13): the skip-count line and solution go by f. */
const SKIP_FAMILIES = new Set(['x2', 'x5', 'x10']);

const FAMILY_FACTORS: Record<string, readonly number[]> = {
  x0x1: [0, 1],
  x2: [2],
  x5: [5],
  x10: [10],
  x4: [4],
  x8: [8],
  x3: [3],
  x6: [6],
  x9: [9],
};

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

const num = (v: number): ExpressionToken => ({ t: 'num', v });
const op = (v: '+' | '-' | '×'): ExpressionToken => ({ t: 'op', v });
const eq: ExpressionToken = { t: 'rel', v: '=' };
const blank = (id: string): ExpressionToken => ({ t: 'blank', id });

/** The family factor f and the other factor o of a × b (f = a when a belongs to the family). */
export function familyFactor(a: number, b: number, family: string): { f: number; o: number } {
  const fs = FAMILY_FACTORS[family];
  if (fs && !fs.includes(a) && fs.includes(b)) return { f: b, o: a };
  return { f: a, o: b };
}

function inFamily(a: number, b: number, family: string): boolean {
  if (family === 'squares') return a === b;
  const fs = FAMILY_FACTORS[family];
  return !fs || fs.includes(a) || fs.includes(b);
}

/** Which factor a strategy works on, or null when the strategy cannot apply to a × b. */
function strategyFactor(a: number, b: number, strategy: string, family: string) {
  const ok = (f: number) => {
    if (strategy === 'double') return f === 4 || f === 8;
    if (strategy === 'add-group') return f === 3 || f === 6 || f === 9;
    if (strategy === 'break-apart') return f >= 6 && f <= 9;
    return true;
  };
  const first = familyFactor(a, b, family);
  if (ok(first.f)) return first;
  if (ok(first.o)) return { f: first.o, o: first.f };
  return null;
}

/** A product of the strategy's factor k with o, written in the item's order. */
const times = (k: number, o: number, fFirst: boolean): ExpressionToken[] =>
  fFirst ? [num(k), op('×'), num(o)] : [num(o), op('×'), num(k)];

export interface FactPlan {
  a: number;
  b: number;
  result: number;
  f: number;
  o: number;
  strategy: (typeof FACT_STRATEGIES)[number];
  /** The values asked, in reading order (the last is the total, or `a` for a turn-around). */
  values: number[];
  tokens: ExpressionToken[];
  /** add-group: the known number of groups k (2, 5 or 10) and whether one group is taken away. */
  k: number;
  takeAway: boolean;
  /** break-apart: the rest after 5. */
  rest: number;
  /** Three factors (c > 0): the pair multiplied first, its product, and the factor left. */
  c: number;
  pair: [number, number] | null;
  left: number;
}

/**
 * The pair of a × b × c to multiply first: the first pair (a b, b c, a c) whose product is a
 * multiple of ten, else a × b. Returns the pair's positions.
 */
export function easyPair(a: number, b: number, c: number): [0 | 1, 1 | 2] {
  const pairs: [0 | 1, 1 | 2][] = [
    [0, 1],
    [1, 2],
    [0, 2],
  ];
  const f = [a, b, c];
  return pairs.find(([i, j]) => ((f[i] as number) * (f[j] as number)) % 10 === 0) ?? [0, 1];
}

/** a × b × c = [p] × r = [x] (or r × [p] when the pair is b and c). */
function threePlan(a: number, b: number, c: number): FactPlan {
  const f = [a, b, c];
  const [i, j] = easyPair(a, b, c);
  const x = f[i] as number;
  const y = f[j] as number;
  const left = f[3 - i - j] as number;
  const part = x * y;
  const result = a * b * c;
  const rest: ExpressionToken[] =
    i === 1 ? [num(left), op('×'), blank('p')] : [blank('p'), op('×'), num(left)];
  return {
    a,
    b,
    c,
    result,
    f: a,
    o: b,
    strategy: 'none',
    k: 0,
    takeAway: false,
    rest: 0,
    pair: [x, y],
    left,
    values: [part, result],
    tokens: [num(a), op('×'), num(b), op('×'), num(c), eq, ...rest, eq, blank('x')],
  };
}

/** The item's sentence and asked values. */
export function factPlan(p: ParamValues): FactPlan {
  const a = asNum(p.a);
  const b = asNum(p.b);
  const c = asNum(p.c);
  if (c > 0) return threePlan(a, b, c);
  const result = a * b;
  const strategy = asStr(p.strategy, 'none') as FactPlan['strategy'];
  const family = asStr(p.family, 'any');
  const sf = strategyFactor(a, b, strategy, family) ?? familyFactor(a, b, family);
  const { f, o } = sf;
  const fFirst = f === a && o === b;
  const head: ExpressionToken[] = [num(a), op('×'), num(b), eq];
  const base = {
    a,
    b,
    c: 0,
    pair: null,
    left: 0,
    result,
    f,
    o,
    strategy,
    k: 0,
    takeAway: false,
    rest: 0,
  };
  if (asStr(p.form, 'fact') === 'turn-around') {
    return { ...base, values: [a], tokens: [...head, num(b), op('×'), blank('x')] };
  }
  switch (strategy) {
    case 'double': {
      const h = f / 2;
      const part = h * o;
      return {
        ...base,
        values: [part, part, result],
        tokens: [
          ...head,
          ...times(h, o, fFirst),
          op('+'),
          ...times(h, o, fFirst),
          eq,
          blank('p'),
          op('+'),
          blank('q'),
          eq,
          blank('x'),
        ],
      };
    }
    case 'add-group': {
      const takeAway = f === 9;
      const k = f === 3 ? 2 : f === 6 ? 5 : 10;
      const sign = op(takeAway ? '-' : '+');
      return {
        ...base,
        k,
        takeAway,
        values: [k * o, result],
        tokens: [
          ...head,
          ...times(k, o, fFirst),
          sign,
          num(o),
          eq,
          blank('p'),
          sign,
          num(o),
          eq,
          blank('x'),
        ],
      };
    }
    case 'break-apart': {
      const rest = f - 5;
      return {
        ...base,
        rest,
        values: [5 * o, rest * o, result],
        tokens: [
          ...head,
          ...times(5, o, fFirst),
          op('+'),
          ...times(rest, o, fFirst),
          eq,
          blank('p'),
          op('+'),
          blank('q'),
          eq,
          blank('x'),
        ],
      };
    }
    default:
      return { ...base, values: [result], tokens: [...head, blank('x')] };
  }
}

export const mulFacts: GeneratorDef = {
  id: 'mul.facts',
  formats: ['number-pad', 'equal-groups', 'array-build'],
  params: {
    a: { type: 'int', default: { kind: 'int', min: 0, max: 10 }, doc: 'the first factor, 0–10' },
    b: { type: 'int', default: { kind: 'int', min: 0, max: 10 }, doc: 'the second factor, 0–10' },
    c: {
      type: 'int',
      default: { kind: 'const', value: 0 },
      doc: 'a third factor, 1–10 (MUL.16; 0 = two factors); a × b × c is at most THREE_PRODUCT_MAX',
    },
    family: {
      type: 'string',
      values: [...FACT_FAMILIES],
      default: { kind: 'const', value: 'any' },
      doc: 'keep draws with a factor in this family (x0x1: 0 or 1; squares: a = b; any)',
    },
    strategy: {
      type: 'string',
      values: [...FACT_STRATEGIES],
      default: { kind: 'const', value: 'none' },
      doc: 'write the fact as a strategy and ask each step: double (× 4, × 8), add-group (× 3, × 6, × 9), break-apart (a factor 6–9 at 5)',
    },
    form: {
      type: 'string',
      values: [...FORMS],
      default: { kind: 'const', value: 'fact' },
      doc: 'fact: a × b = ?; turn-around: a × b = b × ? (MUL.06)',
    },
    mode: {
      type: 'string',
      values: ['read', 'split'],
      default: { kind: 'const', value: 'read' },
      doc: 'array-build: read the array, or split it (break-apart, double)',
    },
    container: {
      type: 'string',
      values: [...CONTAINERS],
      default: { kind: 'choice', values: [...CONTAINERS] },
      doc: 'equal-groups: what holds each group',
    },
    sprite: {
      type: 'string',
      values: [...SHARE_SPRITES],
      default: { kind: 'choice', values: [...SHARE_SPRITES] },
      doc: 'what is grouped (a noun with clips)',
    },
  },
  derived: ['result'],
  features: {
    hardFactor: { weight: 0.3, doc: 'each factor is 6–9' },
    zeroOne: { weight: -0.5, doc: 'a factor is 0 or 1' },
    fivesTens: { weight: -0.4, doc: 'a factor is 5 or 10' },
    square: { weight: -0.2, doc: 'a square fact (a = b)' },
  },
  narration: [
    'gen.mul.facts.zero',
    'gen.mul.facts.one',
    'gen.mul.facts.turn',
    'gen.mul.facts.count-by',
    'gen.mul.facts.is',
    'gen.mul.facts.half',
    'gen.mul.facts.double',
    'gen.mul.facts.known',
    'gen.mul.facts.add-group',
    'gen.mul.facts.take-group',
    'gen.mul.facts.break',
    'gen.mul.facts.part',
    'gen.mul.facts.join',
    'gen.mul.facts.split',
    'gen.mul.facts.split-half',
    'gen.mul.facts.pair',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive(p) {
    const c = asNum(p.c);
    return { result: asNum(p.a) * asNum(p.b) * (c > 0 ? c : 1) };
  },
  accepts(p, t) {
    const a = asNum(p.a);
    const b = asNum(p.b);
    const family = asStr(p.family, 'any');
    const strategy = asStr(p.strategy, 'none');
    const turn = asStr(p.form, 'fact') === 'turn-around';
    if (a < 0 || b < 0 || a > FACTOR_MAX || b > FACTOR_MAX) return false;
    const c = asNum(p.c);
    if (c !== 0) {
      // Three factors: each 1–10, a product of at most 100, symbols or the groups the easy pair
      // makes (left groups of the pair's product).
      if (c < 0 || c > FACTOR_MAX || a < 1 || b < 1) return false;
      if (a * b * c > THREE_PRODUCT_MAX || strategy !== 'none' || turn || family !== 'any') {
        return false;
      }
      const plan = factPlan(p);
      const part = (plan.pair as [number, number])[0] * (plan.pair as [number, number])[1];
      const groupsFit = plan.left <= GROUPS_MAX && part <= GROUP_CAPACITY;
      if (t.format === 'equal-groups') return groupsFit;
      if (t.format !== 'number-pad') return false;
      const rep = t.representation ?? 'symbols';
      return rep === 'symbols' || (rep === 'groups' && groupsFit);
    }
    if (!inFamily(a, b, family)) return false;
    if (strategy !== 'none' && (turn || strategyFactor(a, b, strategy, family) === null)) {
      return false;
    }
    // A turn-around with equal factors asks nothing new.
    if (turn && a === b) return false;
    const pictured = t.format !== 'number-pad' || (t.representation ?? 'symbols') !== 'symbols';
    if (pictured && (a === 0 || b === 0)) return false;
    switch (t.format) {
      case 'equal-groups':
        return (
          !turn &&
          strategy !== 'break-apart' &&
          strategy !== 'double' &&
          a <= GROUPS_MAX &&
          b <= GROUP_CAPACITY
        );
      case 'array-build': {
        if (turn) return false;
        if (asStr(p.mode, 'read') === 'split') {
          return strategy === 'break-apart' || strategy === 'double';
        }
        return strategy === 'none';
      }
      case 'number-pad': {
        const rep = t.representation ?? 'symbols';
        if (rep === 'groups') return a <= GROUPS_MAX && b <= GROUP_CAPACITY;
        if (rep === 'number-line') return a * b <= MUL_LINE_MAX && !turn;
        return true;
      }
      default:
        return false;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    const plan = factPlan(params);
    const { a, b, result, f, o } = plan;
    const sprite = asStr(params.sprite, 'shell');
    // Three factors are pictured as the easy pair's groups: `left` groups of x × y.
    const [x, y] = plan.pair ?? [0, 0];
    const groups = plan.pair ? plan.left : a;
    const perGroup = plan.pair ? x * y : b;
    const vars = pickVars(t, {
      a,
      b,
      c: plan.c,
      x,
      y,
      left: plan.left,
      f,
      o,
      k: plan.k,
      known: plan.k * o,
      half: f / 2,
      rest: plan.rest,
      sprite,
    });
    const math: Record<string, number> = {
      hardFactor: a >= 6 && a <= 9 && b >= 6 && b <= 9 ? 1 : 0,
      zeroOne: a <= 1 || b <= 1 ? 1 : 0,
      fivesTens: [5, 10].includes(a) || [5, 10].includes(b) ? 1 : 0,
      square: a === b ? 1 : 0,
    };
    const digits = (v: number) => (v >= 100 ? 3 : 2);
    let p: PartialOutput;
    switch (t.format) {
      case 'equal-groups':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'equal-groups',
            groups,
            perGroup,
            unknown: 'total',
            mode: 'read',
            container: asStr(params.container, 'basket') as (typeof CONTAINERS)[number],
            sprite,
            maxGroups: groups,
          },
          answer: { kind: 'number', value: result },
        };
        break;
      case 'array-build': {
        const split = asStr(params.mode, 'read') === 'split';
        const rows = split ? o : a;
        const cols = split ? f : b;
        const side = Math.max(rows, cols) <= 5 ? 6 : ARRAY_SIDE_MAX;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'array-build',
            maxRows: side,
            maxCols: side,
            mode: split ? 'split' : 'read',
            rows,
            cols,
            orientationMatters: true,
            sprite,
            gridShown: t.representation === 'tiles',
          },
          answer: split
            ? {
                kind: 'state',
                checker: 'array.dims',
                target: { rows, cols, orientationMatters: true, requireSplit: true },
              }
            : { kind: 'number', value: result },
        };
        break;
      }
      case 'number-pad': {
        const values = plan.values;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: picture(
              t.representation ?? 'symbols',
              groups,
              perGroup,
              sprite,
              SKIP_FAMILIES.has(asStr(params.family, 'any')) ? { n: o, by: f } : { n: a, by: b },
            ),
            expression: { tokens: plan.tokens },
            blanks: plan.tokens.flatMap((tk) =>
              tk.t === 'blank'
                ? [{ id: tk.id, maxDigits: digits(values[blankIndex(plan.tokens, tk.id)] ?? 0) }]
                : [],
            ),
            unit: null,
          },
          answer:
            values.length === 1
              ? { kind: 'number', value: values[0] as number }
              : { kind: 'numbers', values: [...values], ordered: true },
        };
        break;
      }
      default:
        throw new Error(`mul.facts cannot build ${t.format}`);
    }
    return finish(mulFacts, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    const t = a.target;
    return {
      kind: 'state',
      value: {
        rows: t.rows,
        cols: t.cols,
        split: splitAt(factPlan(out.params)),
        value: asNum(out.params.a) * asNum(out.params.b),
      },
    };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const plan = factPlan(out.params);
    const { a, b, result, f, o } = plan;
    const ids = w.format === 'number-pad' ? w.blanks.map((bl) => bl.id) : [];
    const type = (i: number) =>
      w.format === 'number-pad'
        ? ({
            op: 'type',
            args: { blank: ids[i] as string, value: plan.values[i] as number },
          } as const)
        : ({ op: 'answer', args: { value: plan.values[i] as number } } as const);
    if (asStr(out.params.form, 'fact') === 'turn-around') {
      return [say('gen.mul.facts.turn', { a, b }, type(0))];
    }
    if (plan.pair) {
      // Three factors: the easy pair first (a product of ten when one is there), then the rest.
      const [x, y] = plan.pair;
      const part = x * y;
      return [
        say('gen.mul.facts.pair', { x, y, part }, type(0)),
        say('gen.mul.facts.is', { a: part, b: plan.left, result }, type(1)),
      ];
    }
    const lead: LessonStep[] =
      w.format === 'array-build' && w.mode === 'split'
        ? [
            say(
              plan.strategy === 'double' ? 'gen.mul.facts.split-half' : 'gen.mul.facts.split',
              {},
              {
                op: 'split-at',
                args: { col: splitAt(plan) },
              },
            ),
          ]
        : [];
    switch (plan.strategy) {
      case 'double': {
        const half = f / 2;
        const part = half * o;
        if (w.format !== 'number-pad') {
          // The split array: each half is half × o; the total is the double.
          return [
            ...lead,
            say('gen.mul.facts.half', { f, half }),
            say('gen.mul.facts.is', { a: half, b: o, result: part }),
            say(
              'gen.mul.facts.double',
              { part, result },
              { op: 'answer', args: { value: result } },
            ),
          ];
        }
        return [
          say('gen.mul.facts.half', { f, half }),
          say('gen.mul.facts.is', { a: half, b: o, result: part }, type(0)),
          say('gen.mul.facts.is', { a: half, b: o, result: part }, type(1)),
          say('gen.mul.facts.double', { part, result }, type(2)),
        ];
      }
      case 'add-group': {
        const known = plan.k * o;
        return [
          say('gen.mul.facts.known', { k: plan.k, o, known }, type(0)),
          plan.takeAway
            ? say('gen.mul.facts.take-group', { o, known, result }, type(1))
            : say('gen.mul.facts.add-group', { o, known, result }, type(1)),
        ];
      }
      case 'break-apart': {
        const p1 = 5 * o;
        const p2 = plan.rest * o;
        const parts = [
          say('gen.mul.facts.break', { f, rest: plan.rest }),
          say(
            'gen.mul.facts.part',
            { k: 5, o, part: p1 },
            w.format === 'number-pad' ? type(0) : undefined,
          ),
          say(
            'gen.mul.facts.part',
            { k: plan.rest, o, part: p2 },
            w.format === 'number-pad' ? type(1) : undefined,
          ),
          say(
            'gen.mul.facts.join',
            { p1, p2, result },
            w.format === 'number-pad' ? type(2) : { op: 'answer', args: { value: result } },
          ),
        ];
        return [...lead, ...parts];
      }
      default: {
        const last = type(plan.values.length - 1);
        if (a === 0 || b === 0) return [say('gen.mul.facts.zero', {}, last)];
        if (a === 1 || b === 1) return [say('gen.mul.facts.one', { n: a === 1 ? b : a }, last)];
        // Count by the family factor when it is a skip-count family, else by b: once per the other.
        const skip = SKIP_FAMILIES.has(asStr(out.params.family, 'any'));
        const by = skip ? f : b;
        const n = skip ? o : a;
        return [
          say('gen.mul.facts.count-by', { by, counts: skipCounts(n, by) }),
          say('gen.mul.facts.is', { a, b, result }, last),
        ];
      }
    }
  },
};

/** Where a split item's solution draws its line: after 5 columns, or down the middle. */
const splitAt = (plan: FactPlan): number => (plan.strategy === 'double' ? plan.f / 2 : 5);

function blankIndex(tokens: ExpressionToken[], id: string): number {
  return tokens.filter((t) => t.t === 'blank').findIndex((t) => t.t === 'blank' && t.id === id);
}

/** The picture a number-pad item shows; none for symbols. */
function picture(
  rep: string,
  a: number,
  b: number,
  sprite: string,
  line: { n: number; by: number },
): StimulusSpec {
  const sp = sprite as (typeof SHARE_SPRITES)[number];
  switch (rep) {
    case 'array':
      return { kind: 'array', rows: a, cols: b, sprite: sp };
    case 'groups':
      return { kind: 'groups', groups: a, perGroup: b, sprite: sp };
    case 'number-line': {
      const { n, by } = line;
      return {
        kind: 'number-line',
        min: 0,
        max: Math.min(MUL_LINE_MAX + by, n * by + by),
        ticksEvery: by,
        labelsEvery: null,
        marks: [{ at: 0, label: '0' }],
        jumps: Array.from({ length: n }, (_, k) => ({ from: k * by, to: (k + 1) * by })),
      };
    }
    default:
      return { kind: 'none' };
  }
}
