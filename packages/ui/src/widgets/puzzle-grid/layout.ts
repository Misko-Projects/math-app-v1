// puzzle-grid layout (U04, #13): pure arithmetic, no DOM. One cell size for the grid's boxes and
// the tray's cards, the largest (up to MAX_CELL) at which the puzzle, the tray and Check fit the
// room side by side, or the puzzle above the tray; never under 64 px (06 §4). Boxes and cards
// stand 12 px apart, numerals are at least 32 px, a cage's label at least 24 px.
//
// What the engine schema bounds (packages/engine/src/formats/puzzle-grid.ts) is what fits the
// smallest play area, 852 × 319 inside (layout.test.ts holds every variant's largest puzzle to it).

import { type PuzzleLine, puzzleLine } from '@number-island/engine';
import { type AgeMode, TARGET_GAP_PX } from '../../tokens/tokens';
import type { ConfigFor } from '../types';

type Config = ConfigFor<'puzzle-grid'>;
export interface Size {
  w: number;
  h: number;
}
export interface Box extends Size {
  x: number;
  y: number;
}

/** Between two boxes, and two cards (06 §4). */
export const GAP = TARGET_GAP_PX;
/** The smallest box and card, in any age mode. */
export const MIN_CELL = 64;
/** The largest: a small puzzle grows to here, no further. */
export const MAX_CELL = 104;
/** Between the puzzle, the tray and Check. */
export const PART_GAP = 24;
/** A card's ledge under it. */
export const CARD_LEDGE = 4;
/** Numerals: half the box, never under 32 px (05 §11). */
export const numeralPx = (cell: number) => Math.max(32, Math.round(cell * 0.5));
/** A cage's label: its sum and sign in the cage's first box, never under 24 px. */
export const cageLabelPx = (cell: number) => Math.max(24, Math.round(cell * 0.36));
/** The sign between the two parts of a way (all-ways): its width, with 8 px either side. */
export const SIGN_W = 24;
const SIGN_PAD = 8;
/** A way's card reaches this far round its two boxes, and two cards stand this far apart. */
export const WAY_PAD = 6;
const WAY_GAP = 8;
/** A shape puzzle's outline and a KenKen's cages are drawn this far round their boxes. */
export const OUTLINE_PAD = 9;
export const CAGE_PAD = 5;
/** The sum printed at the end of a line (magic square, number grid): a tag this large. */
export const tagPx = (cell: number) => Math.max(48, Math.round(cell * 0.75));

export interface SumTag extends Box {
  /** The index of its `line-sum` in `config.constraints`. */
  constraint: number;
  line: PuzzleLine;
  sum: number;
}

export interface PuzzleGeometry extends Size {
  /** Each puzzle cell's box, by `r,c`. */
  cells: Record<string, Box>;
  /** all-ways: the card behind each way, and the sign between its parts. */
  ways: Box[];
  signs: Box[];
  /** magic-square and missing-digit: the sum at the end of each line. */
  tags: SumTag[];
}

export const cellKey = (r: number, c: number) => `${r},${c}`;

/** How many columns of ways `rows` ways may stand in. */
export const wayColumnChoices = (rows: number): number[] =>
  Array.from({ length: rows }, (_, i) => i + 1);

/**
 * Where everything of the puzzle stands at a cell size, from (0, 0): the boxes on their grid
 * (a sum triangle's columns are half a step apart, so its middles sit between its corners), the
 * ways to make a number in `wayCols` columns of cards, and the line sums beside their lines.
 */
export function puzzleGeometry(c: Config, cell: number, wayCols = 1): PuzzleGeometry {
  const step = cell + GAP;
  const cells: Record<string, Box> = {};
  const box = (x: number, y: number): Box => ({ x, y, w: cell, h: cell });
  if (c.variant === 'all-ways') {
    const per = Math.ceil(c.rows / wayCols);
    const between = 2 * SIGN_PAD + SIGN_W;
    const wayW = 2 * cell + between + 2 * WAY_PAD;
    const wayH = cell + 2 * WAY_PAD;
    const ways: Box[] = [];
    const signs: Box[] = [];
    for (let r = 0; r < c.rows; r += 1) {
      const x = Math.floor(r / per) * (wayW + PART_GAP);
      const y = (r % per) * (wayH + WAY_GAP);
      ways.push({ x, y, w: wayW, h: wayH });
      cells[cellKey(r, 0)] = box(x + WAY_PAD, y + WAY_PAD);
      cells[cellKey(r, 1)] = box(x + WAY_PAD + cell + between, y + WAY_PAD);
      signs.push({ x: x + WAY_PAD + cell + SIGN_PAD, y: y + WAY_PAD, w: SIGN_W, h: cell });
    }
    const used = Math.ceil(c.rows / per);
    return {
      w: used * wayW + (used - 1) * PART_GAP,
      h: per * wayH + (per - 1) * WAY_GAP,
      cells,
      ways,
      signs,
      tags: [],
    };
  }
  const colStep = c.variant === 'sum-triangle' ? step / 2 : step;
  const lines = c.constraints.flatMap((k, constraint) => {
    if (k.kind !== 'line-sum') return [];
    if (c.variant !== 'magic-square' && c.variant !== 'missing-digit') return [];
    const line = puzzleLine(c, k.cells);
    return line ? [{ constraint, line, sum: k.sum }] : [];
  });
  const t = tagPx(cell);
  const has = (kind: PuzzleLine['kind']) => lines.some((l) => l.line.kind === kind);
  // The anti-diagonal ends at the bottom left: its sum stands there, left of the grid.
  const pad = c.variant === 'shape-fill' ? OUTLINE_PAD : c.variant === 'cage-sum' ? CAGE_PAD : 0;
  const left = pad + (has('anti-diagonal') ? t + GAP : 0);
  const right = has('row') || has('diagonal') ? GAP + t : 0;
  const bottom = has('col') || has('diagonal') || has('anti-diagonal') ? GAP + t : 0;
  for (const x of c.cells) cells[cellKey(x.r, x.c)] = box(left + x.c * colStep, pad + x.r * step);
  const gridW = (c.cols - 1) * colStep + cell;
  const gridH = (c.rows - 1) * step + cell;
  const mid = (cell - t) / 2;
  const tags = lines.map(({ constraint, line, sum }): SumTag => {
    const at =
      line.kind === 'row'
        ? { x: left + gridW + GAP, y: line.index * step + mid }
        : line.kind === 'col'
          ? { x: left + line.index * colStep + mid, y: gridH + GAP }
          : line.kind === 'diagonal'
            ? { x: left + gridW + GAP, y: gridH + GAP }
            : { x: 0, y: gridH + GAP };
    return { ...at, w: t, h: t, constraint, line, sum };
  });
  return {
    w: left + gridW + right + pad,
    h: gridH + bottom + 2 * pad,
    cells,
    ways: [],
    signs: [],
    tags,
  };
}

