// Pure geometry for the base-ten-trade mat (03 §5.5): which columns the mat shows, how many pieces
// each column plans room for, how big one unit is drawn so the whole widget fills (and fits) its
// area, and where each piece sits in its column. Pieces never overlap: every one stays separately
// countable, so when more must fit, the unit shrinks. DOM-free, so it is unit-tested.
import { type Column, type Hto, htoValue, tradeShowsDisks } from '@number-island/engine';
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

/**
 * Place-value disks (03 §5.5, K02; the engine's tradeShowsDisks): with hundreds in play every piece
 * is a disk of one size, labelled with its value, in rows of five, and the unit `u` is the disk's
 * diameter. Disks are drawn as large as the room allows, up to DISK_MAX; DISK_FLOOR is the
 * smallest a shipped item may need, and DISK_MIN only keeps a mat past any item on screen. The
 * functions below take `disks` where a piece's shape matters.
 */
export const DISK_MAX = 48;
export const DISK_FLOOR = 26;
export const DISK_MIN = 14;

/** The unit's range for a mat: `max` when it fits, `floor` the least an item should need. */
export const unitRange = (disks = false) =>
  disks
    ? { max: DISK_MAX, floor: DISK_FLOOR, min: DISK_MIN }
    : { max: U_MAX, floor: U_FLOOR, min: U_MIN };

/** Fixed sizes (px) that the stylesheet mirrors through the inline custom properties. */
export const GAP = 12; // --target-gap: between hit targets (06 §4)
/**
 * The clear room between any piece and any frame, gutter, border or rim (a column's edges, a
 * waiting group's holder, the tray, the nest's rims). Every clearance below is built from it, and
 * the stories assert it.
 */
export const GUTTER = 12;
/** Inner padding of a card (the column algorithm). */
export const CARD_PAD = 16;
/** Border widths of the holders drawn around pieces (stylesheet). */
const HOLDER_BORDER = 3;
const TRAY_BORDER = 3;
export const MAT_BORDER = 4;
export const COL_PAD = GUTTER;
/** The tray's padding: a waiting group's holder is GUTTER clear of the tray's border. */
export const TRAY_PAD = GUTTER + TRAY_BORDER;
/** Room around a waiting group inside its holder: GUTTER clear of the holder's border. */
export const GROUP_PAD = GUTTER + HOLDER_BORDER;
export const ROW_GAP = 12; // between the widget's rows (problem, mat, tray or nest)

/** The gull's room at the nest's right end, px (the nest art spans the rest). */
export const GULL_W = 52;
/** The hollow's top rim: its 3 px border plus a 6 px twig band (.ni-btt__hollow). */
export const NEST_RIM = 9;
/** The front wall band at the nest's foot (.ni-btt__nest-wall), its top edge straight. */
export const NEST_WALL_H = 40;
/** The taken pieces keep GUTTER clear of the top rim and of the front wall. */
export const NEST_WALL = NEST_WALL_H + GUTTER;
const NEST_TOP = NEST_RIM + GUTTER;
/**
 * The hollow is a long stadium (straight rim, rounded ends of radius NEST_CURVE, see
 * .ni-btt__hollow): the pieces keep GUTTER clear of where its ends start to curve.
 */
export const NEST_CURVE = 80;
export const NEST_END = NEST_CURVE + GUTTER;

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
    header: 44,
    // Icon plus a one-word caption.
    tradeH: 86,
    headerMin: { hundreds: 150, tens: 100, ones: 110 },
  };
}

// ---------- the widget's rows and side panel ----------

/**
 * The widget's tallest, padding included: the measured room's height up to this (06 §1), and what
 * a host that grows with its content gets.
 */
export const BUDGET = 660;
export const ROOT_PAD_Y = 6;
/** The space kit.css keeps under each number-pad key for its shadow (`.ni-pad__key` margin). */
export const PAD_KEY_SHADOW = 4;
/** The algorithm card's height (.ni-btt__work in the stylesheet; K is 16 px taller). */
export const WORK_H = 226;
export const SIDE_GAP = 12;

export interface SideLayout {
  /** Five places or more: the algorithm is the problem row on its own, above the mat. */
  wideWork: boolean;
  /** The algorithm sits in the side panel, above the pad. */
  workInSide: boolean;
  /** "Check" stands beside the pad's foot (K, with the algorithm and the pad in the side). */
  checkBeside: boolean;
  showProblemRow: boolean;
  problemH: number;
  /** The expression card's height (in the problem row). */
  cardH: number;
  /** The height left for the mat, the tray and the nest. */
  spaceH: number;
  /** The side panel's content height. */
  sideH: number;
  /**
   * A short room: the problem card (the expression, or the goal chips in a column) sits in the
   * side panel instead of over the mat, so the mat keeps the widget's whole height.
   */
  problemInSide?: true;
  /** With the problem in the side: the pad is 4 × 3 (three rows) and "check" beside the card. */
  padWide?: true;
  /**
   * A regroup of place-value disks: "check" stands at the end of the problem row and there is no
   * side panel, so the mat has the widget's whole width (three columns of five disks need it).
   */
  checkInRow?: true;
}

