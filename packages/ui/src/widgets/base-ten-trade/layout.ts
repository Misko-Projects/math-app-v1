// Pure geometry for the base-ten-trade mat (03 §5.5): which columns the mat shows, how many pieces
// each column plans room for, how big one unit is drawn so the whole widget fills (and fits) its
// area, and where each piece sits in its column. Pieces never overlap: every one stays separately
// countable, so when more must fit, the unit shrinks. DOM-free, so it is unit-tested.
import { type Column, type Hto, htoValue } from '@number-island/engine';
import type { WidgetConfigOf } from '@number-island/shared';

type Config = WidgetConfigOf<'base-ten-trade'>;
export type AgeMode = 'k' | 'g1-up';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The unit edge, px: one ones piece and one rod segment. Every config draws at the same scale,
 * U_MAX, so pieces look the same from screen to screen; the layout wraps (flats 2 × 2, rods in
 * rows, ones in fives) to make room. Only a config that cannot fit at U_MAX steps down, and
 * U_FLOOR is the smallest it should need (U_MIN is the last resort that keeps the widget on
 * screen).
 */
export const U_MAX = 20;
export const U_FLOOR = 18;
export const U_MIN = 8;

/** Fixed sizes (px) that the stylesheet mirrors through the inline custom properties. */
export const GAP = 12; // --target-gap: between hit targets (06 §4)
export const MAT_BORDER = 4;
export const COL_PAD = 12;
export const TRAY_PAD = 10;
/** Room around a waiting group inside its draggable box. */
export const GROUP_PAD = 15;
export const ROW_GAP = 16; // between the widget's rows (problem, mat, tray or nest)

/** The gull's room at the nest's right end, px (the nest art spans the rest). */
export const GULL_W = 52;
/** The nest's front wall (a fixed-height band at its foot); the taken pieces rest just above it. */
export const NEST_WALL = 30;
const NEST_TOP = 14;
/**
 * The hollow is a long stadium (straight rim, rounded ends of this radius, see .ni-btt__hollow):
 * the pieces keep clear of its rounded ends, and a rim-gap below its straight top edge.
 */
export const NEST_END = 80;

/** The area the taken pieces sit in, inside a nest `w` × `h` px: always inside the hollow. */
export function nestInner(w: number, h: number): Box {
  const art = w - GULL_W;
  return {
    x: NEST_END,
    y: NEST_TOP,
    w: Math.max(0, art - 2 * NEST_END),
    h: h - NEST_TOP - NEST_WALL,
  };
}

/** A nest tall enough for pieces `tall` px high. */
export const nestHeightFor = (tall: number) => Math.ceil(tall + NEST_TOP + NEST_WALL);

export interface AgeSizes {
  /** --target-min. */
  target: number;
  /** Column header height. */
  header: number;
  /** One trade button: width = target, height below. */
  tradeH: number;
  /** Narrowest a column may be (its header must fit). */
  headerMin: Record<Column, number>;
}

export function ageSizes(age: AgeMode): AgeSizes {
  if (age === 'k') {
    // K: icon-only headers and trade buttons (06 §5).
    return {
      target: 80,
      header: 56,
      tradeH: 80,
      headerMin: { hundreds: 96, tens: 96, ones: 96 },
    };
  }
  return {
    target: 64,
    header: 48,
    // Icon plus a one-word caption.
    tradeH: 86,
    headerMin: { hundreds: 150, tens: 100, ones: 110 },
  };
}

/** The strip between two columns: a pair of trade buttons with a target gap either side. */
export const stripWidth = (age: AgeMode) => ageSizes(age).target + 2 * GAP;

// ---------- pieces ----------

export const pieceSize = (kind: Column, u: number): { w: number; h: number } =>
  kind === 'hundreds'
    ? { w: u * 10, h: u * 10 }
    : kind === 'tens'
      ? { w: u, h: u * 10 }
      : { w: u, h: u };

