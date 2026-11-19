// Pure layout maths for the equal-groups widget (03 §5.5): how a container's count is drawn (ten
// rods plus loose sprites in rows of five), how big a container is, and the sprite size that lets
// every container fit the scene. Everything is in CSS px and deterministic.

/** A container's contents as drawn: ten-rods and loose sprites. */
export interface Contents {
  rods: number;
  loose: number;
}

/**
 * How `n` is drawn. With rods on offer (`perGroup > 10`, MUL.11) every full ten is a rod. Without
 * them a container still bundles its tens once it holds more than ten, so it stays countable.
 */
export function splitCount(n: number, rodsOffered: boolean): Contents {
  const count = Math.max(0, Math.trunc(n));
  const rods = rodsOffered || count > 10 ? Math.floor(count / 10) : 0;
  return { rods, loose: count - rods * 10 };
}

/** The gap between sprites of size `s` (and between rods). */
export const spriteGap = (s: number) => Math.max(4, Math.round(s * 0.18));

/** Countable things are never drawn smaller than this, anywhere (one object scale). */
export const MIN_THING_PX = 20;

/** The sprite edge inside a rod drawn next to sprites of size `s` (≥ 20 px: still countable). */
export const rodCell = (s: number) => Math.max(MIN_THING_PX, Math.round(s * 0.42));

/** Rod geometry: a framed column of ten mini sprites with a wider gap after five. */
export const ROD_PAD = 3;
export const ROD_BORDER = 2;
export const ROD_INNER_GAP = 1;
export const ROD_FIVE_GAP = 5;
export function rodSize(m: number): { w: number; h: number } {
  const edge = 2 * (ROD_PAD + ROD_BORDER);
  return { w: m + edge, h: 10 * m + 8 * ROD_INNER_GAP + ROD_FIVE_GAP + edge };
}

/** Loose sprites sit in rows of five. */
export function looseGrid(n: number): { cols: number; rows: number } {
  if (n <= 0) return { cols: 0, rows: 0 };
  return { cols: Math.min(5, n), rows: Math.ceil(n / 5) };
}

/** The drawn contents' size for a capacity, at sprite size `s`. */
export function contentSize(cap: Contents, s: number): { w: number; h: number } {
  const g = spriteGap(s);
  const grid = looseGrid(cap.loose);
  const looseW = grid.cols > 0 ? grid.cols * s + (grid.cols - 1) * g : 0;
  const looseH = grid.rows > 0 ? grid.rows * s + (grid.rows - 1) * g : 0;
  const rod = rodSize(rodCell(s));
  const rodsW = cap.rods > 0 ? cap.rods * rod.w + (cap.rods - 1) * g : 0;
  const between = cap.rods > 0 && cap.loose > 0 ? Math.round(g * 1.5) : 0;
  return {
    w: rodsW + between + looseW,
    h: Math.max(cap.rods > 0 ? rod.h : 0, looseH),
  };
}

/** Space a container's drawing takes around its contents (rims, logs, a basket's handle). */
export const CHROME = { x: 26, top: 30, bottom: 28 } as const;

/** The larger of two capacities, kind by kind. */
export function maxContents(a: Contents, b: Contents): Contents {
  return { rods: Math.max(a.rods, b.rods), loose: Math.max(a.loose, b.loose) };
}

export interface GridInput {
  /** Container slots to place (the add-group slot included). */
  slots: number;
  /** What the largest container must be able to show. */
  cap: Contents;
  width: number;
  height: number;
  /** Gap between containers (≥ the 12 px target gap). */
  gap: number;
  maxSprite: number;
  minSprite: number;
  /** Smallest container box (room for the add button). */
  minBox?: { w: number; h: number };
}

export interface GridLayout {
  /** Sprite edge in px. */
  s: number;
  /** Containers per row, top to bottom (as even as possible). */
  rows: number[];
  box: { w: number; h: number };
  /** False when even the smallest sprite size overflows (the widget then clips nothing: it shrinks). */
  fits: boolean;
}

/** Row sizes for n slots in r rows, as even as possible (earlier rows take the extra). */
export function evenRows(n: number, r: number): number[] {
  const rows = Math.max(1, Math.min(n, r));
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: n <= 0 ? 0 : rows }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * The biggest sprite size (and the row arrangement) at which `slots` equal containers fit the
 * area. Each container is its contents plus CHROME. Ties go to fewer rows (a row reads left to
 * right, like counting groups).
 */
