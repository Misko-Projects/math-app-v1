// puzzle.grid (03 §5.6): number puzzles (PUZ.01, PUZ.02) and all the ways to make a number
// (CPS.06). `variant` picks the puzzle; every number in it comes from the params, and layout
// randomness only picks which cells are blank and how a path winds.
// - number-path (puzzle-grid): `rows` × `cols` cells on a snake path counting up by one from
//   `start`; `blanks` of them are blank (puzzle.satisfies, adjacent-step 1; unique solution).
// - number-path (hundred-chart `fill`): a puzzle piece (`piece` at cell `at`) is cut out of the
//   hundred chart; the child fills its numbers (numbers, reading order).
// - sum-triangle (puzzle-grid): corners `a` (top), `b` (bottom left) and `c` (bottom right), and a
//   middle on each side, so every side adds up to `sum`; `blankSet` names the blank cells, always
//   solvable one side at a time (unique solution).
// - sum-triangle (number-bond): one side as a bond: the whole is `sum`, one part the two corners
//   `a` + `b` together, and the child finds the middle.
// - all-ways (puzzle-grid): a row for every way to make `whole` from two non-zero parts
//   (turn-arounds once); the child fills them all, in any order. all-ways (order): every way as a
//   picture of two groups (turn-arounds included); the child orders them by the first group.
// K01 builds puzzle-grid, hundred-chart, number-bond and order.

import type { LessonStep, ParamValues, ResponseValue, StimulusSpec } from '@number-island/shared';
import type { Rng } from '../../rng';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  layoutSeed,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const VARIANTS = ['number-path', 'sum-triangle', 'all-ways'] as const;
const BLANK_SETS = ['two-middles', 'middles', 'corner-middle', 'chain'] as const;

type Cell = [number, number];

/** Hundred-chart puzzle pieces: [row, column] offsets from the anchor cell. */
export const PIECES: Readonly<Record<string, readonly Cell[]>> = {
  bar: [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  column: [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  corner: [
    [0, 0],
    [1, 0],
    [1, 1],
  ],
  square: [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ],
  tee: [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 1],
  ],
  plus: [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, 2],
    [2, 1],
  ],
};

/** The hundred-chart cells (1–99) of a piece anchored at `at`, ascending; null when it does not fit. */
export function pieceCells(piece: string, at: number): number[] | null {
  const offsets = PIECES[piece];
  if (!offsets || at < 1) return null;
  const row = Math.floor((at - 1) / 10);
  const col = (at - 1) % 10;
  const out: number[] = [];
  for (const [dr, dc] of offsets) {
    if (col + dc > 9) return null;
    const n = (row + dr) * 10 + col + dc + 1;
    if (n > 99) return null;
    out.push(n);
  }
  return out.sort((x, y) => x - y);
}

// ---------- sum triangle ----------

/** The six sum-triangle cells on a 3 × 5 grid. */
export const TRIANGLE: Readonly<Record<'T' | 'L' | 'R' | 'BL' | 'B' | 'BR', Cell>> = {
  T: [0, 2],
  L: [1, 1],
  R: [1, 3],
  BL: [2, 0],
  B: [2, 2],
  BR: [2, 4],
};
type Spot = keyof typeof TRIANGLE;
const SIDES: readonly (readonly Spot[])[] = [
  ['T', 'L', 'BL'],
  ['T', 'R', 'BR'],
  ['BL', 'B', 'BR'],
];
/** The blank cells of each blank set; each is solvable one side at a time. */
export const BLANKS: Readonly<Record<string, readonly Spot[]>> = {
  'two-middles': ['L', 'R'],
  middles: ['L', 'R', 'B'],
  'corner-middle': ['T', 'B'],
  chain: ['T', 'L', 'B'],
};
/** Blank sets where a corner is blank: it is found from a side first, then used on another. */
const CHAINED = new Set(['corner-middle', 'chain']);

