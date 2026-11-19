/**
 * Pure layout for the equal-groups widget (03 §5.5; 06 §1: container-relative). Every sprite (in a
 * container, in the supply pile, on the take-one spot) is drawn at ONE size `s`, as large as the
 * room allows and never below MIN_ITEM_PX. Every container is the same box, drawn for a full
 * container (the engine's GROUP_CAPACITY, two fives), so its size never shows the answer.
 *
 * Sprites are pictures. What a child touches is always a full target (06 §4): the take-one spot,
 * a whole container (drop target, and the handle that takes its last sprite back), the supply
 * panel (drop target for taking back) and the add button.
 */

import { balancedRows, fivesGrid, type Grid, MIN_ITEM_PX, zoneGrid } from '../kit/fives';

export { fivesCell, MIN_ITEM_PX, zoneCell } from '../kit/fives';

/** Gap between containers (≥ the 12 px target gap). */
export const GROUP_GAP = 16;
/** Gap between the supply and the containers, and inside the supply. */
export const ROW_GAP = 16;
/** Padding inside the supply panel. */
export const CARD_PAD = 12;

/** Space a container's drawing takes around its contents (rims, logs, a basket's handle). */
export interface ChromeEdges {
  x: number;
  top: number;
  bottom: number;
}
/** The rim at full size (sprites of 36 px and up). */
export const CHROME: ChromeEdges = { x: 26, top: 30, bottom: 28 };
/** The rim for sprites of size `s`: thinner round small sprites, never under 55 %. */
export function chromeAt(s: number): ChromeEdges {
  const k = Math.min(1, Math.max(0.55, s / 36));
  return {
    x: Math.round(CHROME.x * k),
    top: Math.round(CHROME.top * k),
    bottom: Math.round(CHROME.bottom * k),
  };
}

export interface Parts {
  /** The age mode's minimum target (80 K, 64 G1+). */
  target: number;
  /** The take-one spot (a round target with the next sprite on it). */
  spot: number;
  /** The round add button with its 6 px ledge. */
  add: number;
  /**
   * The line for the task and a limit note, with the space under it. The build step keeps the
   * same strip under its row for the demonstration hand (kit `useInviteHand` hangs it below a
   * control), so an invite never moves the row, and the row stays centred.
   */
  top: number;
}

export function partsFor(ageMode: 'k' | 'g1-up'): Parts {
  return ageMode === 'k'
    ? { target: 80, spot: 96, add: 94, top: 44 }
    : { target: 64, spot: 80, add: 78, top: 44 };
}

export interface LayoutInput {
  /** Container boxes to place (the add slot included). */
  slots: number;
  /** Whether one slot holds the add button (it then needs room for it). */
  addSlot: boolean;
  /** Sprites one container holds (the engine's GROUP_CAPACITY). */
  cap: number;
  /** `build`: live controls and the top line. `picture`: the containers only, nothing to touch. */
  mode: 'build' | 'picture';
  /** The supply: a pile of exactly `pileMax` sprites, a bottomless bucket, or none. */
  source: 'pile' | 'bucket' | null;
  pileMax: number;
  width: number;
  height: number;
  maxItem: number;
  parts: Parts;
}

export type SupplyShape = 'side' | 'under';
export type Flow = 'row' | 'stack';

export interface Layout {
  s: number;
  flow: Flow;
  /** Containers per row, top to bottom. */
  rows: number[];
  box: { w: number; h: number };
  chrome: ChromeEdges;
  zone: Grid & { upright: boolean };
  spot: { w: number; h: number };
  pile: Grid;
  supply: { w: number; h: number; shape: SupplyShape };
  top: number;
  width: number;
  height: number;
  fits: boolean;
}

interface Shape {
  flow: Flow;
  perRow: number;
  upright: boolean;
  supply: SupplyShape;
  pileCols: number;
}

