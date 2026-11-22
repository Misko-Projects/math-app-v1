// Chart maths shared by the bar-graph-read and bar-graph-build models and the widgets' ChartView
// (03 §5.1 `ChartSpec`, U05 #14). Everything here is pure, so the pictures and the models agree:
// a bar's top is `value` on the axis, a picture graph shows `value / scale` symbols (a part symbol
// for the remainder: a half for halves), and tally marks group in fives.
//
// Slots: the places a chart holds a count. For picture graphs, bar graphs, tally charts and tables
// they are the categories, in chart order. For a line plot they are the positions of `lineScale`
// (min, min + step, …, max); the chart's categories name the positions that have Xs (category id =
// the position as a string, value = how many Xs), so a line plot's counts read in position order.

//
// The rules a chart meets to be drawn exactly, and the supported ranges, live with the contract
// (`chartSpecSchema` in @number-island/shared applies `chartIssues` to every chart); the helpers
// they share are re-exported here under the names the models and widgets use.

import {
  type ChartSpec,
  chartAxisTop,
  chartHalvesOfScale,
  chartLinePositions,
  chartPositionId,
  chartTidy,
} from '@number-island/shared';

export { chartIssues } from '@number-island/shared';

export interface ChartSlot {
  /** Category id, or the position as a string on a line plot ("1.5"). */
  id: string;
  /** The category's label narration key (line-plot positions have none: they show the numeral). */
  label?: string;
  /** Line-plot position. */
  at?: number;
}

/** Rounds away binary noise (0.1 + 0.2), so positions and part symbols compare exactly. */
export const tidy = chartTidy;

/** The id of a line-plot position: the number as written ("2", "1.5", "0.25"). */
export const positionId = chartPositionId;

/** The positions of a line plot's scale, min to max by step. */
export const linePositions = chartLinePositions;

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
export const axisTop = chartAxisTop;

/** Whether a value is a whole number of half symbols at this scale (picture graphs). */
export const halvesOfScale = chartHalvesOfScale;

/** Whether some value needs a part symbol (picture graphs: an odd count at scale 2). */
export function needsPartSymbol(values: readonly number[], scale: number): boolean {
  return values.some((v) => symbolParts(v, scale).part > 0);
}
