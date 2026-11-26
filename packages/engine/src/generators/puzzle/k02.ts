// puzzle.grid K02 variants (#17 slice 4e): grade 2 puzzles. Every number comes from the params, so
// `accepts` decides solvability and uniqueness from the params alone; layout randomness only
// shuffles cards.
// - cage-sum (PUZ.04, puzzle-grid): a 3 × 3 mini-KenKen. `square` picks one of the twelve 3 × 3
//   squares of the digits 1–3 (each once in every row and column), `layout` one of the cage
//   layouts in CAGE_LAYOUTS, and `givens` how many cells are shown (the first of GIVEN_ORDER).
//   Accepted only when exactly one square fits the cage sums and the givens (`cageSolutions`).
// - cage-sum (balance): one cage of that puzzle on the balance, its other cells known: the child
//   finds the last box (x + y + _ = sum).
// - digit-cards (PUZ.06, order): `count` (2 or 3) different digit cards 1–9 (`d1`, `d2`, `d3`);
//   the child lines them up to make the biggest (`want: biggest`, the biggest digit first) or the
//   smallest number. number-pad: the cards are named in the prompt and the child types the number.
// - clues (PUZ.07, hundred-chart find or number-pad): a mystery number from two or three clues,
//   each needed (CLUE_SETS). `fives`: it has `t` tens, it is odd, you say it counting by fives
//   (10t + 5). `near`: it is more than n − 2, less than n + 2, and odd or even (n).

import type {
  BalanceSide,
  LessonStep,
  ParamValues,
  ResponseValue,
  StimulusSpec,
} from '@number-island/shared';
import type { Rng } from '../../rng';
import { asNum, asStr } from '../common';

// ---------- cage-sum ----------

type Cell = [number, number];

/** Every 3 × 3 square of the digits 1–3 with each digit once in every row and column (12). */
export const SQUARES3: readonly (readonly (readonly number[])[])[] = (() => {
  const perms = [
    [1, 2, 3],
    [1, 3, 2],
    [2, 1, 3],
    [2, 3, 1],
    [3, 1, 2],
    [3, 2, 1],
  ];
  const out: number[][][] = [];
  for (const a of perms)
    for (const b of perms)
      for (const c of perms) {
        const cols = [0, 1, 2].every((j) => new Set([a[j], b[j], c[j]]).size === 3);
        if (cols) out.push([a, b, c]);
      }
  return out;
})();

/**
 * Cage layouts of the 3 × 3 grid, a letter per cell in reading order. Every cage touches, has 2
 * or 3 cells, and no cage is a whole row or column (its sum would always be 6 and tell nothing).
 */
export const CAGE_LAYOUTS: readonly string[] = [
  'AABCDBCDD',
  'ABBACCDDC',
  'AABCABCDD',
  'ABBAACDDC',
  'AABCBBCDD',
];
/** The cells shown when `givens` > 0, in order. */
export const GIVEN_ORDER: readonly Cell[] = [
  [1, 1],
  [0, 0],
  [2, 2],
];
export const CAGE_GIVENS_MAX = GIVEN_ORDER.length;

export function cagesOf(layout: string): Map<string, Cell[]> {
  const out = new Map<string, Cell[]>();
  [...layout].forEach((id, i) => {
    out.set(id, [...(out.get(id) ?? []), [Math.floor(i / 3), i % 3]]);
  });
  return out;
}

const cageSum = (sq: readonly (readonly number[])[], cells: readonly Cell[]) =>
  cells.reduce((s, [r, c]) => s + (sq[r]?.[c] ?? 0), 0);

/** The squares that fit a layout's cage sums (from `square`) and its first `givens` cells. */
export function cageSolutions(squareIdx: number, layout: string, givens: number): number[] {
  const sq = SQUARES3[squareIdx];
  if (!sq) return [];
  const cages = [...cagesOf(layout).values()];
  const shown = GIVEN_ORDER.slice(0, givens);
  return SQUARES3.flatMap((other, k) =>
    cages.every((cells) => cageSum(other, cells) === cageSum(sq, cells)) &&
    shown.every(([r, c]) => other[r]?.[c] === sq[r]?.[c])
      ? [k]
      : [],
  );
}

/** The cage the balance shows: the first cage with two cells (a balance side holds two values). */
export function balanceCage(layout: string): Cell[] {
  const cages = [...cagesOf(layout).values()];
  return cages.find((c) => c.length === 2) as Cell[];
}

function cageValid(p: ParamValues, format: string): boolean {
  const square = asNum(p.square);
  const layout = CAGE_LAYOUTS[asNum(p.layout)];
  const givens = asNum(p.givens);
  if (!layout || !SQUARES3[square] || givens < 0 || givens > CAGE_GIVENS_MAX) return false;
  if (format === 'balance') return true;
  if (format !== 'puzzle-grid') return false;
  return cageSolutions(square, layout, givens).length === 1;
}

