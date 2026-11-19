// 03 §6.3 format state models and 03 §5.5 configs, features and answer semantics for the U05
// fraction formats (#14): fraction-cut, fraction-pick and fraction-line, plus the picture
// geometry they share (./fraction-geometry). Every state response runs through its 03 §5.7
// checker (fraction.cut, fraction.partition), so the model and the checker agree, including
// alternative valid end states. The FRA template replays are in test/fractions-u05.test.ts.

import {
  type AnswerSpec,
  FORMAT_SUPPORT,
  type ItemFormat,
  type StateCheckerId,
  type WidgetAction,
  type WidgetConfig,
  type WidgetConfigOf,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import { cutLines } from '../generators/frac/partition';
import { matches } from '../items/check';
import {
  cutGuides,
  cutShares,
  type FractionCutState,
  fractionCut,
  shadedParts,
} from './fraction-cut';
import {
  type CutShape,
  chordLeftShare,
  fractionPicture,
  guidedLines,
  pictureShares,
  sectorsOf,
  splitRects,
  UNEQUAL_WEIGHTS,
} from './fraction-geometry';
import { fractionLine, lineTicks } from './fraction-line';
import { fractionPick, pickChoices } from './fraction-pick';
import { formatModel } from './index';
import { type FormatModel, type FormatState, UnsupportedOpError } from './types';

// biome-ignore lint/suspicious/noExplicitAny: the shared tables mix models of different formats.
type AnyModel = FormatModel<any, any>;

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };

function play<F extends ItemFormat, S extends FormatState<F>>(
  m: FormatModel<F, S>,
  config: WidgetConfigOf<F>,
  ops: WidgetAction[],
): S {
  return ops.reduce((s, a) => m.apply(s, a), m.initialState(config));
}

function respond<F extends ItemFormat, S extends FormatState<F>>(
  m: FormatModel<F, S>,
  config: WidgetConfigOf<F>,
  ops: WidgetAction[],
) {
  return m.toResponse(play(m, config, ops));
}

function passes(
  id: StateCheckerId,
  target: Record<string, unknown>,
  r: ReturnType<AnyModel['toResponse']>,
): boolean {
  const c = stateChecker(id);
  if (!c) throw new Error(`no checker ${id}`);
  return r?.kind === 'state' && c.check(target, r.value);
}

function issuePaths(m: AnyModel, config: unknown): string[] {
  const r = m.configSchema.safeParse(config);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
}

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v)) deepFreeze(x);
    Object.freeze(v);
  }
  return v;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// ---------- easiest-case configs (every feature value is 0) ----------

type CutConfig = WidgetConfigOf<'fraction-cut'>;
const cutBase: CutConfig = {
  format: 'fraction-cut',
  shape: 'rect',
  parts: 2,
  cutMode: 'guided',
  acceptNonCongruent: false,
  thenName: false,
};
const cut = (over: Partial<CutConfig> = {}): CutConfig => ({ ...cutBase, ...over });

type PickConfig = WidgetConfigOf<'fraction-pick'>;
const halves = { kind: 'fraction', shape: 'rect', parts: 2, shaded: 0, equalParts: true } as const;
const pickBase: PickConfig = { format: 'fraction-pick', mode: 'fair-or-not', stimulus: halves };
const pictures: PickConfig = {
  format: 'fraction-pick',
  mode: 'pick-picture',
  options: [
    { id: 'pic-0', stimulus: { ...halves, shape: 'circle' } },
    { id: 'pic-1', stimulus: { ...halves, shape: 'circle', parts: 4 } },
    { id: 'pic-2', stimulus: { ...halves, shape: 'circle', equalParts: false } },
  ],
};

type LineConfig = WidgetConfigOf<'fraction-line'>;
const lineBase: LineConfig = {
  format: 'fraction-line',
  max: 1,
  denominator: 2,
  ticksShown: true,
  labels: 'ends',
  mode: 'place',
  target: { a: 1, b: 2 },
  skin: 'line',
  decimalLabels: false,
};
const line = (over: Partial<LineConfig> = {}): LineConfig => ({ ...lineBase, ...over });

interface Row {
  model: AnyModel;
  config: WidgetConfig;
  answer: AnswerSpec;
  ops: WidgetAction[];
}

const ROWS: Row[] = [
  {
    model: fractionCut,
    config: cutBase,
    answer: {
      kind: 'state',
      checker: 'fraction.cut',
      target: { parts: 2, shade: 0, acceptNonCongruent: false },
    },
    ops: [act('cut', { line: 0 }), act('shade', { part: 1 }), act('separate'), act('stack-parts')],
  },
  {
    model: fractionPick,
    config: pickBase,
    answer: { kind: 'choice', id: 'yes' },
    ops: [
      act('count-parts'),
      act('highlight', { id: 'stimulus' }),
      act('overlay', { a: 1, b: 2 }),
      act('answer', { id: 'yes' }),
    ],
  },
  {
    model: fractionLine,
    config: lineBase,
    answer: { kind: 'placement', value: 0.5, min: 0, max: 1, tolerance: 0.25 },
    ops: [
      act('partition', { b: 2 }),
      act('hop', { k: 1 }),
      act('label', { a: 1, b: 2 }),
      act('drop', { at: 0.5 }),
    ],
  },
];

