// fraction-cut stage layout (U05, #14): the drawing fits its room, knives keep their size and
// gap, and cut parts move apart by whole gaps without changing size.
import { type CutShape, guidedLines } from '@number-island/engine';
import { describe, expect, it } from 'vitest';
import { shapeFrame } from '../kit';
import {
  boxOffsets,
  CUT_GAP_PX,
  circleShiftPx,
  cutLayout,
  knivesClear,
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