// ---------- digit cards ----------

export const digitsOf = (p: ParamValues): number[] =>
  [asNum(p.d1), asNum(p.d2), asNum(p.d3)].slice(0, asNum(p.count, 3));

/** The digits in the order that makes the wanted number: biggest first for the biggest. */
export function digitOrder(p: ParamValues): number[] {
  const ds = [...digitsOf(p)];
  return asStr(p.want, 'biggest') === 'smallest' ? ds.sort((a, b) => a - b) : ds.sort((a, b) => b - a);
}

export const numberOf = (ds: readonly number[]): number => ds.reduce((n, d) => 10 * n + d, 0);

function digitsValid(p: ParamValues, format: string): boolean {
  const ds = digitsOf(p);
  const count = asNum(p.count, 3);
  if (count !== 2 && count !== 3) return false;
  if (!ds.every((d) => Number.isInteger(d) && d >= 1 && d <= 9)) return false;
  if (new Set(ds).size !== ds.length) return false;
  return format === 'order' || format === 'number-pad';
}

// ---------- clues ----------

export const CLUE_SETS = ['fives', 'near'] as const;
export type ClueSet = (typeof CLUE_SETS)[number];

/** The mystery number of a clue puzzle. */
export function mystery(p: ParamValues): number {
  return asStr(p.clues) === 'fives' ? 10 * asNum(p.t) + 5 : asNum(p.n);
}

/** Each clue as a test over a candidate (1–100), in the order the prompt says them. */
export function clueTests(p: ParamValues): ((k: number) => boolean)[] {
  const n = mystery(p);
  const odd = n % 2 === 1;
  if (asStr(p.clues) === 'fives') {
    const t = asNum(p.t);
    return [(k) => Math.floor(k / 10) === t && k < 100, (k) => k % 2 === 1, (k) => k % 5 === 0];
  }
  return [(k) => k > n - 2, (k) => k < n + 2, (k) => k % 2 === (odd ? 1 : 0)];
}

/** The numbers 1–100 that pass every clue but the `skip`-th (none skipped: −1). */
export function clueCandidates(p: ParamValues, skip = -1): number[] {
  const tests = clueTests(p).filter((_, i) => i !== skip);
  return Array.from({ length: 100 }, (_, i) => i + 1).filter((k) => tests.every((f) => f(k)));
}

function cluesValid(p: ParamValues, format: string): boolean {
  if (format !== 'hundred-chart' && format !== 'number-pad') return false;
  const set = asStr(p.clues);
  if (set === 'fives' && !(asNum(p.t) >= 1 && asNum(p.t) <= 9)) return false;
  if (set === 'near' && !(asNum(p.n) >= 12 && asNum(p.n) <= 98)) return false;
  if (set !== 'fives' && set !== 'near') return false;
  // One number fits, and every clue is needed: without any one of them, more than one fits.
  const all = clueCandidates(p);
  if (all.length !== 1 || all[0] !== mystery(p)) return false;
  return clueTests(p).every((_, i) => clueCandidates(p, i).length > 1);
}

// ---------- dispatch ----------

export const K02_VARIANTS = ['cage-sum', 'digit-cards', 'clues'] as const;
export type K02Variant = (typeof K02_VARIANTS)[number];
export const isK02Variant = (v: string): v is K02Variant =>
  (K02_VARIANTS as readonly string[]).includes(v);

export function k02Accepts(p: ParamValues, format: string): boolean {
  switch (asStr(p.variant)) {
    case 'cage-sum':
      return cageValid(p, format);
    case 'digit-cards':
      return digitsValid(p, format);
    case 'clues':
      return cluesValid(p, format);
    default:
      return false;
  }
}

export interface K02Build {
  vars: Record<string, string | number>;
  math: Record<string, number>;
  // biome-ignore lint/suspicious/noExplicitAny: the widget union is checked by `finish`.
  widget: any;
  // biome-ignore lint/suspicious/noExplicitAny: the answer union is checked by `finish`.
  answer: any;
}

const grid3 = (sq: readonly (readonly number[])[]) => sq.map((row) => [...row]);

