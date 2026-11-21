// Maths truth for ChartView (U05 #14): every picture a chart draws shows exactly its numbers.
import type { ChartSpec } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  chartGeometry,
  GRID_MIN_PX,
  labelStride,
  NUMERAL_PX,
  tallyLength,
  tallyStrokes,
} from './chartLayout';

const cats = (...vs: number[]) =>
  vs.map((value, i) => ({
    id: ['fish', 'crab', 'shell', 'apple'][i] as string,
    label: `noun.${['fish', 'crab', 'shell', 'apple'][i]}.many`,
    value,
  }));

const chart = (over: Partial<ChartSpec>): ChartSpec => ({
  kind: 'bar',
  orientation: 'vertical',
  categories: cats(7, 3, 10),
  scale: 1,
  axisMax: 10,
  ...over,
});

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe('bar graphs: every bar ends exactly on its value', () => {
  it.each([
    ['vertical, scale 1', chart({})],
    [
      'vertical, scale 2, odd values between gridlines',
      chart({ scale: 2, categories: cats(7, 3, 10) }),
    ],
    ['vertical, scale 5', chart({ scale: 5, axisMax: 20, categories: cats(15, 5, 20) })],
    ['horizontal, scale 1', chart({ orientation: 'horizontal' })],
    [
      'horizontal, scale 10',
      chart({ orientation: 'horizontal', scale: 10, axisMax: 60, categories: cats(40, 60, 20) }),
    ],
  ])('%s', (_name, c) => {
    for (const size of [
      { width: 520, height: 300 },
      { width: 900, height: 420 },
    ]) {
      const g = chartGeometry(c, { ...size, target: 64 });
      for (const s of g.slots) {
        const b = s.bar;
        expect(b).toBeDefined();
        if (!b) continue;
        if (g.orientation === 'vertical') {
          close(b.y, g.valueToPos(s.value));
          close(b.y + b.h, g.valueToPos(0));
        } else {
          close(b.x + b.w, g.valueToPos(s.value));
          close(b.x, g.valueToPos(0));
        }
        // A value on the scale sits exactly on its tick (and its numeral when labelled).
        const tick = g.ticks.find((t) => t.value === s.value);
        if (s.value % c.scale === 0) {
          expect(tick).toBeDefined();
          close(tick?.pos ?? Number.NaN, g.orientation === 'vertical' ? b.y : b.x + b.w);
        }
      }
      // The axis counts by the scale from 0 to the top.
      expect(g.ticks.map((t) => t.value)).toEqual(
        Array.from({ length: g.ticks.length }, (_, k) => k * c.scale),
      );
      expect(g.ticks[0]?.labelled).toBe(true);
    }
  });

  it('numerals are 32 px or more, and labelled ticks never crowd', () => {
    const g = chartGeometry(chart({ axisMax: 20, categories: cats(20, 13, 4) }), {
      width: 600,
      height: 280,
    });
    expect(g.numeral).toBeGreaterThanOrEqual(32);
    const labelled = g.ticks.filter((t) => t.labelled).map((t) => t.pos);
    for (let i = 1; i < labelled.length; i += 1) {
      expect(
        Math.abs((labelled[i] as number) - (labelled[i - 1] as number)),
      ).toBeGreaterThanOrEqual(NUMERAL_PX * 0.9);
    }
    // Every count is a tick; with room for them (8 px or more apart) each draws its gridline.
    expect(g.ticks).toHaveLength(21);
    const roomy = chartGeometry(chart({ axisMax: 20, categories: cats(20, 13, 4) }), {
      width: 600,
      height: 360,
    });
    expect(roomy.ticks.every((t) => t.line)).toBe(true);
    // A short plot thins the gridlines so they never read as a texture: the labelled tens and
    // the fives between them, at least GRID_MIN_PX apart.
    const short = chartGeometry(chart({ axisMax: 20, categories: cats(20, 13, 4) }), {
      width: 600,
      height: 200,
    });
    const drawn = short.ticks.filter((t) => t.line);
    expect(drawn.map((t) => t.value)).toEqual([0, 5, 10, 15, 20]);
    expect(short.ticks.filter((t) => t.labelled).every((t) => t.line)).toBe(true);
    for (let i = 1; i < drawn.length; i += 1) {
      expect(
        Math.abs(
          (drawn[i] as (typeof drawn)[number]).pos - (drawn[i - 1] as (typeof drawn)[number]).pos,
        ),
      ).toBeGreaterThanOrEqual(GRID_MIN_PX);
    }
    expect(labelStride(10, 30)).toBe(5);
    expect(labelStride(40, 30)).toBe(1);
  });

  it('label cells are at least the target', () => {
    for (const orientation of ['vertical', 'horizontal'] as const) {
      const g = chartGeometry(chart({ orientation }), { width: 700, height: 360, target: 80 });
      for (const s of g.slots) {
        expect(s.labelBox?.w).toBeGreaterThanOrEqual(80);
        expect(s.labelBox?.h).toBeGreaterThanOrEqual(80);
      }
    }
  });
});

