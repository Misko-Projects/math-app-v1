import { describe, expect, it } from 'vitest';
import { padKeysSize } from '../kit/padKeys';
import { MIN_BOARD_H, PART_GAP, planFlash, STACK_BELOW_W } from './layout';

const ROOMS = {
  minInner: { w: 852, h: 319 },
  pierK960: { w: 858, h: 366 },
  pierG1960: { w: 858, h: 358 },
  tablet: { w: 1178, h: 566 },
  /** A story stage that grows with its content (kit `roomBox`). */
  unbounded: { w: 1178, h: 560 },
};
const AGES = ['k', 'g1-up'] as const;

describe('planFlash, pad input', () => {
  it('the keys always fit the height, and the board keeps its least height', () => {
    for (const [name, room] of Object.entries(ROOMS)) {
      for (const age of AGES) {
        const plan = planFlash(room, age, 'pad', []);
        const what = `${name} ${age}`;
        expect(plan.fits, what).toBe(true);
        const keys = padKeysSize(plan.keys, age);
        expect(keys.h, what).toBeLessThanOrEqual(room.h);
        // Under the board: one row of big buttons (K 102 px, G1 82 px).
        const under = (age === 'k' ? 102 : 82) + PART_GAP;
        expect(room.h - under, what).toBeGreaterThanOrEqual(MIN_BOARD_H);
      }
    }
  });

  it('keeps the designed layout on a tablet and on a growing stage', () => {
    for (const age of AGES) {
      expect(planFlash(ROOMS.tablet, age, 'pad', [])).toMatchObject({
        classic: true,
        keys: { shape: '3x4', compact: false },
      });
      expect(planFlash(ROOMS.unbounded, age, 'pad', []).classic).toBe(true);
    }
  });

  it('a short room moves the number and Check under the board and shrinks the keys in order', () => {
    expect(planFlash(ROOMS.pierK960, 'k', 'pad', [])).toMatchObject({
      classic: false,
      keys: { shape: '4x3', compact: true },
    });
    expect(planFlash(ROOMS.pierG1960, 'g1-up', 'pad', [])).toMatchObject({
      classic: false,
      keys: { shape: '3x4', compact: false },
    });
    expect(planFlash(ROOMS.minInner, 'g1-up', 'pad', [])).toMatchObject({
      classic: false,
      keys: { shape: '3x4', compact: true },
    });
  });

  it('a portrait room stacks, and plans the keys for the height the board leaves', () => {
    const room = { w: 692, h: 758 };
    expect(room.w).toBeLessThan(STACK_BELOW_W);
    const plan = planFlash(room, 'k', 'pad', []);
    expect(plan.stacked).toBe(true);
    expect(plan.fits).toBe(true);
    expect(padKeysSize(plan.keys, 'k').h).toBeLessThanOrEqual(room.h - MIN_BOARD_H - 102 - 32);
  });
});

describe('planFlash, pick input', () => {
  it('three big cards keep the designed tray; more go plain, as many a row as the height asks', () => {
    expect(planFlash(ROOMS.tablet, 'k', 'pick', [6, 7, 8])).toMatchObject({
      classic: true,
      trayColumns: 3,
    });
    const short = planFlash(ROOMS.minInner, 'k', 'pick', [3, 4, 5, 6, 7, 8]);
    expect(short.classic).toBe(false);
    expect(short.fits).toBe(true);
    expect(short.trayColumns).toBeGreaterThanOrEqual(2);
  });

  it('says so when no tray fits the height', () => {
    const plan = planFlash({ w: 852, h: 120 }, 'k', 'pick', [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(plan.fits).toBe(false);
  });
});
