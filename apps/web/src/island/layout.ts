// How the island screen is laid out (06 §1: 960 × 600 to 1280 × 800 and portrait; #22 part 4).
//
// The controls stand around the map: a top row (Home, who is playing, the guide's line), a column
// on each side, and the request row at the bottom. The land is drawn in the room they leave: its
// box (the open plots, with head room for what stands on the back row) is scaled to fit that room
// whole and is centred in it, while the sea still fills the screen behind every control. So no
// request and no line of the guide lies over a building, a badge, a road stone or a plot.
//
// - `landBox`, `roomCrop`: the arithmetic, framework-free.
// - `useIslandRoom`: the room as it is on screen, measured from the elements that carry
//   `data-room` ("top", "left", "right", "bottom"); null before layout (and in jsdom).

import type { IslandDef } from '@number-island/shared';
import { ISLAND_LAYOUT, landPlots, plotBox } from '@number-island/ui';
import { type RefObject, useCallback, useLayoutEffect, useState } from 'react';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A rectangle in CSS px inside the screen. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Scene units kept clear above the back row: the tallest building rises this far over its plot. */
export const HEAD_ROOM = 2.1 * ISLAND_LAYOUT.cellH;
/** Scene units kept clear beside and below the land (a badge at a building's foot, the lip). */
export const SIDE_ROOM = 0.25 * ISLAND_LAYOUT.cellW;
export const FOOT_ROOM = ISLAND_LAYOUT.lip + 0.25 * ISLAND_LAYOUT.cellH;

/** The open land with what can stand on it, in scene units. */
export function landBox(island: Pick<IslandDef, 'rings'>, ringsUnlocked: number): Box {
  const boxes = landPlots(island, Math.max(1, ringsUnlocked)).map((p) => plotBox(p));
  const left = Math.min(...boxes.map((b) => b.x)) - SIDE_ROOM;
  const right = Math.max(...boxes.map((b) => b.x + b.w)) + SIDE_ROOM;
  const top = Math.min(...boxes.map((b) => b.y)) - HEAD_ROOM;
  const bottom = Math.max(...boxes.map((b) => b.y + b.h)) + FOOT_ROOM;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * The part of the scene to show in a `size` screen so that `land` lies whole inside `room`,
 * centred, as large as it fits but never showing less than `minViewW` scene units across.
 */
export function roomCrop(
  land: Box,
  room: Rect,
  size: { w: number; h: number },
  minViewW: number,
): Box {
  const scale = Math.min(
    (room.right - room.left) / land.w,
    (room.bottom - room.top) / land.h,
    size.w / minViewW,
  );
  const w = size.w / scale;
  const h = size.h / scale;
  return {
    x: land.x + land.w / 2 - (room.left + room.right) / 2 / scale,
    y: land.y + land.h / 2 - (room.top + room.bottom) / 2 / scale,
    w,
    h,
  };
}

export interface IslandRoom {
  size: { w: number; h: number };
  room: Rect;
  /**
   * Whether the request row fits at the very bottom, between the family's avatars and the parent
   * gate. Where it does not (portrait, a large family), it stands above them.
   */
  rowFits: boolean;
  /** The corners' widths (px from each edge): the low row is centred between them. */
  rowInset: { left: number; right: number };
}

/** Px kept between the land's box and the controls around it. */
const MARGIN = 8;
/** Px kept between the request row and the corners beside it. */
const ROW_GAP = 12;

const sameRoom = (a: IslandRoom | null, b: IslandRoom) =>
  a !== null &&
  a.rowFits === b.rowFits &&
  a.rowInset.left === b.rowInset.left &&
  a.rowInset.right === b.rowInset.right &&
  a.size.w === b.size.w &&
  a.size.h === b.size.h &&
  a.room.left === b.room.left &&
  a.room.top === b.room.top &&
  a.room.right === b.room.right &&
  a.room.bottom === b.room.bottom;

/**
 * The room the controls leave for the land, measured inside `home` now and again whenever the
 * screen or one of the controls changes size, or `key` changes.
 */
export function useIslandRoom(
  home: RefObject<HTMLElement | null>,
  key: unknown,
): IslandRoom | null {
  const [measured, setMeasured] = useState<IslandRoom | null>(null);
  const measure = useCallback(() => {
    const el = home.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const rects = (side: string) =>
      Array.from(el.querySelectorAll(`[data-room="${side}"]`))
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
    const room: Rect = {
      left: Math.max(0, ...rects('left').map((r) => r.right - box.left)) + MARGIN,
      top: Math.max(0, ...rects('top').map((r) => r.bottom - box.top)) + MARGIN,
      right: Math.min(box.width, ...rects('right').map((r) => r.left - box.left)) - MARGIN,
      bottom: Math.min(box.height, ...rects('bottom').map((r) => r.top - box.top)) - MARGIN,
    };
    // The row's width does not depend on where it stands, so this settles in one more pass.
    const cards = Array.from(el.querySelectorAll('[data-testid="requests"] > li')).map((n) =>
      n.getBoundingClientRect(),
    );
    const corners = rects('corner');
    const width =
      cards.length === 0
        ? 0
        : Math.max(...cards.map((r) => r.right)) - Math.min(...cards.map((r) => r.left));
    const isLeft = (r: DOMRect) => r.left - box.left < box.width / 2;
    const rowInset = {
      left: Math.max(0, ...corners.filter(isLeft).map((r) => r.right - box.left)) + ROW_GAP,
      right:
        Math.max(0, ...corners.filter((r) => !isLeft(r)).map((r) => box.right - r.left)) + ROW_GAP,
    };
    const next: IslandRoom = {
      size: { w: box.width, h: box.height },
      room,
      rowFits: width + rowInset.left + rowInset.right <= box.width,
      rowInset,
    };
    setMeasured((prev) => (sameRoom(prev, next) ? prev : next));
  }, [home]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is what else moves the controls
  useLayoutEffect(() => {
    measure();
    const el = home.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const n of el.querySelectorAll('[data-room], [data-testid="requests"]'))
      observer.observe(n);
    return () => observer.disconnect();
  }, [measure, key]);
  return measured;
}