export function k02Build(p: ParamValues, format: string, rng: Rng): K02Build {
  const variant = asStr(p.variant);
  if (variant === 'cage-sum') {
    const sq = SQUARES3[asNum(p.square)] as readonly (readonly number[])[];
    const layout = CAGE_LAYOUTS[asNum(p.layout)] as string;
    const cages = cagesOf(layout);
    if (format === 'balance') {
      const cells = balanceCage(layout);
      const known = cells.slice(0, -1).map(([r, c]) => sq[r]?.[c] as number);
      const [lr, lc] = cells[cells.length - 1] as Cell;
      const sum = cageSum(sq, cells);
      const left: BalanceSide['terms'] = [];
      known.forEach((v, i) => {
        if (i > 0) left.push({ op: '+' });
        left.push({ n: v });
      });
      left.push({ op: '+' }, { blank: 'x' });
      return {
        vars: { sum, cells: cells.length },
        math: { cageSum: sum > 4 ? 1 : 0 },
        widget: {
          format: 'balance',
          left: { terms: left },
          right: { terms: [{ n: sum }] },
          mode: 'fill-blank',
          showTilt: false,
        },
        answer: { kind: 'number', value: sq[lr]?.[lc] as number },
      };
    }
    const givens = asNum(p.givens);
    const shown = new Set(GIVEN_ORDER.slice(0, givens).map(([r, c]) => `${r},${c}`));
    const cells = [...layout].map((id, i) => {
      const r = Math.floor(i / 3);
      const c = i % 3;
      return shown.has(`${r},${c}`)
        ? { r, c, given: sq[r]?.[c] as number, cage: id }
        : { r, c, blank: true, cage: id };
    });
    const constraints = [
      ...[...cages].map(([id, cs]) => ({ kind: 'cage-sum' as const, cage: id, sum: cageSum(sq, cs) })),
      { kind: 'row-unique' as const },
      { kind: 'col-unique' as const },
    ];
    const palette = [1, 2, 3];
    return {
      vars: {},
      math: { blanks: 9 - givens, constraints: constraints.length },
      widget: {
        format: 'puzzle-grid',
        variant: 'cage-sum',
        rows: 3,
        cols: 3,
        cells,
        constraints,
        palette,
        uniqueSolution: true,
      },
      answer: {
        kind: 'state',
        checker: 'puzzle.satisfies',
        target: { variant: 'cage-sum', rows: 3, cols: 3, cells, constraints, palette },
      },
    };
  }
  if (variant === 'digit-cards') {
    const ds = digitsOf(p);
    const order = digitOrder(p);
    const want = asStr(p.want, 'biggest');
    const named = { x: ds[0] as number, y: ds[1] as number, z: (ds[2] ?? 0) as number };
    if (format === 'order') {
      const cards = rng.fork('layout').shuffle(ds.map((d, i) => ({ id: `card-${i}`, value: d })));
      return {
        vars: {},
        math: { items: Math.max(0, ds.length - 3), three: ds.length === 3 ? 1 : 0 },
        widget: { format: 'order', items: cards, direction: want === 'smallest' ? 'asc' : 'desc' },
        answer: { kind: 'numbers', values: order, ordered: true },
      };
    }
    return {
      vars: named,
      math: { three: ds.length === 3 ? 1 : 0 },
      widget: {
        format: 'number-pad',
        stimulus: { kind: 'none' } as StimulusSpec,
        blanks: [{ id: 'x', maxDigits: ds.length }],
      },
      answer: { kind: 'number', value: numberOf(order) },
    };
  }
  // clues
  const n = mystery(p);
  const vars = {
    t: asNum(p.t),
    lo: n - 2,
    hi: n + 2,
    par: n % 2 === 1 ? 'odd' : 'even',
  };
  const math = { threeClues: 1, near: asStr(p.clues) === 'near' ? 1 : 0, big: n > 50 ? 1 : 0 };
  if (format === 'hundred-chart') {
    return {
      vars,
      math,
      widget: { format: 'hundred-chart', first: 1, rows: 10, hidden: [], mode: 'find' },
      answer: { kind: 'number', value: n },
    };
  }
  return {
    vars,
    math,
    widget: {
      format: 'number-pad',
      stimulus: { kind: 'none' } as StimulusSpec,
      blanks: [{ id: 'x', maxDigits: 2 }],
    },
    answer: { kind: 'number', value: n },
  };
}

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

/** The solved 3 × 3 grid of a cage puzzle. */
export function cageFill(p: ParamValues): number[][] {
  return grid3(SQUARES3[asNum(p.square)] as readonly (readonly number[])[]);
}

/**
 * The cage puzzle's fill order: repeatedly the first cage with one empty box (its sum gives it),
 * else the first row or column with one empty box (it needs the digit missing there).
 */
