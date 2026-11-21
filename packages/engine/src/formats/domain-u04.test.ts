// The supported numeric domain of the place-value formats (PR #74): a config outside it is
// rejected by the format model's schema with a message that names the bound. The content checks
// validate every generated item with the same schema. One test per bound.
import type { WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { MAT_MAX, MAT_MAX_FLAT, targetMax } from './base-ten-build';
import {
  TRADE_ADD_OPERAND_HUNDREDS_MAX,
  TRADE_ADD_START_HUNDREDS_MAX,
  TRADE_ALL_ONES_MAX,
  TRADE_COLUMN_MAX,
  TRADE_REGROUP_COLUMN_MAX,
  TRADE_TAKE_COUNT_MAX,
  TRADE_VALUE_MAX,
} from './base-ten-trade';
import {
  EF_BLANKS_MAX,
  EF_CARD_MAX,
  EF_CARDS_MAX,
  EF_TARGET_MAX,
  EF_TOKENS_MAX,
  EF_WORD_OPTIONS_MAX,
} from './expanded-form';
import { formatModel } from './index';

type Build = WidgetConfigOf<'base-ten-build'>;
type Trade = WidgetConfigOf<'base-ten-trade'>;
type Expanded = WidgetConfigOf<'expanded-form'>;

const messages = (format: 'base-ten-build' | 'base-ten-trade' | 'expanded-form', c: unknown) => {
  const model = formatModel(format);
  if (!model) throw new Error(`no model for ${format}`);
  const r = model.configSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('base-ten-build: supported domain', () => {
  const ALL = { thousands: true, hundreds: true, tens: true, ones: true };
  const build = (over: Partial<Build>): Build => ({
    format: 'base-ten-build',
    target: 34,
    mode: 'build',
    pieces: ALL,
    wholeIs: 'unit',
    ...over,
  });
  const read = (prebuilt: NonNullable<Build['prebuilt']>, target: number): Build =>
    build({ mode: 'read', target, prebuilt });

  it('a build target is at most 9999', () => {
    expect(messages('base-ten-build', build({ target: 9999 }))).toEqual([]);
    expect(messages('base-ten-build', build({ target: 10_000 }))).toEqual([
      'target: the mat would need 10 thousands; it fits at most 9',
    ]);
  });

  it('any target is at most a full mat, on the whole mat and the decimal one', () => {
    expect(targetMax({ wholeIs: 'unit' })).toBe(11_389);
    expect(targetMax({ wholeIs: 'flat' })).toBe(10_889);
    const full = { ...MAT_MAX };
    expect(messages('base-ten-build', read(full, 11_389))).toEqual([]);
    expect(messages('base-ten-build', read(full, 11_390))).toEqual([
      'target: target is at most 11389 (a full mat); got 11390',
    ]);
    expect(
      messages('base-ten-build', { ...read({ ...MAT_MAX_FLAT }, 10_890), wholeIs: 'flat' }),
    ).toEqual(['target: target is at most 10889 (a full mat); got 10890']);
    expect(messages('base-ten-build', build({ target: 1e21 }))[0]).toMatch(/^target: target is/);
  });

  it('a target is a whole number of ones, at least 1', () => {
    for (const target of [0, -5, 3.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(messages('base-ten-build', build({ target })), String(target)).not.toEqual([]);
    }
  });

  it.each(['hundreds', 'tens', 'ones'] as const)('limits.%s is at most the mat cap', (k) => {
    for (const mode of ['build', 'read'] as const) {
      const base =
        mode === 'read' ? read({ hundreds: 0, tens: 3, ones: 4 }, 34) : build({ target: 34 });
      expect(messages('base-ten-build', { ...base, limits: { [k]: MAT_MAX[k] } })).toEqual([]);
      expect(messages('base-ten-build', { ...base, limits: { [k]: MAT_MAX[k] + 1 } })).toContain(
        `limits.${k}: limits.${k} is at most ${MAT_MAX[k]} (what the mat fits); got ${MAT_MAX[k] + 1}`,
      );
      expect(messages('base-ten-build', { ...base, limits: { [k]: -1 } })).not.toEqual([]);
      expect(messages('base-ten-build', { ...base, limits: { [k]: 1.5 } })).not.toEqual([]);
    }
  });

  it.each(['hundreds', 'tens', 'ones'] as const)('exact.%s is at most the mat cap', (k) => {
    // Also in a mode that never reads `exact`.
    for (const mode of ['build', 'build-exact'] as const) {
      const c = build({ mode, target: 34, exact: { [k]: MAT_MAX[k] + 1 } });
      expect(messages('base-ten-build', c)).toContain(
        `exact.${k}: exact.${k} is at most ${MAT_MAX[k]} (what the mat fits); got ${MAT_MAX[k] + 1}`,
      );
    }
    expect(messages('base-ten-build', build({ exact: { [k]: MAT_MAX[k] } }))).toEqual([]);
  });

  it.each(['thousands', 'hundreds', 'tens', 'ones'] as const)(
    'prebuilt.%s is at most the mat cap',
    (k) => {
      const value = { thousands: 1000, hundreds: 100, tens: 10, ones: 1 } as const;
      const at = (n: number) => read({ hundreds: 0, tens: 0, ones: 0, [k]: n }, n * value[k]);
      expect(messages('base-ten-build', at(MAT_MAX[k]))).toEqual([]);
      expect(messages('base-ten-build', at(MAT_MAX[k] + 1))).toEqual([
        `prebuilt.${k}: the mat would need ${MAT_MAX[k] + 1} ${k}; it fits at most ${MAT_MAX[k]}`,
      ]);
    },
  );
});

describe('base-ten-trade: supported domain', () => {
  const hto = (hundreds: number, tens: number, ones: number) => ({ hundreds, tens, ones });
  const compute = (
    op: '+' | '-',
    start: Trade['start'],
    operand: Trade['start'],
    over: Partial<Trade> = {},
  ): Trade => ({
    format: 'base-ten-trade',
    start,
    goal: 'compute',
    operation: { op, operand },
    showAlgorithm: true,
    thenAsk: true,
    ...over,
  });
  const regroup = (start: Trade['start'], regroupTarget: Trade['start']): Trade => ({
    format: 'base-ten-trade',
    start,
    goal: 'regroup-to',
    regroupTarget,
    showAlgorithm: false,
    thenAsk: false,
  });

  it('states its bounds', () => {
    expect(TRADE_VALUE_MAX).toBe(999);
    expect(TRADE_COLUMN_MAX).toBe(9);
    expect(TRADE_REGROUP_COLUMN_MAX).toEqual({ hundreds: 9, tens: 19, ones: 19 });
  });

  it.each(['hundreds', 'tens', 'ones'] as const)(
    'compute: a start or operand column (%s) holds at most 9',
    (k) => {
      const ten = { ...hto(1, 1, 1), [k]: TRADE_COLUMN_MAX + 1 };
      expect(messages('base-ten-trade', compute('-', ten, hto(0, 0, 1)))).toContain(
        `start.${k}: a compute item writes each number with at most 9 in a column; got 10`,
      );
      expect(messages('base-ten-trade', compute('-', hto(9, 9, 9), ten))[0]).toBe(
        `operation.operand.${k}: a compute item writes each number with at most 9 in a column; got 10`,
      );
      expect(messages('base-ten-trade', compute('-', hto(9, 9, 9), hto(9, 9, 9)))).toEqual([]);
    },
  );

  it('compute: a sum is at most 999 and a difference at least 0', () => {
    expect(messages('base-ten-trade', compute('+', hto(8, 9, 9), hto(1, 0, 0)))).toEqual([]);
    expect(messages('base-ten-trade', compute('+', hto(8, 9, 9), hto(1, 0, 1)))).toEqual([
      'operation: the result is at most 999 (the mat has no thousands column); got 1000',
    ]);
    expect(messages('base-ten-trade', compute('-', hto(1, 0, 0), hto(1, 0, 1)))).toEqual([
      'operation: the result is negative',
    ]);
  });

  it('compute: an addition starts with at most 8 hundreds and adds at most 2', () => {
    expect(TRADE_ADD_START_HUNDREDS_MAX).toBe(8);
    expect(TRADE_ADD_OPERAND_HUNDREDS_MAX).toBe(2);
    expect(messages('base-ten-trade', compute('+', hto(7, 0, 0), hto(2, 9, 9)))).toEqual([]);
    expect(messages('base-ten-trade', compute('+', hto(8, 9, 0), hto(1, 0, 9)))).toEqual([]);
    expect(messages('base-ten-trade', compute('+', hto(9, 0, 0), hto(0, 9, 9)))).toEqual([
      'start.hundreds: an addition starts with at most 8 hundreds on the mat; got 9',
    ]);
    expect(messages('base-ten-trade', compute('+', hto(1, 0, 0), hto(3, 0, 0)))).toEqual([
      "operation.operand.hundreds: an addition's tray holds at most 2 hundreds; got 3",
    ]);
    // A subtraction has nothing waiting: both numbers may hold nine hundreds.
    expect(messages('base-ten-trade', compute('-', hto(9, 0, 0), hto(9, 0, 0)))).toEqual([]);
  });

  it('bounds the fields a goal does not read', () => {
    expect(
      messages('base-ten-trade', {
        ...regroup(hto(0, 3, 4), hto(0, 2, 14)),
        operation: { op: '+', operand: hto(1e6, 0, 0) },
      }),
    ).toEqual(['operation.operand: the mat shows at most 999; got 100000000']);
    expect(
      messages(
        'base-ten-trade',
        compute('-', hto(0, 4, 2), hto(0, 1, 5), { regroupTarget: hto(0, 0, 1e6) }),
      ),
    ).toEqual(['regroupTarget: the mat shows at most 999; got 1000000']);
  });

  it.each(['hundreds', 'tens', 'ones'] as const)(
    'regroup-to: a start or target column (%s) is at most its cap',
    (k) => {
      const cap = TRADE_REGROUP_COLUMN_MAX[k];
      const over = { ...hto(1, 1, 1), [k]: cap + 1 };
      const got = messages('base-ten-trade', regroup(over, over));
      const beside = k === 'ones' ? ' beside other pieces (99 alone)' : '';
      expect(got).toEqual([
        `start.${k}: a regroup-to mat holds at most ${cap} ${k}${beside}; got ${cap + 1}`,
        `regroupTarget.${k}: a regroup-to mat holds at most ${cap} ${k}${beside}; got ${cap + 1}`,
      ]);
    },
  );

  it('regroup-to: a mat of ones alone holds at most 99', () => {
    expect(TRADE_ALL_ONES_MAX).toBe(99);
    expect(messages('base-ten-trade', regroup(hto(0, 0, 99), hto(0, 9, 9)))).toEqual([]);
    expect(messages('base-ten-trade', regroup(hto(0, 0, 100), hto(1, 0, 0)))).toEqual([
      'start.ones: a regroup-to mat holds at most 99 ones; got 100',
    ]);
    expect(messages('base-ten-trade', regroup(hto(0, 1, 20), hto(0, 3, 0)))).toEqual([
      'start.ones: a regroup-to mat holds at most 19 ones beside other pieces (99 alone); got 20',
    ]);
  });

  it('regroup-to: the number is at most 999, shown with up to 19 tens and 19 ones', () => {
    expect(messages('base-ten-trade', regroup(hto(9, 9, 9), hto(8, 18, 19)))).toEqual([]);
    expect(messages('base-ten-trade', regroup(hto(9, 19, 0), hto(9, 18, 10)))).toEqual([
      'start: the mat shows at most 999; got 1090',
    ]);
  });

  it('take: a count is a whole number within ±99; a negative count puts taken pieces back', () => {
    const model = formatModel('base-ten-trade');
    if (!model) throw new Error('no model');
    const take = (s: unknown, column: string, count: number) =>
      model.apply(s as never, { op: 'take', args: { column, count } }) as unknown as {
        mat: Trade['start'];
        taken: Trade['start'];
      };
    const start = model.initialState(compute('-', hto(0, 3, 12), hto(0, 1, 5), { thenAsk: false }));
    expect(TRADE_TAKE_COUNT_MAX).toBe(99);
    // One take too many (six ones for 42 − 15), then one put back.
    const six = take(start, 'ones', 6);
    expect(six.mat).toEqual(hto(0, 3, 6));
    const back = take(six, 'ones', -1);
    expect(back.mat).toEqual(hto(0, 3, 7));
    expect(back.taken).toEqual(hto(0, 0, 5));
    // Never more than were taken, and never from a column nothing was taken from.
    expect(take(six, 'ones', -99).mat).toEqual(hto(0, 3, 12));
    expect(take(six, 'tens', -1)).toBe(six);
    expect(take(start, 'ones', -1)).toBe(start);
    // Out of bounds or not whole: ignored.
    for (const bad of [100, -100, 1.5, -0.5, 1e9, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(take(six, 'ones', bad), String(bad)).toBe(six);
    }
    expect(take(six, 'ones', 99).mat).toEqual(hto(0, 3, 0));
    // An addition has nothing to put back.
    const add = model.initialState(compute('+', hto(0, 2, 7), hto(0, 1, 5)));
    expect(take(add, 'ones', -1)).toBe(add);
  });

  it('rejects counts that are not whole or are negative', () => {
    expect(messages('base-ten-trade', regroup(hto(0, 1.5, 0), hto(0, 1.5, 0)))).not.toEqual([]);
    expect(messages('base-ten-trade', regroup(hto(0, -1, 20), hto(0, 1, 0)))).not.toEqual([]);
    expect(messages('base-ten-trade', regroup(hto(0, 1e9, 0), hto(1e8, 0, 0)))).not.toEqual([]);
  });
});

describe('expanded-form: supported domain', () => {
  const build = (over: Partial<Expanded>): Expanded => ({
    format: 'expanded-form',
    target: 345,
    mode: 'build',
    cards: [300, 40, 5],
    unusualOrder: false,
    ...over,
  });
  const sum = (terms: (number | string)[], total: number): Expanded['expression'] => ({
    tokens: [
      ...terms.flatMap((v, i) => [
        ...(i > 0 ? [{ t: 'op' as const, v: '+' as const }] : []),
        typeof v === 'number' ? { t: 'num' as const, v } : { t: 'blank' as const, id: v },
      ]),
      { t: 'rel', v: '=' },
      { t: 'num', v: total },
    ],
  });

  it('target is a whole number from 1 to 9999', () => {
    expect(EF_TARGET_MAX).toBe(9999);
    expect(messages('expanded-form', build({ target: 9999, cards: [9000, 900, 90, 9] }))).toEqual(
      [],
    );
    for (const target of [10_000, 0, -3, 34.5, 1e21, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(messages('expanded-form', build({ target }))[0], String(target)).toMatch(
        /^target: (target is a whole number from 1 to 9999; got|Invalid input)/,
      );
    }
  });

  it('holds at most seven cards', () => {
    const seven = [300, 40, 5, 400, 30, 50, 3];
    expect(seven).toHaveLength(EF_CARDS_MAX);
    expect(messages('expanded-form', build({ cards: seven }))).toEqual([]);
    expect(messages('expanded-form', build({ cards: [...seven, 500] }))).toEqual([
      'cards: at most 7 cards fit the tray; got 8',
    ]);
  });

  it('a card is a whole number from 1 to 90000 (one place past the target)', () => {
    expect(EF_CARD_MAX).toBe(90_000);
    expect(messages('expanded-form', build({ cards: [300, 40, 5, 90_000] }))).toEqual([]);
    for (const bad of [90_001, 0, -40, 2.5]) {
      expect(messages('expanded-form', build({ cards: [300, 40, 5, bad] }))).toEqual([
        `cards.3: a card is a whole number from 1 to 90000; got ${bad}`,
      ]);
    }
  });

  it('an expression has at most four blanks', () => {
    const fill = (expression: Expanded['expression'], target = 9999) =>
      build({ mode: 'fill', target, cards: undefined, expression });
    const four = sum(['a', 'b', 'c', 'd'], 9999);
    expect(messages('expanded-form', fill(four))).toEqual([]);
    expect(messages('expanded-form', fill(sum(['a', 'b', 'c', 'd', 'e'], 9999)))).toEqual([
      `expression.tokens: at most ${EF_BLANKS_MAX} blanks (one a place); got 5`,
    ]);
  });

  it('an expression has at most seventeen tokens (three bracketed pairs)', () => {
    type Tokens = NonNullable<Expanded['expression']>['tokens'];
    const pair = (a: number, b: number): Tokens => [
      { t: 'paren', v: '(' },
      { t: 'num', v: a },
      { t: 'op', v: '+' },
      { t: 'num', v: b },
      { t: 'paren', v: ')' },
    ];
    const plus = { t: 'op', v: '+' } as const;
    const grouped: Tokens = [...pair(300, 200), plus, ...pair(40, 30), plus, ...pair(7, 2)];
    expect(grouped).toHaveLength(EF_TOKENS_MAX);
    const std = (tokens: Tokens) =>
      build({ mode: 'to-standard', target: 579, cards: undefined, expression: { tokens } });
    expect(messages('expanded-form', std(grouped))).toEqual([]);
    expect(messages('expanded-form', std([...grouped, plus]))).toEqual([
      'expression.tokens: at most 17 expression tokens fit; got 18',
    ]);
  });

  it('a term is a whole number from 0 to 9999', () => {
    const std = (expression: Expanded['expression']) =>
      build({ mode: 'to-standard', target: 3405, cards: undefined, expression });
    expect(messages('expanded-form', std(sum([3000, 400, 0, 5], 3405)))).toEqual([]);
    for (const bad of [10_000, -5, 0.5]) {
      expect(messages('expanded-form', std(sum([3000, bad], 3405)))).toEqual([
        `expression.tokens.2.v: a term is a whole number from 0 to 9999; got ${bad}`,
      ]);
    }
  });

  it('an expression has numbers, signs, brackets and blanks only', () => {
    const c = build({
      mode: 'to-standard',
      cards: undefined,
      expression: { tokens: [{ t: 'money', cents: 1e12, style: 'cents' }] },
    });
    expect(messages('expanded-form', c)).toEqual([
      'expression.tokens.0: an expanded expression has numbers, signs, brackets and blanks only; got a money token',
    ]);
  });

  it('holds at most four word cards', () => {
    const options = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `o${i}`, words: 'ui.widget.ef.story.w3405' }));
    const words = (n: number) =>
      build({ mode: 'words', cards: undefined, wordOptions: options(n) });
    expect(messages('expanded-form', words(EF_WORD_OPTIONS_MAX))).toEqual([]);
    expect(messages('expanded-form', words(5))).toEqual([
      'wordOptions: at most 4 word cards fit; got 5',
    ]);
  });

  it('digitIndex names a digit of the target', () => {
    const digit = (digitIndex: number) =>
      build({ mode: 'digit-value', target: 3475, cards: undefined, digitIndex });
    expect(messages('expanded-form', digit(3))).toEqual([]);
    expect(messages('expanded-form', digit(4))).toEqual([
      'digitIndex: digit-value needs a digit of the target',
    ]);
  });
});
