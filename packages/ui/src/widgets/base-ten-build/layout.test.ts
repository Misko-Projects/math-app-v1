import { formatModel } from '@number-island/engine';
import type { WidgetConfig } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  bundleHalf,
  bundleOffset,
  clampInto,
  columnPlan,
  columnWidth,
  KINDS,
  larger,
  type MatLayoutInput,
  matLayout,
  onesFrame,
  pieceBox,
  smaller,
  U_FLOOR,
  UNIT_G1,
  UNIT_K,
  unitCandidates,
} from './layout';

const counts = (thousands = 0, hundreds = 0, tens = 0, ones = 0) => ({
  thousands,
  hundreds,
  tens,
  ones,
});

// The widget's constants at 1280 × 800 (BaseTenBuildWidget): 1146 px wide, 596 px for pieces (578 in K).
const WORDS: Record<string, string> = {
  thousands: 'Thousands',
  hundreds: 'Hundreds',
  tens: 'Tens',
  ones: 'Ones',
};
const tablet = (k = false): Omit<MatLayoutInput, 'kinds' | 'counts'> => ({
  units: unitCandidates(k),
  width: 1146,
  height: k ? 578 : 596,
  gutter: (k ? 80 : 64) + 6,
  columnPad: 4,
  frame: 9,
  gap: 12,
  sideMin: k ? 150 : 156,
  sideMax: 260,
  headerWidth: (kind) => (k ? 56 : 44 + 11 * (WORDS[kind] ?? '').length),
});
/** Read mode: no trades (12 px between columns), the pad's fixed width beside the picture. */
const tabletRead = (k = false): Omit<MatLayoutInput, 'kinds' | 'counts'> => {
  const pad = k ? 3 * 96 + 24 : 3 * 76 + 24;
  return { ...tablet(k), gutter: 12, sideMin: pad, sideMax: pad };
};

describe('larger / smaller', () => {
  it('steps through the kinds', () => {
    expect(larger('ones')).toBe('tens');
    expect(larger('thousands')).toBeUndefined();
    expect(smaller('tens')).toBe('ones');
    expect(smaller('ones')).toBeUndefined();
  });
});

describe('pieceBox', () => {
  it('keeps true scale (a rod is ten units) with a grab-sized rod hit box', () => {
    expect(pieceBox('tens', 20)).toEqual({ w: 24, h: 200 });
    expect(pieceBox('tens', 28)).toEqual({ w: 32, h: 280 });
    expect(pieceBox('hundreds', 20)).toEqual({ w: 200, h: 200 });
    expect(pieceBox('ones', 20)).toEqual({ w: 20, h: 20 });
  });
});

describe('columnWidth', () => {
  it('wraps ones into frames of ten that stack while they fit', () => {
    const f = onesFrame(20);
    expect(columnWidth('ones', 34, 20, 606)).toBe(f.w);
    expect(columnWidth('ones', 34, 20, 100)).toBe(2 * f.w + 12);
    // Upright frames (two columns of five) are narrow.
    expect(columnWidth('ones', 9, 20, 606, 'compact')).toBe(onesFrame(20, 'v').w);
  });
  it('is null when one piece is taller than the mat', () => {
    expect(columnWidth('tens', 1, 70, 606)).toBeNull();
  });
  it('puts nine flats in a 3 × 3 grid at 20 px', () => {
    expect(columnWidth('hundreds', 9, 20, 606)).toBe(3 * 200 + 2 * 3);
  });
  it('lays rods side by side: one row, or at most two rows end to end', () => {
    expect(columnPlan('tens', 9, 20, 596)).toMatchObject({ cols: 9, rows: 1 });
    expect(columnPlan('tens', 9, 20, 596, 'compact')).toMatchObject({ cols: 5, rows: 2 });
    expect(columnPlan('tens', 4, 20, 596, 'compact')).toMatchObject({ cols: 4, rows: 1 });
    expect(columnPlan('tens', 14, 18, 596, 'compact')).toMatchObject({ cols: 7, rows: 2 });
  });
});

