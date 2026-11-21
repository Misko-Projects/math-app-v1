// Fraction picture geometry on screen (U05, #14): equal parts are exactly equal in pixels, every
// picture has exactly `parts` parts, unequal ones are visibly unequal, and the parts tile the
// whole (no gaps, no overlap). The stories measure the rendered paths as well.
import { type CutShape, fractionPicture, type PictureShape } from '@number-island/engine';
import { describe, expect, it } from 'vitest';
import {
  boxCutPaths,
  chordParts,
  cutPaths,
  type PartGeom,
  pictureGeoms,
  sectorParts,
  shapeFrame,
} from './fractionShapes';

const SHAPES: PictureShape[] = ['circle', 'rect', 'bar', 'loaf'];

function wholeArea(shape: CutShape): number {
  const f = shapeFrame(shape);
  return f.kind === 'circle' ? Math.PI * f.r * f.r : f.w * f.h;
}

describe('fraction picture pixels', () => {
  it('equal parts: exactly `parts` parts of exactly equal area that tile the whole', () => {
    for (const shape of SHAPES) {
      for (let parts = 1; parts <= 12; parts += 1) {
        const geoms = pictureGeoms(shapeFrame(shape), fractionPicture(shape, parts, true));
        expect(geoms).toHaveLength(parts);
        const whole = wholeArea(shape);
        const sum = geoms.reduce((a, g) => a + g.area, 0);
        expect(Math.abs(sum - whole) / whole, `${shape} ${parts}`).toBeLessThan(1e-9);
        for (const g of geoms) {
          expect(Math.abs(g.area - whole / parts) / whole, `${shape} ${parts}`).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('box parts: equal widths and heights to the pixel, edges inside the whole', () => {
    for (const shape of ['rect', 'bar', 'loaf'] as const) {
      const f = shapeFrame(shape);
      if (f.kind !== 'box') throw new Error('box frame');
      for (let parts = 2; parts <= 12; parts += 1) {
        const rects = pictureGeoms(f, fractionPicture(shape, parts, true)).map(
          (g) => g.rect as NonNullable<PartGeom['rect']>,
        );
        const w0 = rects[0]?.w ?? 0;
        const h0 = rects[0]?.h ?? 0;
        for (const r of rects) {
          expect(Math.abs(r.w - w0)).toBeLessThan(1e-9);
          expect(Math.abs(r.h - h0)).toBeLessThan(1e-9);
          expect(r.x).toBeGreaterThanOrEqual(f.x - 1e-9);
          expect(r.x + r.w).toBeLessThanOrEqual(f.x + f.w + 1e-9);
        }
      }
    }
  });

  it('circle parts: every sector spans exactly 360/parts degrees', () => {
    const f = shapeFrame('circle');
    if (f.kind !== 'circle') throw new Error('circle frame');
    for (let parts = 2; parts <= 12; parts += 1) {
      const p = fractionPicture('circle', parts, true);
      if (p.kind !== 'sectors') throw new Error('sectors');
      for (const g of sectorParts(f, p.sectors)) {
        expect(Math.abs((g.a1 ?? 0) - (g.a0 ?? 0) - 360 / parts)).toBeLessThan(1e-9);
      }
    }
  });

  it('unequal parts: `parts` parts, the biggest at least 1.5 times the smallest', () => {
    for (const shape of SHAPES) {
      for (let parts = 2; parts <= 12; parts += 1) {
        const geoms = pictureGeoms(shapeFrame(shape), fractionPicture(shape, parts, false));
        expect(geoms).toHaveLength(parts);
        const areas = geoms.map((g) => g.area);
        expect(Math.max(...areas) / Math.min(...areas), `${shape} ${parts}`).toBeGreaterThan(1.5);
        const whole = wholeArea(shape);
        expect(Math.abs(areas.reduce((a, b) => a + b, 0) - whole) / whole).toBeLessThan(1e-9);
      }
    }
  });

  it('the unequal circle in two is an off-centre chord whose pieces add up to the disc', () => {
    const f = shapeFrame('circle');
    if (f.kind !== 'circle') throw new Error('circle frame');
    const [left, right] = chordParts(f, 0.42) as [PartGeom, PartGeom];
    expect(left.area + right.area).toBeCloseTo(Math.PI * f.r * f.r, 6);
    expect(left.area / (left.area + right.area)).toBeGreaterThan(0.7);
    expect(chordParts(f, 0).map((g) => g.area / (Math.PI * f.r * f.r))).toEqual([
      expect.closeTo(0.5, 9),
      expect.closeTo(0.5, 9),
    ]);
  });

  it('cut lines: one per boundary between parts, never on the outline', () => {
    expect(cutPaths(shapeFrame('bar'), fractionPicture('bar', 4, true))).toHaveLength(3);
    expect(cutPaths(shapeFrame('rect'), fractionPicture('rect', 4, true))).toHaveLength(4);
    expect(cutPaths(shapeFrame('circle'), fractionPicture('circle', 3, true))).toHaveLength(3);
    expect(cutPaths(shapeFrame('circle'), fractionPicture('circle', 1, true))).toHaveLength(0);
    expect(cutPaths(shapeFrame('circle'), fractionPicture('circle', 2, false))).toHaveLength(1);
    const f = shapeFrame('rect');
    if (f.kind !== 'box') throw new Error('box frame');
    expect(boxCutPaths(f, [{ x0: 0, y0: 0, x1: 1, y1: 1 }])).toEqual([]);
  });
});
