import { TARGET_GAP_PX } from '../../tokens/tokens';
import { overflow, type Size } from '../kit';

/**
 * numeral-pick's layout in the measured room (06 §1): the choice cards and Check keep their size;
 * the picture gets the room they leave and is drawn to fit it. What changes with the room is the
 * arrangement: how many cards a row, where Check sits, and whether the picture is above the cards
 * or beside them (wide cards under a picture do not fit a landscape tablet: #20).
 */

/** Where Check sits. */
export type CheckPlace =
  /** After the last card, in the cards' own grid (a free cell in its last row). */
  | 'cell'
  /** To the right of the cards. */
  | 'beside'
  /** Under the cards. */
  | 'below'
  /** Beside the picture, above the cards (the cards take the whole width). */
  | 'top';

export interface PickArrangement {
  /** The picture beside the cards instead of above them. */
  side: boolean;
  /** Cards a row. */
  cols: number;
  check: CheckPlace;
}

export interface PickPlan extends PickArrangement {
  /** Between cards. */
  gap: number;
  /** The cards' block (without Check). */
  cards: Size;
  /** The box the picture is drawn in; null without a picture. */
  picture: Size | null;
  fits: boolean;
}

export interface PickInput {
  room: Size;
  /** The largest card, as measured (cards share one size). */
  card: Size;
  /** How many cards. */
  n: number;
  /** Check as measured (kit `useActionSize`). */
  button: Size;
  /** The picture's natural size with its frame; null when the question is only spoken. */
  picture: Size | null;
  /** The designed arrangement (the config's `layout`), kept wherever the picture stays legible. */
  classic: Pick<PickArrangement, 'cols' | 'check'>;
}

/** Between cards (06 §4 asks 12 px; the designed look is twice that). */
export const CARD_GAPS = [2 * TARGET_GAP_PX, TARGET_GAP_PX] as const;
/** Between the cards and Check, and between the picture and the answer. */
export const PART_GAP = 16;
/** A card's ledge under it (kit.css `.ni-pick` margin). */
export const CARD_LEDGE = 6;
/** The least a picture is given. */
export const MIN_PICTURE: Size = { w: 150, h: 96 };
/** The designed arrangement wins while its picture is at least this much of the best one. */
const CLASSIC_BONUS = 1.25;

const CHECKS: readonly CheckPlace[] = ['beside', 'below', 'cell', 'top'];

interface Scored {
  plan: PickPlan;
  over: number;
  score: number;
}

function candidate(input: PickInput, a: PickArrangement, gap: number): Scored | null {
  const { room, card, n, button } = input;
  const hasPicture = input.picture !== null;
  if (a.side && !hasPicture) return null;
  if (a.check === 'top' && (!hasPicture || a.side)) return null;
  const inCell = a.check === 'cell';
  if (inCell && (button.w > card.w || button.h > card.h + CARD_LEDGE)) return null;
  const items = inCell ? n + 1 : n;
  const rows = Math.ceil(items / a.cols);
  // Check in a cell of its own row would be Check under the cards.
  if (inCell && (rows - 1) * a.cols >= n) return null;
  if (a.cols > items) return null;
  const cards: Size = {
    w: a.cols * card.w + (a.cols - 1) * gap,
    h: rows * (card.h + CARD_LEDGE) + (rows - 1) * gap,
  };
  const answer: Size =
    a.check === 'beside'
      ? { w: cards.w + PART_GAP + button.w, h: Math.max(cards.h, button.h) }
      : a.check === 'below'
        ? { w: Math.max(cards.w, button.w), h: cards.h + PART_GAP + button.h }
        : cards;
  let box: Size | null = null;
  let need: Size = answer;
  if (hasPicture) {
    box = a.side
      ? { w: room.w - answer.w - PART_GAP, h: room.h }
      : {
          w: room.w - (a.check === 'top' ? button.w + PART_GAP : 0),
          h: room.h - answer.h - PART_GAP,
        };
    const least: Size = {
      w: MIN_PICTURE.w,
      h: a.check === 'top' ? Math.max(MIN_PICTURE.h, button.h) : MIN_PICTURE.h,
    };
    const top = a.check === 'top' ? button.w + PART_GAP : 0;
    need = a.side
      ? { w: answer.w + PART_GAP + least.w, h: Math.max(answer.h, least.h) }
      : { w: Math.max(answer.w, least.w + top), h: answer.h + PART_GAP + least.h };
  }
  const over = overflow(need, room);
  const nat = input.picture;
  const score =
    box && nat ? Math.min(1, Math.max(0, box.w) / nat.w, Math.max(0, box.h) / nat.h) : 1;
  const classic =
    !a.side &&
    a.cols === input.classic.cols &&
    a.check === input.classic.check &&
    gap === CARD_GAPS[0];
  return {
    plan: { ...a, gap, cards, picture: box, fits: over === 0 },
    over,
    score: classic ? Math.min(1, score * CLASSIC_BONUS) + 1e-3 : score,
  };
}

/**
 * The arrangement that fits the room and draws the picture largest (the designed one where it is
 * close); cards 12 px apart only when nothing fits at 24. When nothing fits at all, the one that
 * overflows least.
 */
export function planPick(input: PickInput): PickPlan {
  let least: Scored | null = null;
  for (const gap of CARD_GAPS) {
    let best: Scored | null = null;
    for (const side of [false, true]) {
      for (let cols = input.n + 1; cols >= 1; cols -= 1) {
        for (const check of CHECKS) {
          const c = candidate(input, { side, cols, check }, gap);
          if (!c) continue;
          if (c.over > 0) {
            if (!least || c.over < least.over) least = c;
          } else if (!best || c.score > best.score + 1e-6) {
            best = c;
          }
        }
      }
    }
    if (best) return best.plan;
  }
  if (!least) throw new Error('numeral-pick: no layout candidates');
  return least.plan;
}