describe('matLayout', () => {
  it('draws every G1 item at the one 20 px unit', () => {
    const l = matLayout({ kinds: ['tens', 'ones'], counts: counts(0, 0, 3, 4), ...tablet() });
    expect(l.u).toBe(UNIT_G1);
    expect(l.fits).toBe(true);
  });

  it('draws K bigger when it fits', () => {
    const l = matLayout({ kinds: ['tens', 'ones'], counts: counts(0, 0, 1, 3), ...tablet(true) });
    expect(l.u).toBe(UNIT_K);
  });

  it('fits 999 at 19 px (the closest to 20 px): flats 3 × 3, rods in two rows of five', () => {
    const l = matLayout({
      kinds: ['hundreds', 'tens', 'ones'],
      counts: counts(0, 9, 9, 9),
      ...tablet(),
    });
    expect(l.u).toBe(19);
    expect(l.columns.find((c) => c.kind === 'hundreds')?.plan).toMatchObject({ cols: 3, rows: 3 });
    expect(l.columns.find((c) => c.kind === 'tens')?.plan).toMatchObject({ cols: 5, rows: 2 });
    expect(l.matWidth + 12 + l.sideWidth).toBeLessThanOrEqual(1146);
    expect(l.sideWidth).toBeGreaterThanOrEqual(160);
  });

  it('fits 1234 at 20 px', () => {
    const l = matLayout({
      kinds: ['thousands', 'hundreds', 'tens', 'ones'],
      counts: counts(1, 2, 3, 4),
      ...tablet(),
    });
    expect(l.u).toBe(20);
    expect(l.columns.map((c) => c.kind)).toEqual(['thousands', 'hundreds', 'tens', 'ones']);
  });

  it('never makes a column narrower than its header', () => {
    const l = matLayout({ kinds: ['hundreds', 'tens'], counts: counts(), ...tablet() });
    for (const c of l.columns) expect(c.width).toBeGreaterThanOrEqual(40 + 11 * 4 + 8);
  });

  it('reports content beyond any authored item as not fitting', () => {
    const l = matLayout({
      kinds: ['hundreds', 'tens', 'ones'],
      counts: counts(0, 400, 0, 0),
      ...tablet(),
    });
    expect(l.fits).toBe(false);
    expect(l.u).toBeLessThan(U_FLOOR);
  });
});

describe('dense packing (extreme counts only)', () => {
  it('stacks rods in as many rows as the mat holds, only when nothing else fits', () => {
    expect(columnPlan('tens', 99, 8, 596, 'compact')).toMatchObject({ rows: 2, cols: 50 });
    expect(columnPlan('tens', 99, 8, 596, 'dense')).toMatchObject({ rows: 7, cols: 15 });
    // An authored mat never packs densely: 999 and 1234 keep their loose or compact plans.
    const l = matLayout({
      kinds: ['hundreds', 'tens', 'ones'],
      counts: counts(0, 9, 9, 9),
      ...tablet(),
    });
    expect(l.columns.find((c) => c.kind === 'tens')?.plan).toMatchObject({ cols: 5, rows: 2 });
    expect(l.overflow).toBe(false);
  });

  it('fits the review case (a read of 1000 shown as 100 rods) instead of overflowing', () => {
    // Before dense packing this mat needed ~1300 px of rods in two rows.
    for (const k of [false, true]) {
      const l = matLayout({ kinds: KINDS, counts: counts(0, 0, 100, 0), ...tabletRead(k) });
      expect(l.overflow).toBe(false);
      expect(l.matWidth + 12 + l.sideWidth).toBeLessThanOrEqual(1146);
    }
  });

  it('reports a mat no unit can fit as overflowing', () => {
    const l = matLayout({ kinds: KINDS, counts: counts(40, 0, 400, 0), ...tablet() });
    expect(l.overflow).toBe(true);
    expect(l.fits).toBe(false);
  });
});

/**
 * The engine caps what an item may start with or need on the mat (MAT_MAX in the engine's
 * base-ten-build model). Probe the cap through the model's own schema, so this test follows it.
 */
