import {
  type Column,
  formatModel,
  TRADE_ADD_OPERAND_HUNDREDS_MAX,
  TRADE_ADD_START_HUNDREDS_MAX,
  TRADE_ALL_ONES_MAX,
} from '@number-island/engine';
import type { WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { breakGhosts, bundleGhosts, gatherBox, moveGhosts, slices, transformFrom } from './fx';
import {
  type AgeMode,
  answerPlaces,
  arrangeTaken,
  type Box,
  COL_PAD,
  chooseSide,
  colInsets,
  colMinWidth,
  digitsValue,
  extent,
  GAP,
  growCaps,
  holderMargins,
  holderWidth,
  itemFit,
  itemUnit,
  lyingRods,
  MAT_BORDER,
  type MatState,
  measurePlan,
  naturalLayout,
  nestInner,
  pathStates,
  placeDigits,
  placePieces,
  placeTaken,
  planCaps,
  planMat,
  ROOT_PAD_Y,
  ROW_GAP,
  rodStacks,
  SIDE_GAP,
  sideLayout,
  sideWidth,
  stateCaps,
  stripWidth,
  U_FLOOR,
  U_MAX,
  U_MIN,
} from './layout';

type Config = WidgetConfigOf<'base-ten-trade'>;

/** The widget's mat-and-side width in the 1200 px tablet stage (mat + 12 px gap + side). */
const CONTENT_W = 1138;
/** The side panel's parts as the stage measures them: the pad and "check" (K and G1). */
const PARTS: Record<AgeMode, { pad: number; check: number }> = {
  k: { pad: 264, check: 114 },
  'g1-up': { pad: 216, check: 98 },
};
/** The algorithm card's width: the sign column, a target-wide column a place, padding, border. */
const cardWidth = (age: AgeMode, places: number) => {
  const target = age === 'k' ? 80 : 64;
  return 24 + places * (target + 12) + 2 * 16 + 2 * 3;
};

const cfg = (over: Partial<Config>): Config => ({
  format: 'base-ten-trade',
  start: { hundreds: 0, tens: 2, ones: 7 },
  goal: 'compute',
  operation: { op: '+', operand: { hundreds: 0, tens: 1, ones: 5 } },
  showAlgorithm: false,
  thenAsk: false,
  ...over,
});

const overlaps = (boxes: readonly Box[]) =>
  boxes.some((a, i) =>
    boxes.some(
      (b, j) =>
        j > i &&
        Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 &&
        Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01,
    ),
  );

const inside = (b: Box, box: { w: number; h: number }) =>
  b.x >= -0.01 && b.y >= -0.01 && b.x + b.w <= box.w + 0.01 && b.y + b.h <= box.h + 0.01;

/** Every piece of a per-column layout (placeTaken's result). */
const all = (t: Record<string, Box[]>) => [
  ...(t.hundreds ?? []),
  ...(t.tens ?? []),
  ...(t.ones ?? []),
];

describe('planCaps', () => {
  it('plans the most pieces each column holds on the way to a sum', () => {
    const caps = planCaps(cfg({}));
    expect(caps.columns).toEqual(['hundreds', 'tens', 'ones']);
    // 7 + 5 = 12 ones before grouping; 2 + 1 + 1 tens after.
    expect(caps.mat).toEqual({ hundreds: 0, tens: 4, ones: 12 });
    expect(caps.tray).toEqual({ hundreds: 0, tens: 1, ones: 5 });
    expect(caps.taken).toBeNull();
    expect(caps.flatReachable).toBe(false);
  });

  it('borrows across zero for 304 − 128', () => {
    const caps = planCaps(
      cfg({
        start: { hundreds: 3, tens: 0, ones: 4 },
        operation: { op: '-', operand: { hundreds: 1, tens: 2, ones: 8 } },
      }),
    );
    expect(caps.mat).toEqual({ hundreds: 3, tens: 10, ones: 14 });
    expect(caps.taken).toEqual({ hundreds: 1, tens: 2, ones: 8 });
    expect(caps.tray).toBeNull();
    expect(caps.flatReachable).toBe(true);
  });

  it('cascades for 199 + 1 and keeps the larger of start and goal for regroup-to', () => {
    const cascade = planCaps(
      cfg({
        start: { hundreds: 1, tens: 9, ones: 9 },
        operation: { op: '+', operand: { hundreds: 0, tens: 0, ones: 1 } },
      }),
    );
    expect(cascade.mat).toEqual({ hundreds: 2, tens: 10, ones: 10 });
    const regroup = planCaps(
      cfg({
        goal: 'regroup-to',
        operation: undefined,
        start: { hundreds: 1, tens: 2, ones: 3 },
        regroupTarget: { hundreds: 0, tens: 12, ones: 3 },
      }),
    );
    expect(regroup.mat).toEqual({ hundreds: 1, tens: 12, ones: 3 });
  });
});

describe('layout', () => {
  it('lays ones in rows of five with a wider gap after each ten', () => {
    const boxes = naturalLayout('ones', 12, 10);
    expect(boxes[4]?.y).toBe(0);
    expect(boxes[5]?.x).toBe(0);
    const tenGapRow = (boxes[10]?.y ?? 0) - (boxes[5]?.y ?? 0);
    const rowStep = (boxes[5]?.y ?? 0) - (boxes[0]?.y ?? 0);
    expect(tenGapRow).toBeGreaterThan(rowStep);
  });

  it('keeps every piece inside its column, wrapping and then squeezing', () => {
    for (const n of [1, 9, 10, 14, 19, 25, 40]) {
      for (const kind of ['hundreds', 'tens', 'ones'] as const) {
        const box = { w: 180, h: 160 };
        const boxes = placePieces(kind, n, 12, box, 10);
        expect(boxes).toHaveLength(n);
        for (const b of boxes) expect(inside(b, box)).toBe(true);
      }
    }
  });

  it('puts the taken pieces side by side inside the nest', () => {
    const box = { w: 400, h: 90 };
    const taken = placeTaken({ hundreds: 1, tens: 2, ones: 8 }, 8, box);
    for (const c of ['hundreds', 'tens', 'ones'] as const) {
      for (const b of taken[c]) expect(inside(b, box)).toBe(true);
    }
    expect(taken.tens[0]?.x).toBeGreaterThan(taken.hundreds[0]?.x ?? 0);
    expect(taken.ones[0]?.x).toBeGreaterThan(taken.tens[1]?.x ?? 0);
  });

  it('wraps taken flats into rows (and rods into stacks) rather than squeezing them', () => {
    // PR #74 round 2: nine flats at 8 px need 768 px in one row; the nest has 634.
    const box = { w: 634, h: 400 };
    const taken = placeTaken({ hundreds: 9, tens: 0, ones: 0 }, 8, box);
    expect(taken.hundreds).toHaveLength(9);
    expect(overlaps(taken.hundreds)).toBe(false);
    for (const b of taken.hundreds) {
      expect(b.w).toBe(80);
      expect(inside(b, box)).toBe(true);
    }
    expect(new Set(taken.hundreds.map((b) => b.y)).size).toBe(2);
    // Rods: a second stack when one is too tall is not needed, but a too-wide nest still never
    // squeezes: stacks sit side by side, a flat's width plus a gap apart.
    const stacks = rodStacks(12, 10, 5);
    expect(overlaps(stacks)).toBe(false);
    expect(new Set(stacks.map((b) => b.x)).size).toBe(3);
    // Nothing fits across: the narrowest arrangement, still no overlap.
    const narrow = placeTaken({ hundreds: 3, tens: 4, ones: 9 }, 20, { w: 100, h: 100 });
    expect(overlaps(all(narrow))).toBe(false);
    expect(arrangeTaken({ hundreds: 3, tens: 4, ones: 9 }, 20, 100)).toBeNull();
  });

  it('never overlaps taken pieces, whatever is taken and however wide the nest', () => {
    for (const hundreds of [0, 1, 4, 9, 12, 19]) {
      for (const tens of [0, 3, 9, 19]) {
        for (const ones of [0, 5, 9, 19]) {
          for (const w of [300, 634, 900]) {
            for (const u of [8, 12, 20]) {
              const taken = placeTaken({ hundreds, tens, ones }, u, { w, h: 600 });
              expect(overlaps(all(taken))).toBe(false);
              const a = arrangeTaken({ hundreds, tens, ones }, u, w);
              if (a) for (const b of all(taken)) expect(b.x + b.w).toBeLessThanOrEqual(w + 0.5);
            }
          }
        }
      }
    }
  });
});

describe('the nest holds everything a take-away can take (1280 × 800, K and G1)', () => {
  // The mat's width beside the side panel, as the 1200 px tablet stage lays it out (measured in
  // the StressNineFlatsTaken / StressTakeAll stories): G1 with a 3- or 4-place algorithm card,
  // K with the card above its pad and "check" beside the pad.
  const widths: Record<AgeMode, Record<number, number>> = {
    'g1-up': { 3: 836, 4: 760 },
    k: { 3: 736, 4: 696 },
  };
  const worst = [
    [9, 0, 0, 9, 0, 0], // 900 − 900 (the review's case)
    [9, 9, 9, 9, 9, 9], // 999 − 999
    [3, 0, 4, 1, 2, 8], // 304 − 128
    [12, 0, 0, 12, 0, 0], // 1200 − 1200 (a 4-digit start)
    [10, 0, 0, 9, 9, 9], // 1000 − 999 (borrows across two zeros)
  ] as const;
  /** The take steps one piece at a time in `order`, from the mat the trades leave. */
  const takeSteps = (path: MatState[], order: readonly Column[]): MatState[] => {
    const traded = [...path].reverse().find((s) => {
      const t = s.taken;
      return !t || t.hundreds + t.tens + t.ones === 0;
    }) as MatState;
    const end = path.at(-1)?.taken ?? { hundreds: 0, tens: 0, ones: 0 };
    const mat = { ...traded.mat };
    const taken = { hundreds: 0, tens: 0, ones: 0 };
    const out: MatState[] = [];
    for (const k of order) {
      for (let i = 0; i < end[k]; i++) {
        mat[k] -= 1;
        taken[k] += 1;
        out.push({ mat: { ...mat }, pending: null, taken: { ...taken } });
      }
    }
    return out;
  };
  for (const age of ['g1-up', 'k'] as const) {
    for (const [sh, st, so, oh, ot, oo] of worst) {
      it(`${age}: ${sh * 100 + st * 10 + so} − ${oh * 100 + ot * 10 + oo}`, () => {
        const config = cfg({
          start: { hundreds: sh, tens: st, ones: so },
          operation: { op: '-', operand: { hundreds: oh, tens: ot, ones: oo } },
          showAlgorithm: true,
          thenAsk: true,
        });
        const places = answerPlaces(config);
        const base = planCaps(config);
        const path = pathStates(config);
        // The widget's choice, from the side panel's measured parts at 1200 px.
        const { side, width: chosenW } = chooseSide({
          age,
          goal: 'compute',
          showWork: true,
          thenAsk: true,
          answerInWork: true,
          places,
          contentW: CONTENT_W,
          parts: { ...PARTS[age], card: cardWidth(age, places) },
          base,
          path,
        });
        // K keeps the algorithm in the side ("check" beside the pad): the mat has the full height,
        // and the width the widget measures.
        expect(side.workInSide).toBe(true);
        expect(side.checkBeside).toBe(age === 'k');
        expect(chosenW).toBe(widths[age][places]);
        const height = side.spaceH;
        // The expected path takes ones, tens, then hundreds; a child may take in any order.
        const steps = [
          ...path,
          ...takeSteps(path, ['hundreds', 'tens', 'ones']),
          ...takeSteps(path, ['tens', 'hundreds', 'ones']),
        ];
        for (const width of [chosenW, CONTENT_W - 12 - 216]) {
          const unit = itemUnit({ age, width, height, base, path });
          for (const s of steps) {
            const taken = s.taken ?? { hundreds: 0, tens: 0, ones: 0 };
            const plan = planMat({
              age,
              width,
              height,
              caps: [growCaps(base, s.mat, taken), stateCaps(base, s.mat, null, taken)],
              unit,
            });
            const at = `${width} px, mat ${JSON.stringify(s.mat)}, nest ${JSON.stringify(taken)}`;
            expect(plan.fits, at).toBe(true);
            expect(plan.totalH, at).toBeLessThanOrEqual(height);
            const inner = nestInner(plan.matW, plan.nestH);
            const placed = placeTaken(taken, plan.u, inner);
            expect(overlaps(all(placed)), at).toBe(false);
            for (const b of all(placed)) expect(inside(b, inner), at).toBe(true);
            // One scale: the nest's pieces are drawn at the mat's unit.
            if (placed.hundreds[0]) expect(placed.hundreds[0].w).toBe(plan.u * 10);
          }
        }
      });
    }
  }
});

/** Every column's hit pad is a target wide, and every waiting group's holder fits its cell. */
function expectColumnTargets(plan: ReturnType<typeof planMat>, age: AgeMode, at: string) {
  const cols = plan.caps.columns;
  const target = age === 'k' ? 80 : 64;
  cols.forEach((c, i) => {
    const w = plan.colW[c];
    const inset = colInsets(i, cols.length, w, age);
    // GAP beside a strip (the trade buttons fill it); 0 to GAP at the mat's frame.
    if (i > 0) expect(inset.left).toBe(12);
    if (i < cols.length - 1) expect(inset.right).toBe(12);
    expect(w - inset.left - inset.right, `${at}: ${c} hit pad`).toBeGreaterThanOrEqual(target);
    const n = plan.caps.tray?.[c] ?? 0;
    if (n > 0) {
      const holder = holderWidth(c, n, plan.u, age);
      const m = holderMargins(i, cols.length, w, holder);
      // Inside the cell, and GUTTER clear of the tray's border (the cell starts MAT_BORDER in).
      expect(holder + m.left + m.right, `${at}: ${c} holder`).toBeLessThanOrEqual(w + 0.01);
      const outerRoom = (w - holder) / 2 + (m.left + m.right) / 2;
      if (i === 0 || i === cols.length - 1) {
        expect(outerRoom + MAT_BORDER, `${at}: ${c} holder room`).toBeGreaterThanOrEqual(15);
      }
    }
  });
}

describe('K five-place additions with large mats (PR #74 round 8)', () => {
  // The reviewer's config: 1580 + 1 as 14 hundreds and 18 tens, algorithm on, no pad. The
  // five-place card is the problem row (394 px left), "check" alone in the side (1012 px wide).
  const reviewer = cfg({
    start: { hundreds: 14, tens: 18, ones: 0 },
    operation: { op: '+', operand: { hundreds: 0, tens: 0, ones: 1 } },
    showAlgorithm: true,
    thenAsk: false,
  });
  const side = sideLayout({
    age: 'k',
    goal: 'compute',
    showWork: true,
    thenAsk: false,
    answerInWork: false,
    places: answerPlaces(reviewer),
  });

  it('fits at the new planner, where widening the ones column to 104 px overflowed', () => {
    expect(answerPlaces(reviewer)).toBe(5);
    expect(side.spaceH).toBe(394);
    const width = CONTENT_W - 12 - PARTS.k.check;
    expect(width).toBe(1012);
    const base = planCaps(reviewer);
    const unit = itemUnit({
      age: 'k',
      width,
      height: side.spaceH,
      base,
      path: pathStates(reviewer),
    });
    const now = stateCaps(base, reviewer.start, base.tray, null);
    const plan = planMat({ age: 'k', width, height: side.spaceH, caps: [base, now], unit });
    expect(plan.fits).toBe(true);
    expect(plan.totalH).toBeLessThanOrEqual(side.spaceH);
    expect(plan.flatsPerRow).toBeGreaterThanOrEqual(7);
    expectColumnTargets(plan, 'k', 'reviewer');
    // The same arrangement unstretched: its columns are the planner's minimum.
    const raw = measurePlan(
      { age: 'k', width, height: side.spaceH, caps: plan.caps },
      plan.u,
      plan.rodsPerRow,
      plan.flatsPerRow,
    );
    expect(raw.matW).toBeLessThanOrEqual(width);
    // The ones column is an outer column: K's 96 px header minimum is enough (an 84 px hit pad
    // to the mat's frame). The round-7 planner made every column ≥ 104 px (a target plus GAP on
    // both sides): that ones column would push the mat past the width.
    expect(raw.colW.ones).toBeLessThan(104);
    expect(colMinWidth('k', 2, 3)).toBe(92);
    expect(colMinWidth('k', 1, 3)).toBe(104);
    expect(raw.matW + (104 - raw.colW.ones)).toBeGreaterThan(width);
  });

  // Large-mat additions in K (and G1) at the widths the 1200 px stage gives them. The supported
  // envelope at U_MIN: a five-place K item holds up to 14 hundreds without the pad, 10 with it.
  const cases: [AgeMode, boolean, [number, number, number], [number, number, number]][] = [
    ['k', false, [14, 18, 0], [0, 0, 1]],
    ['k', false, [14, 9, 9], [0, 0, 1]],
    ['k', false, [12, 9, 9], [0, 0, 1]],
    ['k', false, [10, 9, 9], [0, 0, 1]],
    ['k', true, [10, 0, 0], [0, 0, 1]],
    ['k', true, [10, 9, 9], [0, 0, 1]],
    ['k', true, [9, 9, 0], [0, 1, 0]],
    ['k', true, [5, 0, 0], [5, 0, 0]],
    ['g1-up', true, [12, 0, 0], [3, 0, 0]],
    ['g1-up', false, [14, 18, 0], [0, 0, 1]],
  ];
  for (const [age, thenAsk, s, o] of cases) {
    const [sh, st, so] = s;
    const [oh, ot, oo] = o;
    it(`${age}${thenAsk ? ' with the pad' : ''}: ${sh}|${st}|${so} + ${oh}|${ot}|${oo}`, () => {
      const config = cfg({
        start: { hundreds: sh, tens: st, ones: so },
        operation: { op: '+', operand: { hundreds: oh, tens: ot, ones: oo } },
        showAlgorithm: true,
        thenAsk,
      });
      const places = answerPlaces(config);
      const base = planCaps(config);
      const path = pathStates(config);
      const { side: chosen, width } = chooseSide({
        age,
        goal: 'compute',
        showWork: true,
        thenAsk,
        answerInWork: thenAsk,
        places,
        contentW: CONTENT_W,
        parts: {
          pad: thenAsk ? PARTS[age].pad : 0,
          check: PARTS[age].check,
          card: cardWidth(age, places),
        },
        base,
        path,
      });
      const height = chosen.spaceH;
      const unit = itemUnit({ age, width, height, base, path });
      for (const st8 of path) {
        const plan = planMat({
          age,
          width,
          height,
          caps: [
            growCaps(base, st8.mat, { hundreds: 0, tens: 0, ones: 0 }),
            stateCaps(base, st8.mat, st8.pending, null),
          ],
          unit,
        });
        const at = `${width} px, mat ${JSON.stringify(st8.mat)}`;
        expect(plan.fits, at).toBe(true);
        expect(plan.totalH, at).toBeLessThanOrEqual(height);
        expectColumnTargets(plan, age, at);
      }
    });
  }
});

describe('the supported domain fits the mat (1280 × 800, K and G1; PR #74)', () => {
  // Every corner of the domain the format model's schema accepts (engine: base-ten-trade.ts,
  // domainIssues): at the widths the 1200 px stage gives the mat, every step of the expected
  // path fits, with and without the algorithm and the pad. One step past a bound, the schema
  // rejects the item.
  const model = formatModel('base-ten-trade');
  const accepted = (c: Config) => model?.configSchema.safeParse(c).success === true;
  const hto = (hundreds: number, tens: number, ones: number) => ({ hundreds, tens, ones });
  const worth = (h: Config['start']) => h.hundreds * 100 + h.tens * 10 + h.ones;

  /** Whether every step of the item's expected path fits, as the widget lays it out. */
  const fitsStage = (age: AgeMode, config: Config): boolean => {
    const showWork = config.showAlgorithm && Boolean(config.operation);
    const places = answerPlaces(config);
    const base = planCaps(config);
    const path = pathStates(config);
    const { side, width } = chooseSide({
      age,
      goal: config.goal,
      showWork,
      thenAsk: config.thenAsk,
      answerInWork: showWork && config.thenAsk,
      places,
      contentW: CONTENT_W,
      parts: {
        pad: config.thenAsk ? PARTS[age].pad : 0,
        check: PARTS[age].check,
        card: showWork ? cardWidth(age, places) : 0,
      },
      base,
      path,
    });
    const height = side.spaceH;
    const fit = itemFit({ age, width, height, base, path });
    if (!fit.fits) return false;
    return path.every((st) => {
      const taken = st.taken ?? { hundreds: 0, tens: 0, ones: 0 };
      const plan = planMat({
        age,
        width,
        height,
        caps: [growCaps(base, st.mat, taken), stateCaps(base, st.mat, st.pending, st.taken)],
        unit: fit.unit,
      });
      return plan.fits && plan.totalH <= height;
    });
  };
  const flags = [
    { showAlgorithm: true, thenAsk: true },
    { showAlgorithm: true, thenAsk: false },
    { showAlgorithm: false, thenAsk: true },
    { showAlgorithm: false, thenAsk: false },
  ];
  const ends = [0, 9];
  // These walk hundreds of items each: well past the 5 s default on a slow CI runner.
  const SLOW = 60_000;

  for (const age of ['k', 'g1-up'] as const) {
    it(
      `${age}: every addition corner (start to 8 hundreds, 2 hundreds waiting, sums to 999)`,
      () => {
        const bad: string[] = [];
        let n = 0;
        for (let sh = 0; sh <= TRADE_ADD_START_HUNDREDS_MAX; sh++)
          for (let oh = 0; oh <= TRADE_ADD_OPERAND_HUNDREDS_MAX; oh++)
            for (const st of ends)
              for (const so of ends)
                for (const ot of ends)
                  for (const oo of ends) {
                    const start = hto(sh, st, so);
                    const operand = hto(oh, ot, oo);
                    if (worth(start) + worth(operand) > 999) continue;
                    for (const f of flags) {
                      const c = cfg({ start, operation: { op: '+', operand }, ...f });
                      expect(accepted(c)).toBe(true);
                      n++;
                      if (!fitsStage(age, c)) bad.push(JSON.stringify([start, operand, f]));
                    }
                  }
        expect(bad).toEqual([]);
        expect(n).toBeGreaterThan(1000);
      },
      SLOW,
    );

    it(
      `${age}: every subtraction corner (to 999 − 999)`,
      () => {
        const bad: string[] = [];
        for (const sh of [0, 5, 9])
          for (const oh of [0, 5, 9])
            for (const st of ends)
              for (const so of ends)
                for (const ot of ends)
                  for (const oo of ends) {
                    const start = hto(sh, st, so);
                    const operand = hto(oh, ot, oo);
                    if (worth(start) < worth(operand)) continue;
                    for (const f of flags) {
                      const c = cfg({ start, operation: { op: '-', operand }, ...f });
                      expect(accepted(c)).toBe(true);
                      if (!fitsStage(age, c)) bad.push(JSON.stringify([start, operand, f]));
                    }
                  }
        expect(bad).toEqual([]);
      },
      SLOW,
    );

    it(
      `${age}: every way a regroup-to shows a number (19 tens, 19 ones, 99 ones alone)`,
      () => {
        const bad: string[] = [];
        let n = 0;
        for (const v of [10, 19, 34, 90, 99, 100, 109, 190, 199, 500, 909, 990, 999]) {
          const [h, t, o] = [Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10];
          const ways = [hto(h, t, o)];
          if (h >= 1) ways.push(hto(h - 1, t + 10, o));
          if (t >= 1) ways.push(hto(h, t - 1, o + 10));
          if (h >= 1) ways.push(hto(h - 1, t + 9, o + 10));
          if (v <= TRADE_ALL_ONES_MAX) ways.push(hto(0, 0, v));
          for (const start of ways)
            for (const regroupTarget of ways) {
              if (start === regroupTarget) continue;
              const c = cfg({
                start,
                goal: 'regroup-to',
                operation: undefined,
                regroupTarget,
                showAlgorithm: false,
                thenAsk: false,
              });
              expect(accepted(c), JSON.stringify([start, regroupTarget])).toBe(true);
              n++;
              if (!fitsStage(age, c)) bad.push(JSON.stringify([start, regroupTarget]));
            }
        }
        expect(bad).toEqual([]);
        expect(n).toBeGreaterThan(60);
      },
      SLOW,
    );
  }

  it('rejects the first step past each bound', () => {
    const add = (start: Config['start'], operand: Config['start']) =>
      cfg({ start, operation: { op: '+', operand }, showAlgorithm: true, thenAsk: true });
    expect(accepted(add(hto(8, 9, 9), hto(0, 0, 0)))).toBe(true);
    expect(accepted(add(hto(9, 0, 0), hto(0, 0, 0)))).toBe(false);
    expect(accepted(add(hto(0, 0, 0), hto(3, 0, 0)))).toBe(false);
    expect(accepted(add(hto(8, 0, 0), hto(2, 0, 0)))).toBe(false);
    expect(accepted(add(hto(0, 10, 0), hto(0, 0, 1)))).toBe(false);
    // The round-8 review case (1580 + 1 as 14 hundreds and 18 tens) is outside the domain now.
    expect(accepted(add(hto(14, 18, 0), hto(0, 0, 1)))).toBe(false);
  });
});

describe('chooseSide', () => {
  const args = {
    goal: 'compute' as const,
    showWork: true,
    thenAsk: true,
    answerInWork: true,
    places: 4,
    contentW: CONTENT_W,
    parts: { ...PARTS.k, card: cardWidth('k', 4) },
  };
  it('K: a take-away of many flats takes the height, an addition of many flats the width', () => {
    const minus = cfg({
      start: { hundreds: 9, tens: 0, ones: 0 },
      operation: { op: '-', operand: { hundreds: 9, tens: 0, ones: 0 } },
    });
    const take = chooseSide({
      ...args,
      age: 'k',
      places: 3,
      parts: { ...PARTS.k, card: cardWidth('k', 3) },
      base: planCaps(minus),
      path: pathStates(minus),
    });
    expect(take.side.checkBeside).toBe(true);
    const plus = cfg({
      start: { hundreds: 5, tens: 0, ones: 0 },
      operation: { op: '+', operand: { hundreds: 5, tens: 0, ones: 0 } },
    });
    const add = chooseSide({ ...args, age: 'k', base: planCaps(plus), path: pathStates(plus) });
    expect(add.side.checkBeside).toBe(false);
    expect(add.side.showProblemRow).toBe(true);
  });
  it('G1 has no choice to make: the card, the pad and "check" stack in the side', () => {
    const c = cfg({ showAlgorithm: true, thenAsk: true });
    const g1 = chooseSide({
      ...args,
      age: 'g1-up',
      places: 3,
      parts: { ...PARTS['g1-up'], card: cardWidth('g1-up', 3) },
      base: planCaps(c),
      path: pathStates(c),
    });
    expect([g1.side.workInSide, g1.side.checkBeside]).toEqual([true, false]);
    expect(g1.width).toBe(836);
  });
});

describe('sideLayout', () => {
  const o = {
    goal: 'compute' as const,
    showWork: true,
    thenAsk: true,
    answerInWork: true,
    places: 3,
  };
  it('keeps "check" under the pad in G1 and beside it in K, the algorithm in the side', () => {
    const g1 = sideLayout({ ...o, age: 'g1-up' });
    expect([g1.workInSide, g1.checkBeside, g1.showProblemRow]).toEqual([true, false, false]);
    expect(g1.spaceH).toBe(648);
    const k = sideLayout({ ...o, age: 'k' });
    expect([k.workInSide, k.checkBeside, k.showProblemRow]).toEqual([true, true, false]);
    expect(k.spaceH).toBe(648);
    expect(k.sideH).toBeLessThanOrEqual(648);
  });
  it('puts a 5-place algorithm above the mat, and no pad means "check" under the card', () => {
    const wide = sideLayout({ ...o, age: 'k', places: 5 });
    expect([wide.wideWork, wide.workInSide, wide.checkBeside]).toEqual([true, false, false]);
    const noPad = sideLayout({ ...o, age: 'k', thenAsk: false, answerInWork: false });
    expect([noPad.workInSide, noPad.checkBeside]).toEqual([true, false]);
    const plain = sideLayout({ ...o, age: 'k', showWork: false, answerInWork: false });
    expect([plain.showProblemRow, plain.checkBeside]).toEqual([true, false]);
  });
});

describe('planMat', () => {
  const stress = planCaps(
    cfg({
      start: { hundreds: 3, tens: 0, ones: 4 },
      operation: { op: '-', operand: { hundreds: 1, tens: 2, ones: 8 } },
    }),
  );

  it('picks the biggest unit that fits, smaller when space is tight', () => {
    const wide = planMat({ caps: stress, age: 'g1-up', width: 1100, height: 560 });
    const tight = planMat({ caps: stress, age: 'g1-up', width: 760, height: 470 });
    expect(wide.fits).toBe(true);
    expect(tight.fits).toBe(true);
    expect(wide.u).toBeLessThanOrEqual(U_MAX);
    expect(tight.u).toBeGreaterThanOrEqual(U_MIN);
    expect(tight.u).toBeLessThan(wide.u);
    expect(tight.matW).toBeLessThanOrEqual(760);
    expect(tight.totalH).toBeLessThanOrEqual(470);
  });

  it('gives K bigger trade strips and still fits, with a unit no bigger than G1', () => {
    expect(stripWidth('k')).toBeGreaterThan(stripWidth('g1-up'));
    const k = planMat({ caps: stress, age: 'k', width: 900, height: 420 });
    const g = planMat({ caps: stress, age: 'g1-up', width: 900, height: 420 });
    expect(k.fits).toBe(true);
    expect(k.u).toBeLessThanOrEqual(g.u);
  });

  it('fills the width at the one scale (U_MAX) when there are few pieces', () => {
    const few = planCaps(
      cfg({
        goal: 'regroup-to',
        operation: undefined,
        regroupTarget: { hundreds: 0, tens: 2, ones: 7 },
      }),
    );
    const p = planMat({ caps: few, age: 'k', width: 900, height: 520 });
    expect(p.matW).toBe(900);
    expect(p.u).toBe(U_MAX);
    expect(p.u).toBeLessThanOrEqual(U_MAX);
  });

  it('lays flats side by side or in rows, never piled', () => {
    const two = planCaps(
      cfg({
        start: { hundreds: 1, tens: 9, ones: 9 },
        operation: { op: '+', operand: { hundreds: 0, tens: 0, ones: 1 } },
      }),
    );
    const p = planMat({ caps: two, age: 'g1-up', width: 920, height: 520 });
    const box = { w: p.colW.hundreds - 2 * COL_PAD, h: p.bodyH - 2 * COL_PAD };
    const flats = placePieces('hundreds', 2, p.u, box, 2, p.flatsPerRow);
    expect(overlaps(flats)).toBe(false);
    for (const b of flats) expect(inside(b, box)).toBe(true);
  });

  it('grows the plan for pieces made off the expected path', () => {
    const grown = growCaps(
      stress,
      { hundreds: 0, tens: 30, ones: 4 },
      { hundreds: 0, tens: 0, ones: 0 },
    );
    expect(grown.mat.tens).toBe(30);
    const p = planMat({ caps: grown, age: 'g1-up', width: 840, height: 400 });
    const box = { w: p.colW.tens - 2 * COL_PAD, h: p.bodyH - 2 * COL_PAD };
    expect(overlaps(placePieces('tens', 30, p.u, box, 30, p.rodsPerRow))).toBe(false);
    expect(growCaps(stress, stress.mat, { hundreds: 1, tens: 2, ones: 8 })).toBe(stress);
  });

  it('has room for every planned piece in each column', () => {
    const p = planMat({ caps: stress, age: 'g1-up', width: 840, height: 400 });
    for (const c of stress.columns) {
      const box = { w: p.colW[c] - 2 * COL_PAD, h: p.bodyH - 2 * COL_PAD };
      const per = c === 'hundreds' ? p.flatsPerRow : p.rodsPerRow;
      const natural = extent(naturalLayout(c, stress.mat[c], p.u, per));
      expect(natural.w).toBeLessThanOrEqual(box.w);
      expect(natural.h).toBeLessThanOrEqual(box.h);
      expect(overlaps(placePieces(c, stress.mat[c], p.u, box, stress.mat[c], per))).toBe(false);
    }
  });
});

describe('one scale per item', () => {
  // The 1280 × 800 widget area beside a side panel with the algorithm card (see the widget).
  const space = { age: 'g1-up', width: 866, height: 548 } as const;

  it('walks the expected path: borrow across zero, then take piece by piece', () => {
    const c = cfg({
      start: { hundreds: 3, tens: 0, ones: 4 },
      operation: { op: '-', operand: { hundreds: 1, tens: 2, ones: 8 } },
    });
    const path = pathStates(c);
    const ones = (n: number) => ({ hundreds: 2, tens: 9, ones: n });
    expect(path.map((s) => s.mat)).toEqual([
      { hundreds: 3, tens: 0, ones: 4 },
      { hundreds: 2, tens: 10, ones: 4 },
      ones(14),
      // Eight ones, one at a time, then two tens and a hundred.
      ...[13, 12, 11, 10, 9, 8, 7, 6].map(ones),
      { hundreds: 2, tens: 8, ones: 6 },
      { hundreds: 2, tens: 7, ones: 6 },
      { hundreds: 1, tens: 7, ones: 6 },
    ]);
    expect(path.at(-1)?.taken).toEqual({ hundreds: 1, tens: 2, ones: 8 });
    const add = pathStates(cfg({}));
    expect(add[0]?.pending).toEqual({ hundreds: 0, tens: 1, ones: 5 });
    expect(add.at(-1)).toEqual({
      mat: { hundreds: 0, tens: 4, ones: 2 },
      pending: null,
      taken: null,
    });
  });

  it('draws 20 px pieces for ordinary items and the heaviest too, once its algorithm states the problem', () => {
    const add = cfg({});
    expect(itemUnit({ ...space, base: planCaps(add), path: pathStates(add) })).toBe(U_MAX);
    const heavy = cfg({
      start: { hundreds: 3, tens: 0, ones: 4 },
      operation: { op: '-', operand: { hundreds: 1, tens: 2, ones: 8 } },
      showAlgorithm: true,
      thenAsk: true,
    });
    // No expression row (the algorithm card states the problem): the mat gets the full height.
    const tall = { ...space, height: 648 };
    expect(itemUnit({ ...tall, base: planCaps(heavy), path: pathStates(heavy) })).toBe(U_MAX);
    expect(U_FLOOR).toBeLessThan(U_MAX);
  });

  it('lays taken rods down in the nest (low and wide)', () => {
    const rods = lyingRods(2, 20);
    expect(rods[0]).toEqual({ x: 0, y: 0, w: 200, h: 20 });
    expect(overlaps(rods)).toBe(false);
  });

  it('reads the result row as one number, ones box first', () => {
    expect(digitsValue([null, null, null])).toBeNull();
    expect(digitsValue([null, 7, 6])).toBe(76);
    expect(digitsValue([1, 7, 6])).toBe(176);
    expect(digitsValue([1, null, 6])).toBeNull();
    expect(digitsValue([null, 7, null])).toBeNull();
    // Internal and trailing zeros, and zero itself.
    expect(digitsValue([3, 0, 4])).toBe(304);
    expect(digitsValue([1, 0, 0])).toBe(100);
    expect(digitsValue([null, null, 0])).toBe(0);
    expect(digitsValue([1, 0, 0, 0])).toBe(1000);
    expect(digitsValue([null, 1, 5, 0, 0])).toBe(1500);
  });

  it('every result from 0 to 999 can be written in the result row', () => {
    for (let v = 0; v <= 999; v++) {
      const row = placeDigits(v, 3).map((d) => (d === '' ? null : Number(d)));
      expect(digitsValue(row)).toBe(v);
    }
  });

  it('sizes the answer entry from the operands, never the result', () => {
    const plus = (s: number, o: number) =>
      answerPlaces(
        cfg({
          start: { hundreds: Math.floor(s / 100), tens: Math.floor(s / 10) % 10, ones: s % 10 },
          operation: {
            op: '+',
            operand: { hundreds: Math.floor(o / 100), tens: Math.floor(o / 10) % 10, ones: o % 10 },
          },
        }),
      );
    // 3-digit + 2-digit: 4 places whether the sum stays under 1000 or reaches it.
    expect(plus(123, 45)).toBe(4);
    expect(plus(990, 10)).toBe(4);
    expect(plus(500, 500)).toBe(4);
    // Two 2-digit addends: 3 places (the mat's three), with or without a carry into the hundreds.
    expect(plus(27, 15)).toBe(3);
    expect(plus(95, 5)).toBe(3);
    // 1200 + 300 (twelve hundreds on the mat): 5 places.
    expect(
      answerPlaces(
        cfg({
          start: { hundreds: 12, tens: 0, ones: 0 },
          operation: { op: '+', operand: { hundreds: 3, tens: 0, ones: 0 } },
        }),
      ),
    ).toBe(5);
    // `−`: as long as the start, at least 3.
    const minus = (h: number, t: number, o: number) =>
      answerPlaces(
        cfg({
          start: { hundreds: h, tens: t, ones: o },
          operation: { op: '-', operand: { hundreds: 0, tens: 1, ones: 5 } },
        }),
      );
    expect(minus(0, 4, 2)).toBe(3);
    expect(minus(3, 0, 4)).toBe(3);
    expect(minus(12, 0, 0)).toBe(4);
  });

  it('writes a number in place columns, highest first', () => {
    expect(placeDigits(1200, 4)).toEqual(['1', '2', '0', '0']);
    expect(placeDigits(27, 4)).toEqual(['', '', '2', '7']);
    expect(placeDigits(0, 3)).toEqual(['', '', '0']);
    expect(placeDigits(304, 3)).toEqual(['3', '0', '4']);
  });
});

describe('fx', () => {
  const rod: Box = { x: 100, y: 50, w: 10, h: 100 };

  it('cuts a rod into ten units and a flat into ten rods', () => {
    expect(slices(rod)[3]).toEqual({ x: 100, y: 80, w: 10, h: 10 });
    expect(slices({ x: 0, y: 0, w: 100, h: 100 })[2]).toEqual({ x: 20, y: 0, w: 10, h: 100 });
  });

  it('draws a ghost over its start with a translate (and scale only when sizes differ)', () => {
    expect(transformFrom({ x: 10, y: 20, w: 5, h: 5 }, { x: 0, y: 0, w: 5, h: 5 })).toBe(
      'translate(10px, 20px)',
    );
    expect(transformFrom({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 5, h: 5 })).toContain(
      'scale(2, 2)',
    );
  });

  it('breaks one piece into ten ghosts that end at their places, within 600–900 ms', () => {
    const dests = Array.from({ length: 10 }, (_, i) => ({ x: 300 + i * 12, y: 60, w: 10, h: 10 }));
    const ghosts = breakGhosts('tens', 'ones', rod, dests);
    expect(ghosts).toHaveLength(11);
    for (const g of ghosts.slice(1)) {
      expect(g.keyframes.at(-1)?.transform).toBe('translate(0px, 0px)');
      expect(g.delay + g.duration).toBeGreaterThanOrEqual(600);
      expect(g.delay + g.duration).toBeLessThanOrEqual(900);
      for (const k of g.keyframes) {
        expect(Object.keys(k).every((p) => ['transform', 'opacity', 'offset'].includes(p))).toBe(
          true,
        );
      }
    }
  });

  it('bundles ten ghosts into the new piece, gathered inside the bounds', () => {
    const units = Array.from({ length: 10 }, (_, i) => ({
      x: 300 + (i % 5) * 12,
      y: 60 + Math.floor(i / 5) * 12,
      w: 10,
      h: 10,
    }));
    const bounds = { x: 0, y: 0, w: 1000, h: 600 };
    const g = gatherBox(units, 'tens', bounds);
    expect(g).toMatchObject({ w: 10, h: 100 });
    expect(g.y).toBeGreaterThanOrEqual(0);
    const ghosts = bundleGhosts('ones', 'tens', units, rod, bounds);
    expect(ghosts).toHaveLength(11);
    expect(ghosts.at(-1)?.kind).toBe('tens');
    expect(ghosts.at(-1)?.keyframes.at(-1)?.opacity).toBe(1);
  });

  it('moves pieces one after another', () => {
    const ghosts = moveGhosts('ones', [rod, rod], [rod, rod]);
    expect(ghosts[1]?.delay).toBeGreaterThan(ghosts[0]?.delay ?? 0);
  });
});

describe('short rooms: the problem card in the side panel (#13)', () => {
  const regroup99 = {
    format: 'base-ten-trade',
    start: { hundreds: 0, tens: 8, ones: 19 },
    goal: 'regroup-to',
    regroupTarget: { hundreds: 0, tens: 9, ones: 9 },
    showAlgorithm: false,
    thenAsk: false,
  } as Config;
  const add = {
    format: 'base-ten-trade',
    start: { hundreds: 0, tens: 6, ones: 9 },
    operation: { op: '+', operand: { hundreds: 0, tens: 0, ones: 8 } },
    goal: 'compute',
    showAlgorithm: false,
    thenAsk: true,
  } as Config;
  const args = (c: Config) => ({
    age: 'g1-up' as const,
    goal: c.goal,
    showWork: false,
    thenAsk: c.thenAsk,
    answerInWork: false,
    places: 2,
    base: planCaps(c),
    path: pathStates(c),
  });
  // As measured in the pier: the labelled check 180 px, the icon check 70, the goal chips in a
  // column 153 × 245, the equation card 240 × 74.
  const chips = { pad: 0, check: 180, card: 0, problem: { w: 153, h: 245 }, checkIcon: 70 };
  const equation = { pad: 216, check: 180, card: 0, problem: { w: 240, h: 74 }, checkIcon: 70 };

  it('sideLayout follows the budget: at 558 px the pad and check still stack under the row', () => {
    const s = sideLayout({ ...args(add), budget: 558 });
    expect(s.spaceH).toBe(558 - 2 * ROOT_PAD_Y - s.problemH - ROW_GAP);
    expect(s.sideH).toBeLessThanOrEqual(558 - 2 * ROOT_PAD_Y);
  });
  it('in the side, the card takes no height from the mat', () => {
    const s = sideLayout({ ...args(regroup99), budget: 358, inSide: chips.problem });
    expect(s).toMatchObject({ problemInSide: true, showProblemRow: false, spaceH: 346 });
    expect(s.sideH).toBe(245 + SIDE_GAP + 70);
    expect(s.padWide).toBeUndefined();
  });
  it('with a pad in a short room the pad is 4 × 3 and check stands beside the card', () => {
    const s = sideLayout({ ...args(add), budget: 358, inSide: equation.problem });
    expect(s).toMatchObject({ problemInSide: true, padWide: true });
    expect(s.sideH).toBe(74 + SIDE_GAP + 3 * 68 + 2 * 12);
    expect(sideWidth(s, equation, 'g1-up')).toBe(240 + SIDE_GAP + 70);
    // In a taller room the pad keeps its three columns, check under it.
    const tall = sideLayout({ ...args(add), budget: 558, inSide: equation.problem });
    expect(tall.padWide).toBeUndefined();
    expect(sideWidth(tall, equation, 'g1-up')).toBe(240);
  });
  it('960 × 600, regroup 99: the card goes in the side and the pieces stay countable', () => {
    const { side, width } = chooseSide({
      ...args(regroup99),
      budget: 358,
      contentW: 850,
      parts: chips,
    });
    expect(side.problemInSide).toBe(true);
    expect(width).toBe(850 - GAP - 153);
    const fit = itemFit({ ...args(regroup99), width, height: side.spaceH });
    expect(fit.fits).toBe(true);
    expect(fit.unit).toBeGreaterThanOrEqual(U_FLOOR);
  });
  it('1280 × 800: the usual layout draws the same 20 px pieces, so it is kept', () => {
    for (const [c, parts] of [
      [regroup99, chips],
      [add, equation],
    ] as const) {
      const { side } = chooseSide({ ...args(c), budget: 558, contentW: 1170, parts });
      expect(side.problemInSide).toBeUndefined();
      expect(side.showProblemRow).toBe(true);
    }
  });
  it('960 × 600, add with a trade: neither way draws countable pieces (the pier lists it)', () => {
    const { side, width } = chooseSide({
      ...args(add),
      budget: 358,
      contentW: 850,
      parts: equation,
    });
    const fit = itemFit({ ...args(add), width, height: side.spaceH });
    expect(fit.unit).toBeLessThan(U_FLOOR);
  });
  it('a made choice is kept whatever the room becomes', () => {
    const grown = chooseSide({
      ...args(regroup99),
      budget: 558,
      contentW: 1170,
      parts: chips,
      arrange: 'in-side',
    });
    expect(grown.side.problemInSide).toBe(true);
    const shrunk = chooseSide({
      ...args(regroup99),
      budget: 358,
      contentW: 850,
      parts: chips,
      arrange: 'usual',
    });
    expect(shrunk.side.problemInSide).toBeUndefined();
  });
  it('with the algorithm shown the card stays where it is', () => {
    const { side } = chooseSide({
      ...args(add),
      showWork: true,
      budget: 358,
      contentW: 850,
      parts: equation,
    });
    expect(side.problemInSide).toBeUndefined();
  });
});
