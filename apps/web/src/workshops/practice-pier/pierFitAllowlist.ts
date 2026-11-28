// The templates the pier fit check (`pierFit.browser.test.tsx`) lets through although they do not
// fit the workshop area yet, each with the reason. Framework-free.
//
// The check fails when a listed template fits, so an entry goes in the same change that fixes its
// widget.

import type { ItemFormat, ItemTemplate, TemplateId } from '@number-island/shared';
import { registeredFormats } from '@number-island/ui';

/** The supported landscape viewports the check renders at (06 §1). */
export const FIT_VIEWPORTS = ['960x600', '1280x800'] as const;
export type FitViewport = (typeof FIT_VIEWPORTS)[number];

export interface FitException {
  /** Why it does not fit and what would fix it. */
  reason: string;
  /** The viewports it does not fit at. */
  at: readonly FitViewport[];
  templates: readonly TemplateId[];
}

const SMALL = ['960x600'] as const;

/** Templates whose widget is taller or wider than the area, by widget. */
export const FIT_EXCEPTIONS: Readonly<Partial<Record<ItemFormat, readonly FitException[]>>> = {
  'make-set': [
    {
      reason:
        'A container of 30 or 40: three or four ten-frames of 64 px targets are 939 px wide two by two, more than the 858 px area at 960 × 600 (they fit at 1280 × 800); fix: show the tens a page at a time, which changes how the item is shown.',
      at: SMALL,
      templates: ['CNT.19.t1', 'PV.09.t1'],
    },
  ],
  'tap-count': [
    {
      reason:
        'Equal groups of ten to count by tapping: three plates of ten 64 px targets are wider than the 858 px area at 960 × 600 and taller than it in two rows (the first seed, two plates of ten and four, fits at 1280 × 800; a third plate of five or more does not); fix: a group layout that pages or reshapes the plates, which changes how the item is shown.',
      at: SMALL,
      templates: ['CNT.19.t2'],
    },
  ],
};

export interface FitSeedException {
  template: TemplateId;
  /** A seed (played without a difficulty target, as the check plays) that does not fit. */
  seed: number;
  at: readonly FitViewport[];
  reason: string;
}

/**
 * Templates that fit on the first seed but not on some others: other seeds draw other numbers and
 * layouts. CI plays every template on seeds 1 to 9 (`VITE_FIT_SEEDS`, ci.yml `stories`); a seed
 * listed here is not a failure there, and every job plays each listed seed and fails when it fits,
 * so these stay known instead of silently green (#12, #35).
 */
export const FIT_SEED_EXCEPTIONS: readonly FitSeedException[] = [];

/**
 * The legibility bars (05 §11, 06 §4), checked on every screen the fit check draws:
 * - `numeral`: a numeral in the sentence a child completes (number-pad's text) or on an answer
 *   control that carries a number (number-pad's boxes and keys, order cards), ≥ 32 px as drawn;
 * - `box`: number-pad's answer box, ≥ 64 px each way;
 * - `target`: any control in the widget, ≥ 64 px each way;
 * - `counted`: a sprite or a fraction part, ≥ 22 px each way. On an order card, a counter in a
 *   ten-frame cell holds 20 px (a frame is read by its rows of five) and a set whose sizes vary on
 *   purpose (compare.sets conflict) 16 px. Not counted: an estimation picture, and an array
 *   beside a sentence that writes both its factors (the count is in the sentence).
 * - `rod`, `rodGap`: a base-ten rod the child counts as a piece (a number-pad sentence or an
 *   order card with no numeral), ≥ 9 px wide with ≥ 6 px between rods in a row: a rod is counted
 *   by the gaps between pieces, not by its unit squares, and a 15 px pitch is a ten-frame cell's.
 */
export type LegibilityBar = 'numeral' | 'box' | 'target' | 'counted' | 'rod' | 'rodGap';

export const LEGIBILITY_BARS: Readonly<Record<LegibilityBar, number>> = {
  numeral: 32,
  box: 64,
  target: 64,
  counted: 22,
  rod: 9,
  rodGap: 6,
};

export interface LegibilityException {
  template: TemplateId;
  bar: LegibilityBar;
  at: FitViewport;
  /** The seeds that draw under the bar; every job plays them, and fails when one holds it. */
  seeds: readonly number[];
  /** The least it was measured at: drawing it smaller fails too (the list only shrinks). */
  floorPx: number;
  reason: string;
}

