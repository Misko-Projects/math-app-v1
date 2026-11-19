// 03 §6.3 format state models and 03 §5.5 configs, features and answer semantics for the U05
// patterns and data formats (#14): pattern-extend, bar-graph-read and bar-graph-build. Every state
// response is also run through its 03 §5.7 checker (pattern.tokens, pattern.isomorphic,
// select.exactSet, chart.values), so the model and the checker agree.

import {
  type AnswerSpec,
  type ChartSpec,
  FORMAT_SUPPORT,
  type ItemFormat,
  type StateCheckerId,
  type WidgetAction,
  type WidgetConfig,
  type WidgetConfigOf,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import { barGraphBuild, buildTargets } from './bar-graph-build';
import { barGraphRead } from './bar-graph-read';
import {
  axisTicks,
  axisTop,
  chartSlots,
  linePositions,
  positionId,
  slotValues,
  symbolParts,
  tallyGroups,
} from './chart';
import { formatModel } from './index';
import { additiveTable, firstStep, patternExtend, smallestPeriod } from './pattern-extend';
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

// ---------- configs ----------

const shell = { sprite: 'shell' };
const fish = { sprite: 'fish' };
const crab = { sprite: 'crab' };
const redCircle = { sprite: 'circle', color: 'red' };
const blueSquare = { sprite: 'square', color: 'blue' };
const yellowTriangle = { sprite: 'triangle', color: 'yellow' };

/** The easiest pattern: AB AB, extend by one. */
const peBase: WidgetConfigOf<'pattern-extend'> = {
  format: 'pattern-extend',
  sequence: [shell, fish, shell, fish, null],
  palette: [shell, fish],
  mode: 'extend',
  kind: 'repeat',
};
const peFill: WidgetConfigOf<'pattern-extend'> = {
  ...peBase,
  // A A B A A B with the 4th and 5th hidden (pattern.repeat fill: ends one before the last).
  sequence: [shell, shell, fish, null, null, fish],
  mode: 'fill',
};
const peCore: WidgetConfigOf<'pattern-extend'> = {
  ...peBase,
  sequence: [redCircle, blueSquare, blueSquare, redCircle, blueSquare, blueSquare],
  palette: [redCircle, blueSquare],
  mode: 'core',
};
const peNumber: WidgetConfigOf<'pattern-extend'> = {
  format: 'pattern-extend',
  sequence: [{ n: 4 }, { n: 6 }, { n: 8 }, null, null],
  palette: [],
  mode: 'extend',
  kind: 'number',
};
const peRule: WidgetConfigOf<'pattern-extend'> = {
  ...peNumber,
  sequence: [{ n: 30 }, { n: 40 }, { n: 50 }],
  mode: 'rule',
};
const peTable: WidgetConfigOf<'pattern-extend'> = {
  format: 'pattern-extend',
  sequence: [{ n: 1 }, { n: 2 }],
  palette: [],
  mode: 'table',
  kind: 'function',
  table: { inputs: [1, 2, 3, 4], outputs: [3, 4, null, null] },
};
const peTranslate: WidgetConfigOf<'pattern-extend'> = {
  format: 'pattern-extend',
  sequence: [shell, shell, fish, shell, shell, fish],
  palette: [shell, fish],
  mode: 'translate',
  kind: 'repeat',
  translateTo: [redCircle, blueSquare, yellowTriangle],
};
const peGrow: WidgetConfigOf<'pattern-extend'> = {
  format: 'pattern-extend',
  sequence: [{ tiles: 1 }, { tiles: 3 }, { tiles: 5 }, null],
  palette: [],
  mode: 'extend',
  kind: 'grow',
};

const chart = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  kind: 'bar',
  orientation: 'vertical',
  categories: [
    { id: 'fish', label: 'noun.fish.many', value: 4 },
    { id: 'crab', label: 'noun.crab.many', value: 2 },
  ],
  scale: 1,
  axisMax: 5,
  ...over,
});

const brBase: WidgetConfigOf<'bar-graph-read'> = {
  format: 'bar-graph-read',
  chart: chart(),
  question: { type: 'how-many', categories: ['fish'] },
};

const empty = (c: ChartSpec): ChartSpec => ({
  ...c,
  categories: c.categories.map((x) => ({ ...x, value: 0 })),
});

