import { describe, expect, it } from 'vitest';
import { firstHopToward, HOP_SEARCH_LIMIT, hopCloserTo } from './NumberLineJumpWidget';

const hop = (by: number) => ({ kind: 'hop', by });
const unreachable = { kind: 'unreachable' };

describe('firstHopToward (the answer cue path)', () => {
  it('finds the first hop of a reachable path, not the greedy biggest hop', () => {
    expect(firstHopToward(0, 6, [3, 4], { min: 0, max: 8 })).toEqual(hop(3));
    expect(firstHopToward(3, 6, [3, 4], { min: 0, max: 8 })).toEqual(hop(3));
    expect(firstHopToward(74, 41, [-10, -1], { min: 30, max: 90 })).toEqual(hop(-10));
  });

  it('proves a dead end', () => {
    expect(firstHopToward(4, 6, [3, 4], { min: 0, max: 8 })).toEqual(unreachable);
    // Review r3 F4: from 5 the hops reach only odd stones (5 more leaves the road), so 0 is a
    // dead end.
    expect(firstHopToward(5, 0, [-2, 2, 5], { min: 0, max: 5 })).toEqual(unreachable);
  });

  it('counts the target as reached with the empty path (review r3 F4)', () => {
    expect(firstHopToward(0, 0, [-2, 2, 5], { min: 0, max: 5 })).toEqual({ kind: 'here' });
  });

  it('finds paths that leave the stretch between the two by more than one hop', () => {
    // +7 and −10 from 1 to 0 on 0–20: 1 → 8 → 15 → 5 → 12 → 2 → 9 → 16 → 6 → 13 → 3 → 10 → 0.
    expect(firstHopToward(1, 0, [7, -10], { min: 0, max: 20 })).toEqual(hop(7));
  });

  it('gives up quickly on an unreachable target on a very wide road (review r2 F6)', () => {
    const started = performance.now();
    // Forward-only hops of 1 and 2 from 2 can never get back to 1, on a billion-wide road.
    expect(firstHopToward(2, 1, [1, 2], { min: 0, max: 1_000_000_000 })).toEqual(unreachable);
    // Even hops can never reach an odd number, however far the road goes.
    expect(firstHopToward(0, 999_999_999, [2], { min: 0, max: 1_000_000_000 })).toEqual(
      unreachable,
    );
    expect(firstHopToward(0, 999_999_999, [-2, 4], { min: 0, max: 1_000_000_000 })).toEqual(
      unreachable,
    );
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('reports a search that runs out of budget as unknown, never as a dead end (review r3 F5)', () => {
    const road = { min: 0, max: 500_000 };
    const hops = [1, 100, 10_000, -490_000];
    // From the start 490000 the target 500000 is one hop; after the backward hop to 0 it takes
    // 50 hops, past the search budget, but it is still reachable.
    expect(firstHopToward(490_000, 500_000, hops, road)).toEqual(hop(10_000));
    const started = performance.now();
    expect(firstHopToward(0, 500_000, hops, road)).toEqual({ kind: 'unknown' });
    expect(performance.now() - started).toBeLessThan(500);
    // Without the budget, the cue falls back to the hop that gets closest on the line.
    expect(hopCloserTo(0, 500_000, hops, road)).toBe(10_000);
    // The same search with room to finish finds the path.
    expect(firstHopToward(0, 500_000, hops, road, HOP_SEARCH_LIMIT * 100)).toEqual(hop(10_000));
  });

  it('hopCloserTo: closest on the line, or null when no hop gets closer', () => {
    expect(hopCloserTo(0, 7, [3, 4], { min: 0, max: 8 })).toBe(4);
    expect(hopCloserTo(0, 6, [3, 4], { min: 0, max: 8 })).toBe(4);
    expect(hopCloserTo(6, 0, [3, 4], { min: 0, max: 8 })).toBeNull();
    expect(hopCloserTo(0, 10, [20], { min: 0, max: 15 })).toBeNull();
  });
});
