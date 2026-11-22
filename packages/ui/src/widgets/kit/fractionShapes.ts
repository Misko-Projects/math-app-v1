// Pixel geometry for fraction pictures (U05, #14): the frames the wholes are drawn in and the SVG
// paths of their parts. Pure: the parts come from the engine's exact geometry
// (`@number-island/engine` fraction-geometry), mapped linearly into the frame's parts area, so
// equal parts stay exactly equal on screen (fraction.test.ts asserts it for every shape and
// count, and the stories measure the drawn paths).

import {
  type CutShape,
  type FractionPicture,
  type RectPart,
  type SectorPart,
  UNEQUAL_CHORD,
} from '@number-island/engine';

/** Where a whole is drawn, in SVG design units. */
export type ShapeFrame =
  | {
      kind: 'circle';
      shape: 'circle';
      width: number;
      height: number;
      cx: number;
      cy: number;
      /** The rim's radius (the whole's outline). */
      rim: number;
      /** The parts' radius, inside the rim. */
      r: number;
    }
  | {
      kind: 'box';
      shape: Exclude<CutShape, 'circle'>;
      width: number;
      height: number;
      /** The parts area (the whole), inside the rim or crust. */
      x: number;
      y: number;
      w: number;
      h: number;
      /** The rim (or a loaf's crust) outline path. */
      outline: string;
      /** Grid cells (grid only). */
      cells?: [number, number];
    };

/** Grid cell size in design units. */
export const GRID_CELL = 44;

const round = (v: number) => Math.round(v * 1000) / 1000;

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/**
 * The frame of a whole. Rects are 3:2, squares 1:1, bars (strips) 5:1 (wide enough for 8 parts),
 * a loaf is a crumb box under a domed crust (the crust is outside the whole, so slices of equal
 * width are equal shares), and a grid is `cols × rows` square cells. `rectAspect` (width ÷
 * height) widens a rect, e.g. for a rect cut into many strips.
 */
export function shapeFrame(
  shape: CutShape,
  gridSize?: readonly [number, number],
  rectAspect = 1.5,
): ShapeFrame {
  switch (shape) {
    case 'circle':
      return { kind: 'circle', shape, width: 240, height: 240, cx: 120, cy: 120, rim: 116, r: 108 };
    case 'rect': {
      const height = Math.round(300 / rectAspect);
      return {
        kind: 'box',
        shape,
        width: 300,
        height,
        x: 10,
        y: 10,
        w: 280,
        h: height - 20,
        outline: roundedRect(3, 3, 294, height - 6, 16),
      };
    }
    case 'square':
      return {
        kind: 'box',
        shape,
        width: 220,
        height: 220,
        x: 10,
        y: 10,
        w: 200,
        h: 200,
        outline: roundedRect(3, 3, 214, 214, 16),
      };
    case 'bar':
      return {
        kind: 'box',
        shape,
        width: 520,
        height: 104,
        x: 10,
        y: 10,
        w: 500,
        h: 84,
        outline: roundedRect(3, 3, 514, 98, 14),
      };
    case 'loaf':
      return {
        kind: 'box',
        shape,
        width: 360,
        height: 172,
        x: 18,
        y: 40,
        w: 324,
        h: 118,
        outline: 'M5 166V70C5 22 34 6 80 6H280C326 6 355 22 355 70V166Z',
      };
    case 'grid': {
      const [cols, rows] = gridSize ?? [4, 2];
      const w = cols * GRID_CELL;
      const h = rows * GRID_CELL;
      return {
        kind: 'box',
        shape,
        width: w + 20,
        height: h + 20,
        x: 10,
        y: 10,
        w,
        h,
        outline: roundedRect(3, 3, w + 14, h + 14, 12),
        cells: [cols, rows],
      };
    }
  }
}

/** One part, ready to draw: its path, a point inside it, and the unit direction it moves when cut apart. */
export interface PartGeom {
  d: string;
  /** Area in design units² (exact from the geometry, for tests and the stack view). */
  area: number;
  /** A point well inside the part (badge and hand placement). */
  cx: number;
  cy: number;
  /** For a sector: its start and end angles (degrees clockwise from 12). */
  a0?: number;
  a1?: number;
  /** For a box part: its rect in design units. */
  rect?: { x: number; y: number; w: number; h: number };
}

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [round(cx + r * Math.sin(a)), round(cy - r * Math.cos(a))];
};

/** A sector path (a full disc when the span is 360°). */
export function sectorPath(cx: number, cy: number, r: number, s: SectorPart): string {
  const span = s.a1 - s.a0;
  if (span >= 360 - 1e-9) {
    return `M${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}Z`;
  }
  const [x0, y0] = polar(cx, cy, r, s.a0);
  const [x1, y1] = polar(cx, cy, r, s.a1);
  return `M${cx} ${cy}L${x0} ${y0}A${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${x1} ${y1}Z`;
}