const bbBase: WidgetConfigOf<'bar-graph-build'> = {
  format: 'bar-graph-build',
  chart: empty(chart()),
  data: { kind: 'table', values: [4, 2] },
  mode: 'bars',
};
const bbTally: WidgetConfigOf<'bar-graph-build'> = {
  ...bbBase,
  chart: empty(chart({ kind: 'tally', orientation: 'horizontal' })),
  data: { kind: 'objects', values: [4, 2] },
  mode: 'tally',
};
const bbPictures: WidgetConfigOf<'bar-graph-build'> = {
  ...bbBase,
  chart: empty(chart({ kind: 'picture', orientation: 'horizontal', scale: 2, axisMax: 8 })),
  data: { kind: 'table', values: [7, 2] },
  mode: 'pictures',
};
const bbLine: WidgetConfigOf<'bar-graph-build'> = {
  format: 'bar-graph-build',
  chart: {
    kind: 'line-plot',
    orientation: 'horizontal',
    categories: [],
    scale: 1,
    axisMax: 5,
    lineScale: { min: 0, max: 3, step: 0.5 },
  },
  data: { kind: 'measurements', values: [1, 1.5, 3, 1.5, 1.5] },
  mode: 'xs',
};

interface Row {
  model: AnyModel;
  config: WidgetConfig;
  answer: AnswerSpec;
  ops: WidgetAction[];
}

const ROWS: Row[] = [
  {
    model: patternExtend,
    config: peBase,
    answer: { kind: 'state', checker: 'pattern.tokens', target: { expected: [shell] } },
    ops: [
      act('highlight', { index: 0 }),
      act('place-token', { index: 4, token: fish }),
      act('place-token', { index: 4, token: shell }),
    ],
  },
  {
    model: barGraphRead,
    config: brBase,
    answer: { kind: 'number', value: 4 },
    ops: [
      act('point-bar', { id: 'fish' }),
      act('read-axis', { id: 'fish' }),
      act('count-pictures', { id: 'crab' }),
      act('answer', { value: 4 }),
    ],
  },
  {
    model: barGraphBuild,
    config: bbBase,
    answer: { kind: 'state', checker: 'chart.values', target: { values: [4, 2] } },
    ops: [
      act('raise-bar', { id: 'fish', to: 4 }),
      act('tally', { id: 'crab', count: 2 }),
      act('add-picture', { id: 'crab' }),
      act('add-picture', { id: 'crab', count: -1 }),
    ],
  },
];

