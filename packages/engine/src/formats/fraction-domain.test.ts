// The supported domain of the three fraction formats (U05, #14): one test per bound, the undo ops
// (`mend`, `drop {remove}`, `answer {id, off}`), and that what the models accept is exactly what
// the checkers can pass (no band where validation and checking disagree).

import type { WidgetAction, WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import { FRACTION_AREA_TOLERANCE } from '../check/state/fraction.cut';
import { PARTITION_TOLERANCE, partitionPoints } from '../check/state/fraction.partition';
import { matches } from '../items/check';
import {
  cutShares,
  fractionCut,
  MAX_CUT_PARTS,
  MAX_GRID_SIDE,
  MAX_NAME_NUMBER,
  MIN_CUT_ANGLE,
  MIN_CUT_SPAN,
  partCount,
  shadedParts,
} from './fraction-cut';
import {
  fractionLine,
  MAX_LINE_DENOMINATOR,
  MAX_LINE_MARKS,
  MAX_LINE_TICKS,
  MAX_PARTITION_PARTS,
  MAX_TARGET_DENOMINATOR,
  placeTolerance,
  snapPlacement,
} from './fraction-line';
import {
  fractionPick,
  MAX_PICK_OPTIONS,
  MAX_PICTURE_PARTS,
  MAX_WORD_OPTIONS,
  MIN_PICK_OPTIONS,
} from './fraction-pick';
import type { FormatModel } from './types';

type CutConfig = WidgetConfigOf<'fraction-cut'>;
type LineConfig = WidgetConfigOf<'fraction-line'>;
type PickConfig = WidgetConfigOf<'fraction-pick'>;

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };

// biome-ignore lint/suspicious/noExplicitAny: the helpers serve models of three formats.
type AnyModel = FormatModel<any, any>;
const issues = (m: AnyModel, config: unknown): string[] => {
  const r = m.configSchema.safeParse(config);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};
const ok = (m: AnyModel, config: unknown) => issues(m, config).length === 0;

const cut = (over: Partial<CutConfig> = {}): CutConfig => ({
  format: 'fraction-cut',
  shape: 'rect',
  parts: 2,
  cutMode: 'guided',
  acceptNonCongruent: false,
  thenName: false,
  ...over,
});
const line = (over: Partial<LineConfig> = {}): LineConfig => ({
  format: 'fraction-line',
  max: 1,
  denominator: 2,
  ticksShown: true,
  labels: 'ends',
  mode: 'place',
  target: { a: 1, b: 2 },
  skin: 'line',
  decimalLabels: false,
  ...over,
});
const partition = (over: Partial<LineConfig> = {}): LineConfig =>
  line({ mode: 'partition', target: undefined, ticksShown: false, skin: 'strip', ...over });
const halves = { kind: 'fraction', shape: 'rect', parts: 2, shaded: 0, equalParts: true } as const;
const pick = (n: number): PickConfig => ({
  format: 'fraction-pick',
  mode: 'pick-picture',
  options: Array.from({ length: n }, (_, i) => ({ id: `pic-${i}`, stimulus: halves })),
});

const playCut = (c: CutConfig, ops: WidgetAction[]) =>
  ops.reduce((s, a) => fractionCut.apply(s, a), fractionCut.initialState(c));
const playLine = (c: LineConfig, ops: WidgetAction[]) =>
  ops.reduce((s, a) => fractionLine.apply(s, a), fractionLine.initialState(c));