describe('U05 fraction format models (03 §6.3)', () => {
  const rows = ROWS.map((r) => [r.model.format as string, r] as const);

  it.each(rows)('%s: the schema accepts the easiest valid config', (_f, r) => {
    expect(issuePaths(r.model, r.config)).toEqual([]);
  });

  it.each(rows)(
    '%s: featureValues covers every feature and is 0 on the easiest config',
    (_f, r) => {
      const values = r.model.featureValues(r.config, r.answer);
      expect(Object.keys(values).sort()).toEqual(Object.keys(r.model.features).sort());
      expect(values).toEqual(Object.fromEntries(Object.keys(values).map((k) => [k, 0])));
    },
  );

  it.each(rows)('%s: every feature has a non-zero weight and a doc', (_f, r) => {
    for (const [name, f] of Object.entries(r.model.features as AnyModel['features'])) {
      expect(f.weight, name).not.toBe(0);
      expect(f.doc.length, name).toBeGreaterThan(0);
    }
  });

  it.each(rows)('%s: is registered', (f, r) => {
    expect(formatModel(f as ItemFormat)).toBe(r.model);
  });

  it.each(rows)('%s: supports every op FORMAT_SUPPORT lists, plus answer', (f, r) => {
    const s = r.model.initialState(r.config);
    for (const op of [...FORMAT_SUPPORT[f as ItemFormat].ops, 'answer']) {
      expect(() => r.model.apply(s, act(op)), op).not.toThrow();
    }
  });

  it.each(rows)('%s: malformed args are ignored, never thrown', (f, r) => {
    const s = r.model.initialState(r.config);
    const junk = [
      { line: 'x', part: -1, at: Number.NaN, dir: 'z', angle: 'n' },
      { id: 42, a: 'one', b: null, k: -3, values: ['1', 2] },
      { line: 99, part: 99, at: 7, k: 1.5, b: 0, value: Number.POSITIVE_INFINITY },
    ];
    for (const op of [...FORMAT_SUPPORT[f as ItemFormat].ops, 'answer']) {
      for (const args of junk) expect(() => r.model.apply(s, act(op, args)), op).not.toThrow();
    }
  });

  it.each(rows)('%s: an unsupported op throws UnsupportedOpError', (f, r) => {
    const s = r.model.initialState(r.config);
    expect(() => r.model.apply(s, act('teleport'))).toThrow(UnsupportedOpError);
    try {
      r.model.apply(s, act('teleport'));
    } catch (e) {
      expect(e).toMatchObject({ format: f, op: 'teleport' });
    }
  });

  it.each(rows)('%s: apply is pure (the input state is never mutated)', (_f, r) => {
    let s = r.model.initialState(r.config);
    for (const a of r.ops) {
      const before = JSON.stringify(s);
      const next = r.model.apply(deepFreeze(s), a);
      expect(JSON.stringify(s)).toBe(before);
      s = next;
    }
  });
});

// ---------- geometry: the maths in every picture ----------

