import {
  SHARE_ITEMS_MAX,
  SHARE_RECIPIENTS_MAX,
  SHARE_ZONE_MAX,
  shareCapacity,
  shareZoneMax,
} from '@number-island/engine';
import { describe, expect, it } from 'vitest';
import { buildRoom, planAsk } from '../kit/twoStep';
import { chromeFor, type LayoutInput, MIN_ITEM_PX, pictureInput, shareLayout } from './layout';

/** The smallest widget area (906 × 373) inside its card: 3 px border and 24 px padding a side. */
const ROOM = { w: 852, h: 319 };
/** The compact action button as measured (kit `useActionSize`: the 6 px ledge is included). */
const BUTTON = { g1: { w: 76, h: 82 }, k: { w: 96, h: 102 } };

const build = (
  items: number,
  recipients: number,
  kind: LayoutInput['kind'],
  ageMode: 'k' | 'g1-up',
  predealt?: number[],
): LayoutInput => {
  const room = buildRoom(ROOM, ageMode === 'k' ? BUTTON.k : BUTTON.g1);
  return {
    recipients,
    kind,
    cap: shareCapacity({ items, recipients, predealt }),
    pileMax: items,
    mode: 'deal',
    seagullMax: recipients - 1,
    width: room.w,
    height: room.h,
    maxItem: ageMode === 'k' ? 104 : 84,
    chrome: chromeFor(ageMode),
  };
};

describe('equal-share build layout in the smallest area (906 × 373)', () => {
  it('fits every share of the supported domain, with items of 20 px or more', () => {
    for (let items = 1; items <= SHARE_ITEMS_MAX; items += 1) {
      for (let recipients = 2; recipients <= SHARE_RECIPIENTS_MAX; recipients += 1) {
        for (const kind of ['pebbling', 'plate'] as const) {
          const l = shareLayout(build(items, recipients, kind, 'g1-up'));
          const what = `${items} among ${recipients} ${kind}s`;
          expect(l.fits, what).toBe(true);
          expect(l.s, what).toBeGreaterThanOrEqual(MIN_ITEM_PX);
        }
      }
    }
  });

  it('fits the fullest pre-dealt share for every number of recipients, at the most items', () => {
    for (let recipients = 2; recipients <= SHARE_RECIPIENTS_MAX; recipients += 1) {
      for (const kind of ['pebbling', 'plate'] as const) {
        const most = shareZoneMax(recipients);
        const rest = Array.from({ length: recipients - 1 }, () => 1);
        const l = shareLayout(build(SHARE_ITEMS_MAX, recipients, kind, 'g1-up', [most, ...rest]));
        const what = `${most} pre-dealt to one of ${recipients} ${kind}s`;
        expect(l.fits, what).toBe(true);
        expect(l.zone.cols * l.zone.rows, what).toBeGreaterThanOrEqual(most);
      }
    }
  });

  it('fits the fullest pre-dealt recipient (SHARE_ZONE_MAX on one of two plates)', () => {
    const l = shareLayout(build(24, 2, 'plate', 'g1-up', [SHARE_ZONE_MAX, 9]));
    expect(l.fits).toBe(true);
    expect(l.zone.cols * l.zone.rows).toBeGreaterThanOrEqual(SHARE_ZONE_MAX);
  });

  it('fits kindergarten content (up to 10 among 2 or 3) at kindergarten sizes', () => {
    for (let items = 2; items <= 10; items += 1) {
      for (const recipients of [2, 3]) {
        const l = shareLayout(build(items, recipients, 'pebbling', 'k'));
        expect(l.fits, `${items} among ${recipients}`).toBe(true);
      }
    }
  });

  it('every touched part is a full target: the spot, the mat (take-back handle), the card', () => {
    for (const ageMode of ['g1-up', 'k'] as const) {
      const target = chromeFor(ageMode).target;
      for (const items of [2, 6, 10]) {
        const l = shareLayout(build(items, 2, 'pebbling', ageMode));
        expect(l.spot).toBeGreaterThanOrEqual(target);
        expect(l.zone.w).toBeGreaterThanOrEqual(target);
        expect(l.zone.h).toBeGreaterThanOrEqual(target);
        expect(l.card.w).toBeGreaterThanOrEqual(target);
        expect(l.gull.boxW).toBeGreaterThanOrEqual(target);
        expect(l.gull.boxH).toBeGreaterThanOrEqual(target);
      }
    }
  });

  it('keeps the note line and the hand strip the same height, so the row stays centred', () => {
    const input = build(12, 3, 'pebbling', 'g1-up');
    const l = shareLayout(input);
    expect(l.note).toBe(input.chrome.note);
    const row = Math.max(l.basket.h, l.card.h, l.nest.h);
    expect(l.height).toBe(row + 2 * l.note);
  });

  it('a zone is drawn for its capacity, in fives, whatever it holds', () => {
    const l = shareLayout(build(12, 3, 'pebbling', 'g1-up'));
    // 12 among 3: a fair share is 4, the mat has room for 10.
    expect(l.zone.cols * l.zone.rows).toBe(10);
    expect(Math.max(l.zone.cols, l.zone.rows)).toBe(5);
  });

  it('says so when nothing fits (a room too small for anything)', () => {
    const l = shareLayout({ ...build(24, 4, 'pebbling', 'g1-up'), width: 300, height: 200 });
    expect(l.fits).toBe(false);
    expect(l.s).toBe(MIN_ITEM_PX);
  });
});

