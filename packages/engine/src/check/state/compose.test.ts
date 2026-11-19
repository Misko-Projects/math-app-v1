// compose.fill, compose.relative, grid.polygon and puzzle.satisfies (03 §5.5, §5.7): table tests
// with alternative valid end states, near misses and malformed values.

import { describe, expect, it } from 'vitest';
import { OUTLINES } from '../../generators/geo/outlines';
import { composeFill } from './compose.fill';
import { composeRelative } from './compose.relative';
import { gridPolygon, polygonInfo } from './grid.polygon';
import { unionInside } from './pieces';
import { puzzleSatisfies, shapeFills } from './puzzle.satisfies';

type Rec = Record<string, unknown>;
const H = Math.sqrt(3) / 2;
const HEXAGON = [
  [0, 0],
  [1, 0],
  [1.5, H],
  [1, 2 * H],
  [0, 2 * H],
  [-0.5, H],
];

describe('compose.fill', () => {
  it.each(OUTLINES.filter((o) => o.kit !== 'grid'))('the reference tiling fills $id', (o) => {
    const counts = new Map<string, number>();
    for (const p of o.tiling) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
    const target = {
      outline: o.points,
      pieces: [...counts].map(([kind, count]) => ({ kind, count })),
    };
    expect(composeFill.check(target, { pieces: o.tiling })).toBe(true);
    // Near misses: a piece missing, a piece moved half a unit, a piece turned the wrong way.
    expect(composeFill.check(target, { pieces: o.tiling.slice(1) })).toBe(false);
    const [first, ...rest] = o.tiling;
    if (!first) throw new Error('empty tiling');
    const moved = { ...first, at: [first.at[0] + 0.5, first.at[1]] };
    expect(composeFill.check(target, { pieces: [moved, ...rest] })).toBe(false);
    const turned = { ...first, rot: first.rot + 30 };
    expect(composeFill.check(target, { pieces: [turned, ...rest] })).toBe(false);
  });

  const offered = {
    outline: HEXAGON,
    pieces: [
      { kind: 'trapezoid', count: 2 },
      { kind: 'rhombus', count: 3 },
    ],
  };
  const CASES: [string, Rec, Rec, boolean][] = [
    [
      'two trapezoids',
      offered,
      {
        pieces: [
          { kind: 'trapezoid', at: [1.5, H], rot: 180 },
          { kind: 'trapezoid', at: [-0.5, H], rot: 0 },
        ],
      },
      true,
    ],
    [
      'alternative: three rhombuses',
      offered,
      {
        pieces: [
          { kind: 'rhombus', at: [0, 0], rot: 0 },
          { kind: 'rhombus', at: [1.5, H], rot: 120 },
          { kind: 'rhombus', at: [0, 0], rot: 60 },
        ],
      },
      true,
    ],
    [
      'alternative: the same trapezoids turned a full turn',
      offered,
      {
        pieces: [
          { kind: 'trapezoid', at: [1.5, H], rot: -180 },
          { kind: 'trapezoid', at: [-0.5, H], rot: 360 },
        ],
      },
      true,
    ],
    [
      'a piece that was not offered',
      offered,
      { pieces: [{ kind: 'hexagon', at: [0, 0], rot: 0 }] },
      false,
    ],
    [
      'two pieces on top of each other',
      offered,
      {
        pieces: [
          { kind: 'trapezoid', at: [-0.5, H], rot: 0 },
          { kind: 'trapezoid', at: [-0.5, H], rot: 0 },
        ],
      },
      false,
    ],
    [
      'more trapezoids than offered',
      offered,
      {
        pieces: [
          { kind: 'trapezoid', at: [1.5, H], rot: 180 },
          { kind: 'trapezoid', at: [-0.5, H], rot: 0 },
          { kind: 'trapezoid', at: [5, 5], rot: 0 },
        ],
      },
      false,
    ],
  ];
  it.each(CASES)('%s', (_name, target, value, expected) => {
    expect(composeFill.check(target, value)).toBe(expected);
  });

  // The 2 × 1 rectangle and two unit squares: each square is within the 2% outside and overlap
  // allowances on its own, so only the covered share of the outline (union, not summed areas) can
  // tell a real fill from a near miss.
  const rect2 = {
    outline: [
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
    ],
    pieces: [{ kind: 'square', count: 2 }],
  };
  const squares = (a: [number, number], b: [number, number]) => ({
    pieces: [
      { kind: 'square', at: a, rot: 0 },
      { kind: 'square', at: b, rot: 0 },
    ],
  });
  const COVER: [string, Rec, boolean][] = [
    ['exact tiling', squares([0, 0], [1, 0]), true],
    ['alternative: laid right to left', squares([1, 0], [0, 0]), true],
    ['alternative: a drag 0.5% off', squares([0, 0.005], [1.005, 0]), true],
    // Each square 1% over the ends: a 0.02 gap in the middle, 1% of the outline uncovered.
    ['alternative: a thin gap within the tolerance', squares([-0.01, 0], [1.01, 0]), true],
    // Union inside the outline 1.981 × 0.981 = 1.943 of 2 (2.8% uncovered), overlap 0.019.
    ['overlapping and short of the outline', squares([0, 0.019], [0.981, 0.019]), false],
    // Each square 1.5% above the outline, overlapping by 0.0101 (0.0099485 of it inside the
    // outline). Union inside = 2 × 0.985 − 0.0099485 = 1.9600515 ≥ 1.96: covered. Subtracting
    // the full overlap (0.0101, part of it outside the outline) would wrongly give 1.9599.
    ['alternative: overlap partly outside the outline', squares([0, 0.015], [0.9899, 0.015]), true],
  ];
  it.each(COVER)('2 × 1 rectangle: %s', (_name, value, expected) => {
    expect(composeFill.check(rect2, value)).toBe(expected);
  });

  // Review round 3 (#57): a 2 × 2 square from four unit squares whose overlaps share a corner.
  // Covered area 3.920106 ≥ 3.92, but pairwise inclusion–exclusion counts the 0.000225 three-way
  // overlap once too often (3.919881) and would wrongly reject it.
  it('2 × 2 square: three-way overlap counted exactly (accepted)', () => {
    const big = {
      outline: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      pieces: [{ kind: 'square', count: 4 }],
    };
    const at = (x: number, y: number) => ({ kind: 'square', at: [x, y], rot: 0 });
    expect(
      composeFill.check(big, {
        pieces: [at(0, 0), at(0.985, -0.0152), at(-0.0152, 0.985), at(1, 1.01995)],
      }),
    ).toBe(true);
    expect(OUTLINES.some((o) => o.id === 'big-square-from-squares')).toBe(true);
  });

  it('unionInside is the exact union area inside the outline', () => {
    const sq = (x: number, y: number, s = 1): [number, number][] => [
      [x, y],
      [x + s, y],
      [x + s, y + s],
      [x, y + s],
    ];
    const outline = sq(0, 0, 3);
    // Three unit squares on a diagonal, all three overlapping in [0.75, 1]²: union by
    // inclusion–exclusion = 3 − (0.25 + 0.0625 + 0.5625) + 0.0625 = 2.1875.
    const pieces = [sq(0, 0), sq(0.5, 0.5), sq(0.75, 0.75)];
    const pairwise = 0.25 + 0.0625 + 0.5625; // |A∩B| + |A∩C| + |B∩C|
    const triple = 0.0625; // |A∩B∩C| = A∩C
    expect(unionInside(outline, pieces)).toBeCloseTo(3 - pairwise + triple, 12);
    // Pieces partly outside the outline only count inside it.
    expect(unionInside(sq(0, 0, 1), [sq(0.5, 0)])).toBeCloseTo(0.5, 12);
    expect(unionInside(outline, [])).toBe(0);
  });

  it('rejects malformed values and targets without throwing', () => {
    for (const v of [
      {},
      { pieces: [] },
      { pieces: [{ kind: 'trapezoid' }] },
      { pieces: 'x' },
      { pieces: [{ kind: 'x', at: [0, 0], rot: 0 }] },
      { pieces: [{ kind: 'constructor', at: [0, 0], rot: 0 }] },
      { pieces: [{ kind: '__proto__', at: [0, 0], rot: 0 }] },
    ]) {
      expect(composeFill.check(offered, v as Rec)).toBe(false);
    }
    for (const t of [{}, { outline: 'x', pieces: [] }, { outline: [[0, 0]], pieces: [] }]) {
      expect(composeFill.check(t, { pieces: [{ kind: 'square', at: [0, 0], rot: 0 }] })).toBe(
        false,
      );
    }
  });
});

