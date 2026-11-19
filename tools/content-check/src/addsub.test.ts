// addsub.facts over the authored templates (PR #80 review): every solution keeps the answer for
// its last step, and every hint's advice can be followed on every fact the template generates.

import { generateItem, initContent, itemSolution, resetContent } from '@number-island/engine';
import type { GeneratedItem, ItemTemplate } from '@number-island/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileInMemory } from './dist';

const fixture = compileInMemory();
const facts = fixture.templates.filter((t) => t.generator === 'addsub.facts');
const SEEDS = 200;

beforeAll(() =>
  initContent({
    templates: fixture.templates,
    narration: fixture.narration,
    misconceptions: fixture.misconceptions,
  }),
);
afterAll(() => resetContent());

interface Fact {
  a: number;
  b: number;
  op: string;
  result: number;
  unknown: string;
  family: string;
}

function fact(item: GeneratedItem): Fact {
  const p = item.params;
  return {
    a: p.a as number,
    b: p.b as number,
    op: (p.op as string | undefined) ?? '+',
    result: p.result as number,
    unknown: (p.unknown as string | undefined) ?? 'result',
    family: (p.family as string | undefined) ?? 'any',
  };
}

function* items(t: ItemTemplate): Generator<[GeneratedItem, Fact]> {
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const item = generateItem(t, seed);
    yield [item, fact(item)];
  }
}

const hintsOf = (t: ItemTemplate): string[] => t.narration.hints ?? [];

describe('addsub.facts solutions say the answer only in the last step', () => {
  it.each(facts.map((t) => [t.id, t] as const))('%s', (_id, t) => {
    for (const [item, f] of items(t)) {
      const answer = f.unknown === 'change' ? f.b : f.unknown === 'start' ? f.a : f.result;
      // A number that equals the answer may still be said when the fact itself shows it, or it is
      // one of the strategy's parts: an addend (0 + 3 = 3), or a split at ten (13 − 8 takes 3 to
      // ten, then 5 more, and 5 is the answer). A running count or a total never is.
      const given =
        f.unknown === 'change'
          ? [f.a, f.result]
          : f.unknown === 'start'
            ? [f.b, f.result]
            : [f.a, f.b, Math.abs(f.a - 10), Math.abs(f.result - 10)];
      const steps = itemSolution(item, t);
      expect(steps.length, `${t.id} seed ${item.seed}`).toBeGreaterThan(1);
      for (const s of steps.slice(0, -1)) {
        for (const [slot, v] of Object.entries(s.vars ?? {})) {
          if (v !== answer || given.includes(v)) continue;
          expect.fail(
            `${t.id} seed ${item.seed} (${f.a} ${f.op} ${f.b}): ${s.say} says {${slot}} = ${v} before the last step`,
          );
        }
      }
    }
  });
});

// Hints whose advice needs ten on the route: the fact must pass ten, never just reach it. Counting
// up to subtract (count-up, a − b) runs from b up to a; other subtraction runs from a down.
const passesTen = (f: Fact): boolean => {
  if (f.op === '+') return f.a < 10 && f.result > 10;
  if (f.family === 'count-up') return f.b < 10 && f.a > 10;
  return f.a > 10 && f.result < 10;
};
const TEN_ON_ROUTE: Record<string, (f: Fact) => boolean> = {
  'h.numberline.jump-to-ten': (f) => f.op === '+' && passesTen(f),
  'h.numberline.back-to-ten': (f) => f.op === '-' && f.family !== 'count-up' && passesTen(f),
  'h.sub.count-up-ten': (f) => f.op === '-' && f.family === 'count-up' && passesTen(f),
  'h.sub.back-to-ten': (f) => f.op === '-' && f.family !== 'count-up' && passesTen(f),
  'h.sub.then-more': (f) => f.op === '-' && f.family !== 'count-up' && passesTen(f),
  'h.addsub.make-ten.ten-and': (f) => f.result > 10 && f.result < 20,
};

describe('addsub.facts hints give advice the fact allows', () => {
  const withTen = facts.filter((t) => hintsOf(t).some((h) => h in TEN_ON_ROUTE));
  it.each(withTen.map((t) => [t.id, t] as const))('%s: ten lies on the route', (_id, t) => {
    for (const [item, f] of items(t)) {
      for (const h of hintsOf(t).filter((k) => k in TEN_ON_ROUTE)) {
        expect(
          TEN_ON_ROUTE[h]?.(f),
          `${t.id} seed ${item.seed}: ${h} on ${f.a} ${f.op} ${f.b}`,
        ).toBe(true);
      }
    }
  });

  it('ADD.27 never names a route through ten: its facts need not pass ten (3 + 2, 13 + 4, 8 − 3)', () => {
    const add27 = facts.filter((t) => t.skillId === 'ADD.27');
    expect(add27).toHaveLength(4);
    let notPassing = 0;
    for (const t of add27) {
      const hints = hintsOf(t);
      expect(
        hints.some((h) => h in TEN_ON_ROUTE),
        t.id,
      ).toBe(false);
      // Review round 2: "over ten / under ten" still sent 13 + 4 back to ten. No hint of these
      // templates may mention ten at all, by key or by its words.
      for (const h of hints) {
        expect(h, t.id).not.toMatch(/ten/);
        expect(fixture.narration[h]?.text ?? '', `${t.id} ${h}`).not.toMatch(/\bten\b/i);
      }
      for (const [, f] of items(t)) {
        if (!passesTen(f)) notPassing += 1;
      }
    }
    expect(notPassing).toBeGreaterThan(0);
  });

  it('count-hops only where every hop is one; jumps of any size ask for the whole jump', () => {
    const hops = facts.filter((t) => hintsOf(t).includes('h.sub.count-hops'));
    expect(hops.map((t) => t.id)).toEqual(['ADD.04.t2']);
    for (const t of hops) {
      for (const [item] of items(t)) {
        const w = item.widget;
        expect(w.format === 'number-line-jump' && w.allowedJumps, t.id).toEqual([1]);
      }
    }
    // The open line (ADD.19.t1): 13 − 8 as 8 → 10 → 13 is 2 jumps, and the answer is 5.
    const total = facts.filter((t) => hintsOf(t).includes('h.sub.jump-total'));
    expect(total.map((t) => t.id)).toEqual(['ADD.19.t1']);
    for (const t of total) {
      for (const [item] of items(t)) {
        expect(item.widget).toMatchObject({ goal: 'difference', thenAsk: 'total-jump' });
      }
    }
  });
});