/** The tray's box: `n` cards in `cols` columns, each with its ledge. */
export function traySize(n: number, cols: number, cell: number): Size & { rows: number } {
  const rows = Math.ceil(n / cols);
  return {
    w: cols * cell + (cols - 1) * GAP,
    h: rows * cell + (rows - 1) * GAP + CARD_LEDGE,
    rows,
  };
}

export type PuzzleArrangement = 'row' | 'stack';

export interface PuzzlePlan {
  /** False when even the smallest boxes do not fit the room (the area then scrolls). */
  fits: boolean;
  arrangement: PuzzleArrangement;
  cell: number;
  wayCols: number;
  trayCols: number;
  geometry: PuzzleGeometry;
  tray: Size & { rows: number };
  /** The whole widget's box. */
  size: Size;
}

export interface PuzzlePlanInput {
  config: Config;
  room: Size;
  /** The Check button as measured (kit `useActionSize`). */
  button: Size;
  ageMode: AgeMode;
}

/** The tray's cards: the palette and the card that empties a box. */
export const trayCards = (c: Config) => c.palette.length + 1;

function arranged(
  c: Config,
  cell: number,
  wayCols: number,
  trayCols: number,
  arrangement: PuzzleArrangement,
  button: Size,
): PuzzlePlan {
  const geometry = puzzleGeometry(c, cell, wayCols);
  const tray = traySize(trayCards(c), trayCols, cell);
  const size =
    arrangement === 'row'
      ? {
          w: geometry.w + PART_GAP + tray.w + PART_GAP + button.w,
          h: Math.max(geometry.h, tray.h, button.h),
        }
      : {
          w: Math.max(geometry.w, tray.w + PART_GAP + button.w),
          h: geometry.h + PART_GAP + Math.max(tray.h, button.h),
        };
  return { fits: true, arrangement, cell, wayCols, trayCols, geometry, tray, size };
}

/**
 * The plan for a room: the largest boxes at which the puzzle, the tray and Check fit, side by
 * side if they can be, else the puzzle above the tray. In a row the tray takes the fewest columns
 * that fit the height; under the puzzle, the most that fit the width. A kindergarten room starts
 * from its own 80 px like any other and goes under it only when 80 px does not fit; no room gets
 * boxes under 64 px: one too small for those gets them anyway, `fits: false`, and scrolls.
 */
export function planPuzzle({ config: c, room, button }: PuzzlePlanInput): PuzzlePlan {
  const n = trayCards(c);
  const wayChoices = c.variant === 'all-ways' ? wayColumnChoices(c.rows) : [1];
  const trayChoices = Array.from({ length: n }, (_, i) => i + 1);
  const inRoom = (p: PuzzlePlan) => p.size.w <= room.w && p.size.h <= room.h;
  // The ways to make a number stand one under the other ("a new way in each row") wherever
  // boxes of 64 px let them; only then do they take a second column, and so on.
  for (const wayCols of wayChoices) {
    for (let cell = MAX_CELL; cell >= MIN_CELL; cell -= 2) {
      for (const arrangement of ['row', 'stack'] as const) {
        const cols = arrangement === 'row' ? trayChoices : [...trayChoices].reverse();
        for (const trayCols of cols) {
          const p = arranged(c, cell, wayCols, trayCols, arrangement, button);
          if (inRoom(p)) return p;
        }
      }
    }
  }
  // Nothing fits: the smallest boxes in a row, the tray as near square as it gets.
  const wayCols = wayChoices[Math.min(1, wayChoices.length - 1)] ?? 1;
  return {
    ...arranged(c, MIN_CELL, wayCols, Math.ceil(Math.sqrt(n)), 'row', button),
    fits: false,
  };
}