function engineCap(kind: (typeof KINDS)[number]): number {
  const schema = formatModel('base-ten-build')?.configSchema;
  if (!schema) throw new Error('no base-ten-build model');
  const value = { thousands: 1000, hundreds: 100, tens: 10, ones: 1 }[kind];
  const ok = (n: number) =>
    schema.safeParse({
      format: 'base-ten-build',
      target: n * value,
      mode: 'read',
      pieces: { thousands: true, hundreds: true, tens: true, ones: true },
      wholeIs: 'unit',
      prebuilt: { hundreds: 0, tens: 0, ones: 0, [kind]: n },
    } satisfies WidgetConfig).success;
  let n = 1;
  while (ok(n + 1) && n < 10_000) n++;
  return n;
}

describe('the largest mat the engine allows', () => {
  const cap = counts(
    engineCap('thousands'),
    engineCap('hundreds'),
    engineCap('tens'),
    engineCap('ones'),
  );

  it('is well above every generator (9 thousands, 10 hundreds, 19 tens, 99 ones)', () => {
    expect(cap).toEqual(counts(9, 19, 29, 199));
  });

  // Every age mode and mode, all four columns full at once: the worst case.
  const envs = [
    ['G1 build', tablet(false)],
    ['K build', tablet(true)],
    ['G1 read', tabletRead(false)],
    ['K read', tabletRead(true)],
  ] as const;
  for (const [name, env] of envs) {
    it(`fits 1280 × 800 without overlap (${name})`, () => {
      // The widget measures fractional widths and keeps half a px of slack.
      const l = matLayout({ kinds: KINDS, counts: cap, ...env, width: 1146 - 0.5 });
      expect(l.overflow).toBe(false);
      expect(l.sideWidth).toBeGreaterThanOrEqual(env.sideMin);
      expect(l.matWidth + env.gap + l.sideWidth).toBeLessThanOrEqual(1146 - 0.5);
      for (const c of l.columns) {
        const n = cap[c.kind];
        const box = c.kind === 'ones' ? onesFrame(l.u, l.orient) : pieceBox(c.kind, l.u);
        // Every piece (or frame of ten ones) has its own cell, and the cells tile apart.
        const cells = c.kind === 'ones' ? Math.ceil(n / 10) : n;
        expect(c.plan.cols * c.plan.rows).toBeGreaterThanOrEqual(cells);
        expect(c.plan.w).toBeGreaterThanOrEqual(c.plan.cols * box.w);
        expect(c.plan.h).toBeGreaterThanOrEqual(c.plan.rows * box.h);
        // The cells fit their column and the mat's height.
        expect(c.plan.w + 8).toBeLessThanOrEqual(c.width);
        expect(c.plan.h).toBeLessThanOrEqual(env.height);
      }
    });
  }

  it('fits every smaller mat too (each kind swept from 0 to its cap, the rest full)', () => {
    for (const [, env] of envs) {
      for (const kind of KINDS) {
        for (let n = 0; n <= cap[kind]; n++) {
          const l = matLayout({ kinds: KINDS, counts: { ...cap, [kind]: n }, ...env });
          expect(l.overflow, `${kind} ${n}`).toBe(false);
        }
      }
    }
  });
});

describe('bundles', () => {
  it('lines ten units up as a rod and ten rods side by side as a flat', () => {
    const units = Array.from({ length: 10 }, (_, j) => bundleOffset('ones', j, 10));
    expect(units.map((p) => p.x)).toEqual(Array(10).fill(0));
    expect(units[9]?.y).toBeCloseTo(-(units[0]?.y ?? 0));
    expect((units[1]?.y ?? 0) - (units[0]?.y ?? 0)).toBe(10);
    const rods = Array.from({ length: 10 }, (_, j) => bundleOffset('tens', j, 10));
    expect(rods.map((p) => p.y)).toEqual(Array(10).fill(0));
    expect((rods[1]?.x ?? 0) - (rods[0]?.x ?? 0)).toBe(10);
  });

  it('keeps a bundle inside the board', () => {
    const box = { left: 0, top: 0, right: 400, bottom: 400 };
    const half = bundleHalf('ones', 30);
    expect(clampInto({ x: 200, y: 20 }, half, box)).toEqual({ x: 200, y: 150 });
    expect(clampInto({ x: 200, y: 200 }, half, box)).toEqual({ x: 200, y: 200 });
    expect(clampInto({ x: 0, y: 0 }, { x: 300, y: 300 }, box)).toEqual({ x: 200, y: 200 });
  });
});