function layoutAt(input: LayoutInput, s: number, shape: Shape): Layout {
  const { parts } = input;
  const build = input.mode === 'build';
  const chrome = chromeAt(s);
  const zone = { ...zoneGrid(input.cap, s, shape.upright), upright: shape.upright };
  // A container is a drop target and the handle that takes a sprite back: a full target at least.
  const floor = build ? (input.addSlot ? parts.add + 16 : parts.target) : 0;
  const box = {
    w: Math.max(zone.w + 2 * chrome.x, floor),
    h: Math.max(zone.h + chrome.top + chrome.bottom, floor),
  };
  const rows = balancedRows(Math.max(1, input.slots), shape.perRow);
  const widest = Math.max(...rows);
  const groupsW = widest * box.w + (widest - 1) * GROUP_GAP;
  const groupsH = rows.length * box.h + (rows.length - 1) * GROUP_GAP;

  // The supply: the take-one spot, and beside or under it the rest of a pile in fives.
  const hasSupply = build && input.source !== null;
  const spotSide = Math.max(parts.spot, s + 16);
  const spot = hasSupply
    ? { w: input.source === 'bucket' ? Math.round(spotSide * 1.2) : spotSide, h: spotSide }
    : { w: 0, h: 0 };
  const loose = hasSupply && input.source === 'pile' ? Math.max(0, input.pileMax - 1) : 0;
  const pile = fivesGrid(loose, shape.pileCols, s);
  const between = pile.w > 0 ? ROW_GAP : 0;
  const side = shape.supply === 'side';
  const supply = !hasSupply
    ? { w: 0, h: 0 }
    : side
      ? { w: 2 * CARD_PAD + spot.w + between + pile.w, h: 2 * CARD_PAD + Math.max(spot.h, pile.h) }
      : { w: 2 * CARD_PAD + Math.max(spot.w, pile.w), h: 2 * CARD_PAD + spot.h + between + pile.h };

  const top = build ? parts.top : 0;
  const gap = supply.w > 0 ? ROW_GAP : 0;
  const width = shape.flow === 'row' ? supply.w + gap + groupsW : Math.max(supply.w, groupsW);
  const height =
    2 * top + (shape.flow === 'row' ? Math.max(supply.h, groupsH) : groupsH + gap + supply.h);
  return {
    s,
    flow: shape.flow,
    rows,
    box,
    chrome,
    zone,
    spot,
    pile,
    supply: { ...supply, shape: shape.supply },
    top,
    width,
    height,
    fits: width <= input.width && height <= input.height,
  };
}

/**
 * The biggest sprite size at which everything fits the room. At each size it tries one row of
 * containers before two and three, the supply beside the containers before under them, and
 * contents in rows of five before columns of five; the first that fits wins. If nothing fits at
 * the 20 px floor, the layout that overflows least is returned with `fits: false`.
 */
export function groupsLayout(input: LayoutInput): Layout {
  const max = Math.max(MIN_ITEM_PX, Math.floor(input.maxItem));
  const n = Math.max(1, input.slots);
  const perRows = [...new Set([n, Math.ceil(n / 2), Math.ceil(n / 3)])];
  const piled = input.mode === 'build' && input.source === 'pile' && input.pileMax > 1;
  const shapes: Shape[] = [];
  for (const perRow of perRows) {
    for (const flow of input.mode === 'build' && input.source
      ? (['row', 'stack'] as const)
      : (['row'] as const)) {
      for (const upright of input.cap > 5 ? [false, true] : [false]) {
        for (const supply of piled ? (['under', 'side'] as const) : (['under'] as const)) {
          for (const pileCols of piled ? [5, 10] : [5]) {
            shapes.push({ flow, perRow, upright, supply, pileCols });
          }
        }
      }
    }
  }
  let fallback: { layout: Layout; over: number } | null = null;
  for (let s = max; s >= MIN_ITEM_PX; s -= 1) {
    for (const shape of shapes) {
      const l = layoutAt(input, s, shape);
      if (l.fits) return l;
      if (s === MIN_ITEM_PX) {
        const over = Math.max(0, l.width - input.width) + Math.max(0, l.height - input.height);
        if (!fallback || over < fallback.over) fallback = { layout: l, over };
      }
    }
  }
  return (fallback as { layout: Layout }).layout;
}
