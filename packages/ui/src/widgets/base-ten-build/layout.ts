// Pure geometry for the base-ten-build mat (03 §5.5): the unit size pieces are drawn at, how each
// column lays its pieces out, and how wide the mat and the side panel are. DOM-free, unit-tested.
import type { PieceKind } from '@number-island/engine';

/** Kinds largest first (the mat's columns run left to right in this order). */
export const KINDS: readonly PieceKind[] = ['thousands', 'hundreds', 'tens', 'ones'];

export const larger = (k: PieceKind): PieceKind | undefined => KINDS[KINDS.indexOf(k) - 1];
export const smaller = (k: PieceKind): PieceKind | undefined => KINDS[KINDS.indexOf(k) + 1];

/**
 * The unit edge (px) every item is drawn at: one size, so a ten looks the same in every item.
 * K draws bigger when it fits. Never below U_FLOOR unless the content could not fit otherwise
 * (no authored item comes near that).
 */
export const UNIT_G1 = 20;
export const UNIT_K = 28;
export const U_FLOOR = 18;
export const U_MIN = 8;

/** Unit sizes to try, largest first. */
export function unitCandidates(k: boolean): number[] {
  const top = k ? UNIT_K : UNIT_G1;
  const out: number[] = [];
  for (let u = top; u >= U_MIN; u--) out.push(u);
  return out;
}

/** Spacing between pieces of a kind (px) at unit edge `u`. */
export function pieceGap(kind: PieceKind, u: number): number {
  switch (kind) {
    case 'ones':
      // Inside a group of ten: tight, so five units read as one row.
      return Math.max(3, Math.round(u * 0.18));
    case 'tens':
      // Rods lie side by side like a bundle of sticks (their hit boxes add the visible gap).
      return 2;
    default:
      return Math.max(3, Math.round(u * 0.15));
  }
}

/** Gap between groups of ten ones (px). */
export const onesGroupGap = (u: number) => Math.max(10, Math.round(u * 0.6));

/** A thousands cube's drawn depth (its top and side faces), px. */
export const cubeDepth = (u: number) => Math.round(u * 3);

/** Rods are one unit wide; their hit box adds a little room on each side for a finger. */
export const rodHit = (u: number) => Math.max(u + 4, 24);

/** The hit box of one piece (px): the drawn piece, plus side room for a thin rod. */
export function pieceBox(kind: PieceKind, u: number): { w: number; h: number } {
  switch (kind) {
    case 'ones':
      return { w: u, h: u };
    case 'tens':
      return { w: rodHit(u), h: u * 10 };
    case 'hundreds':
      return { w: u * 10, h: u * 10 };
    default: {
      const s = u * 10 + cubeDepth(u);
      return { w: s, h: s };
    }
  }
}

/** Ten ones as a frame: two rows of five (`h`) or, when the mat is crowded, two columns (`v`). */
export type Orient = 'h' | 'v';

export function onesFrame(u: number, orient: Orient = 'h'): { w: number; h: number } {
  const g = pieceGap('ones', u);
  const long = 5 * u + 4 * g;
  const short = 2 * u + g;
  return orient === 'h' ? { w: long, h: short } : { w: short, h: long };
}

/**
 * How a column lays out its cells (a cell is a piece, or a frame of ten ones): `cols` × `rows`.
 * Pieces fill row by row; frames of ones fill stack by stack (top to bottom, then the next stack),
 * so groups of ten stay in reading order.
 */
export interface ColumnPlan {
  cols: number;
  rows: number;
  /** The cells' total width and height (px). */
  w: number;
  h: number;
}

/**
 * How tightly a column packs its pieces:
 * - `loose`: rods lie in one row, flats in a near-square grid, frames of ones flat;
 * - `compact` (a crowded mat): rods in two rows of up to five, flats as tall as the mat allows,
 *   frames of ones upright;
 * - `dense` (a last resort for counts far beyond any authored item, tried only when nothing else
 *   fits at any unit): as `compact`, but rods also stack in as many rows as the mat's height holds.
 */