/** Spacing between pieces at unit edge `u`, px. */
export function spacing(u: number) {
  return {
    /** Between ones in a row of five. */
    unit: Math.max(2, Math.round(u * 0.22)),
    /** Extra space between blocks of ten ones (two rows of five). */
    ten: Math.max(4, Math.round(u * 0.6)),
    /** Between rods. */
    rod: Math.max(2, Math.round(u * 0.35)),
    /** Extra space after every five rods. */
    five: Math.max(3, Math.round(u * 0.7)),
    /** Between rows of rods. */
    rodRow: Math.max(6, Math.round(u * 0.8)),
    /** Between flats (side by side and row to row). */
    flat: Math.max(6, Math.round(u * 0.6)),
  };
}

/** Ones sit in rows of five; two rows make a ten (a ten-frame shape). */
export const ONES_PER_ROW = 5;

/**
 * Where `n` pieces of `kind` sit, from (0, 0): ones five a row (two rows a ten), rods and flats
 * `perRow` a row. Pieces never overlap. Reading order: piece `i` is the i-th box.
 */
export function naturalLayout(kind: Column, n: number, u: number, perRow = 10): Box[] {
  const s = spacing(u);
  const { w, h } = pieceSize(kind, u);
  const per = Math.max(1, perRow);
  const out: Box[] = [];
  for (let i = 0; i < n; i++) {
    if (kind === 'ones') {
      const col = i % ONES_PER_ROW;
      const row = Math.floor(i / ONES_PER_ROW);
      out.push({
        x: col * (u + s.unit),
        y: row * (u + s.unit) + Math.floor(row / 2) * s.ten,
        w,
        h,
      });
    } else if (kind === 'tens') {
      const col = i % per;
      const row = Math.floor(i / per);
      out.push({
        x: col * (u + s.rod) + Math.floor(col / 5) * s.five,
        y: row * (h + s.rodRow),
        w,
        h,
      });
    } else {
      const col = i % per;
      const row = Math.floor(i / per);
      out.push({ x: col * (w + s.flat), y: row * (h + s.flat), w, h });
    }
  }
  return out;
}

/** The bounding size of a layout (0 × 0 when empty). */
export function extent(boxes: readonly Box[]): { w: number; h: number } {
  let w = 0;
  let h = 0;
  for (const b of boxes) {
    w = Math.max(w, b.x + b.w);
    h = Math.max(h, b.y + b.h);
  }
  return { w, h };
}

/** How many pieces of `kind` fit across `width` px in one row. */
export function piecesAcross(kind: Column, width: number, u: number): number {
  let n = 1;
  while (n < 40) {
    if (extent(naturalLayout(kind, n + 1, u, n + 1)).w > width) break;
    n++;
  }
  return n;
}

/**
 * The pieces of one column inside a `box` (its content area), laid out for `capacity` pieces so
 * they don't shift as the count changes: the planned block is centred across and sits at the top.
 * Rods and flats go `perRow` a row (fewer if the column is narrower). Only when even the smallest
 * unit can't hold them all (never on a planned layout) do the positions squeeze.
 */
export function placePieces(
  kind: Column,
  n: number,
  u: number,
  box: { w: number; h: number },
  capacity = n,
  perRow = 10,
): Box[] {
  if (n <= 0) return [];
  const per =
    kind === 'ones' ? ONES_PER_ROW : Math.max(1, Math.min(perRow, piecesAcross(kind, box.w, u)));
  const boxes = naturalLayout(kind, n, u, per);
  const planned = extent(naturalLayout(kind, Math.max(n, capacity), u, per));
  const { w: pw, h: ph } = pieceSize(kind, u);
  const ext = extent(boxes);
  const fx = ext.w > box.w && ext.w > pw ? Math.max(0, (box.w - pw) / (ext.w - pw)) : 1;
  const fy = ext.h > box.h && ext.h > ph ? Math.max(0, (box.h - ph) / (ext.h - ph)) : 1;
  const blockW = Math.min(box.w, fx < 1 ? box.w : Math.max(ext.w, planned.w));
  const ox = Math.max(0, (box.w - blockW) / 2);
  return boxes.map((b) => ({
    x: Math.round((ox + b.x * fx) * 10) / 10,
    y: Math.round(b.y * fy * 10) / 10,
    w: b.w,
    h: b.h,
  }));
}