describe('fraction geometry', () => {
  const SHAPES: CutShape[] = ['circle', 'rect', 'square', 'bar', 'loaf'];

  it('has as many guided lines as the generator cuts (cutLines)', () => {
    for (const shape of SHAPES) {
      for (let parts = 2; parts <= 12; parts += 1) {
        expect(guidedLines(shape, parts).length, `${shape} ${parts}`).toBe(cutLines(shape, parts));
      }
    }
  });

  it('cutting every guided line gives exactly `parts` equal parts', () => {
    for (const shape of [...SHAPES, 'grid'] as CutShape[]) {
      for (let parts = 2; parts <= 12; parts += 1) {
        const gridSize: [number, number] = [parts * 2, 3];
        const c = cut({ shape, parts, ...(shape === 'grid' ? { gridSize } : {}) });
        const s = play(
          fractionCut,
          c,
          cutGuides(c).map((_, i) => act('cut', { line: i })),
        );
        const shares = cutShares(s);
        expect(shares.length, `${shape} ${parts}`).toBe(parts);
        for (const x of shares) expect(near(x, 1 / parts), `${shape} ${parts}: ${x}`).toBe(true);
      }
    }
  });

  it('equal pictures are exactly equal and number `parts`', () => {
    for (const shape of ['circle', 'rect', 'bar', 'loaf'] as const) {
      for (let parts = 1; parts <= 12; parts += 1) {
        const shares = pictureShares(fractionPicture(shape, parts, true));
        expect(shares.length).toBe(parts);
        for (const x of shares) expect(near(x, 1 / parts), `${shape} ${parts}`).toBe(true);
        expect(
          near(
            shares.reduce((a, b) => a + b, 0),
            1,
          ),
        ).toBe(true);
      }
    }
  });

  it('unequal pictures still have `parts` parts, and they visibly differ', () => {
    for (const shape of ['circle', 'rect', 'bar', 'loaf'] as const) {
      for (let parts = 2; parts <= 12; parts += 1) {
        const shares = pictureShares(fractionPicture(shape, parts, false));
        expect(shares.length, `${shape} ${parts}`).toBe(parts);
        expect(
          near(
            shares.reduce((a, b) => a + b, 0),
            1,
          ),
        ).toBe(true);
        // The biggest part is at least 1.5 times the smallest: unequal at a glance.
        expect(Math.max(...shares) / Math.min(...shares), `${shape} ${parts}`).toBeGreaterThan(1.5);
        // And no picture of unequal parts could pass as equal under the checker's tolerance.
        expect(
          shares.some((x) => Math.abs(x - 1 / parts) > 0.03),
          `${shape} ${parts}`,
        ).toBe(true);
      }
    }
  });

  it('the unequal rect in fourths is an off-centre cross with four different sizes', () => {
    const p = fractionPicture('rect', 4, false);
    const shares = pictureShares(p);
    expect(new Set(shares.map((x) => x.toFixed(4))).size).toBe(4);
  });

  it('the unequal circle in two is an off-centre chord (about a quarter and three quarters)', () => {
    const p = fractionPicture('circle', 2, false);
    expect(p.kind).toBe('chord');
    const [left, right] = pictureShares(p) as [number, number];
    expect(left).toBeGreaterThan(0.7);
    expect(right).toBeLessThan(0.3);
    expect(chordLeftShare(0)).toBeCloseTo(0.5, 12);
  });

  it('unequal weights: every prefix of two or more has a part ≥ 1.8 times another', () => {
    for (let n = 2; n <= UNEQUAL_WEIGHTS.length; n += 1) {
      const w = UNEQUAL_WEIGHTS.slice(0, n);
      expect(Math.max(...w) / Math.min(...w)).toBeGreaterThanOrEqual(1.8);
    }
  });

  it('sectors: one radius is a slit (the circle stays whole); two make two sectors', () => {
    expect(sectorsOf([])).toEqual([{ a0: 0, a1: 360 }]);
    expect(sectorsOf([90])).toEqual([{ a0: 90, a1: 450 }]);
    expect(sectorsOf([0, 120])).toEqual([
      { a0: 0, a1: 120 },
      { a0: 120, a1: 360 },
    ]);
    expect(sectorsOf([-90, 450])).toEqual([
      { a0: 90, a1: 270 },
      { a0: 270, a1: 450 },
    ]);
  });

  it('splitRects keeps reading order and the part fields', () => {
    const rs = splitRects([{ x0: 0, y0: 0, x1: 1, y1: 1, tag: 'a' }], 'h', 0.5);
    const cross = splitRects(rs, 'v', 0.5);
    expect(cross.map((r) => [r.x0, r.y0])).toEqual([
      [0, 0],
      [0.5, 0],
      [0, 0.5],
      [0.5, 0.5],
    ]);
    expect(cross.every((r) => r.tag === 'a')).toBe(true);
  });
});

// ---------- fraction-cut ----------

const cutTarget = (parts: number, shade = 0, extra: Record<string, unknown> = {}) => ({
  parts,
  shade,
  acceptNonCongruent: false,
  ...extra,
});

