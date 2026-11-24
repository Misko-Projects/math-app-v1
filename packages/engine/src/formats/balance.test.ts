// The domain the balance widget draws (U04, #13): one test per bound of the schema, the child's
// undo and the pan's limit in `make-equal`, the answer control's range and the one source of
// the answer (`answerIssues`). The model's ops and responses are in formats-u04-equality.test.ts.

import type { AnswerSpec, WidgetAction, WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  BALANCE_N_MAX,
  BALANCE_PAN_MAX,
  BALANCE_PAN_OBJECTS_MAX,
  BALANCE_VALUES_MAX,
  BALANCE_WEIGHT_MAX,
  balance,
  balanceAnswerIssues,
  balanceEntryMax,
} from './balance';

type Config = WidgetConfigOf<'balance'>;

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };
const issues = (c: Config) => {
  const r = balance.configSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};
const play = (c: Config, ops: WidgetAction[]) =>
  ops.reduce((s, a) => balance.apply(s, a), balance.initialState(c));

const judge: Config = {
  format: 'balance',
  left: { terms: [{ n: 3 }, { op: '+' }, { n: 4 }] },
  right: { terms: [{ n: 7 }] },
  mode: 'judge',
  showTilt: false,
};
const fill: Config = {
  ...judge,
  mode: 'fill-blank',
  left: { terms: [{ n: 8 }, { op: '+' }, { n: 5 }] },
  right: { terms: [{ blank: 'x' }, { op: '+' }, { n: 6 }] },
};
const shells = (left: number, right: number): Config => ({
  format: 'balance',
  left: { terms: [{ object: 'shell', count: left }] },
  right: { terms: [{ object: 'shell', count: right }] },
  mode: 'make-equal',
  objectWeights: { shell: 1 },
  showTilt: true,
});
const blocks = (left: number, right: number): Config => ({
  format: 'balance',
  left: { terms: [{ n: left }] },
  right: { terms: [{ n: right }] },
  mode: 'make-equal',
  showTilt: true,
});

describe('balance: the bounds of what the widget draws', () => {
  it('accepts the shapes the shipped templates build', () => {
    for (const c of [judge, fill, shells(7, 5), blocks(15, 4)]) expect(issues(c)).toEqual([]);
  });

  it(`a number is whole, 0 to ${BALANCE_N_MAX}`, () => {
    const withN = (n: number): Config => ({ ...judge, right: { terms: [{ n }] } });
    expect(issues(withN(0))).toEqual([]);
    expect(issues(withN(BALANCE_N_MAX))).toEqual([]);
    for (const n of [BALANCE_N_MAX + 1, -1, 2.5]) {
      expect(issues(withN(n)).join()).toContain('a number is whole');
    }
  });

  it(`a side has at most ${BALANCE_VALUES_MAX} values`, () => {
    const three: Config = {
      ...judge,
      left: { terms: [{ n: 1 }, { op: '+' }, { n: 2 }, { op: '+' }, { n: 3 }] },
    };
    expect(issues(three).join()).toContain(`at most ${BALANCE_VALUES_MAX} values`);
  });

  it(`a pan draws 1 to ${BALANCE_PAN_OBJECTS_MAX} objects`, () => {
    const pan = (a: number, b: number): Config => ({
      ...judge,
      left: {
        terms: [{ object: 'shell', count: a }, { op: '+' }, { object: 'shell', count: b }],
      },
      objectWeights: { shell: 1 },
    });
    expect(issues(pan(10, 10))).toEqual([]);
    expect(issues(pan(10, 11)).join()).toContain('a pan draws');
    expect(issues(pan(0, 3)).join()).toContain('a pan draws');
  });

  it(`a hidden weight is whole, 1 to ${BALANCE_WEIGHT_MAX}`, () => {
    const weigh = (w: number): Config => ({
      format: 'balance',
      left: { terms: [{ object: 'pumpkin', count: 1 }] },
      right: { terms: [{ object: 'leaf', count: 1 }] },
      mode: 'which-heavier',
      objectWeights: { pumpkin: w, leaf: 2 },
      showTilt: true,
    });
    expect(issues(weigh(9))).toEqual([]);
    expect(issues(weigh(BALANCE_WEIGHT_MAX))).toEqual([]);
    for (const w of [0, BALANCE_WEIGHT_MAX + 1, 1.5]) {
      expect(issues(weigh(w)).join()).toContain('a weight is whole');
    }
  });

  it('a letter is one character', () => {
    const letter = (name: string): Config => ({
      ...fill,
      mode: 'judge',
      right: { terms: [{ letter: name }, { op: '+' }, { n: 6 }] },
    });
    expect(issues(letter('n'))).toEqual([]);
    expect(issues(letter('nn')).join()).toContain('a letter is one character');
  });

  it('fill-blank has exactly one box', () => {
    const two: Config = {
      ...fill,
      left: { terms: [{ n: 8 }, { op: '+' }, { blank: 'y' }] },
    };
    expect(issues(two).join()).toContain('fill-blank has one box');
  });

  it(`make-equal: each pan is worth a whole 0 to ${BALANCE_PAN_MAX}`, () => {
    expect(issues(blocks(BALANCE_PAN_MAX, 0))).toEqual([]);
    expect(issues(blocks(BALANCE_PAN_MAX + 1, 3)).join()).toContain('make-equal');
    // 3 − 5 is under zero: nothing to draw.
    const under: Config = {
      ...blocks(1, 1),
      left: { terms: [{ n: 3 }, { op: '-' }, { n: 5 }] },
    };
    expect(issues(under).join()).toContain('make-equal');
  });

  it('make-equal: a pan is numbers, or one kind of object weighing 1 each', () => {
    const mixed: Config = {
      ...shells(3, 2),
      left: { terms: [{ object: 'shell', count: 3 }, { op: '+' }, { n: 2 }] },
    };
    expect(issues(mixed).join()).toContain('make-equal');
    const twoKinds: Config = {
      ...shells(3, 2),
      left: {
        terms: [{ object: 'shell', count: 3 }, { op: '+' }, { object: 'crab', count: 2 }],
      },
      objectWeights: { shell: 1, crab: 1 },
    };
    expect(issues(twoKinds).join()).toContain('make-equal');
    const heavy: Config = { ...shells(3, 2), objectWeights: { shell: 2 } };
    expect(issues(heavy).join()).toContain('make-equal');
  });
});

