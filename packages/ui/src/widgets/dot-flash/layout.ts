import { type AgeMode, MIN_TARGET_PX, TARGET_GAP_PX, TARGET_PX } from '../../tokens/tokens';
import {
  numeralTraySize,
  PAD_KEYS_CHOICES,
  type PadKeysChoice,
  padKeysSize,
  type Size,
  trayColumnChoices,
} from '../kit';

/**
 * dot-flash's layout in the measured room (06 §1). The board takes the room the controls leave
 * (its picture is drawn to fit it); the controls never go under the bars (06 §4).
 *
 * - `classic`: the board with "look again" under it; beside them the entered number over the keys
 *   (or the big numeral tray) and Check.
 * - short rooms: the entered number and Check move into the row under the board, next to "look
 *   again" (all three without their words), and the keys (or a tray of plain cards) stand alone
 *   beside the board, as small as the room needs (kit `PAD_KEYS_CHOICES`).
 */
export interface FlashPlan {
  classic: boolean;
  /** Pad input: the keys. */
  keys: PadKeysChoice;
  /** Pick input: the cards a row. */
  trayColumns: number;
  /** The controls under the board (narrow, tall rooms) instead of beside it. */
  stacked: boolean;
  /** False when even the smallest controls are taller than the room. */
  fits: boolean;
}

/** A room narrower than this stacks the answer under the board (portrait areas). */
export const STACK_BELOW_W = 760;
/** The board is never planned smaller than this (it holds up to twenty dots at 22 px). */
export const MIN_BOARD_H = 150;
/** `.ni-flash__pad` gap: the entered number over the keys. */
const DISPLAY_GAP = 20;
/** `.ni-flash__look` and `.ni-flash__answer` gaps. */
export const PART_GAP = 16;
/** dot-flash's big tray (dot-flash.css `--tray-card-scale`). */
const BIG_TRAY_SCALE = 1.4;
const BIG_TRAY_COLUMNS = 3;

/** A big action button with its ledge, and the entered number (NumberDisplay `lg`). */
const actionH = (ageMode: AgeMode) => TARGET_PX[ageMode].big + 6;
const displayH = (ageMode: AgeMode) => Math.max(TARGET_PX[ageMode].big, 92);

/** The big tray's height: rows of cards 1.4 × the minimum target, in the tray panel. */
function bigTrayH(n: number, ageMode: AgeMode): number {
  const rows = Math.ceil(n / BIG_TRAY_COLUMNS);
  return rows * (MIN_TARGET_PX[ageMode] * 1.15 * BIG_TRAY_SCALE + TARGET_GAP_PX + 6) + 30;
}

export function planFlash(
  room: Size,
  ageMode: AgeMode,
  input: 'pad' | 'pick',
  options: readonly number[],
): FlashPlan {
  const stacked = room.w < STACK_BELOW_W;
  const under = actionH(ageMode) + PART_GAP;
  // Stacked, the answer shares the height with the board and the row under it.
  const h = stacked ? room.h - MIN_BOARD_H - under - PART_GAP : room.h;
  const big = PAD_KEYS_CHOICES[0] as PadKeysChoice;
  if (input === 'pad') {
    if (displayH(ageMode) + DISPLAY_GAP + padKeysSize(big, ageMode).h <= h) {
      return { classic: true, keys: big, trayColumns: 0, stacked, fits: true };
    }
    const keys = PAD_KEYS_CHOICES.find((c) => padKeysSize(c, ageMode).h <= h);
    const smallest = PAD_KEYS_CHOICES.at(-1) as PadKeysChoice;
    return {
      classic: false,
      keys: keys ?? smallest,
      trayColumns: 0,
      stacked,
      fits: keys !== undefined,
    };
  }
  const n = options.length;
  if (bigTrayH(n, ageMode) + 32 + actionH(ageMode) <= h) {
    return { classic: true, keys: big, trayColumns: BIG_TRAY_COLUMNS, stacked, fits: true };
  }
  // Plain cards, in the narrowest tray (two a row at least) the height holds.
  const digits = Math.max(1, ...options.map((v) => String(Math.abs(v)).length));
  const widths = trayColumnChoices(n)
    .filter((c) => c >= Math.min(2, n))
    .reverse();
  const trayH = (c: number) =>
    numeralTraySize(n, digits, c, MIN_TARGET_PX[ageMode], TARGET_GAP_PX).h;
  const columns = widths.find((c) => trayH(c) <= h);
  return {
    classic: false,
    keys: big,
    trayColumns: columns ?? Math.max(1, n),
    stacked,
    fits: columns !== undefined,
  };
}