/**
 * Where the algorithm, the pad and "check" go, and the height left for the mat. The side panel
 * holds the algorithm, the pad, then "check" right under the pad (06 §4). If that is too tall
 * (K, with its 80 px keys), there are two ways (`allowBeside` picks; the widget plans both and
 * takes the one whose mat fits, at the bigger unit):
 * - "check" beside the pad's foot: the algorithm stays in the side and the mat keeps the
 *   widget's whole height, but a narrower width (a nine-flat take-away needs the height);
 * - the algorithm up in the problem row: the mat is wider but shorter (many flats to add need
 *   the width).
 * An algorithm of five places or more (a 4-digit addend) is the problem row: beside the mat it
 * leaves the mat no room.
 */
export function sideLayout(o: {
  age: AgeMode;
  goal: Config['goal'];
  showWork: boolean;
  thenAsk: boolean;
  answerInWork: boolean;
  places: number;
  allowBeside?: boolean;
  /** The widget's height, padding included (default BUDGET). */
  budget?: number;
  /**
   * The short-room arrangement: the problem card in the side panel, `inSide` being that card's
   * box as measured. The pad stays 3 × 4 over "check" when that fits under the card; else it is
   * 4 × 3 and "check" stands beside the card.
   */
  inSide?: { w: number; h: number };
  /** No side panel: "check" at the end of the problem row (a regroup of disks, no pad). */
  checkInRow?: boolean;
}): SideLayout {
  const sz = ageSizes(o.age);
  const limit = (o.budget ?? BUDGET) - 2 * ROOT_PAD_Y;
  if (o.checkInRow) {
    // The goal chips' card; "check" (a target and its shadow) is no taller.
    const cardH = 92;
    return {
      wideWork: false,
      workInSide: false,
      checkBeside: false,
      showProblemRow: true,
      problemH: cardH,
      cardH,
      spaceH: limit - (cardH + ROW_GAP),
      sideH: 0,
      checkInRow: true,
    };
  }
  const workH = WORK_H + (o.age === 'k' ? 16 : 0);
  // The pad's keys and "check" are target-sized (base-ten-trade.css: .ni-btt__side); each pad
  // row is the target plus the key's 4 px shadow margin (kit.css .ni-pad__key).
  const padH = 4 * (sz.target + PAD_KEY_SHADOW) + 3 * 12;
  const checkH = sz.target + 6;
  if (o.inSide) {
    const card = o.inSide.h;
    const stacked = card + SIDE_GAP + (o.thenAsk ? padH + SIDE_GAP : 0) + checkH;
    const padWide = o.thenAsk && stacked > limit;
    const wideH = 3 * (sz.target + PAD_KEY_SHADOW) + 2 * 12;
    return {
      wideWork: false,
      workInSide: false,
      checkBeside: false,
      showProblemRow: false,
      problemH: 0,
      cardH: card,
      spaceH: limit,
      sideH: padWide ? Math.max(card, checkH) + SIDE_GAP + wideH : stacked,
      problemInSide: true,
      ...(padWide ? { padWide: true as const } : {}),
    };
  }
  const work = o.showWork ? workH + SIDE_GAP : 0;
  const fullSide = work + (o.thenAsk ? padH + SIDE_GAP : 0) + checkH;
  const besideSide = work + Math.max(padH, checkH);
  const wideWork = o.showWork && o.places > 4;
  const fits = fullSide <= limit;
  const checkBeside =
    (o.allowBeside ?? true) && o.showWork && !wideWork && o.thenAsk && !fits && besideSide <= limit;
  const workInSide = o.showWork && !wideWork && (fits || checkBeside);
  const bigTarget = o.age === 'k' ? 96 : 76;
  const cardH = o.thenAsk && !o.answerInWork ? bigTarget + 26 : o.goal === 'regroup-to' ? 92 : 76;
  // With the algorithm, the problem is written there (in columns), so no separate expression row:
  // the mat gets that height.
  const showProblemRow = !o.showWork || !workInSide;
  const problemH = !showProblemRow ? 0 : o.showWork ? workH : cardH;
  const spaceH = limit - (showProblemRow ? problemH + ROW_GAP : 0);
  const sideH = checkBeside
    ? besideSide
    : workInSide
      ? fullSide
      : fullSide - (o.showWork ? workH + SIDE_GAP : 0);
  return {
    wideWork,
    workInSide,
    checkBeside,
    showProblemRow,
    problemH,
    cardH,
    spaceH,
    sideH,
  };
}

/** The measured widths (px) of the side panel's parts; the panel is as wide as what it holds. */
export interface SideParts {
  pad: number;
  check: number;
  card: number;
  /** The problem card as it is drawn in the side panel (a hidden copy is measured): w × h. */
  problem?: { w: number; h: number };
  /** "Check" without its caption, as it stands beside or under that card (measured likewise). */
  checkIcon?: number;
}

/** The 4 × 3 pad's width (base-ten-trade.css: target-sized keys, 12 px apart). */
export const widePadWidth = (age: AgeMode) => 4 * ageSizes(age).target + 3 * 12;

