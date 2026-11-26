// K02 slice 4e (#17): grade 2 patterns, balances and puzzles (ALG.06, ALG.07, ALG.10, PUZ.04,
// PUZ.06, PUZ.07, PUZ.09), over their whole parameter ranges and many draws.
// - Puzzles are solvable and unique where one answer is checked; every clue is needed; a way to
//   pay is a set of coins (order never makes a new way) and the count is a second-grader's count.
// - Every hint line is true for every draw (ALG.06: one number went up, so the other goes down).
// - Nothing the child reads gives the answer: no prompt says a number equal to it.

import type { GeneratedItem, ItemTemplate } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { render } from '../src/content/render';
import { formatModel } from '../src/formats';
import { trayKey } from '../src/formats/money';
import { equation } from '../src/generators/equality/model';
import { waysCount, waysList } from '../src/generators/money/coins';
import {
  CAGE_LAYOUTS,
  cageSolutions,
  cagesOf,
  clueCandidates,
  clueTests,
  digitOrder,
  numberOf,
  SQUARES3,
} from '../src/generators/puzzle/k02';
import { checkResponse, retryFeedback } from '../src/items/check';
import { generateItem } from '../src/items/generate';
import { loadFixture } from './fixture';

const fixture = loadFixture();
const SEEDS = 300;
const tpl = (id: string): ItemTemplate => {
  const t = fixture.templates.find((x) => x.id === id);
  if (!t) throw new Error(id);
  return t;
};
const items = (id: string, n = SEEDS): GeneratedItem[] =>
  Array.from({ length: n }, (_, k) => generateItem(tpl(id), k + 1));
const say = (key: string, vars: Record<string, string | number> = {}) =>
  render(key, vars, fixture.narration);
const NEW = /^(ALG\.(06|07|10)|PUZ\.0[4679])\./;

describe('the templates of slice 4e', () => {
  it('ships 19 templates for seven skills', () => {
    const ids = fixture.templates.filter((t) => NEW.test(t.id)).map((t) => t.id);
    expect(ids.length).toBe(19);
    const skills = new Set(ids.map((id) => id.slice(0, 6)));
    expect([...skills].sort()).toEqual([
      'ALG.06',
      'ALG.07',
      'ALG.10',
      'PUZ.04',
      'PUZ.06',
      'PUZ.07',
      'PUZ.09',
    ]);
  });

  it('no prompt says a number equal to the answer', () => {
    for (const t of fixture.templates.filter((x) => NEW.test(x.id))) {
      for (const item of items(t.id, 200)) {
        const a = item.answer;
        if (a.kind !== 'number') continue;
        const text = say(item.prompt.narration, item.prompt.vars ?? {});
        const told = (text.match(/\d+/g) ?? []).map(Number);
        expect(told, `${t.id}: ${text}`).not.toContain(a.value);
      }
    }
  });
});

describe('ALG.06: same value without adding up', () => {
  it('the shown number is 1 to 3 from its partner, and the hint is true both ways', () => {
    const seen = new Set<string>();
    for (const id of ['ALG.06.t1', 'ALG.06.t3']) {
      for (const item of items(id)) {
        const p = item.params;
        const eq = equation(p);
        const [a, b, c] = [p.a, p.b, p.c] as [number, number, number];
        const [cp, bp] = eq.form === 'a+b=c+_' ? [a, b] : [b, a];
        const d = Math.abs(c - cp);
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(3);
        const line = say('h.eq.compensate', item.prompt.vars ?? {});
        const up = c > cp;
        seen.add(up ? 'up' : 'down');
        expect(line).toBe(
          `${c} is ${d} ${up ? 'more' : 'less'} than ${cp}. So the box is ${d} ${up ? 'less' : 'more'} than ${bp}.`,
        );
        // What the line says is the answer's own rule, and it never names the answer.
        expect(up ? bp - d : bp + d).toBe(eq.missing);
        expect((line.match(/\d+/g) ?? []).map(Number)).not.toContain(eq.missing);
      }
    }
    expect([...seen].sort()).toEqual(['down', 'up']);
  });

  it('reading "=" as "the answer comes next" is tagged (7 + 5 = [12] + 4)', () => {
    const item = items('ALG.06.t3', 1)[0] as GeneratedItem;
    const eq = equation(item.params);
    const r = checkResponse(item, { kind: 'number', value: eq.value });
    expect(r.misconceptionIds).toContain('MC.equals-means-answer');
  });
});

