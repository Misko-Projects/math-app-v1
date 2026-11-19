// Layout of the fraction-cut stage (U05, #14), pure: how big the whole is drawn, where each
// guided line's knife sits, and how far cut parts move apart. Parts only ever move (translate or,
// when stacked, rotate about the centre), so every part keeps exactly its area on screen.

import type { GuidedLine, RectPart, SectorPart } from '@number-island/engine';
import type { ShapeFrame } from '../kit';

/** A knife's centre on the stage, in CSS px. */
export interface KnifeSpot {
  line: number;
  x: number;
  y: number;
}

export interface CutLayout {
  /** CSS px per design unit. */
  scale: number;
  /** Where the SVG's top-left sits on the stage, CSS px. */
  svgX: number;
  svgY: number;
  width: number;
  height: number;
  /** Where each guided line's knife sits. */
  knives: KnifeSpot[];
  /**
   * One knife at a time: the knives would crowd (many lines, little room), so only the knife of
   * the next line to cut shows, at that line. Tapping it cuts that line; swipes cut any line.
   */
  single: boolean;
  /** CSS px each cut moves the parts apart (box: per cut line; circle: along each bisector). */
  gapPx: number;
}

/** Space between a knife and the whole's edge, CSS px. */
const KNIFE_CLEAR = 10;
/**
 * CSS px the parts on either side of a cut move apart in total: ≥ 12 px between targets, and 12 px
 * clear of an invited part's ring (its stroke reaches up to 4 px out).
 */
export const CUT_GAP_PX = 20;
/**
 * Least space between two knives' boxes: 12 px (06 §4) clear of an invited knife's ring, which
 * reaches 8 px out (5 px outline, 3 px offset).
 */
const KNIFE_GAP = 22;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const grow = (b: Box, x: number, y: number, r: number): Box => ({
  x0: Math.min(b.x0, x - r),
  y0: Math.min(b.y0, y - r),
  x1: Math.max(b.x1, x + r),
  y1: Math.max(b.y1, y + r),
});

/** How far the whole spreads past its edges once fully cut (CSS px, each side, per axis). */
export function spreadPx(
  frame: ShapeFrame,
  guides: readonly GuidedLine[],
  parts: number,
): { x: number; y: number } {
  if (frame.kind === 'circle') {
    const d = circleShiftPx(360 / Math.max(2, parts));
    return { x: d, y: d };
  }
  // Free cuts: allow for parts − 1 lines either way.
  const free = Math.max(1, parts - 1);
  const v = guides.length === 0 ? free : guides.filter((g) => g.kind === 'v').length;
  const h = guides.length === 0 ? free : guides.filter((g) => g.kind === 'h').length;
  return { x: (v * CUT_GAP_PX) / 2, y: (h * CUT_GAP_PX) / 2 };
}

/** How far a sector moves along its bisector so neighbours are CUT_GAP_PX apart. */
export function circleShiftPx(minAngle: number): number {
  const half = Math.sin(((Math.min(180, Math.max(1, minAngle)) / 2) * Math.PI) / 180);
  return Math.min(36, Math.max(8, CUT_GAP_PX / (2 * half)));
}

/** Whether every two knives' boxes are at least KNIFE_GAP apart (edge to edge). */
export function knivesClear(knives: readonly KnifeSpot[], knife: number): boolean {
  for (let i = 0; i < knives.length; i += 1) {
    for (let j = i + 1; j < knives.length; j += 1) {
      const a = knives[i] as KnifeSpot;
      const b = knives[j] as KnifeSpot;
      if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) - knife < KNIFE_GAP - 1e-9) {
        return false;
      }
    }
  }
  return true;
}