/**
 * Taken tens lie down in the nest (a rod tossed into a nest rests on its side), stacked: wide but
 * low, so the nest stays shallow. Each is a rod drawn 10 units long and 1 high.
 */
export function lyingRods(n: number, u: number): Box[] {
  const s = spacing(u);
  return Array.from({ length: n }, (_, i) => ({
    x: 0,
    y: i * (u + s.unit) + Math.floor(i / 5) * s.ten,
    w: u * 10,
    h: u,
  }));
}

/**
 * Pieces taken away, in the nest (`box`, its inner area): hundreds, then tens (lying down), then
 * ones, side by side at edge `ub`, centred across and resting on the floor (the box's bottom).
 */
export function placeTaken(
  taken: Hto,
  ub: number,
  box: { w: number; h: number },
): Record<Column, Box[]> {
  const groups: Record<Column, Box[]> = {
    hundreds: naturalLayout('hundreds', taken.hundreds, ub, 10),
    tens: lyingRods(taken.tens, ub),
    ones: naturalLayout('ones', taken.ones, ub),
  };
  const gap = Math.max(10, ub * 2);
  let x = 0;
  const out: Record<Column, Box[]> = { hundreds: [], tens: [], ones: [] };
  const total = (['hundreds', 'tens', 'ones'] as const)
    .map((c) => extent(groups[c]).w)
    .filter((w) => w > 0);
  const width = total.reduce((a, w) => a + w, 0) + gap * Math.max(0, total.length - 1);
  // Too wide (far more taken than the item asks for): squeeze the positions as a last resort.
  const fx = width > box.w && width > ub ? Math.max(0, (box.w - ub) / (width - ub)) : 1;
  const ox = Math.max(0, (box.w - width * fx) / 2);
  for (const c of ['hundreds', 'tens', 'ones'] as const) {
    const g = groups[c];
    if (g.length === 0) continue;
    const ext = extent(g);
    const tall = Math.min(ext.h, box.h);
    const fy = ext.h > box.h && ext.h > ub ? Math.max(0, (box.h - ub) / (ext.h - ub)) : 1;
    const floor = box.h - tall;
    out[c] = g.map((b) => ({
      ...b,
      x: Math.round(ox + (x + b.x) * fx),
      y: Math.round(floor + b.y * fy),
    }));
    x += ext.w + gap;
  }
  return out;
}

// ---------- the algorithm's result row ----------

/**
 * The number the result boxes form, or null while it isn't one yet: the ones box is filled and
 * there is no empty box between filled ones (an empty hundreds box is just a two-digit answer).
 */
export function digitsValue(d: Record<Column, number | null>): number | null {
  const cols = ['hundreds', 'tens', 'ones'] as const;
  const first = cols.findIndex((c) => d[c] !== null);
  if (first < 0) return null;
  let v = 0;
  for (const c of cols.slice(first)) {
    const x = d[c];
    if (x === null) return null;
    v = v * 10 + x;
  }
  return v;
}

// ---------- what the mat plans room for ----------

export interface MatCaps {
  /** Columns shown, largest first (always hundreds, tens, ones). */
  columns: Column[];
  /** Whether a flat can ever be on the mat (the pieces are worth 100 or more). */
  flatReachable: boolean;
  /** The most pieces each column holds on the way to the answer. */
  mat: Hto;
  /** `+`: the operand's waiting pieces. */
  tray: Hto | null;
  /** `-`: the pieces the child takes away. */
  taken: Hto | null;
  /**
   * Room for exactly these pieces (the mat as it is now), not a stable plan for the whole item:
   * a column with none of its pieces gets only its header's width.
   */
  exact?: boolean;
}

