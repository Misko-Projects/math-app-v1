// 03 §5.5 balance. A pan balance with a side of terms in each pan. The conventions are K01's
// (engine README, "Equality and story problems"):
// - `judge`: is the equation true (is it level)? Answers `choice` `true` | `false`.
// - `fill-blank`: blanks in the terms (left side first, then right, in reading order) answer
//   `number` (one blank) or `numbers`. `place {side, term: {n}}` on a pan with a blank fills it.
// - `make-equal`: the child adds unit blocks (or more of the pan's objects, one unit each) with
//   `place {side, term, count?}` until the pans level; answers state `{ left, right }`, the units
//   added to each pan, checked by `balance.equal` `{ left, right }` (what each pan already weighs).
// - `which-heavier`: the pans hold the config's terms; `place {side, term}` of a term already on
//   the pan changes nothing (MEA.16's worked solution places its objects). Answers `choice`
//   `left` | `right` | `same`.
// A placed term (`count` copies) goes on its pan as `+ term`, so the pan keeps a value
// (sideValue). In `make-equal` a pan holds at most BALANCE_PAN_MAX units (a placement that would
// pass it changes nothing), and `place {side, term, remove: true}` takes one added unit off again
// (the child's undo; not an authored demo op).
// The domain the widget draws is stated and enforced here (README, "Balance and story problems").
// `tilt` and `level` show the beam's reaction (visual); `highlight-side {side}` highlights a pan.
// `objectWeights` are hidden weights for object terms (riddles, PUZ.05); a side's value is its
// arithmetic with × before + and −.