function knifeCentres(
  frame: ShapeFrame,
  guides: readonly GuidedLine[],
  s: number,
  knife: number,
  spread: { x: number; y: number },
  single: boolean,
): KnifeSpot[] {
  const offX = spread.x + KNIFE_CLEAR + knife / 2;
  const off = spread.y + KNIFE_CLEAR + knife / 2;
  if (frame.kind === 'circle') {
    return guides.map((g, line) => {
      const a = (((g.kind === 'radii' ? g.angles[0] : 0) ?? 0) * Math.PI) / 180;
      const d = frame.rim * s + off;
      return { line, x: frame.cx * s + d * Math.sin(a), y: frame.cy * s - d * Math.cos(a) };
    });
  }
  const vs = guides.filter((g) => g.kind === 'v').length;
  const hs = guides.filter((g) => g.kind === 'h').length;
  // Knives for neighbouring lines alternate sides when one row would crowd them.
  const vCrowded = !single && (frame.w * s) / (vs + 1) < knife + KNIFE_GAP;
  const hCrowded = !single && (frame.h * s) / (hs + 1) < knife + KNIFE_GAP;
  let vi = 0;
  let hi = 0;
  return guides.map((g, line) => {
    if (g.kind === 'v') {
      const below = vCrowded && vi % 2 === 1;
      vi += 1;
      return {
        line,
        x: (frame.x + g.at * frame.w) * s,
        y: below ? frame.height * s + off : -off,
      };
    }
    const right = hCrowded && hi % 2 === 1;
    hi += 1;
    const at = g.kind === 'h' ? g.at : 0.5;
    return {
      line,
      x: right ? frame.width * s + offX : -offX,
      y: (frame.y + at * frame.h) * s,
    };
  });
}

function fit(
  frame: ShapeFrame,
  guides: readonly GuidedLine[],
  parts: number,
  avail: { w: number; h: number },
  knife: number,
  maxScale: number,
  single: boolean,
): CutLayout {
  const spread = spreadPx(frame, guides, parts);
  const bbox = (s: number) => {
    let b: Box = {
      x0: -spread.x,
      y0: -spread.y,
      x1: frame.width * s + spread.x,
      y1: frame.height * s + spread.y,
    };
    for (const k of knifeCentres(frame, guides, s, knife, spread, single)) {
      b = grow(b, k.x, k.y, knife / 2);
    }
    return b;
  };
  let lo = 0.1;
  let hi = maxScale;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const b = bbox(mid);
    if (b.x1 - b.x0 <= avail.w && b.y1 - b.y0 <= avail.h) lo = mid;
    else hi = mid;
  }
  const s = lo;
  const b = bbox(s);
  return {
    scale: s,
    svgX: -b.x0,
    svgY: -b.y0,
    width: b.x1 - b.x0,
    height: b.y1 - b.y0,
    knives: knifeCentres(frame, guides, s, knife, spread, single).map((k) => ({
      ...k,
      x: k.x - b.x0,
      y: k.y - b.y0,
    })),
    single,
    gapPx: CUT_GAP_PX,
  };
}

/**
 * The biggest drawing of the whole (with its knives and the room cut parts spread into) that
 * fits `avail` CSS px. `knife` is the knife button's size. One knife per line when they keep
 * their size and gaps; otherwise one knife at a time (`single`).
 */
export function cutLayout(
  frame: ShapeFrame,
  guides: readonly GuidedLine[],
  parts: number,
  avail: { w: number; h: number },
  knife: number,
  maxScale = 2.2,
  /** The parts will be tapped (filled): prefer the bigger drawing, one knife at a time if need be. */
  preferBig = false,
): CutLayout {
  const each = fit(frame, guides, parts, avail, knife, maxScale, false);
  const single = fit(frame, guides, parts, avail, knife, maxScale, true);
  if (!knivesClear(each.knives, knife)) return single;
  return preferBig && single.scale > each.scale * 1.1 ? single : each;
}

/**
 * Box parts move apart: each part moves half a gap away from every cut line on either side of it
 * (counted from the distinct part edges), so neighbours end up `gap` apart. In design units.
 */
export function boxOffsets(rects: readonly RectPart[], gap: number): { dx: number; dy: number }[] {
  const xs = [...new Set(rects.map((r) => r.x0).filter((x) => x > 1e-9))].sort((a, b) => a - b);
  const ys = [...new Set(rects.map((r) => r.y0).filter((y) => y > 1e-9))].sort((a, b) => a - b);
  return rects.map((r) => {
    const kx = xs.filter((x) => x <= r.x0 + 1e-9).length;
    const ky = ys.filter((y) => y <= r.y0 + 1e-9).length;
    return { dx: gap * (kx - xs.length / 2), dy: gap * (ky - ys.length / 2) };
  });
}

/** Circle sectors move out along their bisectors (none while the circle is whole). Design units. */
export function sectorOffsets(sectors: readonly SectorPart[], shift: number) {
  if (sectors.length < 2) return sectors.map(() => ({ dx: 0, dy: 0 }));
  return sectors.map((s) => {
    const mid = (((s.a0 + s.a1) / 2) * Math.PI) / 180;
    return { dx: shift * Math.sin(mid), dy: -shift * Math.cos(mid) };
  });
}