describe('fraction-cut', () => {
  it('schema: accepts every shape the widget draws; rejects bad counts and grids', () => {
    for (const shape of ['circle', 'rect', 'square', 'bar', 'loaf'] as const) {
      expect(issuePaths(fractionCut, cut({ shape, parts: 3, shade: 2 }))).toEqual([]);
    }
    expect(issuePaths(fractionCut, cut({ shape: 'grid', parts: 4, gridSize: [4, 2] }))).toEqual([]);
    expect(issuePaths(fractionCut, cut({ parts: 1 }))).toEqual(['parts']);
    expect(issuePaths(fractionCut, cut({ parts: 13 }))).toEqual(['parts']);
    expect(issuePaths(fractionCut, cut({ shade: 3 }))).toEqual(['shade']);
    expect(issuePaths(fractionCut, cut({ thenName: true }))).toEqual(['thenName']);
    expect(issuePaths(fractionCut, cut({ shape: 'grid' }))).toEqual(['gridSize']);
    expect(issuePaths(fractionCut, cut({ gridSize: [2, 2] }))).toEqual(['gridSize']);
    // 3 × 3 cells cannot be shared into 2 equal parts; 6 × 2 can, but guided strips need 6 or 2 to
    // divide into 4 (neither is guided-cuttable into fourths) and 5 cells do not share into 4.
    expect(issuePaths(fractionCut, cut({ shape: 'grid', gridSize: [3, 3] }))).toContain('gridSize');
    expect(issuePaths(fractionCut, cut({ shape: 'grid', parts: 4, gridSize: [6, 2] }))).toContain(
      'gridSize',
    );
    expect(
      issuePaths(fractionCut, cut({ shape: 'grid', parts: 4, gridSize: [6, 2], cutMode: 'free' })),
    ).toEqual([]);
    expect(issuePaths(fractionCut, cut({ shape: 'grid', gridSize: [20, 6] }))).toContain(
      'gridSize',
    );
  });

  it('features: hard parts, circle, free cuts, non-unit shading, non-congruent', () => {
    const a: AnswerSpec = { kind: 'state', checker: 'fraction.cut', target: {} };
    expect(
      fractionCut.featureValues(
        cut({ shape: 'circle', parts: 6, shade: 2, cutMode: 'free', acceptNonCongruent: true }),
        a,
      ),
    ).toEqual({
      'parts.hard': 1,
      'shape.circle': 1,
      'cut.free': 1,
      'shade.nonUnit': 1,
      nonCongruent: 1,
    });
    expect(fractionCut.featureValues(cut({ parts: 3 }), a)['parts.hard']).toBe(1);
    expect(fractionCut.featureValues(cut({ parts: 4 }), a)['parts.hard']).toBe(0);
  });

  it('nothing is submittable until the whole is cut', () => {
    expect(respond(fractionCut, cutBase, [])).toBeNull();
    expect(respond(fractionCut, cutBase, [act('shade', { part: 0 })])).toBeNull();
  });

  it('guided: each shape cuts into equal parts and passes fraction.cut', () => {
    const cases: [CutConfig['shape'], number][] = [
      ['circle', 2],
      ['circle', 3],
      ['circle', 4],
      ['circle', 6],
      ['circle', 8],
      ['rect', 2],
      ['rect', 3],
      ['rect', 4],
      ['rect', 8],
      ['square', 4],
      ['bar', 4],
      ['loaf', 5],
    ];
    for (const [shape, parts] of cases) {
      const c = cut({ shape, parts, shade: 1 });
      const ops = [
        ...cutGuides(c).map((_, i) => act('cut', { line: i })),
        act('shade', { part: 0 }),
      ];
      const r = respond(fractionCut, c, ops);
      expect(passes('fraction.cut', cutTarget(parts, 1), r), `${shape} ${parts}`).toBe(true);
    }
  });

  it('a circle in fourths: diameters at 12 and 3 o’clock; part 0 is the top-right quarter', () => {
    const c = cut({ shape: 'circle', parts: 4 });
    expect(cutGuides(c)).toEqual([
      { kind: 'radii', angles: [0, 180] },
      { kind: 'radii', angles: [90, 270] },
    ]);
    const s = play(fractionCut, c, [act('cut', { line: 0 }), act('cut', { line: 1 })]);
    expect(s.sectors.map((p) => [p.a0, p.a1])).toEqual([
      [0, 90],
      [90, 180],
      [180, 270],
      [270, 360],
    ]);
  });

  it('alternative valid end states: any parts shaded, lines in any order', () => {
    const c = cut({ shape: 'rect', parts: 4, shade: 2 });
    const target = cutTarget(4, 2);
    const a = respond(fractionCut, c, [
      act('cut', { line: 1 }),
      act('cut', { line: 0 }),
      act('shade', { part: 3 }),
      act('shade', { part: 1 }),
    ]);
    const b = respond(fractionCut, c, [
      act('cut', { line: 0 }),
      act('cut', { line: 1 }),
      act('shade', { part: 0 }),
      act('shade', { part: 2 }),
    ]);
    expect(passes('fraction.cut', target, a)).toBe(true);
    expect(passes('fraction.cut', target, b)).toBe(true);
  });

  it('a half-done cut, the wrong shading count, or cutting twice fails', () => {
    const c = cut({ shape: 'bar', parts: 4, shade: 1 });
    const t = cutTarget(4, 1);
    expect(passes('fraction.cut', t, respond(fractionCut, c, [act('cut', { line: 0 })]))).toBe(
      false,
    );
    const all = cutGuides(c).map((_, i) => act('cut', { line: i }));
    expect(passes('fraction.cut', t, respond(fractionCut, c, all))).toBe(false);
    expect(
      passes(
        'fraction.cut',
        t,
        respond(fractionCut, c, [...all, act('shade', { part: 0 }), act('shade', { part: 1 })]),
      ),
    ).toBe(false);
    const twice = play(fractionCut, c, [act('cut', { line: 0 }), act('cut', { line: 0 })]);
    expect(twice.rects.length).toBe(2);
    expect(twice.linesCut).toEqual([0]);
  });

  it('shade: off empties a part; repeating does nothing; cutting a filled part keeps both filled', () => {
    const c = cut({ shape: 'rect', parts: 4, shade: 1 });
    let s = play(fractionCut, c, [act('cut', { line: 0 }), act('shade', { part: 0 })]);
    expect(shadedParts(s)).toEqual([0]);
    expect(fractionCut.apply(s, act('shade', { part: 0 }))).toBe(s);
    s = fractionCut.apply(s, act('cut', { line: 1 }));
    expect(shadedParts(s)).toEqual([0, 2]); // the left half's two quarters (reading order)
    s = fractionCut.apply(s, act('shade', { part: 2, off: true }));
    expect(shadedParts(s)).toEqual([0]);
    expect(passes('fraction.cut', cutTarget(4, 1), fractionCut.toResponse(s))).toBe(true);
  });

  it('a circle: shading the whole and then cutting keeps every piece filled', () => {
    const c = cut({ shape: 'circle', parts: 3 });
    let s = play(fractionCut, c, [act('cut', { line: 0 }), act('shade', { part: 0 })]);
    expect(s.sectors).toHaveLength(1); // one radius is a slit
    s = fractionCut.apply(s, act('cut', { line: 1 }));
    expect(s.sectors.every((p) => p.shaded)).toBe(true);
    s = fractionCut.apply(s, act('cut', { line: 2 }));
    expect(shadedParts(s)).toEqual([0, 1, 2]);
  });

  it('free cuts on a rect: any full-length lines; equal thirds pass, a guess fails', () => {
    const c = cut({ parts: 3, cutMode: 'free' });
    const thirds = respond(fractionCut, c, [
      act('cut', { dir: 'v', at: 2 / 3 }),
      act('cut', { dir: 'v', at: 1 / 3 }),
    ]);
    expect(passes('fraction.cut', cutTarget(3), thirds)).toBe(true);
    const guess = respond(fractionCut, c, [
      act('cut', { dir: 'v', at: 0.3 }),
      act('cut', { dir: 'v', at: 0.5 }),
    ]);
    expect(passes('fraction.cut', cutTarget(3), guess)).toBe(false);
    // Rows count too: two horizontal lines are thirds the other way.
    const rows = respond(fractionCut, c, [
      act('cut', { dir: 'h', at: 1 / 3 }),
      act('cut', { dir: 'h', at: 2 / 3 }),
    ]);
    expect(passes('fraction.cut', cutTarget(3), rows)).toBe(true);
    // Guided-only ops in free mode still cut the guide (Pip's demo).
    expect(respond(fractionCut, c, [act('cut', { line: 0 }), act('cut', { line: 1 })])).toEqual(
      thirds,
    );
    // Free args do nothing in guided mode; out-of-range positions do nothing.
    expect(
      play(fractionCut, cut({ parts: 3 }), [act('cut', { dir: 'v', at: 0.5 })]).rects,
    ).toHaveLength(1);
    expect(play(fractionCut, c, [act('cut', { dir: 'v', at: 1 })]).rects).toHaveLength(1);
  });

  it('free cuts on a circle: radii, and `through` diameters', () => {
    const c = cut({ shape: 'circle', parts: 4, cutMode: 'free' });
    const r = respond(fractionCut, c, [
      act('cut', { angle: 45, through: true }),
      act('cut', { angle: 135, through: true }),
    ]);
    expect(passes('fraction.cut', cutTarget(4), r)).toBe(true);
    const thirds = respond(fractionCut, cut({ shape: 'circle', parts: 3, cutMode: 'free' }), [
      act('cut', { angle: 10 }),
      act('cut', { angle: 130 }),
      act('cut', { angle: 250 }),
    ]);
    expect(passes('fraction.cut', cutTarget(3), thirds)).toBe(true);
    const lopsided = respond(fractionCut, cut({ shape: 'circle', parts: 3, cutMode: 'free' }), [
      act('cut', { angle: 0 }),
      act('cut', { angle: 90 }),
      act('cut', { angle: 180 }),
    ]);
    expect(passes('fraction.cut', cutTarget(3), lopsided)).toBe(false);
  });

  it('a grid snaps free cuts to its cell lines', () => {
    const c = cut({ shape: 'grid', parts: 2, gridSize: [4, 2], cutMode: 'free' });
    const s = play(fractionCut, c, [act('cut', { dir: 'v', at: 0.47 })]);
    expect(s.rects.map((r) => r.x1)).toEqual([0.5, 1]);
    expect(passes('fraction.cut', cutTarget(2), fractionCut.toResponse(s))).toBe(true);
  });

  it('acceptNonCongruent: cuts inside one part make equal areas of different shapes', () => {
    // A 4 × 4 grid in fourths: two 1 × 4 strips on the left, two 2 × 2 squares on the right.
    const target = cutTarget(4, 1, { acceptNonCongruent: true });
    const c = cut({
      shape: 'grid',
      parts: 4,
      gridSize: [4, 4],
      cutMode: 'free',
      acceptNonCongruent: true,
      shade: 1,
    });
    const s = play(fractionCut, c, [
      act('cut', { dir: 'v', at: 0.5 }),
      act('cut', { dir: 'v', at: 0.25, part: 0 }),
      act('cut', { dir: 'h', at: 0.5, part: 2 }),
      act('shade', { part: 0 }),
    ]);
    expect(cutShares(s)).toEqual([0.25, 0.25, 0.25, 0.25]);
    const widths = s.rects.map((r) => r.x1 - r.x0);
    expect(new Set(widths).size).toBe(2); // not all the same shape
    expect(passes('fraction.cut', target, fractionCut.toResponse(s))).toBe(true);
    // Without acceptNonCongruent, `part` is ignored: every cut runs the full length.
    const strict = play(fractionCut, { ...c, acceptNonCongruent: false }, [
      act('cut', { dir: 'v', at: 0.5 }),
      act('cut', { dir: 'h', at: 0.5, part: 1 }),
    ]);
    expect(strict.rects).toHaveLength(4);
    expect(new Set(strict.rects.map((r) => r.x1 - r.x0)).size).toBe(1);
  });

  it('thenName: needs the typed name, which goes in the response', () => {
    const c = cut({ shape: 'bar', parts: 2, shade: 1, thenName: true });
    const t = cutTarget(2, 1, { thenName: true });
    const done = [act('cut', { line: 0 }), act('shade', { part: 1 })];
    expect(respond(fractionCut, c, done)).toBeNull();
    const r = respond(fractionCut, c, [...done, act('answer', { values: [1, 2] })]);
    expect(r).toEqual({ kind: 'state', value: { regions: [0.5, 0.5], shaded: [1], name: [1, 2] } });
    expect(passes('fraction.cut', t, r)).toBe(true);
    expect(
      passes(
        'fraction.cut',
        t,
        respond(fractionCut, c, [...done, act('answer', { values: [2, 1] })]),
      ),
    ).toBe(false);
  });

  it('separate and stack-parts are views: they toggle and never change the response', () => {
    const c = cut({ shape: 'circle', parts: 2 });
    const base = play(fractionCut, c, [act('cut', { line: 0 })]);
    const sep = fractionCut.apply(base, act('separate'));
    expect(sep.separated).toBe(true);
    const stack = fractionCut.apply(sep, act('stack-parts'));
    expect(stack).toMatchObject({ separated: false, stacked: true });
    expect(fractionCut.toResponse(stack)).toEqual(fractionCut.toResponse(base));
  });

  it('the response matches the generator’s exampleCorrect shape', () => {
    const s: FractionCutState = play(fractionCut, cut({ shape: 'square', parts: 4, shade: 1 }), [
      act('cut', { line: 0 }),
      act('cut', { line: 1 }),
      act('shade', { part: 0 }),
    ]);
    expect(fractionCut.toResponse(s)).toEqual({
      kind: 'state',
      value: { regions: [0.25, 0.25, 0.25, 0.25], shaded: [0] },
    });
  });
});

