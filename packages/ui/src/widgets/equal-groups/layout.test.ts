import { GROUP_CAPACITY, GROUPS_MAX, GROUPS_PILE_MAX } from '@number-island/engine';
import { describe, expect, it } from 'vitest';
import { buildRoom } from '../kit/twoStep';
import { CHROME, chromeAt, groupsLayout, type LayoutInput, MIN_ITEM_PX, partsFor } from './layout';

/** The smallest widget area (906 × 373) inside its card: 3 px border and 24 px padding a side. */
const ROOM = { w: 852, h: 319 };
/** The compact action button as measured (kit `useActionSize`: the 6 px ledge is included). */
const BUTTON = { g1: { w: 76, h: 82 }, k: { w: 96, h: 102 } };

const build = (
  slots: number,
  source: LayoutInput['source'],
  pileMax: number,
  ageMode: 'k' | 'g1-up' = 'g1-up',
  addSlot = false,
): LayoutInput => {
  const room = buildRoom(ROOM, ageMode === 'k' ? BUTTON.k : BUTTON.g1);
  return {
    slots,
    addSlot,
    cap: GROUP_CAPACITY,
    mode: 'build',
    source,
    pileMax,
    width: room.w,
    height: room.h,
    maxItem: ageMode === 'k' ? 96 : 80,
    parts: partsFor(ageMode),
  };
};

describe('equal-groups build layout in the smallest area (906 × 373)', () => {
  it('fits every pile of the supported domain with every number of containers', () => {
    for (let slots = 1; slots <= GROUPS_MAX; slots += 1) {
      for (let pile = 1; pile <= GROUPS_PILE_MAX; pile += 1) {
        const l = groupsLayout(build(slots, 'pile', pile));
        const what = `${slots} containers, a pile of ${pile}`;
        expect(l.fits, what).toBe(true);
        expect(l.s, what).toBeGreaterThanOrEqual(MIN_ITEM_PX);
      }
    }
  });

  it('fits the bucket with up to GROUPS_MAX containers, and the add slot', () => {
    for (let slots = 1; slots <= GROUPS_MAX; slots += 1) {
      expect(groupsLayout(build(slots, 'bucket', 0)).fits, `${slots} from the bucket`).toBe(true);
      const adding = groupsLayout(build(slots, 'pile', GROUPS_PILE_MAX, 'g1-up', true));
      expect(adding.fits, `${slots} with the add slot`).toBe(true);
      // The add button (78 px with its ledge) has room in its slot.
      expect(Math.min(adding.box.w, adding.box.h)).toBeGreaterThanOrEqual(78 + 16);
    }
  });

  it('fits kindergarten content (up to 3 containers, 15 in the pile) at kindergarten sizes', () => {
    for (let slots = 1; slots <= 3; slots += 1) {
      expect(groupsLayout(build(slots, 'bucket', 0, 'k')).fits).toBe(true);
      expect(groupsLayout(build(slots, 'pile', 15, 'k')).fits).toBe(true);
    }
  });

  it('every touched part is a full target: the spot and the container (take-back handle)', () => {
    for (const ageMode of ['g1-up', 'k'] as const) {
      const target = partsFor(ageMode).target;
      const l = groupsLayout(build(2, 'bucket', 0, ageMode));
      expect(l.spot.h).toBeGreaterThanOrEqual(target);
      expect(l.spot.w).toBeGreaterThanOrEqual(target);
      expect(l.box.w).toBeGreaterThanOrEqual(target);
      expect(l.box.h).toBeGreaterThanOrEqual(target);
    }
    const crowded = groupsLayout(build(GROUPS_MAX, 'pile', 36));
    expect(crowded.box.w).toBeGreaterThanOrEqual(64);
    expect(crowded.box.h).toBeGreaterThanOrEqual(64);
  });

  it('draws every container for a full ten, in fives, whatever it holds', () => {
    const l = groupsLayout(build(3, 'pile', 12));
    expect(l.zone.cols * l.zone.rows).toBe(GROUP_CAPACITY);
    expect(Math.max(l.zone.cols, l.zone.rows)).toBe(5);
  });

  it('keeps the top line and the hand strip the same height, so the row stays centred', () => {
    const input = build(3, 'pile', 12);
    const l = groupsLayout(input);
    expect(l.top).toBe(input.parts.top);
    const groupsH = l.rows.length * l.box.h + (l.rows.length - 1) * 16;
    expect(l.height).toBe(Math.max(l.supply.h, groupsH) + 2 * l.top);
  });

  it('says so when nothing fits (a room too small for anything)', () => {
    const l = groupsLayout({ ...build(6, 'pile', 40), width: 300, height: 200 });
    expect(l.fits).toBe(false);
    expect(l.s).toBe(MIN_ITEM_PX);
  });
});

describe('equal-groups picture layout (the ask step, and a picture to read)', () => {
  it('fits up to GROUPS_MAX full containers beside a number pad (427 × 319)', () => {
    for (let slots = 1; slots <= GROUPS_MAX; slots += 1) {
      const l = groupsLayout({
        ...build(slots, null, 0),
        mode: 'picture',
        width: 427,
        height: 319,
      });
      expect(l.fits, `${slots} containers`).toBe(true);
      expect(l.supply.w).toBe(0);
      expect(l.top).toBe(0);
    }
  });
});

describe('container rim', () => {
  it('is the full rim from 36 px sprites up and never under 55 % of it', () => {
    expect(chromeAt(36)).toEqual(CHROME);
    expect(chromeAt(80)).toEqual(CHROME);
    expect(chromeAt(20)).toEqual({ x: 14, top: 17, bottom: 16 });
    expect(chromeAt(10)).toEqual({ x: 14, top: 17, bottom: 15 });
  });
});