export function planCaps(c: Config): MatCaps {
  const s = c.start;
  const op = c.goal === 'compute' ? c.operation : undefined;
  // Every piece the child ever has: the start plus, for `+`, the operand. (Not the result, so the
  // layout never hints at it.)
  const total = htoValue(s) + (op?.op === '+' ? htoValue(op.operand) : 0);
  const columns: Column[] = ['hundreds', 'tens', 'ones'];
  let mat: Hto;
  if (c.goal === 'regroup-to') {
    const t = c.regroupTarget ?? s;
    mat = {
      hundreds: Math.max(s.hundreds, t.hundreds),
      tens: Math.max(s.tens, t.tens),
      ones: Math.max(s.ones, t.ones),
    };
  } else if (op?.op === '+') {
    const o = op.operand;
    const ones = s.ones + o.ones;
    const tens = s.tens + o.tens + (ones >= 10 ? 1 : 0);
    mat = { hundreds: s.hundreds + o.hundreds + (tens >= 10 ? 1 : 0), tens, ones };
  } else if (op) {
    const o = op.operand;
    const b1 = s.ones < o.ones;
    const b2 = s.tens - (b1 ? 1 : 0) < o.tens;
    mat = {
      hundreds: s.hundreds,
      tens: s.tens + (b2 ? 10 : 0),
      ones: s.ones + (b1 ? 10 : 0),
    };
  } else {
    mat = { ...s };
  }
  return {
    columns,
    flatReachable: total >= 100,
    mat,
    tray: op?.op === '+' ? { ...op.operand } : null,
    taken: op?.op === '-' ? { ...op.operand } : null,
  };
}

const maxHto = (a: Hto, b: Hto): Hto => ({
  hundreds: Math.max(a.hundreds, b.hundreds),
  tens: Math.max(a.tens, b.tens),
  ones: Math.max(a.ones, b.ones),
});

/**
 * The plan grown to hold what the child has actually made (trades off the expected path, more
 * taken than asked), so pieces never overlap.
 */
export function growCaps(caps: MatCaps, mat: Hto, taken: Hto): MatCaps {
  const grown = maxHto(caps.mat, mat);
  const sameMat =
    grown.hundreds === caps.mat.hundreds &&
    grown.tens === caps.mat.tens &&
    grown.ones === caps.mat.ones;
  const grownTaken = caps.taken ? maxHto(caps.taken, taken) : null;
  const sameTaken =
    !caps.taken ||
    (grownTaken?.hundreds === caps.taken.hundreds &&
      grownTaken.tens === caps.taken.tens &&
      grownTaken.ones === caps.taken.ones);
  if (sameMat && sameTaken) return caps;
  return {
    ...caps,
    flatReachable: caps.flatReachable || mat.hundreds > 0,
    mat: grown,
    taken: grownTaken,
  };
}

/** Room for exactly what is on the mat, in the tray and in the nest now. */
export function stateCaps(
  base: MatCaps,
  mat: Hto,
  pending: Hto | null,
  taken: Hto | null,
): MatCaps {
  return { ...base, mat: { ...mat }, tray: pending, taken, exact: true };
}

// ---------- choosing the layout ----------

export interface MatPlan {
  u: number;
  /** Rods a row in the tens column. */
  rodsPerRow: number;
  /** Flats a row in the hundreds column. */
  flatsPerRow: number;
  colW: Record<Column, number>;
  /** Height the planned pieces take (the tallest column), before the board stretches. */
  piecesH: number;
  /** Height of the columns' piece area (below the headers), padding included. */
  bodyH: number;
  /** Height of the adding tray (0 without one). */
  trayH: number;
  /** Height of the take-away nest (0 without one). */
  nestH: number;
  matW: number;
  /** Mat, tray and nest, with the gaps between them. */
  totalH: number;
  /** The plan (the caps) this layout holds. */
  caps: MatCaps;
  /** False when even the smallest unit overflows; the layout then squeezes. */
  fits: boolean;
}

