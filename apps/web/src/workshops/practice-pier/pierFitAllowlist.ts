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
  'base-ten-trade': [
    {
      reason:
        'Adding with a trade, then the answer on the pad: at 18 px blocks the three-column mat is 645 × 256 px and the tray under it 100 px, beside the equation, an 11-key pad and Check (it fits at 1280 × 800). The widget keeps its blocks countable and its design height, so the area scrolls with Check reachable; fix: a design for short areas (the answer as a second step, the tray beside the mat).',
      at: SMALL,
      templates: ['MDA.08.t1'],
    },
  ],
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

const BOND_NEW_WAY =
  'number-bond, concrete new-way, whole 6 to 10 (the first seed draws a smaller whole and fits): every pool holds the whole, so each is two rows of five 64 px counters and the bond alone is 364 px tall in the 358 px area at 960 × 600, before the found ways (186 px) and Check: 58–298 px too tall, Check up to 292 px below (it fits at 1280 × 800). Each counter is its own drag target, so drawing counters smaller saves no room; the area scrolls with Check reachable. Fix: a short-area design (the found ways as a step of their own, or the pool as the drag handle), which changes how the item is played.';

/**
 * Templates that fit on the first seed but not on some others: other seeds draw other numbers and
 * layouts. CI plays every template on seeds 1 to 9 (`VITE_FIT_SEEDS`, ci.yml `stories`); a seed
 * listed here is not a failure there, and every job plays each listed seed and fails when it fits,
 * so these stay known instead of silently green (#12, #35).
 */
export const FIT_SEED_EXCEPTIONS: readonly FitSeedException[] = [2, 3, 4, 5, 6, 7, 8, 9].map(
  (seed) => ({ template: 'CPS.06.t1', seed, at: SMALL, reason: BOND_NEW_WAY }),
);

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
export const LESSON_FIT_EXCEPTIONS: readonly LessonFitException[] = [
  {
    example: 'CPS.06:faded:0',
    at: SMALL,
    reason:
      'number-bond, new-way with three ways already found (whole 8): the bond with its counters is 364 px tall and the row of found ways 186 px, stacked to 574 px in a 358 px area at 960 × 600, so the area scrolls with Check below (it fits at 1280 × 800); fix: the found ways beside the bond in short areas.',
  },
  {
    example: 'CPS.06:faded:1',
    at: SMALL,
    reason: 'As CPS.06:faded:0 (number-bond new-way, the found ways stacked under the bond).',
  },
];