describe('ALG.07: the box first', () => {
  it('draws _ + c = a + b with the box on the left pan, and both sides balance', () => {
    let first = 0;
    for (const id of ['ALG.07.t1', 'ALG.07.t2']) {
      for (const item of items(id)) {
        const eq = equation(item.params);
        expect(eq.value - (eq.form === 'a=c+_' ? 0 : 0)).toBeGreaterThanOrEqual(0);
        if (eq.form !== '_+c=a+b') continue;
        first++;
        expect(eq.missing + Number(item.params.c)).toBe(eq.value);
        const w = item.widget;
        if (w.format === 'balance') expect(w.left.terms[0]).toEqual({ blank: 'x' });
        // Adding up all the numbers shown is tagged.
        const all = eq.shown.reduce((s, x) => s + x, 0);
        if (all !== eq.missing && item.widget.format === 'number-pad') {
          expect(checkResponse(item, { kind: 'number', value: all }).misconceptionIds).toContain(
            'MC.equals-add-all',
          );
        }
      }
    }
    expect(first).toBeGreaterThan(SEEDS / 2);
  });
});

describe('ALG.10: growing shape patterns', () => {
  it('the next stack is built (no pieces to pick), and repeating instead of growing is tagged', () => {
    for (const item of items('ALG.10.t1')) {
      const w = item.widget;
      if (w.format !== 'pattern-extend') throw new Error('pattern-extend');
      expect(w.palette).toEqual([]);
      expect(w.kind).toBe('grow');
      const [s0, s1, s2] = w.sequence.filter((x) => x !== null) as [
        { tiles: number },
        { tiles: number },
        { tiles: number },
      ];
      const step = s1.tiles - s0.tiles;
      expect(step).toBeGreaterThanOrEqual(1);
      expect(s2.tiles - s1.tiles).toBe(step);
      const r = checkResponse(item, { kind: 'state', value: { tokens: [s0] } });
      expect(r.misconceptionIds).toEqual(['MC.grow-as-repeat']);
    }
  });

  it('the abstract tier types the squares of the step asked', () => {
    for (const item of items('ALG.10.t3')) {
      const p = item.params as Record<string, number>;
      const k = 3 + (p.ask as number);
      expect(item.answer).toEqual({
        kind: 'number',
        value: (p.start as number) + (k - 1) * (p.step as number),
      });
      expect(say(item.prompt.narration, item.prompt.vars ?? {})).toContain(`step ${k}?`);
    }
  });
});

describe('PUZ.04: cage grids', () => {
  it('every layout has touching cages of 2 or 3 boxes, none a whole row or column', () => {
    for (const layout of CAGE_LAYOUTS) {
      for (const cells of cagesOf(layout).values()) {
        expect(cells.length === 2 || cells.length === 3).toBe(true);
        const rows = new Set(cells.map(([r]) => r));
        const cols = new Set(cells.map(([, c]) => c));
        expect(cells.length === 3 && (rows.size === 1 || cols.size === 1)).toBe(false);
        const touch = cells.every(([r, c]) =>
          cells.some(([r2, c2]) => Math.abs(r - r2) + Math.abs(c - c2) === 1),
        );
        expect(touch).toBe(true);
      }
    }
  });

  it('every square, layout and number of givens has exactly one solution', () => {
    for (let s = 0; s < SQUARES3.length; s++)
      for (const layout of CAGE_LAYOUTS)
        for (let g = 0; g <= 3; g++) expect(cageSolutions(s, layout, g)).toEqual([s]);
  });

  it('a child can clear a box, and a full grid with a repeated digit is tagged', () => {
    for (const item of items('PUZ.04.t2', 60)) {
      const w = item.widget;
      if (w.format !== 'puzzle-grid') throw new Error('puzzle-grid');
      const model = formatModel('puzzle-grid');
      if (!model) throw new Error('no puzzle-grid model');
      const fillOf = (st: unknown) => (st as { fill: unknown[][] }).fill;
      const blank = w.cells.find((x) => x.blank) as { r: number; c: number };
      let s = model.initialState(w as never);
      s = model.apply(s, { op: 'fill', args: { r: blank.r, c: blank.c, value: 2 } });
      expect(fillOf(s)[blank.r]?.[blank.c]).toBe(2);
      s = model.apply(s, { op: 'fill', args: { r: blank.r, c: blank.c, value: '' } });
      expect(fillOf(s)[blank.r]?.[blank.c]).toBe('');
    }
  });
});

