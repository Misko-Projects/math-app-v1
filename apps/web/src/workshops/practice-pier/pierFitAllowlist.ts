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

const BOTH = FIT_VIEWPORTS;
const SMALL = ['960x600'] as const;

/** Templates whose widget is taller or wider than the area, by widget. */
export const FIT_EXCEPTIONS: Readonly<Partial<Record<ItemFormat, readonly FitException[]>>> = {
  'base-ten-build': [
    {
      reason:
        'The mat and the block trays are drawn at a fixed height (84 px over the area at 1280 × 800, 284 px at 960 × 600); fix: plan the mat in the measured room.',
      at: BOTH,
      templates: [
        'CNT.19.t3',
        'CPS.04.t3',
        'CPS.09.t1',
        'MDA.01.t1',
        'MDA.02.t1',
        'MDA.09.t1',
        'PV.01.t1',
        'PV.01.t2',
        'PV.03.t1',
        'PV.09.t2',
        'PV.10.t1',
        'PV.11.t1',
        'PV.11.t2',
      ],
    },
  ],
  'base-ten-trade': [
    {
      reason:
        'The trade controls and Check are under a fixed-height mat (78 px over the area at 1280 × 800, 278 px at 960 × 600); fix: plan in the measured room.',
      at: BOTH,
      templates: ['MDA.08.t1', 'PV.01.t4', 'PV.09.t3'],
    },
  ],
  'expanded-form': [
    {
      reason:
        'The picture, the parts and Check are stacked at fixed sizes (57 to 120 px over the area at 960 × 600); fix: plan in the measured room.',
      at: SMALL,
      templates: ['CPS.07.t3', 'MDA.09.t2', 'PV.01.t5', 'PV.13.t1', 'PV.13.t2', 'PV.13.t3'],
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
