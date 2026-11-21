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
import {
  CL_END_MAX,
  CL_LENGTH_MAX,
  CL_OBJECTS_MAX,
  CL_OFFSET_MAX,
  closeness,
  compareLength,
} from './compare-length';
import { formatModel } from './index';
import {
  lengthIn,
  ML_LAID_MAX,
  ML_LENGTH_MAX,
  ML_OFFSET_MAX,
  ML_OPTION_MAX,
  measureLength,
  UNIT_SIZE,
} from './measure-length';
import {
  cyclicPolygon,
  designRectangles,
  PW_DESIGN_AREA_MAX,
  PW_DESIGN_PERIMETER_MAX,
  PW_DESIGN_SIDE_MAX,
  PW_HEIGHT_MAX,
  PW_PERIMETER_MAX,
  PW_SIDE_MAX,
  PW_SIDES_MAX,
  perimeterWalk,
  polygonPoints,
  resolvedSides,
  sidesMatch,
} from './perimeter-walk';
import {
  drawingPoints,
  pieceCentre,
  SC_ANCHORS_MAX,
  SC_GRID_COLS_MAX,
  SC_GRID_ROWS_MAX,
  SC_OUTLINE_EXTENT_MAX,
  SC_OUTLINE_POINTS_MAX,
  SC_PIECES_MAX,
  SC_REQUIRE_MAX,
  shapeCompose,
  turnAboutCentre,
} from './shape-compose';
import {
  SS_BINS_MAX,
  SS_CARDS_MAX,
  SS_NUMBER_MAX,
  SS_PICK_CARDS_MAX,
  SS_ROTATION_MAX,
  SS_RULE_VALUE_MAX,
  SS_SCALE_MAX,
  SS_SCALE_MIN,
  shapeSort,
  sortCardProps,
} from './shape-sort';
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
    { id: 'obj-1', sprite: 'rope', length: 20, offset: 0 },
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
    // closeness is shorter ÷ longer: 0.05 for 1 against 20, never exactly 0 for real objects.
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
      grid: { cols: 6, rows: 3 },
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
        [2, 0],
        [0, 2],
      ]),
      act('draw-edge', { from: [5, 2], to: [4, 2] }),
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
      { kind: 'rectangle', sides: 0, tool: 'sticks', cols: 6, rows: 3 },
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

// ---------- the supported domain: a test per bound (PR #88) ----------