describe('picture graphs: exactly value / scale symbols', () => {
  it.each([
    ['scale 1', 1, [7, 3, 10]],
    ['scale 2 with halves', 2, [7, 3, 10]],
    ['scale 5', 5, [15, 5, 10]],
    ['scale 10 with a half', 10, [15, 30, 20]],
  ] as const)('%s', (_name, scale, vs) => {
    for (const orientation of ['horizontal', 'vertical'] as const) {
      const c = chart({
        kind: 'picture',
        orientation,
        scale,
        axisMax: Math.max(...vs),
        categories: cats(...vs),
      });
      const g = chartGeometry(c, { width: 760, height: 380, target: 64 });
      for (const s of g.slots) {
        const symbols = s.symbols ?? [];
        const total = symbols.reduce((n, b) => n + b.part, 0);
        close(total, s.value / scale);
        // Only the last symbol can be a part, and it is a half when the remainder is half.
        for (const b of symbols.slice(0, -1)) expect(b.part).toBe(1);
        if ((s.value / scale) % 1 === 0.5) expect(symbols.at(-1)?.part).toBe(0.5);
        // Symbols never overlap and stay in their row or column.
        for (const b of symbols) {
          expect(b.x).toBeGreaterThanOrEqual(s.lane.x - 0.5);
          expect(b.x + b.w).toBeLessThanOrEqual(s.lane.x + s.lane.w + 0.5);
          expect(b.y).toBeGreaterThanOrEqual(s.lane.y - 0.5);
          expect(b.y + b.h).toBeLessThanOrEqual(s.lane.y + s.lane.h + 0.5);
        }
        for (let i = 1; i < symbols.length; i += 1) {
          const a = symbols[i - 1];
          const b = symbols[i];
          if (!a || !b) continue;
          if (orientation === 'horizontal') expect(b.x).toBeGreaterThanOrEqual(a.x + a.w);
          else expect(b.y + b.h).toBeLessThanOrEqual(a.y);
        }
      }
      expect(g.key !== null).toBe(scale !== 1);
    }
  });

  it('the symbols of every row line up in columns (a graph, not a heap)', () => {
    const g = chartGeometry(
      chart({ kind: 'picture', orientation: 'horizontal', categories: cats(4, 7, 2) }),
      {
        width: 800,
        height: 320,
      },
    );
    const xs = g.slots.map((s) => (s.symbols ?? []).map((b) => b.x));
    for (let k = 0; k < 2; k += 1) {
      expect(new Set(xs.map((row) => row[k])).size).toBe(1);
    }
  });
});