export function gridLayout(input: GridInput): GridLayout {
  const { slots, cap, width, height, gap, maxSprite, minSprite } = input;
  const n = Math.max(1, slots);
  const minW = input.minBox?.w ?? 0;
  const minH = input.minBox?.h ?? 0;
  const boxFor = (s: number) => {
    const c = contentSize(cap, s);
    return {
      w: Math.max(minW, c.w + 2 * CHROME.x),
      h: Math.max(minH, c.h + CHROME.top + CHROME.bottom),
    };
  };
  let best: GridLayout | null = null;
  let bestScore = 0;
  for (let r = 1; r <= n; r++) {
    const rows = evenRows(n, r);
    const perRow = Math.max(...rows);
    for (let s = Math.floor(maxSprite); s >= minSprite; s--) {
      const b = boxFor(s);
      const w = perRow * b.w + (perRow - 1) * gap;
      const h = rows.length * b.h + (rows.length - 1) * gap;
      if (w <= width && h <= height) {
        // Each extra row costs a tenth: three rafts in one row beat slightly bigger sprites in two.
        const score = s * (1 - 0.1 * (rows.length - 1));
        if (!best || score > bestScore) {
          best = { s, rows, box: b, fits: true };
          bestScore = score;
        }
        break;
      }
    }
  }
  if (best) return stretch(best, input);
  const rows = evenRows(n, Math.ceil(Math.sqrt(n)));
  return { s: minSprite, rows, box: boxFor(minSprite), fits: false };
}

/**
 * Lets the containers grow into spare room (no dead zones, 06 §2), up to a gentle aspect: a box
 * may get taller by half its height and wider by a quarter, never past its share of the area.
 */
function stretch(layout: GridLayout, input: GridInput): GridLayout {
  const perRow = Math.max(...layout.rows);
  const nRows = layout.rows.length;
  const shareW = (input.width - (perRow - 1) * input.gap) / perRow;
  const shareH = (input.height - (nRows - 1) * input.gap) / nRows;
  const w = Math.floor(Math.min(shareW, layout.box.w * 1.25));
  const h = Math.floor(Math.min(shareH, layout.box.h * 1.5, Math.max(layout.box.h, w * 0.85)));
  return { ...layout, box: { w: Math.max(layout.box.w, w), h: Math.max(layout.box.h, h) } };
}

export interface PileLayout {
  /** Sprite edge in px. */
  s: number;
  /** Strips (rows of up to ten) per column of strips. */
  perColumn: number;
  /** Sprites in each strip, in order (each strip is ten, the last may be fewer). */
  strips: number[];
  /** Height the pile needs. */
  h: number;
}

/** Gap between the two fives in a strip of ten. */
export const pileFiveGap = (s: number) => Math.max(3, Math.round(s * 0.3));
export const pileGap = (s: number) => Math.max(1, Math.round(s * 0.08));
export function stripSize(s: number): { w: number; h: number } {
  return { w: 10 * s + 8 * pileGap(s) + pileFiveGap(s), h: s };
}
/** Space between strips (rows) and between columns of strips. */
export const STRIP_ROW_GAP = 3;
export const STRIP_COL_GAP = 12;

/**
 * The supply pile: `count` sprites in strips of ten (two fives each), wrapped into columns of
 * strips. The biggest sprite (from `max` down to 20 px) whose pile fits `width` and stays within
 * `height`; if even 20 px sprites need more height, the pile grows taller. It never draws a
 * sprite below 20 px and never overlaps two.
 */
export function pileLayout(count: number, width: number, height: number, max = 34): PileLayout {
  const strips: number[] = [];
  for (let left = Math.max(0, count); left > 0; left -= 10) strips.push(Math.min(10, left));
  const top = Math.max(MIN_THING_PX, Math.floor(max));
  if (strips.length === 0) return { s: top, perColumn: 1, strips, h: 0 };
  const at = (s: number): PileLayout => {
    // One strip of fewer than ten is only as wide as its sprites.
    const w = strips.length === 1 ? stripWidth(strips[0] ?? 0, s) : stripSize(s).w;
    const columns = Math.max(1, Math.floor((width + STRIP_COL_GAP) / (w + STRIP_COL_GAP)));
    const perColumn = Math.ceil(strips.length / columns);
    return { s, perColumn, strips, h: perColumn * s + (perColumn - 1) * STRIP_ROW_GAP };
  };
  for (let s = top; s > MIN_THING_PX; s--) {
    const p = at(s);
    if (p.h <= height) return p;
  }
  return at(MIN_THING_PX);
}

/** Width of a strip holding `n` (≤ 10) sprites. */
export function stripWidth(n: number, s: number): number {
  if (n <= 0) return 0;
  return n * s + (n - 1) * pileGap(s) + (n > 5 ? pileFiveGap(s) - pileGap(s) : 0);
}