export interface PlanInput {
  /** What to make room for, most stable first (the whole item's plan, then the mat as it is). */
  caps: MatCaps | readonly MatCaps[];
  age: AgeMode;
  /** Width available to the mat, px. The mat fills it. */
  width: number;
  /** Height available to the mat, tray and nest together, px. */
  height: number;
}

interface OnePlanInput extends Omit<PlanInput, 'caps'> {
  caps: MatCaps;
}

function contentH(kind: Column, n: number, u: number, perRow: number): number {
  return extent(naturalLayout(kind, n, u, perRow)).h;
}

function contentW(kind: Column, n: number, u: number, perRow: number): number {
  return extent(naturalLayout(kind, n, u, perRow)).w;
}

const perRowFor = (kind: Column, rodsPerRow: number, flatsPerRow: number) =>
  kind === 'tens' ? rodsPerRow : kind === 'hundreds' ? flatsPerRow : ONES_PER_ROW;

/** The width the taken pieces need side by side in the nest. */
function takenWidth(t: Hto, u: number): number {
  const groups = (['hundreds', 'tens', 'ones'] as const)
    .map((c) => (c === 'tens' ? extent(lyingRods(t.tens, u)).w : contentW(c, t[c], u, 10)))
    .filter((w) => w > 0);
  return groups.reduce((a, w) => a + w, 0) + Math.max(10, u * 2) * Math.max(0, groups.length - 1);
}

/** One candidate layout at unit `u`, before it is stretched to fill the space. */
export function measurePlan(
  input: OnePlanInput,
  u: number,
  rodsPerRow: number,
  flatsPerRow = 10,
): MatPlan {
  const { caps, age } = input;
  const sz = ageSizes(age);
  const cols = caps.columns;
  const tray = caps.tray;
  const colW = { hundreds: 0, tens: 0, ones: 0 } as Record<Column, number>;
  const planned = (c: Column) =>
    caps.exact
      ? caps.mat[c]
      : // A column always has room for one piece of its kind (a flat only if one can exist).
        Math.max(c === 'hundreds' && !caps.flatReachable ? 0 : 1, caps.mat[c]);
  for (const c of cols) {
    const per = perRowFor(c, rodsPerRow, flatsPerRow);
    // The ones column always has room for a full row of five (nine ones), never squeezed.
    const across = c === 'ones' ? Math.max(ONES_PER_ROW, planned(c)) : Math.min(planned(c), per);
    const need = Math.max(
      contentW(c, across, u, per),
      tray ? contentW(c, tray[c], u, 10) + 2 * GROUP_PAD : 0,
    );
    colW[c] = Math.ceil(Math.max(sz.headerMin[c], need + 2 * COL_PAD));
  }
  const strips = (cols.length - 1) * stripWidth(age);
  const matW = 2 * MAT_BORDER + cols.reduce((a, c) => a + colW[c], 0) + strips;
  // The trade strip spans header and body: two buttons and a gap between them.
  const stripNeed = 2 * sz.tradeH + GAP + 2 * 8 - sz.header;
  const piecesH = Math.max(
    0,
    ...cols.map((c) => contentH(c, planned(c), u, perRowFor(c, rodsPerRow, flatsPerRow))),
  );
  const bodyH = Math.ceil(Math.max(stripNeed, piecesH + 2 * COL_PAD));
  const trayH = tray
    ? Math.ceil(
        Math.max(sz.target, ...cols.map((c) => contentH(c, tray[c], u, 10) + 2 * GROUP_PAD)) +
          2 * TRAY_PAD,
      )
    : 0;
  let nestH = 0;
  let nestFits = true;
  if (caps.taken) {
    const t = caps.taken;
    const piecesTall = Math.max(
      t.hundreds > 0 ? u * 10 : 0,
      extent(lyingRods(t.tens, u)).h,
      contentH('ones', t.ones, u, ONES_PER_ROW),
    );
    // At least a target tall (the nest is where pieces are dropped).
    nestH = Math.max(sz.target + 2 * GAP, nestHeightFor(piecesTall));
    // The nest is as wide as the mat, which stretches to the full width.
    nestFits = takenWidth(t, u) <= nestInner(input.width, nestH).w;
  }
  const matH = 2 * MAT_BORDER + sz.header + bodyH;
  const totalH = matH + (trayH > 0 ? ROW_GAP + trayH : 0) + (nestH > 0 ? ROW_GAP + nestH : 0);
  return {
    u,
    rodsPerRow,
    flatsPerRow,
    colW,
    bodyH,
    piecesH,
    trayH,
    nestH,
    matW,
    totalH,
    caps,
    fits: matW <= input.width && totalH <= input.height && nestFits,
  };
}

