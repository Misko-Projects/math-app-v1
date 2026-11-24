import {
  formatModel,
  PUZZLE_GRID,
  PUZZLE_PALETTE_MAX,
  type PuzzleVariant,
} from '@number-island/engine';
import type { WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  CARD_LEDGE,
  cageLabelPx,
  cellKey,
  GAP,
  MIN_CELL,
  numeralPx,
  planPuzzle,
  puzzleGeometry,
  tagPx,
  trayCards,
  traySize,
} from './layout';

type Config = WidgetConfigOf<'puzzle-grid'>;
type AgeMode = 'k' | 'g1-up';

/** The smallest widget area (906 × 373) inside its card: 3 px border and 24 px padding a side. */
const ROOM = { w: 852, h: 319 };
/** The tablet's (1226 × 493). */
const TABLET = { w: 1172, h: 439 };
/** The compact Check as measured (kit `useActionSize`: the 6 px ledge is included). */
const BUTTON = { 'g1-up': { w: 76, h: 82 }, k: { w: 96, h: 102 } };

const plan = (config: Config, ageMode: AgeMode = 'g1-up', room = ROOM) =>
  planPuzzle({ config, room, button: BUTTON[ageMode], ageMode });
const valid = (c: Config) => {
  const r = formatModel('puzzle-grid')?.configSchema.safeParse(c);
  return r?.success === true ? [] : (r?.error.issues.map((i) => i.message) ?? ['no model']);
};

const numbers = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);
const line = (cells: [number, number][], sum: number) => ({
  kind: 'line-sum' as const,
  cells,
  sum,
});
const blanks = (rows: number, cols: number): Config['cells'] =>
  Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({ r, c, blank: true })),
  ).flat();

/** The largest puzzle of each variant the schema lets through: most rows, columns and cards. */
const LARGEST: Record<PuzzleVariant, Config> = {
  'number-path': {
    format: 'puzzle-grid',
    variant: 'number-path',
    rows: 3,
    cols: 4,
    // A snake by rows: every cell beside the one before it.
    cells: blanks(3, 4)
      .sort((a, b) => a.r - b.r || (a.r % 2 === 0 ? a.c - b.c : b.c - a.c))
      .map((x, i) => (i === 0 ? { r: x.r, c: x.c, given: 86 } : x)),
    constraints: [{ kind: 'adjacent-step', step: 1 }],
    palette: numbers(PUZZLE_PALETTE_MAX, 86),
    uniqueSolution: true,
  },
  'sum-triangle': {
    format: 'puzzle-grid',
    variant: 'sum-triangle',
    rows: 3,
    cols: 5,
    cells: [
      [0, 2],
      [1, 1],
      [1, 3],
      [2, 0],
      [2, 2],
      [2, 4],
    ].map(([r, c]) => ({ r: r as number, c: c as number, blank: true })),
    constraints: [
      line(
        [
          [0, 2],
          [1, 1],
          [2, 0],
        ],
        99,
      ),
      line(
        [
          [0, 2],
          [1, 3],
          [2, 4],
        ],
        99,
      ),
      line(
        [
          [2, 0],
          [2, 2],
          [2, 4],
        ],
        99,
      ),
    ],
    palette: numbers(PUZZLE_PALETTE_MAX, 86),
    uniqueSolution: false,
  },
  'all-ways': {
    format: 'puzzle-grid',
    variant: 'all-ways',
    rows: 5,
    cols: 2,
    cells: blanks(5, 2),
    constraints: Array.from({ length: 5 }, (_, r) =>
      line(
        [
          [r, 0],
          [r, 1],
        ],
        99,
      ),
    ),
    palette: numbers(PUZZLE_PALETTE_MAX, 86),
    uniqueSolution: false,
  },
  'shape-fill': {
    format: 'puzzle-grid',
    variant: 'shape-fill',
    rows: 4,
    cols: 4,
    cells: blanks(4, 4),
    constraints: [
      {
        kind: 'use-each',
        values: [...new Array<string>(4).fill('rectangle'), ...new Array<string>(8).fill('square')],
      },
    ],
    palette: ['square', 'rectangle'],
    uniqueSolution: false,
  },
  'cage-sum': {
    format: 'puzzle-grid',
    variant: 'cage-sum',
    rows: 4,
    cols: 4,
    // Four cages of four boxes, one a row.
    cells: blanks(4, 4).map((x) => ({ ...x, cage: `r${x.r}` })),
    constraints: [
      { kind: 'row-unique' },
      { kind: 'col-unique' },
      ...numbers(4, 0).map((r) => ({ kind: 'cage-sum' as const, cage: `r${r}`, sum: 10 })),
    ],
    palette: [1, 2, 3, 4],
    uniqueSolution: false,
  },
  'magic-square': {
    format: 'puzzle-grid',
    variant: 'magic-square',
    rows: 3,
    cols: 3,
    cells: blanks(3, 3),
    constraints: [
      ...numbers(3, 0).map((r) =>
        line(
          numbers(3, 0).map((c): [number, number] => [r, c]),
          99,
        ),
      ),
      ...numbers(3, 0).map((c) =>
        line(
          numbers(3, 0).map((r): [number, number] => [r, c]),
          99,
        ),
      ),
      line(
        numbers(3, 0).map((i): [number, number] => [i, i]),
        99,
      ),
      line(
        numbers(3, 0).map((i): [number, number] => [i, 2 - i]),
        99,
      ),
    ],
    palette: numbers(PUZZLE_PALETTE_MAX, 86),
    uniqueSolution: false,
  },
  'missing-digit': {
    format: 'puzzle-grid',
    variant: 'missing-digit',
    rows: 3,
    cols: 4,
    cells: blanks(3, 4),
    constraints: [
      ...numbers(3, 0).map((r) =>
        line(
          numbers(4, 0).map((c): [number, number] => [r, c]),
          99,
        ),
      ),
      ...numbers(4, 0).map((c) =>
        line(
          numbers(3, 0).map((r): [number, number] => [r, c]),
          99,
        ),
      ),
    ],
    palette: numbers(PUZZLE_PALETTE_MAX, 86),
    uniqueSolution: false,
  },
};
const VARIANTS = Object.keys(LARGEST) as PuzzleVariant[];