const PAD_PIECES =
  'Seven or eight flats and ten rods at 960 × 600: the pad picks the layout that draws the rods widest (one row under the question, or flats in rows of four with the rods under them, beside the answer box), and the question is 266 px tall, so rods stay under 9 px; follow-up: a taller picture step for counted pieces.';
const ORDER_PIECES =
  'Tens rods on three order cards with no numeral: a card is about 100 px tall at 960 × 600; follow-up: base-ten order cards drawn to the rod bar.';

/**
 * The screens that keep under a bar, each bounded. A miss not listed fails, a listed miss drawn
 * under its floor fails, and a listed seed that holds its bar fails (remove it).
 */
export const LEGIBILITY_EXCEPTIONS: readonly LegibilityException[] = [
  {
    template: 'PV.04.t5',
    bar: 'rod',
    at: '960x600',
    seeds: [6, 7],
    floorPx: 7.7,
    reason: PAD_PIECES,
  },
  {
    template: 'PV.04.t5',
    bar: 'rodGap',
    at: '960x600',
    seeds: [7],
    floorPx: 5.5,
    reason: PAD_PIECES,
  },
  {
    template: 'PV.02.t2',
    bar: 'rod',
    at: '960x600',
    seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    floorPx: 6.8,
    reason: ORDER_PIECES,
  },
  {
    template: 'PV.02.t2',
    bar: 'rodGap',
    at: '960x600',
    seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    floorPx: 4.9,
    reason: ORDER_PIECES,
  },
  {
    template: 'CPS.06.t2',
    bar: 'counted',
    at: '960x600',
    seeds: [4],
    floorPx: 18,
    reason:
      'Six cards of two plates (ways to make 7) in one row: a card is about 123 px wide, so 4 counter columns draw at 18 px; follow-up: bound the ways shown at once.',
  },
  {
    template: 'CMP.07.t3',
    bar: 'counted',
    at: '960x600',
    seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    floorPx: 18,
    reason:
      'Double ten-frames (bar 20) on cards at most 122 px tall: the board and the tray each hold a card row in 366 px; follow-up: an order layout for frames at 960 × 600.',
  },
  {
    template: 'FRA.07.t2',
    bar: 'target',
    at: '960x600',
    seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    floorPx: 45,
    reason: 'A share piece to drag (equal-share) of 46 px; fix: pieces of 64 px.',
  },
];

const registered = new Set<ItemFormat>(registeredFormats());

export type FitAllowance = { kind: 'no-widget' } | { kind: 'misfit'; reason: string };

/** Why the check lets a template through at a viewport, or null when it must fit. */
export function fitAllowance(
  template: Pick<ItemTemplate, 'id' | 'format'>,
  viewport: FitViewport,
): FitAllowance | null {
  // No widget yet: the pier leaves these out of requests (`pierMisfit`), so there is nothing to fit.
  if (!registered.has(template.format)) return { kind: 'no-widget' };
  const entry = FIT_EXCEPTIONS[template.format]?.find(
    (e) => e.at.includes(viewport) && e.templates.includes(template.id),
  );
  return entry ? { kind: 'misfit', reason: entry.reason } : null;
}

/**
 * Lesson steps whose action the example's widget does not animate in demo mode (03 §6.3), as
 * `<skill> <phase> <example> step <n>: <op> (<format>)`. The lesson player speaks and shows the
 * step's line, skips the action and notes it in the diagnostics (#20 part 3); the fix belongs to
 * the widget or to the lesson. The fit check holds this list to what the shipped lessons do.
 */
export const LESSON_OPS_NOT_SHOWN: readonly string[] = [];

export interface LessonFitException {
  /** `<skill>:<phase>:<example>` (0-based), as the lesson's `lesson.step` events name it. */
  example: string;
  at: readonly FitViewport[];
  reason: string;
}

/**
 * Lesson examples that do not fit the area though their template's first seed does: a lesson
 * fixes its own numbers (03 §6.1). The check fails when a listed example fits again, or when
 * another one stops fitting. The fix belongs to the widget (#20 part 3 does not change widgets).
 *
 * The examples are the ones every build shows: seeded examples aim at the template stats that
 * `pnpm content:build` writes (03 §6.1).
 */
export const LESSON_FIT_EXCEPTIONS: readonly LessonFitException[] = [];