describe('PUZ.06: digit cards', () => {
  const perms = (xs: number[]): number[][] =>
    xs.length <= 1
      ? [xs]
      : xs.flatMap((x, i) => perms(xs.filter((_, j) => j !== i)).map((p) => [x, ...p]));
  it('the answer is the biggest (or smallest) number the cards make, and only one order makes it', () => {
    for (const id of ['PUZ.06.t1', 'PUZ.06.t2', 'PUZ.06.t3']) {
      for (const item of items(id)) {
        const p = item.params;
        const ds = [p.d1, p.d2, p.d3].slice(0, p.count as number) as number[];
        expect(new Set(ds).size).toBe(ds.length);
        const all = perms(ds).map(numberOf);
        const want = p.want === 'smallest' ? Math.min(...all) : Math.max(...all);
        expect(numberOf(digitOrder(p))).toBe(want);
        expect(all.filter((n) => n === want)).toHaveLength(1);
        const a = item.answer;
        if (a.kind === 'number') expect(a.value).toBe(want);
        else if (a.kind === 'numbers') expect(numberOf(a.values)).toBe(want);
        // The biggest digit last (or the smallest last) is tagged.
        const reversed = [...digitOrder(p)].reverse();
        const r =
          a.kind === 'numbers'
            ? checkResponse(item, { kind: 'numbers', values: reversed })
            : checkResponse(item, { kind: 'number', value: numberOf(reversed) });
        expect(r.misconceptionIds).toEqual(['MC.digit-order-reversed']);
      }
    }
  });
});

describe('PUZ.07: mystery number clues', () => {
  it('over the whole range, one number fits and every clue is needed', () => {
    const sets: Record<string, unknown>[] = [
      ...Array.from({ length: 9 }, (_, i) => ({ variant: 'clues', clues: 'fives', t: i + 1 })),
      ...Array.from({ length: 87 }, (_, i) => ({ variant: 'clues', clues: 'near', n: i + 12 })),
    ];
    for (const p of sets) {
      expect(clueCandidates(p as never)).toHaveLength(1);
      for (let i = 0; i < clueTests(p as never).length; i++) {
        expect(clueCandidates(p as never, i).length, JSON.stringify(p)).toBeGreaterThan(1);
      }
    }
  });

  it('the prompt says every clue, and the answer passes them', () => {
    for (const id of ['PUZ.07.t1', 'PUZ.07.t2', 'PUZ.07.t3']) {
      for (const item of items(id, 100)) {
        const text = say(item.prompt.narration, item.prompt.vars ?? {});
        const n = (item.answer as { value: number }).value;
        if (item.params.clues === 'fives') {
          expect(text).toContain(`tens digit is ${Math.floor(n / 10)}`);
          expect(text).toMatch(/odd/);
          expect(text).toMatch(/fives/);
        } else {
          expect(text).toContain(`more than ${n - 2}`);
          expect(text).toContain(`less than ${n + 2}`);
          expect(text).toContain(n % 2 ? 'odd' : 'even');
        }
      }
    }
  });
});