import {
  type AnswerSpec,
  type BalanceSide,
  balanceConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import {
  argNumber,
  argNumbers,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'balance'>;
export type BalanceTerm = BalanceSide['terms'][number];
export type Side = 'left' | 'right';

export interface BalanceState extends FormatState<'balance'> {
  left: BalanceTerm[];
  right: BalanceTerm[];
  /** fill-blank: one entry per blank, in reading order (left side first). */
  entries: (number | null)[];
  /** make-equal: the units the child added to each pan. */
  added: Record<Side, number>;
  /** which-heavier: the preloaded terms (indices into the config's pan) a placement has matched. */
  matched: Record<Side, number[]>;
  choice: string | null;
  /** The beam's shown reaction: `tilt` (towards the heavier pan) or `level`, once asked. */
  shown: 'tilt' | 'level' | null;
  highlighted: Side | null;
}

/** The choice ids each choice mode offers. */
export function balanceChoices(c: Config): string[] {
  if (c.mode === 'judge') return ['true', 'false'];
  if (c.mode === 'which-heavier') return ['left', 'right', 'same'];
  return [];
}

/** Blank ids in reading order: the left side's, then the right side's. */
export function balanceBlanks(c: Pick<Config, 'left' | 'right'>): string[] {
  return [...c.left.terms, ...c.right.terms].flatMap((t) => ('blank' in t ? [t.blank] : []));
}

const isOp = (t: BalanceTerm): t is { op: '+' | '-' | '×' } => 'op' in t;

/** A number on a pan is whole, 0 to this (three digits on a tile). */
export const BALANCE_N_MAX = 999;
/** The values (numbers, object groups, a box, a letter) on one side, joined by operations. */
export const BALANCE_VALUES_MAX = 2;
/** The objects drawn on one pan (the sum of its groups). */
export const BALANCE_PAN_OBJECTS_MAX = 20;
/** An object's hidden weight is whole, 1 to this. */
export const BALANCE_WEIGHT_MAX = 99;
/** `make-equal`: the most a pan weighs, before and after the child's blocks. */
export const BALANCE_PAN_MAX = 20;

const whole = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;

/** The numbers a side shows: its numerals and the counts of its object groups. */
const shownNumbers = (terms: readonly BalanceTerm[]): number[] =>
  terms.flatMap((t) => ('n' in t ? [t.n] : 'object' in t ? [t.count] : []));

/**
 * The largest number the `fill-blank` answer control offers (0 … max): from what the pans show,
 * never from the answer. With only additions the box is at most the larger side's shown sum
 * (8 + 5 = _ + 6: at most 13); a subtraction can ask for the two sides together (_ − 3 = 5), and
 * a multiplication for a product. The range is 10, 20, 99 or 999.
 */
export function balanceEntryMax(c: Pick<Config, 'left' | 'right'>): number {
  const left = shownNumbers(c.left.terms);
  const right = shownNumbers(c.right.terms);
  const add = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const ops = [...c.left.terms, ...c.right.terms].flatMap((t) => (isOp(t) ? [t.op] : []));
  let bound = Math.max(add(left), add(right));
  if (ops.includes('-')) bound = add(left) + add(right);
  if (ops.includes('×')) {
    bound = Math.max(
      add(left) + add(right),
      [...left, ...right].reduce((a, b) => a * Math.max(1, b), 1),
    );
  }
  return bound <= 10 ? 10 : bound <= 20 ? 20 : bound < 100 ? 99 : BALANCE_N_MAX;
}

/** What each pan weighs as the config has it (undefined: a box, a letter). */
export function balanceValues(c: Pick<Config, 'left' | 'right' | 'objectWeights'>): {
  left: number | undefined;
  right: number | undefined;
} {
  const weights = c.objectWeights ?? {};
  return { left: sideValue(c.left.terms, weights), right: sideValue(c.right.terms, weights) };
}

/**
 * Why an item's answer is not the one this config asks for (FormatModel.answerIssues): `judge`
 * answers whether the two sides weigh the same; `which-heavier` the heavier pan; `fill-blank` a
 * whole number the answer control offers that makes the sides equal; `make-equal` is checked by
 * `balance.equal` with what the two pans weigh.
 */
export function balanceAnswerIssues(c: Config, answer: AnswerSpec): string[] {
  const { left, right } = balanceValues(c);
  if (c.mode === 'judge' || c.mode === 'which-heavier') {
    if (answer.kind !== 'choice') return [`${c.mode} answers a choice`];
    if (left === undefined || right === undefined) return ['a side has no value'];
    const want = c.mode === 'judge' ? String(left === right) : heavier(left, right);
    return answer.id === want ? [] : [`the pans answer ${want}, the answer is ${answer.id}`];
  }
  if (c.mode === 'fill-blank') {
    if (answer.kind !== 'number') return ['fill-blank answers a number'];
    const v = answer.value;
    const max = balanceEntryMax(c);
    if (!whole(v, 0, max)) return [`the answer ${v} is not a whole number from 0 to ${max}`];
    const blanks = Object.fromEntries(balanceBlanks(c).map((b) => [b, v]));
    const weights = c.objectWeights ?? {};
    const l = sideValue(c.left.terms, weights, blanks);
    const r = sideValue(c.right.terms, weights, blanks);
    // A letter leaves a side without a value: nothing to compare.
    if (l === undefined || r === undefined) return [];
    return l === r ? [] : [`with ${v} in the box the sides are ${l} and ${r}`];
  }
  if (answer.kind !== 'state' || answer.checker !== 'balance.equal') {
    return ['make-equal answers balance.equal'];
  }
  return answer.target.left === left && answer.target.right === right
    ? []
    : [
        `the target is ${String(answer.target.left)} and ${String(answer.target.right)}, the pans weigh ${left} and ${right}`,
      ];
}

/** Whether two terms are the same number or the same objects. */
const sameTerm = (a: BalanceTerm, b: BalanceTerm): boolean =>
  ('n' in a && 'n' in b && a.n === b.n) ||
  ('object' in a && 'object' in b && a.object === b.object && a.count === b.count);

/**
 * A side's value: numbers, objects (count × hidden weight) and filled blanks, combined with ×
 * before + and −. Undefined when a value is unknown (a letter, an empty blank, an object with no
 * weight) or the terms don't alternate value, op, value.
 */
export function sideValue(
  terms: readonly BalanceTerm[],
  weights: Readonly<Record<string, number>> = {},
  blanks: Readonly<Record<string, number | null>> = {},
): number | undefined {
  const values: number[] = [];
  const ops: ('+' | '-' | '×')[] = [];
  let wantValue = true;
  for (const t of terms) {
    if (isOp(t)) {
      if (wantValue) return undefined;
      ops.push(t.op);
      wantValue = true;
      continue;
    }
    if (!wantValue) return undefined;
    let v: number | undefined;
    if ('n' in t) v = t.n;
    else if ('blank' in t) v = blanks[t.blank] ?? undefined;
    else if ('object' in t) {
      const w = weights[t.object];
      v = w === undefined ? undefined : w * t.count;
    }
    if (v === undefined || !Number.isFinite(v)) return undefined;
    values.push(v);
    wantValue = false;
  }
  if (wantValue) return values.length === 0 ? 0 : undefined;
  // × first, then + and − left to right.
  const sums: number[] = [values[0] as number];
  const addOps: ('+' | '-')[] = [];
  ops.forEach((op, i) => {
    const next = values[i + 1] as number;
    if (op === '×') sums[sums.length - 1] = (sums[sums.length - 1] as number) * next;
    else {
      addOps.push(op);
      sums.push(next);
    }
  });
  return addOps.reduce(
    (a, op, i) => (op === '+' ? a + (sums[i + 1] as number) : a - (sums[i + 1] as number)),
    sums[0] as number,
  );
}

/** The heavier pan, or `same` (undefined when a side's value is unknown). */
export function heavier(
  left: number | undefined,
  right: number | undefined,
): 'left' | 'right' | 'same' | undefined {
  if (left === undefined || right === undefined) return undefined;
  return left === right ? 'same' : left > right ? 'left' : 'right';
}

const configSchema = balanceConfigSchema.superRefine((c, ctx) => {
  const weights = c.objectWeights ?? {};
  const objects = [...c.left.terms, ...c.right.terms].flatMap((t) =>
    'object' in t ? [t.object] : [],
  );
  if (objects.some((o) => weights[o] === undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: ['objectWeights'],
      message: 'every object needs a hidden weight',
    });
  }
  const blanks = balanceBlanks(c);
  if (new Set(blanks).size !== blanks.length) {
    ctx.addIssue({ code: 'custom', path: ['left'], message: 'blank ids must be distinct' });
  }
  if (c.mode === 'fill-blank' && blanks.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['left'], message: 'fill-blank needs a blank' });
  }
  if (c.mode !== 'fill-blank' && blanks.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['left'], message: `${c.mode} has no blanks` });
  }
  if (c.mode === 'which-heavier' && (c.left.terms.length === 0 || c.right.terms.length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['left'], message: 'each pan has something to weigh' });
  }
  if (c.mode === 'fill-blank' && blanks.length > 1) {
    ctx.addIssue({ code: 'custom', path: ['left'], message: 'fill-blank has one box' });
  }
  for (const [object, w] of Object.entries(weights)) {
    if (!whole(w, 1, BALANCE_WEIGHT_MAX)) {
      ctx.addIssue({
        code: 'custom',
        path: ['objectWeights', object],
        message: `a weight is whole, 1 to ${BALANCE_WEIGHT_MAX}`,
      });
    }
  }
  for (const side of ['left', 'right'] as const) {
    const terms = c[side].terms;
    if (terms.some((t) => 'n' in t && !whole(t.n, 0, BALANCE_N_MAX))) {
      ctx.addIssue({
        code: 'custom',
        path: [side],
        message: `a number is whole, 0 to ${BALANCE_N_MAX}`,
      });
    }
    if (terms.some((t) => 'letter' in t && t.letter.length !== 1)) {
      ctx.addIssue({ code: 'custom', path: [side], message: 'a letter is one character' });
    }
    if (terms.filter((t) => !isOp(t)).length > BALANCE_VALUES_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: [side],
        message: `at most ${BALANCE_VALUES_MAX} values on a side`,
      });
    }
    const counts = terms.flatMap((t) => ('object' in t ? [t.count] : []));
    if (counts.some((n) => n < 1) || counts.reduce((a, b) => a + b, 0) > BALANCE_PAN_OBJECTS_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: [side],
        message: `a pan draws 1 to ${BALANCE_PAN_OBJECTS_MAX} objects`,
      });
    }
    if (c.mode === 'make-equal') {
      // The child's blocks are the pan's own kind (its objects, one unit each, or unit blocks).
      const kinds = new Set(terms.flatMap((t) => ('object' in t ? [t.object] : [])));
      const mixed = kinds.size > 1 || (kinds.size === 1 && terms.some((t) => 'n' in t));
      const units = [...kinds].every((k) => weights[k] === undefined || weights[k] === 1);
      const v = sideValue(terms, weights);
      if (mixed || !units || v === undefined || !whole(v, 0, BALANCE_PAN_MAX)) {
        ctx.addIssue({
          code: 'custom',
          path: [side],
          message: `make-equal: a pan of numbers, or of one kind of object weighing 1 each, worth a whole 0 to ${BALANCE_PAN_MAX}`,
        });
      }
    }
  }
  for (const side of ['left', 'right'] as const) {
    const terms = c[side].terms;
    const hasLetter = terms.some((t) => 'letter' in t);
    // Structure only: every blank and object counts as 1 (missing weights are reported above).
    const probe = Object.fromEntries(blanks.map((b) => [b, 1]));
    const anyWeight = Object.fromEntries(objects.map((o) => [o, 1]));
    if (!hasLetter && terms.length > 0 && sideValue(terms, anyWeight, probe) === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [side],
        message: 'terms must alternate value, op, value',
      });
    }
  }
});

