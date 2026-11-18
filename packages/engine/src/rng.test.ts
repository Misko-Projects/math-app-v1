// 03 §5.3 RNG: xoshiro128** seeded through splitmix32, fork(label) via FNV-1a.

import { describe, expect, it } from 'vitest';
import { createRng, fnv1a32, type Rng } from './rng';

const draws = (rng: Rng, n: number, min = 0, max = 1_000_000): number[] =>
  Array.from({ length: n }, () => rng.int(min, max));

describe('createRng', () => {
  it('is deterministic: the same seed gives the same sequence', () => {
    expect(draws(createRng(7), 50)).toEqual(draws(createRng(7), 50));
    const a = createRng(7);
    const b = createRng(7);
    expect(Array.from({ length: 20 }, () => a.float())).toEqual(
      Array.from({ length: 20 }, () => b.float()),
    );
  });

  it('gives different sequences for different seeds', () => {
    expect(draws(createRng(1), 8)).not.toEqual(draws(createRng(2), 8));
  });

  it('matches the pinned regression vector for seed 42 (any algorithm change is caught)', () => {
    expect(draws(createRng(42), 8)).toEqual([
      320087, 945353, 755803, 134642, 755841, 173177, 323121, 261576,
    ]);
  });

  it('reduces seeds to 32 bits and truncates fractions', () => {
    expect(draws(createRng(42.9), 8)).toEqual(draws(createRng(42), 8));
    expect(draws(createRng(2 ** 32 + 42), 8)).toEqual(draws(createRng(42), 8));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'throws on a non-finite seed (%s)',
    (seed) => {
      expect(() => createRng(seed)).toThrow(RangeError);
    },
  );
});

describe('int', () => {
  it('stays in range and hits every value of a small range', () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      const v = rng.int(-2, 4);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThanOrEqual(4);
      seen.add(v);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2, 3, 4]);
  });

  it('returns min when min === max', () => {
    const rng = createRng(5);
    expect(draws(rng, 10, 9, 9)).toEqual(new Array(10).fill(9));
  });

  it('handles a full 2^32 span', () => {
    const v = createRng(5).int(0, 2 ** 32 - 1);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(2 ** 32);
  });

  it.each([
    ['min > max', 5, 4],
    ['non-integer min', 0.5, 4],
    ['non-integer max', 0, 4.5],
    ['NaN', Number.NaN, 4],
    ['unsafe integer', 0, 2 ** 53],
    ['span wider than 2^32', 0, 2 ** 32],
  ])('throws on a bad range (%s)', (_label, min, max) => {
    expect(() => createRng(1).int(min, max)).toThrow(RangeError);
  });
});

