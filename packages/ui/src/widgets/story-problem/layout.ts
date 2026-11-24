// The story problem's two steps, as pure arithmetic (06 §1: the widget plans from its measured
// room).
//
// - **story**: the story card (the lines, as wide as it can be), beside it a column with the
//   scene (the told things, a group to a row, in fives) over the counters board (room for twenty
//   counters in two rows of ten, with take-one and add-one under it), and Next.
// - **answer**: the question line and the counters as built, the answer boxes with the number
//   pad (kit `BoxEntry`: beside a 3 × 4 pad, or a 6 × 2 pad where the room is short), Back and
//   Check.
//
// Everything is in CSS px. Sprites are one size everywhere, from STORY_MIN_ITEM up.

import { STORY_COUNTERS_MAX } from '@number-island/engine';
import { type AgeMode, MIN_TARGET_PX, TARGET_GAP_PX, TARGET_PX } from '../../tokens/tokens';
import type { Size } from '../kit/arrange';
import { fivesGrid, MIN_ITEM_PX } from '../kit/fives';
import { actionsSize, buildRoom, STEP_GAP } from '../kit/twoStep';

export { fivesCell, MIN_ITEM_PX } from '../kit/fives';

/** Sprites in a row (two fives). */
export const ROW = 10;
/**
 * The smallest sprite cell here: the scene's things include tall, narrow drawings (a lantern
 * takes about 62 % of its box), which are 22 px wide from this cell up.
 */
export const STORY_MIN_ITEM = Math.max(MIN_ITEM_PX, 28);
/** The largest sprite cell. */
export const ITEM_MAX = 44;
/** Between the groups of the scene, and between the scene and the board. */
export const GROUP_GAP = 8;
export const SIDE_GAP = 16;
/** Round the scene and round the board's counters (their cards' padding and border). */
export const PANEL_PAD = 10;
/** Between the board's counters and its two buttons; under a button, its ledge. */
export const BOARD_GAP = 8;
const BUTTON_LEDGE = 6;
/** The story card is never narrower than this (24 px text needs a line of some length), */
export const CARD_MIN_W = 340;
/** and takes at least this share of the story step's width where the sprites allow it. */
export const CARD_SHARE = 0.52;
/** Story text: 24 px on a 32 px line; a character is about this wide (Andika, a safe mean). */
export const TEXT_PX = 24;
export const TEXT_LINE = 32;
export const CHAR_W = 13;

/** The scene: each group of told things on its own rows of ten. */
export function sceneSize(groups: readonly number[], s: number): Size {
  const grids = groups.filter((n) => n > 0).map((n) => fivesGrid(n, ROW, s));
  if (grids.length === 0) return { w: 0, h: 0 };
  return {
    w: Math.max(...grids.map((g) => g.w)) + 2 * PANEL_PAD,
    h: grids.reduce((a, g) => a + g.h, (grids.length - 1) * GROUP_GAP) + 2 * PANEL_PAD,
  };
}

/** The counters' own box: room for every counter the board holds. */
export const countersSize = (s: number): Size => {
  const g = fivesGrid(STORY_COUNTERS_MAX, ROW, s);
  return { w: g.w + 2 * PANEL_PAD, h: g.h + 2 * PANEL_PAD };
};

/** The board: the counters over its two buttons. */
export function boardSize(s: number, ageMode: AgeMode): Size {
  const c = countersSize(s);
  const icon = TARGET_PX[ageMode].icon;
  return {
    w: Math.max(c.w, 2 * icon + TARGET_GAP_PX),
    h: c.h + BOARD_GAP + icon + BUTTON_LEDGE,
  };
}

export interface BuildInput {
  room: Size;
  /** One action button, as measured (kit `useActionSize`). */
  button: Size;
  ageMode: AgeMode;
  /** The scene's groups (empty: no scene). */
  scene: readonly number[];
  /** Whether the item has a counters board. */
  board: boolean;
}

export interface BuildLayout {
  fits: boolean;
  s: number;
  /** The story card's width. */
  card: number;
  /** The column beside the card (null: the story alone). */
  side: Size | null;
}

function buildAt(input: BuildInput, s: number): BuildLayout {
  const inner = buildRoom(input.room, input.button);
  const scene = sceneSize(input.scene, s);
  const board = input.board ? boardSize(s, input.ageMode) : { w: 0, h: 0 };
  const parts = [scene, board].filter((p) => p.h > 0);
  if (parts.length === 0) {
    return { fits: inner.w >= CARD_MIN_W, s, card: inner.w, side: null };
  }
  const side: Size = {
    w: Math.max(...parts.map((p) => p.w)),
    h: parts.reduce((a, p) => a + p.h, (parts.length - 1) * SIDE_GAP),
  };
  const card = inner.w - STEP_GAP - side.w;
  return { fits: card >= CARD_MIN_W && side.h <= inner.h, s, card, side };
}

/**
 * The story step: the largest sprites that leave the story the wider half of the room (the
 * words are the task), or failing that its least width, and fit the height.
 */
export function planBuild(input: BuildInput): BuildLayout {
  const inner = buildRoom(input.room, input.button);
  for (const share of [CARD_SHARE, 0]) {
    for (let s = ITEM_MAX; s >= STORY_MIN_ITEM; s -= 2) {
      const l = buildAt(input, s);
      if (l.fits && l.card >= inner.w * share) return l;
    }
  }
  return buildAt(input, STORY_MIN_ITEM);
}

/**
 * An answer box's width (kit box-entry.css: 40 px numerals, padding and border), with room for
 * the picture that says which part it is when the story asks for two (`marked`).
 */
