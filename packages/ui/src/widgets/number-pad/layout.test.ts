import { describe, expect, it } from 'vitest';
import { MIN_TARGET_PX, TARGET_GAP_PX, TARGET_PX } from '../../tokens/tokens';
import { PAD_KEYS_CHOICES, padKeysSize } from '../kit/padKeys';
import {
  ASK_GAP,
  MIN_ASK,
  PAD_CONTROLS,
  padControlsSize,
  padRowSize,
  planBreak,
  planPad,
  planPadRow,
  STACK_BELOW_W,
} from './layout';

/** The smallest widget area (906 × 373) inside its card, and the pier's own areas (#12). */
const ROOMS = {
  minInner: { w: 852, h: 319 },
  pierK960: { w: 858, h: 366 },
  pierG1960: { w: 858, h: 358 },
  tablet: { w: 1178, h: 566 },
  portrait: { w: 692, h: 758 },
};
/** Check as measured (kit `useActionSize`): icon-only in K, with its word from Grade 1. */
const BUTTON = { k: { w: 114, h: 102 }, 'g1-up': { w: 186, h: 82 } } as const;
const AGES = ['k', 'g1-up'] as const;

describe('the number pad keys (kit padKeys)', () => {
  it('every choice keeps the minimum target and the 12 px gap', () => {
    for (const age of AGES) {
      for (const c of PAD_KEYS_CHOICES) {
        const size = padKeysSize(c, age);
        const cols = c.shape === '4x3' ? 4 : 3;
        const rows = 12 / cols;
        const key = c.compact ? MIN_TARGET_PX[age] : TARGET_PX[age].big;
        expect(key).toBeGreaterThanOrEqual(MIN_TARGET_PX[age]);
        expect(size.w).toBe(cols * key + (cols - 1) * TARGET_GAP_PX);
        // A compact key's row holds its 4 px ledge, so the key itself is the full target.
        expect(size.h).toBeGreaterThanOrEqual(
          rows * MIN_TARGET_PX[age] + (rows - 1) * TARGET_GAP_PX,
        );
      }
    }
  });

  it('a K pad of 80 px keys is taller than the smallest area unless it turns 4 × 3', () => {
    expect(padKeysSize({ shape: '3x4', compact: true }, 'k').h).toBeGreaterThan(ROOMS.minInner.h);
    expect(padKeysSize({ shape: '4x3', compact: true }, 'k').h).toBeLessThanOrEqual(
      ROOMS.minInner.h,
    );
  });
});

describe('planPad', () => {
  it('fits every supported area in both age modes, the question at least its minimum', () => {
    for (const [name, room] of Object.entries(ROOMS)) {
      for (const age of AGES) {
        const plan = planPad(room, BUTTON[age], age);
        const what = `${name} ${age}`;
        expect(plan.fits, what).toBe(true);
        expect(plan.controls.h, what).toBeLessThanOrEqual(room.h);
        expect(plan.controls.w, what).toBeLessThanOrEqual(room.w);
        expect(plan.ask.w, what).toBeGreaterThanOrEqual(MIN_ASK.w);
        expect(plan.ask.h, what).toBeGreaterThanOrEqual(MIN_ASK.h);
        if (plan.stacked) {
          expect(plan.ask.h + ASK_GAP + plan.controls.h, what).toBeLessThanOrEqual(room.h);
        } else {
          expect(plan.ask.w + ASK_GAP + plan.controls.w, what).toBeLessThanOrEqual(room.w);
        }
      }
    }
  });

  it('keeps the designed pad where the room allows and gives way in order', () => {
    // Tablet: big keys, Check under them.
    expect(planPad(ROOMS.tablet, BUTTON.k, 'k')).toMatchObject({
      shape: '3x4',
      compact: false,
      check: 'under',
      stacked: false,
    });
    // The pier at 960 × 600, Grade 1: big keys with Check beside them.
    expect(planPad(ROOMS.pierG1960, BUTTON['g1-up'], 'g1-up')).toMatchObject({
      shape: '3x4',
      compact: false,
      check: 'beside',
    });
    // The smallest area in K: 4 × 3, Check beside.
    expect(planPad(ROOMS.minInner, BUTTON.k, 'k')).toMatchObject({
      shape: '4x3',
      compact: true,
      check: 'beside',
    });
    // A portrait area stacks the controls under the question.
    expect(planPad(ROOMS.portrait, BUTTON.k, 'k').stacked).toBe(true);
    expect(ROOMS.portrait.w).toBeLessThan(STACK_BELOW_W);
  });

  it('the controls it tries are in order of roominess, and their sizes add up', () => {
    const sizes = PAD_CONTROLS.map((c) => padControlsSize(c, BUTTON.k, 'k'));
    expect(PAD_CONTROLS[0]).toEqual({ shape: '3x4', compact: false, check: 'under' });
    expect(sizes[0]?.h).toBe(4 * 96 + 3 * 12 + 16 + 102);
    expect(sizes.at(-1)).toEqual({ w: 4 * 80 + 3 * 12 + 16 + 114, h: 3 * 84 + 2 * 12 });
  });

  it('a room too small for any controls returns the smallest, marked as not fitting', () => {
    const plan = planPad({ w: 400, h: 200 }, BUTTON.k, 'k');
    expect(plan.fits).toBe(false);
    expect(plan).toMatchObject({ shape: '4x3', compact: true, check: 'beside' });
    expect(plan.ask.w).toBeGreaterThanOrEqual(MIN_ASK.w);
  });
});

describe('the one-row pad (legibility bars)', () => {
  it('is 11 keys of 64 px, 12 px apart, and leaves the question the room less Check', () => {
    expect(padRowSize('g1-up', false)).toEqual({ w: 11 * 64 + 10 * 12, h: 68 });
    expect(padRowSize('g1-up', true).w).toBe(12 * 64 + 11 * 12);
    const row = planPadRow(ROOMS.pierG1960, { w: 84, h: 72 }, 'g1-up', false);
    expect(row?.keys.w).toBeLessThanOrEqual(ROOMS.pierG1960.w);
    expect(row?.ask).toEqual({ w: 858 - 84 - ASK_GAP, h: 358 - 68 - ASK_GAP });
  });

  it('never for K keys, portrait rooms, or a row wider than the room', () => {
    expect(planPadRow(ROOMS.pierK960, BUTTON.k, 'k', false)).toBeNull();
    expect(planPadRow(ROOMS.portrait, BUTTON['g1-up'], 'g1-up', false)).toBeNull();
    expect(planPadRow({ w: 860, h: 358 }, BUTTON['g1-up'], 'g1-up', true)).toBeNull();
  });
});

describe('a sentence on two rows (legibility bars)', () => {
  // 10 × 8 = 10 × 4 + 10 × 4 = □ + □ = □
  const W = [36, 20, 18, 20, 36, 20, 18, 20, 36, 20, 18, 20, 64, 20, 64, 20, 64];
  const EQ = W.map((_, i) => i === 3 || i === 11 || i === 15);

  it('breaks only before an "=", the narrowest wider row, indented under the first "="', () => {
    const b = planBreak(W, EQ, 16, 520);
    expect(b?.at).toBe(11);
    expect(EQ[b?.at ?? 0]).toBe(true);
    expect(b?.indent).toBe(36 + 20 + 18 + 3 * 16);
    expect(b?.w).toBeLessThanOrEqual(520);
  });

  it('null when no row fits, or with no "=" to break before', () => {
    expect(planBreak(W, EQ, 16, 200)).toBeNull();
    expect(planBreak([64, 40, 64], [false, false, false], 16, 100)).toBeNull();
  });
});
