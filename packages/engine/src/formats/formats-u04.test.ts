// 03 §6.3 format state models and 03 §5.5 configs, features and answer semantics for the U04
// place-value and operations formats (#13): base-ten-build, base-ten-trade, expanded-form,
// array-build, equal-groups, equal-share and area-tiles. Each state response is also run through
// its 03 §5.7 state checker, so the model and the checker agree.

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
import { areaTiles, regionPieces } from './area-tiles';
import { arrayBuild, rectanglesOf } from './array-build';
import { baseTenBuild, buildable, limitsForceTrade } from './base-ten-build';
import { baseTenTrade, borrowsAcrossZero, computeResult, regroupCount } from './base-ten-trade';
import { equalGroups } from './equal-groups';
import { equalShare } from './equal-share';
import { cardsReach, expandedForm } from './expanded-form';
import { formatModel } from './index';
import { canonicalPieces, hasInternalZero, isPlaceValue, piecesValue } from './place-value';
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

/** Whether the replayed state response satisfies a checker. */
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

// ---------- easiest-case configs (every feature value is 0) ----------

const btBuild: WidgetConfigOf<'base-ten-build'> = {
  format: 'base-ten-build',
  target: 7,
  mode: 'build',
  pieces: { thousands: false, hundreds: false, tens: true, ones: true },
  wholeIs: 'unit',
};
const btTrade: WidgetConfigOf<'base-ten-trade'> = {
  format: 'base-ten-trade',
  start: { hundreds: 0, tens: 2, ones: 3 },
  operation: { op: '+', operand: { hundreds: 0, tens: 1, ones: 4 } },
  goal: 'compute',
  showAlgorithm: false,
  thenAsk: false,
};
const efBase: WidgetConfigOf<'expanded-form'> = {
  format: 'expanded-form',
  target: 7,
  mode: 'to-standard',
  expression: { tokens: [{ t: 'num', v: 7 }] },
  unusualOrder: false,
};
const abBase: WidgetConfigOf<'array-build'> = {
  format: 'array-build',
  maxRows: 6,
  maxCols: 6,
  mode: 'build-dims',
  rows: 1,
  cols: 1,
  orientationMatters: false,
  sprite: 'shell',
  gridShown: true,
};
const egBase: WidgetConfigOf<'equal-groups'> = {
  format: 'equal-groups',
  groups: 1,
  perGroup: 1,
  unknown: 'total',
  mode: 'read',
  container: 'raft',
  sprite: 'fish',
  maxGroups: 6,
};
const esBase: WidgetConfigOf<'equal-share'> = {
  format: 'equal-share',
  items: 1,
  recipients: 2,
  sprite: 'shell',
  recipientsKind: 'pebbling',
  allowLeftover: true,
  ask: 'leftover',
};
// One item between two always leaves one over, so the leftover feature is 1 here; the easiest
// share has no leftover.
const esEasiest: WidgetConfigOf<'equal-share'> = { ...esBase, items: 2, ask: 'each' };
const atBase: WidgetConfigOf<'area-tiles'> = {
  format: 'area-tiles',
  region: { w: 1, h: 1, mask: '1' },
  mode: 'count',
  gridShown: true,
  sideLabels: false,
  unit: 'sq-units',
  decimalGrid: false,
};

interface Row {
  model: AnyModel;
  config: WidgetConfig;
  answer: AnswerSpec;
  ops: WidgetAction[];
}

const ROWS: Row[] = [
  {
    model: baseTenBuild,
    config: btBuild,
    answer: { kind: 'state', checker: 'baseten.value', target: { value: 7 } },
    ops: [
      act('add-piece', { kind: 'ones', count: 12 }),
      act('fuse', { kind: 'ones' }),
      act('split', { kind: 'tens' }),
      act('count-by', { kind: 'tens' }),
    ],
  },
  {
    model: baseTenTrade,
    config: btTrade,
    answer: { kind: 'state', checker: 'trade.result', target: { result: 37 } },
    ops: [
      act('combine', { column: 'ones' }),
      act('combine'),
      act('trade', { from: 'tens', to: 'ones' }),
      act('write-digit', { column: 'ones', value: 7 }),
    ],
  },
  {
    model: expandedForm,
    config: efBase,
    answer: { kind: 'number', value: 7 },
    ops: [act('highlight-digit', { index: 0 }), act('stack-cards'), act('answer', { value: 7 })],
  },
  {
    model: arrayBuild,
    config: abBase,
    answer: {
      kind: 'state',
      checker: 'array.dims',
      target: { rows: 1, cols: 1, orientationMatters: false },
    },
    ops: [act('drag-rect', { rows: 2, cols: 3 }), act('add-row'), act('count-rows')],
  },
  {
    model: equalGroups,
    config: egBase,
    answer: { kind: 'number', value: 1 },
    ops: [act('skip-count'), act('circle-group', { index: 0 }), act('answer', { value: 1 })],
  },
  {
    model: equalShare,
    config: esEasiest,
    answer: {
      kind: 'state',
      checker: 'share.fair',
      target: { items: 2, recipients: 2, allowLeftover: true, value: 1 },
    },
    ops: [act('deal', { to: 0 }), act('deal-round'), act('set-aside-leftover')],
  },
  {
    model: areaTiles,
    config: atBase,
    answer: { kind: 'number', value: 1 },
    ops: [act('label-side', { side: 'top' }), act('answer', { value: 1 })],
  },
];

