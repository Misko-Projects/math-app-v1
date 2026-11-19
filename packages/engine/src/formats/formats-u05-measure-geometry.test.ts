// 03 §6.3 format state models and 03 §5.5 configs, features and answer semantics for the U05
// measurement and geometry formats (#14): measure-length, compare-length, perimeter-walk,
// shape-compose and shape-sort. Every state response is also run through its 03 §5.7 checker, so
// the model and the checker agree, and real generated items (K01 generators) replay through them.

import {
  type AnswerSpec,
  FORMAT_SUPPORT,
  type ItemFormat,
  type ItemTemplate,
  type ParamValues,
  type ResponseValue,
  type StateCheckerId,
  type Tier,
  type WidgetAction,
  type WidgetConfig,
  type WidgetConfigOf,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import { initContent, resetContent } from '../content/binding';
import { NONSTANDARD_UNIT_SIZE } from '../generators/mea/length';
import { checkResponse } from '../items/check';
import { generateItemFromParams } from '../items/generate';
import { itemSolution, replaySteps } from '../items/solution';
import { closeness, compareLength } from './compare-length';
import { formatModel } from './index';
import { lengthIn, measureLength, UNIT_SIZE } from './measure-length';
import {
  cyclicPolygon,
  designRectangles,
  perimeterWalk,
  polygonPoints,
  resolvedSides,
  sidesMatch,
} from './perimeter-walk';
import { drawingPoints, pieceCentre, shapeCompose, turnAboutCentre } from './shape-compose';
import { shapeSort, sortCardProps } from './shape-sort';
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
): ResponseValue | null {
  return m.toResponse(play(m, config, ops));
}