export type Pack = 'loose' | 'compact' | 'dense';

export function columnPlan(
  kind: PieceKind,
  n: number,
  u: number,
  height: number,
  pack: Pack = 'loose',
): ColumnPlan | null {
  const compact = pack !== 'loose';
  const grid = (
    cellW: number,
    cellH: number,
    gapX: number,
    gapY: number,
    cols: number,
    rows: number,
  ) => ({
    cols,
    rows,
    w: cols * cellW + (cols - 1) * gapX,
    h: rows * cellH + (rows - 1) * gapY,
  });
  if (kind === 'ones') {
    const f = onesFrame(u, compact ? 'v' : 'h');
    const G = onesGroupGap(u);
    if (f.h > height) return null;
    const frames = Math.max(1, Math.ceil(n / 10));
    const rows = Math.min(frames, Math.floor((height + G) / (f.h + G)));
    return grid(f.w, f.h, G, G, Math.ceil(frames / rows), rows);
  }
  const box = pieceBox(kind, u);
  const g = pieceGap(kind, u);
  if (box.h > height) return null;
  const fit = Math.floor((height + g) / (box.h + g));
  const count = Math.max(1, n);
  let rows: number;
  if (kind === 'tens') {
    // A bundle of sticks: never more than two rows of rods end to end (unless `dense`).
    rows = count <= 5 || !compact ? 1 : pack === 'dense' ? fit : Math.min(2, fit);
  } else {
    rows = compact ? fit : Math.max(1, Math.round(Math.sqrt(count)));
  }
  rows = Math.max(1, Math.min(rows, fit, count));
  return grid(box.w, box.h, g, g, Math.ceil(count / rows), rows);
}

/** The narrowest width a column of `n` pieces needs to fit `height` px (null: it can't). */
export function columnWidth(
  kind: PieceKind,
  n: number,
  u: number,
  height: number,
  pack: Pack = 'loose',
): number | null {
  return columnPlan(kind, n, u, height, pack)?.w ?? null;
}

export interface MatColumn {
  kind: PieceKind;
  /** Minimum width of the column, its side padding included (px). */
  width: number;
  plan: ColumnPlan;
}

export interface MatLayout {
  u: number;
  /** Ones frames lie flat (`h`) or stand upright (`v`, a compact mat). */
  orient: Orient;
  columns: MatColumn[];
  /** The mat's minimum width: columns, gutters, frame and inset (px). */
  matWidth: number;
  /** The side panel's width (px). */
  sideWidth: number;
  /** False only if the pieces needed a unit below U_FLOOR. */
  fits: boolean;
  /**
   * True when the mat is wider than the room beside the side panel even at the smallest unit,
   * packed densely. The widget never lets a move make this happen.
   */
  overflow: boolean;
}

export interface MatLayoutInput {
  /** Kinds shown as columns, largest first. */
  kinds: readonly PieceKind[];
  counts: Readonly<Record<PieceKind, number>>;
  /** Unit sizes to try, largest first. */
  units: readonly number[];
  /** The widget's content width (px). */
  width: number;
  /** Height available to the pieces in a column (px). */
  height: number;
  /** Width of the gutter between two columns (it holds the trade buttons), px. */
  gutter: number;
  /** Side padding inside each column (px, each side). */
  columnPad: number;
  /** The board's frame plus its inner inset (px, each side). */
  frame: number;
  /** Gap between the mat and the side panel (px). */
  gap: number;
  /** The side panel's narrowest and widest width (px). */
  sideMin: number;
  sideMax: number;
  /** Width a column's header needs (px). */
  headerWidth: (kind: PieceKind) => number;
}

