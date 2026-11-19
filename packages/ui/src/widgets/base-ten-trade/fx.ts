// Pure keyframes for the base-ten-trade animations (03 §5.5): a piece breaking into ten that slide
// into the next column, ten pieces sliding together into one that moves into the larger column,
// and pieces moving between the tray, the mat and the nest. Transform and opacity only, so they
// stay smooth on a slow tablet. Each ghost is drawn at its own rect (relative to the widget) and
// animated from where it starts; the widget draws the ghosts and hides the real pieces meanwhile.
import type { Column } from '@number-island/engine';
import type { Box } from './layout';

export interface Ghost {
  kind: Column;
  /** Where the ghost is drawn (its final place), relative to the widget. */
  rect: Box;
  keyframes: Keyframe[];
  delay: number;
  duration: number;
}

/** A trade (break or bundle), ms. 03 §5.5 asks for about 600–900 ms. */
export const TRADE_MS = 840;
/** A move between tray, mat and nest, ms. */
export const MOVE_MS = 560;
export const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** The transform that draws a ghost placed at `at` over the box `from` (origin top left). */
export function transformFrom(from: Box, at: Box): string {
  const dx = Math.round((from.x - at.x) * 10) / 10;
  const dy = Math.round((from.y - at.y) * 10) / 10;
  const sx = at.w > 0 ? Math.round((from.w / at.w) * 1000) / 1000 : 1;
  const sy = at.h > 0 ? Math.round((from.h / at.h) * 1000) / 1000 : 1;
  return sx === 1 && sy === 1
    ? `translate(${dx}px, ${dy}px)`
    : `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
}

const IDENTITY = 'translate(0px, 0px)';

/**
 * A piece cut into ten equal parts along its length: a rod into ten units (top to bottom), a flat
 * into ten rods (left to right).
 */
export function slices(piece: Box): Box[] {
  const vertical = piece.h > piece.w * 1.5;
  return Array.from({ length: 10 }, (_, j) =>
    vertical
      ? { x: piece.x, y: piece.y + (piece.h / 10) * j, w: piece.w, h: piece.h / 10 }
      : { x: piece.x + (piece.w / 10) * j, y: piece.y, w: piece.w / 10, h: piece.h },
  );
}

/**
 * Breaking one piece of `from` into ten of `to`: the piece shows a crack into ten parts, they part
 * a little, then each slides to its place in the smaller column (`dests`, ten boxes).
 */
export function breakGhosts(
  from: Column,
  to: Column,
  source: Box,
  dests: readonly Box[],
  ms = TRADE_MS,
): Ghost[] {
  const parts = slices(source);
  const vertical = source.h > source.w * 1.5;
  const stagger = Math.round(ms * 0.025);
  const ghosts: Ghost[] = [
    {
      kind: from,
      rect: source,
      keyframes: [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.16 },
        { opacity: 0, offset: 0.3 },
        { opacity: 0, offset: 1 },
      ],
      delay: 0,
      duration: ms,
    },
  ];
  dests.slice(0, 10).forEach((dest, j) => {
    const part = parts[j] as Box;
    const spread = (j - 4.5) * 2.2;
    const parted: Box = vertical
      ? { ...part, x: part.x + 6, y: part.y + spread }
      : { ...part, x: part.x + spread, y: part.y - 6 };
    const duration = ms - stagger * 9;
    ghosts.push({
      kind: to,
      rect: dest,
      keyframes: [
        { transform: transformFrom(part, dest), opacity: 0, offset: 0 },
        { transform: transformFrom(part, dest), opacity: 1, offset: 0.14 },
        { transform: transformFrom(parted, dest), opacity: 1, offset: 0.32 },
        { transform: IDENTITY, opacity: 1, offset: 1 },
      ],
      delay: stagger * j,
      duration,
    });
  });
  return ghosts;
}

/** Where ten pieces gather before they become one: the new piece's shape, over their centre. */
export function gatherBox(sources: readonly Box[], kind: Column, bounds: Box): Box {
  const first = sources[0] ?? { x: 0, y: 0, w: 0, h: 0 };
  // Ten units make a rod (one unit wide); ten rods make a flat (ten rods wide).
  const size = kind === 'tens' ? { w: first.w, h: first.h * 10 } : { w: first.w * 10, h: first.h };
  let cx = 0;
  let cy = 0;
  for (const s of sources) {
    cx += s.x + s.w / 2;
    cy += s.y + s.h / 2;
  }
  const n = Math.max(1, sources.length);
  const x = Math.min(Math.max(bounds.x, cx / n - size.w / 2), bounds.x + bounds.w - size.w);
  const y = Math.min(Math.max(bounds.y, cy / n - size.h / 2), bounds.y + bounds.h - size.h);
  return { x, y, ...size };
}

/**
 * Bundling ten pieces of `from` into one of `to`: they slide together into the new piece's shape,
 * turn into that piece, and it moves to its place in the larger column (`dest`).
 */
export function bundleGhosts(
  from: Column,
  to: Column,
  sources: readonly Box[],
  dest: Box,
  bounds: Box,
  ms = TRADE_MS,
): Ghost[] {
  const gather = gatherBox(sources, to, bounds);
  const slots = slices(gather);
  const stagger = Math.round(ms * 0.02);
  const ghosts: Ghost[] = sources.slice(0, 10).map((src, j) => {
    const slot = slots[j] as Box;
    return {
      kind: from,
      rect: slot,
      keyframes: [
        { transform: transformFrom(src, slot), opacity: 1, offset: 0 },
        { transform: IDENTITY, opacity: 1, offset: 0.46 },
        { transform: IDENTITY, opacity: 0, offset: 0.56 },
        { transform: IDENTITY, opacity: 0, offset: 1 },
      ],
      // Each starts a touch later so they read as ten pieces, not one block.
      delay: stagger * (j % 5),
      duration: ms,
    };
  });
  ghosts.push({
    kind: to,
    rect: dest,
    keyframes: [
      { transform: transformFrom(gather, dest), opacity: 0, offset: 0 },
      { transform: transformFrom(gather, dest), opacity: 0, offset: 0.46 },
      { transform: transformFrom(gather, dest), opacity: 1, offset: 0.56 },
      { transform: IDENTITY, opacity: 1, offset: 1 },
    ],
    delay: 0,
    duration: ms + stagger * 4,
  });
  return ghosts;
}

/** Pieces sliding from `sources` to `dests` (tray → mat, mat → nest), one after another. */
export function moveGhosts(
  kind: Column,
  sources: readonly Box[],
  dests: readonly Box[],
  ms = MOVE_MS,
): Ghost[] {
  const n = Math.min(sources.length, dests.length);
  const stagger = n > 1 ? Math.min(40, Math.round((ms * 0.4) / (n - 1))) : 0;
  return Array.from({ length: n }, (_, i) => {
    const src = sources[i] as Box;
    const dest = dests[i] as Box;
    return {
      kind,
      rect: dest,
      keyframes: [
        { transform: transformFrom(src, dest), opacity: 1, offset: 0 },
        { transform: IDENTITY, opacity: 1, offset: 1 },
      ],
      delay: stagger * i,
      duration: ms,
    };
  });
}

/** The longest ghost's end, ms. */
export const ghostsEnd = (ghosts: readonly Ghost[]) =>
  ghosts.reduce((a, g) => Math.max(a, g.delay + g.duration), 0);
