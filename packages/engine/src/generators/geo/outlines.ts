// Shape outlines for geo.compose (03 §5.6). `packages/content/outlines.yaml` lists the same ids,
// points and pieces (the engine test `outlines.test.ts` keeps them in step); this table adds what
// the generator needs to build worked solutions: a reference tiling, and for outlines that are
// themselves a named shape, that shape and its size.
//
// Kits: `pattern-blocks` and `shapes` outlines use the piece geometry of check/state/pieces.ts
// (x right, y up, one unit = one block side). `grid` outlines are puzzle-grid shape-fill outlines on
// square cells: x = column, y = row (rows count down from the top), and the cells whose centres lie
// inside the polygon are the outline's cells.

import type { ShapeKind } from '@number-island/shared';
import type { Placement, Vec } from '../../check/state/pieces';

export interface Outline {
  id: string;
  kit: 'pattern-blocks' | 'shapes' | 'grid';
  points: Vec[];
  /** A reference tiling (pattern-blocks and shapes kits). */
  tiling: Placement[];
  /** The named shape the outline is, when it is one (numeral-pick items). */
  result?: ShapeKind;
  resultScale?: number;
}

const H = Math.sqrt(3) / 2;
const P = (kind: string, x: number, y: number, rot = 0): Placement => ({ kind, at: [x, y], rot });

const HEXAGON: Vec[] = [
  [0, 0],
  [1, 0],
  [1.5, H],
  [1, 2 * H],
  [0, 2 * H],
  [-0.5, H],
];
const TRAPEZOID: Vec[] = [
  [0, 0],
  [2, 0],
  [1.5, H],
  [0.5, H],
];

