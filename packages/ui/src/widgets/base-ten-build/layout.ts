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
 * (no authored item comes near that). U_MIN (6) is reached only by mats near the engine's MAT_MAX
 * beside the fullest side panel (build-exact: goal, three chips, four piles).
 */
export const UNIT_G1 = 20;
export const UNIT_K = 28;
export const U_FLOOR = 18;
export const U_MIN = 6;

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
    rows = !compact ? 1 : pack === 'dense' ? fit : count <= 5 ? 1 : Math.min(2, fit);
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

// ---------- the side panel: goal, exact chips, tray, check ----------

/**
 * The side panel's sizes (px) as base-ten-build.css and the kit draw them at 1280 × 800, per age
 * mode (measured; the tablet stories check the panel fits). A pile with a stock tag stands taller
 * (its count is a 32 px numeral), the rods' tile tallest (`stockH`; the others `stockShortH`).
 */
export const SIDE_PX = {
  k: {
    pile: 100,
    pileLimited: 104,
    pileH: 100,
    stockH: 126,
    stockShortH: 118,
    goalH: 96,
    goalLgH: 96,
    chipH: 80,
    chipW: { hundreds: 166, tens: 106, ones: 126 },
    checkW: 96,
    checkH: 102,
    min: 80,
  },
  g1: {
    pile: 80,
    pileLimited: 104,
    pileH: 80,
    stockH: 139,
    stockShortH: 131,
    goalH: 76,
    goalLgH: 91,
    chipH: 80,
    chipW: { hundreds: 166, tens: 106, ones: 126 },
    checkW: 150,
    checkH: 82,
    min: 64,
  },
} as const;
/** A crowded panel's compact chips and goal (two to a row, trimmed side padding). */
export const COMPACT_CHIP_W = { hundreds: 127, tens: 72, ones: 108 } as const;
const TRAY_PAD = { top: 60, bottom: 14, x: 10 };
const PILE_GAP = { x: 12, y: 16 };
const SIDE_GAP = 14;
const ASK_GAP = 12;

export interface SideSpec {
  k: boolean;
  /** The tray's piles in order, true for one with a stock tag (a limited kind). */
  piles: readonly boolean[];
  /** Per pile, whether its picture is tall (the rods); absent: all tall. */
  tall?: readonly boolean[];
  /** The goal numeral as shown ("1.25"), or null without a goal card. */
  goal: string | null;
  /** The exact chips, in order. */
  exact: readonly ('hundreds' | 'tens' | 'ones')[];
  /** Each chip's count (its numeral is 40 px: a digit ~24 px wider); absent: one digit each. */
  exactN?: readonly number[];
  /** The panel's height (px). */
  height: number;
  /**
   * The parts' sizes as the browser draws them (the widget measures hidden copies of its goal,
   * chips, piles and check). Absent: the conservative model below (SIDE_PX), at least as large as
   * every measured size (a story checks it), which the layout tests use to prove the caps fit.
   */
  sizes?: SideSizes;
}

/** The side panel's parts, each at its own (intrinsic) size, px. */
export interface SideSizes {
  /** A pile tile's width (the CSS --pile, or --pile-w in a tray with limits). */
  pileW: number;
  /** Each pile tile's own height, in tray order (a row is as tall as its tallest tile). */
  tileH: readonly number[];
  /** The goal card: its width and height, large (`lg`) and in a crowded panel (`compact`). */
  goal: { w: number; h: number; lgW: number; lgH: number; compactW: number } | null;
  /** Each exact chip: its width, its width in a crowded panel, and its height. */
  chips: readonly { w: number; compactW: number; h: number }[];
  /** The check button's slot. */
  checkW: number;
  checkH: number;
}

/**
 * The measured sizes when they show this item's parts (as many piles and chips, a goal or none),
 * else undefined: the planner then keeps its model. A tray with no piles has no pile to measure,
 * so its width of 0 is a valid measurement there (PR #74 review, rounds 6 to 8).
 */
export function usableSizes(
  measured: SideSizes | null,
  item: { piles: number; chips: number; goal: boolean },
): SideSizes | undefined {
  if (!measured) return undefined;
  if (item.piles > 0 && !(measured.pileW > 0)) return undefined;
  if (measured.tileH.length !== item.piles || measured.chips.length !== item.chips) {
    return undefined;
  }
  if ((measured.goal !== null) !== item.goal) return undefined;
  return measured;
}