describe('balance make-equal: the pan limit and the undo', () => {
  const unit = { object: 'shell', count: 1 };

  it('place {remove: true} takes one added unit off again, down to none', () => {
    const c = shells(7, 5);
    const s = play(c, [
      act('place', { side: 'right', term: unit }),
      act('place', { side: 'right', term: unit }),
      act('place', { side: 'right', term: unit, remove: true }),
    ]);
    expect(s.added).toEqual({ left: 0, right: 1 });
    expect(balance.toResponse(s)).toEqual({ kind: 'state', value: { left: 0, right: 1 } });
    const none = balance.apply(s, act('place', { side: 'right', term: unit, remove: true }));
    expect(none.added.right).toBe(0);
    expect(none.right).toEqual(c.right.terms);
    // Nothing added: nothing to take off, and the item's own objects stay.
    expect(balance.apply(none, act('place', { side: 'right', term: unit, remove: true }))).toBe(
      none,
    );
  });

  it('a demo placement of several units is undone one at a time', () => {
    const s = play(blocks(15, 4), [
      act('place', { side: 'right', term: { n: 1 }, count: 3 }),
      act('place', { side: 'right', term: { n: 1 }, remove: true }),
    ]);
    expect(s.added.right).toBe(2);
    expect(s.right).toEqual([{ n: 4 }, { op: '+' }, { n: 2 }]);
  });

  it(`a pan holds at most ${BALANCE_PAN_MAX}: a placement past it changes nothing`, () => {
    const c = shells(18, 5);
    const full = play(c, [
      act('place', { side: 'left', term: unit }),
      act('place', { side: 'left', term: unit }),
    ]);
    expect(full.added.left).toBe(2);
    expect(balance.apply(full, act('place', { side: 'left', term: unit }))).toBe(full);
    // A count that would pass the limit is refused whole.
    const s0 = balance.initialState(c);
    expect(balance.apply(s0, act('place', { side: 'left', term: unit, count: 3 }))).toBe(s0);
  });

  it('every answer of the domain can be entered: the light pan takes what it needs', () => {
    for (let left = 0; left <= BALANCE_PAN_MAX; left += 1) {
      for (let right = 0; right <= BALANCE_PAN_MAX; right += 1) {
        const c = blocks(left, right);
        const side = left < right ? 'left' : 'right';
        const need = Math.abs(left - right);
        const s = play(
          c,
          Array.from({ length: need }, () => act('place', { side, term: { n: 1 } })),
        );
        expect(s.added[side], `${left} and ${right}`).toBe(need);
      }
    }
  });
});

