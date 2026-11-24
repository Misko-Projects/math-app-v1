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
// Everything is in CSS px. Sprites are one size everywhere, from MIN_ITEM_PX up.

import { STORY_COUNTERS_MAX } from '@number-island/engine';
import { type AgeMode, MIN_TARGET_PX, TARGET_GAP_PX, TARGET_PX } from '../../tokens/tokens';
import type { Size } from '../kit/arrange';
import { fivesGrid, MIN_ITEM_PX } from '../kit/fives';
import { type AskPlan, buildRoom, planAsk, STEP_GAP } from '../kit/twoStep';

export { fivesCell, MIN_ITEM_PX } from '../kit/fives';

/** Sprites in a row (two fives). */
export const ROW = 10;
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
    for (let s = ITEM_MAX; s >= MIN_ITEM_PX; s -= 2) {
      const l = buildAt(input, s);
      if (l.fits && l.card >= inner.w * share) return l;
    }
  }
  return buildAt(input, MIN_ITEM_PX);
}

/** An answer box's width (kit box-entry.css: 40 px numerals, padding and border). */
export const boxWidth = (ageMode: AgeMode, maxDigits: number) =>
  Math.max(Math.ceil(MIN_TARGET_PX[ageMode] * 1.3), 46 + 24 * maxDigits);

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
  return { w: boxWidth(ageMode, maxDigits) + 16 + pad.w, h: Math.max(pad.h, column) };
}

/** The question line's box at width `w`: its text on 32 px lines, at least a full target tall. */
export function questionSize(chars: number, w: number, ageMode: AgeMode): Size {
  const inner = Math.max(1, w - 2 * 16);
  const rows = Math.max(1, Math.ceil((chars * CHAR_W) / inner));
  return { w, h: Math.max(MIN_TARGET_PX[ageMode], rows * TEXT_LINE + 2 * 12) };
}

/** The narrowest the answer step's picture is drawn. */
export const PICTURE_MIN_W = 240;

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

export interface StoryAskPlan {
  ask: AskPlan;
  shape: EntryShape;
  /** The counters' sprite size beside the answer (0: they are not shown). */
  s: number;
  fits: boolean;
}

/**
 * The answer step: the boxes and the pad at full size, the question in what is left, and the
 * counters under the question where they fit too. The 3 × 4 pad comes first; the 6 × 2 pad is
 * for a room too short for it.
 */
export function planStoryAsk(input: AskInput): StoryAskPlan {
  const { room, button, ageMode } = input;
  const withCounters = (box: Size) => {
    const q = questionSize(input.questionChars, box.w, ageMode);
    const c = countersSize(MIN_ITEM_PX);
    return box.w >= c.w && box.h >= q.h + SIDE_GAP + c.h;
  };
  const score = (box: Size | null) => {
    if (!box || box.w < PICTURE_MIN_W) return 0;
    if (questionSize(input.questionChars, box.w, ageMode).h > box.h) return 0;
    return input.counters && withCounters(box) ? 2 : 1;
  };
  let best: { ask: AskPlan; shape: EntryShape; score: number } | null = null;
  for (const shape of ['tall', 'wide'] as const) {
    const ask = planAsk({
      ageMode,
      max: 0,
      control: entrySize(shape, ageMode, input.boxes, input.maxDigits),
      button,
      actions: 2,
      room,
      pictureScore: score,
    });
    const sc = ask.fits ? score(ask.picture) : 0;
    if (!best || sc > best.score) best = { ask, shape, score: sc };
  }
  const chosen = best as { ask: AskPlan; shape: EntryShape; score: number };
  return {
    ask: chosen.ask,
    shape: chosen.shape,
    s: chosen.score === 2 ? MIN_ITEM_PX : 0,
    fits: chosen.score > 0,
  };
}