function passes(id: StateCheckerId, target: Record<string, unknown>, r: ResponseValue | null) {
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

const H = Math.sqrt(3) / 2;

// ---------- easiest-case configs ----------

const ssFind: WidgetConfigOf<'shape-sort'> = {
  format: 'shape-sort',
  cards: [
    {
      id: 'c0',
      card: {
        id: 'c0',
        shape: 'triangle',
        props: {
          sides: 3,
          corners: 3,
          rightAngles: 0,
          equalSides: true,
          parallelPairs: 0,
          curved: false,
          closed: true,
          solid: false,
        },
        rotationDeg: 0,
        scale: 1,
        color: 'red',
      },
    },
    {
      id: 'c1',
      card: {
        id: 'c1',
        shape: 'square',
        props: {
          sides: 4,
          corners: 4,
          rightAngles: 4,
          equalSides: true,
          parallelPairs: 2,
          curved: false,
          closed: true,
          solid: false,
        },
        rotationDeg: 0,
        scale: 1,
        color: 'blue',
      },
    },
    { id: 'c2', card: { kind: 'object', sprite: 'rock', props: { weight: 'heavy' } } },
  ],
  bins: null,
  mode: 'find-all',
};
const ssSort: WidgetConfigOf<'shape-sort'> = {
  ...ssFind,
  mode: 'sort',
  bins: [
    {
      id: 'b0',
      label: 'shape.triangle.many',
      rule: { prop: 'shape', op: '==', value: 'triangle' },
    },
    { id: 'b1', label: 'shape.square.many', rule: { prop: 'shape', op: '==', value: 'square' } },
  ],
};
const sortTarget = {
  cards: ssSort.cards.map((c) => ({ id: c.id, props: sortCardProps(c.card) })),
  bins: (ssSort.bins ?? []).map((b) => ({ id: b.id, rule: b.rule })),
};

const clBase: WidgetConfigOf<'compare-length'> = {
  format: 'compare-length',
  objects: [
    { id: 'obj-0', sprite: 'rope', length: 1, offset: 0 },
    { id: 'obj-1', sprite: 'rope', length: 100, offset: 0 },
  ],
  ask: 'longer',
  aligned: true,
};

const mlRead: WidgetConfigOf<'measure-length'> = {
  format: 'measure-length',
  object: { sprite: 'plank', length: 4 },
  tool: 'ruler',
  unit: 'in',
  startOffset: 0,
  precision: 1,
  mode: 'read',
  input: 'pad',
};
const mlIterate: WidgetConfigOf<'measure-length'> = {
  ...mlRead,
  tool: 'units',
  unit: 'cube',
  mode: 'iterate',
};

const pwTotal: WidgetConfigOf<'perimeter-walk'> = {
  format: 'perimeter-walk',
  polygon: { sides: [5, 3, 5, 3], grid: true, shape: 'rect' },
  mode: 'total',
};

const scFill: WidgetConfigOf<'shape-compose'> = {
  format: 'shape-compose',
  mode: 'fill-outline',
  pieces: [{ id: 'p-triangle', kind: 'triangle', count: 2 }],
  outline: {
    points: [
      [0, 0],
      [1, 0],
      [1.5, H],
      [0.5, H],
    ],
  },
  showOutlineLines: true,
  rotationStep: 60,
};
const fillTarget = {
  outline: scFill.outline?.points,
  pieces: [{ kind: 'triangle', count: 2 }],
};

interface Row {
  model: AnyModel;
  config: WidgetConfig;
  answer: AnswerSpec;
  ops: WidgetAction[];
}

const ROWS: Row[] = [
  {
    model: shapeSort,
    config: ssFind,
    answer: { kind: 'state', checker: 'select.exactSet', target: { ids: ['c0'] } },
    ops: [act('drag-card', { id: 'c0' }), act('count-sides', { id: 'c0' })],
  },
  {
    model: compareLength,
    config: clBase,
    answer: { kind: 'choice', id: 'obj-1' },
    ops: [act('align'), act('highlight-difference'), act('answer', { id: 'obj-1' })],
  },
  {
    model: measureLength,
    config: mlRead,
    answer: { kind: 'number', value: 4 },
    ops: [act('align-zero'), act('read-end'), act('answer', { value: 4 })],
  },
  {
    model: perimeterWalk,
    config: pwTotal,
    answer: { kind: 'number', value: 16 },
    ops: [act('walk-side', { index: 0 }), act('trace'), act('answer', { value: 16 })],
  },
  {
    model: shapeCompose,
    config: scFill,
    answer: { kind: 'state', checker: 'compose.fill', target: fillTarget },
    ops: [
      act('rotate', { id: 'p-triangle' }),
      act('drag-piece', { id: 'p-triangle', to: [0, 0], rot: 0 }),
      act('drag-piece', { id: 'p-triangle', to: [1, 0], rot: 60 }),
    ],
  },
];

describe('U05 measurement and geometry models (03 §6.3)', () => {
  const rows = ROWS.map((r) => [r.model.format as string, r] as const);

  it.each(rows)('%s: the schema accepts the easiest valid config', (_f, r) => {
    expect(issuePaths(r.model, r.config)).toEqual([]);
  });

  it.each(rows)('%s: featureValues covers every 03 §5.5 feature, 0 when easiest', (f, r) => {
    const values = r.model.featureValues(r.config, r.answer);
    expect(Object.keys(values).sort()).toEqual(Object.keys(r.model.features).sort());
    // closeness is shorter ÷ longer: 0.01 for 1 against 100, never exactly 0 for real objects.
    const zero = Object.fromEntries(Object.keys(values).map((k) => [k, 0]));
    if (f === 'compare-length') expect({ ...values, closeness: 0 }).toEqual(zero);
    else expect(values).toEqual(zero);
  });

  it.each(rows)('%s: every feature has a non-zero weight and a doc', (_f, r) => {
    for (const [name, feat] of Object.entries(r.model.features as AnyModel['features'])) {
      expect(feat.weight, name).not.toBe(0);
      expect(feat.doc.length, name).toBeGreaterThan(0);
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
      {
        id: 42,
        bin: {},
        index: 'x',
        to: 'here',
        from: [1],
        rot: 'r',
        value: 'v',
        values: [1, 'a'],
      },
      { id: 'nope', index: -3, to: [Number.NaN, 1], at: Number.POSITIVE_INFINITY, slot: 99 },
      { index: 1.5, values: [], from: [0.5, 0], relation: 7 },
    ];
    for (const op of [...FORMAT_SUPPORT[f as ItemFormat].ops, 'answer']) {
      for (const args of junk) {
        expect(
          () => r.model.apply(s, act(op, args)),
          `${op} ${JSON.stringify(args)}`,
        ).not.toThrow();
      }
    }
    expect(r.model.toResponse(s)).toBeNull();
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

// ---------- shape-sort ----------

describe('shape-sort', () => {
  it('sort: drag-card moves a card between bins and back to the tray', () => {
    const r = respond(shapeSort, ssSort, [
      act('drag-card', { id: 'c0', bin: 'b1' }),
      act('drag-card', { id: 'c0', bin: 'b0' }),
      act('drag-card', { id: 'c1', bin: 'b1' }),
      act('drag-card', { id: 'c2', bin: 'b0' }),
      act('drag-card', { id: 'c2', bin: 'tray' }),
    ]);
    expect(r).toEqual({ kind: 'state', value: { bins: { b0: ['c0'], b1: ['c1'] } } });
    // The rock fits no bin and stays in the tray.
    expect(passes('sort.byRule', sortTarget, r)).toBe(true);
  });

  it('sort: a card in the wrong bin, or one left out, fails the checker', () => {
    const wrong = respond(shapeSort, ssSort, [
      act('drag-card', { id: 'c0', bin: 'b1' }),
      act('drag-card', { id: 'c1', bin: 'b1' }),
    ]);
    expect(passes('sort.byRule', sortTarget, wrong)).toBe(false);
    const missing = respond(shapeSort, ssSort, [act('drag-card', { id: 'c0', bin: 'b0' })]);
    expect(passes('sort.byRule', sortTarget, missing)).toBe(false);
    const removed = respond(shapeSort, ssSort, [
      act('drag-card', { id: 'c0', bin: 'b0' }),
      act('drag-card', { id: 'c1', bin: 'b1' }),
      act('drag-card', { id: 'c1', remove: true }),
    ]);
    expect(removed).toEqual({ kind: 'state', value: { bins: { b0: ['c0'], b1: [] } } });
  });

  it('sort: with overlapping bins either bin is right (alternative end state)', () => {
    const overlap: WidgetConfigOf<'shape-sort'> = {
      ...ssSort,
      bins: [
        { id: 'b0', label: 'word.sides', rule: { prop: 'sides', op: '>=', value: 4 } },
        { id: 'b1', label: 'word.corners', rule: { prop: 'equalSides', op: '==', value: true } },
      ],
    };
    const target = {
      cards: overlap.cards.slice(0, 2).map((c) => ({ id: c.id, props: sortCardProps(c.card) })),
      bins: (overlap.bins ?? []).map((b) => ({ id: b.id, rule: b.rule })),
    };
    const a = respond(shapeSort, overlap, [
      act('drag-card', { id: 'c0', bin: 'b1' }),
      act('drag-card', { id: 'c1', bin: 'b0' }),
    ]);
    const b = respond(shapeSort, overlap, [
      act('drag-card', { id: 'c0', bin: 'b1' }),
      act('drag-card', { id: 'c1', bin: 'b1' }),
    ]);
    expect(passes('sort.byRule', target, a)).toBe(true);
    expect(passes('sort.byRule', target, b)).toBe(true);
    expect(shapeSort.featureValues(overlap, { kind: 'choice', id: 'x' }).overlappingBins).toBe(1);
  });

  it('sort: an unknown bin or card does nothing; nothing placed is not submittable', () => {
    const s = play(shapeSort, ssSort, [
      act('drag-card', { id: 'c0', bin: 'b9' }),
      act('drag-card', { id: 'c9', bin: 'b0' }),
    ]);
    expect(shapeSort.toResponse(s)).toBeNull();
  });

  it('find-all: picks in order, takes back, and agrees with select.exactSet', () => {
    const r = respond(shapeSort, ssFind, [
      act('drag-card', { id: 'c1' }),
      act('drag-card', { id: 'c0' }),
      act('drag-card', { id: 'c0' }),
      act('drag-card', { id: 'c2' }),
      act('drag-card', { id: 'c2', remove: true }),
    ]);
    expect(r).toEqual({ kind: 'state', value: { ids: ['c1', 'c0'] } });
    expect(passes('select.exactSet', { ids: ['c0', 'c1'] }, r)).toBe(true);
    expect(passes('select.exactSet', { ids: ['c0'] }, r)).toBe(false);
    expect(respond(shapeSort, ssFind, [act('answer', { id: 'c2' })])).toEqual({
      kind: 'state',
      value: { ids: ['c2'] },
    });
  });

  it('odd-one-out answers the picked card id', () => {
    const odd: WidgetConfigOf<'shape-sort'> = { ...ssFind, mode: 'odd-one-out' };
    expect(respond(shapeSort, odd, [act('answer', { id: 'c2' })])).toEqual({
      kind: 'choice',
      id: 'c2',
    });
    expect(respond(shapeSort, odd, [act('drag-card', { id: 'c1' })])).toEqual({
      kind: 'choice',
      id: 'c1',
    });
    const s = play(shapeSort, odd, [act('highlight-attribute', { id: 'c0', prop: 'sides' })]);
    expect(s.highlight).toEqual({ id: 'c0', prop: 'sides' });
    expect(shapeSort.toResponse(s)).toBeNull();
  });

  it('features: cards, turned or resized shapes, near misses and bins', () => {
    const sq = ssFind.cards[1] as (typeof ssFind.cards)[number];
    const tilted = { ...sq, id: 'c3', card: { ...(sq.card as object), rotationDeg: 45 } };
    const open = {
      id: 'c4',
      card: {
        ...(sq.card as object),
        id: 'c4',
        shape: 'open-figure',
        props: { ...(sq.card as { props: object }).props, closed: false },
      },
    };
    const cfg = {
      ...ssSort,
      cards: [...ssSort.cards, tilted, open, { id: 'c5', card: { kind: 'number', value: 6 } }],
      bins: [
        ...(ssSort.bins ?? []),
        { id: 'b2', label: 'word.even', rule: { prop: 'even', op: '==', value: true } },
      ],
    } as WidgetConfigOf<'shape-sort'>;
    expect(issuePaths(shapeSort, cfg)).toEqual([]);
    expect(shapeSort.featureValues(cfg, { kind: 'choice', id: 'x' })).toEqual({
      cards: 2,
      nonPrototypical: 1,
      nearMiss: 1,
      overlappingBins: 0,
      'bins.over2': 1,
    });
  });

  it.each([
    ['duplicate card ids', { cards: [ssFind.cards[0], ssFind.cards[0]] }, 'cards'],
    ['sort without bins', { mode: 'sort' }, 'bins'],
    ['find-all with bins', { bins: ssSort.bins }, 'bins'],
    ['one bin', { mode: 'sort', bins: ssSort.bins?.slice(0, 1) }, 'bins'],
    [
      'odd-one-out with two cards',
      { mode: 'odd-one-out', cards: ssFind.cards.slice(0, 2) },
      'cards',
    ],
  ])('rejects %s', (_name, over, path) => {
    expect(issuePaths(shapeSort, { ...ssFind, ...over })).toContain(path);
  });
});

// ---------- compare-length ----------

describe('compare-length', () => {
  const order: WidgetConfigOf<'compare-length'> = {
    format: 'compare-length',
    objects: [
      { id: 'obj-0', sprite: 'rope', length: 7, offset: 0 },
      { id: 'obj-1', sprite: 'rope', length: 3, offset: 3 },
      { id: 'obj-2', sprite: 'rope', length: 5, offset: 0 },
    ],
    ask: 'order',
    aligned: false,
  };

  it('order: place fills slots, moves an object, and answers the lengths in slot order', () => {
    const s = play(compareLength, order, [
      act('place', { id: 'obj-0', slot: 0 }),
      act('place', { id: 'obj-1', slot: 1 }),
      act('place', { id: 'obj-1', slot: 2 }),
    ]);
    expect(compareLength.toResponse(s)).toBeNull();
    const r = compareLength.toResponse(
      compareLength.apply(s, act('place', { id: 'obj-2', slot: 1 })),
    );
    expect(r).toEqual({ kind: 'numbers', values: [7, 5, 3] });
    expect(
      respond(compareLength, order, [
        act('place', { id: 'obj-0', slot: 0 }),
        act('place', { id: 'obj-0', slot: -1 }),
      ]),
    ).toBeNull();
  });

  it('order: answer {values} fills the slots by length', () => {
    expect(respond(compareLength, order, [act('answer', { values: [3, 5, 7] })])).toEqual({
      kind: 'numbers',
      values: [3, 5, 7],
    });
    // Lengths that are not on the objects change nothing.
    expect(respond(compareLength, order, [act('answer', { values: [3, 5, 8] })])).toBeNull();
  });

  it('align slides objects to the start line (all without an id); indirect objects never move', () => {
    const one = play(compareLength, order, [act('align', { id: 'obj-1' })]);
    expect(one.aligned).toEqual(['obj-1']);
    expect(play(compareLength, order, [act('align')]).aligned).toEqual(['obj-0', 'obj-1', 'obj-2']);
    const indirect: WidgetConfigOf<'compare-length'> = {
      ...clBase,
      ask: 'indirect',
      aligned: false,
      objects: [
        { id: 'obj-0', sprite: 'log', length: 6, offset: 0 },
        { id: 'obj-1', sprite: 'log', length: 4, offset: 2 },
      ],
    };
    const s = play(compareLength, indirect, [
      act('align'),
      act('lay-string', { id: 'obj-0' }),
      act('lay-string', { id: 'obj-1' }),
      act('answer', { id: 'obj-0' }),
    ]);
    expect(s.aligned).toEqual([]);
    expect(s.strings).toEqual(['obj-0', 'obj-1']);
    expect(compareLength.toResponse(s)).toEqual({ kind: 'choice', id: 'obj-0' });
    expect(compareLength.featureValues(indirect, { kind: 'choice', id: 'obj-0' })).toMatchObject({
      misaligned: 0,
      indirect: 1,
    });
  });

  it('how-much-longer answers the typed number', () => {
    const diff: WidgetConfigOf<'compare-length'> = { ...clBase, ask: 'how-much-longer' };
    expect(respond(compareLength, diff, [act('answer', { value: 3 })])).toEqual({
      kind: 'number',
      value: 3,
    });
  });

  it('features: misaligned, closeness of the closest pair, objects and asks', () => {
    expect(
      compareLength.featureValues(order, { kind: 'numbers', values: [], ordered: true }),
    ).toEqual({
      misaligned: 1,
      closeness: 0.71,
      'objects.over2': 1,
      'ask.difference': 0,
      indirect: 0,
    });
    expect(closeness([4, 10, 9])).toBe(0.9);
  });

  it.each([
    ['one object', { objects: clBase.objects.slice(0, 1) }, 'objects'],
    [
      'equal lengths',
      { objects: [clBase.objects[0], { ...clBase.objects[0], id: 'obj-1' }] },
      'objects',
    ],
    [
      'an offset while aligned',
      { objects: [{ ...clBase.objects[0], offset: 2 }, clBase.objects[1]] },
      'objects.0.offset',
    ],
    [
      'three objects for how-much-longer',
      { ask: 'how-much-longer', objects: order.objects, aligned: false },
      'objects',
    ],
    [
      'a zero length',
      { objects: [{ ...clBase.objects[0], length: 0 }, clBase.objects[1]] },
      'objects.0.length',
    ],
  ])('rejects %s', (_name, over, path) => {
    expect(issuePaths(compareLength, { ...clBase, ...over })).toContain(path);
  });
});

// ---------- measure-length ----------

describe('measure-length', () => {
  it('UNIT_SIZE matches the generator’s NONSTANDARD_UNIT_SIZE (units drawn to scale)', () => {
    for (const [u, size] of Object.entries(NONSTANDARD_UNIT_SIZE)) {
      expect(UNIT_SIZE[u as keyof typeof UNIT_SIZE]).toBe(size);
    }
  });

  it('iterate: laid units (dragged slightly off a mark) plus the count pass units.iterate', () => {
    const cfg = { ...mlIterate, object: { sprite: 'plank', length: 3 } };
    const r = respond(measureLength, cfg, [
      act('lay-unit', { index: 0, at: 0.04 }),
      act('lay-unit', { index: 2, at: 2.06 }),
      act('lay-unit', { index: 1, at: 1.02 }),
      act('count-units'),
    ]);
    expect(r).toBeNull();
    const done = respond(measureLength, cfg, [
      act('lay-unit', { index: 0, at: 0.04 }),
      act('lay-unit', { index: 2, at: 2.06 }),
      act('lay-unit', { index: 1, at: 1.02 }),
      act('answer', { value: 3 }),
    ]);
    expect(done).toEqual({ kind: 'state', value: { units: [0.04, 1.02, 2.06], value: 3 } });
    expect(passes('units.iterate', { length: 3, gapTolerance: 0.1 }, done)).toBe(true);
  });

  it('iterate: a gap, a removed unit or a wrong count fails units.iterate', () => {
    const cfg = { ...mlIterate, object: { sprite: 'plank', length: 3 } };
    const target = { length: 3, gapTolerance: 0.1 };
    const gap = respond(measureLength, cfg, [
      act('lay-unit', { index: 0 }),
      act('lay-unit', { index: 1, at: 1.5 }),
      act('lay-unit', { index: 2, at: 2 }),
      act('answer', { value: 3 }),
    ]);
    expect(passes('units.iterate', target, gap)).toBe(false);
    const removed = respond(measureLength, cfg, [
      act('lay-unit', { index: 0 }),
      act('lay-unit', { index: 1 }),
      act('lay-unit', { index: 2 }),
      act('lay-unit', { index: 2, remove: true }),
      act('answer', { value: 3 }),
    ]);
    expect(removed).toEqual({ kind: 'state', value: { units: [0, 1], value: 3 } });
    expect(passes('units.iterate', target, removed)).toBe(false);
    // Moving a laid unit keeps one copy (same index).
    const moved = play(measureLength, cfg, [
      act('lay-unit', { index: 0, at: 2 }),
      act('lay-unit', { index: 0, at: 0 }),
    ]);
    expect(moved.units).toEqual([{ id: 'cube-0', unit: 'cube', at: 0 }]);
  });

  it('two-units: lays both units and answers both counts', () => {
    const cfg: WidgetConfigOf<'measure-length'> = {
      ...mlIterate,
      object: { sprite: 'rope', length: 4 },
      unit: 'shell',
      altUnit: 'stick',
      mode: 'two-units',
    };
    expect(issuePaths(measureLength, cfg)).toEqual([]);
    expect(lengthIn(cfg, 'stick')).toBe(2);
    expect(lengthIn(cfg, 'cube')).toBe(8);
    const s = play(measureLength, cfg, [
      act('lay-unit', { index: 0, unit: 'shell' }),
      act('lay-unit', { index: 0, unit: 'stick' }),
      act('lay-unit', { index: 0, unit: 'cube' }),
      act('count-units', { unit: 'shell' }),
      act('answer', { values: [4, 2] }),
    ]);
    expect(s.units.map((u) => u.id)).toEqual(['shell-0', 'stick-0']);
    expect(s.counted).toEqual(['shell']);
    expect(measureLength.toResponse(s)).toEqual({ kind: 'numbers', values: [4, 2] });
  });

  it('read: pad answers a number, tap-tick a placement, pick a choice', () => {
    const half: WidgetConfigOf<'measure-length'> = {
      ...mlRead,
      object: { sprite: 'plank', length: 40 },
      precision: 0.5,
      startOffset: 2,
    };
    expect(issuePaths(measureLength, half)).toEqual([]);
    const s = play(measureLength, half, [
      act('slide-ruler', { to: 0 }),
      act('answer', { value: 2.5 }),
    ]);
    expect(s.rulerStart).toBe(0);
    expect(measureLength.toResponse(s)).toEqual({ kind: 'number', value: 2.5 });
    expect(
      respond(measureLength, { ...half, input: 'tap-tick' }, [act('answer', { value: 4.5 })]),
    ).toEqual({ kind: 'placement', value: 4.5 });
    const pick: WidgetConfigOf<'measure-length'> = { ...mlRead, input: 'pick', options: [3, 4, 5] };
    expect(respond(measureLength, pick, [act('answer', { id: 'opt-4' })])).toEqual({
      kind: 'choice',
      id: 'opt-4',
    });
    expect(respond(measureLength, pick, [act('answer', { id: 'opt-9' })])).toBeNull();
    expect(measureLength.featureValues(half, { kind: 'number', value: 2.5 })).toMatchObject({
      offset: 1,
      'precision.half': 1,
      'precision.quarter': 0,
      'tool.units': 0,
    });
  });

  it('estimate picks an option', () => {
    const est: WidgetConfigOf<'measure-length'> = {
      ...mlRead,
      mode: 'estimate',
      input: 'pick',
      options: [2, 6, 12],
    };
    expect(respond(measureLength, est, [act('answer', { id: 'opt-6' })])).toEqual({
      kind: 'choice',
      id: 'opt-6',
    });
    expect(measureLength.featureValues(est, { kind: 'choice', id: 'opt-6' })['mode.estimate']).toBe(
      1,
    );
  });

  it.each([
    ['a fractional length', { object: { sprite: 'plank', length: 2.5 } }, 'object.length'],
    [
      'an end between marks',
      { precision: 0.5, object: { sprite: 'plank', length: 12 } },
      'object.length',
    ],
    ['units for read', { tool: 'units' }, 'tool'],
    ['a ruler for iterate', { mode: 'iterate' }, 'tool'],
    ['two-units with one unit', { tool: 'units', mode: 'two-units', unit: 'cube' }, 'altUnit'],
    [
      'two-units that do not fit',
      {
        tool: 'units',
        mode: 'two-units',
        unit: 'cube',
        altUnit: 'stick',
        object: { sprite: 'rope', length: 3 },
      },
      'altUnit',
    ],
    ['a pick with two options', { input: 'pick', options: [3, 4] }, 'options'],
    ['tap-tick on units', { tool: 'units', mode: 'iterate', input: 'tap-tick' }, 'input'],
  ])('rejects %s', (_name, over, path) => {
    expect(issuePaths(measureLength, { ...mlRead, ...over })).toContain(path);
  });
});

// ---------- perimeter-walk ----------

describe('perimeter-walk', () => {
  it('total: walks sides, labels them and answers the typed total', () => {
    const s = play(perimeterWalk, pwTotal, [
      act('walk-side', { index: 0 }),
      act('walk-side', { index: 0 }),
      act('add-label', { index: 3 }),
      act('walk-side', { index: 9 }),
    ]);
    expect(s.walked).toEqual([0]);
    expect(s.labelled).toEqual([3]);
    expect(play(perimeterWalk, pwTotal, [act('trace')]).walked).toEqual([0, 1, 2, 3]);
    expect(perimeterWalk.toResponse(perimeterWalk.apply(s, act('answer', { value: 16 })))).toEqual({
      kind: 'number',
      value: 16,
    });
  });

  it('missing-side: resolves the missing side of a rectangle, an L and a polygon', () => {
    const rect: WidgetConfigOf<'perimeter-walk'> = {
      ...pwTotal,
      polygon: { sides: [5, null, 5, 3], grid: false, shape: 'rect' },
      mode: 'missing-side',
      perimeter: 16,
    };
    expect(issuePaths(perimeterWalk, rect)).toEqual([]);
    expect(resolvedSides(rect)).toEqual([5, 3, 5, 3]);
    const l: WidgetConfigOf<'perimeter-walk'> = {
      ...rect,
      polygon: { sides: [6, 2, 4, 3, null, 5], grid: true, shape: 'L' },
      perimeter: 22,
    };
    expect(issuePaths(perimeterWalk, l)).toEqual([]);
    expect(resolvedSides(l)).toEqual([6, 2, 4, 3, 2, 5]);
    const poly: WidgetConfigOf<'perimeter-walk'> = {
      ...rect,
      polygon: { sides: [4, 4, null, 4, 4], grid: false, shape: 'poly' },
      perimeter: 21,
    };
    expect(issuePaths(perimeterWalk, poly)).toEqual([]);
    expect(resolvedSides(poly)).toEqual([4, 4, 5, 4, 4]);
    expect(perimeterWalk.featureValues(poly, { kind: 'number', value: 5 })).toEqual({
      sides: 1,
      missing: 1,
      'grid.off': 1,
      design: 0,
      'side.over10': 0,
    });
  });

  it('polygonPoints draws every side to scale (rect, L, convex polygons)', () => {
    const cases: WidgetConfigOf<'perimeter-walk'>[] = [
      pwTotal,
      { ...pwTotal, polygon: { sides: [6, 2, 4, 3, 2, 5], grid: true, shape: 'L' } },
      { ...pwTotal, polygon: { sides: [3, 4, 5], grid: false, shape: 'poly' } },
      { ...pwTotal, polygon: { sides: [5, 5, 5, 5, 5, 5], grid: false, shape: 'poly' } },
      // A long side puts the circle's centre outside the polygon.
      { ...pwTotal, polygon: { sides: [8, 3, 3, 3], grid: false, shape: 'poly' } },
      { ...pwTotal, polygon: { sides: [7, 2, 6, 3, 4], grid: false, shape: 'poly' } },
      // Extreme valid polygons (review CR-1.8): very narrow triangles (circumradius far above the
      // perimeter), a near-degenerate quadrilateral, and a long side last.
      { ...pwTotal, polygon: { sides: [999, 500, 500], grid: false, shape: 'poly' } },
      { ...pwTotal, polygon: { sides: [500, 500, 999], grid: false, shape: 'poly' } },
      { ...pwTotal, polygon: { sides: [1, 1, 1.99], grid: false, shape: 'poly' } },
      { ...pwTotal, polygon: { sides: [10, 3, 3, 4.1], grid: false, shape: 'poly' } },
      { ...pwTotal, polygon: { sides: [1, 50, 1, 50], grid: false, shape: 'poly' } },
    ];
    for (const c of cases) {
      const pts = polygonPoints(c);
      expect(pts, JSON.stringify(c.polygon.sides)).not.toBeNull();
      expect(sidesMatch(c, pts ?? []), JSON.stringify(c.polygon.sides)).toBe(true);
    }
    // A rectangle's corners are square and its top side is side 0.
    expect(polygonPoints(pwTotal)).toEqual([
      [0, 0],
      [5, 0],
      [5, 3],
      [0, 3],
    ]);
    expect(cyclicPolygon([1, 1, 1]).length).toBe(3);
  });

  it('design: the built rectangle passes rect.perimeterArea; alternatives too', () => {
    const design: WidgetConfigOf<'perimeter-walk'> = {
      ...pwTotal,
      polygon: { sides: [6, 2, 6, 2], grid: true, shape: 'rect' },
      mode: 'design',
      area: 12,
    };
    expect(issuePaths(perimeterWalk, design)).toEqual([]);
    const target = { area: 12, differentFrom: { w: 6, h: 2 } };
    const a = respond(perimeterWalk, design, [act('answer', { values: [4, 3] })]);
    expect(a).toEqual({ kind: 'state', value: { w: 4, h: 3 } });
    expect(passes('rect.perimeterArea', target, a)).toBe(true);
    // Another rectangle with area 12 (alternative end state), and a turned one.
    expect(
      passes(
        'rect.perimeterArea',
        target,
        respond(perimeterWalk, design, [act('answer', { values: [12, 1] })]),
      ),
    ).toBe(true);
    expect(
      passes(
        'rect.perimeterArea',
        target,
        respond(perimeterWalk, design, [act('answer', { values: [2, 6] })]),
      ),
    ).toBe(false);
    expect(respond(perimeterWalk, design, [act('answer', { values: [0, 3] })])).toBeNull();
    expect(designRectangles(design).map((r) => `${r.w}x${r.h}`)).toEqual([
      '1x12',
      '3x4',
      '4x3',
      '12x1',
    ]);
  });

  it.each([
    [
      'a rectangle with 3 sides',
      { polygon: { sides: [5, 3, 5], grid: true, shape: 'rect' } },
      'polygon.sides',
    ],
    [
      'unequal opposite sides',
      { polygon: { sides: [5, 3, 4, 3], grid: true, shape: 'rect' } },
      'polygon.sides',
    ],
    [
      'total with a missing side',
      { polygon: { sides: [5, null, 5, 3], grid: true, shape: 'rect' } },
      'polygon.sides',
    ],
    [
      'missing-side with no perimeter',
      { mode: 'missing-side', polygon: { sides: [5, null, 5, 3], grid: true, shape: 'rect' } },
      'perimeter',
    ],
    [
      'a perimeter that disagrees',
      {
        mode: 'missing-side',
        perimeter: 18,
        polygon: { sides: [5, null, 5, 3], grid: true, shape: 'rect' },
      },
      'perimeter',
    ],
    [
      'an L that does not close',
      { polygon: { sides: [6, 2, 4, 3, 3, 5], grid: true, shape: 'L' } },
      'polygon.sides',
    ],
    [
      'a polygon with a side too long',
      { polygon: { sides: [10, 2, 3], grid: true, shape: 'poly' } },
      'polygon.sides',
    ],
    ['design with no constraint', { mode: 'design' }, 'perimeter'],
    ['design no rectangle meets', { mode: 'design', perimeter: 7 }, 'perimeter'],
  ])('rejects %s', (_name, over, path) => {
    expect(issuePaths(perimeterWalk, { ...pwTotal, ...over })).toContain(path);
  });
});

// ---------- shape-compose ----------

describe('shape-compose', () => {
  it('fill-outline: two triangles fill the rhombus (compose.fill)', () => {
    const r = respond(shapeCompose, scFill, [
      act('drag-piece', { id: 'p-triangle', to: [0, 0] }),
      act('rotate', { id: 'p-triangle' }),
      act('drag-piece', { id: 'p-triangle', to: [1, 0] }),
    ]);
    expect(r).toEqual({
      kind: 'state',
      value: {
        pieces: [
          { kind: 'triangle', at: [0, 0], rot: 0 },
          { kind: 'triangle', at: [1, 0], rot: 60 },
        ],
      },
    });
    expect(passes('compose.fill', fillTarget, r)).toBe(true);
  });

  it('fill-outline: the same rhombus filled another way (alternative end state)', () => {
    // The second triangle placed by another corner: rot 180 with corner 0 at the top right.
    const r = respond(shapeCompose, scFill, [
      act('drag-piece', { id: 'p-triangle', to: [0, 0], rot: 0 }),
      act('drag-piece', { id: 'p-triangle', to: [1.5, H], rot: 180 }),
    ]);
    expect(passes('compose.fill', fillTarget, r)).toBe(true);
  });

  it('fill-outline: copies run out; a placed copy moves, turns about its centre and goes back', () => {
    let s = play(shapeCompose, scFill, [
      act('drag-piece', { id: 'p-triangle', to: [0, 0] }),
      act('drag-piece', { id: 'p-triangle', to: [3, 3] }),
      act('drag-piece', { id: 'p-triangle', to: [5, 5] }),
    ]);
    expect(s.placed.map((p) => p.id)).toEqual(['p-triangle:0', 'p-triangle:1']);
    s = shapeCompose.apply(s, act('drag-piece', { id: 'p-triangle:1', to: [1, 0], rot: 60 }));
    expect(passes('compose.fill', fillTarget, shapeCompose.toResponse(s))).toBe(true);
    const before = s.placed[1] as (typeof s.placed)[number];
    s = shapeCompose.apply(s, act('rotate', { id: 'p-triangle:1' }));
    const after = s.placed[1] as (typeof s.placed)[number];
    expect(after.rot).toBe(120);
    const [cx, cy] = pieceCentre(before);
    const [dx, dy] = pieceCentre(after);
    expect(dx).toBeCloseTo(cx, 6);
    expect(dy).toBeCloseTo(cy, 6);
    expect(turnAboutCentre(before, 60).rot).toBe(120);
    s = shapeCompose.apply(s, act('drag-piece', { id: 'p-triangle:0', remove: true }));
    expect(s.placed.map((p) => p.id)).toEqual(['p-triangle:1']);
    // The freed copy number is used again.
    s = shapeCompose.apply(s, act('drag-piece', { id: 'p-triangle', to: [0, 0] }));
    expect(s.placed.map((p) => p.id)).toEqual(['p-triangle:1', 'p-triangle:0']);
  });

  const relative: WidgetConfigOf<'shape-compose'> = {
    format: 'shape-compose',
    mode: 'place-relative',
    showOutlineLines: false,
    scene: { anchors: [{ id: 'a0', sprite: 'crate', at: [46, 34] }] },
    relation: { word: 'behind', anchor: 'a0', item: 'crab' },
    rotationStep: 90,
  };
  const relTarget = {
    word: 'behind',
    box: { x: 46, y: 34, w: 20, h: 20 },
    scene: { w: 100, h: 60 },
  };

  it('place-relative: the item centre and layer answer compose.relative', () => {
    const r = respond(shapeCompose, relative, [
      act('highlight-region', { relation: 'behind' }),
      act('drag-piece', { id: 'crab', to: [46, 34], rot: 0, layer: 'back' }),
    ]);
    expect(r).toEqual({ kind: 'state', value: { at: [46, 34], layer: 'back' } });
    expect(passes('compose.relative', relTarget, r)).toBe(true);
    // Another point on the crate, still behind it (alternative end state).
    const alt = respond(shapeCompose, relative, [
      act('drag-piece', { id: 'crab', to: [40, 27], layer: 'back' }),
    ]);
    expect(passes('compose.relative', relTarget, alt)).toBe(true);
    const front = respond(shapeCompose, relative, [
      act('drag-piece', { id: 'crab', to: [46, 34] }),
    ]);
    expect(front).toEqual({ kind: 'state', value: { at: [46, 34], layer: 'front' } });
    expect(passes('compose.relative', relTarget, front)).toBe(false);
    // Another sprite is not the item.
    expect(
      respond(shapeCompose, relative, [act('drag-piece', { id: 'fish', to: [1, 1] })]),
    ).toBeNull();
    expect(shapeCompose.featureValues(relative, { kind: 'choice', id: 'x' })).toMatchObject({
      'relation.frontBehind': 1,
      'relation.leftRight': 0,
      'outline.linesHidden': 0,
    });
  });

  const draw: WidgetConfigOf<'shape-compose'> = {
    format: 'shape-compose',
    mode: 'draw-on-grid',
    showOutlineLines: false,
    grid: { cols: 5, rows: 5 },
    require: { sides: 4, rightAngles: 4 },
    rotationStep: 90,
  };
  const drawTarget = { require: { sides: 4, rightAngles: 4 }, grid: { cols: 5, rows: 5 } };
  const edges = (pts: [number, number][]) =>
    pts.map((from, i) => act('draw-edge', { from, to: pts[(i + 1) % pts.length] }));

  it('draw-on-grid: a closed loop answers its corners in drawing order (grid.polygon)', () => {
    const r = respond(
      shapeCompose,
      draw,
      edges([
        [0, 1],
        [4, 1],
        [4, 3],
        [0, 3],
      ]),
    );
    expect(r).toEqual({
      kind: 'state',
      value: {
        points: [
          [0, 1],
          [4, 1],
          [4, 3],
          [0, 3],
        ],
      },
    });
    expect(passes('grid.polygon', drawTarget, r)).toBe(true);
    // A square drawn in another order and place is also right (alternative end state).
    const sq = respond(shapeCompose, draw, [
      act('draw-edge', { from: [1, 1], to: [3, 1] }),
      act('draw-edge', { from: [1, 3], to: [3, 3] }),
      act('draw-edge', { from: [3, 3], to: [3, 1] }),
      act('draw-edge', { from: [1, 1], to: [1, 3] }),
    ]);
    expect(passes('grid.polygon', drawTarget, sq)).toBe(true);
    expect(shapeCompose.featureValues(draw, { kind: 'choice', id: 'x' })['require.count']).toBe(1);
  });

  it('draw-on-grid: an open figure or a loose line never passes; drawing a line again erases it', () => {
    const open = respond(shapeCompose, draw, [
      act('draw-edge', { from: [0, 1], to: [4, 1] }),
      act('draw-edge', { from: [4, 1], to: [4, 3] }),
      act('draw-edge', { from: [4, 3], to: [0, 3] }),
    ]);
    expect(open).toEqual({
      kind: 'state',
      value: {
        points: [
          [0, 1],
          [4, 1],
          [4, 3],
          [0, 3],
          [4, 3],
          [4, 1],
          [0, 1],
        ],
      },
    });
    expect(passes('grid.polygon', drawTarget, open)).toBe(false);
    expect(passes('grid.polygon', { require: { sides: 4 } }, open)).toBe(false);
    // Two separate lines whose ends would close into a quadrilateral.
    const loose = respond(shapeCompose, draw, [
      act('draw-edge', { from: [0, 0], to: [4, 0] }),
      act('draw-edge', { from: [4, 4], to: [0, 4] }),
    ]);
    expect(passes('grid.polygon', { require: { sides: 4 } }, loose)).toBe(false);
    const erased = play(shapeCompose, draw, [
      ...edges([
        [0, 1],
        [4, 1],
        [4, 3],
        [0, 3],
      ]),
      act('draw-edge', { from: [0, 1], to: [0, 3] }),
    ]);
    expect(erased.edges).toHaveLength(3);
    // Off-grid or zero-length lines do nothing.
    expect(
      play(shapeCompose, draw, [
        act('draw-edge', { from: [0, 0], to: [5, 0] }),
        act('draw-edge', { from: [1, 1], to: [1, 1] }),
      ]).edges,
    ).toEqual([]);
    expect(drawingPoints([])).toEqual([]);
  });

  it('build-sticks: sticks run out', () => {
    const sticks: WidgetConfigOf<'shape-compose'> = {
      ...draw,
      mode: 'build-sticks',
      pieces: [
        { id: 'stick', kind: 'stick', count: 3 },
        { id: 'corner', kind: 'corner', count: 4 },
      ],
      require: { kind: 'triangle' },
    };
    expect(issuePaths(shapeCompose, sticks)).toEqual([]);
    const s = play(shapeCompose, sticks, [
      ...edges([
        [0, 0],
        [3, 0],
        [0, 3],
      ]),
      act('draw-edge', { from: [4, 4], to: [3, 4] }),
    ]);
    expect(s.edges).toHaveLength(3);
    expect(
      passes('grid.polygon', { require: { kind: 'triangle' } }, shapeCompose.toResponse(s)),
    ).toBe(true);
  });

  it.each([
    ['fill-outline without an outline', { outline: undefined }, 'outline'],
    [
      'an unknown piece kind',
      { pieces: [{ id: 'p-oval', kind: 'oval', count: 1 }] },
      'pieces.0.kind',
    ],
    ['duplicate piece ids', { pieces: [scFill.pieces?.[0], scFill.pieces?.[0]] }, 'pieces'],
    ['place-relative without a scene', { mode: 'place-relative' }, 'scene'],
    [
      'a relation to a missing anchor',
      {
        mode: 'place-relative',
        scene: relative.scene,
        relation: { ...relative.relation, anchor: 'a9' },
      },
      'relation.anchor',
    ],
    [
      'draw-on-grid without a requirement',
      { mode: 'draw-on-grid', grid: { cols: 5, rows: 5 } },
      'require',
    ],
    [
      'build-sticks without sticks',
      { mode: 'build-sticks', grid: { cols: 5, rows: 5 }, require: { sides: 3 }, pieces: [] },
      'pieces',
    ],
  ])('rejects %s', (_name, over, path) => {
    expect(issuePaths(shapeCompose, { ...scFill, ...over })).toContain(path);
  });
});

// ---------- real generated items replay through the models (K01 generators) ----------

let nextId = 0;
function tpl(
  generator: string,
  format: ItemFormat,
  tier: Tier,
  rep: string,
  params = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.u05.${nextId}`,
    skillId: 'X.01',
    format,
    tier,
    representation: rep,
    generator,
    params,
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  } as ItemTemplate;
}

describe('generated items replay through the U05 models', () => {
  beforeEach(() => {
    resetContent();
    initContent({ templates: [], narration: {}, misconceptions: [] });
  });

  const cases: [string, ItemTemplate, ParamValues][] = [
    [
      'shape-sort sort',
      tpl('geo.identify', 'shape-sort', 'concrete', 'pattern-blocks'),
      {
        set: '2d',
        rule: 'kind',
        mode: 'sort',
        kind: 'triangle',
        other: 'hexagon',
        cards: 5,
        bins: 2,
      },
    ],
    [
      'shape-sort find-all',
      tpl('geo.identify', 'shape-sort', 'pictorial', 'shapes'),
      {
        set: '2d',
        rule: 'kind',
        mode: 'find-all',
        kind: 'square',
        cards: 6,
        hits: 2,
        nonPrototypical: true,
      },
    ],
    [
      'shape-sort odd-one-out',
      tpl('geo.identify', 'shape-sort', 'pictorial', 'shapes'),
      { set: 'quads', rule: 'equal-sides', mode: 'odd-one-out', cards: 4 },
    ],
    [
      'compare-length order',
      tpl('mea.length', 'compare-length', 'concrete', 'objects'),
      { mode: 'order', ask: 'shorter', objects: 3, length: 4, length2: 9, length3: 6, offset: 3 },
    ],
    [
      'compare-length indirect',
      tpl('mea.length', 'compare-length', 'concrete', 'objects'),
      { mode: 'indirect', ask: 'longer', length: 7, length2: 4 },
    ],
    [
      'measure-length iterate',
      tpl('mea.length', 'measure-length', 'concrete', 'units'),
      { mode: 'iterate', unit: 'shell', length: 6 },
    ],
    [
      'measure-length two-units',
      tpl('mea.length', 'measure-length', 'pictorial', 'units'),
      { mode: 'two-units', unit: 'shell', altUnit: 'cube', length: 3 },
    ],
    [
      'shape-compose fill',
      tpl('geo.compose', 'shape-compose', 'pictorial', 'pattern-blocks'),
      { outline: 'hexagon-from-three-kinds', extra: true },
    ],
    [
      'shape-compose relative',
      tpl('geo.position', 'shape-compose', 'pictorial', 'objects'),
      { relation: 'behind', anchor: 'lantern', item: 'kite', scene: 'two' },
    ],
    [
      'shape-compose sticks',
      tpl('geo.draw', 'shape-compose', 'concrete', 'shapes'),
      { kind: 'rectangle', sides: 0, tool: 'sticks', grid: 5 },
    ],
  ];

  it.each(cases)('%s', (_name, t, params) => {
    const item = generateItemFromParams(t, params);
    const model = formatModel(item.widget.format) as AnyModel;
    expect(issuePaths(model, item.widget)).toEqual([]);
    const r = replaySteps(item, itemSolution(item, t));
    expect(r).not.toBeNull();
    expect(checkResponse(item, r as ResponseValue).correct).toBe(true);
  });
});