/** `make-equal`: one unit the child added comes off the pan again (from the last put on). */
function takeOff(s: BalanceState, side: Side): BalanceState {
  if (s.added[side] < 1 || s[side].length <= s.config[side].terms.length) return s;
  const pan = [...s[side]];
  const last = pan[pan.length - 1] as BalanceTerm;
  const rest = 'n' in last ? last.n - 1 : 'object' in last ? last.count - 1 : -1;
  if (rest < 0) return s;
  if (rest === 0) {
    pan.pop();
    // The `+` that joined it goes too.
    if (pan.length > 0 && isOp(pan[pan.length - 1] as BalanceTerm)) pan.pop();
  } else {
    pan[pan.length - 1] = 'n' in last ? { n: rest } : { ...last, count: rest };
  }
  return { ...s, [side]: pan, added: { ...s.added, [side]: s.added[side] - 1 } };
}

export const balance: FormatModel<'balance', BalanceState> = {
  format: 'balance',
  configSchema,
  answerIssues: balanceAnswerIssues,
  features: {
    opsBothSides: { weight: 0.9, doc: 'both sides have an operation (8 + 5 = _ + 6)' },
    'blank.left': { weight: 0.5, doc: 'a blank on the left side' },
    'judge.false': { weight: 0.3, doc: 'judge mode and the equation is false' },
    size: { weight: 0.3, doc: 'largest number / 10' },
    letter: { weight: 0.4, doc: 'a letter unknown (ALG.08)' },
    'objects.kinds': { weight: 0.8, doc: 'object kinds with hidden weights − 1' },
    'showTilt.off': { weight: 0.4, doc: 'the beam does not tilt' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    const terms = [...c.left.terms, ...c.right.terms];
    const numbers = terms.flatMap((t) => ('n' in t ? [Math.abs(t.n)] : []));
    const kinds = new Set(terms.flatMap((t) => ('object' in t ? [t.object] : [])));
    const weights = c.objectWeights ?? {};
    const judgeFalse =
      c.mode === 'judge' && sideValue(c.left.terms, weights) !== sideValue(c.right.terms, weights);
    return {
      opsBothSides: c.left.terms.some(isOp) && c.right.terms.some(isOp) ? 1 : 0,
      'blank.left': c.left.terms.some((t) => 'blank' in t) ? 1 : 0,
      'judge.false': judgeFalse ? 1 : 0,
      size: numbers.length > 0 ? Math.max(...numbers) / 10 : 0,
      letter: terms.some((t) => 'letter' in t) ? 1 : 0,
      'objects.kinds': Math.max(0, kinds.size - 1),
      'showTilt.off': c.showTilt ? 0 : 1,
    };
  },
  initialState(config) {
    return {
      config,
      left: [...config.left.terms],
      right: [...config.right.terms],
      entries: balanceBlanks(config).map(() => null),
      added: { left: 0, right: 0 },
      matched: { left: [], right: [] },
      choice: null,
      shown: null,
      highlighted: null,
    };
  },
  apply(s, a) {
    switch (a.op) {
      case 'place': {
        const side = argString(a, 'side');
        const term = a.args?.term as BalanceTerm | undefined;
        if ((side !== 'left' && side !== 'right') || !term || typeof term !== 'object') return s;
        const copies = Math.min(
          BALANCE_PAN_MAX,
          Math.max(1, Math.trunc(argNumber(a, 'count') ?? 1)),
        );
        if (s.config.mode === 'fill-blank') {
          // A number placed on a pan fills that pan's blank.
          if (!('n' in term)) return s;
          const blanks = balanceBlanks(s.config);
          const own = s.config[side].terms.flatMap((t) => ('blank' in t ? [t.blank] : []));
          const i = own.length > 0 ? blanks.indexOf(own[0] as string) : -1;
          if (i < 0) return s;
          return { ...s, entries: s.entries.map((e, j) => (j === i ? term.n : e)) };
        }
        if (!('n' in term) && !('object' in term)) return s;
        if (s.config.mode === 'make-equal' && a.args?.remove === true) return takeOff(s, side);
        if (s.config.mode === 'which-heavier' && copies === 1) {
          // A comparison's pans start with the config's objects (compare.sets, compare.numbers).
          // MEA.16's worked solution places them again: a single placement of a term that matches
          // a preloaded one not yet matched is that object going on, so it changes no value. Any
          // other placement (a repeat, a new term, a count above 1) adds to the pan.
          const preloaded = s.config[side].terms;
          const i = preloaded.findIndex(
            (t, j) => !s.matched[side].includes(j) && sameTerm(t, term),
          );
          if (i >= 0) {
            return { ...s, matched: { ...s.matched, [side]: [...s.matched[side], i] } };
          }
        }
        // The copies go on as one more term, joined with +, so the pan keeps a value.
        const added: BalanceTerm =
          'n' in term
            ? { n: term.n * copies }
            : { object: term.object, count: term.count * copies };
        const pan: BalanceTerm[] =
          s[side].length === 0 ? [added] : [...s[side], { op: '+' }, added];
        if (s.config.mode === 'make-equal') {
          // One unit per block or object added (K01: balance.equal counts units).
          const units = 'n' in added ? added.n : added.count;
          // A full pan takes no more: the placement changes nothing.
          const weighs = sideValue(s[side], s.config.objectWeights ?? {}) ?? 0;
          if (!Number.isInteger(units) || units < 1 || weighs + units > BALANCE_PAN_MAX) return s;
          return { ...s, [side]: pan, added: { ...s.added, [side]: s.added[side] + units } };
        }
        return { ...s, [side]: pan };
      }
      case 'tilt':
        return { ...s, shown: 'tilt' };
      case 'level':
        return { ...s, shown: 'level' };
      case 'highlight-side': {
        const side = argString(a, 'side');
        return { ...s, highlighted: side === 'left' || side === 'right' ? side : null };
      }
      case 'answer': {
        const id = argString(a, 'id');
        if (id !== undefined) return { ...s, choice: id };
        const values = argNumbers(a, 'values');
        const v = argNumber(a, 'value');
        if (values) return { ...s, entries: s.entries.map((_, i) => values[i] ?? null) };
        if (v !== undefined) return { ...s, entries: s.entries.map((e, i) => (i === 0 ? v : e)) };
        return s;
      }
      default:
        throw new UnsupportedOpError('balance', a.op);
    }
  },
  toResponse(s) {
    const c = s.config;
    if (c.mode === 'judge' || c.mode === 'which-heavier') {
      return s.choice === null ? null : { kind: 'choice', id: s.choice };
    }
    if (c.mode === 'fill-blank') {
      if (s.entries.some((e) => e === null)) return null;
      const values = s.entries as number[];
      return values.length === 1
        ? { kind: 'number', value: values[0] as number }
        : { kind: 'numbers', values };
    }
    return { kind: 'state', value: { left: s.added.left, right: s.added.right } };
  },
};
