// fraction-cut stage layout (U05, #14): the drawing fits its room, knives keep their size and
// gap, and cut parts move apart by whole gaps without changing size.
import { type CutShape, guidedLines, splitRects } from '@number-island/engine';
import { describe, expect, it } from 'vitest';
import { shapeFrame } from '../kit';
import {
  boxOffsets,
  CUT_GAP_PX,
  circleShiftPx,
  cutGapPx,
  cutLayout,
  ghostOutline,
  knivesClear,
  RADIAL_SEAM_SHARE,
  radialSeamHalfWidth,
  sectorOffsets,
} from './cutLayout';

// The stage room the K01 items get at the smallest landscape area (852 × 319 inside the card,
// minus the tools column) and on the tablet.
const ROOMS = {
  landscapeMinK: { w: 852 - 220 - 48, h: 319 - 24, knife: 80 },
  landscapeMinG1: { w: 852 - 190 - 48, h: 319 - 24, knife: 64 },
  tabletK: { w: 1172 - 220 - 48, h: 439 - 24, knife: 80 },
};

const CASES: [CutShape, number][] = [
  ['circle', 2],
  ['circle', 3],
  ['circle', 4],
  ['circle', 6],
  ['circle', 8],
  ['rect', 2],
  ['rect', 3],
  ['rect', 4],
  ['rect', 6],
  ['rect', 8],
  ['square', 2],
  ['square', 4],
  ['bar', 2],
  ['bar', 4],
];

describe('cutLayout', () => {
  it.each(Object.entries(ROOMS))('every K01 whole fits the %s room', (_name, room) => {
    for (const [shape, parts] of CASES) {
      const frame = shapeFrame(shape, undefined, parts > 4 ? 2.6 : 1.5);
      const guides = guidedLines(shape, parts);
      const lay = cutLayout(frame, guides, parts, room, room.knife);
      expect(lay.width, `${shape} ${parts}`).toBeLessThanOrEqual(room.w + 0.5);
      expect(lay.height, `${shape} ${parts}`).toBeLessThanOrEqual(room.h + 0.5);
      expect(lay.knives).toHaveLength(guides.length);
      // Knives lie inside the stage and never overlap or crowd each other.
      for (const k of lay.knives) {
        expect(k.x - room.knife / 2).toBeGreaterThanOrEqual(-0.5);
        expect(k.y - room.knife / 2).toBeGreaterThanOrEqual(-0.5);
        expect(k.x + room.knife / 2).toBeLessThanOrEqual(lay.width + 0.5);
        expect(k.y + room.knife / 2).toBeLessThanOrEqual(lay.height + 0.5);
      }
      for (let i = 0; !lay.single && i < lay.knives.length; i += 1) {
        for (let j = i + 1; j < lay.knives.length; j += 1) {
          const a = lay.knives[i] as { x: number; y: number };
          const b = lay.knives[j] as { x: number; y: number };
          const gap = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) - room.knife;
          expect(gap, `${shape} ${parts}: knives ${i}, ${j}`).toBeGreaterThanOrEqual(12);
        }
      }
      // One knife per line, clear of each other, or one knife at a time.
      expect(lay.single || knivesClear(lay.knives, room.knife)).toBe(true);
    }
  });

  it('box parts move apart by one gap per cut between them', () => {
    const rects = [
      { x0: 0, y0: 0, x1: 0.5, y1: 0.5 },
      { x0: 0.5, y0: 0, x1: 1, y1: 0.5 },
      { x0: 0, y0: 0.5, x1: 0.5, y1: 1 },
      { x0: 0.5, y0: 0.5, x1: 1, y1: 1 },
    ];
    expect(boxOffsets(rects, 10)).toEqual([
      { dx: -5, dy: -5 },
      { dx: 5, dy: -5 },
      { dx: -5, dy: 5 },
      { dx: 5, dy: 5 },
    ]);
    expect(boxOffsets([{ x0: 0, y0: 0, x1: 1, y1: 1 }], 10)).toEqual([{ dx: 0, dy: 0 }]);
  });

  it('sectors move out along their bisectors far enough to leave a gap', () => {
    expect(sectorOffsets([{ a0: 0, a1: 360 }], 10)).toEqual([{ dx: 0, dy: 0 }]);
    const [top, bottom] = sectorOffsets(
      [
        { a0: 270, a1: 450 },
        { a0: 90, a1: 270 },
      ],
      10,
    );
    expect(top?.dy).toBeCloseTo(-10, 9);
    expect(bottom?.dy).toBeCloseTo(10, 9);
    for (const angle of [45, 60, 90, 120, 180]) {
      const d = circleShiftPx(angle);
      expect(2 * d * Math.sin(((angle / 2) * Math.PI) / 180)).toBeGreaterThanOrEqual(
        CUT_GAP_PX - 1e-9,
      );
    }
  });
});

