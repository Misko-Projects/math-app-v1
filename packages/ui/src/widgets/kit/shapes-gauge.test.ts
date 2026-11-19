// Maths truth for the U05 kit pictures (#14): every shape card is drawn exactly as its kind, and
// every gauge reads exactly its value on correctly spaced ticks.
import type { ShapeKind } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  BEAKER,
  DIAL_START,
  DIAL_SWEEP,
  dialAngle,
  type GaugeSpec,
  gaugeLabels,
  gaugeTicks,
  levelY,
} from './GaugeView';
import {
  baseRadius,
  countedParts,
  equalSideGroups,
  regularPolygon,
  shapeExtent,
  shapeGeometry,
  squareCorners,
} from './ShapeView';

type Pt = [number, number];

const pointsOf = (kind: ShapeKind): Pt[] => {
  const g = shapeGeometry(kind);
  if (g.type !== 'polygon' && g.type !== 'open') throw new Error(`${kind} is not a polygon`);
  return g.points;
};
const lens = (p: Pt[]) =>
  p.map((a, i) =>
    Math.hypot((p[(i + 1) % p.length] as Pt)[0] - a[0], (p[(i + 1) % p.length] as Pt)[1] - a[1]),
  );
const allEqual = (xs: number[]) => xs.every((x) => Math.abs(x - (xs[0] as number)) < 1e-4);
const parallelPairs = (p: Pt[]) => {
  if (p.length !== 4) return 0;
  const d = (i: number): Pt => [
    (p[(i + 1) % 4] as Pt)[0] - (p[i] as Pt)[0],
    (p[(i + 1) % 4] as Pt)[1] - (p[i] as Pt)[1],
  ];
  return [
    [0, 2],
    [1, 3],
  ].filter(
    ([i, j]) =>
      Math.abs(d(i as number)[0] * d(j as number)[1] - d(i as number)[1] * d(j as number)[0]) <
      1e-4,
  ).length;
};
const angles = (p: Pt[]) =>
  p.map((b, i) => {
    const a = p[(i - 1 + p.length) % p.length] as Pt;
    const c = p[(i + 1) % p.length] as Pt;
    const u = [a[0] - b[0], a[1] - b[1]];
    const v = [c[0] - b[0], c[1] - b[1]];
    return (
      (Math.acos(
        ((u[0] as number) * (v[0] as number) + (u[1] as number) * (v[1] as number)) /
          (Math.hypot(u[0] as number, u[1] as number) * Math.hypot(v[0] as number, v[1] as number)),
      ) *
        180) /
      Math.PI
    );
  });