/** The side panel's width for a layout, from its parts' widths. */
export function sideWidth(s: SideLayout, parts: SideParts, age: AgeMode = 'g1-up'): number {
  if (s.checkInRow) return 0;
  if (s.problemInSide) {
    const problem = parts.problem?.w ?? 0;
    const check = parts.checkIcon ?? parts.check;
    return s.padWide
      ? Math.max(problem + SIDE_GAP + check, widePadWidth(age))
      : Math.max(problem, parts.pad, check);
  }
  const card = s.workInSide ? parts.card : 0;
  return s.checkBeside
    ? Math.max(card, parts.pad + SIDE_GAP + parts.check)
    : Math.max(card, parts.pad, parts.check);
}

/**
 * Chooses between sideLayout's two ways when the side can't hold the algorithm, the pad and
 * "check" stacked: the one at which every step of the item fits (itemFit), at the bigger unit; a
 * tie keeps the algorithm in the problem row. `contentW` is the widget's width for the mat and
 * the side panel together (the grid gap, GAP, between them included).
 *
 * Without an algorithm there is a third way, for short rooms (`parts.problem` measured): the
 * problem card in the side panel (sideLayout `inSide`), so the mat has the whole height. It is
 * taken when the usual layout does not fit the height (its side panel, or the item at any unit)
 * or draws the pieces smaller. `arrange` holds the answer once it is made (the widget keeps the
 * one made for the smallest room the item has had), so a room that grows re-sizes the layout.
 */
export function chooseSide(
  o: Parameters<typeof sideLayout>[0] & {
    contentW: number;
    parts: SideParts;
    base: MatCaps;
    path: readonly MatState[];
    arrange?: 'usual' | 'in-side';
  },
): { side: SideLayout; width: number } {
  const { contentW, parts, base, path, arrange, ...args } = o;
  if (args.checkInRow) {
    // No side panel and no gap beside the mat: the whole content width.
    return { side: sideLayout(args), width: contentW };
  }
  const widthFor = (s: SideLayout) => contentW - GAP - sideWidth(s, parts, args.age);
  const fit = (s: SideLayout) =>
    itemFit({ age: args.age, width: widthFor(s), height: s.spaceH, base, path });
  const usual = (): SideLayout => {
    const beside = sideLayout({ ...args, allowBeside: true });
    const row = sideLayout({ ...args, allowBeside: false });
    if (!beside.checkBeside) return beside;
    if (contentW <= 0) return row;
    const a = fit(beside);
    const b = fit(row);
    return (a.fits && !b.fits) || (a.fits === b.fits && a.unit > b.unit) ? beside : row;
  };
  const inSide = (): SideLayout | null =>
    parts.problem && !args.showWork ? sideLayout({ ...args, inSide: parts.problem }) : null;
  const pick = (): SideLayout => {
    const u = usual();
    const s = arrange === 'usual' ? null : inSide();
    if (!s || contentW <= 0) return u;
    if (arrange === 'in-side') return s;
    const limit = (args.budget ?? BUDGET) - 2 * ROOT_PAD_Y;
    const fu = fit(u);
    const fs = fit(s);
    const okU = fu.fits && u.sideH <= limit;
    const okS = fs.fits && s.sideH <= limit;
    return okS && (!okU || fs.unit > fu.unit) ? s : u;
  };
  const side = pick();
  return { side, width: widthFor(side) };
}

/**
 * The strip between two columns: a pair of trade buttons exactly as wide as a target. The target
 * gap to the columns is kept inside them: their hit pads are inset by GAP (.ni-btt__pad).
 */
export const stripWidth = (age: AgeMode) => ageSizes(age).target;

/**
 * How far a column's hit pad (its drop target, tap pad or grab item) is inset from the column's
 * sides, px. Beside a trade strip always GAP: the strip's buttons fill it, so the two targets
 * stay 12 px apart. On the mat's outer side GAP too, unless the column (`colW` px wide) is too
 * narrow for a target-wide pad: then less, down to 0. Only the mat's frame is there; the next
 * target outside it is the grid gap plus the frame away.
 */
export function colInsets(
  index: number,
  count: number,
  colW = Number.POSITIVE_INFINITY,
  age: AgeMode = 'g1-up',
): { left: number; right: number } {
  const innerL = index > 0;
  const innerR = index < count - 1;
  const inner = (innerL ? GAP : 0) + (innerR ? GAP : 0);
  const outer = Math.max(0, Math.min(GAP, colW - ageSizes(age).target - inner));
  return { left: innerL ? GAP : outer, right: innerR ? GAP : outer };
}

/**
 * How far a waiting group's holder must sit from the outer side of an outer tray cell: GUTTER
 * clear of the tray's border (the cell starts MAT_BORDER inside the tray's outer edge).
 */
const TRAY_EDGE = GUTTER + TRAY_BORDER - MAT_BORDER;

/** A waiting group's holder width: a target at least (it is dragged), and its pieces padded. */
export const holderWidth = (kind: Column, n: number, u: number, age: AgeMode, disks = false) =>
  Math.max(ageSizes(age).target, contentW(kind, n, u, 10, disks) + 2 * GROUP_PAD);

/**
 * The margins that keep a waiting group's holder (`holderW` px) TRAY_EDGE clear of the tray's
 * border in an outer cell `colW` px wide. Centred when there is room (no margin); otherwise it
 * moves toward the mat's middle just enough (a flex-centred item moves by half its margin).
 */
