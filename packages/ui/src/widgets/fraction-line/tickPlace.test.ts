// #17 slice 5b: where a point is, told as a counted tick between labelled numbers.
import { describe, expect, it } from 'vitest';
import { tickPlace } from './FractionLineWidget';

describe('tickPlace', () => {
  it('counts eighths between 0 and 1', () => {
    expect(tickPlace(3 / 8, 8, 1, 'ends')).toEqual({ kind: 'between', k: 3, n: 8, lo: 0, hi: 1 });
    expect(tickPlace(0, 8, 1, 'ends')).toEqual({ kind: 'at', at: 0 });
    expect(tickPlace(1, 8, 1, 'ends')).toEqual({ kind: 'at', at: 1 });
  });

  it('past 1 with the wholes labelled, counts inside the whole it is in', () => {
    expect(tickPlace(7 / 4, 4, 2, 'wholes')).toEqual({
      kind: 'between',
      k: 3,
      n: 4,
      lo: 1,
      hi: 2,
    });
    expect(tickPlace(1, 4, 2, 'wholes')).toEqual({ kind: 'at', at: 1 });
    expect(tickPlace(5 / 2, 2, 3, 'wholes')).toEqual({ kind: 'between', k: 1, n: 2, lo: 2, hi: 3 });
  });

  it('with only the ends labelled, a whole inside is a counted tick (FRA.12)', () => {
    expect(tickPlace(1, 4, 2, 'ends')).toEqual({ kind: 'between', k: 4, n: 8, lo: 0, hi: 2 });
  });

  it('every tick of every line the slice draws: a number only where it is labelled', () => {
    for (const den of [2, 3, 4, 6, 8])
      for (const max of [1, 2, 3])
        for (let k = 0; k <= den * max; k += 1) {
          const p = tickPlace(k / den, den, max, 'wholes');
          if (p.kind === 'at') expect(k % den).toBe(0);
          else expect(p.lo + (p.k / p.n) * (p.hi - p.lo)).toBeCloseTo(k / den, 9);
        }
  });
});