export function triangleValues(p: ParamValues): Record<Spot, number> {
  const a = asNum(p.a);
  const b = asNum(p.b);
  const c = asNum(p.c);
  const s = asNum(p.sum);
  return { T: a, BL: b, BR: c, L: s - a - b, R: s - a - c, B: s - b - c };
}

/** Whether repeatedly solving a side with one blank fills every blank. */
export function solvesBySides(blanks: readonly Spot[]): boolean {
  const open = new Set(blanks);
  let progress = true;
  while (open.size > 0 && progress) {
    progress = false;
    for (const side of SIDES) {
      const unknown = side.filter((s) => open.has(s));
      if (unknown.length === 1) {
        open.delete(unknown[0] as Spot);
        progress = true;
      }
    }
  }
  return open.size === 0;
}

// ---------- number path ----------

/** A snake path through every cell of a rows × cols grid, from a corner, by rows or by columns. */
export function snakePath(rows: number, cols: number, rng: Rng): Cell[] {
  const byRows = rng.bool(0.5);
  const flipR = rng.bool(0.5);
  const flipC = rng.bool(0.5);
  const out: Cell[] = [];
  const [outer, inner] = byRows ? [rows, cols] : [cols, rows];
  for (let i = 0; i < outer; i += 1) {
    for (let k = 0; k < inner; k += 1) {
      const j = i % 2 === 0 ? k : inner - 1 - k;
      let r = byRows ? i : j;
      let c = byRows ? j : i;
      if (flipR) r = rows - 1 - r;
      if (flipC) c = cols - 1 - c;
      out.push([r, c]);
    }
  }
  return out;
}

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

/** A rows × cols response grid: '' everywhere but the given cells. */
function grid(rows: number, cols: number, cells: [number, number, number][]): (number | '')[][] {
  const g: (number | '')[][] = Array.from({ length: rows }, () =>
    new Array<number | ''>(cols).fill(''),
  );
  for (const [r, c, v] of cells) (g[r] as (number | '')[])[c] = v;
  return g;
}

const waysOf = (whole: number): [number, number][] =>
  Array.from({ length: Math.floor(whole / 2) }, (_, i) => [i + 1, whole - i - 1]);