export const boxWidth = (ageMode: AgeMode, maxDigits: number, marked = false) =>
  Math.max(Math.ceil(MIN_TARGET_PX[ageMode] * 1.3), 46 + 24 * maxDigits) + (marked ? 46 : 0);

export type EntryShape = 'tall' | 'wide';

/** The kit `BoxEntry` (compact): `boxes` answer boxes beside a 3 × 4 or a 6 × 2 pad. */
export function entrySize(
  shape: EntryShape,
  ageMode: AgeMode,
  boxes: number,
  maxDigits: number,
): Size {
  const t = MIN_TARGET_PX[ageMode];
  const cols = shape === 'tall' ? 3 : 6;
  const rows = shape === 'tall' ? 4 : 2;
  const pad: Size = {
    w: cols * t + (cols - 1) * TARGET_GAP_PX,
    h: rows * t + (rows - 1) * TARGET_GAP_PX,
  };
  const column = boxes * t + (boxes - 1) * TARGET_GAP_PX;
  return { w: boxWidth(ageMode, maxDigits, boxes > 1) + 16 + pad.w, h: Math.max(pad.h, column) };
}

/** The question line's box at width `w`: its text on 32 px lines, at least a full target tall. */
export function questionSize(chars: number, w: number, ageMode: AgeMode): Size {
  const inner = Math.max(1, w - 2 * 16);
  const rows = Math.max(1, Math.ceil((chars * CHAR_W) / inner));
  return { w, h: Math.max(MIN_TARGET_PX[ageMode], rows * TEXT_LINE + 2 * 12) };
}

/** The narrowest and the widest the question line is drawn. */
export const PICTURE_MIN_W = 240;
export const QUESTION_MAX_W = 560;

export interface AskInput {
  room: Size;
  button: Size;
  ageMode: AgeMode;
  boxes: number;
  maxDigits: number;
  /** The question line's length, in characters. */
  questionChars: number;
  /** Whether counters were put on the board (they are shown again beside the answer). */
  counters: boolean;
}

/**
 * How the answer step is arranged:
 * - `beside`: the question (and the counters) left of the boxes with a 3 × 4 pad, Back and Check
 *   in a column at the right;
 * - `under`: the question (and the counters) over the boxes with a 6 × 2 pad, Back and Check in
 *   a column beside the pad;
 * - `bar`: the question with Back and Check in one row, over the boxes with a 6 × 2 pad (the
 *   shortest: kindergarten sizes in the smallest area).
 */
export type AskArrangement = 'beside' | 'under' | 'bar';

export interface StoryAskPlan {
  arrangement: AskArrangement;
  shape: EntryShape;
  /** The question's box. */
  question: Size;
  /** The counters' sprite size beside the answer (0: they are not shown). */
  s: number;
  fits: boolean;
}

/**
 * The answer step: the boxes, the pad and the two actions at full size, the question in what is
 * left, and the counters under the question where they fit too. The first arrangement that
 * shows the counters wins, else the first that fits (`beside`, `under`, `bar`).
 */
export function planStoryAsk(input: AskInput): StoryAskPlan {
  const { room, button, ageMode } = input;
  const column = actionsSize(button, 2, 'column');
  const row = actionsSize(button, 2, 'row');
  const tall = entrySize('tall', ageMode, input.boxes, input.maxDigits);
  const wide = entrySize('wide', ageMode, input.boxes, input.maxDigits);
  const counters = countersSize(STORY_MIN_ITEM);
  const question = (w: number) => questionSize(input.questionChars, w, ageMode);
  /** A question of width `w` in `h` px of height: 0 no fit, 1 it fits, 2 with the counters. */
  const picture = (w: number, h: number): 0 | 1 | 2 => {
    if (w < PICTURE_MIN_W || question(w).h > h) return 0;
    const both = input.counters && w >= counters.w && question(w).h + SIDE_GAP + counters.h <= h;
    return both ? 2 : 1;
  };
  const besideW = room.w - tall.w - column.w - 2 * STEP_GAP;
  const underW = Math.min(room.w, wide.w + STEP_GAP + column.w);
  const barW = wide.w - STEP_GAP - row.w;
  const candidates: { arrangement: AskArrangement; shape: EntryShape; w: number; score: number }[] =
    [
      {
        arrangement: 'beside',
        shape: 'tall',
        w: Math.min(besideW, QUESTION_MAX_W),
        score: Math.max(tall.h, column.h) <= room.h ? picture(besideW, room.h) : 0,
      },
      {
        arrangement: 'under',
        shape: 'wide',
        w: underW,
        score:
          wide.w + STEP_GAP + column.w <= room.w
            ? picture(underW, room.h - Math.max(wide.h, column.h) - STEP_GAP)
            : 0,
      },
      {
        arrangement: 'bar',
        shape: 'wide',
        w: barW,
        score:
          wide.w <= room.w &&
          barW >= PICTURE_MIN_W &&
          Math.max(question(barW).h, row.h) + STEP_GAP + wide.h <= room.h
            ? 1
            : 0,
      },
    ];
  const best =
    candidates.find((c) => c.score === 2) ??
    candidates.find((c) => c.score === 1) ??
    (candidates[2] as (typeof candidates)[number]);
  return {
    arrangement: best.arrangement,
    shape: best.shape,
    question: question(Math.max(PICTURE_MIN_W, best.w)),
    s: best.score === 2 ? STORY_MIN_ITEM : 0,
    fits: best.score > 0,
  };
}