/** The model's sizes for `spec`: SIDE_PX, COMPACT_CHIP_W and the goal's digits. */
export function modelSizes(spec: SideSpec): SideSizes {
  const px = spec.k ? SIDE_PX.k : SIDE_PX.g1;
  const limited = spec.piles.some(Boolean);
  return {
    pileW: limited ? px.pileLimited : px.pile,
    tileH: spec.piles.map((stock, i) =>
      !stock
        ? // A plain tile in a tray with limits stands as tall as its picture needs (the rods: 84).
          limited && (spec.tall?.[i] ?? true)
          ? Math.max(px.pileH, 84)
          : px.pileH
        : (spec.tall?.[i] ?? true)
          ? px.stockH
          : px.stockShortH,
    ),
    goal:
      spec.goal === null
        ? null
        : {
            w: goalWidth(spec.goal, px.min, 'normal'),
            h: px.goalH,
            lgW: goalWidth(spec.goal, px.min, 'lg'),
            lgH: px.goalLgH,
            compactW: goalWidth(spec.goal, px.min, 'compact'),
          },
    chips: spec.exact.map((k, i) => {
      const extra = 24 * (String(spec.exactN?.[i] ?? 0).length - 1);
      // A chip is at least 1.6 targets wide (a crowded one, one target); a longer count widens it.
      return {
        w: Math.max(px.min * 1.6, px.chipW[k] + extra),
        compactW: Math.max(px.min, COMPACT_CHIP_W[k] + extra),
        h: px.chipH,
      };
    }),
    checkW: px.checkW,
    checkH: px.checkH,
  };
}

export interface SidePlan {
  pileCols: number;
  /** Goal and chips one per row (1) or two to a row, compact (2: a crowded panel). */
  askCols: 1 | 2;
  /** The goal numeral drawn large. */
  lg: boolean;
  /** The narrowest panel this arrangement needs, and its height (px). */
  width: number;
  height: number;
}

/** Goal width (px) for `text`: normal, large or compact. */
function goalWidth(text: string, min: number, size: 'normal' | 'lg' | 'compact'): number {
  if (size === 'lg') {
    // Measured at 72 px: a digit 44 px, a point 17 ("98.89" 231, "1.25" 187, "34" 126).
    const big = [...text].reduce((a, c) => a + (c === '.' ? 18 : 44), 0);
    return Math.max(min * 1.6, 40 + big);
  }
  // Measured: "9111" is 154 px (142 compact), "99.99" 153 compact: a digit 30 px, a point 11.
  const ink = [...text].reduce((a, c) => a + (c === '.' ? 11 : 30), 0);
  if (size === 'compact') return Math.max(min, 25 + ink);
  return Math.max(min * 1.6, 36 + ink);
}

/**
 * How the panel lays out at `width`: piles in balanced rows (all in one row, else two to a row,
 * else one column; a crowded panel may leave the third of three piles alone on its row), the goal
 * and chips one per row (or two to a row when `crowded`), the goal large only when it has room
 * across and the panel still fits its height.
 */
export function sidePlan(spec: SideSpec, width: number, crowded: boolean): SidePlan {
  const s = spec.sizes ?? modelSizes(spec);
  const n = spec.piles.length;
  const trayW = (c: number) => 2 * TRAY_PAD.x + c * s.pileW + (c - 1) * PILE_GAP.x;
  const options = [n, n === 4 || (crowded && n === 3) ? 2 : 0, 1];
  const pileCols = n === 0 ? 1 : (options.find((c) => c > 0 && trayW(c) <= width) ?? 1);
  let trayH = TRAY_PAD.top + TRAY_PAD.bottom;
  for (let r = 0; r * pileCols < n; r++) {
    const row = s.tileH.slice(r * pileCols, (r + 1) * pileCols);
    trayH += (r > 0 ? PILE_GAP.y : 0) + Math.max(...row);
  }
  const cells = (s.goal !== null ? 1 : 0) + s.chips.length;
  const askCols: 1 | 2 = crowded && cells >= 2 ? 2 : 1;
  const ask = (lg: boolean) => {
    if (cells === 0) return { w: 0, h: 0 };
    const goal =
      s.goal === null
        ? null
        : {
            w: askCols === 2 ? s.goal.compactW : lg ? s.goal.lgW : s.goal.w,
            h: lg ? s.goal.lgH : s.goal.h,
          };
    const chips = s.chips.map((c) => ({ w: askCols === 2 ? c.compactW : c.w, h: c.h }));
    const all = goal ? [goal, ...chips] : chips;
    if (askCols === 1) {
      return {
        w: Math.max(...all.map((c) => c.w)),
        h: all.reduce((a, c) => a + c.h, 0) + (all.length - 1) * ASK_GAP,
      };
    }
    let h = 0;
    const colW = [0, 0];
    all.forEach((c, i) => {
      colW[i % 2] = Math.max(colW[i % 2] ?? 0, c.w);
      if (i % 2 === 0) h += (i > 0 ? ASK_GAP : 0) + Math.max(c.h, all[i + 1]?.h ?? 0);
    });
    return { w: (colW[0] ?? 0) + ASK_GAP + (colW[1] ?? 0), h };
  };
  const plan = (lg: boolean): SidePlan => {
    const a = ask(lg);
    const blocks = [a.h, trayH, s.checkH].filter((h) => h > 0);
    return {
      pileCols,
      askCols,
      lg,
      width: Math.max(a.w, trayW(pileCols), s.checkW),
      height: blocks.reduce((s, h) => s + h, 0) + (blocks.length - 1) * SIDE_GAP,
    };
  };
  const canLg = askCols === 1 && spec.goal !== null && spec.goal.length * 44 + 70 <= width;
  if (canLg) {
    const big = plan(true);
    if (big.height <= spec.height) return big;
  }
  return plan(false);
}

