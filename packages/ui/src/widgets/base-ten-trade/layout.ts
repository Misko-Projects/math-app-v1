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

/** The largest and smallest unit edge, px. One unit is one ones piece and one rod segment. */
export const U_MAX = 30;
export const U_MIN = 8;

/** Fixed sizes (px) that the stylesheet mirrors through the inline custom properties. */
export const GAP = 12; // --target-gap: between hit targets (06 §4)
export const MAT_BORDER = 5;
export const COL_PAD = 10;
export const TRAY_PAD = 12;
/** Room around a waiting group inside its draggable box. */
export const GROUP_PAD = 6;
export const ROW_GAP = 16; // between the widget's rows (problem, mat, tray or nest)

/** The gull's room at the nest's right end, px (the nest art spans the rest). */
export const GULL_W = 52;
/** Where the taken pieces rest: on the hollow's floor, just above the front wall's lowest edge. */
const NEST_FLOOR = 0.72;
const NEST_TOP = 8;
/** The pieces keep to the middle of the hollow, where its front wall is lowest. */
const NEST_SIDE = 0.17;

/** The area the taken pieces sit in, inside a nest `w` × `h` px. */
export function nestInner(w: number, h: number): Box {
  const art = w - GULL_W;
  return {
    x: Math.round(art * NEST_SIDE),
    y: NEST_TOP,
    w: Math.round(art * (1 - 2 * NEST_SIDE)),
    h: Math.round(h * NEST_FLOOR) - NEST_TOP,
  };
}

/** A nest tall enough for pieces `tall` px high. */
export const nestHeightFor = (tall: number) => Math.ceil((tall + NEST_TOP) / NEST_FLOOR);

