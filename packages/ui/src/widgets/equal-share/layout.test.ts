import { describe, expect, it } from 'vitest';
import {
  balancedRows,
  chromeFor,
  fivesCell,
  fivesGrid,
  itemGap,
  type LayoutInput,
  MIN_ITEM_PX,
  shareLayout,
  zoneCapacity,
} from './layout';

const G1 = { width: 850, height: 620, maxItem: 84, chrome: chromeFor('g1-up') };
const K = { width: 790, height: 620, maxItem: 104, chrome: chromeFor('k') };

function input(over: Partial<LayoutInput> & Pick<LayoutInput, 'recipients' | 'cap'>): LayoutInput {
  return {
    kind: 'pebbling',
    pileMax: 0,
    dealing: true,
    seagull: true,
    seagullMax: over.recipients - 1,
    ...G1,
    ...over,
  };
}

describe('zoneCapacity', () => {
  it('a fair share up to a whole five, at least ten (or all the items)', () => {
    expect(zoneCapacity(24, 6)).toBe(10);
    expect(zoneCapacity(7, 3)).toBe(7);
    expect(zoneCapacity(6, 2)).toBe(6);
    expect(zoneCapacity(40, 2)).toBe(20);
    expect(zoneCapacity(24, 2)).toBe(15);
  });
  it('every share of up to ten gets the same mat (its size never shows the share)', () => {
    const caps = new Set<number>();
    for (let r = 2; r <= 8; r++) caps.add(zoneCapacity(20, r));
    expect([...caps]).toEqual([10]);
  });
  it('always holds a fair share, leftover round included', () => {
    for (let items = 1; items <= 60; items++) {
      for (let r = 2; r <= 10; r++) {
        expect(zoneCapacity(items, r)).toBeGreaterThanOrEqual(
          Math.min(items, Math.ceil(items / r)),
        );
      }
    }
  });
  it('pre-dealt: room for the largest share', () => {
    expect(zoneCapacity(12, 4, [3, 3, 2, 3])).toBe(3);
    expect(zoneCapacity(5, 2, [0, 0])).toBe(1);
  });
});

describe('fives grids', () => {
  it('lays rows of five with a wider gap between fives', () => {
    const g = fivesGrid(12, 10, 40);
    expect(g).toMatchObject({ cols: 10, rows: 2 });
    const a = fivesCell(4, 10, 40);
    const b = fivesCell(5, 10, 40);
    // The sixth item starts a new five: further from the fifth than the fifth from the fourth.
    expect(b.x - a.x).toBeGreaterThan(fivesCell(4, 10, 40).x - fivesCell(3, 10, 40).x);
    expect(fivesCell(10, 10, 40)).toEqual({ x: 0, y: 40 + itemGap(40) });
  });
  it('never overlaps: every two cells are apart', () => {
    const s = 24;
    for (let i = 0; i < 30; i++) {
      for (let j = i + 1; j < 30; j++) {
        const a = fivesCell(i, 15, s);
        const b = fivesCell(j, 15, s);
        const apart = Math.abs(a.x - b.x) >= s + 4 || Math.abs(a.y - b.y) >= s + 4;
        expect(apart).toBe(true);
      }
    }
  });
  it('balances rows', () => {
    expect(balancedRows(6, 3)).toEqual([3, 3]);
    expect(balancedRows(5, 3)).toEqual([3, 2]);
    expect(balancedRows(4, 4)).toEqual([4]);
  });
});

describe('shareLayout (the stress configs fit with items ≥ 20 px)', () => {
  it('24 among 6 plates', () => {
    const l = shareLayout(
      input({ recipients: 6, cap: zoneCapacity(24, 6), kind: 'plate', pileMax: 24 }),
    );
    expect(l.fits).toBe(true);
    expect(l.s).toBeGreaterThanOrEqual(32);
  });
  it('7 among 3 pebblings, with a leftover', () => {
    const l = shareLayout(input({ recipients: 3, cap: zoneCapacity(7, 3), pileMax: 7 }));
    expect(l.fits).toBe(true);
    expect(l.s).toBeGreaterThanOrEqual(40);
  });
  it('fair-or-not with 4 recipients (no dealing, no seagull)', () => {
    const l = shareLayout(
      input({
        recipients: 4,
        cap: zoneCapacity(12, 4, [3, 3, 2, 3]),
        pileMax: 1,
        dealing: false,
        seagull: false,
      }),
    );
    expect(l.fits).toBe(true);
    expect(l.s).toBeGreaterThanOrEqual(60);
  });
  it('K: 6 between 2 pebblings is chunky', () => {
    const l = shareLayout(input({ recipients: 2, cap: zoneCapacity(6, 2), pileMax: 6, ...K }));
    expect(l.fits).toBe(true);
    expect(l.s).toBeGreaterThanOrEqual(60);
  });
  it('one scale for every region, and the floor when nothing fits', () => {
    const l = shareLayout(input({ recipients: 10, cap: 30, pileMax: 60, width: 300, height: 200 }));
    expect(l.s).toBe(MIN_ITEM_PX);
    expect(l.fits).toBe(false);
  });
  it('prefers bigger items over fewer rows', () => {
    const l = shareLayout(input({ recipients: 4, cap: 10, pileMax: 20 }));
    const flat = shareLayout(input({ recipients: 4, cap: 10, pileMax: 20, height: 10_000 }));
    expect(flat.s).toBeGreaterThanOrEqual(l.s);
    expect(l.fits).toBe(true);
  });
});