describe('equal-share ask step in the smallest area (906 × 373)', () => {
  /** The widget's own plan: the answer 0 … items, Back and Check, and the picture that is left. */
  const ask = (
    items: number,
    recipients: number,
    kind: LayoutInput['kind'],
    left: { pile: number; seagull: number },
    ageMode: 'k' | 'g1-up' = 'g1-up',
  ) =>
    planAsk({
      ageMode,
      max: items,
      button: ageMode === 'k' ? BUTTON.k : BUTTON.g1,
      actions: 2,
      room: ROOM,
      pictureScore: (box) => {
        const cap = shareCapacity({ items, recipients });
        const l = shareLayout(pictureInput({ recipients, kind, cap }, left, box, ageMode));
        return l.fits && l.s >= MIN_ITEM_PX ? l.s : 0;
      },
    });

  it('keeps a countable picture for every share and everything that can be left over', () => {
    // Next opens the ask step only when fewer than a round is left in the basket.
    for (let items = 1; items <= SHARE_ITEMS_MAX; items += 1) {
      for (let recipients = 2; recipients <= SHARE_RECIPIENTS_MAX; recipients += 1) {
        for (const kind of ['pebbling', 'plate'] as const) {
          for (const left of [
            { pile: 0, seagull: 0 },
            { pile: 0, seagull: recipients - 1 },
            { pile: recipients - 1, seagull: 0 },
            { pile: recipients - 1, seagull: recipients - 1 },
          ]) {
            const p = ask(items, recipients, kind, left);
            const what = `${items} among ${recipients} ${kind}s, ${left.pile} + ${left.seagull} left`;
            expect(p.fits, what).toBe(true);
            expect(p.picture, what).not.toBeNull();
          }
        }
      }
    }
  });

  it('keeps the picture for kindergarten content at kindergarten sizes', () => {
    for (let items = 2; items <= 10; items += 1) {
      for (const recipients of [2, 3]) {
        const p = ask(items, recipients, 'pebbling', { pile: 0, seagull: 0 }, 'k');
        expect(p.picture, `${items} among ${recipients}`).not.toBeNull();
      }
    }
  });
});

describe('equal-share picture layout (the ask step)', () => {
  it('has no controls, no note line and a small seagull', () => {
    const l = shareLayout({
      ...build(7, 3, 'pebbling', 'g1-up'),
      mode: 'picture',
      pileMax: 0,
      seagullMax: 1,
      width: 400,
      height: 319,
    });
    expect(l.fits).toBe(true);
    expect(l.note).toBe(0);
    expect(l.basket.w).toBe(0);
    expect(l.nest.w).toBeGreaterThan(0);
  });

  it('fits the largest share beside a number pad (427 × 319)', () => {
    for (const recipients of [2, 3, 4]) {
      const l = shareLayout({
        ...build(24, recipients, 'pebbling', 'g1-up'),
        mode: 'picture',
        pileMax: 0,
        seagullMax: 0,
        width: 427,
        height: 319,
      });
      expect(l.fits, `24 among ${recipients}`).toBe(true);
    }
  });
});