export const OUTLINES: Outline[] = [
  // ---- two pieces (GEO.10) ----
  {
    id: 'rhombus-from-triangles',
    kit: 'pattern-blocks',
    points: [
      [0, 0],
      [1, 0],
      [1.5, H],
      [0.5, H],
    ],
    tiling: [P('triangle', 0, 0), P('triangle', 1, 0, 60)],
    result: 'rhombus',
    resultScale: 1,
  },
  {
    id: 'hexagon-from-trapezoids',
    kit: 'pattern-blocks',
    points: HEXAGON,
    tiling: [P('trapezoid', 1.5, H, 180), P('trapezoid', -0.5, H)],
    result: 'hexagon',
    resultScale: 1,
  },
  {
    id: 'trapezoid-from-triangle-rhombus',
    kit: 'pattern-blocks',
    points: TRAPEZOID,
    tiling: [P('triangle', 0, 0), P('rhombus', 2, 0, 120)],
    result: 'trapezoid',
    resultScale: 1,
  },
  {
    id: 'triangle-from-trapezoid-triangle',
    kit: 'pattern-blocks',
    points: [
      [0, 0],
      [2, 0],
      [1, 2 * H],
    ],
    tiling: [P('trapezoid', 0, 0), P('triangle', 0.5, H)],
    result: 'triangle',
    resultScale: 2,
  },
  {
    id: 'house',
    kit: 'pattern-blocks',
    points: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0.5, 1 + H],
      [0, 1],
    ],
    tiling: [P('square', 0, 0), P('triangle', 0, 1)],
  },
  {
    id: 'rectangle-from-squares',
    kit: 'shapes',
    points: [
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
    ],
    tiling: [P('square', 0, 0), P('square', 1, 0)],
    result: 'rectangle',
    resultScale: 1,
  },
  {
    id: 'square-from-rectangles',
    kit: 'shapes',
    points: [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ],
    tiling: [P('rectangle', 0, 0), P('rectangle', 0, 1)],
    result: 'square',
    resultScale: 2,
  },
  {
    id: 'long-rectangle',
    kit: 'shapes',
    points: [
      [0, 0],
      [3, 0],
      [3, 1],
      [0, 1],
    ],
    tiling: [P('rectangle', 0, 0), P('square', 2, 0)],
    result: 'rectangle',
    resultScale: 1,
  },
  {
    id: 'corner-shape',
    kit: 'shapes',
    points: [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
    ],
    tiling: [P('rectangle', 0, 0), P('square', 0, 1)],
  },
  // ---- three or more pieces (GEO.11, PUZ.03) ----
  {
    id: 'trapezoid-from-triangles',
    kit: 'pattern-blocks',
    points: TRAPEZOID,
    tiling: [P('triangle', 0, 0), P('triangle', 1, 0, 60), P('triangle', 1, 0)],
    result: 'trapezoid',
    resultScale: 1,
  },
  {
    id: 'hexagon-from-rhombuses',
    kit: 'pattern-blocks',
    points: HEXAGON,
    tiling: [P('rhombus', 0, 0), P('rhombus', 1.5, H, 120), P('rhombus', 0, 0, 60)],
    result: 'hexagon',
    resultScale: 1,
  },
  {
    id: 'hexagon-from-triangles',
    kit: 'pattern-blocks',
    points: HEXAGON,
    tiling: [
      P('triangle', 0, 0),
      P('triangle', 1, 0, 60),
      P('triangle', 0.5, H),
      P('triangle', 0.5, H, 60),
      P('triangle', -0.5, H),
      P('triangle', 0, 0, 60),
    ],
    result: 'hexagon',
    resultScale: 1,
  },
  {
    id: 'hexagon-from-three-kinds',
    kit: 'pattern-blocks',
    points: HEXAGON,
    tiling: [P('trapezoid', 1.5, H, 180), P('triangle', -0.5, H), P('rhombus', 1.5, H, 120)],
    result: 'hexagon',
    resultScale: 1,
  },
  {
    id: 'big-triangle-from-triangles',
    kit: 'pattern-blocks',
    points: [
      [0, 0],
      [2, 0],
      [1, 2 * H],
    ],
    tiling: [
      P('triangle', 0, 0),
      P('triangle', 1, 0),
      P('triangle', 0.5, H),
      P('triangle', 1, 0, 60),
    ],
    result: 'triangle',
    resultScale: 2,
  },
  {
    id: 'boat',
    kit: 'pattern-blocks',
    points: [
      [0.5, 0],
      [1.5, 0],
      [2, H],
      [1.5, H],
      [2, 2 * H],
      [1, 2 * H],
      [0.5, H],
      [0, H],
    ],
    tiling: [P('trapezoid', 2, H, 180), P('triangle', 0.5, H), P('triangle', 1.5, H, 60)],
  },
  {
    id: 'star',
    kit: 'pattern-blocks',
    points: [
      [0, 0],
      [0.5, -H],
      [1, 0],
      [2, 0],
      [1.5, H],
      [2, 2 * H],
      [1, 2 * H],
      [0.5, 3 * H],
      [0, 2 * H],
      [-1, 2 * H],
      [-0.5, H],
      [-1, 0],
    ],
    tiling: [
      P('hexagon', 0, 0),
      P('triangle', 0, 0, 300),
      P('triangle', 1, 0),
      P('triangle', 1.5, H, 60),
      P('triangle', 0, 2 * H),
      P('triangle', -0.5, H, 60),
      P('triangle', -1, 0),
    ],
  },
  {
    id: 'big-square-from-squares',
    kit: 'shapes',
    points: [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ],
    tiling: [P('square', 0, 0), P('square', 1, 0), P('square', 0, 1), P('square', 1, 1)],
    result: 'square',
    resultScale: 2,
  },
  {
    id: 'wide-rectangle',
    kit: 'shapes',
    points: [
      [0, 0],
      [3, 0],
      [3, 2],
      [0, 2],
    ],
    tiling: [P('rectangle', 0, 0), P('rectangle', 0, 1), P('rectangle', 3, 0, 90)],
    result: 'rectangle',
    resultScale: 2,
  },
  // ---- puzzle-grid shape-fill outlines (PUZ.03) ----
  {
    id: 'grid-block',
    kit: 'grid',
    points: [
      [0, 0],
      [3, 0],
      [3, 2],
      [0, 2],
    ],
    tiling: [],
  },
  {
    id: 'grid-corner',
    kit: 'grid',
    points: [
      [0, 0],
      [1, 0],
      [1, 2],
      [3, 2],
      [3, 3],
      [0, 3],
    ],
    tiling: [],
  },
  {
    id: 'grid-steps',
    kit: 'grid',
    points: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
      [3, 2],
      [3, 3],
      [0, 3],
    ],
    tiling: [],
  },
  {
    id: 'grid-cross',
    kit: 'grid',
    points: [
      [1, 0],
      [2, 0],
      [2, 1],
      [3, 1],
      [3, 2],
      [2, 2],
      [2, 3],
      [1, 3],
      [1, 2],
      [0, 2],
      [0, 1],
      [1, 1],
    ],
    tiling: [],
  },
  {
    id: 'grid-tower',
    kit: 'grid',
    points: [
      [1, 0],
      [2, 0],
      [2, 1],
      [3, 1],
      [3, 4],
      [0, 4],
      [0, 1],
      [1, 1],
    ],
    tiling: [],
  },
  {
    id: 'grid-big',
    kit: 'grid',
    points: [
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ],
    tiling: [],
  },
];

export const OUTLINE_IDS = OUTLINES.map((o) => o.id);

export function outline(id: string): Outline | undefined {
  return OUTLINES.find((o) => o.id === id);
}

/** The cells of a grid outline, as [row, column], in reading order. */
export function gridCells(o: Outline): [number, number][] {
  const xs = o.points.map((p) => p[0]);
  const ys = o.points.map((p) => p[1]);
  const cells: [number, number][] = [];
  for (let r = Math.min(...ys); r < Math.max(...ys); r += 1) {
    for (let c = Math.min(...xs); c < Math.max(...xs); c += 1) {
      if (inside(o.points, c + 0.5, r + 0.5)) cells.push([r, c]);
    }
  }
  return cells;
}

function inside(poly: Vec[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i] as Vec;
    const [xj, yj] = poly[j] as Vec;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