describe('ShapeView geometry (03 §5.1 ShapeKind, ShapeProps)', () => {
  // [kind, sides, square corners, all sides equal, parallel pairs]: generators/geo/shapes.ts SHAPE_PROPS.
  it.each([
    ['triangle', 3, 0, true, 0],
    ['square', 4, 4, true, 2],
    ['rectangle', 4, 4, false, 2],
    ['rhombus', 4, 0, true, 2],
    ['trapezoid', 4, 0, false, 1],
    ['kite', 4, 0, false, 0],
    ['quadrilateral', 4, 0, false, 0],
    ['pentagon', 5, 0, true, 0],
    ['hexagon', 6, 0, true, 0],
    ['octagon', 8, 0, true, 0],
  ] as const)(
    '%s: %i sides, %i square corners, equal sides %s, %i parallel pairs',
    (kind, n, right, equal, par) => {
      const p = pointsOf(kind);
      expect(p).toHaveLength(n);
      expect(squareCorners(p)).toHaveLength(right);
      expect(allEqual(lens(p))).toBe(equal);
      if (n === 4) expect(parallelPairs(p)).toBe(par);
    },
  );

  it('regular polygons have equal sides and equal corners', () => {
    for (const kind of ['triangle', 'pentagon', 'hexagon', 'octagon'] as const) {
      const p = pointsOf(kind);
      expect(allEqual(lens(p)), kind).toBe(true);
      expect(allEqual(angles(p)), kind).toBe(true);
    }
    expect(allEqual(angles(regularPolygon(7, 10)))).toBe(true);
  });

  it('a square is square; a rectangle is clearly not', () => {
    expect(angles(pointsOf('square')).every((a) => Math.abs(a - 90) < 1e-6)).toBe(true);
    const [w, h] = lens(pointsOf('rectangle')) as [number, number];
    expect(w / h).toBeGreaterThan(1.5);
  });

  it('the rhombus has 60° and 120° corners and the trapezoid is the pattern block', () => {
    expect(angles(pointsOf('rhombus')).map(Math.round).sort()).toEqual([120, 120, 60, 60]);
    const t = lens(pointsOf('trapezoid'));
    // bottom = 2 × top = 2 × each leg
    expect(Math.max(...t)).toBeCloseTo(2 * Math.min(...t), 4);
    expect(t.filter((x) => Math.abs(x - Math.min(...t)) < 1e-4)).toHaveLength(3);
  });

  it('a kite has two pairs of equal neighbouring sides; the quadrilateral has none equal', () => {
    const k = lens(pointsOf('kite'));
    expect(k[0]).toBeCloseTo(k[3] as number, 6);
    expect(k[1]).toBeCloseTo(k[2] as number, 6);
    expect(new Set(equalSideGroups(pointsOf('kite'))).size).toBe(2);
    expect(new Set(equalSideGroups(pointsOf('quadrilateral'))).size).toBe(4);
  });

  it('the open figure has three sides, two corners and a visible gap', () => {
    const p = pointsOf('open-figure');
    const { sides, corners } = countedParts(p, true);
    expect(sides).toHaveLength(3);
    expect(corners).toHaveLength(2);
    const first = p[0] as Pt;
    const last = p[p.length - 1] as Pt;
    expect(Math.hypot(first[0] - last[0], first[1] - last[1])).toBeGreaterThan(20);
    expect(shapeGeometry('open-figure').type).toBe('open');
  });

  it('circle, oval and solids', () => {
    expect(shapeGeometry('circle')).toEqual({ type: 'circle', r: 38 });
    const o = shapeGeometry('oval');
    expect(o.type === 'ellipse' && o.rx > o.ry).toBe(true);
    for (const s of ['cube', 'cone', 'cylinder', 'sphere', 'rect-prism', 'pyramid'] as const) {
      expect(shapeGeometry(s)).toEqual({ type: 'solid', solid: s });
    }
  });

  it('scale grows the box in proportion, so cards in one set compare truly', () => {
    expect(shapeExtent({ shape: 'square', scale: 1.5 }) - 8).toBeCloseTo(
      1.5 * baseRadius('square'),
      6,
    );
  });
});

describe('GaugeView readings', () => {
  const scale: GaugeSpec = {
    kind: 'gauge',
    instrument: 'scale',
    min: 0,
    max: 10,
    ticksEvery: 1,
    labelsEvery: 2,
    value: 7,
    unit: 'kg',
  };

  it('the dial needle points exactly at the value', () => {
    expect(dialAngle(scale, 0)).toBe(DIAL_START);
    expect(dialAngle(scale, 10)).toBe(DIAL_START + DIAL_SWEEP);
    expect(dialAngle(scale, 7)).toBeCloseTo(DIAL_START + 0.7 * DIAL_SWEEP, 9);
    // The value sits on a tick, and ticks are evenly spaced.
    const ticks = gaugeTicks(scale);
    expect(ticks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const step = dialAngle(scale, 1) - dialAngle(scale, 0);
    for (let i = 1; i < ticks.length; i += 1) {
      expect(
        dialAngle(scale, ticks[i] as number) - dialAngle(scale, ticks[i - 1] as number),
      ).toBeCloseTo(step, 9);
    }
  });

  it('labels every labelsEvery, thinned by an even stride when crowded', () => {
    expect(gaugeLabels(scale, 50, 40)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(gaugeLabels(scale, 30, 40)).toEqual([0, 4, 8]);
    expect(gaugeLabels({ ...scale, max: 50, ticksEvery: 5, labelsEvery: 10 }, 9, 40)).toEqual([
      0, 50,
    ]);
  });

  it('the beaker water and the thermometer column stop exactly at the value', () => {
    const beaker: GaugeSpec = { ...scale, instrument: 'beaker', unit: 'L', value: 3 };
    const y = levelY(beaker, 3, BEAKER.top, BEAKER.bottom);
    expect(y).toBeCloseTo(BEAKER.bottom - 0.3 * (BEAKER.bottom - BEAKER.top), 9);
    const thermo: GaugeSpec = {
      ...scale,
      instrument: 'thermometer',
      min: -10,
      max: 40,
      ticksEvery: 2,
      labelsEvery: 10,
      value: 0,
      unit: 'degC',
    };
    expect(levelY(thermo, 0, 0, 500)).toBeCloseTo(400, 9);
    expect(gaugeTicks(thermo)[0]).toBe(-10);
    expect(gaugeLabels(thermo, 100, 40)).toEqual([-10, 0, 10, 20, 30, 40]);
  });
});