describe('float and bool', () => {
  it('float stays in [0, 1)', () => {
    const rng = createRng(11);
    for (let i = 0; i < 1000; i += 1) {
      const f = rng.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it.each([
    [0, false],
    [-1, false],
    [1, true],
    [2, true],
  ])('bool(%s) is always %s', (p, want) => {
    const rng = createRng(12);
    for (let i = 0; i < 100; i += 1) expect(rng.bool(p)).toBe(want);
  });

  it('bool(p) and bool(1) do not consume the stream at the extremes', () => {
    const a = createRng(13);
    a.bool(0);
    a.bool(1);
    expect(draws(a, 5)).toEqual(draws(createRng(13), 5));
  });

  it('bool(0.5) gives both outcomes', () => {
    const rng = createRng(14);
    const outcomes = new Set(Array.from({ length: 200 }, () => rng.bool(0.5)));
    expect(outcomes).toEqual(new Set([true, false]));
  });
});

describe('fork', () => {
  it('does not advance the parent stream', () => {
    const a = createRng(21);
    a.fork('x');
    a.fork('y');
    expect(draws(a, 10)).toEqual(draws(createRng(21), 10));
  });

  it('is deterministic: the same label on the same state gives the same stream', () => {
    const a = createRng(21);
    expect(draws(a.fork('layout'), 10)).toEqual(draws(a.fork('layout'), 10));
    expect(draws(createRng(21).fork('layout'), 10)).toEqual(
      draws(createRng(21).fork('layout'), 10),
    );
  });

  it('gives different streams for different labels', () => {
    const a = createRng(21);
    expect(draws(a.fork('c0'), 8)).not.toEqual(draws(a.fork('c1'), 8));
    expect(draws(a.fork('layout'), 8)).not.toEqual(draws(a, 8));
  });

  it('is independent of the parent once forked (later parent draws do not change the child)', () => {
    const a = createRng(21);
    const child = a.fork('x');
    draws(a, 100);
    expect(draws(child, 10)).toEqual(draws(createRng(21).fork('x'), 10));
  });

  it('mixes the current state: forking after the parent draws gives a different child', () => {
    const before = createRng(21).fork('x');
    const parent = createRng(21);
    parent.int(0, 10);
    expect(draws(parent.fork('x'), 8)).not.toEqual(draws(before, 8));
  });

  it('nests deterministically', () => {
    const f = () => draws(createRng(9).fork('a').fork('b'), 6);
    expect(f()).toEqual(f());
    expect(f()).not.toEqual(draws(createRng(9).fork('b').fork('a'), 6));
  });
});

describe('shuffle', () => {
  it('returns a permutation and leaves the input untouched', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const out = createRng(31).shuffle(input);
    expect(out).not.toBe(input);
    expect([...out].sort((a, b) => a - b)).toEqual([...input]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('is deterministic and actually reorders over many seeds', () => {
    const xs = [1, 2, 3, 4, 5];
    expect(createRng(32).shuffle(xs)).toEqual(createRng(32).shuffle(xs));
    const orders = new Set(Array.from({ length: 50 }, (_, s) => createRng(s).shuffle(xs).join()));
    expect(orders.size).toBeGreaterThan(10);
  });

  it('handles empty and single-element lists', () => {
    expect(createRng(1).shuffle([])).toEqual([]);
    expect(createRng(1).shuffle(['a'])).toEqual(['a']);
  });
});

describe('pick and weighted', () => {
  it('pick returns an element and throws on an empty list', () => {
    const rng = createRng(41);
    const xs = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i += 1) expect(xs).toContain(rng.pick(xs));
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('weighted respects relative weights over many draws', () => {
    const rng = createRng(42);
    const counts = { rare: 0, common: 0, never: 0 };
    const keys = ['rare', 'common', 'never'] as const;
    for (let i = 0; i < 5000; i += 1) counts[rng.weighted(keys, [0.001, 1, 0])] += 1;
    expect(counts.never).toBe(0);
    expect(counts.rare).toBeLessThan(25);
    expect(counts.common).toBeGreaterThan(4975);
  });

  it('weighted roughly follows a 3:1 split', () => {
    const rng = createRng(43);
    let a = 0;
    for (let i = 0; i < 4000; i += 1) if (rng.weighted(['a', 'b'], [3, 1]) === 'a') a += 1;
    expect(a / 4000).toBeGreaterThan(0.7);
    expect(a / 4000).toBeLessThan(0.8);
  });

  it.each([
    ['empty values', [], []],
    ['length mismatch', ['a', 'b'], [1]],
    ['all-zero weights', ['a', 'b'], [0, 0]],
    ['negative total', ['a'], [-1]],
    ['NaN weight', ['a'], [Number.NaN]],
  ])('weighted throws on bad input (%s)', (_label, xs, ws) => {
    expect(() => createRng(1).weighted(xs as string[], ws as number[])).toThrow(RangeError);
  });
});

describe('fnv1a32', () => {
  it.each([
    ['', 0x811c9dc5],
    ['a', 0xe40c292c],
    ['foobar', 0xbf9cf968],
  ])('fnv1a32(%j) is the known FNV-1a value', (text, want) => {
    expect(fnv1a32(text)).toBe(want);
  });

  it('hashes UTF-8 bytes (multi-byte code points differ from their UTF-16 units)', () => {
    // 'é' is C3 A9 in UTF-8; hashing the two bytes by hand must agree.
    let h = 0x811c9dc5;
    for (const b of [0xc3, 0xa9]) {
      h ^= b;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    expect(fnv1a32('é')).toBe(h >>> 0);
    expect(fnv1a32('🐠')).toBeGreaterThanOrEqual(0);
    expect(fnv1a32('🐠')).not.toBe(fnv1a32('\ud83d'));
  });
});
