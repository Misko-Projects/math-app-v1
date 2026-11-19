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
      // Rods already have room on each side of their hit box; three rows of 20 px rods fit 606 px.
      return 3;
    default:
      return Math.max(3, Math.round(u * 0.15));
  }
}

/** Gap between groups of ten ones (px). */
export const onesGroupGap = (u: number) => Math.max(10, Math.round(u * 0.6));

/** A thousands cube's drawn depth (its top and side faces), px. */
export const cubeDepth = (u: number) => Math.round(u * 3);

/** Rods are one unit wide; their hit box adds a little room on each side for a finger. */
export const rodHit = (u: number) => Math.max(u + 8, 28);

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
 * The narrowest width a column of `n` pieces of `kind` needs to fit `height` px, or null if even
 * one row (or one group of ten ones) is taller than `height`.
 */
export function columnWidth(
  kind: PieceKind,
  n: number,
  u: number,
  height: number,
  orient: Orient = 'h',
): number | null {
  if (kind === 'ones') {
    const f = onesFrame(u, orient);
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
  /** Minimum width of the column, its side padding included (px). */
  width: number;
}

export interface MatLayout {
  u: number;
  orient: Orient;
  columns: MatColumn[];
  /** The mat's minimum width: columns, gutters and the frame (px). */
  matWidth: number;
  /** The side panel's width (px). */
  sideWidth: number;
  /** False only if the pieces needed a unit below U_FLOOR. */
  fits: boolean;
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
  /** The board's frame (px, each side). */
  frame: number;
  /** Gap between the mat and the side panel (px). */
  gap: number;
  /** The side panel's narrowest and widest width (px). */
  sideMin: number;
  sideMax: number;
  /** Width a column's header needs (px). */
  headerWidth: (kind: PieceKind) => number;
}

/** The largest unit at which every column fits beside the side panel, and the widths that follow. */
export function matLayout(input: MatLayoutInput): MatLayout {
  const { kinds, counts, width, height, gutter, columnPad, frame, gap, sideMin, sideMax } = input;
  const attempt = (u: number, orient: Orient) => {
    const columns: MatColumn[] = [];
    for (const kind of kinds) {
      const w = columnWidth(kind, counts[kind], u, height, orient);
      if (w === null) return null;
      columns.push({
        kind,
        width: Math.ceil(Math.max(w, input.headerWidth(kind)) + 2 * columnPad),
      });
    }
    const matWidth =
      columns.reduce((a, c) => a + c.width, 0) +
      Math.max(0, columns.length - 1) * gutter +
      2 * frame;
    return { columns, matWidth };
  };
  const finish = (u: number, orient: Orient, columns: MatColumn[], matWidth: number) => ({
    u,
    orient,
    columns,
    matWidth,
    sideWidth: Math.max(sideMin, Math.min(sideMax, width - matWidth - gap)),
    fits: u >= U_FLOOR,
  });
  const units = input.units.length > 0 ? input.units : [U_MIN];
  for (const u of units) {
    for (const orient of ['h', 'v'] as const) {
      const a = attempt(u, orient);
      if (a && a.matWidth + gap + sideMin <= width) return finish(u, orient, a.columns, a.matWidth);
    }
  }
  const u = units[units.length - 1] as number;
  const a = attempt(u, 'v') ?? {
    columns: kinds.map((kind) => ({ kind, width: input.headerWidth(kind) + 2 * columnPad })),
    matWidth: 0,
  };
  return { ...finish(u, 'v', a.columns, a.matWidth), fits: false };
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
