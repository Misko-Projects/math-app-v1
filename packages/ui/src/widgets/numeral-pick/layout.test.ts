import { describe, expect, it } from 'vitest';
import { CARD_GAPS, CARD_LEDGE, MIN_PICTURE, PART_GAP, type PickInput, planPick } from './layout';

const ROOMS = {
  minInner: { w: 852, h: 319 },
  pierK960: { w: 858, h: 366 },
  tablet: { w: 1178, h: 566 },
};
const BUTTON = { k: { w: 114, h: 102 }, 'g1-up': { w: 186, h: 82 } } as const;
/** Cards as measured: a K numeral card, a K number-sentence card, a G1 number-line card. */
const CARD = {
  numeralK: { w: 112, h: 112 },
  sentenceK: { w: 218, h: 112 },
  lineG1: { w: 300, h: 195 },
  lineG1Narrow: { w: 255, h: 195 },
};
const PICTURE = { w: 480, h: 220 };

const input = (over: Partial<PickInput>): PickInput => ({
  room: ROOMS.tablet,
  card: CARD.numeralK,
  n: 4,
  button: BUTTON.k,
  picture: PICTURE,
  classic: { cols: 4, check: 'beside' },
  ...over,
});

/** The whole arrangement's box, as the widget lays it out. */
function arranged(i: PickInput, plan: ReturnType<typeof planPick>) {
  const answer =
    plan.check === 'beside'
      ? { w: plan.cards.w + PART_GAP + i.button.w, h: Math.max(plan.cards.h, i.button.h) }
      : plan.check === 'below'
        ? { w: Math.max(plan.cards.w, i.button.w), h: plan.cards.h + PART_GAP + i.button.h }
        : plan.cards;
  return answer;
}

describe('planPick', () => {
  it('keeps the designed row on a tablet: the cards in one line, Check beside, picture above', () => {
    const plan = planPick(input({}));
    expect(plan).toMatchObject({ side: false, cols: 4, check: 'beside', gap: 24, fits: true });
    expect(plan.picture?.h).toBe(ROOMS.tablet.h - (112 + CARD_LEDGE) - PART_GAP);
  });

  it('a spoken question (no picture) only needs the cards and Check to fit', () => {
    const plan = planPick(input({ picture: null, room: ROOMS.minInner }));
    expect(plan).toMatchObject({
      side: false,
      cols: 4,
      check: 'beside',
      picture: null,
      fits: true,
    });
  });

  it('wide cards under a picture go beside it, two by two (ADD.23.t3 at both viewports)', () => {
    for (const room of [ROOMS.minInner, ROOMS.pierK960, ROOMS.tablet]) {
      const i = input({ room, card: CARD.sentenceK, classic: { cols: 2, check: 'below' } });
      const plan = planPick(i);
      expect(plan.fits).toBe(true);
      const answer = arranged(i, plan);
      expect(answer.h).toBeLessThanOrEqual(room.h);
      expect(plan.picture?.w ?? 0).toBeGreaterThanOrEqual(MIN_PICTURE.w);
      expect(plan.picture?.h ?? 0).toBeGreaterThanOrEqual(MIN_PICTURE.h);
      if (room !== ROOMS.tablet) expect(plan).toMatchObject({ side: true, cols: 2 });
    }
  });

  it('three number-line cards: no arrangement at full width in the smallest areas, one row narrower', () => {
    const i = (card: PickInput['card'], room: PickInput['room']) =>
      input({ room, card, n: 3, button: BUTTON['g1-up'], classic: { cols: 2, check: 'below' } });
    expect(planPick(i(CARD.lineG1, ROOMS.minInner)).fits).toBe(false);
    const narrow = planPick(i(CARD.lineG1Narrow, ROOMS.minInner));
    expect(narrow).toMatchObject({ side: false, cols: 3, check: 'top', fits: true });
    // Check stands beside the picture, which keeps at least Check's height.
    expect(narrow.picture?.h ?? 0).toBeGreaterThanOrEqual(BUTTON['g1-up'].h);
    expect(narrow.picture?.w).toBe(ROOMS.minInner.w - BUTTON['g1-up'].w - PART_GAP);
    expect(planPick(i(CARD.lineG1, ROOMS.tablet)).fits).toBe(true);
  });

  it('Check takes a free cell only where the grid has one, and never a row of its own', () => {
    const i = input({
      room: ROOMS.pierK960,
      card: CARD.lineG1,
      n: 3,
      button: BUTTON['g1-up'],
      picture: null,
      classic: { cols: 2, check: 'below' },
    });
    const plan = planPick({ ...i, room: { w: 660, h: 430 } });
    expect(plan).toMatchObject({ cols: 2, check: 'cell', fits: true });
    expect(plan.cards.h).toBe(2 * (195 + CARD_LEDGE) + plan.gap);
  });

  it('cards go 12 px apart only when nothing fits at 24, and never closer', () => {
    const tight = planPick(
      input({ room: { w: 500, h: 319 }, picture: null, classic: { cols: 4, check: 'beside' } }),
    );
    expect(CARD_GAPS).toEqual([24, 12]);
    expect(tight.fits).toBe(true);
    expect(tight.gap).toBeGreaterThanOrEqual(12);
  });

  it('when nothing fits it still returns the arrangement that overflows least', () => {
    const plan = planPick(input({ room: { w: 200, h: 100 } }));
    expect(plan.fits).toBe(false);
    expect(plan.cols).toBeGreaterThanOrEqual(1);
  });

  it('every plan over a sweep of rooms and card counts is inside its room when it says it fits', () => {
    for (let w = 500; w <= 1200; w += 50) {
      for (let h = 250; h <= 600; h += 50) {
        for (let n = 2; n <= 10; n += 1) {
          for (const picture of [null, PICTURE]) {
            const i = input({ room: { w, h }, n, picture, classic: { cols: n, check: 'beside' } });
            const plan = planPick(i);
            if (!plan.fits) continue;
            const answer = arranged(i, plan);
            const what = `${w}x${h} n=${n} ${picture ? 'picture' : 'spoken'}`;
            expect(answer.w, what).toBeLessThanOrEqual(w + 0.5);
            expect(answer.h, what).toBeLessThanOrEqual(h + 0.5);
            if (plan.picture) {
              const total = plan.side
                ? { w: plan.picture.w + PART_GAP + answer.w, h: Math.max(plan.picture.h, answer.h) }
                : {
                    w: Math.max(plan.picture.w, answer.w),
                    h: plan.picture.h + PART_GAP + answer.h,
                  };
              expect(total.w, what).toBeLessThanOrEqual(w + 0.5);
              expect(total.h, what).toBeLessThanOrEqual(h + 0.5);
              expect(plan.picture.w, what).toBeGreaterThanOrEqual(MIN_PICTURE.w);
              expect(plan.picture.h, what).toBeGreaterThanOrEqual(MIN_PICTURE.h);
            }
          }
        }
      }
    }
  });
});