/** The parts of a sector set in a circle frame. */
export function sectorParts(
  f: Extract<ShapeFrame, { kind: 'circle' }>,
  sectors: readonly SectorPart[],
): PartGeom[] {
  return sectors.map((s) => {
    const mid = (s.a0 + s.a1) / 2;
    const whole = s.a1 - s.a0 >= 360 - 1e-9;
    const [cx, cy] = whole ? [f.cx, f.cy] : polar(f.cx, f.cy, f.r * 0.58, mid);
    return {
      d: sectorPath(f.cx, f.cy, f.r, s),
      area: (Math.PI * f.r * f.r * (s.a1 - s.a0)) / 360,
      cx,
      cy,
      a0: s.a0,
      a1: s.a1,
    };
  });
}

/** The parts of a box (rect, square, bar, loaf, grid) frame. */
export function rectParts(
  f: Extract<ShapeFrame, { kind: 'box' }>,
  rects: readonly RectPart[],
): PartGeom[] {
  return rects.map((p) => {
    const x = f.x + p.x0 * f.w;
    const y = f.y + p.y0 * f.h;
    const w = (p.x1 - p.x0) * f.w;
    const h = (p.y1 - p.y0) * f.h;
    return {
      d: `M${round(x)} ${round(y)}H${round(x + w)}V${round(y + h)}H${round(x)}Z`,
      area: w * h,
      cx: x + w / 2,
      cy: y + h / 2,
      rect: { x, y, w, h },
    };
  });
}

/** The two pieces of a circle split by the chord x = offset·r: the bigger left piece first. */
export function chordParts(f: Extract<ShapeFrame, { kind: 'circle' }>, offset: number): PartGeom[] {
  const { cx, cy, r } = f;
  const x = round(cx + offset * r);
  const half = Math.sqrt(1 - offset * offset) * r;
  const top = round(cy - half);
  const bottom = round(cy + half);
  const leftArea =
    r * r * (Math.PI - (Math.acos(offset) - offset * Math.sqrt(1 - offset * offset)));
  return [
    {
      d: `M${x} ${top}A${r} ${r} 0 ${offset > 0 ? 1 : 0} 0 ${x} ${bottom}Z`,
      area: leftArea,
      cx: cx - r * 0.3,
      cy,
    },
    {
      d: `M${x} ${top}A${r} ${r} 0 ${offset > 0 ? 0 : 1} 1 ${x} ${bottom}Z`,
      area: Math.PI * r * r - leftArea,
      cx: (x + cx + r) / 2,
      cy,
    },
  ];
}

/** The drawable parts of a fraction picture in its frame. */
export function pictureGeoms(f: ShapeFrame, p: FractionPicture): PartGeom[] {
  if (f.kind === 'circle') {
    if (p.kind === 'chord') return chordParts(f, p.chord.offset);
    if (p.kind === 'sectors') return sectorParts(f, p.sectors);
    return [];
  }
  return p.kind === 'rects' ? rectParts(f, p.rects) : [];
}

/**
 * The lines between parts (the cuts), each once, as SVG path data: a circle's radii, a chord,
 * or the shared edges of box parts. The outer outline is never a cut.
 */
export function cutPaths(f: ShapeFrame, p: FractionPicture): string[] {
  if (f.kind === 'circle') {
    if (p.kind === 'chord') {
      const x = round(f.cx + p.chord.offset * f.r);
      const half = Math.sqrt(1 - p.chord.offset ** 2) * f.r;
      return [`M${x} ${round(f.cy - half)}V${round(f.cy + half)}`];
    }
    if (p.kind !== 'sectors' || p.sectors.length < 2) return [];
    return p.sectors.map((s) => {
      const [x, y] = polar(f.cx, f.cy, f.r, s.a0);
      return `M${f.cx} ${f.cy}L${x} ${y}`;
    });
  }
  if (p.kind !== 'rects') return [];
  return boxCutPaths(f, p.rects);
}

/** The interior edges of a set of box parts (each part's right and bottom edges inside the whole). */
export function boxCutPaths(f: Extract<ShapeFrame, { kind: 'box' }>, rects: readonly RectPart[]) {
  const out = new Set<string>();
  for (const p of rects) {
    const x0 = round(f.x + p.x0 * f.w);
    const x1 = round(f.x + p.x1 * f.w);
    const y0 = round(f.y + p.y0 * f.h);
    const y1 = round(f.y + p.y1 * f.h);
    if (p.x1 < 1 - 1e-9) out.add(`M${x1} ${y0}V${y1}`);
    if (p.y1 < 1 - 1e-9) out.add(`M${x0} ${y1}H${x1}`);
  }
  return [...out];
}

/** The off-centre chord the unequal circle-in-two uses (re-exported for the stories). */
export const UNEQUAL_CHORD_OFFSET = UNEQUAL_CHORD.offset;

/** Scale that fits a frame into a box of `maxW × maxH` CSS px, never above `cap`. */
export function fitScale(f: ShapeFrame, maxW: number, maxH: number, cap = 1.6): number {
  return Math.max(0.1, Math.min(cap, maxW / f.width, maxH / f.height));
}
