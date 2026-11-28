import { type AgeMode, MIN_TARGET_PX, TARGET_GAP_PX } from '../../tokens/tokens';
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

/** A compact key's ledge (kit.css `.ni-pad__key` margin). */
const KEY_LEDGE = 4;

/** The one-row pad's keys (1–9, 0, ⌫, and a decimal key when a blank takes one). */
export function padRowSize(ageMode: AgeMode, allowDecimal: boolean): Size {
  const k = MIN_TARGET_PX[ageMode];
  const n = allowDecimal ? 12 : 11;
  return { w: n * k + (n - 1) * TARGET_GAP_PX, h: k + KEY_LEDGE };
}

/**
 * The one-row pad layout (06 §1, the legibility bars): the keys in one row under the question and
 * Check beside the question, so the question gets the room's whole width. Only for g1-up keys
 * (a K row of 80 px keys is wider than the smallest landscape area) and wide rooms; null when the
 * row does not fit.
 */
export function planPadRow(
  room: Size,
  button: Size,
  ageMode: AgeMode,
  allowDecimal: boolean,
): { ask: Size; keys: Size } | null {
  if (ageMode !== 'g1-up' || room.w < STACK_BELOW_W) return null;
  const keys = padRowSize(ageMode, allowDecimal);
  const ask = { w: room.w - button.w - ASK_GAP, h: room.h - keys.h - ASK_GAP };
  if (keys.w > room.w || ask.w < MIN_ASK.w || ask.h < MIN_ASK.h) return null;
  return { ask, keys };
}

/** Where a sentence too wide for one row breaks (`planBreak`). */
export interface SentenceBreak {
  /** The token the second row starts with: always an "=". */
  at: number;
  /** The second row's indent, so its "=" sits under the first row's first "=" (0 without one). */
  indent: number;
  /** The wider row's width. */
  w: number;
}

/**
 * Two rows for a sentence that is too wide at its smallest numerals (the legibility bars): it
 * breaks only before an "=" (never inside a fraction or between a number and its unit, which are
 * one token each), the second row indented so it reads as the same equation. Picks the break with
 * the narrowest wider row; null when no break fits `maxW`.
 *
 * `widths`: each token's drawn width; `gap`: between tokens; `isEq`: the token is "=".
 */
export function planBreak(
  widths: readonly number[],
  isEq: readonly boolean[],
  gap: number,
  maxW: number,
): SentenceBreak | null {
  const span = (from: number, to: number) => {
    let w = 0;
    for (let i = from; i < to; i += 1) w += widths[i] ?? 0;
    return w + Math.max(0, to - from - 1) * gap;
  };
  let best: SentenceBreak | null = null;
  for (let at = 1; at < widths.length; at += 1) {
    if (!isEq[at]) continue;
    const firstEq = isEq.findIndex((eq, i) => eq && i < at);
    const indent = firstEq > 0 ? span(0, firstEq) + gap : 0;
    const w = Math.max(span(0, at), indent + span(at, widths.length));
    if (w <= maxW && (!best || w < best.w)) best = { at, indent, w };
  }
  return best;
}

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