// ---------- fraction-pick ----------

describe('fraction-pick', () => {
  it('schema: fair-or-not has a fraction picture and no options; picks show ≥ 3 options', () => {
    expect(issuePaths(fractionPick, pickBase)).toEqual([]);
    expect(issuePaths(fractionPick, pictures)).toEqual([]);
    expect(issuePaths(fractionPick, { ...pickBase, stimulus: undefined })).toEqual(['stimulus']);
    expect(
      issuePaths(fractionPick, {
        ...pickBase,
        stimulus: { kind: 'expression', expr: { tokens: [] } },
      }),
    ).toEqual(['stimulus']);
    expect(issuePaths(fractionPick, { ...pickBase, options: pictures.options })).toEqual([
      'options',
    ]);
    expect(
      issuePaths(fractionPick, { ...pictures, options: pictures.options?.slice(0, 2) }),
    ).toEqual(['options']);
    const dup = pictures.options?.map((o) => ({ ...o, id: 'pic-0' }));
    expect(issuePaths(fractionPick, { ...pictures, options: dup })).toEqual(['options']);
    expect(
      issuePaths(fractionPick, {
        ...pictures,
        options: [...(pictures.options ?? []), { id: 'pic-3', label: '1/2' }],
      }),
    ).toEqual(['options.3.stimulus']);
    expect(issuePaths(fractionPick, { ...pictures, nameInput: 'pads' })).toEqual(['nameInput']);
    expect(
      issuePaths(fractionPick, {
        ...pickBase,
        stimulus: { ...halves, shaded: 3 },
      }),
    ).toEqual(['stimulus']);
  });

  it('schema: name with pads has no options; name with words picks ≥ 3', () => {
    const name: PickConfig = {
      format: 'fraction-pick',
      mode: 'name',
      stimulus: { ...halves, parts: 4, shaded: 3 },
      nameInput: 'pads',
    };
    expect(issuePaths(fractionPick, name)).toEqual([]);
    expect(issuePaths(fractionPick, { ...name, nameInput: undefined })).toEqual([]);
    const words: PickConfig = {
      ...name,
      nameInput: 'words',
      options: [
        { id: 'w-0', label: 'three fourths' },
        { id: 'w-1', label: 'one fourth' },
        { id: 'w-2', label: 'three halves' },
      ],
    };
    expect(issuePaths(fractionPick, words)).toEqual([]);
    expect(issuePaths(fractionPick, { ...words, options: words.options?.slice(0, 2) })).toEqual([
      'options',
    ]);
  });

  it('features: the largest denominator, non-unit, same numerator, equivalent, unequal distractor', () => {
    const answer: AnswerSpec = { kind: 'choice', id: 'pic-0' };
    // Find the halves: the unequal two-part picture is a distractor.
    expect(fractionPick.featureValues(pictures, answer)).toEqual({
      denominator: 2,
      nonUnit: 0,
      'compare.sameNumerator': 0,
      equivalent: 0,
      unequalDistractor: 1,
    });
    // Find the unequal one: no unequal distractor.
    expect(
      fractionPick.featureValues(pictures, { kind: 'choice', id: 'pic-2' }).unequalDistractor,
    ).toBe(0);
    const compare: PickConfig = {
      format: 'fraction-pick',
      mode: 'compare',
      options: [
        { id: 'a', stimulus: { ...halves, parts: 3, shaded: 2 } },
        { id: 'b', stimulus: { ...halves, parts: 5, shaded: 2 } },
        { id: 'same', label: '=' },
      ],
    };
    expect(fractionPick.featureValues(compare, { kind: 'choice', id: 'a' })).toMatchObject({
      denominator: 3,
      nonUnit: 1,
      'compare.sameNumerator': 1,
    });
    const equiv: PickConfig = {
      format: 'fraction-pick',
      mode: 'equivalent',
      stimulus: { ...halves, shaded: 1 },
      options: [
        { id: 'a', label: '2/4' },
        { id: 'b', label: '2/3' },
        { id: 'c', label: '1/3' },
      ],
    };
    expect(fractionPick.featureValues(equiv, { kind: 'choice', id: 'a' })).toMatchObject({
      denominator: 2,
      nonUnit: 1,
      equivalent: 1,
    });
    // Order-free: shuffling the options never changes a feature (03 §5.4).
    const shuffled = { ...pictures, options: [...(pictures.options ?? [])].reverse() };
    expect(fractionPick.featureValues(shuffled, answer)).toEqual(
      fractionPick.featureValues(pictures, answer),
    );
  });

  it('fair-or-not answers yes or no; other ids are ignored', () => {
    expect(pickChoices(pickBase)).toEqual(['yes', 'no']);
    expect(respond(fractionPick, pickBase, [])).toBeNull();
    expect(respond(fractionPick, pickBase, [act('answer', { id: 'maybe' })])).toBeNull();
    const r = respond(fractionPick, pickBase, [act('count-parts'), act('answer', { id: 'no' })]);
    expect(r).toEqual({ kind: 'choice', id: 'no' });
    expect(matches({ kind: 'choice', id: 'no' }, r as never)).toBe(true);
  });

  it('pick-picture answers an option id; a later pick replaces it', () => {
    const r = respond(fractionPick, pictures, [
      act('answer', { id: 'pic-1' }),
      act('answer', { id: 'pic-2' }),
    ]);
    expect(r).toEqual({ kind: 'choice', id: 'pic-2' });
    expect(respond(fractionPick, pictures, [act('answer', { id: 'yes' })])).toBeNull();
  });

  it('name with pads answers [a, b] in order (one pad at a time, or both)', () => {
    const name: PickConfig = {
      format: 'fraction-pick',
      mode: 'name',
      stimulus: { ...halves, parts: 4, shaded: 3 },
    };
    expect(respond(fractionPick, name, [act('answer', { value: 3 })])).toBeNull();
    const r = respond(fractionPick, name, [
      act('answer', { value: 4, slot: 1 }),
      act('answer', { value: 3, slot: 0 }),
    ]);
    expect(r).toEqual({ kind: 'numbers', values: [3, 4] });
    expect(matches({ kind: 'numbers', values: [3, 4], ordered: true }, r as never)).toBe(true);
    expect(
      respond(fractionPick, name, [act('answer', { values: [3, 4] }), act('answer', { id: 'x' })]),
    ).toEqual({ kind: 'numbers', values: [3, 4] });
  });

  it('demo ops are visual: highlight a real id, overlay a fraction, count the parts', () => {
    let s = play(fractionPick, pictures, [act('highlight', { id: 'pic-1' })]);
    expect(s.highlighted).toBe('pic-1');
    expect(fractionPick.apply(s, act('highlight', { id: 'nope' }))).toBe(s);
    s = play(fractionPick, pickBase, [act('overlay', { a: 1, b: 2 }), act('count-parts')]);
    expect(s).toMatchObject({ overlay: { a: 1, b: 2 }, counted: 1, choice: null });
    expect(fractionPick.apply(s, act('overlay')).overlay).toBeNull();
    expect(fractionPick.toResponse(s)).toBeNull();
  });
});