/** Pieces waiting in the tray and taken into the nest are drawn smaller than on the mat. */
export const trayUnit = (u: number) => Math.max(6, Math.round(u * 0.65));
export const nestUnit = (u: number) => Math.max(6, Math.round(u * 0.6));

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
    headerMin: { hundreds: 150, tens: 104, ones: 110 },
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
    flat: Math.max(6, Math.round(u * 0.8)),
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
 * Pieces taken away, in the nest (`box`, its inner area): hundreds, then tens, then ones, side by
 * side at edge `ub`, centred across and resting on the floor (the box's bottom).
 */
export function placeTaken(
  taken: Hto,
  ub: number,
  box: { w: number; h: number },
): Record<Column, Box[]> {
  const groups: Record<Column, Box[]> = {
    hundreds: naturalLayout('hundreds', taken.hundreds, ub, 10),
    tens: naturalLayout('tens', taken.tens, ub, 10),
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
 * taken than asked): the mat re-plans with a smaller unit rather than overlap pieces.
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

// ---------- choosing the unit size ----------

export interface MatPlan {
  u: number;
  /** Unit edge of the pieces waiting in the tray. */
  ut: number;
  /** Unit edge of the pieces in the nest. */
  ub: number;
  /** Rods a row in the tens column. */
  rodsPerRow: number;
  /** Flats a row in the hundreds column. */
  flatsPerRow: number;
  colW: Record<Column, number>;
  /** Height of the columns' piece area (below the headers), padding included. */
  bodyH: number;
  /** Height of the adding tray (0 without one). */
  trayH: number;
  /** Height of the take-away nest (0 without one). */
  nestH: number;
  matW: number;
  /** Mat, tray and nest, with the gaps between them. */
  totalH: number;
  /** False when even the smallest unit overflows; the layout then squeezes. */
  fits: boolean;
}

export interface PlanInput {
  caps: MatCaps;
  age: AgeMode;
  /** Width available to the mat, px. The mat fills it. */
  width: number;
  /** Height available to the mat, tray and nest together, px. */
  height: number;
}

function contentH(kind: Column, n: number, u: number, perRow: number): number {
  return extent(naturalLayout(kind, n, u, perRow)).h;
}

function contentW(kind: Column, n: number, u: number, perRow: number): number {
  return extent(naturalLayout(kind, n, u, perRow)).w;
}

const perRowFor = (kind: Column, rodsPerRow: number, flatsPerRow: number) =>
  kind === 'tens' ? rodsPerRow : kind === 'hundreds' ? flatsPerRow : ONES_PER_ROW;

/** One candidate layout at unit `u`, before it is stretched to the available width. */
export function measurePlan(
  input: PlanInput,
  u: number,
  rodsPerRow: number,
  flatsPerRow = 10,
): MatPlan {
  const { caps, age } = input;
  const sz = ageSizes(age);
  const cols = caps.columns;
  const tray = caps.tray;
  const ut = trayUnit(u);
  const colW = { hundreds: 0, tens: 0, ones: 0 } as Record<Column, number>;
  const planned = (c: Column) =>
    // A column always has room for one piece of its kind (a flat only if one can exist).
    Math.max(c === 'hundreds' && !caps.flatReachable ? 0 : 1, caps.mat[c]);
  for (const c of cols) {
    const per = perRowFor(c, rodsPerRow, flatsPerRow);
    const across = c === 'ones' ? planned(c) : Math.min(planned(c), per);
    const need = Math.max(
      contentW(c, across, u, per),
      tray ? contentW(c, tray[c], ut, 10) + 2 * GROUP_PAD : 0,
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
        Math.max(sz.target, ...cols.map((c) => contentH(c, tray[c], ut, 10) + 2 * GROUP_PAD)) +
          2 * TRAY_PAD,
      )
    : 0;
  const ub = nestUnit(u);
  let nestH = 0;
  if (caps.taken) {
    const t = caps.taken;
    const piecesTall = Math.max(
      t.hundreds > 0 || t.tens > 0 ? ub * 10 : 0,
      contentH('ones', t.ones, ub, ONES_PER_ROW),
    );
    // At least a target tall (the nest is where pieces are dropped).
    nestH = Math.max(sz.target + 2 * GAP, nestHeightFor(piecesTall));
  }
  const matH = 2 * MAT_BORDER + sz.header + bodyH;
  const totalH = matH + (trayH > 0 ? ROW_GAP + trayH : 0) + (nestH > 0 ? ROW_GAP + nestH : 0);
  return {
    u,
    ut,
    ub,
    rodsPerRow,
    flatsPerRow,
    colW,
    bodyH,
    trayH,
    nestH,
    matW,
    totalH,
    fits: matW <= input.width && totalH <= input.height,
  };
}

/** Rows-of candidates for `n` pieces: one row, two rows, three rows. */
function rowOptions(n: number, preferred: readonly number[]): number[] {
  const opts = new Set<number>();
  for (const p of preferred) opts.add(Math.max(1, Math.min(p, Math.max(1, n))));
  for (const rows of [1, 2, 3]) opts.add(Math.max(1, Math.ceil(n / rows)));
  return [...opts].sort((a, b) => b - a);
}

/**
 * The biggest unit (U_MAX down to U_MIN) at which the mat, its tray and the nest fit the space,
 * trying fewer, longer rows of rods and flats first. The chosen layout is then stretched so the
 * mat fills the width: every column shares the spare room.
 */
export function planMat(input: PlanInput): MatPlan {
  const rods = rowOptions(input.caps.mat.tens, [20, 10, 5]);
  const flats = rowOptions(input.caps.mat.hundreds, []);
  let best: MatPlan | null = null;
  for (let u = U_MAX; u >= U_MIN && !best; u--) {
    for (const r of rods) {
      for (const f of flats) {
        const p = measurePlan(input, u, r, f);
        if (p.fits) {
          best = p;
          break;
        }
      }
      if (best) break;
    }
  }
  const plan = best ?? measurePlan(input, U_MIN, 5, 1);
  return stretch(plan, input.width, input.height);
}

/**
 * Makes the mat fill the space: the spare width is shared between the columns, and the spare
 * height goes to the columns' piece area (the board grows; the pieces keep their size).
 */
export function stretch(plan: MatPlan, width: number, height = plan.totalH): MatPlan {
  const tallH = Math.floor(height - plan.totalH);
  const tall =
    tallH > 0 ? { ...plan, bodyH: plan.bodyH + tallH, totalH: plan.totalH + tallH } : plan;
  return stretchWidth(tall, width);
}

function stretchWidth(plan: MatPlan, width: number): MatPlan {
  const cols = (['hundreds', 'tens', 'ones'] as const).filter((c) => plan.colW[c] > 0);
  const spare = Math.floor(width - plan.matW);
  if (spare <= 0 || cols.length === 0) return plan;
  const each = Math.floor(spare / cols.length);
  const colW = { ...plan.colW };
  for (const c of cols) colW[c] += each;
  // The odd pixels go to the tens, the column with the most pieces in a row.
  colW.tens += spare - each * cols.length;
  return { ...plan, colW, matW: plan.matW + spare };
}