/** The largest unit at which every column fits beside the side panel, and the plans that follow. */
export function matLayout(input: MatLayoutInput): MatLayout {
  const { kinds, counts, width, height, gutter, columnPad, frame, gap, sideMin, sideMax } = input;
  const attempt = (u: number, pack: Pack) => {
    const columns: MatColumn[] = [];
    for (const kind of kinds) {
      const plan = columnPlan(kind, counts[kind], u, height, pack);
      if (plan === null) return null;
      columns.push({
        kind,
        plan,
        width: Math.ceil(Math.max(plan.w, input.headerWidth(kind)) + 2 * columnPad),
      });
    }
    const matWidth =
      columns.reduce((a, c) => a + c.width, 0) +
      Math.max(0, columns.length - 1) * gutter +
      2 * frame;
    return { columns, matWidth };
  };
  const finish = (u: number, pack: Pack, columns: MatColumn[], matWidth: number): MatLayout => ({
    u,
    orient: pack === 'loose' ? 'h' : 'v',
    columns,
    matWidth,
    sideWidth: Math.max(sideMin, Math.min(sideMax, width - matWidth - gap)),
    fits: u >= U_FLOOR,
    overflow: false,
  });
  const units = input.units.length > 0 ? input.units : [U_MIN];
  const fitting = (u: number, pack: Pack) => {
    const a = attempt(u, pack);
    return a && a.matWidth + gap + sideMin <= width ? finish(u, pack, a.columns, a.matWidth) : null;
  };
  // Every authored item fits loose or compact; `dense` only when nothing else fits at any unit.
  for (const u of units) {
    for (const pack of ['loose', 'compact'] as const) {
      const l = fitting(u, pack);
      if (l) return l;
    }
  }
  for (const u of units) {
    const l = fitting(u, 'dense');
    if (l) return l;
  }
  const u = units[units.length - 1] as number;
  const a = attempt(u, 'dense');
  if (a) return { ...finish(u, 'dense', a.columns, a.matWidth), fits: false, overflow: true };
  const one: ColumnPlan = { cols: 1, rows: 1, w: 0, h: 0 };
  const columns = kinds.map((kind) => ({
    kind,
    plan: one,
    width: input.headerWidth(kind) + 2 * columnPad,
  }));
  return { ...finish(u, 'dense', columns, 0), fits: false, overflow: true };
}

/** Half the width and height of the bundle ten pieces of `kind` gather into (px). */
export function bundleHalf(kind: PieceKind, u: number): { x: number; y: number } {
  switch (kind) {
    case 'ones':
      return { x: u / 2, y: u * 5 };
    case 'tens':
      return { x: u * 5, y: u * 5 };
    default: {
      const s = u * 5 + cubeDepth(u) / 2 + (kind === 'thousands' ? cubeDepth(u) / 2 : 0);
      return { x: s, y: s };
    }
  }
}

/** Clamps a bundle's centre so the whole bundle stays inside `box` (a rect in px). */
export function clampInto(
  c: { x: number; y: number },
  half: { x: number; y: number },
  box: { left: number; top: number; right: number; bottom: number },
): { x: number; y: number } {
  const clamp = (v: number, lo: number, hi: number) =>
    lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
  return {
    x: clamp(c.x, box.left + half.x, box.right - half.x),
    y: clamp(c.y, box.top + half.y, box.bottom - half.y),
  };
}

/**
 * Where ten pieces gather to make one piece of the next size (and where a split piece's ten parts
 * start from), relative to the bundle's centre: ten units line up as a rod, ten rods sit side by
 * side as a flat, ten flats stack into a cube. Returns the centre offset of part `j` (0–9).
 */
export function bundleOffset(kind: PieceKind, j: number, u: number): { x: number; y: number } {
  switch (kind) {
    case 'ones':
      return { x: 0, y: (j - 4.5) * u };
    case 'tens':
      return { x: (j - 4.5) * u, y: 0 };
    default: {
      // Flats (or cubes) stack, each a little up and to the right of the one before.
      const step = cubeDepth(u) / 10;
      return { x: (j - 4.5) * step, y: -(j - 4.5) * step };
    }
  }
}
