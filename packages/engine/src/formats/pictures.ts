// One scale within a screen (05 §11): pictures that a child compares by eye must be drawn to one
// scale, or the bigger picture is a false cue. compare and order apply this to their pictures.
// Each picture's own supported ranges (parts, categories, values, axis steps) are in the contract
// (`stimulusSpecSchema`, `chartSpecSchema`).

import { type ChartSpec, chartAxisTop, type StimulusSpec } from '@number-island/shared';
import type { z } from 'zod';

/** A line plot's own scale (its positions), as one comparable value; '' for the other kinds. */
const lineScaleKey = (c: ChartSpec): string =>
  c.lineScale ? `${c.lineScale.min}:${c.lineScale.max}:${c.lineScale.step}` : '';

/**
 * Pictures shown together agree on what one unit is:
 * - `fraction` pictures are wholes of one shape, so the wholes are one size and only their parts
 *   differ (a circle and a strip have no common whole to compare parts of);
 * - `chart` pictures are one kind and orientation with one scale, one axis top and as many
 *   categories as each other (and one position scale, on line plots), so they are laid out
 *   alike and a taller bar is always a bigger number.
 * `paths[i]` is where `specs[i]` sits in the config.
 */
export function sharedScaleIssues(
  specs: readonly (StimulusSpec | undefined)[],
  ctx: z.RefinementCtx,
  paths: readonly (string | number)[][],
): void {
  let whole: Extract<StimulusSpec, { kind: 'fraction' }> | null = null;
  let chart: Extract<StimulusSpec, { kind: 'chart' }>['chart'] | null = null;
  specs.forEach((s, i) => {
    const path = paths[i] ?? [];
    if (s?.kind === 'fraction') {
      if (whole === null) whole = s;
      else if (s.shape !== whole.shape) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'shape'],
          message: 'fraction pictures shown together are wholes of one shape',
        });
      }
    } else if (s?.kind === 'chart') {
      const c = s.chart;
      if (chart === null) chart = c;
      else if (
        c.kind !== chart.kind ||
        c.orientation !== chart.orientation ||
        c.scale !== chart.scale ||
        chartAxisTop(c) !== chartAxisTop(chart) ||
        c.categories.length !== chart.categories.length ||
        lineScaleKey(c) !== lineScaleKey(chart)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'chart'],
          message:
            'charts shown together share their kind, orientation, scale, axis top and number of categories',
        });
      }
    }
  });
}
