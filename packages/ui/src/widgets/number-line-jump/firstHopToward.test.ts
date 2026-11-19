import { describe, expect, it } from 'vitest';
import { firstHopToward } from './NumberLineJumpWidget';

describe('firstHopToward (the answer cue path)', () => {
  it('finds the first hop of a reachable path, not the greedy biggest hop', () => {
    expect(firstHopToward(0, 6, [3, 4], { min: 0, max: 8 })).toBe(3);
    expect(firstHopToward(3, 6, [3, 4], { min: 0, max: 8 })).toBe(3);
    expect(firstHopToward(74, 41, [-10, -1], { min: 30, max: 90 })).toBe(-10);
  });

  it('returns null from a dead end', () => {
    expect(firstHopToward(4, 6, [3, 4], { min: 0, max: 8 })).toBeNull();
  });

  it('gives up quickly on an unreachable target on a very wide road (review r2 F6)', () => {
    const started = performance.now();
    // Forward-only hops of 1 and 2 from 2 can never get back to 1, on a billion-wide road.
    expect(firstHopToward(2, 1, [1, 2], { min: 0, max: 1_000_000_000 })).toBeNull();
    // Even hops can never reach an odd number, however far the road goes.
    expect(firstHopToward(0, 999_999_999, [2], { min: 0, max: 1_000_000_000 })).toBeNull();
    expect(performance.now() - started).toBeLessThan(200);
  });
});
