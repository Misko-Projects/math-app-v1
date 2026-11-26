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
import { checkResponse } from '../../items/check';
import { generateItemFromParams } from '../../items/generate';
import { itemSolution, replaySteps } from '../../items/solution';
import {
  easyPair,
  FACT_FAMILIES,
  FACT_STRATEGIES,
  FACTOR_MAX,
  factPlan,
  mulFacts,
  THREE_PRODUCT_MAX,
} from './facts';
import { mulTens, TENS_A_MAX, TENS_A_MIN, TENS_B_MAX, tensPlan } from './tens';

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