export function cageOrder(
  p: ParamValues,
): { cell: Cell; by: 'cage' | 'line' | 'try'; id: string }[] {
  const layout = CAGE_LAYOUTS[asNum(p.layout)] as string;
  const cages = [...cagesOf(layout)];
  const known = new Set(GIVEN_ORDER.slice(0, asNum(p.givens)).map(([r, c]) => `${r},${c}`));
  const out: { cell: Cell; by: 'cage' | 'line' | 'try'; id: string }[] = [];
  const open = (cells: Cell[]) => cells.filter(([r, c]) => !known.has(`${r},${c}`));
  const lines: [string, Cell[]][] = [0, 1, 2].flatMap((i) => [
    [`row${i}`, [0, 1, 2].map((j) => [i, j] as Cell)] as [string, Cell[]],
    [`col${i}`, [0, 1, 2].map((j) => [j, i] as Cell)] as [string, Cell[]],
  ]);
  while (known.size < 9) {
    const cage = cages.find(([, cs]) => open(cs).length === 1);
    const line = cage ? undefined : lines.find(([, cs]) => open(cs).length === 1);
    const pick = cage ?? line;
    if (!pick) {
      // No cage or line has one empty box left: start with the first empty box of the first cage
      // (the solution knows its digit; the child tries one and checks its row, column and cage).
      const first = cages.find(([, cs]) => open(cs).length > 0) as [string, Cell[]];
      const cell = open(first[1])[0] as Cell;
      known.add(`${cell[0]},${cell[1]}`);
      out.push({ cell, by: 'try', id: first[0] });
      continue;
    }
    const cell = open(pick[1])[0] as Cell;
    known.add(`${cell[0]},${cell[1]}`);
    out.push({ cell, by: cage ? 'cage' : 'line', id: pick[0] });
  }
  return out;
}

export function k02Solution(
  p: ParamValues,
  // biome-ignore lint/suspicious/noExplicitAny: a built widget config.
  w: any,
  answer: number | number[] | null,
): LessonStep[] {
  const variant = asStr(p.variant);
  if (variant === 'cage-sum' && w.format === 'puzzle-grid') {
    const fill = cageFill(p);
    const order = cageOrder(p);
    const steps: LessonStep[] = [say('gen.puzzle.grid.cage-look', {})];
    for (const { cell, by, id } of order) {
      const [r, c] = cell;
      const v = fill[r]?.[c] as number;
      steps.push(
        by === 'cage'
          ? say('gen.puzzle.grid.cage-one', {}, { op: 'highlight-cage', args: { id } })
          : by === 'line'
            ? say('gen.puzzle.grid.cage-line', {})
            : say('gen.puzzle.grid.cage-try', {}, { op: 'highlight-cage', args: { id } }),
        say('gen.puzzle.grid.cage-fill', { n: v }, { op: 'fill', args: { r, c, value: v } }),
      );
    }
    return steps;
  }
  if (variant === 'cage-sum') {
    const v = typeof answer === 'number' ? answer : 0;
    return [
      say('gen.puzzle.grid.cage-balance', {}),
      say('gen.puzzle.grid.cage-fill', { n: v }, { op: 'answer', args: { value: v } }),
    ];
  }
  if (variant === 'digit-cards') {
    const order = digitOrder(p);
    const want = asStr(p.want, 'biggest');
    const first = say(want === 'smallest' ? 'gen.puzzle.grid.digits-small' : 'gen.puzzle.grid.digits-big', {});
    if (w.format === 'order') {
      const ids = order.map((d) => (w.items as { id: string; value: number }[]).find((x) => x.value === d)?.id);
      return [
        first,
        ...ids.map((id, slot) => say('gen.puzzle.grid.digits-next', {}, { op: 'drag', args: { id, slot } })),
      ];
    }
    const n = numberOf(order);
    return [
      first,
      say('gen.puzzle.grid.digits-make', { n }, { op: 'type', args: { blank: 'x', value: n } }),
    ];
  }
  const n = mystery(p);
  return [
    say('gen.puzzle.grid.clues-check', {}),
    w.format === 'hundred-chart'
      ? say('gen.puzzle.grid.clues-it', { n }, { op: 'tap', args: { n } })
      : say('gen.puzzle.grid.clues-it', { n }, { op: 'type', args: { blank: 'x', value: n } }),
  ];
}

export function k02Example(p: ParamValues): ResponseValue | null {
  if (asStr(p.variant) === 'cage-sum') {
    return { kind: 'state', value: { fill: cageFill(p) } };
  }
  return null;
}

export const K02_NARRATION = [
  'gen.puzzle.grid.cage-look',
  'gen.puzzle.grid.cage-one',
  'gen.puzzle.grid.cage-line',
  'gen.puzzle.grid.cage-try',
  'gen.puzzle.grid.cage-fill',
  'gen.puzzle.grid.cage-balance',
  'gen.puzzle.grid.digits-big',
  'gen.puzzle.grid.digits-small',
  'gen.puzzle.grid.digits-next',
  'gen.puzzle.grid.digits-make',
  'gen.puzzle.grid.clues-check',
  'gen.puzzle.grid.clues-it',
];