// ---------- fraction-line ----------

describe('fraction-line', () => {
  const partition = line({
    mode: 'partition',
    target: undefined,
    ticksShown: false,
    skin: 'strip',
  });

  it('schema: modes need (or must not have) a target; read points sit on a tick', () => {
    expect(issuePaths(fractionLine, lineBase)).toEqual([]);
    expect(issuePaths(fractionLine, partition)).toEqual([]);
    expect(issuePaths(fractionLine, { ...partition, denominator: 1 })).toEqual(['denominator']);
    expect(issuePaths(fractionLine, { ...partition, target: { a: 1, b: 2 } })).toEqual(['target']);
    expect(issuePaths(fractionLine, line({ target: undefined }))).toEqual(['target']);
    expect(issuePaths(fractionLine, line({ target: { a: 3, b: 2 } }))).toEqual(['target']);
    expect(issuePaths(fractionLine, line({ mode: 'read', target: { a: 1, b: 3 } }))).toContain(
      'target',
    );
    expect(
      issuePaths(fractionLine, line({ mode: 'read', denominator: 4, target: { a: 1, b: 2 } })),
    ).toEqual(['target.b']);
    expect(
      issuePaths(
        fractionLine,
        line({ mode: 'equivalent', denominator: 4, target: { a: 1, b: 2 } }),
      ),
    ).toEqual([]);
    expect(issuePaths(fractionLine, line({ denominator: 13 }))).toEqual(['denominator']);
    expect(issuePaths(fractionLine, line({ decimalLabels: true }))).toEqual(['decimalLabels']);
  });

  it('features follow the config; hidden ticks only count where ticks would help', () => {
    const a: AnswerSpec = { kind: 'state', checker: 'fraction.partition', target: {} };
    expect(fractionLine.featureValues(partition, a)).toEqual({
      denominator: 0,
      beyondOne: 0,
      'ticks.hidden': 0,
      'mode.partition': 1,
      'mode.read': 0,
      equivalent: 0,
    });
    expect(
      fractionLine.featureValues(
        line({ max: 2, denominator: 6, ticksShown: false, mode: 'read', target: { a: 1, b: 6 } }),
        a,
      ),
    ).toMatchObject({ denominator: 4, beyondOne: 1, 'ticks.hidden': 1, 'mode.read': 1 });
  });

  it('ticks sit at exact k/denominator positions', () => {
    expect(lineTicks(4, 1)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    const t = lineTicks(3, 2);
    expect(t).toHaveLength(7);
    for (const [k, x] of t.entries()) expect(x).toBe(k / 3);
  });

  it('partition {b} marks every part and passes fraction.partition', () => {
    for (const den of [2, 3, 4, 6, 8]) {
      for (const max of [1, 2, 3] as const) {
        const c = { ...partition, denominator: den, max };
        const r = respond(fractionLine, c, [act('partition', { b: den })]);
        expect(passes('fraction.partition', { denominator: den, max }, r), `${den} ${max}`).toBe(
          true,
        );
      }
    }
  });

  it('partition by hand: marks in any order, with a mark on a whole, pass (alternative end state)', () => {
    const t = { denominator: 4, max: 2 };
    const c = { ...partition, denominator: 4, max: 2 as const };
    const r = respond(fractionLine, c, [
      act('drop', { at: 1.75 }),
      act('drop', { at: 0.25 }),
      act('drop', { at: 1 }),
      act('drop', { at: 0.5 }),
      act('drop', { at: 1.25 }),
      act('drop', { at: 0.75 }),
      act('drop', { at: 1.5 }),
    ]);
    expect(passes('fraction.partition', t, r)).toBe(true);
    // A mark too few, or one taken away, fails; dropping the same mark twice is one mark.
    const fewer = respond(fractionLine, c, [
      act('partition', { b: 4 }),
      act('drop', { at: 0.26, remove: true }),
    ]);
    expect(passes('fraction.partition', t, fewer)).toBe(false);
    expect(
      play(fractionLine, c, [act('drop', { at: 0.5 }), act('drop', { at: 0.5 })]).cuts,
    ).toEqual([0.5]);
    // Off the line does nothing; nothing placed is not submittable.
    expect(play(fractionLine, c, [act('drop', { at: 2 }), act('drop', { at: 0 })]).cuts).toEqual(
      [],
    );
    expect(respond(fractionLine, c, [])).toBeNull();
  });

  it('place: drop or hop puts the point; the response is the value in units', () => {
    expect(respond(fractionLine, lineBase, [])).toBeNull();
    expect(respond(fractionLine, lineBase, [act('drop', { at: 0.5 })])).toEqual({
      kind: 'placement',
      value: 0.5,
    });
    const hops = respond(fractionLine, line({ denominator: 4, target: { a: 3, b: 4 } }), [
      act('hop', { k: 3 }),
    ]);
    expect(hops).toEqual({ kind: 'placement', value: 0.75 });
    expect(
      matches({ kind: 'placement', value: 0.75, min: 0, max: 1, tolerance: 0.125 }, hops as never),
    ).toBe(true);
    expect(respond(fractionLine, lineBase, [act('drop', { at: 4 })])).toEqual({
      kind: 'placement',
      value: 1,
    });
  });

  it('read and equivalent type a fraction; decimal labels type a decimal', () => {
    const read = line({ mode: 'read', denominator: 4, target: { a: 3, b: 4 } });
    expect(respond(fractionLine, read, [act('answer', { value: 3 })])).toBeNull();
    expect(
      respond(fractionLine, read, [
        act('answer', { value: 3 }),
        act('answer', { value: 4, slot: 1 }),
      ]),
    ).toEqual({ kind: 'numbers', values: [3, 4] });
    const eq = line({ mode: 'equivalent', denominator: 4, target: { a: 2, b: 4 } });
    const r = respond(fractionLine, eq, [act('answer', { values: [1, 2] })]);
    expect(
      matches(
        { kind: 'numbers', values: [2, 4], ordered: true, fraction: { equivalentOk: true } },
        r as never,
      ),
    ).toBe(true);
    const dec = line({
      mode: 'read',
      denominator: 10,
      decimalLabels: true,
      target: { a: 3, b: 10 },
    });
    expect(respond(fractionLine, dec, [act('answer', { value: 0.3 })])).toEqual({
      kind: 'number',
      value: 0.3,
    });
  });

  it('visual ops: label, hop and a partition hint outside partition mode', () => {
    const read = line({ mode: 'read', denominator: 4, target: { a: 3, b: 4 } });
    const s = play(fractionLine, read, [
      act('label', { a: 1, b: 4 }),
      act('label', { a: 1, b: 4 }),
      act('hop', { k: 3 }),
      act('partition', { b: 4 }),
    ]);
    expect(s).toMatchObject({ labels: [{ a: 1, b: 4 }], hops: 3, hintPartition: 4, cuts: [] });
    expect(fractionLine.toResponse(s)).toBeNull();
  });
});