/** Whether two boxes keep `gap` px between them (or do not share a row and a column at all). */
const apart = (
  a: { x: number; y: number; w: number; h: number },
  b: typeof a,
  gap: number,
): boolean =>
  a.x + a.w + gap <= b.x ||
  b.x + b.w + gap <= a.x ||
  a.y + a.h + gap <= b.y ||
  b.y + b.h + gap <= a.y;

describe('puzzle-grid in the smallest area (906 × 373)', () => {
  it('the largest puzzle of every variant is one the schema lets through, at its bounds', () => {
    for (const variant of VARIANTS) {
      const c = LARGEST[variant];
      expect(valid(c), variant).toEqual([]);
      expect(c.rows, variant).toBe(PUZZLE_GRID[variant].rows[1]);
      expect(c.cols, variant).toBe(PUZZLE_GRID[variant].cols[1]);
    }
  });

  it('fits every variant at its largest with boxes and cards of at least 64 px', () => {
    for (const variant of VARIANTS) {
      const p = plan(LARGEST[variant]);
      expect(p.fits, variant).toBe(true);
      expect(p.cell, variant).toBeGreaterThanOrEqual(MIN_CELL);
      expect(p.size.w, variant).toBeLessThanOrEqual(ROOM.w);
      expect(p.size.h, variant).toBeLessThanOrEqual(ROOM.h);
    }
  });

  it('keeps every box 12 px from the next, and every card', () => {
    for (const variant of VARIANTS) {
      const c = LARGEST[variant];
      const p = plan(c);
      const boxes = Object.values(p.geometry.cells);
      expect(boxes, variant).toHaveLength(c.cells.length);
      for (const [i, a] of boxes.entries()) {
        expect(a.w, variant).toBe(p.cell);
        expect(a.h, variant).toBe(p.cell);
        expect(a.x >= 0 && a.y >= 0, variant).toBe(true);
        expect(a.x + a.w <= p.geometry.w && a.y + a.h <= p.geometry.h, variant).toBe(true);
        for (const b of boxes.slice(i + 1)) expect(apart(a, b, GAP), variant).toBe(true);
        for (const tag of p.geometry.tags) expect(apart(a, tag, GAP), variant).toBe(true);
      }
      const tray = traySize(trayCards(c), p.trayCols, p.cell);
      expect(tray.h).toBe(tray.rows * p.cell + (tray.rows - 1) * GAP + CARD_LEDGE);
      expect(tray.w).toBe(p.trayCols * p.cell + (p.trayCols - 1) * GAP);
    }
  });

  it('numerals are at least 32 px, a cage label 24 px, a line sum in a tag of 48 px', () => {
    for (const cell of [MIN_CELL, 70, 80, 104]) {
      expect(numeralPx(cell)).toBeGreaterThanOrEqual(32);
      expect(cageLabelPx(cell)).toBeGreaterThanOrEqual(24);
      expect(tagPx(cell)).toBeGreaterThanOrEqual(48);
      // A cage label over a numeral fits its box (the box's 2 px edges and 3 px of air).
      expect(cageLabelPx(cell) + numeralPx(cell)).toBeLessThanOrEqual(cell - 7);
    }
  });

  it('a 4 × 4 mini-KenKen has 64 px boxes there, and larger ones on the tablet', () => {
    const small = plan(LARGEST['cage-sum']);
    expect(small.cell).toBeGreaterThanOrEqual(64);
    expect(small.cell).toBeLessThan(80);
    expect(cageLabelPx(small.cell)).toBe(24);
    const tablet = plan(LARGEST['cage-sum'], 'g1-up', TABLET);
    expect(tablet.cell).toBeGreaterThan(small.cell);
  });

  it('prints each line sum at the end of its line, clear of the grid', () => {
    const g = puzzleGeometry(LARGEST['magic-square'], 64);
    expect(g.tags).toHaveLength(8);
    const at = (r: number, c: number) => g.cells[cellKey(r, c)] as { x: number; y: number };
    for (const tag of g.tags) {
      if (tag.line.kind === 'row') {
        expect(tag.x).toBeGreaterThan(at(tag.line.index, 2).x + 64);
        expect(tag.y + tag.h / 2).toBe(at(tag.line.index, 2).y + 32);
      } else if (tag.line.kind === 'col') {
        expect(tag.y).toBeGreaterThan(at(2, tag.line.index).y + 64);
        expect(tag.x + tag.w / 2).toBe(at(2, tag.line.index).x + 32);
      } else if (tag.line.kind === 'diagonal') {
        // The diagonal ends at the bottom right, the other one at the bottom left.
        expect(tag.x).toBeGreaterThan(at(2, 2).x + 64);
        expect(tag.y).toBeGreaterThan(at(2, 2).y + 64);
      } else {
        expect(tag.x + tag.w).toBeLessThan(at(2, 0).x);
        expect(tag.y).toBeGreaterThan(at(2, 0).y + 64);
      }
    }
    // No two sums share a place.
    for (const [i, a] of g.tags.entries()) {
      for (const b of g.tags.slice(i + 1)) expect(apart(a, b, 0)).toBe(true);
    }
  });

  it('a sum triangle sets its middles between its corners', () => {
    const g = puzzleGeometry(LARGEST['sum-triangle'], 64);
    const x = (r: number, c: number) => (g.cells[cellKey(r, c)] as { x: number }).x;
    expect(x(1, 1)).toBe((x(0, 2) + x(2, 0)) / 2);
    expect(x(1, 3)).toBe((x(0, 2) + x(2, 4)) / 2);
    expect(x(2, 2)).toBe((x(2, 0) + x(2, 4)) / 2);
  });

  it('the ways to make a number stand one under the other while 64 px boxes allow it', () => {
    const ways = (rows: number): Config => ({
      ...LARGEST['all-ways'],
      rows,
      cells: blanks(rows, 2),
      constraints: LARGEST['all-ways'].constraints.slice(0, rows),
      palette: numbers(2 * rows),
    });
    // Up to three ways (wholes up to 7) are one column; four and five take a second.
    expect([1, 2, 3, 4, 5].map((rows) => plan(ways(rows)).wayCols)).toEqual([1, 1, 1, 2, 2]);
    for (const rows of [1, 2, 3, 4, 5]) expect(plan(ways(rows)).fits, `${rows}`).toBe(true);
    // The tablet has room for four in one column.
    expect(plan(ways(4), 'g1-up', TABLET).wayCols).toBe(1);
    // Column by column: the fourth way starts the second column.
    const g = plan(ways(5)).geometry;
    expect((g.ways[3] as { x: number }).x).toBeGreaterThan((g.ways[2] as { x: number }).x);
    expect((g.ways[3] as { y: number }).y).toBe(0);
  });

  it('in kindergarten mode the shipped shapes fit; boxes are 80 px where 80 px fits', () => {
    const cells: Partial<Record<PuzzleVariant, number>> = {};
    for (const variant of VARIANTS) {
      const p = plan(LARGEST[variant], 'k');
      expect(p.fits, variant).toBe(true);
      expect(p.cell, variant).toBeGreaterThanOrEqual(MIN_CELL);
      cells[variant] = p.cell;
    }
    // A sum triangle keeps 80 px even with the fullest tray; the largest of the others do not
    // (no shipped template of the format is a kindergarten skill).
    expect(cells['sum-triangle']).toBeLessThan(80);
    const nine = { ...LARGEST['sum-triangle'], palette: numbers(9) };
    expect(plan(nine, 'k').cell).toBeGreaterThanOrEqual(80);
  });

  it('a room too small for 64 px boxes gets them anyway and says it does not fit', () => {
    const p = plan(LARGEST['number-path'], 'g1-up', { w: 400, h: 200 });
    expect(p.fits).toBe(false);
    expect(p.cell).toBe(MIN_CELL);
  });

  it('a narrow, tall room puts the puzzle above the tray', () => {
    const p = plan(LARGEST['number-path'], 'g1-up', { w: 480, h: 900 });
    expect(p.fits).toBe(true);
    expect(p.arrangement).toBe('stack');
  });

  it('a smaller room never gets larger boxes', () => {
    // But for the ways to make a number: one column of them comes before larger boxes.
    for (const variant of VARIANTS.filter((v) => v !== 'all-ways')) {
      let last = Number.POSITIVE_INFINITY;
      for (const h of [600, 439, 380, 319, 300]) {
        const p = plan(LARGEST[variant], 'g1-up', { w: ROOM.w, h });
        if (!p.fits) continue;
        expect(p.cell, `${variant} at ${h}`).toBeLessThanOrEqual(last);
        last = p.cell;
      }
    }
  });
});