/** Rows-of candidates for `n` pieces: one row, two rows, three rows (flats also 2 × 2). */
function rowOptions(n: number, preferred: readonly number[]): number[] {
  const opts = new Set<number>();
  for (const p of preferred) opts.add(Math.max(1, Math.min(p, Math.max(1, n))));
  for (const rows of [1, 2, 3, 4]) opts.add(Math.max(1, Math.ceil(n / rows)));
  return [...opts].sort((a, b) => b - a);
}

function firstFit(input: OnePlanInput, u: number): MatPlan | null {
  for (const r of rowOptions(input.caps.mat.tens, [20, 10, 5])) {
    for (const f of rowOptions(input.caps.mat.hundreds, [2])) {
      const p = measurePlan(input, u, r, f);
      if (p.fits) return p;
    }
  }
  return null;
}

/** The mat, tray and nest at one moment of an item. */
export interface MatState {
  mat: Hto;
  pending: Hto | null;
  taken: Hto | null;
}

/**
 * The states a child passes through on the expected path: every trade, add and take (takes a
 * column at a time). The item's scale is chosen so that all of them fit.
 */
export function pathStates(c: Config): MatState[] {
  const op = c.goal === 'compute' ? c.operation : undefined;
  const mat = { ...c.start };
  const pending = op?.op === '+' ? { ...op.operand } : null;
  const taken = op?.op === '-' ? { hundreds: 0, tens: 0, ones: 0 } : null;
  const out: MatState[] = [];
  const snap = () =>
    out.push({
      mat: { ...mat },
      pending:
        pending && (pending.hundreds || pending.tens || pending.ones) ? { ...pending } : null,
      taken: taken ? { ...taken } : null,
    });
  const brk = (from: Column, to: Column) => {
    mat[from] -= 1;
    mat[to] += 10;
    snap();
  };
  const bundle = (from: Column, to: Column) => {
    mat[from] -= 10;
    mat[to] += 1;
    snap();
  };
  snap();
  if (c.goal === 'regroup-to') {
    const t = c.regroupTarget ?? c.start;
    for (let i = 0; i < 20 && mat.hundreds > t.hundreds; i++) brk('hundreds', 'tens');
    for (let i = 0; i < 20 && mat.hundreds < t.hundreds && mat.tens >= 10; i++)
      bundle('tens', 'hundreds');
    for (let i = 0; i < 20 && mat.ones < t.ones && mat.tens > 0; i++) brk('tens', 'ones');
    for (let i = 0; i < 20 && mat.ones > t.ones && mat.ones >= 10; i++) bundle('ones', 'tens');
  } else if (op && pending) {
    for (const k of ['ones', 'tens', 'hundreds'] as const) {
      if (pending[k] === 0) continue;
      mat[k] += pending[k];
      pending[k] = 0;
      snap();
    }
    if (mat.ones >= 10) bundle('ones', 'tens');
    if (mat.tens >= 10) bundle('tens', 'hundreds');
  } else if (op && taken) {
    const o = op.operand;
    if (mat.ones < o.ones) {
      if (mat.tens === 0 && mat.hundreds > 0) brk('hundreds', 'tens');
      if (mat.tens > 0) brk('tens', 'ones');
    }
    if (mat.tens < o.tens && mat.hundreds > 0) brk('hundreds', 'tens');
    for (const k of ['ones', 'tens', 'hundreds'] as const) {
      const n = Math.min(o[k], mat[k]);
      if (n === 0) continue;
      mat[k] -= n;
      taken[k] += n;
      snap();
    }
  }
  return out;
}