describe('compose.relative', () => {
  const box = { x: 46, y: 34, w: 20, h: 20 };
  const t = (word: string) => ({ word, box, scene: { w: 100, h: 60 } });
  const CASES: [string, string, Rec, boolean][] = [
    ['above', 'above', { at: [46, 18] }, true],
    ['above', 'alternative: above and a little to the side', { at: [60, 5] }, true],
    ['above', 'on the anchor is not above', { at: [46, 34] }, false],
    ['above', 'below is not above', { at: [46, 50] }, false],
    ['below', 'below', { at: [40, 52] }, true],
    ['left-of', 'left of', { at: [20, 34] }, true],
    ['left-of', 'right of is not left of', { at: [70, 34] }, false],
    ['right-of', 'right of', { at: [62, 30] }, true],
    ['beside', 'beside on the right', { at: [62, 34] }, true],
    ['beside', 'alternative: beside on the left', { at: [30, 34] }, true],
    ['next-to', 'too far away to be next to', { at: [95, 34] }, false],
    ['in-front-of', 'on the anchor, in front', { at: [46, 34], layer: 'front' }, true],
    ['in-front-of', 'layer defaults to front', { at: [50, 30] }, true],
    ['behind', 'on the anchor, behind', { at: [46, 34], layer: 'back' }, true],
    ['behind', 'in front is not behind', { at: [46, 34], layer: 'front' }, false],
    ['above', 'outside the scene', { at: [46, -5] }, false],
  ];
  it.each(CASES)('%s: %s', (word, _name, value, expected) => {
    expect(composeRelative.check(t(word), value)).toBe(expected);
  });
  it('rejects malformed values and targets without throwing', () => {
    for (const v of [{}, { at: 'x' }, { at: [1] }, { at: [1, 2], layer: 'side' }]) {
      expect(composeRelative.check(t('above'), v as Rec)).toBe(false);
    }
    for (const target of [
      {},
      { word: 'above' },
      { word: 'above', box: { x: 'a' } },
      { word: 'up', box },
    ]) {
      expect(composeRelative.check(target, { at: [46, 10] })).toBe(false);
    }
  });
});