describe('supported domain: every numeric input of the five models has a bound', () => {
  /** The messages a config is refused with (empty when it is accepted). */
  const refusals = (m: AnyModel, config: unknown): string[] => {
    const r = m.configSchema.safeParse(config);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };
  const accepts = (m: AnyModel, config: unknown) => expect(refusals(m, config)).toEqual([]);
  const refuses = (m: AnyModel, config: unknown, message: RegExp) =>
    expect(refusals(m, config).join(' | ')).toMatch(message);

  describe('measure-length', () => {
    const ruler = (length: number, startOffset = 0) => ({
      ...mlRead,
      unit: 'cm' as const,
      object: { sprite: 'plank' as const, length },
      startOffset,
    });
    it('the object is at most ML_LENGTH_MAX units long', () => {
      accepts(measureLength, ruler(ML_LENGTH_MAX));
      refuses(measureLength, ruler(ML_LENGTH_MAX + 1), /at most 30 units long; got 31/);
      // In sixteenths below precision 1: 30 units is 480 sixteenths.
      accepts(measureLength, { ...ruler(ML_LENGTH_MAX * 16), precision: 0.5 });
      refuses(
        measureLength,
        { ...ruler((ML_LENGTH_MAX + 1) * 16), precision: 0.5 },
        /at most 30 units long/,
      );
    });
    it('startOffset is at most ML_OFFSET_MAX, on a mark, and the object ends on the ruler', () => {
      accepts(measureLength, ruler(20, ML_OFFSET_MAX));
      refuses(measureLength, ruler(4, ML_OFFSET_MAX + 1), /startOffset is at most 10/);
      refuses(measureLength, ruler(25, 6), /the object ends by 30; got 6 \+ 25/);
      refuses(measureLength, ruler(4, 0.5), /starts on a ruler mark/);
      accepts(measureLength, { ...ruler(4 * 16, 0.5), precision: 0.5 });
    });
    it('at most ML_LAID_MAX units of a kind are laid', () => {
      const lay = (length: number) => ({ ...mlIterate, object: { ...mlIterate.object, length } });
      accepts(measureLength, lay(ML_LAID_MAX));
      refuses(measureLength, lay(ML_LAID_MAX + 1), /at most 16 units of a kind are laid; got 17/);
      const two = (length: number) => ({
        ...lay(length),
        mode: 'two-units' as const,
        unit: 'stick' as const,
        altUnit: 'cube' as const,
      });
      // 4 sticks are 16 cubes; 5 sticks would be 20 cubes to lay.
      accepts(measureLength, two(4));
      refuses(measureLength, two(5), /at most 16 units of a kind are laid; got 20/);
    });
    it('a pick shows at most ML_OPTIONS_MAX options, each from 0 to ML_OPTION_MAX', () => {
      const pick = (options: number[]) => ({ ...mlRead, input: 'pick' as const, options });
      accepts(measureLength, pick([1, 2, 3, ML_OPTION_MAX]));
      refuses(measureLength, pick([1, 2, 3, 4, 5]), /at most 4 options fit; got 5/);
      refuses(measureLength, pick([1, 2, ML_OPTION_MAX + 1]), /from 0 to 99; got 100/);
      refuses(measureLength, pick([-1, 2, 3]), /from 0 to 99; got -1/);
    });
  });

  describe('compare-length', () => {
    const two = (length: number, offset = 0) => ({
      ...clBase,
      aligned: false,
      objects: [
        { id: 'obj-0', sprite: 'rope' as const, length: 1, offset: 0 },
        { id: 'obj-1', sprite: 'rope' as const, length, offset },
      ],
    });
    it('two to CL_OBJECTS_MAX objects', () => {
      const n = (count: number) => ({
        ...clBase,
        ask: 'order' as const,
        objects: Array.from({ length: count }, (_, i) => ({
          id: `obj-${i}`,
          sprite: 'rope' as const,
          length: i + 1,
          offset: 0,
        })),
      });
      accepts(compareLength, n(CL_OBJECTS_MAX));
      refuses(compareLength, n(CL_OBJECTS_MAX + 1), /two to 3 objects; got 4/);
    });
    it('lengths and offsets are whole numbers: the pad cannot type 1.5 (review round 1)', () => {
      const pair = (length: number, offset: number) => ({
        ...clBase,
        aligned: false,
        ask: 'how-much-longer' as const,
        objects: [
          { id: 'obj-0', sprite: 'rope' as const, length: 4, offset: 0 },
          { id: 'obj-1', sprite: 'rope' as const, length, offset },
        ],
      });
      accepts(compareLength, pair(2, 1));
      refuses(compareLength, pair(2.5, 0), /whole numbers of units; got 2.5 at 0/);
      refuses(compareLength, pair(2, 0.5), /whole numbers of units; got 2 at 0.5/);
    });
    it('an object is at most CL_LENGTH_MAX units long', () => {
      accepts(compareLength, two(CL_LENGTH_MAX));
      refuses(compareLength, two(CL_LENGTH_MAX + 1), /at most 20 units long; got 21/);
    });
    it('an offset is at most CL_OFFSET_MAX and the object ends by CL_END_MAX', () => {
      accepts(compareLength, two(CL_END_MAX - CL_OFFSET_MAX, CL_OFFSET_MAX));
      refuses(compareLength, two(2, CL_OFFSET_MAX + 1), /offset is at most 8/);
      refuses(compareLength, two(CL_LENGTH_MAX, 5), /ends by 24; got 5 \+ 20/);
    });
  });

  describe('perimeter-walk', () => {
    const rect = (w: number, h: number) => ({
      ...pwTotal,
      polygon: { sides: [w, h, w, h], grid: true, shape: 'rect' as const },
    });
    it('a side is at most PW_SIDE_MAX, and whole on a grid', () => {
      accepts(perimeterWalk, rect(PW_SIDE_MAX, 15));
      refuses(perimeterWalk, rect(PW_SIDE_MAX + 1, 15), /at most 20 units long; got 21/);
      refuses(perimeterWalk, rect(4.5, 2), /whole number of units.*got 4.5/);
      // Off the grid too: three sides of 4.5 would ask for 13.5, which the pad cannot type.
      refuses(
        perimeterWalk,
        { ...pwTotal, polygon: { sides: [4.5, 4.5, 4.5], grid: false, shape: 'poly' as const } },
        /whole number of units.*got 4.5/,
      );
      accepts(perimeterWalk, {
        ...pwTotal,
        polygon: { sides: [4, 4, 4], grid: false, shape: 'poly' as const },
      });
    });
    it('the side a child has to find obeys the same bounds (review round 1)', () => {
      const missing = (sides: (number | null)[], perimeter: number, grid: boolean) => ({
        ...pwTotal,
        mode: 'missing-side' as const,
        polygon: { sides, grid, shape: 'poly' as const },
        perimeter,
      });
      // 48 - 15 - 12 = 21: longer than a side may be, though the figure fits 20 x 15.
      refuses(
        perimeterWalk,
        missing([15, 12, null], 48, false),
        /missing side is at most 20 units long; got 21/,
      );
      // 17.5 - 6 - 6 = 5.5: not a whole number.
      refuses(perimeterWalk, missing([6, 6, null], 17.5, true), /perimeter is a whole number/);
      refuses(perimeterWalk, missing([6, 6, null], 17.5, true), /missing side is a whole number/);
      accepts(perimeterWalk, missing([15, 12, null], 47, false));
    });
    it('the figure as drawn is at most PW_SIDE_MAX wide and PW_HEIGHT_MAX tall', () => {
      accepts(perimeterWalk, rect(PW_SIDE_MAX, PW_HEIGHT_MAX));
      refuses(perimeterWalk, rect(PW_SIDE_MAX, PW_HEIGHT_MAX + 1), /at most 20 wide and 15 tall/);
      // A regular hexagon with sides of 20 would be about 35 tall.
      refuses(
        perimeterWalk,
        {
          ...pwTotal,
          polygon: { sides: [20, 20, 20, 20, 20, 20], grid: false, shape: 'poly' as const },
        },
        /at most 20 wide and 15 tall; got/,
      );
    });
    it('a figure has at most PW_SIDES_MAX sides', () => {
      const poly = (n: number) => ({
        ...pwTotal,
        polygon: { sides: Array.from({ length: n }, () => 4), grid: false, shape: 'poly' as const },
      });
      accepts(perimeterWalk, poly(PW_SIDES_MAX));
      refuses(perimeterWalk, poly(PW_SIDES_MAX + 1), /at most 6 sides; got 7/);
    });
    it('the perimeter is from 1 to PW_PERIMETER_MAX', () => {
      const missing = (perimeter: number) => ({
        ...pwTotal,
        mode: 'missing-side' as const,
        polygon: { sides: [5, 3, 5, null], grid: true, shape: 'rect' as const },
        perimeter,
      });
      accepts(perimeterWalk, missing(16));
      refuses(perimeterWalk, missing(PW_PERIMETER_MAX + 1), /from 1 to 120; got 121/);
      refuses(perimeterWalk, missing(0), /from 1 to 120; got 0/);
    });
    it('design: perimeter, area and every rectangle to build stay on the grid', () => {
      const design = (extra: { perimeter?: number; area?: number }) => ({
        ...pwTotal,
        mode: 'design' as const,
        polygon: { sides: [], grid: true, shape: 'rect' as const },
        ...extra,
      });
      accepts(perimeterWalk, design({ area: 12 }));
      // 36 squares as 12 × 3 or 9 × 4; a 6 × 6 is taller than the grid's five rows.
      accepts(perimeterWalk, design({ area: PW_DESIGN_AREA_MAX, perimeter: 30 }));
      accepts(perimeterWalk, design({ area: PW_DESIGN_AREA_MAX, perimeter: 26 }));
      refuses(
        perimeterWalk,
        design({ area: PW_DESIGN_AREA_MAX, perimeter: 24 }),
        /fits 12 × 5 squares/,
      );
      refuses(perimeterWalk, design({ area: PW_DESIGN_AREA_MAX + 1 }), /from 1 to 36; got 37/);
      refuses(perimeterWalk, design({ area: 2.5 }), /whole number from 1 to 36; got 2.5/);
      refuses(
        perimeterWalk,
        design({ perimeter: PW_DESIGN_PERIMETER_MAX + 2 }),
        /from 1 to 48; got 50/,
      );
      // Perimeter 30 alone allows a 14 × 1 rectangle: wider than the grid.
      refuses(perimeterWalk, design({ perimeter: 30 }), /fits 12 × 5 squares/);
      refuses(perimeterWalk, design({ perimeter: 2 * (PW_DESIGN_SIDE_MAX + 1) }), /fits 12 × 5/);
      accepts(perimeterWalk, design({ perimeter: 12 }));
      refuses(perimeterWalk, { ...rect(5, 3), area: 15 }, /only design gives an area/);
      refuses(
        perimeterWalk,
        { ...design({ area: 12 }), polygon: { sides: [13, 1, 13, 1], grid: true, shape: 'rect' } },
        /at most 12 units long; got 13/,
      );
    });
  });

  describe('shape-compose', () => {
    const fill = (
      pieces: {
        kind: 'triangle' | 'square' | 'rhombus' | 'hexagon' | 'trapezoid';
        count: number;
      }[],
    ) => ({
      ...scFill,
      pieces: pieces.map((p) => ({ id: `p-${p.kind}`, ...p })),
    });
    it('fill-outline offers at most SC_PIECE_KINDS_MAX kinds and SC_PIECES_MAX pieces', () => {
      accepts(
        shapeCompose,
        fill([
          { kind: 'triangle', count: 3 },
          { kind: 'square', count: 3 },
          { kind: 'rhombus', count: 3 },
          { kind: 'hexagon', count: 3 },
        ]),
      );
      refuses(
        shapeCompose,
        fill([
          { kind: 'triangle', count: 1 },
          { kind: 'square', count: 1 },
          { kind: 'rhombus', count: 1 },
          { kind: 'hexagon', count: 1 },
          { kind: 'trapezoid', count: 1 },
        ]),
        /at most 4 kinds of piece fit the tray; got 5/,
      );
      refuses(
        shapeCompose,
        fill([{ kind: 'triangle', count: SC_PIECES_MAX + 1 }]),
        /at most 12 pieces; got 13/,
      );
    });
    it('an outline has at most SC_OUTLINE_POINTS_MAX corners, SC_OUTLINE_EXTENT_MAX across', () => {
      const box = (w: number) => ({
        ...scFill,
        outline: {
          points: [
            [0, 0],
            [w, 0],
            [w, 1],
            [0, 1],
          ] as [number, number][],
        },
      });
      accepts(shapeCompose, box(SC_OUTLINE_EXTENT_MAX));
      refuses(shapeCompose, box(SC_OUTLINE_EXTENT_MAX + 1), /at most 5 block sides across; got 6/);
      const ring = (n: number) => ({
        ...scFill,
        outline: {
          points: Array.from({ length: n }, (_, i): [number, number] => [
            2 * Math.cos((2 * Math.PI * i) / n),
            2 * Math.sin((2 * Math.PI * i) / n),
          ]),
        },
      });
      accepts(shapeCompose, ring(SC_OUTLINE_POINTS_MAX));
      refuses(shapeCompose, ring(SC_OUTLINE_POINTS_MAX + 1), /at most 16 corners; got 17/);
    });
    const draw = (
      cols: number,
      rows: number,
      require: { sides?: number; rightAngles?: number },
    ) => ({
      format: 'shape-compose' as const,
      mode: 'draw-on-grid' as const,
      grid: { cols, rows },
      require,
      showOutlineLines: false,
      rotationStep: 90 as const,
    });
    it('a dot grid is at most SC_GRID_COLS_MAX × SC_GRID_ROWS_MAX', () => {
      accepts(shapeCompose, draw(SC_GRID_COLS_MAX, SC_GRID_ROWS_MAX, { sides: 3 }));
      refuses(
        shapeCompose,
        draw(SC_GRID_COLS_MAX + 1, 3, { sides: 3 }),
        /at most 6 × 3; got 7 × 3/,
      );
      refuses(
        shapeCompose,
        draw(5, SC_GRID_ROWS_MAX + 1, { sides: 3 }),
        /at most 6 × 3; got 5 × 4/,
      );
    });
    it('a required count of sides or right angles is at most SC_REQUIRE_MAX', () => {
      accepts(shapeCompose, draw(6, 3, { sides: SC_REQUIRE_MAX }));
      refuses(shapeCompose, draw(6, 3, { sides: SC_REQUIRE_MAX + 1 }), /sides is at most 8; got 9/);
      refuses(
        shapeCompose,
        draw(6, 3, { rightAngles: SC_REQUIRE_MAX + 1 }),
        /rightAngles is at most 8; got 9/,
      );
    });
    it('build-sticks offers at most SC_STICKS_MAX sticks and corners', () => {
      const sticks = (stick: number, corner: number) => ({
        ...draw(6, 3, { sides: 3 }),
        mode: 'build-sticks' as const,
        pieces: [
          { id: 'stick', kind: 'stick' as const, count: stick },
          { id: 'corner', kind: 'corner' as const, count: corner },
        ],
      });
      accepts(shapeCompose, sticks(12, 8));
      refuses(shapeCompose, sticks(12, 9), /at most 20 sticks and corners; got 21/);
    });
    it('a scene has at most SC_ANCHORS_MAX anchors', () => {
      const scene = (n: number) => ({
        format: 'shape-compose' as const,
        mode: 'place-relative' as const,
        scene: {
          anchors: Array.from({ length: n }, (_, i) => ({
            id: `a${i}`,
            sprite: 'crate' as const,
            at: [20 + 20 * i, 30] as [number, number],
          })),
        },
        relation: { word: 'above' as const, anchor: 'a0', item: 'crab' as const },
        showOutlineLines: false,
        rotationStep: 90 as const,
      });
      accepts(shapeCompose, scene(SC_ANCHORS_MAX));
      refuses(shapeCompose, scene(SC_ANCHORS_MAX + 1), /at most 2 anchors; got 3/);
    });
  });

  describe('shape-sort', () => {
    const shapeCard = ssFind.cards[0] as (typeof ssFind.cards)[number];
    const withCards = (n: number) => ({
      ...ssFind,
      cards: Array.from({ length: n }, (_, i) => ({ ...shapeCard, id: `c${i}` })),
    });
    const withFirst = (card: unknown) => ({
      ...ssFind,
      cards: [{ id: 'c0', card }, ...ssFind.cards.slice(1)],
    });
    it('at most SS_CARDS_MAX cards in a sort, SS_PICK_CARDS_MAX in a find-all or odd-one-out', () => {
      const sort = (n: number) => ({ ...withCards(n), mode: 'sort' as const, bins: ssSort.bins });
      accepts(shapeSort, sort(SS_CARDS_MAX));
      refuses(shapeSort, sort(SS_CARDS_MAX + 1), /at most 9 cards fit a sort; got 10/);
      accepts(shapeSort, withCards(SS_PICK_CARDS_MAX));
      refuses(shapeSort, withCards(SS_PICK_CARDS_MAX + 1), /at most 7 cards fit a find-all; got 8/);
      refuses(
        shapeSort,
        { ...withCards(SS_PICK_CARDS_MAX + 1), mode: 'odd-one-out' as const },
        /at most 7 cards fit a odd-one-out; got 8/,
      );
    });
    it('at most SS_BINS_MAX bins', () => {
      const bins = (n: number) => ({
        ...ssSort,
        bins: Array.from({ length: n }, (_, i) => ({
          id: `b${i}`,
          label: 'shape.triangle.many' as const,
          rule: { prop: 'sides', op: '==' as const, value: i + 3 },
        })),
      });
      accepts(shapeSort, bins(SS_BINS_MAX));
      refuses(shapeSort, bins(SS_BINS_MAX + 1), /at most 3 bins fit; got 4/);
    });
    it('a shape card is SS_SCALE_MIN to SS_SCALE_MAX of its prototype, turned ≤ 360°', () => {
      const card = shapeCard.card;
      accepts(
        shapeSort,
        withFirst({ ...card, scale: SS_SCALE_MIN, rotationDeg: -SS_ROTATION_MAX }),
      );
      accepts(shapeSort, withFirst({ ...card, scale: SS_SCALE_MAX, rotationDeg: SS_ROTATION_MAX }));
      refuses(shapeSort, withFirst({ ...card, scale: 0.4 }), /scale is from 0.5 to 2; got 0.4/);
      refuses(shapeSort, withFirst({ ...card, scale: 2.5 }), /scale is from 0.5 to 2; got 2.5/);
      refuses(shapeSort, withFirst({ ...card, rotationDeg: 361 }), /at most 360° either way/);
    });
    it('a number card is a whole number from 0 to SS_NUMBER_MAX', () => {
      accepts(shapeSort, withFirst({ kind: 'number', value: SS_NUMBER_MAX }));
      refuses(shapeSort, withFirst({ kind: 'number', value: SS_NUMBER_MAX + 1 }), /got 1000/);
      refuses(shapeSort, withFirst({ kind: 'number', value: -1 }), /from 0 to 999; got -1/);
      refuses(shapeSort, withFirst({ kind: 'number', value: 2.5 }), /whole number/);
    });
    it('a bin rule compares with numbers up to SS_RULE_VALUE_MAX, nested rules too', () => {
      const rule = (value: number) => ({
        ...ssSort,
        bins: [
          {
            id: 'b0',
            label: 'shape.triangle.many' as const,
            rule: { any: [{ all: [{ prop: 'sides', op: '>=' as const, value }] }] },
          },
          ...(ssSort.bins ?? []).slice(1),
        ],
      });
      accepts(shapeSort, rule(SS_RULE_VALUE_MAX));
      refuses(shapeSort, rule(SS_RULE_VALUE_MAX + 1), /numbers up to 999; got 1000/);
    });
  });

  it('undo ops: a slid object goes back to where it started; a walked side is un-walked', () => {
    const offset = {
      ...clBase,
      aligned: false,
      objects: [
        { id: 'obj-0', sprite: 'rope' as const, length: 5, offset: 2 },
        { id: 'obj-1', sprite: 'rope' as const, length: 8, offset: 0 },
      ],
    };
    let s = play(compareLength, offset, [act('align', { id: 'obj-0' })]);
    expect(s.aligned).toEqual(['obj-0']);
    s = compareLength.apply(s, act('align', { id: 'obj-0', remove: true }));
    expect(s.aligned).toEqual([]);
    // Removing one that was never slid, or an unknown id, changes nothing.
    expect(compareLength.apply(s, act('align', { id: 'obj-1', remove: true }))).toEqual(s);
    expect(compareLength.apply(s, act('align', { id: 'nope', remove: true }))).toBe(s);

    let w = play(perimeterWalk, pwTotal, [
      act('walk-side', { index: 0 }),
      act('walk-side', { index: 2 }),
    ]);
    expect(w.walked).toEqual([0, 2]);
    w = perimeterWalk.apply(w, act('walk-side', { index: 0, remove: true }));
    expect(w.walked).toEqual([2]);
    expect(perimeterWalk.apply(w, act('walk-side', { index: 1, remove: true })).walked).toEqual([
      2,
    ]);
    expect(perimeterWalk.apply(w, act('walk-side', { index: 9, remove: true }))).toBe(w);
  });

  it('slide-ruler keeps the ruler under the object (review round 1)', () => {
    const s = measureLength.initialState(mlRead);
    expect(measureLength.apply(s, act('slide-ruler', { to: -3 })).rulerStart).toBe(0);
    expect(measureLength.apply(s, act('slide-ruler', { to: 7 })).rulerStart).toBe(7);
    expect(measureLength.apply(s, act('slide-ruler', { to: 999 })).rulerStart).toBe(ML_LENGTH_MAX);
  });

  it('every refusal names the bound and the value it got (a clear message)', () => {
    const cases: [AnyModel, unknown][] = [
      [measureLength, { ...mlIterate, object: { sprite: 'plank', length: 99 } }],
      [
        compareLength,
        { ...clBase, objects: [clBase.objects[0], { ...clBase.objects[1], length: 99 }] },
      ],
      [
        perimeterWalk,
        { ...pwTotal, polygon: { sides: [99, 3, 99, 3], grid: true, shape: 'rect' } },
      ],
      [shapeCompose, { ...scFill, pieces: [{ id: 'p', kind: 'triangle', count: 99 }] }],
    ];
    for (const [m, config] of cases) {
      const messages = refusals(m, config);
      expect(messages.length).toBeGreaterThan(0);
      for (const text of messages) expect(text).toMatch(/at most \d+.*got 99/);
    }
  });
});