/**
 * The side panel (px, at least `min`) whose contents fit its height, and whether it must be
 * crowded (goal and chips two to a row, three piles 2 + 1). The usual (balanced) panel at its
 * narrowest comes first, if `matFits` says the mat still fits beside it; else the narrower crowded
 * one. The mat shrinks its unit to leave the panel that room.
 */
export function sideNeed(
  spec: SideSpec,
  min: number,
  matFits: (width: number) => boolean = () => true,
): { width: number; crowded: boolean } {
  const narrowest = (crowded: boolean) => {
    for (let w = Math.ceil(min); w <= 600; w++) {
      const p = sidePlan(spec, w, crowded);
      if (p.width <= w && p.height <= spec.height) return w;
    }
    return Number.POSITIVE_INFINITY;
  };
  const loose = narrowest(false);
  if (loose <= Math.ceil(min)) return { width: loose, crowded: false };
  const crowded = narrowest(true);
  const options = [
    ...(Number.isFinite(loose) ? [{ width: loose, crowded: false }] : []),
    ...(Number.isFinite(crowded) && crowded < loose ? [{ width: crowded, crowded: true }] : []),
  ];
  const last = options.at(-1);
  if (!last) return { width: Math.ceil(min), crowded: true };
  return options.find((o) => matFits(o.width)) ?? last;
}

// ---------- the whole widget: the mat beside its side panel ----------

export interface PlanInput {
  /** The mat's geometry, without the side panel's room. */
  mat: Omit<MatLayoutInput, 'kinds' | 'counts' | 'sideMin' | 'sideMax'>;
  /** The side panel: its contents (it claims what it needs, at least `min`), or a fixed width. */
  side: { spec: SideSpec; min: number } | { fixed: number };
}

export interface WidgetPlan {
  layout: MatLayout;
  side: { width: number; crowded: boolean };
}

/** The room a side panel of `width` px gets: at least that, at most 260 px or that. */
const sideRoom = (width: number) => ({ sideMin: width, sideMax: Math.max(260, width) });

/**
 * The mat and side panel for a mat of `counts`: the side panel the layout chooses (sideNeed: the
 * usual panel if the mat fits beside it, else the crowded one) and the mat beside it. The widget
 * renders this, and its move guard (roomForMove) asks this same question of the state after a move.
 */
export function planMat(
  input: PlanInput,
  kinds: readonly PieceKind[],
  counts: Readonly<Record<PieceKind, number>>,
): WidgetPlan {
  const mat = (w: number) => matLayout({ ...input.mat, ...sideRoom(w), kinds, counts });
  if ('fixed' in input.side) {
    return {
      layout: matLayout({
        ...input.mat,
        sideMin: input.side.fixed,
        sideMax: input.side.fixed,
        kinds,
        counts,
      }),
      side: { width: input.side.fixed, crowded: false },
    };
  }
  const side = sideNeed(input.side.spec, input.side.min, (w) => !mat(w).overflow);
  return { layout: mat(side.width), side };
}

/**
 * Whether a move from `before` to `after` keeps the mat in its room, with whichever side panel the
 * layout would then choose (planMat). A mat that already overflows (a viewport narrower than the
 * tablet) may still make moves that leave it no wider.
 */
export function roomForMove(
  input: PlanInput,
  before: { kinds: readonly PieceKind[]; counts: Readonly<Record<PieceKind, number>> },
  after: { kinds: readonly PieceKind[]; counts: Readonly<Record<PieceKind, number>> },
): boolean {
  const next = planMat(input, after.kinds, after.counts).layout;
  if (!next.overflow) return true;
  const prev = planMat(input, before.kinds, before.counts).layout;
  return prev.overflow && next.matWidth <= prev.matWidth;
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

/** What to say for a value: a whole number, or a narration line with its vars. */
export type ValueSpeech = { number: number } | { key: string; vars: Record<string, number> };

/**
 * How a mat value is read aloud. Whole numbers are spoken as numbers. On the decimal mat
 * (`wholeIs: 'flat'`) `value` is in hundredths, and the number clips only say whole numbers, so
 * 125 is "1 and 25 hundredths" and 25 is "25 hundredths" (PR #74 review: a fraction passed as a
 * number was silent). `asTenths` reads a count of rods as tenths ("3 tenths"), for count-by.
 */
export function valueSpeech(value: number, decimal: boolean, asTenths = false): ValueSpeech {
  if (!decimal) return { number: value };
  const base = 'ui.widget.btb.dec.say';
  if (asTenths && value % 10 === 0) {
    const n = value / 10;
    return n === 1
      ? { key: `${base}.tenths-one`, vars: {} }
      : { key: `${base}.tenths`, vars: { n } };
  }
  const w = Math.floor(value / 100);
  const n = value % 100;
  if (n === 0) return { number: w };
  if (w === 0) {
    return n === 1
      ? { key: `${base}.hundredths-one`, vars: {} }
      : { key: `${base}.hundredths`, vars: { n } };
  }
  return n === 1
    ? { key: `${base}.mixed-one`, vars: { w } }
    : { key: `${base}.mixed`, vars: { w, n } };
}