describe('grid.polygon', () => {
  const grid = { cols: 5, rows: 5 };
  const CASES: [string, Rec, Rec, boolean][] = [
    [
      'a triangle',
      { require: { sides: 3 } },
      {
        points: [
          [0, 0],
          [4, 0],
          [2, 3],
        ],
      },
      true,
    ],
    [
      'alternative: a right triangle',
      { require: { sides: 3 } },
      {
        points: [
          [0, 0],
          [3, 0],
          [0, 3],
        ],
      },
      true,
    ],
    [
      'a square is a square',
      { require: { kind: 'square' } },
      {
        points: [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
        ],
      },
      true,
    ],
    [
      'alternative: a tilted square',
      { require: { kind: 'square' } },
      {
        points: [
          [2, 0],
          [4, 2],
          [2, 4],
          [0, 2],
        ],
      },
      true,
    ],
    [
      'a square is also a rectangle',
      { require: { kind: 'rectangle' } },
      {
        points: [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
      },
      true,
    ],
    [
      'a long rectangle is not a square',
      { require: { kind: 'square' } },
      {
        points: [
          [0, 0],
          [4, 0],
          [4, 2],
          [0, 2],
        ],
      },
      false,
    ],
    [
      'a side drawn in two strokes is one side',
      { require: { sides: 4 } },
      {
        points: [
          [0, 0],
          [2, 0],
          [4, 0],
          [4, 2],
          [0, 2],
        ],
      },
      true,
    ],
    [
      'the closing point repeated',
      { require: { sides: 3 } },
      {
        points: [
          [0, 0],
          [4, 0],
          [2, 3],
          [0, 0],
        ],
      },
      true,
    ],
    [
      'four square corners',
      { require: { sides: 4, rightAngles: 4 } },
      {
        points: [
          [0, 1],
          [4, 1],
          [4, 3],
          [0, 3],
        ],
      },
      true,
    ],
    [
      'a trapezoid',
      { require: { kind: 'trapezoid' } },
      {
        points: [
          [0, 0],
          [4, 0],
          [3, 2],
          [1, 2],
        ],
      },
      true,
    ],
    [
      'a rectangle is not a trapezoid (two pairs of parallel sides)',
      { require: { kind: 'trapezoid' } },
      {
        points: [
          [0, 0],
          [4, 0],
          [4, 2],
          [0, 2],
        ],
      },
      false,
    ],
    [
      'a crossed bow tie is not a shape',
      { require: { sides: 4 } },
      {
        points: [
          [0, 0],
          [2, 2],
          [2, 0],
          [0, 2],
        ],
      },
      false,
    ],
    [
      'a straight line is not a shape',
      { require: { sides: 3 } },
      {
        points: [
          [0, 0],
          [2, 0],
          [4, 0],
        ],
      },
      false,
    ],
    [
      'three sides wanted, four drawn',
      { require: { sides: 3 } },
      {
        points: [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
      },
      false,
    ],
    [
      'off the grid',
      { require: { sides: 3 }, grid },
      {
        points: [
          [0, 0],
          [5, 0],
          [2, 3],
        ],
      },
      false,
    ],
    [
      'on the grid',
      { require: { sides: 3 }, grid },
      {
        points: [
          [0, 0],
          [4, 0],
          [2, 3],
        ],
      },
      true,
    ],
    [
      'equal sides',
      { require: { sides: 4, equalSides: true } },
      {
        points: [
          [2, 0],
          [4, 1],
          [2, 2],
          [0, 1],
        ],
      },
      true,
    ],
  ];
  it.each(CASES)('%s', (_name, target, value, expected) => {
    expect(gridPolygon.check(target, value)).toBe(expected);
  });
  it('counts square corners only on the inside (an L has five, not six)', () => {
    const info = polygonInfo([
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
    ]);
    expect(info?.sides).toBe(6);
    expect(info?.rightAngles).toBe(5);
  });
  it('rejects malformed values and targets without throwing', () => {
    for (const v of [
      {},
      { points: 'x' },
      {
        points: [
          [0, 0],
          [1.5, 0],
          [0, 1],
        ],
      },
      { points: [[0, 0]] },
    ]) {
      expect(gridPolygon.check({ require: { sides: 3 } }, v as Rec)).toBe(false);
    }
    for (const t of [{}, { require: 'x' }, { require: { sides: 3 }, grid: { cols: 'a' } }]) {
      expect(
        gridPolygon.check(t, {
          points: [
            [0, 0],
            [4, 0],
            [2, 3],
          ],
        }),
      ).toBe(false);
    }
  });
});

describe('puzzle.satisfies (shape-fill)', () => {
  // A 3 × 2 block: two rectangles and two squares.
  const cells = [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
    [1, 2],
  ];
  const target = {
    variant: 'shape-fill',
    rows: 2,
    cols: 3,
    cells,
    constraints: [{ kind: 'use-each', values: ['rectangle', 'rectangle', 'square', 'square'] }],
  };
  const CASES: [string, Rec, boolean][] = [
    [
      'two rectangles on top',
      {
        fill: [
          ['rectangle', 'rectangle', 'square'],
          ['rectangle', 'rectangle', 'square'],
        ],
      },
      true,
    ],
    [
      'alternative: squares on the left',
      {
        fill: [
          ['square', 'rectangle', 'rectangle'],
          ['square', 'rectangle', 'rectangle'],
        ],
      },
      true,
    ],
    [
      'too many squares',
      {
        fill: [
          ['square', 'square', 'square'],
          ['rectangle', 'rectangle', 'square'],
        ],
      },
      false,
    ],
    [
      'alternative: standing rectangles',
      {
        fill: [
          ['rectangle', 'square', 'rectangle'],
          ['rectangle', 'square', 'rectangle'],
        ],
      },
      true,
    ],
    [
      'a blank cell',
      {
        fill: [
          ['rectangle', 'rectangle', ''],
          ['rectangle', 'rectangle', 'square'],
        ],
      },
      false,
    ],
    [
      'a piece outside the palette',
      {
        fill: [
          ['rectangle', 'rectangle', 'circle'],
          ['rectangle', 'rectangle', 'square'],
        ],
      },
      false,
    ],
    [
      'a diagonal pair is not a rectangle',
      {
        fill: [
          ['rectangle', 'square', 'square'],
          ['square', 'rectangle', 'rectangle'],
        ],
      },
      false,
    ],
  ];
  it.each(CASES)('%s', (_name, value, expected) => {
    expect(puzzleSatisfies.check(target, value)).toBe(expected);
  });
  it('rejects other variants (not implemented yet) and malformed values', () => {
    expect(puzzleSatisfies.check({ ...target, variant: 'cage-sum' }, { fill: [] })).toBe(false);
    for (const v of [{}, { fill: 'x' }, { fill: [['rectangle']] }]) {
      expect(puzzleSatisfies.check(target, v as Rec)).toBe(false);
    }
  });
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'rejects an inherited key (%s) as a cell label without throwing',
    (label) => {
      const fill = [
        ['rectangle', 'rectangle', 'square'],
        ['rectangle', label, 'square'],
      ];
      expect(() => puzzleSatisfies.check(target, { fill })).not.toThrow();
      expect(puzzleSatisfies.check(target, { fill })).toBe(false);
      // An inherited key in the target's piece list is no piece either.
      const odd = { ...target, constraints: [{ kind: 'use-each', values: [label] }] };
      expect(puzzleSatisfies.check(odd, { fill })).toBe(false);
    },
  );
  it('enumerates every fill', () => {
    // 3 × 2 with two rectangles: 2 squares can sit in 4 distinct label grids.
    const fills = shapeFills(cells as [number, number][], 2, 2, 3);
    expect(fills.length).toBeGreaterThan(1);
    for (const fill of fills) expect(puzzleSatisfies.check(target, { fill })).toBe(true);
  });
});