describe('balance: the answer control and the one source of the answer', () => {
  it('the entry range comes from what the pans show, never from the answer', () => {
    const turn: Config = {
      ...fill,
      left: { terms: [{ object: 'shell', count: 7 }, { op: '+' }, { object: 'shell', count: 1 }] },
      right: { terms: [{ object: 'shell', count: 1 }, { op: '+' }, { blank: 'x' }] },
      objectWeights: { shell: 1 },
    };
    expect(balanceEntryMax(turn)).toBe(10);
    expect(balanceEntryMax(fill)).toBe(20);
    // Additions only: the box is at most the larger side (9 + 9 = _ + 3: at most 18).
    const big: Config = {
      ...fill,
      left: { terms: [{ n: 9 }, { op: '+' }, { n: 9 }] },
      right: { terms: [{ blank: 'x' }, { op: '+' }, { n: 3 }] },
    };
    expect(balanceEntryMax(big)).toBe(20);
    // A subtraction can ask for both sides together (_ − 9 = 12 is 21).
    const minus: Config = {
      ...fill,
      left: { terms: [{ blank: 'x' }, { op: '-' }, { n: 9 }] },
      right: { terms: [{ n: 12 }] },
    };
    expect(balanceEntryMax(minus)).toBe(99);
    expect(balanceAnswerIssues(minus, { kind: 'number', value: 21 })).toEqual([]);
    const times: Config = {
      ...fill,
      left: { terms: [{ n: 6 }, { op: '×' }, { n: 7 }] },
      right: { terms: [{ blank: 'x' }] },
    };
    expect(balanceEntryMax(times)).toBe(99);
  });

  it('judge answers whether the sides weigh the same', () => {
    const yes: AnswerSpec = { kind: 'choice', id: 'true' };
    const no: AnswerSpec = { kind: 'choice', id: 'false' };
    expect(balanceAnswerIssues(judge, yes)).toEqual([]);
    expect(balanceAnswerIssues(judge, no)).not.toEqual([]);
    expect(balanceAnswerIssues(judge, { kind: 'number', value: 7 })).not.toEqual([]);
  });

  it('which-heavier answers the heavier pan, by the hidden weights', () => {
    const c: Config = {
      format: 'balance',
      left: { terms: [{ object: 'feather', count: 3 }] },
      right: { terms: [{ object: 'rock', count: 1 }] },
      mode: 'which-heavier',
      objectWeights: { feather: 1, rock: 8 },
      showTilt: true,
    };
    expect(balanceAnswerIssues(c, { kind: 'choice', id: 'right' })).toEqual([]);
    expect(balanceAnswerIssues(c, { kind: 'choice', id: 'left' })).not.toEqual([]);
  });

  it('fill-blank answers a whole number in range that makes the sides equal', () => {
    expect(balanceAnswerIssues(fill, { kind: 'number', value: 7 })).toEqual([]);
    expect(balanceAnswerIssues(fill, { kind: 'number', value: 8 })).not.toEqual([]);
    expect(balanceAnswerIssues(fill, { kind: 'number', value: 21 })).not.toEqual([]);
    expect(balanceAnswerIssues(fill, { kind: 'choice', id: 'true' })).not.toEqual([]);
  });

  it('make-equal is checked by balance.equal with what the pans weigh', () => {
    const c = shells(7, 5);
    const target = (left: number, right: number): AnswerSpec => ({
      kind: 'state',
      checker: 'balance.equal',
      target: { left, right },
    });
    expect(balanceAnswerIssues(c, target(7, 5))).toEqual([]);
    expect(balanceAnswerIssues(c, target(7, 4))).not.toEqual([]);
    expect(balanceAnswerIssues(c, { kind: 'number', value: 2 })).not.toEqual([]);
  });
});
