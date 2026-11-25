import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatModel } from '@number-island/engine';
import type { WidgetConfig } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { planPhrases } from '../../audio/narration';
import { narrationFixture } from '../../audio/testing/narrationFixture';
import {
  bundleHalf,
  bundleOffset,
  clampInto,
  columnPlan,
  columnWidth,
  DISK_FLOOR,
  DISK_MAX,
  DISK_ROWS_MIN,
  diskCandidates,
  diskGap,
  diskGroupGap,
  KINDS,
  larger,
  type MatLayoutInput,
  matLayout,
  onesFrame,
  type PlanInput,
  pieceBox,
  planMat,
  READ_GAP,
  readSide,
  roomForMove,
  type SideSpec,
  sideNeed,
  sidePlan,
  smaller,
  U_FLOOR,
  UNIT_G1,
  UNIT_K,
  unitCandidates,
  usableSizes,
  valueSpeech,
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
/** The side panel's height: the widget's 666 px less its 2 px top and bottom padding. */
const SIDE_H = 662;
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
function engineCap(kind: (typeof KINDS)[number], wholeIs: 'unit' | 'flat'): number {
  const schema = formatModel('base-ten-build')?.configSchema;
  if (!schema) throw new Error('no base-ten-build model');
  const value = { thousands: 1000, hundreds: 100, tens: 10, ones: 1 }[kind];
  const ok = (n: number) =>
    schema.safeParse({
      format: 'base-ten-build',
      target: n * value,
      mode: 'read',
      pieces: { thousands: true, hundreds: true, tens: true, ones: true },
      wholeIs,
      prebuilt: { hundreds: 0, tens: 0, ones: 0, [kind]: n },
    } satisfies WidgetConfig).success;
  let n = 1;
  while (ok(n + 1) && n < 10_000) n++;
  return n;
}

/** Column names with the flat as the whole (`wholeIs: 'flat'`): wider than the ones mat's. */
const DECIMAL_WORDS: Record<string, string> = {
  thousands: 'Tens',
  hundreds: 'Ones',
  tens: 'Tenths',
  ones: 'Hundredths',
};

for (const wholeIs of ['unit', 'flat'] as const) {
  const flat = wholeIs === 'flat';
  describe(`the largest mat the engine allows (wholeIs: ${wholeIs})`, () => {
    const cap = counts(
      engineCap('thousands', wholeIs),
      engineCap('hundreds', wholeIs),
      engineCap('tens', wholeIs),
      engineCap('ones', wholeIs),
    );

    // (All four kinds in play: proportional pieces. A mat to 999 with hundreds in play draws
    // place-value disks, K02: the tests at the end of this file.)
    it('is above every generator (unit: 9/10/19/99; decimals, pv.number: 9/10/10/19)', () => {
      expect(cap).toEqual(flat ? counts(9, 14, 29, 199) : counts(9, 19, 29, 199));
    });

    // Every age mode and label style, all four columns full at once, beside the fullest side
    // panels: four piles (plain, or with stock tags), the goal (or none: arithmetic), and
    // build-exact's goal with three chips. The panel claims the room it needs to fit its height
    // (sideNeed); the mat shrinks.
    const big = flat ? '99.99' : '9999';
    const exactGoal = flat ? '91.11' : '9111';
    const panels: [string, Omit<SideSpec, 'k' | 'height'>][] = [
      ['no goal', { piles: [false, false, false, false], goal: null, exact: [] }],
      ['goal', { piles: [false, false, false, false], goal: big, exact: [] }],
      ['goal, limits', { piles: [false, true, true, true], goal: big, exact: [] }],
      [
        'exact',
        { piles: [false, true, true, true], goal: exactGoal, exact: ['hundreds', 'tens', 'ones'] },
      ],
      [
        'exact, 99.99',
        { piles: [false, true, true, true], goal: big, exact: ['hundreds', 'tens', 'ones'] },
      ],
      [
        'exact, two- and three-digit chips',
        {
          piles: [false, true, true, true],
          goal: big,
          exact: ['hundreds', 'tens', 'ones'],
          exactN: [flat ? 14 : 19, 29, 199],
        },
      ],
      [
        'exact, three piles',
        { piles: [true, true, true], goal: exactGoal, exact: ['hundreds', 'tens', 'ones'] },
      ],
      ['goal, three piles', { piles: [true, true, true], goal: big, exact: [] }],
    ];
    const words = flat ? DECIMAL_WORDS : WORDS;
    const labels = [
      ['G1 words', false, (kind: string) => 44 + 11 * (words[kind] ?? '').length],
      ['G1 icons', false, () => 44],
      ['K', true, () => 56],
    ] as const;
    const envs: [
      string,
      Omit<MatLayoutInput, 'kinds' | 'counts'>,
      (SideSpec & { crowded: boolean }) | null,
    ][] = [];
    for (const [age, k, headerWidth] of labels) {
      const base = { ...tablet(k), headerWidth };
      for (const [name, p] of panels) {
        const spec: SideSpec = { ...p, k, height: SIDE_H };
        const room = (w: number) => ({ sideMin: w, sideMax: Math.max(260, w) });
        // As the widget chooses: the usual panel if the mat fits beside it, else the crowded one.
        const need = sideNeed(
          spec,
          tablet(k).sideMin,
          (w) =>
            !matLayout({ kinds: KINDS, counts: cap, ...base, ...room(w), width: 1145.5 }).overflow,
        );
        envs.push([
          `${age} build, ${name}`,
          { ...base, ...room(need.width) },
          { ...spec, crowded: need.crowded },
        ]);
      }
      envs.push([`${age} read`, { ...tabletRead(k), headerWidth }, null]);
    }
    for (const [name, env, spec] of envs) {
      it(`fits 1280 × 800 without overlap (${name})`, () => {
        // The widget measures fractional widths and keeps half a px of slack.
        const l = matLayout({ kinds: KINDS, counts: cap, ...env, width: 1146 - 0.5 });
        expect(l.overflow).toBe(false);
        expect(l.sideWidth).toBeGreaterThanOrEqual(env.sideMin);
        expect(l.matWidth + env.gap + l.sideWidth).toBeLessThanOrEqual(1146 - 0.5);
        if (spec) {
          // The side panel, laid out at its width, fits the widget's height.
          const p = sidePlan(spec, l.sideWidth, spec.crowded);
          expect(p.width).toBeLessThanOrEqual(l.sideWidth);
          expect(p.height).toBeLessThanOrEqual(SIDE_H);
        }
        for (const c of l.columns) {
          const n = cap[c.kind];
          const box = c.kind === 'ones' ? onesFrame(l.u, l.orient) : pieceBox(c.kind, l.u);
          // Every piece (or frame of ten ones) has its own cell, and the cells tile apart.
          const cells = c.kind === 'ones' ? Math.ceil(n / 10) : n;
          expect(c.plan.cols * c.plan.rows).toBeGreaterThanOrEqual(cells);
          expect(c.plan.w).toBeGreaterThanOrEqual(c.plan.cols * box.w);
          expect(c.plan.h).toBeGreaterThanOrEqual(c.plan.rows * box.h);
          // The cells and the column's name fit the column, and the cells the mat's height.
          expect(c.plan.w + 8).toBeLessThanOrEqual(c.width);
          expect(env.headerWidth(c.kind) + 8).toBeLessThanOrEqual(c.width);
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
}

describe('the move guard agrees with the layout (review round 4)', () => {
  const g1Mat = (words: Record<string, string>) => ({
    ...tablet(false),
    width: 1145.5,
    headerWidth: (kind: string) => 44 + 11 * (words[kind] ?? '').length,
  });
  type Counts = Record<(typeof KINDS)[number], number>;
  const moves = (c: Counts): Counts[] => [
    { ...c, thousands: c.thousands + 1 },
    { ...c, hundreds: c.hundreds + 1 },
    { ...c, tens: c.tens + 1 },
    { ...c, ones: c.ones + 1 },
    ...(c.thousands > 0 ? [{ ...c, thousands: c.thousands - 1, hundreds: c.hundreds + 10 }] : []),
    ...(c.hundreds > 0 ? [{ ...c, hundreds: c.hundreds - 1, tens: c.tens + 10 }] : []),
    ...(c.tens > 0 ? [{ ...c, tens: c.tens - 1, ones: c.ones + 10 }] : []),
    ...(c.ones >= 10 ? [{ ...c, ones: c.ones - 10, tens: c.tens + 1 }] : []),
  ];

  it('lets the review move happen: splitting a thousand fits beside the crowded panel', () => {
    const input: PlanInput = {
      mat: g1Mat(WORDS),
      side: {
        spec: {
          k: false,
          piles: [true, true, true],
          tall: [false, true, false],
          goal: '2189',
          exact: ['hundreds'],
          exactN: [19],
          height: SIDE_H,
        },
        min: 156,
      },
    };
    const before = { thousands: 1, hundreds: 9, tens: 28, ones: 9 };
    const after = { thousands: 0, hundreds: 19, tens: 28, ones: 9 };
    const now = planMat(input, KINDS, before);
    expect(now.side).toEqual({ width: 356, crowded: false });
    expect(now.layout.overflow).toBe(false);
    // The old guard asked about the current panel: the split overflows beside it.
    const current = { sideMin: now.side.width, sideMax: Math.max(260, now.side.width) };
    expect(matLayout({ ...input.mat, ...current, kinds: KINDS, counts: after }).overflow).toBe(
      true,
    );
    // The guard asks what the layout will do: the crowded panel, and the mat fits.
    expect(
      roomForMove(input, { kinds: KINDS, counts: before }, { kinds: KINDS, counts: after }),
    ).toBe(true);
    const next = planMat(input, KINDS, after);
    expect(next.side.crowded).toBe(true);
    expect(next.layout.overflow).toBe(false);
    expect(next.layout.matWidth + 12 + next.layout.sideWidth).toBeLessThanOrEqual(1145.5);
  });

  it("lets the reviewer's K move happen: the tenth flat fits beside the compact panel", () => {
    // build-exact 9180 (exactly 18 tens, no ones), all four piles, one hundred in the tray.
    const input: PlanInput = {
      mat: { ...tablet(true), width: 1145.5 },
      side: {
        spec: {
          k: true,
          piles: [false, true, false, true],
          tall: [false, false, true, false],
          goal: '9180',
          exact: ['tens', 'ones'],
          exactN: [18, 0],
          height: SIDE_H,
        },
        min: 150,
      },
    };
    const before = { thousands: 8, hundreds: 9, tens: 18, ones: 0 };
    const after = { thousands: 8, hundreds: 10, tens: 18, ones: 0 };
    const now = planMat(input, KINDS, before);
    expect(now.side.crowded).toBe(false);
    expect(now.layout.overflow).toBe(false);
    // Beside the current (balanced) panel the tenth flat's second column doesn't fit.
    const current = { sideMin: now.side.width, sideMax: Math.max(260, now.side.width) };
    expect(matLayout({ ...input.mat, ...current, kinds: KINDS, counts: after }).overflow).toBe(
      true,
    );
    expect(
      roomForMove(input, { kinds: KINDS, counts: before }, { kinds: KINDS, counts: after }),
    ).toBe(true);
    const next = planMat(input, KINDS, after);
    expect(next.side.crowded).toBe(true);
    expect(next.side.width).toBeLessThan(now.side.width);
    expect(next.layout.overflow).toBe(false);
    expect(next.layout.matWidth + 12 + next.layout.sideWidth).toBeLessThanOrEqual(1145.5);
  });

  it('never allows a move the layout cannot fit, from any fitting state (cap sweep)', () => {
    const panels: Omit<SideSpec, 'k' | 'height'>[] = [
      {
        piles: [true, true, true],
        tall: [false, true, false],
        goal: '2189',
        exact: ['hundreds'],
        exactN: [19],
      },
      { piles: [false, true, true, true], goal: '9999', exact: [] },
      { piles: [false, true, true, true], goal: '9111', exact: ['hundreds', 'tens', 'ones'] },
      { piles: [false, false, false, false], goal: null, exact: [] },
    ];
    let checked = 0;
    let allowed = 0;
    for (const flat of [false, true]) {
      const words = flat ? DECIMAL_WORDS : WORDS;
      for (const k of [false, true]) {
        const mat = k ? { ...tablet(true), width: 1145.5 } : g1Mat(words);
        for (const p of panels) {
          const input: PlanInput = {
            mat,
            side: { spec: { ...p, k, height: SIDE_H }, min: tablet(k).sideMin },
          };
          for (let th = 0; th <= 9; th += 3) {
            for (let h = 0; h <= 19; h += 4) {
              for (let t = 0; t <= 29; t += 7) {
                for (const o of [0, 19, 99, 199]) {
                  const before = { thousands: th, hundreds: h, tens: t, ones: o };
                  if (planMat(input, KINDS, before).layout.overflow) continue;
                  for (const after of moves(before)) {
                    checked++;
                    const ok = roomForMove(
                      input,
                      { kinds: KINDS, counts: before },
                      { kinds: KINDS, counts: after },
                    );
                    if (!ok) continue;
                    allowed++;
                    const l = planMat(input, KINDS, after).layout;
                    expect(l.overflow, JSON.stringify(after)).toBe(false);
                    expect(l.matWidth + 12 + l.sideWidth).toBeLessThanOrEqual(1145.5);
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(allowed).toBeGreaterThan(checked / 2);
  }, 120_000);
});

describe('side panel', () => {
  it('keeps the usual narrow panel for authored items (one column of piles, goal and chips)', () => {
    const items: SideSpec[] = [
      { k: false, piles: [true, false], goal: '34', exact: ['tens'], height: SIDE_H },
      { k: true, piles: [false, false], goal: '13', exact: [], height: SIDE_H },
      { k: false, piles: [false, false, false], goal: '999', exact: [], height: SIDE_H },
    ];
    for (const s of items) {
      expect(sideNeed(s, tablet(s.k).sideMin)).toEqual({
        width: tablet(s.k).sideMin,
        crowded: false,
      });
    }
  });

  it('stands three tall stock-tag piles in one row rather than a column too tall for the panel', () => {
    // Three limited piles, each with a ≥ 32 px count on its tag.
    const s: SideSpec = {
      k: false,
      piles: [true, true, true],
      goal: '1.25',
      exact: [],
      height: SIDE_H,
    };
    expect(sidePlan(s, 156, false).height).toBeGreaterThan(SIDE_H);
    const need = sideNeed(s, 156);
    expect(need).toEqual({ width: 20 + 3 * 104 + 2 * 12, crowded: false });
    expect(sidePlan(s, need.width, false)).toMatchObject({ pileCols: 3 });
    // When the mat can't spare that room, the piles go 2 + 1 instead.
    expect(sideNeed(s, 156, (w) => w < 300)).toEqual({ width: 240, crowded: true });
  });

  it('review case: four piles, the goal and three chips need a crowded, wider panel in K', () => {
    const s: SideSpec = {
      k: true,
      piles: [false, true, false, false],
      goal: '9111',
      exact: ['hundreds', 'tens', 'ones'],
      height: SIDE_H,
    };
    // At the old narrow width the piles stack in one column and the panel passes 800 px.
    expect(sidePlan(s, 164, false).height).toBeGreaterThan(SIDE_H + 300);
    const need = sideNeed(s, 150);
    expect(need.crowded).toBe(true);
    const p = sidePlan(s, need.width, true);
    expect(p).toMatchObject({ pileCols: 2, askCols: 2, lg: false });
    expect(p.height).toBeLessThanOrEqual(SIDE_H);
  });

  it('draws the goal large only when the panel still fits its height', () => {
    const s: SideSpec = { k: false, piles: [false, false], goal: '34', exact: [], height: SIDE_H };
    expect(sidePlan(s, 260, false).lg).toBe(true);
    expect(sidePlan({ ...s, height: 300 }, 260, false).lg).toBe(false);
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

describe('usableSizes (PR #74 review, rounds 6 to 8)', () => {
  const sizes = (over: object = {}) => ({
    pileW: 96,
    tileH: [80, 84],
    goal: { w: 120, h: 80, lgW: 180, lgH: 110, compactW: 90 },
    chips: [{ w: 140, compactW: 100, h: 64 }],
    checkW: 150,
    checkH: 70,
    ...over,
  });
  const item = { piles: 2, chips: 1, goal: true };

  it('keeps measurements that show the item', () => {
    const m = sizes();
    expect(usableSizes(m, item)).toBe(m);
    expect(usableSizes(null, item)).toBeUndefined();
  });

  it('keeps the goal, chip and check measurements of a tray with no piles', () => {
    const m = sizes({ pileW: 0, tileH: [] });
    expect(usableSizes(m, { ...item, piles: 0 })).toBe(m);
    // The planner then lays out the measured goal and chip, not the larger model.
    const spec = {
      k: false,
      piles: [],
      goal: '34',
      exact: ['tens'] as const,
      exactN: [2],
      height: 600,
    };
    const measuredPlan = sidePlan({ ...spec, sizes: m }, 400, false);
    const modelPlan = sidePlan(spec, 400, false);
    expect(measuredPlan.height).toBeLessThanOrEqual(modelPlan.height);
  });

  it('drops measurements of another item, or of piles not drawn yet', () => {
    expect(usableSizes(sizes({ pileW: 0 }), item)).toBeUndefined();
    expect(usableSizes(sizes(), { ...item, piles: 3 })).toBeUndefined();
    expect(usableSizes(sizes(), { ...item, chips: 0 })).toBeUndefined();
    expect(usableSizes(sizes(), { ...item, goal: false })).toBeUndefined();
    expect(usableSizes(sizes({ goal: null }), item)).toBeUndefined();
  });
});

describe('valueSpeech: every value is spoken (PR #74 review rounds 1 and 2)', () => {
  // The word lines of packages/content/narration/ui.yaml (the content build compiles and checks
  // them): static words, because a phrase line cannot fill slots.
  const yaml = readFileSync(
    fileURLToPath(new URL('../../../../content/narration/ui.yaml', import.meta.url)),
    'utf8',
  );
  const lineText = (key: string): string | null => {
    const m = new RegExp(`^${key.replaceAll('.', '\\.')}:\\n  text: "([^"]*)"`, 'm').exec(yaml);
    return m ? (m[1] as string) : null;
  };
  /** The words of a value's phrase line: whole-number clips and slot-free word lines. */
  const spoken = (value: number, decimal: boolean, asTenths = false): string =>
    valueSpeech(value, decimal, asTenths)
      .map((part) => {
        if ('number' in part) {
          expect(Number.isInteger(part.number), `${value}`).toBe(true);
          expect(planPhrases(narrationFixture, [part]).spoken).not.toBe('');
          return String(part.number);
        }
        const text = lineText(part.id);
        expect(text, part.id).not.toBeNull();
        expect(text).not.toMatch(/[{}]/);
        return text as string;
      })
      .join(' ');

  it('the old call was silent: the planner has no words for a fraction', () => {
    expect(planPhrases(narrationFixture, [{ number: 1.25 }]).spoken).toBe('');
  });

  it('reads whole numbers as numbers', () => {
    expect(valueSpeech(34, false)).toEqual([{ number: 34 }]);
    expect(valueSpeech(300, true)).toEqual([{ number: 3 }]);
    expect(spoken(34, false)).toBe('34');
  });

  it('reads 1.25 as "1 and 25 hundredths", and every decimal goal has words', () => {
    expect(valueSpeech(125, true)).toEqual([
      { number: 1 },
      { id: 'ui.widget.btb.dec.word.and' },
      { number: 25 },
      { id: 'ui.widget.btb.dec.word.hundredths' },
    ]);
    expect(spoken(125, true)).toBe('1 and 25 hundredths');
    expect(spoken(101, true)).toBe('1 and 1 hundredth');
    expect(spoken(25, true)).toBe('25 hundredths');
    expect(spoken(1, true)).toBe('1 hundredth');
    for (let v = 1; v <= 1999; v++) expect(spoken(v, true), `${v}`).not.toBe('');
  });

  it('counts rods as tenths', () => {
    expect(spoken(10, true, true)).toBe('1 tenth');
    expect(spoken(120, true, true)).toBe('12 tenths');
    for (let n = 1; n <= 29; n++) expect(spoken(n * 10, true, true)).not.toBe('');
  });
});

describe('short rooms: the Practice Pier at 960 × 600 (#13)', () => {
  // The room is 858 × 358 (366 with an icon-only prompt); the panel has that less the root padding.
  const exactK: SideSpec = {
    k: true,
    piles: [false, false],
    tall: [true, false],
    goal: '19',
    exact: ['tens', 'ones'],
    exactN: [1, 9],
    height: 354,
  };
  it('a panel taller than the room at any width is split: goal and chips beside tray and check', () => {
    const need = sideNeed(exactK, 150);
    expect(need.split).toBe(true);
    const plan = sidePlan(exactK, need.width, need.crowded, need.split);
    expect(plan.split).toBe(true);
    expect(plan.height).toBeLessThanOrEqual(354);
    expect(plan.width).toBeLessThanOrEqual(need.width);
    // Stacked, neither the usual nor the crowded panel fits that height.
    expect(sidePlan(exactK, 600, false).height).toBeGreaterThan(354);
    expect(sidePlan(exactK, 600, true).height).toBeGreaterThan(354);
  });
  it('the same panel at 1280 × 800 is not split', () => {
    expect(sideNeed({ ...exactK, height: 554 }, 150).split).toBeUndefined();
  });
  it('a stock tag on the rods (PV.09.t2) and a goal: split, within the room', () => {
    const spec: SideSpec = { ...exactK, k: false, piles: [true, true], goal: '39', exactN: [3, 9] };
    const need = sideNeed(spec, 156);
    expect(need.split).toBe(true);
    expect(sidePlan(spec, need.width, false, true).height).toBeLessThanOrEqual(354);
  });
  it('without a goal card the tray and check fit stacked, so nothing is split', () => {
    const spec: SideSpec = { ...exactK, k: false, goal: null, exact: [] };
    expect(sideNeed(spec, 156)).toEqual({ width: expect.any(Number), crowded: false });
  });
  it('the fullest Grade 1 mat (9 tens, 9 ones) beside each panel keeps countable pieces', () => {
    const counts = { thousands: 0, hundreds: 0, tens: 9, ones: 9 };
    const mat = {
      units: unitCandidates(false),
      width: 858,
      height: 358 - 4 - 10 - 40 - 16,
      gutter: 70,
      columnPad: 4,
      frame: 9,
      gap: 12,
      headerWidth: () => 99,
    };
    for (const goal of ['99', null]) {
      const spec: SideSpec = { ...exactK, k: false, goal, exact: [] };
      const plan = planMat({ mat, side: { spec, min: 156 } }, ['tens', 'ones'], counts);
      expect(plan.layout.overflow).toBe(false);
      expect(plan.layout.u).toBeGreaterThanOrEqual(U_FLOOR);
    }
  });
});

describe('readSide: the answer, the pad and check in read mode (#13)', () => {
  const blank = { w: 98, h: 80 };
  const button = { w: 150, h: 88 };
  it('1280 × 800: the answer over the big keys over check', () => {
    expect(readSide(554, blank, button, 'g1-up')).toMatchObject({
      shape: '3x4',
      compact: false,
      beside: false,
    });
  });
  it('960 × 600: the answer and check beside the keys, which keep their size', () => {
    const side = readSide(354, blank, button, 'g1-up');
    expect(side).toMatchObject({ shape: '3x4', compact: false, beside: true });
    expect(side.h).toBeLessThanOrEqual(354);
    expect(side.w).toBe(3 * 76 + 2 * 12 + READ_GAP + 150);
  });
  it('K at 960 × 600: 80 px keys only fit four by three', () => {
    const side = readSide(362, { w: 120, h: 100 }, { w: 96, h: 108 }, 'k');
    expect(side).toMatchObject({ shape: '4x3', compact: true, beside: true });
    expect(side.h).toBeLessThanOrEqual(362);
  });
  it('every choice keeps the keys at the minimum target or more', () => {
    for (const h of [200, 300, 354, 420, 554]) {
      const side = readSide(h, blank, button, 'g1-up');
      expect(side.compact ? 64 : 76).toBeGreaterThanOrEqual(64);
      expect(side.w).toBeGreaterThan(0);
    }
  });
});

// ---------- place-value disks (03 §5.5, K02) ----------

describe('place-value disks: a mat with hundreds in play', () => {
  // The Practice Pier's room at 960 × 600 (858 × 358 px), beside a side panel of 156 px or more.
  const pier = (over: Partial<MatLayoutInput> = {}): Omit<MatLayoutInput, 'kinds' | 'counts'> => ({
    ...tablet(false),
    units: diskCandidates(),
    disks: true,
    width: 846,
    height: 270,
    ...over,
  });
  const HTO = KINDS.filter((k) => k !== 'thousands');

  it('tries disks from DISK_MAX down, and a disk is one size whatever its kind', () => {
    expect(diskCandidates()[0]).toBe(DISK_MAX);
    expect(diskCandidates()).toContain(DISK_FLOOR);
    for (const kind of HTO) {
      // Seven of a kind: one row of five and two more, in a frame of ten.
      const p = columnPlan(kind, 7, 40, 300, 'loose', true);
      expect(p).toEqual(columnPlan('ones', 7, 40, 300, 'loose', true));
      expect(p?.w).toBe(5 * 40 + 4 * diskGap(40));
      expect(p?.h).toBe(2 * 40 + diskGap(40));
    }
  });

  it('nineteen disks are two tens, a gap between them', () => {
    const p = columnPlan('tens', 19, 40, 300, 'loose', true);
    expect(p).toMatchObject({ cols: 1, rows: 2 });
    expect(p?.h).toBe(2 * (2 * 40 + diskGap(40)) + diskGroupGap(40));
  });

  it('keeps rows of five while the disks are DISK_ROWS_MIN or more', () => {
    // Room to spare (1280 × 800): the largest disks, in rows of five.
    const wide = matLayout({ kinds: HTO, counts: counts(0, 9, 9, 9), ...pier({ width: 1146 }) });
    expect(wide.fits).toBe(true);
    expect(wide.orient).toBe('h');
    expect(wide.u).toBe(DISK_MAX);
    // Tighter: rows of five still, a little smaller, rather than upright fives at full size.
    const tighter = matLayout({ kinds: HTO, counts: counts(0, 9, 9, 9), ...pier({ width: 1000 }) });
    expect(tighter.orient).toBe('h');
    expect(tighter.u).toBeGreaterThanOrEqual(DISK_ROWS_MIN);
    expect(tighter.u).toBeLessThan(DISK_MAX);
  });

  it('turns the fives upright when rows of five would be smaller than that', () => {
    // The fullest build of a shipped template (PV.16.t1: 8 hundreds, 19 tens and 9 ones) in the
    // pier at 960 × 600, with the trade buttons between the columns.
    const rows = matLayout({
      kinds: HTO,
      counts: counts(0, 8, 19, 9),
      ...pier({ units: [DISK_ROWS_MIN] }),
    });
    expect(rows.orient).toBe('v');
    const full = matLayout({ kinds: HTO, counts: counts(0, 8, 19, 9), ...pier() });
    expect(full.overflow).toBe(false);
    expect(full.fits).toBe(true);
    expect(full.orient).toBe('v');
    expect(full.u).toBeGreaterThanOrEqual(DISK_FLOOR);
  });

  it('the fullest mat of disks the engine allows fits 1280 × 800, in rows of five', () => {
    const l = matLayout({
      kinds: HTO,
      counts: counts(0, 20, 20, 20),
      ...pier({ width: 1146, height: 596 }),
    });
    expect(l.overflow).toBe(false);
    expect(l.fits).toBe(true);
    expect(l.orient).toBe('h');
    for (const c of l.columns) expect(c.plan.h).toBeLessThanOrEqual(596);
  });

  it('a mat no room can hold says so (below DISK_FLOOR)', () => {
    const l = matLayout({ kinds: HTO, counts: counts(0, 20, 20, 20), ...pier({ width: 520 }) });
    expect(l.fits).toBe(false);
  });

  it('ten disks gather as a ten: two rows of five, touching', () => {
    const at = Array.from({ length: 10 }, (_, j) => bundleOffset('tens', j, 40, true));
    expect(new Set(at.map((p) => `${p.x},${p.y}`)).size).toBe(10);
    expect(Math.max(...at.map((p) => Math.abs(p.x)))).toBe(80);
    expect(Math.max(...at.map((p) => Math.abs(p.y)))).toBe(20);
    expect(bundleHalf('tens', 40, true)).toEqual({ x: 100, y: 40 });
  });
});
