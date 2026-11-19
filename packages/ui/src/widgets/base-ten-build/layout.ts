// Pure geometry for the base-ten-build mat (03 §5.5): how big a unit is drawn so every column fits
// the board, and how each column lays its pieces out. Kept DOM-free so it is unit-tested.
import type { PieceKind } from '@number-island/engine';

/** Kinds largest first (the mat's columns run left to right in this order). */
export const KINDS: readonly PieceKind[] = ['thousands', 'hundreds', 'tens', 'ones'];

export const larger = (k: PieceKind): PieceKind | undefined => KINDS[KINDS.indexOf(k) - 1];
export const smaller = (k: PieceKind): PieceKind | undefined => KINDS[KINDS.indexOf(k) + 1];

/** The biggest and smallest unit edge, in px. Pieces shrink between them as the mat fills. */
export const U_MAX = 34;
export const U_MIN = 8;
/** Rods are one unit wide; their hit box is at least this wide so a finger can grab one. */
export const ROD_HIT_MIN = 32;

/** Spacing between pieces of a kind (px) at unit edge `u`. */
export function pieceGap(kind: PieceKind, u: number): number {
  switch (kind) {
    case 'ones':
      // Inside a group of ten: tight, so five units read as one row.
      return Math.max(3, Math.round(u * 0.18));
    case 'tens':
      return Math.max(4, Math.round(u * 0.3));
    default:
      return Math.max(8, Math.round(u * 0.6));
  }
}

/** Gap between groups of ten ones (px). */
export const onesGroupGap = (u: number) => Math.max(10, Math.round(u * 0.6));

/** A thousands cube's drawn depth (its top and side faces), px. */
export const cubeDepth = (u: number) => Math.round(u * 3);

/** The hit box of one piece (px): the drawn piece, plus side room for a thin rod. */
export function pieceBox(kind: PieceKind, u: number): { w: number; h: number } {
  switch (kind) {
    case 'ones':
      return { w: u, h: u };
    case 'tens':
      return { w: Math.max(u, ROD_HIT_MIN), h: u * 10 };
    case 'hundreds':
      return { w: u * 10, h: u * 10 };
    default: {
      const s = u * 10 + cubeDepth(u);
      return { w: s, h: s };
    }
  }
}

/** One group of ten ones: a 5 × 2 frame (two rows of five, so fives are countable). */
export function onesFrame(u: number): { w: number; h: number } {
  const g = pieceGap('ones', u);
  return { w: 5 * u + 4 * g, h: 2 * u + g };
}

/**
 * The narrowest width a column of `n` pieces of `kind` needs to fit `height` px, or null if even
 * one row (or one group of ten ones) is taller than `height`.
 */
export function columnWidth(kind: PieceKind, n: number, u: number, height: number): number | null {
  if (kind === 'ones') {
    const f = onesFrame(u);
    const G = onesGroupGap(u);
    if (f.h > height) return null;
    const frames = Math.max(1, Math.ceil(n / 10));
    const rows = Math.floor((height + G) / (f.h + G));
    const cols = Math.ceil(frames / rows);
    return cols * f.w + (cols - 1) * G;
  }
  const box = pieceBox(kind, u);
  const g = pieceGap(kind, u);
  if (box.h > height) return null;
  if (n === 0) return box.w;
  const rows = Math.floor((height + g) / (box.h + g));
  const cols = Math.ceil(n / rows);
  return cols * box.w + (cols - 1) * g;
}

export interface MatColumn {
  kind: PieceKind;
  /** Minimum width of the column (its pieces, or the trade buttons under it). */
  width: number;
}

export interface MatLayout {
  u: number;
  columns: MatColumn[];
  /** Whether the pieces fit at U_MIN (false only for counts beyond any authored item). */
  fits: boolean;
}

export interface MatLayoutInput {
  /** Kinds shown as columns, largest first. */
  kinds: readonly PieceKind[];
  counts: Readonly<Record<PieceKind, number>>;
  /** Width available to the columns and the gaps between them, px. */
  width: number;
  /** Height available to the pieces, px. */
  height: number;
  /** Gap between columns, px. */
  columnGap: number;
  /** Width the controls under a column need (its trade buttons), px. */
  controlsWidth: (kind: PieceKind) => number;
  uMax?: number;
}

/** The largest unit edge (px) at which every column fits the board, and each column's width. */
export function matLayout(input: MatLayoutInput): MatLayout {
  const { kinds, counts, width, height, columnGap, controlsWidth } = input;
  const uMax = input.uMax ?? U_MAX;
  const attempt = (u: number): MatColumn[] | null => {
    const columns: MatColumn[] = [];
    for (const kind of kinds) {
      const w = columnWidth(kind, counts[kind], u, height);
      if (w === null) return null;
      columns.push({ kind, width: Math.ceil(Math.max(w, controlsWidth(kind))) });
    }
    const total =
      columns.reduce((a, c) => a + c.width, 0) + Math.max(0, columns.length - 1) * columnGap;
    return total <= width ? columns : null;
  };
  for (let u = uMax; u >= U_MIN; u--) {
    const columns = attempt(u);
    if (columns) return { u, columns, fits: true };
  }
  const fallback = kinds.map((kind) => ({
    kind,
    width: Math.ceil(
      Math.max(columnWidth(kind, counts[kind], U_MIN, height) ?? 0, controlsWidth(kind)),
    ),
  }));
  return { u: U_MIN, columns: fallback, fits: false };
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