describe('retry lines fit the screen (review round 1)', () => {
  it('a mystery number checks its clues; a balance that does not tilt works out each side', () => {
    for (const id of ['PUZ.07.t1', 'PUZ.07.t2', 'PUZ.07.t3']) {
      for (const item of items(id, 5)) expect(retryFeedback(item)).toBe('fb.clues.retry');
    }
    for (const id of ['ALG.06.t1', 'ALG.06.t2', 'ALG.07.t1', 'PUZ.04.t1']) {
      for (const item of items(id, 5)) {
        expect(item.widget.format === 'balance' && item.widget.showTilt).toBe(false);
        expect(retryFeedback(item)).toBe('fb.balance.retry-sides');
      }
    }
    expect(say('fb.balance.retry-sides')).not.toMatch(/down|tilt/);
  });

  it('no clue prompt says "tap" (a tall room types the number instead)', () => {
    for (const id of ['PUZ.07.t1', 'PUZ.07.t2', 'PUZ.07.t3']) {
      for (const item of items(id, 20)) {
        expect(say(item.prompt.narration, item.prompt.vars ?? {})).not.toMatch(/tap/i);
      }
    }
  });
});

describe('PUZ.09: ways to pay', () => {
  it('every way to pay fits the five-coin tray, so any way a child finds can be made', () => {
    for (const item of items('PUZ.09.t1')) {
      const p = item.params;
      expect(waysList(p.cents as number, String(p.kinds))).toHaveLength(
        waysCount(p.cents as number, String(p.kinds)),
      );
    }
  });

  it('the counting method in the hint finds every way (as many big coins as fit, then one fewer)', () => {
    const VALUES: Record<string, number> = { q: 25, d: 10, n: 5, p: 1 };
    const method = (cents: number, values: number[]): number => {
      const [v, ...rest] = values as [number, ...number[]];
      if (rest.length === 0) return cents % v === 0 ? 1 : 0;
      let n = 0;
      for (let k = Math.floor(cents / v); k >= 0; k--) n += method(cents - k * v, rest);
      return n;
    };
    for (const id of ['PUZ.09.t2', 'PUZ.09.t3']) {
      for (const item of items(id, 50)) {
        const p = item.params;
        const values = [...String(p.kinds)].map((k) => VALUES[k] as number);
        expect(method(p.cents as number, values)).toBe((item.answer as { value: number }).value);
      }
    }
  });

  /** Every multiset of the kinds paying `cents`, counted the way a second-grader would. */
  const brute = (cents: number, values: number[]): number => {
    if (values.length === 0) return cents === 0 ? 1 : 0;
    const [v, ...rest] = values as [number, ...number[]];
    let n = 0;
    for (let k = 0; k * v <= cents; k++) n += brute(cents - k * v, rest);
    return n;
  };
  const VALUES: Record<string, number> = { q: 25, d: 10, n: 5, p: 1 };

  it('the count is the number of different sets of coins', () => {
    for (const kinds of ['dn', 'qdn']) {
      for (const cents of [10, 15, 20, 25, 30]) {
        expect(waysCount(cents, kinds)).toBe(
          brute(
            cents,
            [...kinds].map((k) => VALUES[k] as number),
          ),
        );
      }
    }
    for (const id of ['PUZ.09.t2', 'PUZ.09.t3']) {
      for (const item of items(id, 100)) {
        const text = say(item.prompt.narration, item.prompt.vars ?? {});
        expect(text).toMatch(/new order are the same way/);
      }
    }
  });

  it('a new way is left to make, the found ways differ, and repeating one is tagged', () => {
    for (const item of items('PUZ.09.t1')) {
      const w = item.widget;
      if (w.format !== 'coin-pay') throw new Error('coin-pay');
      const found = w.found ?? [];
      expect(new Set(found).size).toBe(found.length);
      const left = waysList(w.target, String(item.params.kinds)).filter(
        (x) => !found.includes(trayKey(x)),
      );
      expect(left.length).toBeGreaterThan(0);
      expect(say(item.prompt.narration, item.prompt.vars ?? {})).toMatch(/not a new way/);
      const m = /^q(\d+)d(\d+)n(\d+)p(\d+)$/.exec(found[0] as string) as RegExpExecArray;
      const again = {
        kind: 'state' as const,
        value: {
          coins: {
            quarter: Number(m[1]),
            dime: Number(m[2]),
            nickel: Number(m[3]),
            penny: Number(m[4]),
          },
        },
      };
      const r = checkResponse(item, again);
      expect(r.correct).toBe(false);
      expect(r.misconceptionIds).toEqual(['MC.way-counted-twice']);
    }
  });
});