describe('fraction-cut: supported domain', () => {
  it(`parts: 2 to ${MAX_CUT_PARTS}`, () => {
    expect(ok(fractionCut, cut({ parts: 2 }))).toBe(true);
    expect(ok(fractionCut, cut({ parts: MAX_CUT_PARTS }))).toBe(true);
    expect(issues(fractionCut, cut({ parts: 1 }))).toEqual([
      `parts: a whole is cut into 2 to ${MAX_CUT_PARTS} parts`,
    ]);
    expect(issues(fractionCut, cut({ parts: MAX_CUT_PARTS + 1 }))).toEqual([
      `parts: a whole is cut into 2 to ${MAX_CUT_PARTS} parts`,
    ]);
  });

  it('shade: 0 to parts', () => {
    expect(ok(fractionCut, cut({ parts: 4, shade: 0 }))).toBe(true);
    expect(ok(fractionCut, cut({ parts: 4, shade: 4 }))).toBe(true);
    expect(issues(fractionCut, cut({ parts: 4, shade: 5 }))).toEqual([
      'shade: shade at most every part',
    ]);
    expect(ok(fractionCut, cut({ parts: 4, shade: -1 }))).toBe(false);
  });

  it(`gridSize: 1 to ${MAX_GRID_SIDE} cells a side, at most 100 cells`, () => {
    const grid = (gridSize: [number, number], parts = 2) =>
      cut({ shape: 'grid', gridSize, parts, cutMode: 'free' });
    expect(ok(fractionCut, grid([MAX_GRID_SIDE, 2]))).toBe(true);
    expect(ok(fractionCut, grid([10, 10]))).toBe(true);
    expect(issues(fractionCut, grid([MAX_GRID_SIDE + 2, 1]))).toEqual([
      `gridSize: a grid has at most ${MAX_GRID_SIDE} cells a side`,
    ]);
    expect(issues(fractionCut, grid([1, MAX_GRID_SIDE + 2]))).toEqual([
      `gridSize: a grid has at most ${MAX_GRID_SIDE} cells a side`,
    ]);
    expect(issues(fractionCut, grid([12, 10]))).toEqual(['gridSize: at most 100 cells']);
    expect(ok(fractionCut, grid([0, 2]))).toBe(false);
  });

  it(`free straight cuts never make more than ${MAX_CUT_PARTS} parts`, () => {
    const c = cut({ cutMode: 'free', parts: MAX_CUT_PARTS });
    const ops = Array.from({ length: 20 }, (_, i) => act('cut', { dir: 'v', at: (i + 1) / 21 }));
    const s = playCut(c, ops);
    expect(partCount(s)).toBe(MAX_CUT_PARTS);
    // A cross cut would double the parts: refused whole.
    expect(partCount(fractionCut.apply(s, act('cut', { dir: 'h', at: 0.5 })))).toBe(MAX_CUT_PARTS);
  });

  it(`free radii never make more than ${MAX_CUT_PARTS} sectors`, () => {
    const c = cut({ shape: 'circle', cutMode: 'free', parts: MAX_CUT_PARTS });
    const ops = Array.from({ length: 24 }, (_, i) => act('cut', { angle: i * 15 }));
    expect(partCount(playCut(c, ops))).toBe(MAX_CUT_PARTS);
  });

  it(`a free cut leaves no piece narrower than MIN_CUT_SPAN or MIN_CUT_ANGLE`, () => {
    const c = cut({ cutMode: 'free', parts: 3 });
    expect(partCount(playCut(c, [act('cut', { dir: 'v', at: MIN_CUT_SPAN / 2 })]))).toBe(1);
    expect(partCount(playCut(c, [act('cut', { dir: 'v', at: 1 - MIN_CUT_SPAN / 2 })]))).toBe(1);
    expect(partCount(playCut(c, [act('cut', { dir: 'v', at: MIN_CUT_SPAN })]))).toBe(2);
    // Beside an earlier cut too.
    expect(
      partCount(
        playCut(c, [
          act('cut', { dir: 'v', at: 0.5 }),
          act('cut', { dir: 'v', at: 0.5 + MIN_CUT_SPAN / 2 }),
        ]),
      ),
    ).toBe(2);
    for (const at of [0, 1, -0.2, 1.4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(partCount(playCut(c, [act('cut', { dir: 'v', at })])), String(at)).toBe(1);
    }
    const circle = cut({ shape: 'circle', cutMode: 'free', parts: 3 });
    const two = [act('cut', { angle: 0 }), act('cut', { angle: 120 })];
    expect(
      partCount(playCut(circle, [...two, act('cut', { angle: 120 + MIN_CUT_ANGLE / 2 })])),
    ).toBe(2);
    expect(
      partCount(playCut(circle, [...two, act('cut', { angle: 360 - MIN_CUT_ANGLE / 2 })])),
    ).toBe(2);
    expect(partCount(playCut(circle, [...two, act('cut', { angle: 120 + MIN_CUT_ANGLE })]))).toBe(
      3,
    );
  });

  it('every part the checker accepts can be cut: the narrowest is wider than the bounds', () => {
    // fraction.cut accepts a part within FRACTION_AREA_TOLERANCE of 1/parts.
    const narrowest = 1 / MAX_CUT_PARTS - FRACTION_AREA_TOLERANCE;
    expect(MIN_CUT_SPAN).toBeLessThan(narrowest);
    expect(MIN_CUT_ANGLE / 360).toBeLessThan(narrowest);
    // And the model's own equal cuts pass, for every count, free and guided.
    const checker = stateChecker('fraction.cut');
    for (let parts = 2; parts <= MAX_CUT_PARTS; parts += 1) {
      const target = { parts, shade: 0, acceptNonCongruent: false };
      const strip = playCut(
        cut({ cutMode: 'free', parts }),
        Array.from({ length: parts - 1 }, (_, i) => act('cut', { dir: 'v', at: (i + 1) / parts })),
      );
      expect(checker?.check(target, { regions: cutShares(strip), shaded: [] }), `${parts}`).toBe(
        true,
      );
      const pie = playCut(
        cut({ shape: 'circle', cutMode: 'free', parts }),
        Array.from({ length: parts }, (_, i) => act('cut', { angle: (i * 360) / parts })),
      );
      expect(checker?.check(target, { regions: cutShares(pie), shaded: [] }), `${parts}`).toBe(
        true,
      );
    }
  });

  it(`a typed name is two whole numbers 0 to ${MAX_NAME_NUMBER}`, () => {
    const c = cut({ shade: 1, thenName: true });
    const cutOnce = [act('cut', { line: 0 }), act('shade', { part: 0 })];
    expect(playCut(c, [...cutOnce, act('answer', { values: [1, 2] })]).name).toEqual([1, 2]);
    for (const values of [[1, 100], [-1, 2], [0.5, 2], [1], [1, 2, 3]]) {
      expect(playCut(c, [...cutOnce, act('answer', { values })]).name, String(values)).toBeNull();
    }
  });
});

describe('fraction-cut: mend takes one cut back where it is', () => {
  it('guided: mending a line joins its parts and the line can be cut again', () => {
    const c = cut({ parts: 4 });
    const s = playCut(c, [act('cut', { line: 0 }), act('cut', { line: 1 })]);
    expect(partCount(s)).toBe(4);
    const mended = fractionCut.apply(s, act('mend', { line: 0 }));
    expect(partCount(mended)).toBe(2);
    expect(mended.linesCut).toEqual([1]);
    expect(cutShares(mended)).toEqual([0.5, 0.5]);
    const again = fractionCut.apply(mended, act('cut', { line: 0 }));
    expect(partCount(again)).toBe(4);
    // A line that is not cut, or not a line: nothing happens.
    expect(fractionCut.apply(mended, act('mend', { line: 0 }))).toBe(mended);
    expect(fractionCut.apply(mended, act('mend', { line: 7 }))).toBe(mended);
  });

  it('any cut can be taken back, in any order, back to the whole', () => {
    for (let parts = 2; parts <= MAX_CUT_PARTS; parts += 1) {
      for (const shape of ['rect', 'circle', 'bar'] as const) {
        const c = cut({ parts, shape });
        const lines = Array.from({ length: 12 }, (_, i) => i);
        let s = playCut(
          c,
          lines.map((l) => act('cut', { line: l })),
        );
        expect(partCount(s), `${shape} ${parts}`).toBe(parts);
        // Take the lines back from the first cut on (not the order they were cut in).
        for (const l of [...s.linesCut]) s = fractionCut.apply(s, act('mend', { line: l }));
        expect(partCount(s), `${shape} ${parts}`).toBe(1);
        expect(s.linesCut).toEqual([]);
        expect(fractionCut.toResponse(s)).toBeNull();
      }
    }
  });

  it('a joined part is filled only when every piece of it was', () => {
    const c = cut({ parts: 2, shade: 1 });
    const one = playCut(c, [act('cut', { line: 0 }), act('shade', { part: 0 })]);
    expect(shadedParts(fractionCut.apply(one, act('mend', { line: 0 })))).toEqual([]);
    const both = fractionCut.apply(one, act('shade', { part: 1 }));
    expect(shadedParts(fractionCut.apply(both, act('mend', { line: 0 })))).toEqual([0]);
    const pie = cut({ shape: 'circle', parts: 4, shade: 1 });
    const cutPie = playCut(pie, [
      act('cut', { line: 0 }),
      act('cut', { line: 1 }),
      act('shade', { part: 0 }),
      act('shade', { part: 1 }),
    ]);
    const half = fractionCut.apply(cutPie, act('mend', { line: 1 }));
    expect(partCount(half)).toBe(2);
    expect(shadedParts(half)).toHaveLength(1);
  });

  it('free cuts: mend {dir, at} and mend {angle}; a guided line cut by hand frees its knife', () => {
    const c = cut({ cutMode: 'free', parts: 3 });
    const s = playCut(c, [
      act('cut', { dir: 'v', at: 1 / 3 }),
      act('cut', { dir: 'v', at: 2 / 3 }),
    ]);
    const back = fractionCut.apply(s, act('mend', { dir: 'v', at: 1 / 3 }));
    expect(cutShares(back).map((x) => Math.round(x * 1000))).toEqual([667, 333]);
    expect(fractionCut.apply(back, act('mend', { dir: 'v', at: 0.9 }))).toBe(back);
    expect(fractionCut.apply(back, act('mend', { dir: 'h', at: 2 / 3 }))).toBe(back);
    const pie = cut({ shape: 'circle', cutMode: 'free', parts: 2 });
    const cutPie = playCut(pie, [
      act('cut', { angle: 0, through: true }),
      act('cut', { angle: 90 }),
    ]);
    expect(partCount(cutPie)).toBe(3);
    const two = fractionCut.apply(cutPie, act('mend', { angle: 90 }));
    expect(cutShares(two)).toEqual([0.5, 0.5]);
    // One radius left would be a slit nobody can see: mending to it clears it too.
    const whole1 = fractionCut.apply(two, act('mend', { angle: 180 }));
    expect(partCount(whole1)).toBe(1);
    expect(whole1.radii).toEqual([]);
    // Guided line 0 mended through its geometry: it is no longer "cut".
    const guided = playCut(cut({ parts: 2, cutMode: 'free' }), [act('cut', { line: 0 })]);
    const whole = fractionCut.apply(guided, act('mend', { dir: 'v', at: 0.5 }));
    expect(whole.linesCut).toEqual([]);
    expect(partCount(fractionCut.apply(whole, act('cut', { line: 0 })))).toBe(2);
  });

  it('non-congruent parts: only parts that make a rectangle together join', () => {
    const c = cut({ cutMode: 'free', parts: 4, acceptNonCongruent: true });
    const s = playCut(c, [
      act('cut', { dir: 'v', at: 0.5 }),
      act('cut', { dir: 'h', at: 0.5, part: 0 }),
    ]);
    expect(partCount(s)).toBe(3);
    // The upright cut has a half on one side and two quarters on the other: nothing joins.
    expect(fractionCut.apply(s, act('mend', { dir: 'v', at: 0.5 }))).toBe(s);
    expect(partCount(fractionCut.apply(s, act('mend', { dir: 'h', at: 0.5 })))).toBe(2);
  });
});

describe('fraction-line: supported domain', () => {
  it(`denominator: 1 to ${MAX_LINE_DENOMINATOR}, and at most ${MAX_LINE_TICKS} parts on the line`, () => {
    expect(
      ok(fractionLine, line({ denominator: MAX_LINE_DENOMINATOR, target: { a: 6, b: 12 } })),
    ).toBe(true);
    expect(
      issues(fractionLine, line({ denominator: MAX_LINE_DENOMINATOR + 1, ticksShown: false })),
    ).toEqual([`denominator: at most ${MAX_LINE_DENOMINATOR} parts a whole`]);
    expect(ok(fractionLine, line({ denominator: 0 }))).toBe(false);
    // Twelfths on three wholes is the most the line draws.
    expect(
      ok(
        fractionLine,
        line({ denominator: MAX_LINE_DENOMINATOR, max: 3, target: { a: 6, b: 12 } }),
      ),
    ).toBe(true);
    expect(MAX_LINE_TICKS).toBe(MAX_LINE_DENOMINATOR * 3);
  });

  it('max: 1, 2 or 3 wholes', () => {
    for (const max of [1, 2, 3]) expect(ok(fractionLine, line({ max: max as 1 }))).toBe(true);
    for (const max of [0, 4, 1.5]) expect(ok(fractionLine, line({ max: max as 1 }))).toBe(false);
  });

  it(`partition: 2 parts a whole or more, at most ${MAX_PARTITION_PARTS} on the line`, () => {
    expect(ok(fractionLine, partition({ denominator: 2 }))).toBe(true);
    expect(ok(fractionLine, partition({ denominator: MAX_PARTITION_PARTS }))).toBe(true);
    expect(ok(fractionLine, partition({ denominator: 3, max: 2 }))).toBe(true);
    expect(ok(fractionLine, partition({ denominator: 2, max: 3 }))).toBe(true);
    expect(issues(fractionLine, partition({ denominator: 1 }))).toEqual([
      'denominator: partition into 2 or more',
    ]);
    expect(issues(fractionLine, partition({ denominator: MAX_PARTITION_PARTS + 1 }))).toEqual([
      `denominator: partition into at most ${MAX_PARTITION_PARTS} parts on the whole line`,
    ]);
    expect(issues(fractionLine, partition({ denominator: 3, max: 3 }))).toEqual([
      `denominator: partition into at most ${MAX_PARTITION_PARTS} parts on the whole line`,
    ]);
  });

  it(`target: on the line, b 1 to ${MAX_TARGET_DENOMINATOR}`, () => {
    const free = { ticksShown: false } as const;
    expect(ok(fractionLine, line({ ...free, target: { a: 0, b: 1 } }))).toBe(true);
    expect(ok(fractionLine, line({ ...free, target: { a: 5, b: MAX_TARGET_DENOMINATOR } }))).toBe(
      true,
    );
    expect(
      issues(fractionLine, line({ ...free, target: { a: 5, b: MAX_TARGET_DENOMINATOR + 1 } })),
    ).toEqual([`target.b: a target has at most ${MAX_TARGET_DENOMINATOR} parts a whole`]);
    expect(issues(fractionLine, line({ ...free, target: { a: 3, b: 2 } }))).toEqual([
      'target: the target is on the line',
    ]);
    expect(ok(fractionLine, line({ ...free, target: { a: 1, b: 0 } }))).toBe(false);
    expect(ok(fractionLine, line({ ...free, target: { a: -1, b: 2 } }))).toBe(false);
  });

  it(`at most ${MAX_LINE_MARKS} marks; a mark sits inside the line`, () => {
    const c = partition({ denominator: 2 });
    const many = Array.from({ length: 30 }, (_, i) => act('drop', { at: (i + 1) / 40 }));
    expect(playLine(c, many).cuts).toHaveLength(MAX_LINE_MARKS);
    for (const at of [0, 1, -0.5, 2, Number.NaN]) {
      expect(playLine(c, [act('drop', { at })]).cuts, String(at)).toEqual([]);
    }
    const tooMany = Array.from({ length: MAX_LINE_MARKS + 1 }, (_, i) => (i + 1) / 20);
    expect(playLine(c, [act('answer', { values: tooMany })]).cuts).toEqual([]);
  });

  it('typed numbers are whole, 0 to 99; a decimal is on the line', () => {
    const read = line({ mode: 'read', denominator: 4, target: { a: 3, b: 4 } });
    expect(playLine(read, [act('answer', { values: [3, 4] })]).values).toEqual([3, 4]);
    for (const values of [
      [3, 100],
      [-3, 4],
      [1.5, 4],
    ]) {
      expect(playLine(read, [act('answer', { values })]).values).toEqual([null, null]);
    }
    expect(playLine(read, [act('answer', { value: 100, slot: 1 })]).values).toEqual([null, null]);
    const tenths = line({
      mode: 'read',
      denominator: 10,
      decimalLabels: true,
      target: { a: 3, b: 10 },
    });
    expect(playLine(tenths, [act('answer', { value: 0.3 })]).value).toBe(0.3);
    expect(playLine(tenths, [act('answer', { value: 1.3 })]).value).toBeNull();
    expect(playLine(tenths, [act('answer', { value: -0.3 })]).value).toBeNull();
  });

  it('hint ops stay inside the line: partition {b}, label {a, b}, hop {k}', () => {
    const c = line({ max: 2, denominator: 4 });
    expect(playLine(c, [act('partition', { b: MAX_TARGET_DENOMINATOR })]).hintPartition).toBe(
      MAX_TARGET_DENOMINATOR,
    );
    expect(
      playLine(c, [act('partition', { b: MAX_TARGET_DENOMINATOR + 1 })]).hintPartition,
    ).toBeNull();
    expect(playLine(c, [act('partition', { b: 0 })]).hintPartition).toBeNull();
    expect(playLine(c, [act('label', { a: 1, b: MAX_TARGET_DENOMINATOR + 1 })]).labels).toEqual([]);
    expect(playLine(c, [act('label', { a: 9, b: 4 })]).labels).toEqual([]);
    expect(playLine(c, [act('hop', { k: 99 })]).hops).toBe(8);
    expect(playLine(c, [act('hop', { k: -1 })]).hops).toBe(0);
  });
});

describe('fraction-line: placing and checking read one value', () => {
  it('with ticks a drop lands on the nearest tick, a tie on the smaller; never off the line', () => {
    const c = line({ denominator: 4, max: 2 });
    expect(snapPlacement(c, 0.3)).toBe(0.25);
    expect(snapPlacement(c, 0.375)).toBe(0.25);
    expect(snapPlacement(c, 0.376)).toBe(0.5);
    expect(snapPlacement(c, -3)).toBe(0);
    expect(snapPlacement(c, 9)).toBe(2);
    expect(playLine(c, [act('drop', { at: 1.3 })]).marker).toBe(1.25);
    expect(playLine(c, [act('answer', { value: 1.3 })]).marker).toBe(1.25);
  });

  it('every tick target is reached exactly by a drop anywhere nearer to it than to the next', () => {
    for (let den = 1; den <= MAX_LINE_DENOMINATOR; den += 1) {
      for (const max of [1, 2, 3] as const) {
        if (den * max > MAX_LINE_TICKS) continue;
        const c = line({ denominator: den, max, target: { a: 0, b: 1 } });
        for (let k = 0; k <= den * max; k += 1) {
          for (const off of [-0.49, 0, 0.49]) {
            const landed = snapPlacement(c, (k + off) / den);
            // The checker's own comparison, with no tolerance at all.
            const answer = {
              kind: 'placement',
              value: k / den,
              min: 0,
              max,
              tolerance: 0,
            } as const;
            expect(
              matches(answer, { kind: 'placement', value: landed }),
              `${k}/${den} + ${off}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('without ticks a drop stays where it is put (to a millionth)', () => {
    const c = line({ ticksShown: false, target: { a: 1, b: 3 } });
    expect(snapPlacement(c, 1 / 3)).toBe(0.333333);
    expect(snapPlacement(c, 0.123456789)).toBe(0.123457);
    expect(snapPlacement(c, 7)).toBe(1);
  });

  it('place: drop {remove} takes the point back; nothing is submittable then', () => {
    const c = line();
    const placed = playLine(c, [act('hop', { k: 1 })]);
    expect(fractionLine.toResponse(placed)).toEqual({ kind: 'placement', value: 0.5 });
    const back = fractionLine.apply(placed, act('drop', { remove: true }));
    expect(back.marker).toBeNull();
    expect(back.hops).toBe(0);
    expect(fractionLine.toResponse(back)).toBeNull();
    expect(fractionLine.apply(back, act('drop', { remove: true }))).toBe(back);
  });

  it('partition: the keyboard cursor (24ths of a whole) reaches every mark within the tolerance', () => {
    const checker = stateChecker('fraction.partition');
    for (let den = 2; den <= MAX_PARTITION_PARTS; den += 1) {
      for (const max of [1, 2, 3] as const) {
        if (den * max > MAX_PARTITION_PARTS) continue;
        const marks = partitionPoints(den, max).map((p) => Math.round(p * 24) / 24);
        for (const [i, p] of partitionPoints(den, max).entries()) {
          expect(Math.abs((marks[i] as number) - p), `${den} ${max}`).toBeLessThanOrEqual(
            PARTITION_TOLERANCE,
          );
        }
        const s = playLine(
          partition({ denominator: den, max }),
          marks.map((at) => act('drop', { at })),
        );
        const r = fractionLine.toResponse(s);
        expect(
          r?.kind === 'state' && checker?.check({ denominator: den, max }, r.value),
          `${den} ${max}`,
        ).toBe(true);
      }
    }
  });
});

describe('fraction-pick: supported domain', () => {
  it(`options: ${MIN_PICK_OPTIONS} to ${MAX_PICK_OPTIONS}`, () => {
    expect(ok(fractionPick, pick(MIN_PICK_OPTIONS))).toBe(true);
    expect(ok(fractionPick, pick(MAX_PICK_OPTIONS))).toBe(true);
    expect(issues(fractionPick, pick(MIN_PICK_OPTIONS - 1))).toEqual([
      `options: a pick shows at least ${MIN_PICK_OPTIONS} options`,
    ]);
    expect(issues(fractionPick, pick(MAX_PICK_OPTIONS + 1))).toEqual([
      `options: a pick shows at most ${MAX_PICK_OPTIONS} options`,
    ]);
  });

  it(`cards without a picture (words, symbols): at most ${MAX_WORD_OPTIONS}`, () => {
    const words = (n: number): PickConfig => ({
      format: 'fraction-pick',
      mode: 'name',
      nameInput: 'words',
      stimulus: halves,
      options: Array.from({ length: n }, (_, i) => ({ id: `w-${i}`, label: `word ${i}` })),
    });
    // Word cards are wide: more than three beside the picture scroll the smallest area (story
    // WordsLandscapeMinK), so the limit is stated and enforced rather than left to overflow.
    expect(issues(fractionPick, words(MAX_WORD_OPTIONS))).toEqual([]);
    expect(issues(fractionPick, words(MAX_WORD_OPTIONS + 1))).toEqual([
      `options: a pick with word or symbol cards shows at most ${MAX_WORD_OPTIONS} options`,
    ]);
    // One card without a picture among pictures counts too.
    const mixed = pick(MAX_WORD_OPTIONS + 1);
    expect(
      issues(fractionPick, {
        ...mixed,
        mode: 'compare',
        options: [...(mixed.options ?? []).slice(1), { id: 'sym', label: '1/2' }],
      }),
    ).toEqual([
      `options: a pick with word or symbol cards shows at most ${MAX_WORD_OPTIONS} options`,
    ]);
  });

  it(`a picture has 1 to ${MAX_PICTURE_PARTS} parts and fills at most all of them`, () => {
    const fair = (over: object): PickConfig => ({
      format: 'fraction-pick',
      mode: 'fair-or-not',
      stimulus: { ...halves, ...over },
    });
    expect(ok(fractionPick, fair({ parts: 1 }))).toBe(true);
    expect(ok(fractionPick, fair({ parts: MAX_PICTURE_PARTS, shaded: MAX_PICTURE_PARTS }))).toBe(
      true,
    );
    expect(ok(fractionPick, fair({ parts: 0 }))).toBe(false);
    expect(ok(fractionPick, fair({ parts: MAX_PICTURE_PARTS + 1 }))).toBe(false);
    expect(ok(fractionPick, fair({ parts: 4, shaded: 5 }))).toBe(false);
  });

  it('an overlay is a proper picture: b 1 to 12, a at most b', () => {
    const c: PickConfig = { format: 'fraction-pick', mode: 'fair-or-not', stimulus: halves };
    const over = (a: number, b: number) =>
      fractionPick.apply(fractionPick.initialState(c), act('overlay', { a, b })).overlay;
    expect(over(1, 2)).toEqual({ a: 1, b: 2 });
    expect(over(MAX_PICTURE_PARTS, MAX_PICTURE_PARTS)).toEqual({ a: 12, b: 12 });
    expect(over(1, MAX_PICTURE_PARTS + 1)).toBeNull();
    expect(over(3, 2)).toBeNull();
    expect(over(1, 0)).toBeNull();
  });

  it('typed names are whole numbers 0 to 99', () => {
    const c: PickConfig = { format: 'fraction-pick', mode: 'name', stimulus: halves };
    const typed = (values: number[]) =>
      fractionPick.apply(fractionPick.initialState(c), act('answer', { values })).values;
    expect(typed([1, 2])).toEqual([1, 2]);
    expect(typed([1, 100])).toEqual([null, null]);
    expect(typed([-1, 2])).toEqual([null, null]);
    expect(typed([0.5, 2])).toEqual([null, null]);
  });

  it('answer {id, off} takes that pick back, and only that pick', () => {
    const c = pick(3);
    const picked = fractionPick.apply(fractionPick.initialState(c), act('answer', { id: 'pic-1' }));
    expect(fractionPick.toResponse(picked)).toEqual({ kind: 'choice', id: 'pic-1' });
    expect(fractionPick.apply(picked, act('answer', { id: 'pic-2', off: true }))).toBe(picked);
    const back = fractionPick.apply(picked, act('answer', { id: 'pic-1', off: true }));
    expect(back.choice).toBeNull();
    expect(fractionPick.toResponse(back)).toBeNull();
  });
});

describe('PR #100 review round 1 (s_1319069ce1c7)', () => {
  it('a free diameter taken back by one seam leaves nothing behind: the next diameter makes halves', () => {
    const c = cut({ shape: 'circle', cutMode: 'free', parts: 2 });
    for (const seam of [0, 180]) {
      const upright = playCut(c, [act('cut', { angle: 0, through: true })]);
      const back = fractionCut.apply(upright, act('mend', { angle: seam }));
      expect(back.radii, String(seam)).toEqual([]);
      expect(partCount(back)).toBe(1);
      const across = fractionCut.apply(back, act('cut', { angle: 90, through: true }));
      expect(cutShares(across), String(seam)).toEqual([0.5, 0.5]);
    }
    // The class: whatever is cut and mended, a whole circle never keeps a radius.
    for (let n = 2; n <= MAX_CUT_PARTS; n += 1) {
      let s = playCut(
        c,
        Array.from({ length: n }, (_, i) => act('cut', { angle: (i * 360) / n })),
      );
      while (s.radii.length > 0) s = fractionCut.apply(s, act('mend', { angle: s.radii[0] }));
      expect(partCount(s)).toBe(1);
      expect(s.radii).toEqual([]);
    }
  });

  it('a partition never shows its answer: no ticks, no labels on the marks', () => {
    expect(issues(fractionLine, partition({ denominator: 4, ticksShown: true }))).toEqual([
      'ticksShown: partition never shows the ticks it asks for',
    ]);
    expect(issues(fractionLine, partition({ denominator: 4, labels: 'all' }))).toEqual([
      'labels: partition never labels the marks it asks for',
    ]);
    for (const labels of ['none', 'ends', 'wholes'] as const) {
      expect(ok(fractionLine, partition({ denominator: 4, labels }))).toBe(true);
    }
  });

  it('placing on shown ticks: only the target’s own tick passes the 03 §5.5 tolerance', () => {
    // The reported case: fourths shown, target 1/2, tolerance 1/(2·2): the 1/4 tick would pass.
    expect(issues(fractionLine, line({ denominator: 4, target: { a: 1, b: 2 } }))).toEqual([
      'target.b: the tick beside the target would pass: write the target in parts no coarser than twice the line’s',
    ]);
    expect(ok(fractionLine, line({ denominator: 4, target: { a: 2, b: 4 } }))).toBe(true);
    // The class: every accepted place-on-ticks config, every tick, through the real checker.
    let checked = 0;
    for (let den = 1; den <= MAX_LINE_DENOMINATOR; den += 1) {
      for (const max of [1, 2, 3] as const) {
        for (let b = 1; b <= MAX_TARGET_DENOMINATOR; b += 1) {
          for (let a = 0; a <= b * max; a += 1) {
            const c = line({ denominator: den, max, target: { a, b } });
            if (!ok(fractionLine, c)) continue;
            const answer = {
              kind: 'placement',
              value: a / b,
              min: 0,
              max,
              tolerance: placeTolerance(c) as number,
            } as const;
            for (let k = 0; k <= den * max; k += 1) {
              const s = playLine(c, [act('drop', { at: k / den })]);
              const passes = matches(answer, fractionLine.toResponse(s) as never);
              expect(passes, `${a}/${b} on ${den}ths to ${max}, tick ${k}`).toBe(
                Math.abs(k / den - a / b) < 1e-9,
              );
            }
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