describe('U05 patterns and data models (03 §6.3)', () => {
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

  it.each(rows)('%s: an unsupported op throws UnsupportedOpError', (f, r) => {
    const s = r.model.initialState(r.config);
    expect(() => r.model.apply(s, act('teleport'))).toThrow(UnsupportedOpError);
    try {
      r.model.apply(s, act('teleport'));
    } catch (e) {
      expect(e).toMatchObject({ format: f, op: 'teleport' });
    }
  });

  it.each(rows)('%s: malformed args are ignored, never thrown', (f, r) => {
    const s = r.model.initialState(r.config);
    const junk = [
      {},
      {
        id: 7,
        index: 'x',
        to: 'top',
        at: null,
        count: 'two',
        token: 'shell',
        from: {},
        value: '4',
      },
      { id: 'nobody', index: 99, to: Number.NaN, at: 99, count: 0.3, token: { colour: 1 } },
      { values: 'all', id: null, index: -1, from: 3, to: -2 },
    ];
    for (const op of [...FORMAT_SUPPORT[f as ItemFormat].ops, 'answer']) {
      for (const args of junk) {
        expect(
          () => r.model.apply(s, act(op, args)),
          `${op} ${JSON.stringify(args)}`,
        ).not.toThrow();
        expect(r.model.toResponse(r.model.apply(s, act(op, args)))).toBeNull();
      }
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

  it.each(rows)('%s: the replayed ops answer correctly', (_f, r) => {
    const res = r.ops.reduce((s, a) => r.model.apply(s, a), r.model.initialState(r.config));
    const out = r.model.toResponse(res);
    if (r.answer.kind === 'state')
      expect(passes(r.answer.checker, r.answer.target, out)).toBe(true);
    else expect(out).toEqual({ kind: 'number', value: 4 });
  });
});

// ---------- pattern-extend ----------

describe('pattern-extend', () => {
  const tokens = stateChecker('pattern.tokens');
  const iso = stateChecker('pattern.isomorphic');

  it('extend: place-token fills the blank; null until every blank is filled', () => {
    const two: WidgetConfigOf<'pattern-extend'> = {
      ...peBase,
      sequence: [shell, fish, shell, null, null],
    };
    expect(respond(patternExtend, two, [act('place-token', { index: 3, token: fish })])).toBeNull();
    const r = respond(patternExtend, two, [
      act('place-token', { index: 4, token: shell }),
      act('place-token', { index: 3, token: fish }),
    ]);
    expect(r).toEqual({ kind: 'state', value: { tokens: [fish, shell] } });
    expect(passes('pattern.tokens', { expected: [fish, shell] }, r)).toBe(true);
    // Reading order, not placement order: a swapped pair is wrong.
    expect(passes('pattern.tokens', { expected: [shell, fish] }, r)).toBe(false);
  });

  it('extend: a token outside the palette, or on a shown place, is ignored; no token clears', () => {
    let s = play(patternExtend, peBase, [act('place-token', { index: 4, token: crab })]);
    expect(s.placed[4]).toBeNull();
    s = patternExtend.apply(s, act('place-token', { index: 0, token: fish }));
    expect(s.placed[0]).toBeNull();
    s = patternExtend.apply(
      s,
      act('place-token', { index: 4, token: { sprite: 'shell', extra: 1 } }),
    );
    expect(s.placed[4]).toEqual(shell);
    s = patternExtend.apply(s, act('place-token', { index: 4 }));
    expect(patternExtend.toResponse(s)).toBeNull();
  });

  it('colour alone never matches a unit (CVD): a blue circle is not the red circle', () => {
    const shapes: WidgetConfigOf<'pattern-extend'> = {
      ...peBase,
      sequence: [redCircle, blueSquare, redCircle, null],
      palette: [redCircle, blueSquare],
    };
    const s = play(patternExtend, shapes, [
      act('place-token', { index: 3, token: { sprite: 'circle', color: 'blue' } }),
    ]);
    expect(s.placed[3]).toBeNull();
    const r = respond(patternExtend, shapes, [act('place-token', { index: 3, token: blueSquare })]);
    expect(
      tokens?.check({ expected: [blueSquare] }, (r as { value: Record<string, unknown> }).value),
    ).toBe(true);
  });

  it('fill: the hidden middle answers in reading order', () => {
    const r = respond(patternExtend, peFill, [
      act('place-token', { index: 4, token: shell }),
      act('place-token', { index: 3, token: shell }),
    ]);
    expect(passes('pattern.tokens', { expected: [shell, shell] }, r)).toBe(true);
    expect(patternExtend.featureValues(peFill, { kind: 'number', value: 0 })['hidden.middle']).toBe(
      1,
    );
  });

  it('number patterns: place-token {n} or answer {values}; a picture token is refused', () => {
    expect(
      respond(patternExtend, peNumber, [
        act('place-token', { index: 3, token: { n: 10 } }),
        act('place-token', { index: 4, token: { n: 12 } }),
      ]),
    ).toEqual({ kind: 'state', value: { tokens: [{ n: 10 }, { n: 12 }] } });
    const r = respond(patternExtend, peNumber, [act('answer', { values: [10, 12] })]);
    expect(passes('pattern.tokens', { expected: [{ n: 10 }, { n: 12 }] }, r)).toBe(true);
    expect(
      play(patternExtend, peNumber, [act('place-token', { index: 3, token: shell })]).placed[3],
    ).toBeNull();
    expect(respond(patternExtend, peNumber, [act('answer', { values: [10] })])).toBeNull();
  });

  it('core: bracket-core marks from … to (either way round), select.exactSet', () => {
    const want = { values: [0, 1, 2] };
    const r = respond(patternExtend, peCore, [act('bracket-core', { from: 0, to: 2 })]);
    expect(r).toEqual({ kind: 'state', value: want });
    expect(passes('select.exactSet', want, r)).toBe(true);
    expect(respond(patternExtend, peCore, [act('bracket-core', { from: 2, to: 0 })])).toEqual(r);
    // A re-bracket replaces the mark; the second repeat is not the first one.
    const later = respond(patternExtend, peCore, [
      act('bracket-core', { from: 0, to: 2 }),
      act('bracket-core', { from: 3, to: 5 }),
    ]);
    expect(passes('select.exactSet', want, later)).toBe(false);
    expect(respond(patternExtend, peCore, [act('bracket-core', { from: 0, to: 6 })])).toBeNull();
    expect(respond(patternExtend, peCore, [act('answer', { values: [2, 0, 1] })])).toEqual(r);
    // Outside core mode the op does nothing.
    expect(play(patternExtend, peBase, [act('bracket-core', { from: 0, to: 1 })]).selected).toEqual(
      [],
    );
  });

  it('rule answers the typed step', () => {
    expect(respond(patternExtend, peRule, [act('answer', { value: 10 })])).toEqual({
      kind: 'number',
      value: 10,
    });
    expect(
      respond(patternExtend, peRule, [act('place-token', { index: 0, token: { n: 1 } })]),
    ).toBeNull();
  });

  it('table: fills the missing outputs and answers them in order (numbers)', () => {
    expect(
      respond(patternExtend, peTable, [act('place-token', { index: 2, token: { n: 5 } })]),
    ).toBeNull();
    expect(
      respond(patternExtend, peTable, [
        act('place-token', { index: 3, token: { n: 6 } }),
        act('place-token', { index: 2, token: { n: 5 } }),
      ]),
    ).toEqual({ kind: 'numbers', values: [5, 6] });
    expect(respond(patternExtend, peTable, [act('answer', { values: [5, 6] })])).toEqual({
      kind: 'numbers',
      values: [5, 6],
    });
    // A shown row cannot be overwritten.
    expect(
      play(patternExtend, peTable, [act('place-token', { index: 0, token: { n: 9 } })]).placed[0],
    ).toBeNull();
  });

  it('translate: any one-to-one renaming of the units is correct (pattern.isomorphic)', () => {
    const target = { source: peTranslate.sequence, units: peTranslate.translateTo };
    const build = (a: object, b: object) =>
      respond(
        patternExtend,
        peTranslate,
        [a, a, b, a, a, b].map((token, index) => act('place-token', { index, token })),
      );
    expect(passes('pattern.isomorphic', target, build(redCircle, blueSquare))).toBe(true);
    // Alternative valid end state: another mapping.
    expect(passes('pattern.isomorphic', target, build(yellowTriangle, redCircle))).toBe(true);
    expect(passes('pattern.isomorphic', target, build(redCircle, redCircle))).toBe(false);
    // Units outside translateTo are refused by the model, so the row stays incomplete.
    expect(build(shell, fish)).toBeNull();
    expect(iso?.id).toBe('pattern.isomorphic');
  });

  it('growing tile patterns place {tiles}', () => {
    const r = respond(patternExtend, peGrow, [
      act('place-token', { index: 3, token: { tiles: 7 } }),
    ]);
    expect(passes('pattern.tokens', { expected: [{ tiles: 7 }] }, r)).toBe(true);
  });

  it('highlight marks a position (visual only); an index outside clears nothing', () => {
    let s = play(patternExtend, peBase, [act('highlight', { index: 2 })]);
    expect(s.highlighted).toBe(2);
    s = patternExtend.apply(s, act('highlight', { index: 9 }));
    expect(s.highlighted).toBe(2);
    expect(patternExtend.toResponse(s)).toBeNull();
  });

  it('smallestPeriod, firstStep and additiveTable', () => {
    expect(smallestPeriod([shell, fish, shell, fish, null])).toBe(2);
    expect(smallestPeriod([shell, shell, fish, fish, shell])).toBe(4);
    expect(smallestPeriod([shell, fish, fish, shell])).toBe(3);
    expect(smallestPeriod([shell, shell, shell])).toBe(1);
    expect(firstStep([{ n: 9 }, null, { n: 5 }, { n: 3 }])).toBe(-2);
    expect(firstStep([shell, fish])).toBeNull();
    expect(additiveTable({ inputs: [1, 2, 3], outputs: [3, 4, null] })).toBe(true);
    expect(additiveTable({ inputs: [1, 2, 3], outputs: [2, 4, null] })).toBe(false);
  });

  it('feature values at the extremes', () => {
    const none: AnswerSpec = { kind: 'number', value: 0 };
    expect(patternExtend.featureValues(peCore, none)['core.len']).toBe(1);
    expect(patternExtend.featureValues(peNumber, none)['step.notOne']).toBe(1);
    const down: WidgetConfigOf<'pattern-extend'> = {
      ...peNumber,
      sequence: [{ n: 9 }, { n: 8 }, { n: 7 }, null],
    };
    expect(patternExtend.featureValues(down, none)).toMatchObject({ minus: 1, 'step.notOne': 0 });
    expect(patternExtend.featureValues(peTranslate, none).translate).toBe(1);
    expect(patternExtend.featureValues(peGrow, none).grow).toBe(1);
    const times: WidgetConfigOf<'pattern-extend'> = {
      ...peTable,
      table: { inputs: [1, 2, 3], outputs: [2, 4, null] },
    };
    expect(patternExtend.featureValues(times, none)['rule.multiply']).toBe(1);
    expect(patternExtend.featureValues(peTable, none)['rule.multiply']).toBe(0);
  });

  it('accepts every mode and kind it supports', () => {
    for (const c of [peBase, peFill, peCore, peNumber, peRule, peTable, peTranslate, peGrow]) {
      expect(issuePaths(patternExtend, c), c.mode).toEqual([]);
    }
  });

  it('rejects patterns the widget cannot draw or the child cannot answer', () => {
    const bad = (over: Partial<WidgetConfigOf<'pattern-extend'>>, base = peBase) =>
      issuePaths(patternExtend, { ...base, ...over });
    expect(bad({ sequence: [shell, fish, shell, fish] })).toContain('sequence'); // no blank
    expect(bad({ sequence: [null, null] })).toContain('sequence'); // nothing shown
    expect(bad({ palette: [shell] })).toContain('palette'); // one unit only
    expect(bad({ sequence: [shell, crab, null], palette: [shell, fish] })).toContain('palette');
    // Units that differ by colour alone (06 §7).
    expect(
      bad({
        sequence: [redCircle, { sprite: 'circle', color: 'blue' }, null],
        palette: [redCircle, { sprite: 'circle', color: 'blue' }],
      }).length,
    ).toBeGreaterThan(0);
    expect(bad({ sequence: [{ sprite: 'circle', color: 'purple' }, fish, null] })).toContain(
      'sequence.0.color',
    );
    expect(bad({ sequence: [{ sprite: 'shell', color: 'red' }, fish, null] })).toContain(
      'sequence.0.sprite',
    );
    expect(bad({ sequence: [shell, { n: 2 }, null] })).toContain('sequence'); // mixed
    expect(bad({ kind: 'number' })).toContain('kind'); // pictures in a number pattern
    expect(bad({ sequence: [shell, fish, shell, fish] }, peCore).length).toBe(0);
    expect(bad({ sequence: [shell, fish, fish, shell] }, peCore)).toContain('sequence'); // < 2 repeats
    expect(bad({ sequence: [shell, null, fish] }, peCore)).toContain('sequence');
    expect(bad({ table: undefined }, peTable)).toContain('table');
    expect(bad({ table: { inputs: [1, 2], outputs: [3, 4] } }, peTable)).toContain('table.outputs');
    expect(bad({ table: { inputs: [1, 2], outputs: [3] } }, peTable)).toContain('table');
    expect(bad({ translateTo: [redCircle] }, peTranslate)).toContain('translateTo');
    expect(bad({ translateTo: [redCircle, redCircle] }, peTranslate).length).toBeGreaterThan(0);
    expect(bad({ sequence: [{ tiles: 0 }, { tiles: 2 }, null] }, peGrow).length).toBeGreaterThan(0);
    expect(bad({ mode: 'rule' }, peBase).length).toBeGreaterThan(0);
  });
});

// ---------- charts ----------

describe('chart maths', () => {
  it('slots are the categories, or the line-plot positions', () => {
    expect(chartSlots(chart()).map((s) => s.id)).toEqual(['fish', 'crab']);
    expect(chartSlots(bbLine.chart).map((s) => s.id)).toEqual([
      '0',
      '0.5',
      '1',
      '1.5',
      '2',
      '2.5',
      '3',
    ]);
    expect(linePositions({ min: 0, max: 1, step: 0.25 })).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(positionId(0.1 + 0.2)).toBe('0.3');
    const plotted: ChartSpec = {
      ...bbLine.chart,
      categories: [
        { id: '1.5', label: 'noun.fish.many', value: 3 },
        { id: '3', label: 'noun.fish.many', value: 1 },
      ],
    };
    expect(slotValues(plotted)).toEqual([0, 0, 0, 3, 0, 0, 1]);
  });

  it('picture symbols: whole symbols and the part of one (a half at scale 2)', () => {
    expect(symbolParts(7, 2)).toEqual({ whole: 3, part: 0.5 });
    expect(symbolParts(6, 2)).toEqual({ whole: 3, part: 0 });
    expect(symbolParts(5, 1)).toEqual({ whole: 5, part: 0 });
    expect(symbolParts(15, 10)).toEqual({ whole: 1, part: 0.5 });
  });

  it('tally marks group in fives', () => {
    expect(tallyGroups(0)).toEqual([]);
    expect(tallyGroups(4)).toEqual([4]);
    expect(tallyGroups(5)).toEqual([5]);
    expect(tallyGroups(13)).toEqual([5, 5, 3]);
  });

  it('the axis counts by the scale up to axisMax rounded up', () => {
    expect(axisTicks({ axisMax: 5, scale: 1 })).toEqual([0, 1, 2, 3, 4, 5]);
    expect(axisTicks({ axisMax: 7, scale: 2 })).toEqual([0, 2, 4, 6, 8]);
    expect(axisTop({ axisMax: 12, scale: 5 })).toBe(15);
  });
});

// ---------- bar-graph-read ----------

describe('bar-graph-read', () => {
  it('counting questions answer the typed number; most / least a category id', () => {
    for (const type of ['how-many', 'total', 'difference'] as const) {
      const cfg: WidgetConfigOf<'bar-graph-read'> = {
        ...brBase,
        question: { type, categories: type === 'how-many' ? ['fish'] : ['fish', 'crab'] },
      };
      expect(issuePaths(barGraphRead, cfg)).toEqual([]);
      expect(respond(barGraphRead, cfg, [act('answer', { id: 'fish' })])).toBeNull();
      expect(respond(barGraphRead, cfg, [act('answer', { value: 6 })])).toEqual({
        kind: 'number',
        value: 6,
      });
    }
    for (const type of ['most', 'least'] as const) {
      const cfg: WidgetConfigOf<'bar-graph-read'> = {
        ...brBase,
        question: { type, categories: ['fish', 'crab'] },
      };
      expect(issuePaths(barGraphRead, cfg)).toEqual([]);
      expect(respond(barGraphRead, cfg, [act('answer', { value: 4 })])).toBeNull();
      expect(respond(barGraphRead, cfg, [act('answer', { id: 'shell' })])).toBeNull();
      expect(respond(barGraphRead, cfg, [act('answer', { id: 'crab' })])).toEqual({
        kind: 'choice',
        id: 'crab',
      });
    }
  });

  it('pointing and reading are visual: they never answer', () => {
    const s = play(barGraphRead, brBase, [
      act('point-bar', { id: 'crab' }),
      act('read-axis', { id: 'fish' }),
      act('count-pictures', { id: 'fish' }),
    ]);
    expect(s.pointed).toBe('fish');
    expect(s.read).toEqual(['fish']);
    expect(barGraphRead.toResponse(s)).toBeNull();
  });

  it('line plots ask about positions', () => {
    const lp: WidgetConfigOf<'bar-graph-read'> = {
      format: 'bar-graph-read',
      chart: {
        ...bbLine.chart,
        categories: [
          { id: '1.5', label: 'noun.fish.many', value: 3 },
          { id: '2', label: 'noun.fish.many', value: 1 },
        ],
      },
      question: { type: 'how-many', categories: ['1.5'] },
    };
    expect(issuePaths(barGraphRead, lp)).toEqual([]);
    expect(play(barGraphRead, lp, [act('point-bar', { id: '1.5' })]).pointed).toBe('1.5');
    expect(barGraphRead.featureValues(lp, { kind: 'number', value: 3 }).linePlot).toBe(1);
  });

  it('feature values at the extremes', () => {
    const hard: WidgetConfigOf<'bar-graph-read'> = {
      format: 'bar-graph-read',
      chart: chart({
        kind: 'picture',
        orientation: 'horizontal',
        scale: 2,
        axisMax: 10,
        categories: [
          { id: 'fish', label: 'noun.fish.many', value: 7 },
          { id: 'crab', label: 'noun.crab.many', value: 4 },
          { id: 'shell', label: 'noun.shell.many', value: 2 },
          { id: 'apple', label: 'noun.apple.many', value: 10 },
        ],
      }),
      question: { type: 'two-step', categories: ['fish', 'crab'], extra: 3 },
    };
    expect(issuePaths(barGraphRead, hard)).toEqual([]);
    expect(barGraphRead.featureValues(hard, { kind: 'number', value: 0 })).toEqual({
      'categories.over2': 2,
      'scale.notOne': 1,
      halfSymbol: 1,
      'q.difference': 0,
      'q.total': 0,
      'q.twoStep': 1,
      // A picture graph reads left to right by nature: only horizontal bars count.
      horizontal: 0,
      linePlot: 0,
    });
    const sideways = { ...brBase, chart: chart({ orientation: 'horizontal' }) };
    expect(barGraphRead.featureValues(sideways, { kind: 'number', value: 4 }).horizontal).toBe(1);
  });

  it('rejects questions the chart cannot answer', () => {
    const bad = (over: Partial<WidgetConfigOf<'bar-graph-read'>>) =>
      issuePaths(barGraphRead, { ...brBase, ...over });
    expect(bad({ question: { type: 'how-many', categories: ['shell'] } })).toContain(
      'question.categories.0',
    );
    expect(bad({ question: { type: 'how-many', categories: ['fish', 'crab'] } })).toContain(
      'question.categories',
    );
    expect(bad({ question: { type: 'difference', categories: ['crab', 'fish'] } })).toContain(
      'question',
    );
    expect(bad({ question: { type: 'how-many-more-to', categories: ['fish'] } })).toContain(
      'question.extra',
    );
    expect(
      bad({ question: { type: 'how-many-more-to', categories: ['fish'], extra: 3 } }),
    ).toContain('question.extra');
    expect(
      bad({
        chart: chart({
          categories: [
            { id: 'fish', label: 'noun.fish.many', value: 4 },
            { id: 'crab', label: 'noun.crab.many', value: 4 },
          ],
        }),
        question: { type: 'most', categories: ['fish', 'crab'] },
      }),
    ).toContain('question'); // a tie
    expect(bad({ chart: chart({ axisMax: 3 }) })).toContain('chart.categories.0.value');
    expect(bad({ chart: chart({ kind: 'tally', scale: 2 }) })).toContain('chart.scale');
    expect(bad({ chart: chart({ kind: 'picture', scale: 5, axisMax: 10 }) })).toContain(
      'chart.categories.0.value',
    );
    expect(
      bad({
        chart: chart({
          categories: [
            { id: 'fish', label: 'noun.fish.many', value: 1 },
            { id: 'fish', label: 'noun.fish.many', value: 2 },
          ],
        }),
      }),
    ).toContain('chart.categories');
    expect(bad({ chart: chart({ kind: 'line-plot' }) })).toContain('chart.lineScale');
  });
});

// ---------- bar-graph-build ----------

describe('bar-graph-build', () => {
  const check = (cfg: WidgetConfigOf<'bar-graph-build'>, ops: WidgetAction[]) =>
    passes('chart.values', { values: buildTargets(cfg) }, respond(barGraphBuild, cfg, ops));

  it('every mode builds the same counts; the response is { values } in chart order', () => {
    expect(
      check(bbBase, [
        act('raise-bar', { id: 'crab', to: 2 }),
        act('raise-bar', { id: 'fish', to: 4 }),
      ]),
    ).toBe(true);
    expect(
      check(bbTally, [
        act('tally', { id: 'fish', count: 4 }),
        act('tally', { id: 'crab' }),
        act('tally', { id: 'crab' }),
      ]),
    ).toBe(true);
    // Scale 2: 7 fish are 3½ pictures; 2 crabs one picture.
    expect(
      check(bbPictures, [
        act('add-picture', { id: 'fish', count: 3 }),
        act('add-picture', { id: 'fish', count: 0.5 }),
        act('add-picture', { id: 'crab' }),
      ]),
    ).toBe(true);
    // Alternative end state: built in another order, with marks taken back.
    expect(
      check(bbTally, [
        act('tally', { id: 'crab', count: 3 }),
        act('tally', { id: 'fish', count: 5 }),
        act('tally', { id: 'crab', count: -1 }),
        act('tally', { id: 'fish', count: -1 }),
      ]),
    ).toBe(true);
    expect(check(bbBase, [act('raise-bar', { id: 'fish', to: 4 })])).toBe(false);
  });

  it('a line plot from measurements: Xs per position, min → max', () => {
    expect(buildTargets(bbLine)).toEqual([0, 0, 1, 3, 0, 0, 1]);
    const ops = [1, 1.5, 1.5, 3, 1.5].map((at) => act('add-x', { at }));
    expect(respond(barGraphBuild, bbLine, ops)).toEqual({
      kind: 'state',
      value: { values: [0, 0, 1, 3, 0, 0, 1] },
    });
    expect(check(bbLine, ops)).toBe(true);
    expect(check(bbLine, [...ops, act('add-x', { at: 1.5, count: -1 })])).toBe(false);
    expect(
      play(barGraphBuild, bbLine, [act('add-x', { at: 1.25 })]).values.every((v) => v === 0),
    ).toBe(true);
  });

  it('counts stay within 0 … axisMax; nothing built answers null', () => {
    expect(respond(barGraphBuild, bbBase, [])).toBeNull();
    expect(play(barGraphBuild, bbBase, [act('raise-bar', { id: 'fish', to: 9 })]).values).toEqual([
      5, 0,
    ]);
    expect(play(barGraphBuild, bbTally, [act('tally', { id: 'fish', count: -3 })]).values).toEqual([
      0, 0,
    ]);
    expect(play(barGraphBuild, bbBase, [act('raise-bar', { id: 'fish', to: 2.5 })]).values).toEqual(
      [0, 0],
    );
    expect(
      respond(barGraphBuild, bbBase, [
        act('raise-bar', { id: 'fish', to: 2 }),
        act('raise-bar', { id: 'fish', to: 0 }),
      ]),
    ).toBeNull();
    // A third of a picture is not a picture graph mark.
    expect(
      play(barGraphBuild, bbPictures, [act('add-picture', { id: 'fish', count: 1 / 3 })]).values,
    ).toEqual([0, 0]);
  });

  it('answer {values} sets every count', () => {
    expect(respond(barGraphBuild, bbBase, [act('answer', { values: [4, 2] })])).toEqual({
      kind: 'state',
      value: { values: [4, 2] },
    });
    expect(respond(barGraphBuild, bbBase, [act('answer', { values: [4] })])).toBeNull();
  });

  it('feature values at the extremes', () => {
    expect(barGraphBuild.featureValues(bbPictures, { kind: 'number', value: 0 })).toMatchObject({
      'scale.notOne': 1,
      notMultipleOfScale: 1,
      'data.raw': 0,
    });
    expect(barGraphBuild.featureValues(bbLine, { kind: 'number', value: 0 })).toMatchObject({
      'data.raw': 1,
      fractional: 1,
    });
    expect(barGraphBuild.featureValues(bbTally, { kind: 'number', value: 0 })['data.raw']).toBe(1);
  });

  it('accepts every mode, and rejects charts that give the counts away or cannot be built', () => {
    for (const c of [bbBase, bbTally, bbPictures, bbLine])
      expect(issuePaths(barGraphBuild, c), c.mode).toEqual([]);
    const bad = (over: Partial<WidgetConfigOf<'bar-graph-build'>>, base = bbBase) =>
      issuePaths(barGraphBuild, { ...base, ...over });
    expect(bad({ chart: chart() })).toContain('chart.categories.0.value'); // counts shown
    expect(bad({ mode: 'tally' })).toContain('mode');
    expect(bad({ data: { kind: 'table', values: [4] } })).toContain('data.values');
    expect(bad({ data: { kind: 'table', values: [9, 2] } })).toContain('data.values.0');
    expect(bad({ data: { kind: 'table', values: [0, 0] } })).toContain('data.values');
    expect(bad({ data: { kind: 'measurements', values: [4, 2] } })).toContain('data.kind');
    expect(bad({ data: { kind: 'measurements', values: [1.25] } }, bbLine)).toContain(
      'data.values.0',
    );
    expect(
      bad(
        {
          chart: empty(
            chart({ kind: 'picture', orientation: 'horizontal', scale: 5, axisMax: 10 }),
          ),
          data: { kind: 'table', values: [7, 2] },
        },
        bbPictures,
      ),
    ).toContain('data.values.0');
  });
});
