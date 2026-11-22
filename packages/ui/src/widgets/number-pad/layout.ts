import type { AgeMode } from '../../tokens/tokens';
import { PAD_KEYS_CHOICES, type PadKeysChoice, padKeysSize, type Size } from '../kit';

/**
 * number-pad's layout in the measured room (06 §1): the question (`ask`) and the controls (the
 * keys and Check). The controls never go under the bars (06 §4); what gives is, in order: Check
 * moves beside the keys, the keys get smaller, and the pad turns from 3 × 4 to 4 × 3 (kit
 * `PAD_KEYS_CHOICES`). The question gets the room that is left and is drawn to fit it, its
 * picture first.
 */

export interface PadControls extends PadKeysChoice {
  /** Check under the keys, or to their right. */
  check: 'under' | 'beside';
}

export interface PadPlan extends PadControls {
  /** The controls under the question (narrow, tall rooms) instead of beside it. */
  stacked: boolean;
  /** The box the question is drawn in. */
  ask: Size;
  controls: Size;
  /** False when even the smallest controls leave the question less than its minimum. */
  fits: boolean;
}

/** Between the question and the controls. */
export const ASK_GAP = 24;
/** Between the keys and Check. */
export const CHECK_GAP = 16;
/** The least the question is given: a one-blank expression at its 32 px floor (05 §11). */
export const MIN_ASK: Size = { w: 240, h: 150 };
/** A room narrower than this stacks the controls under the question (portrait areas). */
export const STACK_BELOW_W = 760;

export function padControlsSize(c: PadControls, button: Size, ageMode: AgeMode): Size {
  const keys = padKeysSize(c, ageMode);
  return c.check === 'under'
    ? { w: Math.max(keys.w, button.w), h: keys.h + CHECK_GAP + button.h }
    : { w: keys.w + CHECK_GAP + button.w, h: Math.max(keys.h, button.h) };
}

/** The controls to try, most roomy first: each key choice with Check under it, then beside it. */
export const PAD_CONTROLS: readonly PadControls[] = PAD_KEYS_CHOICES.flatMap((keys) =>
  (['under', 'beside'] as const).map((check) => ({ ...keys, check })),
);

/** `button`: the Check button as drawn (kit `useActionSize`). */
export function planPad(room: Size, button: Size, ageMode: AgeMode): PadPlan {
  const stacked = room.w < STACK_BELOW_W;
  let last: PadPlan | null = null;
  for (const c of PAD_CONTROLS) {
    const controls = padControlsSize(c, button, ageMode);
    const ask = stacked
      ? { w: room.w, h: room.h - controls.h - ASK_GAP }
      : { w: room.w - controls.w - ASK_GAP, h: room.h };
    const fits =
      controls.w <= room.w && controls.h <= room.h && ask.w >= MIN_ASK.w && ask.h >= MIN_ASK.h;
    last = { ...c, stacked, ask, controls, fits };
    if (fits) return last;
  }
  const plan = last as PadPlan;
  return {
    ...plan,
    ask: { w: Math.max(plan.ask.w, MIN_ASK.w), h: Math.max(plan.ask.h, MIN_ASK.h) },
  };
}