export function holderMargins(
  index: number,
  count: number,
  colW: number,
  holderW: number,
): { left: number; right: number } {
  const shift = Math.max(0, TRAY_EDGE - (colW - holderW) / 2);
  return {
    left: index === 0 ? 2 * shift : 0,
    right: index === count - 1 && index !== 0 ? 2 * shift : 0,
  };
}

/** The narrowest a column may be so its hit pad is at least a target wide inside its insets. */
export function colMinWidth(age: AgeMode, index: number, count: number): number {
  return ageSizes(age).target + (index > 0 ? GAP : 0) + (index < count - 1 ? GAP : 0);
}

// ---------- pieces ----------

export const pieceSize = (kind: Column, u: number, disks = false): { w: number; h: number } =>
  disks
    ? { w: u, h: u }
    : kind === 'hundreds'
      ? { w: u * 10, h: u * 10 }
      : kind === 'tens'
        ? { w: u, h: u * 10 }
        : { w: u, h: u };

/** Spacing between pieces at unit edge `u`, px. */
export function spacing(u: number, disks = false) {
  return {
    /** Between ones (or disks) in a row of five. */
    unit: disks ? Math.max(3, Math.round(u * 0.1)) : Math.max(2, Math.round(u * 0.22)),
    /** Extra space between blocks of ten ones or disks (two rows of five). */
    ten: disks ? Math.max(6, Math.round(u * 0.25)) : Math.max(4, Math.round(u * 0.6)),
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
export function naturalLayout(
  kind: Column,
  n: number,
  u: number,
  perRow = 10,
  /** Place-value disks: every kind sits as the ones do, five a row. */
  disks = false,
): Box[] {
  const s = spacing(u, disks);
  const { w, h } = pieceSize(kind, u, disks);
  const per = Math.max(1, perRow);
  const out: Box[] = [];
  for (let i = 0; i < n; i++) {
    if (kind === 'ones' || disks) {
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
export function piecesAcross(kind: Column, width: number, u: number, disks = false): number {
  let n = 1;
  while (n < 40) {
    if (extent(naturalLayout(kind, n + 1, u, n + 1, disks)).w > width) break;
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
  disks = false,
): Box[] {
  if (n <= 0) return [];
  const per =
    kind === 'ones' || disks
      ? ONES_PER_ROW
      : Math.max(1, Math.min(perRow, piecesAcross(kind, box.w, u)));
  const boxes = naturalLayout(kind, n, u, per, disks);
  const planned = extent(naturalLayout(kind, Math.max(n, capacity), u, per, disks));
  const { w: pw, h: ph } = pieceSize(kind, u, disks);
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

/** Lying rods in stacks of `perStack`, side by side (a full stack wraps into the next one). */
export function rodStacks(n: number, u: number, perStack: number): Box[] {
  const per = Math.max(1, perStack);
  const one = lyingRods(Math.min(n, per), u);
  const gap = spacing(u).flat;
  return Array.from({ length: n }, (_, i) => ({
    ...(one[i % per] as Box),
    x: Math.floor(i / per) * (u * 10 + gap),
  }));
}

/** `n` pieces wrapped into 1, 2, 3 … rows (or stacks): how many go in each, most first. */
function wrapOptions(n: number): number[] {
  const opts = new Set<number>();
  for (let rows = 1; rows <= Math.max(1, n); rows++) opts.add(Math.max(1, Math.ceil(n / rows)));
  return [...opts];
}

const KINDS = ['hundreds', 'tens', 'ones'] as const;

/** The taken pieces' arrangement in the nest: each kind's boxes from its origin, and its size. */
export interface NestArrangement {
  groups: Record<Column, Box[]>;
  /** Each taken kind's slot across the nest (its put-back control), from the arrangement's left. */
  slots: Partial<Record<Column, { x: number; w: number }>>;
  w: number;
  h: number;
}

/**
 * Hundreds (`flatsPerRow` a row), tens (lying, `rodsPerStack` a stack), ones, side by side. With
 * `minSlot` (the age's tap target) each kind stands centred in a slot at least that wide, the
 * slots at least 12 px apart: a slot is the kind's put-back control (nestSlots).
 */
function nestGroups(
  t: Hto,
  u: number,
  flatsPerRow: number,
  rodsPerStack: number,
  minSlot = 0,
  disks = false,
) {
  const gap = disks ? Math.max(12, u) : minSlot > 0 ? Math.max(12, u * 2) : Math.max(10, u * 2);
  // Disks of every kind sit in their rows of five, as on the mat.
  const raw: Record<Column, Box[]> = disks
    ? {
        hundreds: naturalLayout('hundreds', t.hundreds, u, 10, true),
        tens: naturalLayout('tens', t.tens, u, 10, true),
        ones: naturalLayout('ones', t.ones, u, 10, true),
      }
    : {
        hundreds: naturalLayout('hundreds', t.hundreds, u, flatsPerRow),
        tens: rodStacks(t.tens, u, rodsPerStack),
        ones: naturalLayout('ones', t.ones, u),
      };
  const groups: Record<Column, Box[]> = { hundreds: [], tens: [], ones: [] };
  const slots: Partial<Record<Column, { x: number; w: number }>> = {};
  let x = 0;
  let h = 0;
  for (const c of KINDS) {
    const g = raw[c];
    if (g.length === 0) continue;
    const ext = extent(g);
    const slot = Math.max(ext.w, minSlot);
    const pad = Math.floor((slot - ext.w) / 2);
    groups[c] = g.map((b) => ({ ...b, x: b.x + x + pad }));
    slots[c] = { x, w: slot };
    x += slot + gap;
    h = Math.max(h, ext.h);
  }
  return { groups, slots, w: Math.max(0, x - gap), h };
}

/**
 * How the taken pieces sit in a nest whose inner area is `innerW` px wide: hundreds, then tens
 * (lying down), then ones, side by side, resting on the floor. When one row is too wide, flats
 * wrap into rows and rods into more stacks: of the arrangements that fit across, the shallowest
 * wins (then the narrowest). Pieces never overlap and are never squeezed; null when even the
 * narrowest arrangement (one flat a row, rods in stacks of one) is wider than the nest.
 */
export function arrangeTaken(
  t: Hto,
  u: number,
  innerW: number,
  minSlot = 0,
  disks = false,
): NestArrangement | null {
  let best: NestArrangement | null = null;
  for (const f of disks ? [1] : wrapOptions(t.hundreds)) {
    for (const r of disks ? [1] : wrapOptions(t.tens)) {
      const a = nestGroups(t, u, f, r, minSlot, disks);
      if (a.w > innerW) continue;
      if (!best || a.h < best.h || (a.h === best.h && a.w < best.w)) best = a;
    }
  }
  return best;
}

/**
 * Pieces taken away, in the nest (`box`, its inner area), at edge `ub`: arranged by arrangeTaken,
 * centred across, each kind resting on the floor (the box's bottom). A planned nest always holds
 * them (measurePlan sizes it for this arrangement); should nothing fit across, the narrowest
 * arrangement is used as is: never squeezed, never overlapping.
 */
export function placeTaken(
  taken: Hto,
  ub: number,
  box: { w: number; h: number },
  minSlot = 0,
  disks = false,
): Record<Column, Box[]> {
  const a =
    arrangeTaken(taken, ub, box.w, minSlot, disks) ?? nestGroups(taken, ub, 1, 1, minSlot, disks);
  const ox = Math.max(0, (box.w - a.w) / 2);
  const out: Record<Column, Box[]> = { hundreds: [], tens: [], ones: [] };
  for (const c of KINDS) {
    const g = a.groups[c];
    if (g.length === 0) continue;
    const floor = box.h - extent(g.map((b) => ({ ...b, x: 0 }))).h;
    out[c] = g.map((b) => ({ ...b, x: Math.round(ox + b.x), y: Math.round(floor + b.y) }));
  }
  return out;
}

/**
 * The put-back controls of the nest: one per taken kind, as wide as the kind's slot (at least
 * `minSlot`, the tap target) and as tall as the nest's inner area, at least 12 px apart. Same
 * arrangement as placeTaken, so each control covers its own pieces.
 */
export function nestSlots(
  taken: Hto,
  ub: number,
  box: { w: number; h: number },
  minSlot: number,
  disks = false,
): Partial<Record<Column, Box>> {
  const a =
    arrangeTaken(taken, ub, box.w, minSlot, disks) ?? nestGroups(taken, ub, 1, 1, minSlot, disks);
  const ox = Math.max(0, (box.w - a.w) / 2);
  const out: Partial<Record<Column, Box>> = {};
  for (const c of KINDS) {
    const slot = a.slots[c];
    if (slot) out[c] = { x: Math.round(ox + slot.x), y: 0, w: slot.w, h: box.h };
  }
  return out;
}

// ---------- the algorithm's result row ----------

const digitCount = (v: number) => String(Math.max(0, Math.trunc(v))).length;

/**
 * How many places the answer entry has (the algorithm's columns, the pad's length). It comes from
 * the operands, never from the result, so the entry's size can't give the answer (or a carry into
 * a new place) away: `+` one more than the longer addend, `−` as long as the start (the result is
 * never longer). At least 3 (hundreds, tens, ones, the mat's own columns).
 */
export function answerPlaces(config: Config): number {
  const op = config.operation;
  const start = digitCount(htoValue(config.start));
  if (!op) return Math.max(3, start);
  const bound = op.op === '+' ? Math.max(start, digitCount(htoValue(op.operand))) + 1 : start;
  return Math.max(3, bound);
}

/**
 * A number's digits in `places` columns, highest place first, blank (`''`) left of its first
 * digit: 1200 in 4 places is 1 | 2 | 0 | 0, and 27 is '' | '' | 2 | 7.
 */
export function placeDigits(v: number, places: number): string[] {
  const s = String(Math.max(0, Math.trunc(v)));
  return Array.from({ length: places }, (_, i) => s[s.length - places + i] ?? '');
}

/**
 * The number the result boxes form (highest place first), or null while it isn't one yet: the
 * ones box is filled and there is no empty box between filled ones (empty boxes on the left just
 * make a shorter number).
 */
export function digitsValue(d: readonly (number | null)[]): number | null {
  const first = d.findIndex((x) => x !== null);
  if (first < 0) return null;
  let v = 0;
  for (const x of d.slice(first)) {
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
  /** Hundreds are in play: every piece is a place-value disk (the plan's unit is its diameter). */
  disks?: true;
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
    ...(tradeShowsDisks(c) ? { disks: true as const } : {}),
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

function contentH(kind: Column, n: number, u: number, perRow: number, disks = false): number {
  return extent(naturalLayout(kind, n, u, perRow, disks)).h;
}

function contentW(kind: Column, n: number, u: number, perRow: number, disks = false): number {
  return extent(naturalLayout(kind, n, u, perRow, disks)).w;
}

const perRowFor = (kind: Column, rodsPerRow: number, flatsPerRow: number) =>
  kind === 'tens' ? rodsPerRow : kind === 'hundreds' ? flatsPerRow : ONES_PER_ROW;

/** One candidate layout at unit `u`, before it is stretched to fill the space. */
export function measurePlan(
  input: OnePlanInput,
  u: number,
  rodsPerRow: number,
  flatsPerRow = 10,
): MatPlan {
  const { caps, age } = input;
  const disks = caps.disks === true;
  const sz = ageSizes(age);
  const cols = caps.columns;
  const tray = caps.tray;
  const colW = { hundreds: 0, tens: 0, ones: 0 } as Record<Column, number>;
  const planned = (c: Column) =>
    caps.exact
      ? caps.mat[c]
      : // A column always has room for one piece of its kind (a flat only if one can exist).
        Math.max(c === 'hundreds' && !caps.flatReachable ? 0 : 1, caps.mat[c]);
  cols.forEach((c, i) => {
    const per = perRowFor(c, rodsPerRow, flatsPerRow);
    // The ones column always has room for a full row of five (nine ones), never squeezed.
    // (Every column of disks likewise: disks sit five a row.)
    const across =
      c === 'ones' || disks ? Math.max(ONES_PER_ROW, planned(c)) : Math.min(planned(c), per);
    const need = Math.max(
      contentW(c, across, u, per, disks),
      tray ? contentW(c, tray[c], u, 10, disks) + 2 * GROUP_PAD : 0,
    );
    // A waiting group's holder (target-wide at least) keeps TRAY_EDGE clear of the tray's border
    // in an outer cell (holderMargins).
    const outer = i === 0 || i === cols.length - 1;
    const holder =
      tray && tray[c] > 0 ? holderWidth(c, tray[c], u, age, disks) + (outer ? TRAY_EDGE : 0) : 0;
    // The column's own control (its drop target, tap pad or grab item) is at least a target
    // wide inside its insets (colInsets): GAP only beside a trade strip.
    colW[c] = Math.ceil(
      Math.max(sz.headerMin[c], colMinWidth(age, i, cols.length), holder, need + 2 * COL_PAD),
    );
  });
  const strips = (cols.length - 1) * stripWidth(age);
  const matW = 2 * MAT_BORDER + cols.reduce((a, c) => a + colW[c], 0) + strips;
  // The trade strip spans header and body: two buttons and a gap between them.
  const stripNeed = 2 * sz.tradeH + GAP + 2 * 8 - sz.header;
  const piecesH = Math.max(
    0,
    ...cols.map((c) => contentH(c, planned(c), u, perRowFor(c, rodsPerRow, flatsPerRow), disks)),
  );
  const bodyH = Math.ceil(Math.max(stripNeed, piecesH + 2 * COL_PAD));
  const trayH = tray
    ? Math.ceil(
        Math.max(
          sz.target,
          ...cols.map((c) => contentH(c, tray[c], u, 10, disks) + 2 * GROUP_PAD),
        ) +
          2 * TRAY_PAD,
      )
    : 0;
  let nestH = 0;
  let nestFits = true;
  if (caps.taken) {
    // The nest is as wide as the mat, which stretches to the full width; its inner width doesn't
    // depend on its height. The pieces wrap into rows (placeTaken's arrangement) to fit across.
    const arranged = arrangeTaken(caps.taken, u, nestInner(input.width, 0).w, sz.target, disks);
    nestFits = arranged !== null;
    // At least a target tall (the nest is where pieces are dropped).
    nestH = Math.max(sz.target + 2 * GAP, nestHeightFor(arranged?.h ?? 0));
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
 * The states a child passes through on the expected path: every trade, add and take (takes one
 * piece at a time: a piece leaves the mat before the nest's next row is needed, but every step
 * in between must fit too). The item's scale is chosen so that all of them fit.
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
      for (let i = 0; i < n; i++) {
        mat[k] -= 1;
        taken[k] += 1;
        snap();
      }
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
  return itemFit(input).unit;
}

/** itemUnit's unit, and whether the item fits at it at all (false: even U_MIN overflows). */
export function itemFit(
  input: Omit<PlanInput, 'caps'> & { base: MatCaps; path: readonly MatState[] },
): { unit: number; fits: boolean } {
  const { base, path, ...rest } = input;
  const range = unitRange(base.disks);
  for (let u = range.max; u >= range.min; u--) {
    if (firstFit({ ...rest, caps: base }, u)) return { unit: u, fits: true };
    const all = path.every((s) =>
      firstFit({ ...rest, caps: stateCaps(base, s.mat, s.pending, s.taken) }, u),
    );
    if (all) return { unit: u, fits: true };
  }
  return { unit: range.min, fits: false };
}

/** How uneven the columns are once stretched: the widest minus the narrowest, px. */
export function spread(plan: MatPlan): number {
  const ws = (['hundreds', 'tens', 'ones'] as const).map((c) => plan.colW[c]).filter((w) => w > 0);
  return ws.length === 0 ? 0 : Math.max(...ws) - Math.min(...ws);
}

/**
 * The layout at the item's scale `unit` (default U_MAX). Of every arrangement that fits (the whole
 * item's plan, so nothing moves as the child works, or the mat as it is now; rods and flats in
 * one row or wrapped), the one whose stretched columns are the most even wins; a tie keeps the
 * more stable one. Only a state off the expected path that can't fit steps the unit down. The
 * chosen layout is stretched so the mat fills the space.
 */
export function planMat(input: PlanInput & { unit?: number }): MatPlan {
  const options = Array.isArray(input.caps) ? input.caps : [input.caps as MatCaps];
  const range = unitRange(options[0]?.disks);
  for (let u = input.unit ?? range.max; u >= range.min; u--) {
    let best: MatPlan | null = null;
    for (const caps of options) {
      for (const r of rowOptions(caps.mat.tens, [20, 10, 5])) {
        for (const f of rowOptions(caps.mat.hundreds, [2])) {
          const p = measurePlan({ ...input, caps }, u, r, f);
          if (!p.fits) continue;
          const s = stretch(p, input.width, input.height);
          if (!best || spread(s) < spread(best)) best = s;
        }
      }
    }
    if (best) return best;
  }
  const last = options[options.length - 1] as MatCaps;
  return stretch(measurePlan({ ...input, caps: last }, range.min, 5, 1), input.width, input.height);
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

// ---------- a short room: the pieces, then the answer (06 §1) ----------

/**
 * A compute item with a typed answer whose usual layout does not fit the room with pieces a child
 * can count (U_FLOOR; at 960 × 600 the mat, the tray and the side panel need 660 px of a 346 px
 * room) is played in two steps, its parts never smaller:
 *
 * 1. **pieces**: the mat, and beside it the problem (without its answer box), Next where "check"
 *    will be, and under them the adding tray or the take-away box (pieces standing, as on the mat);
 * 2. **answer**: the same mat (still traded on), the problem with its answer box, "check" and
 *    Back beside it, and the number pad as one row of keys under the mat.
 *
 * Next and Back are always offered (no trade is forced) and record nothing. The mat is planned
 * once for the item (from its config, never from what is on it now), so it is the same in both
 * steps; without a hundred in reach (03 §5.5) it has no Hundreds column.
 */

/** The pad in one row: 1–9, 0, back (kit NumberPadKeys `row`). */
export const PAD_ROW_KEYS = 11;
export const padRowWidth = (age: AgeMode) =>
  PAD_ROW_KEYS * ageSizes(age).target + (PAD_ROW_KEYS - 1) * GAP;
/** A key and the 4 px kept under it for its shadow. */
export const padRowHeight = (age: AgeMode) => ageSizes(age).target + PAD_KEY_SHADOW;
/** A big button (Next, Back, "check") and its 6 px ledge. */
export const stepButtonHeight = (age: AgeMode) => ageSizes(age).target + 6;

/** The mat's plan for the steps: no tray or nest under it, and no Hundreds out of reach. */
export function stepsCaps(base: MatCaps): MatCaps {
  const columns: Column[] =
    base.flatReachable || base.disks ? base.columns : base.columns.filter((c) => c !== 'hundreds');
  return { ...base, columns, tray: null, taken: null };
}

/** Kinds side by side, each in a slot a target wide at least, GAP apart. */
export interface StandingArrangement {
  groups: Record<Column, Box[]>;
  slots: Partial<Record<Column, { x: number; w: number }>>;
  w: number;
  h: number;
}

/** Pieces standing as on the mat (rods upright, ones and disks five a row), kind by kind. */
export function standingGroups(
  t: Hto,
  u: number,
  minSlot: number,
  disks = false,
): StandingArrangement {
  const groups: Record<Column, Box[]> = { hundreds: [], tens: [], ones: [] };
  const slots: Partial<Record<Column, { x: number; w: number }>> = {};
  let x = 0;
  let h = 0;
  for (const c of KINDS) {
    if (t[c] <= 0) continue;
    const g = naturalLayout(c, t[c], u, 10, disks);
    const ext = extent(g);
    const slot = Math.max(ext.w, minSlot);
    const pad = Math.floor((slot - ext.w) / 2);
    groups[c] = g.map((b) => ({ ...b, x: b.x + x + pad }));
    slots[c] = { x, w: slot };
    x += slot + GAP;
    h = Math.max(h, ext.h);
  }
  return { groups, slots, w: Math.max(0, x - GAP), h };
}

/** The take-away box's inset from its outer edge to its pieces: its border and GUTTER. */
export const BOX_PAD = GUTTER + TRAY_BORDER;

/** The tray of the steps: its waiting groups side by side, each in its holder, GAP apart. */
export function stepsTraySize(pending: Hto, u: number, age: AgeMode, disks = false) {
  const kinds = KINDS.filter((c) => pending[c] > 0);
  const sz = ageSizes(age);
  const w =
    kinds.reduce((a, c) => a + holderWidth(c, pending[c], u, age, disks), 0) +
    Math.max(0, kinds.length - 1) * GAP;
  const h = Math.max(
    sz.target,
    ...kinds.map((c) => extent(naturalLayout(c, pending[c], u, 10, disks)).h + 2 * GROUP_PAD),
  );
  return { w: w + 2 * TRAY_PAD, h: h + 2 * TRAY_PAD };
}

/** The take-away box for `taken`: its pieces standing, the box a target and 2 GAP tall at least. */
export function stepsTakeSize(taken: Hto, u: number, age: AgeMode, disks = false) {
  const a = standingGroups(taken, u, ageSizes(age).target, disks);
  return {
    w: a.w + 2 * BOX_PAD,
    h: Math.max(ageSizes(age).target + 2 * GAP, a.h + 2 * BOX_PAD),
  };
}

export interface StepsParts {
  /** The problem without its answer box (the pieces step), w × h. */
  bare: { w: number; h: number };
  /** The problem with its answer box (the answer step), w × h. */
  card: { w: number; h: number };
  /** One icon-only big button's width ("check", Next, Back). */
  button: number;
}

/** The first row of either step (the problem and Next, or the problem and "check"), px. */
export const stepRowHeight = (age: AgeMode, parts: StepsParts) =>
  Math.max(parts.bare.h, parts.card.h, stepButtonHeight(age));

export interface StepsPlan {
  fits: boolean;
  /** The pieces' unit (the floor at least, when it fits). */
  unit: number;
  /** The mat's room (it is the same in both steps). */
  matW: number;
  matH: number;
  /** The column beside the mat. */
  sideW: number;
  /** The room under the bare problem's row for the tray or the take-away box. */
  boxH: number;
  /** Both steps' first row (stepRowHeight). */
  rowH: number;
  /** How far the tightest step overflows, px (0 × 0 when it fits): for reports and tests. */
  over: { w: number; h: number };
}

/**
 * Plans the two steps in `width` × `height` (the widget's content box) from the item's plan
 * (`base`, `path`; never the mat as it is now): the largest unit, down to the floor, at which the
 * mat, the pad row under it and the side column of both steps fit. When none does, the least
 * overflow, so a report can say by how much.
 */
export function planSteps(o: {
  age: AgeMode;
  width: number;
  height: number;
  base: MatCaps;
  path: readonly MatState[];
  parts: StepsParts;
}): StepsPlan {
  const { age, width, height, parts } = o;
  const caps = stepsCaps(o.base);
  const disks = caps.disks === true;
  const range = unitRange(disks);
  const btnH = stepButtonHeight(age);
  const matH = height - ROW_GAP - padRowHeight(age);
  // The answer step's side: the problem and "check" in a row, Back under them, above the pad row.
  const answerW = parts.card.w + SIDE_GAP + parts.button;
  const answerH = Math.max(parts.card.h, btnH) + SIDE_GAP + btnH;
  // The pieces step's side: the bare problem and Next in a row, then the tray or the take-away.
  const bareW = parts.bare.w + SIDE_GAP + parts.button;
  // Both steps' first rows are one height (stepRowHeight), so Next stands exactly where "check" will.
  const bareH = stepRowHeight(age, parts);
  const boxH = height - bareH - SIDE_GAP;
  const pending = o.path[0]?.pending ?? null;
  // The take-away box holds whatever a child can take from the planned mat, not only the answer's
  // pieces (taking more is how a child finds out).
  const taken = o.base.taken ? o.base.mat : null;
  const statePath = o.path.map((s) => stateCaps(caps, s.mat, null, null));
  let best: StepsPlan | null = null;
  for (let u = range.max; u >= range.floor; u--) {
    const box = pending
      ? stepsTraySize(pending, u, age, disks)
      : taken
        ? stepsTakeSize(taken, u, age, disks)
        : { w: 0, h: 0 };
    const sideW = Math.ceil(Math.max(answerW, bareW, box.w));
    const matRoom = width - GAP - sideW;
    const one = (c: MatCaps) => firstFit({ age, width: matRoom, height: matH, caps: c }, u);
    const fitsMat = one(caps) !== null || statePath.every((c) => one(c) !== null);
    const loose = measurePlan({ age, width: matRoom, height: matH, caps }, u, 20, 2);
    const overW = Math.max(0, fitsMat ? 0 : loose.matW - matRoom, padRowWidth(age) - width);
    const overH = Math.max(0, fitsMat ? 0 : loose.totalH - matH, answerH - matH, box.h - boxH);
    const p: StepsPlan = {
      fits: fitsMat && overW === 0 && overH === 0,
      unit: u,
      matW: matRoom,
      matH,
      sideW,
      boxH,
      rowH: bareH,
      over: { w: Math.ceil(overW), h: Math.ceil(overH) },
    };
    if (p.fits) return p;
    if (!best || p.over.w + p.over.h < best.over.w + best.over.h) best = p;
  }
  return best as StepsPlan;
}
