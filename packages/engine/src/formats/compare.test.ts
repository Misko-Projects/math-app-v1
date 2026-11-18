// 03 §5.5 compare: state model, widget schema and format features (U03).

import {
  type AnswerSpec,
  FORMAT_SUPPORT,
  type StimulusSpec,
  type WidgetAction,
  type WidgetConfigOf,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { compare, compareChoiceIds, compareSideValue } from './compare';
import { formatFeatures, formatModel, UnsupportedOpError } from './index';

type Config = WidgetConfigOf<'compare'>;

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };

const objects = (count: number, layoutSeed = 1): StimulusSpec => ({
  kind: 'objects',
  set: { count, sprite: 'fish', layout: 'line', layoutSeed },
});
const num = (v: number): StimulusSpec => ({
  kind: 'expression',
  expr: { tokens: [{ t: 'num', v }] },
});

/** An easy compare item: 1 fish against 9 (only closeness is above 0: min ÷ max = 1/9). */
const base: Config = {
  format: 'compare',
  left: objects(1),
  right: objects(9, 2),
  ask: 'more',
  allowMatchLines: false,
};
const matchable: Config = {
  ...base,
  left: objects(3),
  right: objects(5, 2),
  allowMatchLines: true,
};

function play(config: Config, ops: WidgetAction[]) {
  return ops.reduce((s, a) => compare.apply(s, a), compare.initialState(config));
}
const respond = (config: Config, ops: WidgetAction[]) => compare.toResponse(play(config, ops));
const issuePaths = (config: unknown) => {
  const r = compare.configSchema.safeParse(config);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('compare model', () => {
  it('is registered, with the 03 §5.5 ops in FORMAT_SUPPORT', () => {
    expect(formatModel('compare')).toBe(compare);
    expect(formatFeatures('compare')).toBe(compare.features);
    expect(FORMAT_SUPPORT.compare.ops).toEqual(['match', 'highlight', 'place-symbol']);
    expect(FORMAT_SUPPORT.compare.answers).toEqual(['choice']);
  });

  it.each([
    ['more', ['left', 'right', 'same']],
    ['fewer', ['left', 'right', 'same']],
    ['longer', ['left', 'right', 'same']],
    ['heavier', ['left', 'right', 'same']],
    ['same-or-not', ['same', 'not-same']],
    ['symbol', ['<', '=', '>']],
    ['true-false', ['true', 'false']],
  ] as const)('%s: answers with the ids %j, and nothing else', (ask, ids) => {
    const config: Config = { ...base, ask };
    expect(compareChoiceIds(ask)).toEqual(ids);
    expect(respond(config, [])).toBeNull();
    for (const id of ids) {
      expect(respond(config, [act('answer', { id })])).toEqual({ kind: 'choice', id });
    }
    // An id of another ask, or none at all, leaves nothing to submit.
    for (const id of ['left', 'not-same', '<', 'true', 'bogus'].filter(
      (x) => !ids.includes(x as never),
    )) {
      expect(respond(config, [act('answer', { id })])).toBeNull();
    }
    expect(respond(config, [act('answer')])).toBeNull();
  });

  it('the last answer wins', () => {
    expect(respond(base, [act('answer', { id: 'left' }), act('answer', { id: 'right' })])).toEqual({
      kind: 'choice',
      id: 'right',
    });
  });

  it('place-symbol puts the symbol between the sides and answers it (symbol asks only)', () => {
    const symbol: Config = { ...base, left: num(7), right: num(4), ask: 'symbol' };
    const s = play(symbol, [
      act('place-symbol', { symbol: '<' }),
      act('place-symbol', { symbol: '>' }),
    ]);
    expect(s.symbol).toBe('>');
    expect(compare.toResponse(s)).toEqual({ kind: 'choice', id: '>' });
    expect(play(symbol, [act('place-symbol', { symbol: '≠' })]).symbol).toBeNull();
    expect(play(base, [act('place-symbol', { symbol: '<' })]).symbol).toBeNull();
    // The generic answer op places the symbol too.
    expect(play(symbol, [act('answer', { id: '=' })]).symbol).toBe('=');
  });

  it('highlight records a side', () => {
    expect(play(base, [act('highlight', { side: 'right' })]).highlighted).toBe('right');
    expect(play(base, [act('highlight', { side: 'middle' })]).highlighted).toBeNull();
  });

  it('match pairs one object on each side; a new pair replaces an old one', () => {
    const s = play(matchable, [
      act('match', { left: 0, right: 0 }),
      act('match', { left: 1, right: 1 }),
      act('match', { left: 0, right: 2 }), // left 0 re-paired
      act('match', { left: 2, right: 1 }), // right 1 re-paired
    ]);
    expect(s.matches).toEqual([
      [0, 2],
      [2, 1],
    ]);
    // Matches are help, never the answer.
    expect(compare.toResponse(s)).toBeNull();
  });

  it.each([
    ['an index off the left side', { left: 3, right: 0 }],
    ['an index off the right side', { left: 0, right: 5 }],
    ['a negative index', { left: -1, right: 0 }],
    ['a fractional index', { left: 0.5, right: 0 }],
    ['missing args', {}],
  ])('match ignores %s', (_name, args) => {
    expect(play(matchable, [act('match', args)]).matches).toEqual([]);
  });

  it('match does nothing without allowMatchLines', () => {
    expect(play(base, [act('match', { left: 0, right: 0 })]).matches).toEqual([]);
  });

  it('an unsupported op throws UnsupportedOpError', () => {
    const s = compare.initialState(base);
    expect(() => compare.apply(s, act('drag'))).toThrow(UnsupportedOpError);
    expect(() => compare.apply(s, act('tap', { id: 'left' }))).toThrow(
      expect.objectContaining({ format: 'compare', op: 'tap' }),
    );
  });

  it('apply is pure', () => {
    const s = Object.freeze(compare.initialState(matchable));
    const next = compare.apply(s, act('match', { left: 0, right: 1 }));
    expect(s.matches).toEqual([]);
    expect(next.matches).toEqual([[0, 1]]);
  });
});

describe('compare schema', () => {
  it.each([
    ['objects (the shared sample)', { ...base, left: objects(3), right: objects(5) }],
    ['numerals with a symbol ask', { ...base, left: num(12), right: num(21), ask: 'symbol' }],
    ['match lines on two object sets', matchable],
    [
      'a true-false statement on the left alone',
      {
        ...base,
        left: {
          kind: 'expression',
          expr: {
            tokens: [
              { t: 'num', v: 3 },
              { t: 'op', v: '+' },
              { t: 'num', v: 4 },
              { t: 'rel', v: '=' },
              { t: 'num', v: 7 },
            ],
          },
        },
        right: { kind: 'none' },
        ask: 'true-false',
      },
    ],
  ] as const)('accepts %s', (_name, config) => {
    expect(issuePaths(config)).toEqual([]);
  });

  it.each([
    ['no left side', { ...base, left: { kind: 'none' } }, 'left'],
    ['no right side (not true-false)', { ...base, right: { kind: 'none' } }, 'right'],
    [
      'match lines without objects',
      { ...base, left: num(3), allowMatchLines: true },
      'allowMatchLines',
    ],
    [
      'a symbol ask whose side already has a relation',
      {
        ...base,
        ask: 'symbol',
        left: {
          kind: 'expression',
          expr: {
            tokens: [
              { t: 'num', v: 3 },
              { t: 'rel', v: '?' },
            ],
          },
        },
        right: num(4),
      },
      'left',
    ],
    [
      'a symbol ask with a blank',
      {
        ...base,
        ask: 'symbol',
        left: num(3),
        right: { kind: 'expression', expr: { tokens: [{ t: 'blank', id: 'b' }] } },
      },
      'right',
    ],
    ['an unknown ask', { ...base, ask: 'bigger' }, 'ask'],
  ] as const)('rejects %s', (_name, config, path) => {
    expect(issuePaths(config)).toContain(path);
  });
});

describe('compare features (03 §5.5)', () => {
  const answer = (id: string): AnswerSpec => ({ kind: 'choice', id });

  it('lists the spec weights', () => {
    expect(
      Object.fromEntries(Object.entries(compare.features).map(([k, f]) => [k, f.weight])),
    ).toEqual({
      closeness: 1.0,
      conflict: 0.8,
      'ask.fewer': 0.3,
      'ask.symbol': 0.4,
      equal: 0.4,
      magnitude: 0.3,
    });
  });

  it('an easy item scores only its closeness', () => {
    const v = compare.featureValues(base, answer('right'));
    expect(Object.keys(v).sort()).toEqual(Object.keys(compare.features).sort());
    expect(v).toEqual({
      closeness: 1 / 9,
      conflict: 0,
      'ask.fewer': 0,
      'ask.symbol': 0,
      equal: 0,
      magnitude: 0,
    });
  });

  it.each([
    [
      'close numerals with a symbol',
      { ...base, left: num(19), right: num(21), ask: 'symbol' },
      '<',
      {
        closeness: 19 / 21,
        'ask.symbol': 1,
        magnitude: 1,
      },
    ],
    [
      'equal sets, fewer',
      { ...base, left: objects(6), right: objects(6, 3), ask: 'fewer' },
      'same',
      {
        closeness: 1,
        'ask.fewer': 1,
        equal: 1,
      },
    ],
    [
      'three-digit sums',
      {
        ...base,
        left: {
          kind: 'expression',
          expr: {
            tokens: [
              { t: 'num', v: 100 },
              { t: 'op', v: '+' },
              { t: 'num', v: 2 },
              { t: 'op', v: '×' },
              { t: 'num', v: 10 },
            ],
          },
        },
        right: num(60),
        ask: 'symbol',
      },
      '>',
      { closeness: 0.5, 'ask.symbol': 1, magnitude: 2 },
    ],
    [
      'a picture whose value cannot be read (fractions)',
      {
        ...base,
        left: { kind: 'fraction', shape: 'circle', parts: 4, shaded: 1, equalParts: true },
        right: num(2),
      },
      'right',
      {},
    ],
  ] as const)('%s', (_name, config, id, expected) => {
    const v = compare.featureValues(config as Config, answer(id));
    expect(v).toEqual({
      closeness: 0,
      conflict: 0,
      'ask.fewer': 0,
      'ask.symbol': 0,
      equal: 0,
      magnitude: 0,
      ...expected,
    });
  });

  it('equal comes from the answer when the values cannot be read', () => {
    const shapes: Config = {
      ...base,
      left: { kind: 'fraction', shape: 'bar', parts: 2, shaded: 1, equalParts: true },
      right: { kind: 'fraction', shape: 'bar', parts: 4, shaded: 2, equalParts: true },
      ask: 'symbol',
    };
    expect(compare.featureValues(shapes, answer('=')).equal).toBe(1);
  });

  it.each([
    [objects(4), 4],
    [{ kind: 'dots', arrangement: 'dice', groups: [3, 2] }, 5],
    [{ kind: 'ten-frame', frames: 2, filled: [10, 3] }, 13],
    [{ kind: 'rekenrek', rows: [5, 2] }, 7],
    [{ kind: 'groups', groups: 3, perGroup: 4, sprite: 'shell' }, 12],
    [{ kind: 'array', rows: 2, cols: 5 }, 10],
    [{ kind: 'base-ten', hundreds: 1, tens: 2, ones: 3 }, 123],
    [{ kind: 'base-ten', hundreds: 1, tens: 2, ones: 3, wholeIs: 'flat' }, null],
    [{ kind: 'coins', coins: ['dime', 'nickel', 'penny'], bills: [1] }, 116],
    [
      { kind: 'number-line', min: 0, max: 10, ticksEvery: 1, labelsEvery: 1, marks: [{ at: 6 }] },
      6,
    ],
    [{ kind: 'number-line', min: 0, max: 10, ticksEvery: 1, labelsEvery: 1 }, null],
    [{ kind: 'expression', expr: { tokens: [{ t: 'money', cents: 45, style: 'cents' }] } }, 45],
    [
      {
        kind: 'expression',
        expr: {
          tokens: [
            { t: 'num', v: 9 },
            { t: 'op', v: '-' },
            { t: 'num', v: 6 },
            { t: 'op', v: '÷' },
            { t: 'num', v: 2 },
          ],
        },
      },
      6,
    ],
    [{ kind: 'expression', expr: { tokens: [{ t: 'var', name: 'n' }] } }, null],
    [{ kind: 'clock', h: 3, m: 0, numerals: true }, null],
  ] as const)('compareSideValue(%j) = %s', (spec, value) => {
    expect(compareSideValue(spec as StimulusSpec)).toBe(value);
  });
});
