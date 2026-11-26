// K02 slice 4e (#17) misconception rules: grade 2 patterns and puzzles (03 §7.2).
// - MC.grow-as-repeat (state): a growing pattern continued as a repeating one. pattern-extend
//   (pattern.grow, kind grow): the empty steps get the first steps again (step 4 = step 1, step
//   5 = step 2). number-pad (squares of step 3 + ask): the squares of step `ask`.
// - MC.cage-repeat-digit (state): a cage grid whose every cage adds up, but a row or column holds
//   a digit twice (the cage sums met, the row and column rule ignored).
// - MC.digit-order-reversed (answer): the biggest number made with the biggest digit last (or the
//   smallest with the smallest last): the cards in the reverse order, or that number typed.
// - MC.way-counted-twice (state): a way to pay already found, made again (its coins in another
//   order are the same way).

import type { GeneratedItem, PatternToken, ResponseValue } from '@number-island/shared';
import { canonicalKey, readTray, trayKey } from '../../formats/money';
import { CAGE_LAYOUTS, cagesOf, digitOrder, numberOf } from '../../generators/puzzle/k02';
import { type MisconceptionRule, sameResponse } from '../rules';

const variant = (item: GeneratedItem) => item.params.variant;

// ---------- MC.grow-as-repeat ----------

function predictGrow(item: GeneratedItem): ResponseValue | null {
  const w = item.widget;
  const a = item.answer;
  if (item.params.kind !== 'shape') return null;
  if (w.format === 'pattern-extend' && w.kind === 'grow' && a.kind === 'state') {
    const expected = a.target.expected as PatternToken[];
    const first = w.sequence.slice(0, expected.length) as PatternToken[];
    if (first.length < expected.length || first.some((x) => x === null)) return null;
    return { kind: 'state', value: { tokens: first } };
  }
  if (w.format === 'number-pad' && a.kind === 'number') {
    const start = Number(item.params.start);
    const step = Number(item.params.step);
    const ask = Number(item.params.ask);
    return { kind: 'number', value: start + (ask - 1) * step };
  }
  return null;
}

export const growAsRepeat: MisconceptionRule = {
  id: 'growAsRepeat',
  kind: 'state',
  predict: predictGrow,
  match(item, r) {
    const p = predictGrow(item);
    return p !== null && sameResponse(p, r);
  },
};

// ---------- MC.cage-repeat-digit ----------

type Grid = (number | string)[][];

function cageFacts(item: GeneratedItem) {
  const layout = CAGE_LAYOUTS[Number(item.params.layout)];
  if (variant(item) !== 'cage-sum' || item.widget.format !== 'puzzle-grid' || !layout) return null;
  const sums = new Map<string, number>();
  for (const k of item.widget.constraints) if (k.kind === 'cage-sum') sums.set(k.cage, k.sum);
  return { cages: [...cagesOf(layout)], sums };
}

/** Every cage adds up, every value is 1–3, and some row or column repeats a digit. */
function sumsOnly(item: GeneratedItem, fill: Grid): boolean {
  const f = cageFacts(item);
  if (!f) return false;
  const v = (r: number, c: number) => fill[r]?.[c];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) if (![1, 2, 3].includes(v(r, c) as number)) return false;
  for (const [id, cells] of f.cages) {
    if (cells.reduce((s, [r, c]) => s + (v(r, c) as number), 0) !== f.sums.get(id)) return false;
  }
  const repeats = [0, 1, 2].some(
    (i) =>
      new Set([0, 1, 2].map((j) => v(i, j))).size < 3 ||
      new Set([0, 1, 2].map((j) => v(j, i))).size < 3,
  );
  const w = item.widget;
  const givensKept =
    w.format === 'puzzle-grid' &&
    w.cells.every((x) => x.given === undefined || v(x.r, x.c) === x.given);
  return repeats && givensKept;
}

function predictCage(item: GeneratedItem): ResponseValue | null {
  if (!cageFacts(item)) return null;
  // The first grid (in counting order) that meets every cage sum with a repeated digit.
  for (let code = 0; code < 3 ** 9; code++) {
    const flat = Array.from({ length: 9 }, (_, i) => (Math.floor(code / 3 ** (8 - i)) % 3) + 1);
    const fill: Grid = [flat.slice(0, 3), flat.slice(3, 6), flat.slice(6, 9)];
    if (sumsOnly(item, fill)) return { kind: 'state', value: { fill } };
  }
  return null;
}

export const cageRepeatDigit: MisconceptionRule = {
  id: 'cageRepeatDigit',
  kind: 'state',
  predict: predictCage,
  match(item, r) {
    if (r.kind !== 'state' || !Array.isArray(r.value.fill)) return false;
    return sumsOnly(item, r.value.fill as Grid);
  },
};

// ---------- MC.digit-order-reversed ----------

function predictDigits(item: GeneratedItem): ResponseValue | null {
  if (variant(item) !== 'digit-cards') return null;
  const reversed = [...digitOrder(item.params)].reverse();
  const a = item.answer;
  if (a.kind === 'numbers') return { kind: 'numbers', values: reversed };
  if (a.kind === 'number') return { kind: 'number', value: numberOf(reversed) };
  return null;
}

export const digitOrderReversed: MisconceptionRule = {
  id: 'digitOrderReversed',
  kind: 'answer',
  predict: predictDigits,
  match(item, r) {
    const p = predictDigits(item);
    return p !== null && sameResponse(p, r);
  },
};

// ---------- MC.way-counted-twice ----------

function foundWays(item: GeneratedItem): Set<string> | null {
  const w = item.widget;
  if (w.format !== 'coin-pay' || w.mode !== 'new-way') return null;
  return new Set((w.found ?? []).map((k) => canonicalKey(k) ?? k));
}

function predictWay(item: GeneratedItem): ResponseValue | null {
  const w = item.widget;
  const found = foundWays(item);
  if (!found || w.format !== 'coin-pay') return null;
  const first = (w.found ?? [])[0];
  const m = first ? /^q(\d+)d(\d+)n(\d+)p(\d+)$/.exec(first) : null;
  if (!m) return null;
  const coins = {
    quarter: Number(m[1]),
    dime: Number(m[2]),
    nickel: Number(m[3]),
    penny: Number(m[4]),
  };
  return { kind: 'state', value: { coins } };
}

export const wayCountedTwice: MisconceptionRule = {
  id: 'wayCountedTwice',
  kind: 'state',
  applies: (item) => foundWays(item) !== null,
  predict: predictWay,
  match(item, r) {
    const found = foundWays(item);
    if (!found || r.kind !== 'state') return false;
    const tray = readTray(r.value.coins);
    return tray !== undefined && found.has(trayKey(tray));
  },
};