/**
 * The item's one scale: U_MAX when the whole item's plan fits (nothing moves as the child works),
 * or when every state on the expected path fits in its own arrangement (the layout re-wraps, the
 * pieces keep their size); otherwise the biggest unit below that does.
 */
export function itemUnit(
  input: Omit<PlanInput, 'caps'> & { base: MatCaps; path: readonly MatState[] },
): number {
  const { base, path, ...rest } = input;
  for (let u = U_MAX; u >= U_MIN; u--) {
    if (firstFit({ ...rest, caps: base }, u)) return u;
    const all = path.every((s) =>
      firstFit({ ...rest, caps: stateCaps(base, s.mat, s.pending, s.taken) }, u),
    );
    if (all) return u;
  }
  return U_MIN;
}

/**
 * The layout at the item's scale `unit` (default U_MAX): the whole item's plan first, so nothing
 * moves as the child works, else the mat as it is now. Only a state off the expected path that
 * can't fit steps the unit down. The chosen layout is then stretched so the mat fills the space.
 */
export function planMat(input: PlanInput & { unit?: number }): MatPlan {
  const options = Array.isArray(input.caps) ? input.caps : [input.caps as MatCaps];
  for (let u = input.unit ?? U_MAX; u >= U_MIN; u--) {
    for (const caps of options) {
      const p = firstFit({ ...input, caps }, u);
      if (p) return stretch(p, input.width, input.height);
    }
  }
  const last = options[options.length - 1] as MatCaps;
  return stretch(measurePlan({ ...input, caps: last }, U_MIN, 5, 1), input.width, input.height);
}

/**
 * Makes the mat fill the space: the spare height goes to the columns' piece area (the board
 * grows; the pieces keep their size), and the spare width evens out the columns.
 */
export function stretch(plan: MatPlan, width: number, height = plan.totalH): MatPlan {
  const tallH = Math.floor(height - plan.totalH);
  const tall =
    tallH > 0 ? { ...plan, bodyH: plan.bodyH + tallH, totalH: plan.totalH + tallH } : plan;
  return stretchWidth(tall, width);
}

/**
 * Shares the spare width so the columns come out as even as possible: the narrowest grow first
 * (water filling), so a column with few pieces is never left squeezed beside a wide one.
 */
function stretchWidth(plan: MatPlan, width: number): MatPlan {
  const cols = (['hundreds', 'tens', 'ones'] as const).filter((c) => plan.colW[c] > 0);
  const spare = Math.floor(width - plan.matW);
  if (spare <= 0 || cols.length === 0) return plan;
  const colW = { ...plan.colW };
  const total = cols.reduce((a, c) => a + colW[c], 0) + spare;
  // The level L where Σ max(w, L) = total.
  const sorted = cols.map((c) => colW[c]).sort((a, b) => a - b);
  let level = total / cols.length;
  for (let k = sorted.length; k > 0; k--) {
    const fixed = sorted.slice(k).reduce((a, w) => a + w, 0);
    const l = (total - fixed) / k;
    if (l >= (sorted[k - 1] ?? 0)) {
      level = l;
      break;
    }
  }
  let used = 0;
  for (const c of cols) {
    const w = Math.max(colW[c], Math.floor(level));
    used += w - colW[c];
    colW[c] = w;
  }
  // Rounding leftovers go to the tens.
  colW.tens += spare - used;
  return { ...plan, colW, matW: plan.matW + spare };
}
