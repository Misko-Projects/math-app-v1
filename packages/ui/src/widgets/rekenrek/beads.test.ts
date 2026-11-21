import { describe, expect, it } from 'vitest';
import type { ConfigFor } from '../types';
import { beadAt, beadSlot, clampBeads, responseFor, tapBead } from './beads';

const cfg = (over: Partial<ConfigFor<'rekenrek'>>): ConfigFor<'rekenrek'> => ({
  format: 'rekenrek',
  rows: 2,
  preset: [0, 0],
  mode: 'show',
  target: 6,
  rowRule: 'any',
  thenAsk: null,
  ...over,
});

describe('rekenrek beads', () => {
  it('places pushed beads at the left end and the rest at the right end', () => {
    expect(Array.from({ length: 10 }, (_, i) => beadSlot(i, 3))).toEqual([
      0, 1, 2, 7, 8, 9, 10, 11, 12, 13,
    ]);
  });

  it('finds the bead under a point, the nearer end bead on the empty wire', () => {
    expect(beadAt(1.5, 3)).toBe(1);
    expect(beadAt(7.2, 3)).toBe(3);
    expect(beadAt(13.9, 3)).toBe(9);
    expect(beadAt(3.4, 3)).toBe(2); // just right of the left group
    expect(beadAt(6.6, 3)).toBe(3); // just left of the right group
    expect(beadAt(2, 0)).toBe(0);
    expect(beadAt(12, 10)).toBe(9);
  });

  it('a tap slides a right bead left with the ones before it, or a left bead back', () => {
    expect(tapBead(5, 2)).toBe(6);
    expect(tapBead(1, 4)).toBe(1);
    expect(tapBead(0, 1)).toBe(0);
    expect(clampBeads(12)).toBe(10);
    expect(clampBeads(-1)).toBe(0);
  });

  it('answers through the model', () => {
    expect(responseFor(cfg({}), [3, 3], null)).toEqual({ kind: 'state', value: { rows: [3, 3] } });
    expect(responseFor(cfg({ thenAsk: 'total' }), [10, 2], 12)).toEqual({
      kind: 'state',
      value: { rows: [10, 2], value: 12 },
    });
    const read = cfg({ mode: 'read', preset: [7, 0] });
    expect(responseFor(read, [7, 0], null)).toBeNull();
    expect(responseFor(read, [7, 0], 7)).toEqual({ kind: 'number', value: 7 });
  });
});