describe('tally charts: groups of five, four strokes and a gate', () => {
  it.each([0, 1, 4, 5, 6, 9, 10, 13, 20])('%i marks', (n) => {
    const groups = tallyStrokes(n, { x: 0, y: 0, w: 600, h: 80 }, 'horizontal', 50);
    const strokes = groups.flat();
    expect(strokes).toHaveLength(n);
    groups.forEach((group, gi) => {
      expect(group.length).toBe(gi < Math.floor(n / 5) ? 5 : n % 5);
      if (group.length === 5) {
        const [x1, y1, x2, y2] = group[4] as [number, number, number, number];
        // The gate is a slash that crosses all four strokes.
        expect(x1).toBeLessThan((group[0] as number[])[0] as number);
        expect(x2).toBeGreaterThan((group[3] as number[])[0] as number);
        expect(y1).not.toBe(y2);
      }
      // The four strokes are upright and evenly spaced.
      for (const [a, , b] of group.slice(0, 4)) expect(a).toBe(b);
    });
    // Groups never touch: each starts after the previous gate ends.
    for (let gi = 1; gi < groups.length; gi += 1) {
      const prev = groups[gi - 1] as number[][];
      const end = Math.max(...prev.map((l) => Math.max(l[0] as number, l[2] as number)));
      const start = Math.min(
        ...(groups[gi] as number[][]).map((l) => Math.min(l[0] as number, l[2] as number)),
      );
      expect(start).toBeGreaterThan(end);
    }
  });

  it.each([
    ['horizontal', 360, 260],
    ['horizontal', 520, 300],
    ['vertical', 420, 300],
  ] as const)('20 marks stay inside their %s lane (%i × %i)', (orientation, width, height) => {
    const g = chartGeometry(
      chart({ kind: 'tally', orientation, axisMax: 20, categories: cats(20, 3) }),
      { width, height, target: 80 },
    );
    for (const s of g.slots) {
      const lines = (s.tally ?? []).flat();
      expect(lines).toHaveLength(s.value);
      for (const [x1, y1, x2, y2] of lines) {
        for (const [x, y] of [
          [x1, y1],
          [x2, y2],
        ] as const) {
          expect(x).toBeGreaterThanOrEqual(s.lane.x - 0.5);
          expect(x).toBeLessThanOrEqual(s.lane.x + s.lane.w + 0.5);
          expect(y).toBeGreaterThanOrEqual(s.lane.y - 0.5);
          expect(y).toBeLessThanOrEqual(s.lane.y + s.lane.h + 0.5);
        }
      }
    }
  });

  it('a tally chart row holds its marks', () => {
    const g = chartGeometry(
      chart({ kind: 'tally', orientation: 'horizontal', categories: cats(13, 5, 2) }),
      {
        width: 700,
        height: 300,
      },
    );
    for (const s of g.slots) {
      expect((s.tally ?? []).flat()).toHaveLength(s.value);
      for (const [x1, , x2] of (s.tally ?? []).flat()) {
        expect(Math.max(x1, x2)).toBeLessThanOrEqual(s.lane.x + s.lane.w);
      }
    }
    expect(tallyLength(0, 50)).toBe(0);
  });
});

describe('tables and line plots', () => {
  it('a table shows one count per category', () => {
    const g = chartGeometry(chart({ kind: 'table', orientation: 'horizontal' }), {
      width: 600,
      height: 300,
    });
    expect(g.slots.map((s) => [s.id, s.value, Boolean(s.cell)])).toEqual([
      ['fish', 7, true],
      ['crab', 3, true],
      ['shell', 10, true],
    ]);
  });

  it('a line plot stacks one X per count exactly above its position', () => {
    const c: ChartSpec = {
      kind: 'line-plot',
      orientation: 'horizontal',
      categories: [
        { id: '1.5', label: 'noun.fish.many', value: 3 },
        { id: '3', label: 'noun.fish.many', value: 1 },
      ],
      scale: 1,
      axisMax: 5,
      lineScale: { min: 0, max: 4, step: 0.5 },
    };
    const g = chartGeometry(c, { width: 800, height: 300 });
    expect(g.slots).toHaveLength(9);
    for (const s of g.slots) {
      expect(s.xs).toHaveLength(s.value);
      for (const b of s.xs ?? []) close(b.x + b.w / 2, g.valueToPos(s.at ?? 0));
    }
    expect(g.slots.find((s) => s.id === '1.5')?.value).toBe(3);
    // Whole numbers carry numerals; halves are ticks.
    expect(g.ticks.filter((t) => t.labelled).every((t) => Number.isInteger(t.value))).toBe(true);
  });

  it('values override the chart (a build draws what the child made)', () => {
    const g = chartGeometry(chart({ categories: cats(0, 0, 0) }), {
      width: 600,
      height: 300,
      values: [2, 0, 5],
    });
    expect(g.slots.map((s) => s.value)).toEqual([2, 0, 5]);
  });
});