export const puzzleGrid: GeneratorDef = {
  id: 'puzzle.grid',
  formats: ['puzzle-grid', 'hundred-chart', 'number-bond', 'order'],
  params: {
    variant: {
      type: 'string',
      values: [...VARIANTS],
      default: { kind: 'choice', values: [...VARIANTS] },
      doc: 'number-path, sum-triangle or all-ways',
    },
    rows: {
      type: 'int',
      default: { kind: 'int', min: 2, max: 3 },
      doc: 'number-path: grid rows',
    },
    cols: {
      type: 'int',
      default: { kind: 'int', min: 3, max: 4 },
      doc: 'number-path: grid columns',
    },
    start: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 80 },
      doc: 'number-path: the first number on the path',
    },
    blanks: {
      type: 'int',
      default: { kind: 'int', min: 3, max: 5 },
      doc: 'number-path: blank cells (at least two cells stay given)',
    },
    piece: {
      type: 'string',
      values: Object.keys(PIECES),
      default: { kind: 'choice', values: Object.keys(PIECES) },
      doc: 'number-path on the hundred chart: the puzzle piece cut out',
    },
    at: {
      type: 'int',
      default: { kind: 'int', min: 11, max: 78 },
      doc: 'number-path on the hundred chart: the anchor cell of the piece',
    },
    a: { type: 'int', default: { kind: 'int', min: 1, max: 6 }, doc: 'sum-triangle: top corner' },
    b: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 6 },
      doc: 'sum-triangle: bottom-left corner',
    },
    c: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 6 },
      doc: 'sum-triangle: bottom-right corner',
    },
    sum: {
      type: 'int',
      default: { kind: 'int', min: 7, max: 15 },
      doc: 'sum-triangle: what every side adds up to',
    },
    blankSet: {
      type: 'string',
      values: [...BLANK_SETS],
      default: { kind: 'choice', values: [...BLANK_SETS] },
      doc: 'sum-triangle: the blank cells (two-middles, middles, corner-middle, chain)',
    },
    whole: {
      type: 'int',
      default: { kind: 'int', min: 4, max: 7 },
      doc: 'all-ways: the number to make',
    },
  },
  derived: ['middle', 'ways'],
  features: {
    blanks: { weight: 0.2, doc: 'puzzle-grid format feature (03 §5.5): each blank cell' },
    constraints: { weight: 0.15, doc: 'puzzle-grid format feature (03 §5.5): each constraint' },
    multipleSolutions: {
      weight: -0.3,
      doc: 'puzzle-grid format feature (03 §5.5): more than one solution (all-ways rows in any order)',
    },
    chain: { weight: 0.4, doc: 'sum-triangle: a blank corner must be found before its other side' },
    crossDecade: { weight: 0.3, doc: 'number-path: the path counts past a ten' },
    'rows.over1': { weight: 0.3, doc: 'hundred-chart piece: it spans more than one row' },
    'sum.over10': { weight: 0.3, doc: 'sum-triangle: the sides add up to more than 10' },
    items: { weight: 0.3, doc: 'order format feature (03 §5.5): card count − 3' },
  },
  narration: [
    'gen.puzzle.grid.path-look',
    'gen.puzzle.grid.path-fill',
    'gen.puzzle.grid.side',
    'gen.puzzle.grid.side-fill',
    'gen.puzzle.grid.ways-start',
    'gen.puzzle.grid.ways-next',
    'gen.puzzle.grid.ways-rest',
    'gen.puzzle.grid.piece',
    'gen.puzzle.grid.piece-fill',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive(p) {
    const v = triangleValues(p);
    return { middle: v.L, ways: Math.floor(asNum(p.whole) / 2) };
  },
  accepts(p, t) {
    const variant = asStr(p.variant);
    if (variant === 'number-path') {
      if (t.format === 'hundred-chart') return pieceCells(asStr(p.piece), asNum(p.at)) !== null;
      if (t.format !== 'puzzle-grid') return false;
      const cells = asNum(p.rows) * asNum(p.cols);
      const start = asNum(p.start);
      return (
        asNum(p.rows) >= 1 &&
        asNum(p.cols) >= 2 &&
        asNum(p.blanks) >= 1 &&
        asNum(p.blanks) <= cells - 2 &&
        start >= 0 &&
        start + cells - 1 <= 100
      );
    }
    if (variant === 'sum-triangle') {
      const v = triangleValues(p);
      if (!Object.values(v).every((x) => x >= 1 && x <= 9)) return false;
      if (t.format === 'number-bond') return true;
      return t.format === 'puzzle-grid' && solvesBySides(BLANKS[asStr(p.blankSet)] ?? []);
    }
    if (variant === 'all-ways') {
      const whole = asNum(p.whole);
      if (t.format === 'order') return whole >= 3 && whole <= 7;
      return t.format === 'puzzle-grid' && whole >= 4 && whole <= 10;
    }
    return false;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const variant = asStr(params.variant);
    let p: PartialOutput;
    if (variant === 'number-path' && t.format === 'hundred-chart') {
      const piece = asStr(params.piece);
      const hidden = pieceCells(piece, asNum(params.at)) ?? [];
      const rowsSpanned = new Set(hidden.map((n) => Math.floor((n - 1) / 10))).size;
      p = {
        params,
        vars: pickVars(t, {}),
        math: { 'rows.over1': rowsSpanned > 1 ? 1 : 0 },
        widget: { format: 'hundred-chart', first: 1, rows: 10, hidden, mode: 'fill' },
        answer: { kind: 'numbers', values: hidden, ordered: true },
      };
      return finish(puzzleGrid, ctx, p);
    }
    if (variant === 'number-path') {
      const rows = asNum(params.rows);
      const cols = asNum(params.cols);
      const start = asNum(params.start);
      const blanks = asNum(params.blanks);
      const path = snakePath(rows, cols, rng.fork('path'));
      const blankIdx = new Set(
        rng
          .fork('blanks')
          .shuffle(path.map((_, i) => i))
          .slice(0, blanks),
      );
      const values = path.map((_, i) => start + i);
      const last = start + path.length - 1;
      const givens = path.flatMap(([r, c], i) =>
        blankIdx.has(i) ? [] : [[r, c, values[i] as number] as [number, number, number]],
      );
      p = {
        params,
        vars: pickVars(t, {}),
        math: {
          blanks,
          constraints: 1,
          crossDecade: Math.floor(start / 10) !== Math.floor(last / 10) && last % 10 !== 0 ? 1 : 0,
        },
        widget: {
          format: 'puzzle-grid',
          variant: 'number-path',
          rows,
          cols,
          cells: path.map(([r, c], i) =>
            blankIdx.has(i) ? { r, c, blank: true } : { r, c, given: values[i] as number },
          ),
          constraints: [{ kind: 'adjacent-step', step: 1 }],
          palette: [],
          uniqueSolution: true,
        },
        answer: {
          kind: 'state',
          checker: 'puzzle.satisfies',
          target: {
            variant: 'number-path',
            rows,
            cols,
            cells: path,
            givens,
            constraints: [{ kind: 'adjacent-step', step: 1 }],
            palette: [],
          },
        },
      };
      return finish(puzzleGrid, ctx, p);
    }
    if (variant === 'sum-triangle') {
      const v = triangleValues(params);
      const sum = asNum(params.sum);
      if (t.format === 'number-bond') {
        const ab = asNum(params.a) + asNum(params.b);
        p = {
          params,
          vars: pickVars(t, { a: asNum(params.a), b: asNum(params.b), ab, sum }),
          math: { 'sum.over10': sum > 10 ? 1 : 0 },
          widget: {
            format: 'number-bond',
            whole: sum,
            parts: [ab, null],
            mode: 'missing-part',
            counters: false,
            nonZero: false,
          },
          answer: { kind: 'number', value: v.L },
          nudge: [{ op: 'highlight', args: { slot: 'part-1' } }],
        };
        return finish(puzzleGrid, ctx, p);
      }
      const blankSet = asStr(params.blankSet);
      const blank = new Set(BLANKS[blankSet] ?? []);
      const spots = Object.keys(TRIANGLE) as Spot[];
      const constraints = SIDES.map((side) => ({
        kind: 'line-sum' as const,
        cells: side.map((s) => [...TRIANGLE[s]] as [number, number]),
        sum,
      }));
      const palette = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      p = {
        params,
        vars: pickVars(t, { sum }),
        math: {
          blanks: blank.size,
          constraints: 3,
          chain: CHAINED.has(blankSet) ? 1 : 0,
          'sum.over10': sum > 10 ? 1 : 0,
        },
        widget: {
          format: 'puzzle-grid',
          variant: 'sum-triangle',
          rows: 3,
          cols: 5,
          cells: spots.map((s) => {
            const [r, c] = TRIANGLE[s];
            return blank.has(s) ? { r, c, blank: true } : { r, c, given: v[s] };
          }),
          constraints,
          palette,
          uniqueSolution: true,
        },
        answer: {
          kind: 'state',
          checker: 'puzzle.satisfies',
          target: {
            variant: 'sum-triangle',
            rows: 3,
            cols: 5,
            cells: spots.map((s) => [...TRIANGLE[s]]),
            givens: spots.filter((s) => !blank.has(s)).map((s) => [...TRIANGLE[s], v[s]]),
            constraints,
            palette,
          },
        },
      };
      return finish(puzzleGrid, ctx, p);
    }
    // all-ways
    const whole = asNum(params.whole);
    if (t.format === 'order') {
      const seed = layoutSeed(rng);
      const firsts = rng.fork('layout').shuffle(Array.from({ length: whole - 1 }, (_, i) => i + 1));
      const items = firsts.map((a, i) => ({
        id: `obj-${i}`,
        value: a,
        stimulus: {
          kind: 'objects',
          set: {
            count: whole,
            sprite: 'shell',
            layout: 'groups',
            groups: [a, whole - a],
            layoutSeed: seed,
          },
        } as StimulusSpec,
      }));
      p = {
        params,
        vars: pickVars(t, { whole }),
        math: { items: Math.max(0, whole - 1 - 3) },
        widget: { format: 'order', items, direction: 'asc' },
        answer: {
          kind: 'numbers',
          values: Array.from({ length: whole - 1 }, (_, i) => i + 1),
          ordered: true,
        },
      };
      return finish(puzzleGrid, ctx, p);
    }
    const ways = waysOf(whole);
    const cells: Cell[] = ways.flatMap((_, r) => [
      [r, 0],
      [r, 1],
    ]);
    const constraints = ways.map((_, r) => ({
      kind: 'line-sum' as const,
      cells: [
        [r, 0],
        [r, 1],
      ] as [number, number][],
      sum: whole,
    }));
    const palette = Array.from({ length: whole - 1 }, (_, i) => i + 1);
    p = {
      params,
      vars: pickVars(t, { whole }),
      math: { blanks: cells.length, constraints: constraints.length, multipleSolutions: 1 },
      widget: {
        format: 'puzzle-grid',
        variant: 'all-ways',
        rows: ways.length,
        cols: 2,
        cells: cells.map(([r, c]) => ({ r, c, blank: true })),
        constraints,
        palette,
        uniqueSolution: false,
      },
      answer: {
        kind: 'state',
        checker: 'puzzle.satisfies',
        target: {
          variant: 'all-ways',
          rows: ways.length,
          cols: 2,
          cells,
          givens: [],
          constraints,
          palette,
          nonZero: true,
        },
      },
    };
    return finish(puzzleGrid, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind !== 'state') return correctFromAnswer(a);
    return { kind: 'state', value: { fill: solvedFill(out) } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    if (w.format === 'hundred-chart') {
      return [
        say('gen.puzzle.grid.piece', {}, { op: 'highlight-row', args: { n: 0 } }),
        say('gen.puzzle.grid.piece-fill', {}, { op: 'answer', args: { values: [...w.hidden] } }),
      ];
    }
    if (w.format === 'number-bond') {
      const v = out.answer.kind === 'number' ? out.answer.value : 0;
      return [
        say('gen.puzzle.grid.side', {}, { op: 'highlight', args: { slot: 'part-0' } }),
        say(
          'gen.puzzle.grid.side-fill',
          { n: v },
          { op: 'fill', args: { slot: 'part-1', value: v } },
        ),
      ];
    }
    if (w.format === 'order') {
      const sorted = [...w.items].sort((x, y) => x.value - y.value);
      return [
        say('gen.puzzle.grid.ways-start', {}),
        ...sorted.map((it, slot) =>
          say('gen.puzzle.grid.ways-next', {}, { op: 'drag', args: { id: it.id, slot } }),
        ),
      ];
    }
    if (w.format !== 'puzzle-grid') return [];
    const fill = solvedFill(out);
    const put = ([r, c]: Cell, line: string, vars: Record<string, number>): LessonStep =>
      say(line, vars, { op: 'fill', args: { r, c, value: fill[r]?.[c] as number } });
    const valueAt = ([r, c]: Cell): number => fill[r]?.[c] as number;
    if (w.variant === 'sum-triangle') {
      // Dependency order (PR #84 review round 2): name a side with one empty cell, then fill it.
      return triangleOrder(w.cells.filter((x) => x.blank).map((x) => spotAt(x.r, x.c))).flatMap(
        ({ side, spot }) => [
          say('gen.puzzle.grid.side', {}, { op: 'check-line', args: { index: side } }),
          put(TRIANGLE[spot], 'gen.puzzle.grid.side-fill', { n: valueAt(TRIANGLE[spot]) }),
        ],
      );
    }
    if (w.variant === 'number-path') {
      const path = out.answer.kind === 'state' ? (out.answer.target.cells as Cell[]) : [];
      const blank = new Set(w.cells.filter((x) => x.blank).map((x) => `${x.r},${x.c}`));
      const order = pathOrder(path.map(([r, c]) => blank.has(`${r},${c}`)));
      return [
        say('gen.puzzle.grid.path-look', {}),
        ...order.map((i) => {
          const cell = path[i] as Cell;
          return put(cell, 'gen.puzzle.grid.path-fill', { n: valueAt(cell) });
        }),
      ];
    }
    // All ways: a row is one way, so only its first cell starts the next one (PR #84 review).
    return [
      say('gen.puzzle.grid.ways-start', {}),
      ...w.cells
        .filter((x) => x.blank)
        .map(({ r, c }) =>
          put([r, c], c > 0 ? 'gen.puzzle.grid.ways-rest' : 'gen.puzzle.grid.ways-next', {}),
        ),
    ];
  },
};

/** The sum-triangle spot at a grid cell. */
function spotAt(r: number, c: number): Spot {
  const spot = (Object.keys(TRIANGLE) as Spot[]).find(
    (s) => TRIANGLE[s][0] === r && TRIANGLE[s][1] === c,
  );
  if (!spot) throw new Error(`no sum-triangle cell at ${r}, ${c}`);
  return spot;
}

/**
 * The order a sum triangle's blanks are solved in: repeatedly the first side (in `SIDES` order,
 * which is the `line-sum` order) with exactly one blank left, and that blank. Throws when the
 * blanks cannot be solved one side at a time (`accepts` never builds such a puzzle).
 */
export function triangleOrder(blanks: readonly Spot[]): { side: number; spot: Spot }[] {
  const open = new Set(blanks);
  const out: { side: number; spot: Spot }[] = [];
  while (open.size > 0) {
    const side = SIDES.findIndex((s) => s.filter((x) => open.has(x)).length === 1);
    if (side < 0) throw new Error('sum triangle not solvable one side at a time');
    const spot = (SIDES[side] as readonly Spot[]).find((x) => open.has(x)) as Spot;
    open.delete(spot);
    out.push({ side, spot });
  }
  return out;
}

/**
 * The order a number path's blanks are filled in, as path indices: each one next to a known cell.
 * Blanks after a known cell count on in path order; blanks before the first given count back from
 * it (PR #84 review round 2: filling path order put the first cell before the number it comes
 * from).
 */
export function pathOrder(blank: readonly boolean[]): number[] {
  const known = blank.map((b) => !b);
  const out: number[] = [];
  for (;;) {
    let i = known.findIndex((k, j) => !k && j > 0 && known[j - 1]);
    if (i < 0) i = known.findLastIndex((k, j) => !k && j + 1 < known.length && known[j + 1]);
    if (i < 0) break;
    known[i] = true;
    out.push(i);
  }
  if (known.some((k) => !k)) throw new Error('number path has no given cell');
  return out;
}

/** The solved puzzle grid (all-ways: the ways in order, smaller part first). */
function solvedFill(out: GeneratorOutput): (number | '')[][] {
  const w = out.widget;
  if (w.format !== 'puzzle-grid') return [];
  const p = out.params;
  if (w.variant === 'number-path') {
    const target = out.answer.kind === 'state' ? (out.answer.target.cells as Cell[]) : [];
    const start = asNum(p.start);
    return grid(
      w.rows,
      w.cols,
      target.map(([r, c], i) => [r, c, start + i]),
    );
  }
  if (w.variant === 'sum-triangle') {
    const v = triangleValues(p);
    return grid(
      3,
      5,
      (Object.keys(TRIANGLE) as Spot[]).map((s) => [...TRIANGLE[s], v[s]]),
    );
  }
  const whole = asNum(p.whole);
  return grid(
    w.rows,
    2,
    waysOf(whole).flatMap(([x, y], r) => [
      [r, 0, x],
      [r, 1, y],
    ]),
  );
}