describe('the cut whole reads as one whole (PR #100 evidence review)', () => {
  const SHAPES = ['rect', 'square', 'bar', 'circle'] as const;

  it('the outline encloses every piece, for every part count and shape', () => {
    for (const shape of SHAPES) {
      for (let parts = 2; parts <= 12; parts += 1) {
        const frame = shapeFrame(shape, undefined, parts > 4 ? 2.6 : 1.5);
        const guides = guidedLines(shape, parts);
        const lay = cutLayout(frame, guides, parts, { w: 700, h: 320 }, 64);
        const pad = 6 / lay.scale;
        if (frame.kind === 'circle') {
          const sectors = Array.from({ length: parts }, (_, i) => ({
            a0: (i * 360) / parts,
            a1: ((i + 1) * 360) / parts,
          }));
          const shift = circleShiftPx(360 / parts, lay.gapPx) / lay.scale;
          const ghost = ghostOutline(frame, sectorOffsets(sectors, shift), pad);
          // A sector moved out along its bisector reaches at most r + shift from the centre.
          expect(ghost.kind === 'circle' && ghost.r, `${shape} ${parts}`).toBeGreaterThanOrEqual(
            frame.r + shift,
          );
          // And the spread stays small beside the piece: under a third of the radius on screen.
          expect(shift * lay.scale, `${shape} ${parts}`).toBeLessThanOrEqual(
            (frame.r * lay.scale) / 3,
          );
          continue;
        }
        let rects = [{ x0: 0, y0: 0, x1: 1, y1: 1 }];
        for (const g of guides) if (g.kind !== 'radii') rects = splitRects(rects, g.kind, g.at);
        expect(rects).toHaveLength(parts);
        const offsets = boxOffsets(rects, lay.gapPx / lay.scale);
        const ghost = ghostOutline(frame, offsets, pad);
        if (ghost.kind !== 'box') throw new Error('a box whole has a box outline');
        for (const [i, r] of rects.entries()) {
          const o = offsets[i] as { dx: number; dy: number };
          const x0 = frame.x + r.x0 * frame.w + o.dx;
          const x1 = frame.x + r.x1 * frame.w + o.dx;
          const y0 = frame.y + r.y0 * frame.h + o.dy;
          const y1 = frame.y + r.y1 * frame.h + o.dy;
          expect(x0, `${shape} ${parts} part ${i}`).toBeGreaterThanOrEqual(ghost.x);
          expect(x1, `${shape} ${parts} part ${i}`).toBeLessThanOrEqual(ghost.x + ghost.width);
          expect(y0, `${shape} ${parts} part ${i}`).toBeGreaterThanOrEqual(ghost.y);
          expect(y1, `${shape} ${parts} part ${i}`).toBeLessThanOrEqual(ghost.y + ghost.height);
        }
        // A gap is never wider than the piece beside it.
        const narrowest = Math.min(
          ...rects.map((r) => Math.min((r.x1 - r.x0) * frame.w, (r.y1 - r.y0) * frame.h)),
        );
        expect(lay.gapPx / lay.scale, `${shape} ${parts}`).toBeLessThanOrEqual(narrowest);
      }
    }
  });

  it('parts that are tap targets (up to fourths) keep the full gap; smaller ones move less', () => {
    expect([2, 3, 4].map(cutGapPx)).toEqual([CUT_GAP_PX, CUT_GAP_PX, CUT_GAP_PX]);
    expect(cutGapPx(6)).toBeLessThan(CUT_GAP_PX);
    expect(cutGapPx(12)).toBeLessThan(cutGapPx(6));
  });
});

describe('radial seams leave the pieces to the pieces (PR #100 review round 4)', () => {
  /** Whether a point `rho` from the hub and `delta` degrees off the cut lies in the seam's wedge. */
  const inSeam = (rho: number, delta: number, narrow: number, r: number, maxWidth: number) => {
    const rad = (delta * Math.PI) / 180;
    const along = rho * Math.cos(rad);
    const across = Math.abs(rho * Math.sin(rad));
    return along >= 0 && along <= r && across <= radialSeamHalfWidth(along, narrow, maxWidth);
  };

  it('every part count: a tap clearly inside a sector, at any radius to the rim, is the sector’s', () => {
    for (let parts = 2; parts <= 12; parts += 1) {
      const sector = 360 / parts;
      for (const r of [60, 108, 240]) {
        for (const maxWidth of [64, 80, 1e6]) {
          for (const share of [0.05, 0.25, 0.5, 0.72, 0.9, 1]) {
            // From a quarter of the sector off either cut to its middle.
            for (const t of [0.25, 0.3, 0.5]) {
              const fromLeft = inSeam(r * share, t * sector, sector, r, maxWidth);
              const fromRight = inSeam(r * share, (1 - t) * sector, sector, r, maxWidth);
              expect(fromLeft || fromRight, `${parts} parts, r ${r}, ${share}, ${t}`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('the reported tap (fourths, 90 % up the cut, a quarter radius to the side) is the piece’s', () => {
    const r = 108;
    const rho = Math.hypot(0.9 * r, 0.25 * r);
    const delta = (Math.atan2(0.25, 0.9) * 180) / Math.PI;
    expect(inSeam(rho, delta, 90, r, 80)).toBe(false);
    // With the two-fifths wedge of round 3 it was the seam's (the defect).
    expect(0.25 * r).toBeLessThan(0.9 * r * Math.tan((0.2 * 90 * Math.PI) / 180));
  });

  it('the cut itself is the seam’s from the hub to the rim, and the seam never passes a target', () => {
    for (let parts = 2; parts <= 12; parts += 1) {
      const sector = 360 / parts;
      for (const share of [0, 0.1, 0.5, 1])
        expect(inSeam(108 * share, 0, sector, 108, 64)).toBe(true);
      expect(radialSeamHalfWidth(1e6, sector, 64)).toBe(32);
      // A tenth of the sector on each side of the cut.
      expect(inSeam(100, RADIAL_SEAM_SHARE * sector * 0.9, sector, 1e6, 1e6)).toBe(true);
      expect(inSeam(100, RADIAL_SEAM_SHARE * sector * 1.2, sector, 1e6, 1e6)).toBe(false);
    }
  });
});
