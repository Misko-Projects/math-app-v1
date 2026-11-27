// mul.facts (03 §5.6, K02 slice 3b). Over every factor pair 0–10 and every family, strategy and
// form a format accepts: the item builds, its worked solution replays to a correct response, the
// asked values are the strategy's steps and the product, and no picture is drawn for a factor 0.

import type {
  ExpressionToken,
  GeneratedItem,
  ItemFormat,
  ItemTemplate,
  ParamValues,
  Representation,
  Tier,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { ARRAY_SIDE_MAX } from '../../formats/array-build';
import { checkResponse } from '../../items/check';
import { generateItemFromParams } from '../../items/generate';
import { itemSolution, replaySteps } from '../../items/solution';
import {
  multiplyInsteadOfDivide,
  neighbourFact,
  toldNumberBack,
} from '../../misconceptions/rules/division';
import {
  addInsteadOfMultiply,
  doubleOnce,
  partialProductDropped,
  skipCountSlip,
  tensDropped,
  timesZeroKeeps,
} from '../../misconceptions/rules/multiplication';
import {
  BAR_PARTS_MAX,
  easyPair,
  FACT_FAMILIES,
  FACT_OPS,
  FACT_STRATEGIES,
  FACT_UNKNOWNS,
  FACTOR_MAX,
  factPlan,
  mulFacts,
  pickSet,
  THREE_PRODUCT_MAX,
} from './facts';
import { mulTens, TENS_A_MAX, TENS_A_MIN, TENS_B_MAX, TENS_READ_MAX, tensPlan } from './tens';

let nextId = 0;
const tpl = (format: ItemFormat, tier: Tier, representation: Representation): ItemTemplate => {
  nextId += 1;
  return {
    id: `T.mul.facts.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier,
    representation,
    generator: 'mul.facts',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  } as ItemTemplate;
};

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

function solved(t: ItemTemplate, params: ParamValues): GeneratedItem {
  const item = generateItemFromParams(t, params, { checkConstraints: false });
  const replayed = replaySteps(item, itemSolution(item, t));
  expect(
    replayed && checkResponse(item, replayed).correct,
    `${t.format} ${t.representation} ${JSON.stringify(params)}`,
  ).toBe(true);
  return item;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

/** The value of a sentence's left and right sides with the asked values filled in. */
function sides(tokens: ExpressionToken[], values: number[]): number[] {
  let k = 0;
  const parts: string[][] = [[]];
  for (const t of tokens) {
    if (t.t === 'rel') parts.push([]);
    else if (t.t === 'num') parts.at(-1)?.push(String(t.v));
    else if (t.t === 'blank') parts.at(-1)?.push(String(values[k++]));
    else if (t.t === 'op') parts.at(-1)?.push(t.v === '×' ? '*' : t.v);
  }
  // Only + - × and integers: evaluate with precedence.
  return parts.map((p) => {
    const terms: number[] = [];
    let sign = 1;
    let prod = 1;
    for (let i = 0; i < p.length; i += 1) {
      const x = p[i] as string;
      if (x === '*') continue;
      if (x === '+' || x === '-') {
        terms.push(sign * prod);
        sign = x === '+' ? 1 : -1;
        prod = 1;
      } else prod *= Number(x);
    }
    terms.push(sign * prod);
    return terms.reduce((s, v) => s + v, 0);
  });
}

describe('mul.facts', () => {
  const cases: [ItemFormat, Tier, Representation, string][] = [
    ['number-pad', 'abstract', 'symbols', 'read'],
    ['number-pad', 'pictorial', 'array', 'read'],
    ['number-pad', 'pictorial', 'groups', 'read'],
    ['number-pad', 'pictorial', 'number-line', 'read'],
    ['equal-groups', 'concrete', 'groups', 'read'],
    ['array-build', 'pictorial', 'array', 'read'],
    ['array-build', 'pictorial', 'array', 'split'],
    ['array-build', 'pictorial', 'tiles', 'split'],
  ];
  it.each(cases)(
    '%s %s %s (%s): every accepted draw solves and is true',
    (format, tier, rep, mode) => {
      const t = tpl(format, tier, rep);
      let built = 0;
      for (const family of FACT_FAMILIES) {
        for (const strategy of FACT_STRATEGIES) {
          for (const form of ['fact', 'turn-around']) {
            for (const a of range(0, FACTOR_MAX)) {
              for (const b of range(0, FACTOR_MAX)) {
                const p: ParamValues = { a, b, family, strategy, form, mode, sprite: 'shell' };
                if (!mulFacts.accepts?.(p, t)) continue;
                const item = solved(t, p);
                built += 1;
                const plan = factPlan(p);
                // The sentence is true with the asked values, every side equal to a × b.
                if (item.widget.format === 'number-pad') {
                  const tokens = item.widget.expression?.tokens ?? [];
                  const s = sides(tokens, plan.values);
                  for (const v of s) expect(v, JSON.stringify(p)).toBe(a * b);
                  // The total is never shown, only asked.
                  if (strategy !== 'none') {
                    expect(
                      tokens.some((tk) => tk.t === 'num' && tk.v === a * b && a * b > 10),
                    ).toBe(false);
                  }
                  if (rep === 'symbols') expect(item.widget.stimulus.kind).toBe('none');
                }
                if (rep !== 'symbols' || format !== 'number-pad') {
                  expect(a > 0 && b > 0, JSON.stringify(p)).toBe(true);
                }
              }
            }
          }
        }
      }
      expect(built).toBeGreaterThan(0);
    },
  );

  it('asks the strategy steps, then the total, for both orders, squares, 1 and 0', () => {
    expect(factPlan({ a: 4, b: 7, strategy: 'double', family: 'x4' }).values).toEqual([14, 14, 28]);
    expect(factPlan({ a: 7, b: 4, strategy: 'double', family: 'x4' }).values).toEqual([14, 14, 28]);
    expect(factPlan({ a: 8, b: 8, strategy: 'double', family: 'x8' }).values).toEqual([32, 32, 64]);
    expect(factPlan({ a: 4, b: 1, strategy: 'double', family: 'x4' }).values).toEqual([2, 2, 4]);
    expect(factPlan({ a: 6, b: 7, strategy: 'add-group', family: 'x6' }).values).toEqual([35, 42]);
    expect(factPlan({ a: 7, b: 9, strategy: 'add-group', family: 'x9' }).values).toEqual([70, 63]);
    expect(factPlan({ a: 3, b: 3, strategy: 'add-group', family: 'x3' }).values).toEqual([6, 9]);
    expect(factPlan({ a: 7, b: 6, strategy: 'break-apart' }).values).toEqual([30, 12, 42]);
    expect(factPlan({ a: 6, b: 4, form: 'turn-around' }).values).toEqual([6]);
    expect(factPlan({ a: 0, b: 9 }).values).toEqual([0]);
    // 7 × 4 doubles the 4: written 7 × 2 + 7 × 2.
    const toks = factPlan({ a: 7, b: 4, strategy: 'double', family: 'x4' }).tokens;
    expect(toks.slice(4, 7)).toEqual([
      { t: 'num', v: 7 },
      { t: 'op', v: '×' },
      { t: 'num', v: 2 },
    ]);
  });

  it('keeps every draw inside the family and the factor range', () => {
    const t = tpl('number-pad', 'abstract', 'symbols');
    expect(mulFacts.accepts?.({ a: 11, b: 2 }, t)).toBe(false);
    expect(mulFacts.accepts?.({ a: 3, b: 7, family: 'x5' }, t)).toBe(false);
    expect(mulFacts.accepts?.({ a: 3, b: 5, family: 'x5' }, t)).toBe(true);
    expect(mulFacts.accepts?.({ a: 6, b: 7, family: 'squares' }, t)).toBe(false);
    expect(mulFacts.accepts?.({ a: 5, b: 4, strategy: 'break-apart' }, t)).toBe(false);
    expect(mulFacts.accepts?.({ a: 4, b: 4, form: 'turn-around' }, t)).toBe(false);
  });
});

describe('mul.facts with three factors (MUL.16)', () => {
  const cases: [ItemFormat, Tier, Representation][] = [
    ['number-pad', 'abstract', 'symbols'],
    ['number-pad', 'pictorial', 'groups'],
    ['equal-groups', 'concrete', 'groups'],
  ];
  it.each(cases)(
    '%s %s %s: every accepted draw solves; the easy pair goes first',
    (format, tier, rep) => {
      const t = tpl(format, tier, rep);
      let built = 0;
      for (const a of range(0, FACTOR_MAX + 1)) {
        for (const b of range(0, FACTOR_MAX + 1)) {
          for (const c of range(1, FACTOR_MAX + 1)) {
            const p: ParamValues = { a, b, c, sprite: 'shell' };
            const ok = mulFacts.accepts?.(p, t) === true;
            if (a < 1 || b < 1 || a > FACTOR_MAX || b > FACTOR_MAX || c > FACTOR_MAX) {
              expect(ok, JSON.stringify(p)).toBe(false);
            }
            if (a * b * c > THREE_PRODUCT_MAX) expect(ok).toBe(false);
            if (!ok) continue;
            const item = solved(t, p);
            built += 1;
            const plan = factPlan(p);
            expect(plan.values.at(-1)).toBe(a * b * c);
            const [x, y] = plan.pair as [number, number];
            expect(x * y * plan.left).toBe(a * b * c);
            // A pair making a multiple of ten is taken whenever one exists.
            const tens = [a * b, b * c, a * c].some((v) => v % 10 === 0);
            expect((x * y) % 10 === 0).toBe(tens);
            if (item.widget.format === 'number-pad') {
              const s = sides(item.widget.expression?.tokens ?? [], plan.values);
              for (const v of s) expect(v).toBe(a * b * c);
            }
          }
        }
      }
      expect(built).toBeGreaterThan(0);
    },
  );

  it('takes 5 × 2 first in 3 × 5 × 2 and the first pair when none makes ten', () => {
    expect(easyPair(3, 5, 2)).toEqual([1, 2]);
    expect(factPlan({ a: 3, b: 5, c: 2 }).values).toEqual([10, 30]);
    expect(easyPair(2, 3, 4)).toEqual([0, 1]);
    expect(factPlan({ a: 2, b: 3, c: 4 }).values).toEqual([6, 24]);
  });
});

describe('mul.tens (MUL.11)', () => {
  it.each([
    ['abstract', 'symbols', false],
    ['abstract', 'symbols', true],
    ['pictorial', 'base-ten', true],
  ] as [Tier, Representation, boolean][])(
    '%s %s steps=%s: the whole range solves',
    (tier, rep, steps) => {
      const t = { ...tpl('number-pad', tier, rep), generator: 'mul.tens' };
      for (const a of range(0, 10)) {
        for (const b of range(0, 100)) {
          const p: ParamValues = { a, b, steps };
          const ok = mulTens.accepts?.(p, t) === true;
          expect(ok, JSON.stringify(p)).toBe(
            a >= TENS_A_MIN && a <= TENS_A_MAX && b >= 10 && b <= TENS_B_MAX && b % 10 === 0,
          );
          if (!ok) continue;
          const item = solved(t, p);
          const plan = tensPlan(a, b, steps);
          expect(plan.values.at(-1)).toBe(a * b);
          if (item.widget.format !== 'number-pad') throw new Error('number-pad');
          for (const v of sides(item.widget.expression?.tokens ?? [], plan.values)) {
            expect(v).toBe(a * b);
          }
          // The picture is one group of b as tens, never the product.
          if (rep === 'base-ten') {
            expect(item.widget.stimulus).toEqual({
              kind: 'base-ten',
              hundreds: 0,
              tens: b / 10,
              ones: 0,
            });
          } else expect(item.widget.stimulus.kind).toBe('none');
        }
      }
    },
  );
});

describe('mul.tens base-ten-build read', () => {
  it('lays a × t rods on the mat (at most TENS_READ_MAX) and asks their value', () => {
    const t = { ...tpl('base-ten-build', 'pictorial', 'base-ten'), generator: 'mul.tens' };
    let built = 0;
    for (const a of range(2, 9)) {
      for (const b of [10, 20, 30, 40, 50, 60, 70, 80, 90]) {
        const ok = mulTens.accepts?.({ a, b, steps: false }, t) === true;
        expect(ok).toBe((a * b) / 10 <= TENS_READ_MAX);
        if (!ok) continue;
        const item = solved(t, { a, b, steps: false });
        if (item.widget.format !== 'base-ten-build') throw new Error('base-ten-build');
        expect(item.widget.prebuilt).toEqual({ hundreds: 0, tens: (a * b) / 10, ones: 0 });
        built += 1;
      }
    }
    expect(built).toBe(20);
    expect(mulTens.accepts?.({ a: 4, b: 30, steps: true }, t)).toBe(false);
  });
});

describe('slice 3b misconception rules', () => {
  const pad = tpl('number-pad', 'abstract', 'symbols');
  const n = (value: number) => ({ kind: 'number', value }) as const;
  const ns = (...values: number[]) => ({ kind: 'numbers', values }) as const;
  const tensT = { ...tpl('number-pad', 'abstract', 'symbols'), generator: 'mul.tens' };

  it('times-zero-keeps: 7 × 0 → 7 and 0 × 9 → 9, not on 0 × 0 or a fact without 0', () => {
    expect(timesZeroKeeps.match(solved(pad, { a: 7, b: 0 }), n(7))).toBe(true);
    expect(timesZeroKeeps.match(solved(pad, { a: 0, b: 9 }), n(9))).toBe(true);
    expect(timesZeroKeeps.match(solved(pad, { a: 7, b: 0 }), n(1))).toBe(false);
    expect(timesZeroKeeps.applies?.(solved(pad, { a: 0, b: 0 }))).toBe(false);
    expect(timesZeroKeeps.applies?.(solved(pad, { a: 3, b: 1 }))).toBe(false);
    expect(timesZeroKeeps.predict?.(solved(pad, { a: 7, b: 0 }))).toEqual(n(7));
  });

  it('add-instead-of-multiply: 7 × 1 → 8 and the total of a strategy sentence', () => {
    expect(addInsteadOfMultiply.match(solved(pad, { a: 7, b: 1 }), n(8))).toBe(true);
    const dbl = solved(pad, { a: 4, b: 7, family: 'x4', strategy: 'double' });
    expect(addInsteadOfMultiply.match(dbl, ns(14, 14, 11))).toBe(true);
    // A wrong step is not this misconception.
    expect(addInsteadOfMultiply.match(dbl, ns(13, 14, 11))).toBe(false);
    expect(addInsteadOfMultiply.applies?.(solved(pad, { a: 6, b: 4, form: 'turn-around' }))).toBe(
      false,
    );
    expect(addInsteadOfMultiply.applies?.(solved(pad, { a: 3, b: 5, c: 2 }))).toBe(false);
  });

  it('skip-count-slip: forgetting the extra group, 6 × 7 → 35, and 9 × 7 → 70', () => {
    const six = solved(pad, { a: 6, b: 7, family: 'x6', strategy: 'add-group' });
    expect(skipCountSlip.match(six, ns(35, 35))).toBe(true);
    const nine = solved(pad, { a: 9, b: 7, family: 'x9', strategy: 'add-group' });
    expect(skipCountSlip.match(nine, ns(70, 70))).toBe(true);
    expect(skipCountSlip.predict?.(six)).toEqual(ns(35, 35));
  });

  it('double-once: 4 × 7 → 14 and 8 × 6 → 24, on a factor 4 or 8 only', () => {
    expect(doubleOnce.match(solved(pad, { a: 4, b: 7, family: 'x4' }), n(14))).toBe(true);
    expect(doubleOnce.match(solved(pad, { a: 6, b: 8, family: 'x8' }), n(24))).toBe(true);
    const dbl = solved(pad, { a: 7, b: 8, family: 'x8', strategy: 'double' });
    expect(doubleOnce.match(dbl, ns(28, 28, 28))).toBe(true);
    expect(doubleOnce.predict?.(dbl)).toEqual(ns(28, 28, 28));
    expect(doubleOnce.applies?.(solved(pad, { a: 6, b: 7 }))).toBe(false);
  });

  it('tens-dropped: 4 × 30 → 12, with and without steps', () => {
    expect(tensDropped.match(solved(tensT, { a: 4, b: 30, steps: false }), n(12))).toBe(true);
    expect(tensDropped.match(solved(tensT, { a: 4, b: 30, steps: true }), ns(12, 12))).toBe(true);
    expect(tensDropped.match(solved(tensT, { a: 4, b: 30, steps: false }), n(34))).toBe(false);
    expect(tensDropped.applies?.(solved(pad, { a: 4, b: 10, family: 'x10' }))).toBe(false);
  });

  it('partial-product-dropped: 7 × 6 → 30 or 12 as the total', () => {
    const item = solved(pad, { a: 7, b: 6, strategy: 'break-apart' });
    expect(partialProductDropped.match(item, ns(30, 12, 30))).toBe(true);
    expect(partialProductDropped.match(item, ns(30, 12, 12))).toBe(true);
    expect(partialProductDropped.match(item, ns(30, 12, 41))).toBe(false);
    expect(partialProductDropped.predict?.(item)).toEqual(ns(30, 12, 30));
  });
});

describe('PR #131 review round 1', () => {
  const split = tpl('array-build', 'pictorial', 'array');
  const pad = tpl('number-pad', 'abstract', 'symbols');
  const st = (value: Record<string, number>) => ({ kind: 'state', value }) as const;
  const n = (value: number) => ({ kind: 'number', value }) as const;

  it('a doubling split counts only the middle line; a break-apart split takes any line', () => {
    const dbl = solved(split, { a: 8, b: 10, family: 'x8', strategy: 'double', mode: 'split' });
    expect(checkResponse(dbl, st({ rows: 10, cols: 8, split: 1, value: 80 })).correct).toBe(false);
    expect(checkResponse(dbl, st({ rows: 10, cols: 8, split: 4, value: 80 })).correct).toBe(true);
    const brk = solved(split, { a: 7, b: 6, strategy: 'break-apart', mode: 'split' });
    expect(checkResponse(brk, st({ rows: 6, cols: 7, split: 2, value: 42 })).correct).toBe(true);
  });

  it('the number beside the three-factor box is the factor left (h.mul.easy-pair: times the other two)', () => {
    // The number next to the box is the factor left over, for every pair choice.
    for (const [a, b, c] of [
      [3, 5, 2],
      [2, 3, 4],
      [5, 3, 2],
      [2, 7, 5],
    ] as const) {
      const plan = factPlan({ a, b, c });
      const [x, y] = plan.pair as [number, number];
      const tk = plan.tokens;
      const box = tk.findIndex((t) => t.t === 'blank');
      const beside = tk[box - 1]?.t === 'rel' ? tk[box + 2] : tk[box - 2];
      expect(beside).toEqual({ t: 'num', v: plan.left });
      expect(x * y * plan.left).toBe(a * b * c);
    }
  });

  it("split arrays read their misconceptions: halves only, and a part of the child's own split", () => {
    const dbl = solved(split, { a: 8, b: 10, family: 'x8', strategy: 'double', mode: 'split' });
    expect(doubleOnce.match(dbl, st({ rows: 10, cols: 8, split: 4, value: 40 }))).toBe(true);
    expect(doubleOnce.predict?.(dbl)).toEqual(st({ rows: 10, cols: 8, split: 4, value: 40 }));
    // R2: an uneven split's smaller part is not "double again".
    const six = solved(split, { a: 8, b: 6, family: 'x8', strategy: 'double', mode: 'split' });
    expect(doubleOnce.match(six, st({ rows: 6, cols: 8, split: 2, value: 12 }))).toBe(false);
    expect(doubleOnce.match(six, st({ rows: 6, cols: 8, split: 4, value: 24 }))).toBe(true);
    const brk = solved(split, { a: 7, b: 6, strategy: 'break-apart', mode: 'split' });
    expect(partialProductDropped.match(brk, st({ rows: 6, cols: 7, split: 5, value: 30 }))).toBe(
      true,
    );
    expect(partialProductDropped.match(brk, st({ rows: 6, cols: 7, split: 5, value: 12 }))).toBe(
      true,
    );
    expect(partialProductDropped.match(brk, st({ rows: 6, cols: 7, split: 3, value: 18 }))).toBe(
      true,
    );
    expect(partialProductDropped.match(brk, st({ rows: 6, cols: 7, split: 3, value: 30 }))).toBe(
      false,
    );
    expect(partialProductDropped.predict?.(brk)).toEqual(
      st({ rows: 6, cols: 7, split: 5, value: 30 }),
    );
  });

  it('doubling the 8 too few times: 8 × 6 → 12 or 24; 4 × 8 counts as × 4', () => {
    const eight = solved(pad, { a: 8, b: 6, family: 'x8' });
    expect(doubleOnce.match(eight, n(12))).toBe(true);
    expect(doubleOnce.match(eight, n(24))).toBe(true);
    const four = solved(pad, { a: 4, b: 8, family: 'x4' });
    expect(doubleOnce.match(four, n(16))).toBe(true);
    expect(doubleOnce.match(four, n(8))).toBe(false);
    // R2: 4 × 8 in family x8 doubles the 4 three times: 8 and 16 both stop short.
    const asEight = solved(pad, { a: 4, b: 8, family: 'x8' });
    expect(doubleOnce.match(asEight, n(8))).toBe(true);
    expect(doubleOnce.match(asEight, n(16))).toBe(true);
  });

  it('a fact in a strategy skill shows that strategy in its worked solution', () => {
    const keys = (p: ParamValues) => itemSolution(solved(pad, p), pad).map((s) => s.say);
    expect(keys({ a: 8, b: 6, family: 'x8' })).toContain('gen.mul.facts.double');
    expect(keys({ a: 9, b: 7, family: 'x9' })).toContain('gen.mul.facts.take-group');
    expect(keys({ a: 6, b: 7, family: 'x6' })).toContain('gen.mul.facts.add-group');
    expect(keys({ a: 5, b: 7, family: 'x5' })).toContain('gen.mul.facts.count-by');
  });
});

describe('mul.facts ÷, unknown factors and picks (K02 slice 3c)', () => {
  /** r ÷ d with the asked values filled in, checked as d × q = r (× and ÷ only). */
  function trueSentence(tokens: ExpressionToken[], values: number[]): boolean {
    let k = 0;
    const v = tokens.map((t) =>
      t.t === 'num' ? t.v : t.t === 'blank' ? (values[k++] as number) : t.t === 'op' ? t.v : '=',
    );
    const [x, o, y, , z] = v as [number, string, number, string, number];
    return o === '×' ? x * y === z : y !== 0 && x === y * z;
  }
  const cases: [ItemFormat, Tier, Representation, string][] = [
    ['number-pad', 'abstract', 'symbols', 'read'],
    ['number-pad', 'pictorial', 'array', 'read'],
    ['number-pad', 'pictorial', 'groups', 'read'],
    ['number-pad', 'pictorial', 'bar-model', 'read'],
    ['numeral-pick', 'abstract', 'symbols', 'read'],
    ['array-build', 'concrete', 'tiles', 'build'],
  ];
  it.each(cases)(
    '%s %s %s (%s): every accepted ÷ or unknown-factor draw solves and is true',
    (format, tier, rep, mode) => {
      const t = tpl(format, tier, rep);
      let built = 0;
      for (const family of FACT_FAMILIES) {
        for (const op of FACT_OPS) {
          for (const unknown of FACT_UNKNOWNS) {
            for (const at of ['first', 'second']) {
              for (const corner of [0, 1, 2, 3]) {
                for (const a of range(0, FACTOR_MAX)) {
                  for (const b of range(0, FACTOR_MAX)) {
                    const p: ParamValues = {
                      a,
                      b,
                      family,
                      op,
                      unknown,
                      at,
                      corner,
                      mode,
                      sprite: 'shell',
                    };
                    if (op === '×' && unknown === 'result' && format !== 'numeral-pick') continue;
                    if (!mulFacts.accepts?.(p, t)) continue;
                    const item = solved(t, p);
                    built += 1;
                    const plan = factPlan(p);
                    // Factors 1–10: no ÷ 0, no 0 quotient, a dividend of at most 100.
                    expect(a >= 1 && b >= 1 && a * b <= 100, JSON.stringify(p)).toBe(true);
                    if (item.widget.format === 'number-pad') {
                      const tokens = item.widget.expression?.tokens ?? [];
                      expect(trueSentence(tokens, plan.values), JSON.stringify(p)).toBe(true);
                      // The asked value is never written in the sentence (squares and ÷ 1 aside,
                      // where it equals a told number by the fact itself).
                      if (rep === 'symbols') expect(item.widget.stimulus.kind).toBe('none');
                      const s = item.widget.stimulus;
                      if (s.kind === 'bar-model') {
                        // Equal parts; "?" only where the asked value goes; the number of parts is
                        // never the asked value's place.
                        expect(s.parts.length).toBeLessThanOrEqual(BAR_PARTS_MAX);
                        expect(new Set(s.parts).size).toBe(1);
                        const asked = s.whole === '?' ? 'whole' : 'parts';
                        if (asked === 'whole')
                          expect(plan.op === '×' && plan.unknown === 'result').toBe(true);
                        else {
                          expect(s.parts[0]).toBe('?');
                          expect(s.whole).toBe(a * b);
                        }
                      }
                    }
                    if (item.widget.format === 'numeral-pick') {
                      const opts = item.widget.options.map((o) => Number(o.label));
                      expect(new Set(opts).size, JSON.stringify(p)).toBe(4);
                      expect(opts).toContain(plan.values[0]);
                    }
                    if (item.widget.format === 'array-build') {
                      expect(item.widget.maxRows).toBe(ARRAY_SIDE_MAX);
                      expect(item.widget.maxCols).toBe(ARRAY_SIDE_MAX);
                    }
                  }
                }
              }
            }
          }
        }
      }
      expect(built).toBeGreaterThan(0);
    },
  );

  it('asks the quotient, the divisor, the dividend and a missing factor', () => {
    expect(factPlan({ a: 4, b: 6, op: '÷' }).values).toEqual([6]);
    expect(factPlan({ a: 4, b: 6, op: '÷', unknown: 'factor' }).values).toEqual([4]);
    expect(factPlan({ a: 4, b: 6, op: '÷', unknown: 'dividend' }).values).toEqual([24]);
    expect(factPlan({ a: 4, b: 6, unknown: 'factor' }).values).toEqual([6]);
    expect(factPlan({ a: 4, b: 6, unknown: 'factor', at: 'first' }).values).toEqual([4]);
    // ÷ by the family factor: 6 × 5 in the fives divides by 5.
    expect(factPlan({ a: 6, b: 5, op: '÷', family: 'x5' }).tokens).toEqual([
      { t: 'num', v: 30 },
      { t: 'op', v: '÷' },
      { t: 'num', v: 5 },
      { t: 'rel', v: '=' },
      { t: 'blank', id: 'x' },
    ]);
    const t = tpl('number-pad', 'abstract', 'symbols');
    expect(mulFacts.accepts?.({ a: 0, b: 6, op: '÷' }, t)).toBe(false);
    expect(mulFacts.accepts?.({ a: 6, b: 0, op: '÷' }, t)).toBe(false);
    expect(mulFacts.accepts?.({ a: 6, b: 7, unknown: 'dividend' }, t)).toBe(false);
    expect(mulFacts.accepts?.({ a: 7, b: 3, family: 'x7', op: '÷' }, t)).toBe(true);
    expect(mulFacts.accepts?.({ a: 6, b: 3, family: 'x7', op: '÷' }, t)).toBe(false);
  });

  it('numeral-pick option sets: every option of a set is the key of some draw, four distinct values', () => {
    // The whole domain (a 400-seed sweep cannot reach every set's four keys).
    for (const op of FACT_OPS) {
      const t = tpl('numeral-pick', 'abstract', 'symbols');
      const keys = new Map<string, Set<number>>();
      for (const corner of [0, 1, 2, 3]) {
        for (const a of range(0, FACTOR_MAX)) {
          for (const b of range(0, FACTOR_MAX)) {
            const p: ParamValues = { a, b, op, corner };
            if (!mulFacts.accepts?.(p, t)) continue;
            const plan = factPlan(p);
            const set = pickSet(p, plan);
            expect(new Set(set).size).toBe(4);
            const id = set.join(' ');
            keys.set(id, (keys.get(id) ?? new Set()).add(plan.values[0] as number));
          }
        }
      }
      expect(keys.size).toBeGreaterThan(op === '×' ? 20 : 5);
      for (const [set, ks] of keys) expect([...ks].sort((m, n) => m - n).join(' '), set).toBe(set);
    }
    // 6 × 7 sits beside 6 × 8, 7 × 7 and 7 × 8 (or the facts below it).
    expect(pickSet({ a: 6, b: 7, corner: 0 }, factPlan({ a: 6, b: 7 }))).toEqual([42, 48, 49, 56]);
  });
});

describe('slice 3c misconception rules (÷ and missing factors)', () => {
  const pad = tpl('number-pad', 'abstract', 'symbols');
  const pick = tpl('numeral-pick', 'abstract', 'symbols');
  const num = (value: number) => ({ kind: 'number', value }) as const;
  const item = (p: ParamValues, t = pad) =>
    generateItemFromParams(t, p, { checkConstraints: false });

  it('multiply-instead-of-divide: 24 ÷ 4 → 96, 4 × ? = 24 → 96; not when the product is the answer (÷ 1)', () => {
    expect(multiplyInsteadOfDivide.match(item({ a: 4, b: 6, op: '÷' }), num(96))).toBe(true);
    expect(multiplyInsteadOfDivide.match(item({ a: 4, b: 6, unknown: 'factor' }), num(96))).toBe(
      true,
    );
    expect(multiplyInsteadOfDivide.match(item({ a: 4, b: 6, op: '÷' }), num(6))).toBe(false);
    // 7 ÷ 1 = 7: the told numbers times each other is the answer, so nothing is read.
    expect(multiplyInsteadOfDivide.applies?.(item({ a: 1, b: 7, op: '÷' }))).toBe(true);
    expect(multiplyInsteadOfDivide.predict?.(item({ a: 1, b: 7, op: '÷' }))).toBeNull();
    // Product facts are not read here.
    expect(multiplyInsteadOfDivide.applies?.(item({ a: 4, b: 6 }))).toBe(false);
  });

  it('told-number-back: the divisor or dividend given back, the product for a missing factor; not a square', () => {
    const div = item({ a: 4, b: 6, op: '÷' });
    expect(toldNumberBack.match(div, num(4))).toBe(true);
    expect(toldNumberBack.match(div, num(24))).toBe(true);
    expect(toldNumberBack.match(item({ a: 4, b: 6, unknown: 'factor' }), num(24))).toBe(true);
    // 16 ÷ 4 = 4: the divisor is the answer.
    expect(toldNumberBack.match(item({ a: 4, b: 4, op: '÷' }), num(4))).toBe(false);
    expect(toldNumberBack.match(item({ a: 4, b: 4, op: '÷' }), num(16))).toBe(true);
  });

  it('neighbour-fact: one more or less for a quotient or factor, one divisor more or less for a dividend', () => {
    expect(neighbourFact.match(item({ a: 4, b: 6, op: '÷' }), num(7))).toBe(true);
    expect(neighbourFact.match(item({ a: 4, b: 6, op: '÷' }), num(5))).toBe(true);
    expect(neighbourFact.match(item({ a: 4, b: 6, op: '÷' }), num(8))).toBe(false);
    const dividend = item({ a: 6, b: 8, op: '÷', unknown: 'dividend' });
    expect(neighbourFact.match(dividend, num(42))).toBe(true);
    expect(neighbourFact.match(dividend, num(49))).toBe(false);
  });

  it('a pick is only wrong with an option it offers', () => {
    const it0 = item({ a: 4, b: 6, op: '÷', corner: 0 }, pick);
    expect(multiplyInsteadOfDivide.predict?.(it0)).toBeNull();
    const p = neighbourFact.predict?.(it0);
    expect(p).toEqual({ kind: 'choice', id: 'opt-7' });
  });

  it('a story pad (sentence hidden) writes no sentence and asks one number', () => {
    const story = item({ a: 3, b: 5, op: '÷', sentence: 'hidden' });
    if (story.widget.format !== 'number-pad') throw new Error('number-pad');
    expect(story.widget.expression).toBeUndefined();
    expect(story.widget.blanks).toEqual([{ id: 'x', maxDigits: 2 }]);
    expect(story.answer).toEqual(num(5));
    expect(mulFacts.accepts?.({ a: 3, b: 5, sentence: 'hidden', strategy: 'double' }, pad)).toBe(
      false,
    );
    expect(mulFacts.accepts?.({ a: 3, b: 5, sentence: 'hidden' }, pick)).toBe(false);
  });
});
