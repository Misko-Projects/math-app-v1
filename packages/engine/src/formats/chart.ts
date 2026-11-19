// Chart maths shared by the bar-graph-read and bar-graph-build models and the widgets' ChartView
// (03 §5.1 `ChartSpec`, U05 #14). Everything here is pure, so the pictures and the models agree:
// a bar's top is `value` on the axis, a picture graph shows `value / scale` symbols (a part symbol
// for the remainder: a half for halves), and tally marks group in fives.
//
// Slots: the places a chart holds a count. For picture graphs, bar graphs, tally charts and tables
// they are the categories, in chart order. For a line plot they are the positions of `lineScale`
// (min, min + step, …, max); the chart's categories name the positions that have Xs (category id =
// the position as a string, value = how many Xs), so a line plot's counts read in position order.

import type { ChartSpec } from '@number-island/shared';
import type { z } from 'zod';

export interface ChartSlot {
  /** Category id, or the position as a string on a line plot ("1.5"). */
  id: string;
  /** The category's label narration key (line-plot positions have none: they show the numeral). */
  label?: string;
  /** Line-plot position. */
  at?: number;
}

/** Rounds away binary noise (0.1 + 0.2), so positions and part symbols compare exactly. */
export const tidy = (x: number): number => Math.round(x * 1e6) / 1e6;

/** The id of a line-plot position: the number as written ("2", "1.5", "0.25"). */
export const positionId = (at: number): string => String(tidy(at));

/** The positions of a line plot's scale, min to max by step. */
export function linePositions(scale: NonNullable<ChartSpec['lineScale']>): number[] {
  const { min, max, step } = scale;
  if (!(step > 0) || !(max >= min)) return [];
  const n = Math.round((max - min) / step);
  return Array.from({ length: n + 1 }, (_, k) => tidy(min + k * step));
}

/** The chart's slots in order (categories, or line-plot positions). */
export function chartSlots(chart: ChartSpec): ChartSlot[] {
  if (chart.kind === 'line-plot') {
    return chart.lineScale
      ? linePositions(chart.lineScale).map((at) => ({ id: positionId(at), at }))
      : [];
  }
  return chart.categories.map((c) => ({ id: c.id, label: c.label }));
}

/** The count in each slot, in slot order (line-plot positions without a category hold 0). */
export function slotValues(chart: ChartSpec): number[] {
  if (chart.kind !== 'line-plot') return chart.categories.map((c) => c.value);
  const byId = new Map(chart.categories.map((c) => [positionId(Number(c.id)), c.value]));
  return chartSlots(chart).map((s) => byId.get(s.id) ?? 0);
}

/** A picture graph's symbols for a value: whole symbols, then the part of one more (0 ≤ part < 1). */
export function symbolParts(value: number, scale: number): { whole: number; part: number } {
  const n = tidy(value / scale);
  const whole = Math.floor(n);
  return { whole, part: tidy(n - whole) };
}

/** Tally marks in groups of five (four strokes and a gate): 13 → [5, 5, 3]. */
export function tallyGroups(n: number): number[] {
  const count = Math.max(0, Math.floor(n));
  const groups = Array.from({ length: Math.floor(count / 5) }, () => 5);
  if (count % 5 > 0) groups.push(count % 5);
  return groups;
}

/** The axis runs from 0 to axisMax rounded up to the scale: its labelled values (0, s, 2s, …). */
export function axisTicks(chart: Pick<ChartSpec, 'axisMax' | 'scale'>): number[] {
  const top = axisTop(chart);
  return Array.from({ length: Math.round(top / chart.scale) + 1 }, (_, k) => k * chart.scale);
}

/** The top of the axis: axisMax rounded up to a multiple of the scale (at least one step). */
export function axisTop(chart: Pick<ChartSpec, 'axisMax' | 'scale'>): number {
  return Math.max(chart.scale, Math.ceil(tidy(chart.axisMax / chart.scale)) * chart.scale);
}

/** Whether a value is a whole number of half symbols at this scale (picture graphs). */
export const halvesOfScale = (value: number, scale: number): boolean =>
  Number.isInteger(tidy((2 * value) / scale));

/** Whether some value needs a part symbol (picture graphs: an odd count at scale 2). */
export function needsPartSymbol(values: readonly number[], scale: number): boolean {
  return values.some((v) => symbolParts(v, scale).part > 0);
}

/**
 * Semantic rules every chart must meet so that it can be drawn exactly (03 §5.5 widget schema).
 * `building`: the bar-graph-build chart, whose counts are hidden (every value 0).
 */
export function chartIssues(chart: ChartSpec, ctx: z.RefinementCtx, path: (string | number)[]) {
  const add = (p: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path: [...path, ...p], message });
  const ids = chart.categories.map((c) => c.id);
  if (new Set(ids).size !== ids.length) add(['categories'], 'category ids repeat');
  if (!(chart.axisMax > 0)) add(['axisMax'], 'the axis needs a positive top');
  chart.categories.forEach((c, i) => {
    if (!(c.value >= 0)) add(['categories', i, 'value'], 'a count is never negative');
    if (c.value > chart.axisMax) add(['categories', i, 'value'], 'the value is above axisMax');
    if (chart.kind !== 'bar' && !Number.isInteger(c.value)) {
      add(['categories', i, 'value'], 'only a bar can stand between whole counts');
    }
    if (chart.kind === 'picture' && !halvesOfScale(c.value, chart.scale)) {
      add(
        ['categories', i, 'value'],
        `a picture graph shows whole or half symbols of ${chart.scale}`,
      );
    }
  });
  if ((chart.kind === 'tally' || chart.kind === 'table') && chart.scale !== 1) {
    add(['scale'], `a ${chart.kind} counts in ones`);
  }
  if (chart.kind === 'line-plot') {
    const ls = chart.lineScale;
    if (!ls) {
      add(['lineScale'], 'a line plot needs lineScale');
      return;
    }
    if (![1, 0.5, 0.25].includes(ls.step)) add(['lineScale', 'step'], 'step is 1, 0.5 or 0.25');
    if (!(ls.max > ls.min)) add(['lineScale'], 'max must be above min');
    else if (!Number.isInteger(tidy((ls.max - ls.min) / ls.step))) {
      add(['lineScale'], 'max − min is not a whole number of steps');
    }
    const positions = new Set(linePositions(ls).map(positionId));
    chart.categories.forEach((c, i) => {
      if (!positions.has(positionId(Number(c.id)))) {
        add(['categories', i, 'id'], 'a line-plot category is a position on the scale');
      }
    });
    if (positions.size > 25) add(['lineScale'], 'a line plot shows at most 25 positions');
  } else {
    if (chart.categories.length < 1) add(['categories'], 'a chart needs a category');
    if (chart.categories.length > 6) add(['categories'], 'a chart shows at most 6 categories');
  }
}