describe('U04 format models (03 §6.3)', () => {
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

// ---------- place-value helpers ----------

describe('place-value helpers', () => {
  it('values pieces and finds canonical pieces', () => {
    expect(piecesValue({ hundreds: 2, tens: 14, ones: 3 })).toBe(343);
    expect(canonicalPieces(1305)).toEqual({ thousands: 1, hundreds: 3, tens: 0, ones: 5 });
  });

  it.each([
    [305, true],
    [340, false],
    [3005, true],
    [70, false],
    [7, false],
  ])('hasInternalZero(%i) is %s', (n, want) => {
    expect(hasInternalZero(n)).toBe(want);
  });

  it.each([
    [300, true],
    [5, true],
    [14, false],
    [0, false],
    [110, false],
  ])('isPlaceValue(%i) is %s', (n, want) => {
    expect(isPlaceValue(n)).toBe(want);
  });
});

// ---------- base-ten-build ----------

describe('base-ten-build', () => {
  const t34: WidgetConfigOf<'base-ten-build'> = { ...btBuild, target: 34 };
  const value34 = { kind: 'state', checker: 'baseten.value', target: { value: 34 } } as const;

  it('builds 34 as 3 tens 4 ones, and accepts 2 tens 14 ones (state equivalence)', () => {
    const canonical = respond(baseTenBuild, t34, [
      act('add-piece', { kind: 'tens', count: 3 }),
      act('add-piece', { kind: 'ones', count: 4 }),
    ]);
    expect(canonical).toEqual({
      kind: 'state',
      value: { thousands: 0, hundreds: 0, tens: 3, ones: 4 },
    });
    expect(passes('baseten.value', value34.target, canonical)).toBe(true);
    const alt = respond(baseTenBuild, t34, [
      act('add-piece', { kind: 'rod', count: 2 }),
      act('add-piece', { kind: 'unit', count: 14 }),
    ]);
    expect(passes('baseten.value', value34.target, alt)).toBe(true);
    const short = respond(baseTenBuild, t34, [act('add-piece', { kind: 'tens', count: 3 })]);
    expect(passes('baseten.value', value34.target, short)).toBe(false);
  });

  it('fuses ten pieces into one larger piece and splits one into ten', () => {
    const fused = play(baseTenBuild, t34, [
      act('add-piece', { kind: 'ones', count: 14 }),
      act('fuse', { kind: 'ones' }),
    ]);
    expect(fused.mat).toMatchObject({ tens: 1, ones: 4 });
    const split = baseTenBuild.apply(fused, act('split', { kind: 'tens' }));
    expect(split.mat).toMatchObject({ tens: 0, ones: 14 });
    // Fewer than ten cannot fuse; no piece cannot split.
    expect(baseTenBuild.apply(split, act('fuse', { kind: 'tens' }))).toBe(split);
    expect(baseTenBuild.apply(split, act('split', { kind: 'hundreds' }))).toBe(split);
  });

  it('takes no more from the tray than limits allow, and only enabled kinds', () => {
    const limited: WidgetConfigOf<'base-ten-build'> = { ...t34, limits: { tens: 2 } };
    const s = play(baseTenBuild, limited, [
      act('add-piece', { kind: 'tens', count: 5 }),
      act('add-piece', { kind: 'hundreds' }),
    ]);
    expect(s.mat).toMatchObject({ hundreds: 0, tens: 2 });
    // Putting a piece back returns it to the tray.
    const back = baseTenBuild.apply(s, act('add-piece', { kind: 'tens', count: -1 }));
    expect(baseTenBuild.apply(back, act('add-piece', { kind: 'tens' })).mat.tens).toBe(2);
  });

  it('build-exact needs the named count (34 with exactly 2 tens)', () => {
    const exact: WidgetConfigOf<'base-ten-build'> = {
      ...t34,
      mode: 'build-exact',
      exact: { tens: 2 },
    };
    expect(issuePaths(baseTenBuild, exact)).toEqual([]);
    const target = { value: 34, exact: { tens: 2 } };
    const good = respond(baseTenBuild, exact, [
      act('add-piece', { kind: 'tens', count: 2 }),
      act('add-piece', { kind: 'ones', count: 14 }),
    ]);
    expect(passes('baseten.exact', target, good)).toBe(true);
    const canonical = respond(baseTenBuild, exact, [
      act('add-piece', { kind: 'tens', count: 3 }),
      act('add-piece', { kind: 'ones', count: 4 }),
    ]);
    expect(passes('baseten.exact', target, canonical)).toBe(false);
  });

  it('read answers the typed number for a prebuilt picture', () => {
    const read: WidgetConfigOf<'base-ten-build'> = {
      ...t34,
      mode: 'read',
      prebuilt: { hundreds: 0, tens: 3, ones: 4 },
    };
    expect(issuePaths(baseTenBuild, read)).toEqual([]);
    expect(baseTenBuild.toResponse(baseTenBuild.initialState(read))).toBeNull();
    expect(respond(baseTenBuild, read, [act('answer', { value: 34 })])).toEqual({
      kind: 'number',
      value: 34,
    });
  });

  it('nothing is submittable on an empty mat', () => {
    expect(baseTenBuild.toResponse(baseTenBuild.initialState(t34))).toBeNull();
  });

  it('rejects configs the tray cannot build or that contradict their mode', () => {
    expect(issuePaths(baseTenBuild, { ...t34, pieces: { ...t34.pieces, ones: false } })).toEqual([
      'pieces',
    ]);
    expect(issuePaths(baseTenBuild, { ...t34, limits: { tens: 1, ones: 5 } })).toEqual(['pieces']);
    expect(issuePaths(baseTenBuild, { ...t34, mode: 'read' })).toEqual(['prebuilt']);
    expect(issuePaths(baseTenBuild, { ...t34, mode: 'build-exact' })).toEqual(['exact']);
    expect(issuePaths(baseTenBuild, { ...t34, target: 3.5 })).toEqual(['target']);
  });

  it('buildable and limitsForceTrade', () => {
    expect(buildable(t34, 34)).toBe(true);
    expect(buildable({ ...t34, pieces: { ...t34.pieces, ones: false } }, 30)).toBe(true);
    expect(limitsForceTrade({ ...t34, limits: { tens: 2 } })).toBe(true);
    expect(limitsForceTrade({ ...t34, limits: { tens: 3 } })).toBe(false);
  });

  it('feature values at the extremes', () => {
    const hard: WidgetConfigOf<'base-ten-build'> = {
      ...btBuild,
      target: 305,
      mode: 'build-exact',
      pieces: { thousands: false, hundreds: true, tens: true, ones: true },
      exact: { hundreds: 2 },
      limits: { hundreds: 2 },
      wholeIs: 'flat',
    };
    expect(baseTenBuild.featureValues(hard, value34)).toEqual({
      digits: 2,
      'zero.internal': 1,
      exact: 1,
      'mode.read': 0,
      'limits.tight': 1,
      decimal: 1,
    });
  });
});

// ---------- base-ten-trade ----------

describe('base-ten-trade', () => {
  const add: WidgetConfigOf<'base-ten-trade'> = {
    ...btTrade,
    start: { hundreds: 0, tens: 2, ones: 7 },
    operation: { op: '+', operand: { hundreds: 0, tens: 1, ones: 5 } },
  };

  it('combines the operand, trades ten ones for a ten, and answers the mat', () => {
    const r = respond(baseTenTrade, add, [
      act('combine', { column: 'ones' }),
      act('trade', { from: 'ones', to: 'tens' }),
      act('combine', { column: 'tens' }),
    ]);
    expect(r).toEqual({ kind: 'state', value: { hundreds: 0, tens: 4, ones: 2 } });
    expect(passes('trade.result', { result: 42 }, r)).toBe(true);
    // Not trading is still worth 42: any mat of the right value is correct.
    const untraded = respond(baseTenTrade, add, [act('combine')]);
    expect(passes('trade.result', { result: 42 }, untraded)).toBe(true);
    // Forgetting to combine the tens is not.
    const partial = respond(baseTenTrade, add, [act('combine', { column: 'ones' })]);
    expect(passes('trade.result', { result: 42 }, partial)).toBe(false);
  });

  it('subtracts by trading a ten for ten ones, then taking', () => {
    const sub: WidgetConfigOf<'base-ten-trade'> = {
      ...btTrade,
      start: { hundreds: 0, tens: 4, ones: 2 },
      operation: { op: '-', operand: { hundreds: 0, tens: 1, ones: 5 } },
      thenAsk: true,
    };
    const s = play(baseTenTrade, sub, [
      act('take', { column: 'ones', count: 5 }), // only 2 there
      act('trade', { from: 'tens', to: 'ones' }),
    ]);
    expect(s.mat).toEqual({ hundreds: 0, tens: 3, ones: 10 });
    const done = [
      act('trade', { from: 'tens', to: 'ones' }),
      act('take', { column: 'ones', count: 5 }),
      act('take', { column: 'tens', count: 1 }),
    ];
    // thenAsk: nothing is submittable before the typed value.
    expect(respond(baseTenTrade, sub, done)).toBeNull();
    const r = respond(baseTenTrade, sub, [...done, act('answer', { value: 27 })]);
    expect(r).toEqual({ kind: 'state', value: { hundreds: 0, tens: 2, ones: 7, value: 27 } });
    expect(passes('trade.result', { result: 27, value: 27 }, r)).toBe(true);
    const wrongTyped = respond(baseTenTrade, sub, [...done, act('answer', { value: 37 })]);
    expect(passes('trade.result', { result: 27, value: 27 }, wrongTyped)).toBe(false);
  });

  it('regroup-to needs exactly the target columns', () => {
    const regroup: WidgetConfigOf<'base-ten-trade'> = {
      format: 'base-ten-trade',
      start: { hundreds: 1, tens: 2, ones: 3 },
      goal: 'regroup-to',
      regroupTarget: { hundreds: 0, tens: 12, ones: 3 },
      showAlgorithm: false,
      thenAsk: false,
    };
    expect(issuePaths(baseTenTrade, regroup)).toEqual([]);
    const target = { regroupTarget: regroup.regroupTarget };
    const r = respond(baseTenTrade, regroup, [act('trade', { from: 'hundreds', to: 'tens' })]);
    expect(passes('trade.result', target, r)).toBe(true);
    expect(passes('trade.result', target, respond(baseTenTrade, regroup, []))).toBe(false);
    expect(regroupCount(regroup)).toBe(1);
  });

  it('ignores trades between columns that are not neighbours or lack pieces', () => {
    const s = baseTenTrade.initialState(add);
    expect(baseTenTrade.apply(s, act('trade', { from: 'hundreds', to: 'ones' }))).toBe(s);
    expect(baseTenTrade.apply(s, act('trade', { from: 'ones', to: 'tens' }))).toBe(s);
    expect(baseTenTrade.apply(s, act('trade', { from: 'hundreds', to: 'tens' }))).toBe(s);
  });

  it('writes the algorithm digits', () => {
    const s = play(baseTenTrade, { ...add, showAlgorithm: true }, [
      act('write-digit', { column: 'ones', value: 2 }),
    ]);
    expect(s.written).toEqual({ hundreds: null, tens: null, ones: 2 });
  });

  it('rejects contradictory configs', () => {
    expect(issuePaths(baseTenTrade, { ...add, operation: undefined })).toEqual(['operation']);
    expect(
      issuePaths(baseTenTrade, {
        ...add,
        operation: { op: '-', operand: { hundreds: 1, tens: 0, ones: 0 } },
      }),
    ).toEqual(['operation']);
    expect(
      issuePaths(baseTenTrade, {
        ...add,
        goal: 'regroup-to',
        regroupTarget: { hundreds: 0, tens: 1, ones: 7 },
      }),
    ).toEqual(['regroupTarget']);
  });

  it('counts carries and borrows, and borrowing across zero', () => {
    expect(regroupCount(add)).toBe(1);
    const both: WidgetConfigOf<'base-ten-trade'> = {
      ...btTrade,
      start: { hundreds: 1, tens: 9, ones: 8 },
      operation: { op: '+', operand: { hundreds: 0, tens: 0, ones: 5 } },
    };
    expect(regroupCount(both)).toBe(2);
    const zero: WidgetConfigOf<'base-ten-trade'> = {
      ...btTrade,
      start: { hundreds: 3, tens: 0, ones: 4 },
      operation: { op: '-', operand: { hundreds: 1, tens: 2, ones: 8 } },
      showAlgorithm: true,
    };
    expect(computeResult(zero)).toBe(176);
    expect(borrowsAcrossZero(zero)).toBe(true);
    expect(baseTenTrade.featureValues(zero, { kind: 'number', value: 0 })).toEqual({
      regroups: 2,
      acrossZero: 1,
      threeDigit: 1,
      subtract: 1,
      showAlgorithm: 1,
    });
  });
});

// ---------- expanded-form ----------

describe('expanded-form', () => {
  const build: WidgetConfigOf<'expanded-form'> = {
    format: 'expanded-form',
    target: 345,
    mode: 'build',
    cards: [300, 40, 5, 400, 30, 50],
    unusualOrder: false,
  };

  it('build answers the placed cards as numbers, in any order', () => {
    const r = respond(expandedForm, build, [
      act('place-card', { value: 5 }),
      act('place-card', { value: 300 }),
      act('place-card', { value: 40 }),
    ]);
    expect(r).toEqual({ kind: 'numbers', values: [5, 300, 40] });
  });

  it('build places only cards it has, and can take one back', () => {
    const s = play(expandedForm, build, [
      act('place-card', { value: 300 }),
      act('place-card', { value: 300 }),
      act('place-card', { value: 7 }),
    ]);
    expect(s.placed).toEqual([300]);
    expect(expandedForm.apply(s, act('place-card', { value: 300, remove: true })).placed).toEqual(
      [],
    );
    expect(expandedForm.toResponse(expandedForm.initialState(build))).toBeNull();
  });

  it('fill drops cards or typed numbers into the blanks in order', () => {
    const fill: WidgetConfigOf<'expanded-form'> = {
      format: 'expanded-form',
      target: 345,
      mode: 'fill',
      expression: {
        tokens: [
          { t: 'num', v: 300 },
          { t: 'op', v: '+' },
          { t: 'blank', id: 'b0' },
          { t: 'op', v: '+' },
          { t: 'blank', id: 'b1' },
          { t: 'rel', v: '=' },
          { t: 'num', v: 345 },
        ],
      },
      unusualOrder: false,
    };
    expect(issuePaths(expandedForm, fill)).toEqual([]);
    expect(respond(expandedForm, fill, [act('place-card', { value: 40 })])).toBeNull();
    expect(
      respond(expandedForm, fill, [
        act('place-card', { value: 40 }),
        act('place-card', { value: 5 }),
      ]),
    ).toEqual({ kind: 'numbers', values: [40, 5] });
    expect(respond(expandedForm, fill, [act('answer', { values: [40, 5] })])).toEqual({
      kind: 'numbers',
      values: [40, 5],
    });
  });

  it('words answers a choice, or a number without word options', () => {
    const words: WidgetConfigOf<'expanded-form'> = {
      format: 'expanded-form',
      target: 45,
      mode: 'words',
      unusualOrder: false,
      wordOptions: [
        { id: 'a', words: 'tp.PV.10.t1.opt-a' },
        { id: 'b', words: 'tp.PV.10.t1.opt-b' },
      ],
    };
    expect(issuePaths(expandedForm, words)).toEqual([]);
    expect(respond(expandedForm, words, [act('answer', { id: 'b' })])).toEqual({
      kind: 'choice',
      id: 'b',
    });
    const hear = { ...words, wordOptions: undefined };
    expect(respond(expandedForm, hear, [act('answer', { value: 45 })])).toEqual({
      kind: 'number',
      value: 45,
    });
  });

  it('digit-value answers a number and needs a digit index inside the target', () => {
    const dv: WidgetConfigOf<'expanded-form'> = {
      format: 'expanded-form',
      target: 345,
      mode: 'digit-value',
      digitIndex: 1,
      unusualOrder: false,
    };
    expect(issuePaths(expandedForm, dv)).toEqual([]);
    expect(issuePaths(expandedForm, { ...dv, digitIndex: 3 })).toEqual(['digitIndex']);
    expect(
      respond(expandedForm, dv, [
        act('highlight-digit', { index: 1 }),
        act('answer', { value: 40 }),
      ]),
    ).toEqual({
      kind: 'number',
      value: 40,
    });
  });

  it('rejects build cards that cannot make the target, and fill without blanks', () => {
    expect(issuePaths(expandedForm, { ...build, cards: [300, 40] })).toEqual(['cards']);
    expect(issuePaths(expandedForm, { ...build, mode: 'fill' })).toEqual(['expression']);
    expect(cardsReach([20, 14, 30], 34)).toBe(true);
    expect(cardsReach([20, 30], 34)).toBe(false);
  });

  it('features: a non-canonical part (2 tens 14 ones) and unusual order', () => {
    const odd: WidgetConfigOf<'expanded-form'> = {
      ...build,
      target: 3405,
      unusualOrder: true,
      mode: 'words',
      cards: undefined,
    };
    expect(
      expandedForm.featureValues(odd, { kind: 'numbers', values: [20, 14], ordered: false }),
    ).toEqual({
      digits: 3,
      'zero.internal': 1,
      unusualOrder: 1,
      'mode.words': 1,
      nonCanonical: 1,
    });
    expect(
      expandedForm.featureValues(build, { kind: 'numbers', values: [300, 40, 5], ordered: false })
        .nonCanonical,
    ).toBe(0);
  });
});

// ---------- array-build ----------

describe('array-build', () => {
  const dims: WidgetConfigOf<'array-build'> = { ...abBase, rows: 3, cols: 4 };
  const dimsTarget = { rows: 3, cols: 4, orientationMatters: false };

  it('build-dims: 3 × 4, and 4 × 3 unless orientation matters', () => {
    const r = respond(arrayBuild, dims, [act('drag-rect', { rows: 3, cols: 4 })]);
    expect(r).toEqual({ kind: 'state', value: { rows: 3, cols: 4 } });
    expect(passes('array.dims', dimsTarget, r)).toBe(true);
    const turned = respond(arrayBuild, dims, [act('drag-rect', { rows: 4, cols: 3 })]);
    expect(passes('array.dims', dimsTarget, turned)).toBe(true);
    expect(passes('array.dims', { ...dimsTarget, orientationMatters: true }, turned)).toBe(false);
  });

  it('add-row grows the array row by row with the item width', () => {
    const s = play(arrayBuild, dims, [act('add-row'), act('add-row'), act('add-row')]);
    expect([s.rows, s.cols]).toEqual([3, 4]);
    expect(arrayBuild.toResponse(arrayBuild.initialState(dims))).toBeNull();
  });

  it('clamps drags to the grid', () => {
    const s = play(arrayBuild, dims, [act('drag-rect', { rows: 9, cols: 9 })]);
    expect([s.rows, s.cols]).toEqual([6, 6]);
  });

  it('build-total accepts any rectangle of the total; new-way only one not found', () => {
    const total: WidgetConfigOf<'array-build'> = {
      ...abBase,
      mode: 'build-total',
      rows: undefined,
      cols: undefined,
      total: 12,
    };
    expect(issuePaths(arrayBuild, total)).toEqual([]);
    const r26 = respond(arrayBuild, total, [act('drag-rect', { rows: 2, cols: 6 })]);
    const r34 = respond(arrayBuild, total, [act('drag-rect', { rows: 3, cols: 4 })]);
    expect(passes('array.area', { total: 12 }, r26)).toBe(true);
    expect(passes('array.area', { total: 12 }, r34)).toBe(true);
    const found: [number, number][] = [[4, 3]];
    expect(passes('array.area', { total: 12, found }, r34)).toBe(false);
    expect(passes('array.area', { total: 12, found }, r26)).toBe(true);
    expect(rectanglesOf(total, 12)).toEqual([
      [2, 6],
      [3, 4],
      [4, 3],
      [6, 2],
    ]);
    expect(
      issuePaths(arrayBuild, {
        ...total,
        mode: 'new-way',
        found: [
          [2, 6],
          [3, 4],
        ],
      }),
    ).toEqual(['found']);
  });

  it('split: place a split line and type the total', () => {
    const split: WidgetConfigOf<'array-build'> = { ...dims, mode: 'split' };
    const target = { ...dimsTarget, requireSplit: true };
    expect(respond(arrayBuild, split, [act('split-at', { col: 1 })])).toBeNull();
    const r = respond(arrayBuild, split, [
      act('split-at', { col: 1 }),
      act('answer', { value: 12 }),
    ]);
    expect(r).toEqual({ kind: 'state', value: { rows: 3, cols: 4, split: 1, value: 12 } });
    expect(passes('array.dims', target, r)).toBe(true);
    // The split line stays inside the array; a drag does not change a shown array.
    const s = play(arrayBuild, split, [
      act('split-at', { col: 4 }),
      act('drag-rect', { rows: 1, cols: 1 }),
    ]);
    expect([s.split, s.rows, s.cols]).toEqual([null, 3, 4]);
  });

  it('read answers the typed number', () => {
    const read: WidgetConfigOf<'array-build'> = { ...dims, mode: 'read' };
    expect(
      respond(arrayBuild, read, [act('skip-count-rows'), act('answer', { value: 12 })]),
    ).toEqual({
      kind: 'number',
      value: 12,
    });
  });

  it('rejects arrays that do not fit or cannot exist', () => {
    expect(issuePaths(arrayBuild, { ...dims, rows: 7 })).toEqual(['rows']);
    expect(issuePaths(arrayBuild, { ...dims, mode: 'split', cols: 1 })).toEqual(['cols']);
    expect(
      issuePaths(arrayBuild, { ...abBase, mode: 'build-total', total: 49, maxRows: 6, maxCols: 6 }),
    ).toEqual(['total']);
  });

  it('feature values at the extremes', () => {
    const hard: WidgetConfigOf<'array-build'> = {
      ...abBase,
      mode: 'split',
      rows: 6,
      cols: 6,
      gridShown: false,
      maxRows: 10,
      maxCols: 10,
    };
    expect(arrayBuild.featureValues(hard, { kind: 'number', value: 36 })).toEqual({
      product: 3.5,
      'factor.over5': 1,
      'mode.buildTotal': 0,
      split: 1,
      'grid.off': 1,
    });
  });
});

// ---------- equal-groups ----------

describe('equal-groups', () => {
  const size: WidgetConfigOf<'equal-groups'> = {
    ...egBase,
    groups: 3,
    perGroup: 4,
    unknown: 'size',
    mode: 'build',
  };
  const target = { groups: 3, perGroup: 4, value: 4 };

  it('build with given containers: fill each and type the unknown', () => {
    const s0 = equalGroups.initialState(size);
    expect(s0.groups).toEqual([0, 0, 0]);
    const ops = [0, 1, 2].map((i) => act('fill-group', { index: i, count: 4 }));
    expect(respond(equalGroups, size, ops)).toBeNull();
    const r = respond(equalGroups, size, [...ops, act('answer', { value: 4 })]);
    expect(r).toEqual({ kind: 'state', value: { groups: [4, 4, 4], value: 4 } });
    expect(passes('groups.equal', target, r)).toBe(true);
    const unequal = respond(equalGroups, size, [
      act('fill-group', { index: 0, count: 5 }),
      act('fill-group', { index: 1, count: 4 }),
      act('fill-group', { index: 2, count: 3 }),
      act('answer', { value: 4 }),
    ]);
    expect(passes('groups.equal', target, unequal)).toBe(false);
  });

  it('build with unknown groups: the child adds containers, empty ones do not count', () => {
    const g: WidgetConfigOf<'equal-groups'> = { ...size, unknown: 'groups' };
    expect(equalGroups.initialState(g).groups).toEqual([]);
    const ops = [
      act('add-group'),
      act('add-group'),
      act('add-group'),
      act('add-group'),
      ...[0, 1, 2].map((i) => act('fill-group', { index: i, count: 4 })),
      act('answer', { value: 3 }),
    ];
    const r = respond(equalGroups, g, ops);
    expect(r).toEqual({ kind: 'state', value: { groups: [4, 4, 4, 0], value: 3 } });
    expect(passes('groups.equal', { groups: 3, perGroup: 4, value: 3 }, r)).toBe(true);
  });

  it('never adds more than maxGroups containers or overfills one', () => {
    const g: WidgetConfigOf<'equal-groups'> = { ...size, unknown: 'groups', maxGroups: 2 };
    const s = play(equalGroups, g, [
      act('add-group'),
      act('add-group'),
      act('add-group'),
      act('fill-group', { index: 0, count: 50 }),
    ]);
    expect(s.groups).toEqual([10, 0]);
  });

  it('read shows the groups and answers the typed number', () => {
    const read: WidgetConfigOf<'equal-groups'> = { ...egBase, groups: 3, perGroup: 4 };
    expect(equalGroups.initialState(read).groups).toEqual([4, 4, 4]);
    expect(
      respond(equalGroups, read, [
        act('fill-group', { index: 0, count: 1 }),
        act('answer', { value: 12 }),
      ]),
    ).toEqual({
      kind: 'number',
      value: 12,
    });
  });

  it('rejects groups beyond maxGroups', () => {
    expect(issuePaths(equalGroups, { ...size, groups: 7 })).toEqual(['maxGroups']);
    expect(issuePaths(equalGroups, { ...size, perGroup: 0 })).toEqual(['groups']);
  });

  it('feature values at the extremes', () => {
    expect(
      equalGroups.featureValues(
        { ...size, groups: 6, perGroup: 7, maxGroups: 8 },
        { kind: 'number', value: 7 },
      ),
    ).toEqual({
      product: 4.1,
      'factor.over5': 1,
      'unknown.size': 1,
      'unknown.groups': 0,
      'mode.build': 1,
    });
  });
});

// ---------- equal-share ----------

describe('equal-share', () => {
  const seven: WidgetConfigOf<'equal-share'> = { ...esBase, items: 7, recipients: 3 };
  const target = { items: 7, recipients: 3, allowLeftover: true, value: 1 };

  it('deals rounds, sets the leftover aside, and answers the shares', () => {
    const r = respond(equalShare, seven, [
      act('deal-round'),
      act('deal-round'),
      act('set-aside-leftover'),
      act('answer', { value: 1 }),
    ]);
    expect(r).toEqual({ kind: 'state', value: { shares: [2, 2, 2], leftover: 1, value: 1 } });
    expect(passes('share.fair', target, r)).toBe(true);
  });

  it('an unfinished deal is not fair: someone could get one more', () => {
    const r = respond(equalShare, seven, [act('deal-round'), act('answer', { value: 4 })]);
    expect(r).toMatchObject({ value: { shares: [1, 1, 1], leftover: 4 } });
    expect(passes('share.fair', { ...target, value: 4 }, r)).toBe(false);
  });

  it('deal gives from the pile and takes back with a negative count', () => {
    const s = play(equalShare, seven, [
      act('deal', { to: 0, count: 3 }),
      act('deal', { to: 0, count: -1 }),
      act('deal', { to: 9 }),
    ]);
    expect(s.shares).toEqual([2, 0, 0]);
    expect(s.pile).toBe(5);
    // Never more than the pile holds.
    expect(equalShare.apply(s, act('deal', { to: 1, count: 99 })).pile).toBe(0);
  });

  it('each without a leftover, and a leftover where none is allowed', () => {
    const six: WidgetConfigOf<'equal-share'> = {
      ...esBase,
      items: 6,
      recipients: 3,
      allowLeftover: false,
      ask: 'each',
    };
    expect(issuePaths(equalShare, six)).toEqual([]);
    const t = { items: 6, recipients: 3, allowLeftover: false, value: 2 };
    const r = respond(equalShare, six, [
      act('deal-round'),
      act('deal-round'),
      act('answer', { value: 2 }),
    ]);
    expect(passes('share.fair', t, r)).toBe(true);
    expect(
      passes(
        'share.fair',
        { ...t, items: 7 },
        { kind: 'state', value: { shares: [2, 2, 2], leftover: 1, value: 2 } },
      ),
    ).toBe(false);
  });

  it('fair-or-not and even-odd answer a choice', () => {
    const fair: WidgetConfigOf<'equal-share'> = {
      ...seven,
      ask: 'fair-or-not',
      predealt: [3, 2, 2],
    };
    expect(issuePaths(equalShare, fair)).toEqual([]);
    expect(equalShare.initialState(fair).pile).toBe(0);
    expect(respond(equalShare, fair, [act('answer', { id: 'no' })])).toEqual({
      kind: 'choice',
      id: 'no',
    });
    const evenOdd: WidgetConfigOf<'equal-share'> = { ...esBase, items: 7, ask: 'even-odd' };
    expect(issuePaths(equalShare, evenOdd)).toEqual([]);
    expect(respond(equalShare, evenOdd, [act('deal-round'), act('answer', { id: 'odd' })])).toEqual(
      { kind: 'choice', id: 'odd' },
    );
  });

  it('rejects contradictory configs', () => {
    expect(issuePaths(equalShare, { ...seven, ask: 'fair-or-not' })).toEqual(['predealt']);
    expect(issuePaths(equalShare, { ...seven, ask: 'even-odd' })).toEqual(['recipients']);
    expect(issuePaths(equalShare, { ...seven, allowLeftover: false })).toEqual(['allowLeftover']);
    expect(issuePaths(equalShare, { ...seven, ask: 'each', allowLeftover: false })).toEqual([
      'items',
    ]);
    expect(issuePaths(equalShare, { ...seven, predealt: [1, 1] })).toEqual(['predealt']);
  });

  it('feature values at the extremes', () => {
    expect(
      equalShare.featureValues(
        { ...seven, items: 21, recipients: 4, predealt: [1, 1, 1, 1] },
        { kind: 'choice', id: 'no' },
      ),
    ).toEqual({ items: 1.7, 'recipients.over2': 2, leftover: 1, predealt: 1 });
    expect(equalShare.featureValues(esBase, { kind: 'number', value: 0 }).leftover).toBe(1);
  });
});

// ---------- area-tiles ----------

describe('area-tiles', () => {
  // An L: two rows of three, with the top-right cell missing.
  const lMask = '110111';
  const tile: WidgetConfigOf<'area-tiles'> = {
    ...atBase,
    region: { w: 3, h: 2, mask: lMask },
    mode: 'tile',
  };

  it('tile: covering every region cell and typing the area', () => {
    const r = respond(areaTiles, tile, [
      act('fill-row', { r: 1 }),
      act('place-tile', { r: 0, c: 0 }),
      act('place-tile', { r: 0, c: 1 }),
      act('place-tile', { r: 0, c: 2 }), // outside the region: ignored
      act('answer', { value: 5 }),
    ]);
    expect(r).toEqual({ kind: 'state', value: { tiles: lMask, value: 5 } });
    expect(passes('tiles.cover', { mask: lMask, value: 5 }, r)).toBe(true);
    const gap = respond(areaTiles, tile, [act('fill-row', { r: 1 }), act('answer', { value: 3 })]);
    expect(passes('tiles.cover', { mask: lMask, value: 5 }, gap)).toBe(false);
  });

  it('place-tile with remove takes a tile away', () => {
    const s = play(areaTiles, tile, [
      act('fill-row', { r: 1 }),
      act('place-tile', { r: 1, c: 2, remove: true }),
    ]);
    expect(s.tiles).toEqual([false, false, false, true, true, false]);
  });

  it('decompose: split lines that cut the L into rectangles', () => {
    const dec: WidgetConfigOf<'area-tiles'> = { ...tile, mode: 'decompose' };
    const target = { mask: lMask, w: 3, h: 2, decompose: true, value: 5 };
    const v = respond(areaTiles, dec, [
      act('draw-split', { at: 2, dir: 'v' }),
      act('answer', { value: 5 }),
    ]);
    expect(v).toEqual({ kind: 'state', value: { splits: [{ dir: 'v', at: 2 }], value: 5 } });
    expect(passes('tiles.cover', target, v)).toBe(true);
    const h = respond(areaTiles, dec, [
      act('draw-split', { at: 1, dir: 'h' }),
      act('answer', { value: 5 }),
    ]);
    expect(passes('tiles.cover', target, h)).toBe(true);
    // A cut that leaves an L piece is not a decomposition into rectangles.
    const bad = respond(areaTiles, dec, [
      act('draw-split', { at: 1, dir: 'v' }),
      act('answer', { value: 5 }),
    ]);
    expect(passes('tiles.cover', target, bad)).toBe(false);
    // Drawing a line again erases it.
    const erased = respond(areaTiles, dec, [
      act('draw-split', { at: 2 }),
      act('draw-split', { at: 2 }),
      act('answer', { value: 5 }),
    ]);
    expect(passes('tiles.cover', target, erased)).toBe(false);
  });

  it('regionPieces follows the lines', () => {
    expect(
      regionPieces(3, 2, lMask, [{ dir: 'v', at: 2 }])
        .map((p) => p.length)
        .sort(),
    ).toEqual([1, 4]);
    expect(regionPieces(3, 2, '111111', []).length).toBe(1);
  });

  it('partition: rows and columns of unit squares (array.dims)', () => {
    const part: WidgetConfigOf<'area-tiles'> = {
      ...atBase,
      region: { w: 3, h: 2, mask: '111111' },
      mode: 'partition',
    };
    expect(areaTiles.toResponse(areaTiles.initialState(part))).toBeNull();
    const r = respond(areaTiles, part, [
      act('draw-split', { at: 1, dir: 'h' }),
      act('draw-split', { at: 1, dir: 'v' }),
      act('draw-split', { at: 2, dir: 'v' }),
    ]);
    expect(r).toEqual({ kind: 'state', value: { rows: 2, cols: 3 } });
    expect(passes('array.dims', { rows: 2, cols: 3, orientationMatters: true }, r)).toBe(true);
  });

  it('count and multiply answer the typed number', () => {
    const mult: WidgetConfigOf<'area-tiles'> = {
      ...atBase,
      region: { w: 3, h: 2, mask: '111111' },
      mode: 'multiply',
      sideLabels: true,
    };
    expect(
      respond(areaTiles, mult, [act('label-side', { side: 'top' }), act('answer', { value: 6 })]),
    ).toEqual({
      kind: 'number',
      value: 6,
    });
  });

  it('rejects regions that contradict the mode', () => {
    expect(issuePaths(areaTiles, { ...tile, mode: 'multiply' })).toEqual(['region.mask']);
    expect(issuePaths(areaTiles, { ...tile, region: { w: 2, h: 1, mask: '00' } })).toEqual([
      'region.mask',
    ]);
    expect(issuePaths(areaTiles, { ...tile, decimalGrid: true })).toEqual(['decimalGrid']);
  });

  it('feature values at the extremes', () => {
    expect(
      areaTiles.featureValues(
        {
          ...tile,
          region: { w: 7, h: 2, mask: '11111110111111' },
          mode: 'multiply',
          gridShown: false,
        },
        { kind: 'number', value: 13 },
      ),
    ).toEqual({ area: 1.2, 'grid.off': 1, rectilinear: 1, 'mode.multiply': 1, 'side.over5': 1 });
  });
});
