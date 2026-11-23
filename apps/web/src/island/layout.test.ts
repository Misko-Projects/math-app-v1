import { describe, expect, it } from 'vitest';
import { type Box, type Rect, roomCrop } from './layout';

/** Where a scene point lands on a `size` screen that shows `crop` (scaled to fit, centred). */
function onScreen(crop: Box, size: { w: number; h: number }, x: number, y: number) {
  const scale = Math.min(size.w / crop.w, size.h / crop.h);
  return {
    left: (x - crop.x) * scale + (size.w - crop.w * scale) / 2,
    top: (y - crop.y) * scale + (size.h - crop.h * scale) / 2,
  };
}

describe('roomCrop', () => {
  const land: Box = { x: 300, y: 250, w: 800, h: 400 };
  const cases: { name: string; size: { w: number; h: number }; room: Rect }[] = [
    {
      name: '960 × 600',
      size: { w: 960, h: 600 },
      room: { left: 8, top: 128, right: 828, bottom: 364 },
    },
    {
      name: '1280 × 800',
      size: { w: 1280, h: 800 },
      room: { left: 8, top: 128, right: 1148, bottom: 564 },
    },
    {
      name: 'portrait',
      size: { w: 800, h: 1280 },
      room: { left: 8, top: 147, right: 668, bottom: 964 },
    },
  ];
  for (const { name, size, room } of cases) {
    it(`puts the whole land inside the room, centred (${name})`, () => {
      const crop = roomCrop(land, room, size, 100);
      const a = onScreen(crop, size, land.x, land.y);
      const b = onScreen(crop, size, land.x + land.w, land.y + land.h);
      expect(a.left).toBeGreaterThanOrEqual(room.left - 1e-6);
      expect(a.top).toBeGreaterThanOrEqual(room.top - 1e-6);
      expect(b.left).toBeLessThanOrEqual(room.right + 1e-6);
      expect(b.top).toBeLessThanOrEqual(room.bottom + 1e-6);
      expect((a.left + b.left) / 2).toBeCloseTo((room.left + room.right) / 2);
      expect((a.top + b.top) / 2).toBeCloseTo((room.top + room.bottom) / 2);
      // It touches the room on one axis: as large as it fits.
      const fills = [
        b.left - a.left - (room.right - room.left),
        b.top - a.top - (room.bottom - room.top),
      ];
      expect(Math.max(...fills)).toBeCloseTo(0);
      // The crop has the screen's shape, so the sea fills the screen with no bars.
      expect(crop.w / crop.h).toBeCloseTo(size.w / size.h);
    });
  }

  it('never shows less than the narrowest view, however small the land is', () => {
    const size = { w: 1280, h: 800 };
    const room = { left: 0, top: 0, right: 1280, bottom: 800 };
    const crop = roomCrop({ x: 600, y: 400, w: 60, h: 40 }, room, size, 800);
    expect(crop.w).toBeCloseTo(800);
    const c = onScreen(crop, size, 630, 420);
    expect(c.left).toBeCloseTo(640);
    expect(c.top).toBeCloseTo(400);
  });
});
