// The supported domain of the two graph formats, bar-graph-read and bar-graph-build (U05 #14).
// `chartSpecSchema` (@number-island/shared) already makes a chart drawable; these bounds make it
// a graph a child can read and build with targets of the kindergarten size in the smallest widget
// area (906 × 373). They are fixed numbers, the same in every area and age mode, and the widgets'
// stress stories show each one at that size.

import type { ChartSpec } from '@number-island/shared';
import { axisTop, chartSlots } from './chart';

/** Rows of a chart that reads across (picture rows, tally charts, tables, horizontal bars). */
export const GRAPH_ROWS_MAX = 3;
/** Columns of a chart that reads upward (vertical bars; every other kind reads across). */
export const GRAPH_COLUMNS_MAX = 3;
/**
 * Rows of horizontal bars and of a picture graph whose pictures stand for more than one: two,
 * because the number axis or the key takes a row's height.
 */
export const GRAPH_BAR_ROWS_MAX = 2;
/**
 * Steps on a bar graph's axis (the top ÷ scale): at most 10, so the widget labels every step,
 * every second or every fifth one and a bar is read from a labelled line plus at most 4 steps.
 */
export const GRAPH_BAR_STEPS_MAX = 10;
/**
 * The axis top of vertical bars, as drawn: two-digit numerals, so three named columns keep their
 * width. The widget may extend the axis to its next labelled line (a multiple of five steps at
 * most), so the top rounded up to five steps is the one that must stay within the bound.
 */
export const GRAPH_VERTICAL_TOP_MAX = 99;
/** Symbols in one row or column of a picture graph (the axis top ÷ scale). */
export const GRAPH_PICTURES_MAX = 10;
/** Marks in one row of a tally chart, and the count in a table cell. */
export const GRAPH_TALLY_MAX = 20;
/** Positions on a line plot the child reads. */
export const GRAPH_LINE_POSITIONS_MAX = 13;
/** Xs above one position of a line plot (the axis top). */
export const GRAPH_LINE_STACK_MAX = 6;
/** Positions on a line plot the child builds: each is a drop lane of the kindergarten size. */
export const BUILD_LINE_POSITIONS_MAX = 4;
/** Blocks in one bar the child builds (the axis top): one tap or drag adds one. */
export const BUILD_BAR_MAX = 10;
/** Pictures in one row the child builds (the axis top ÷ scale). */
export const BUILD_PICTURES_MAX = 6;
/** Marks in one row of the tally chart a build item shows as its data. */
export const BUILD_DATA_TALLY_MAX = 10;
/** The largest number a graph question answers (the pad types three digits). */
export const GRAPH_ANSWER_MAX = 999;

/** Letters in a category's name as printed beside its row or under its column. */
export const GRAPH_LABEL_CHARS_MAX = 9;

/**
 * Why a chart's category names do not fit their label cells (empty: they do): each is a line of
 * the narration table with at most GRAPH_LABEL_CHARS_MAX letters and no space (one word, so it
 * never wraps).
 */
export function graphLabelIssues(
  chart: ChartSpec,
  text: (key: string) => string | undefined,
): string[] {
  if (chart.kind === 'line-plot') return [];
  const out: string[] = [];
  for (const c of chart.categories) {
    const words = text(c.label);
    if (words === undefined) out.push(`category ${c.id}: ${c.label} has no words`);
    else if ([...words].length > GRAPH_LABEL_CHARS_MAX || /\s/.test(words)) {
      out.push(
        `category ${c.id}: "${words}" is not one word of at most ${GRAPH_LABEL_CHARS_MAX} letters`,
      );
    }
  }
  return out;
}

type Add = (path: (string | number)[], message: string) => void;

/** The bounds of a graph the child reads (`read`) or builds (`build`); issues go to `add`. */
export function graphIssues(chart: ChartSpec, purpose: 'read' | 'build', add: Add): void {
  const slots = chartSlots(chart);
  if (chart.kind === 'line-plot') {
    const most = purpose === 'build' ? BUILD_LINE_POSITIONS_MAX : GRAPH_LINE_POSITIONS_MAX;
    if (slots.length > most) {
      add(['lineScale'], `a line plot to ${purpose} has at most ${most} positions`);
    }
    if (chart.axisMax > GRAPH_LINE_STACK_MAX) {
      add(['axisMax'], `a line plot stacks at most ${GRAPH_LINE_STACK_MAX} Xs`);
    }
    if (chart.scale !== 1) add(['scale'], 'a line plot counts in ones');
    // Lengths are never negative, and the board prints a measurement as a whole and a fraction.
    if ((chart.lineScale?.min ?? 0) < 0)
      add(['lineScale', 'min'], 'a line plot starts at 0 or above');
    return;
  }
  const across = chart.orientation === 'horizontal';
  if (!across && chart.kind !== 'bar') {
    add(['orientation'], `a ${chart.kind} chart reads across; only bars stand upright`);
  }
  const keyed = chart.kind === 'picture' && chart.scale !== 1;
  const short = across && (chart.kind === 'bar' || keyed);
  const most = !across ? GRAPH_COLUMNS_MAX : short ? GRAPH_BAR_ROWS_MAX : GRAPH_ROWS_MAX;
  if (chart.categories.length > most) {
    const what = !across
      ? 'a chart that reads upward has'
      : keyed
        ? 'a picture graph with a key has'
        : short
          ? 'horizontal bars have'
          : 'a chart that reads across has';
    add(['categories'], `${what} at most ${most}`);
  }
  // A row ends on a whole picture, so a full row never holds part of one the child cannot place.
  if (chart.kind === 'picture' && chart.axisMax % chart.scale !== 0) {
    add(['axisMax'], `a picture graph's top is a whole number of pictures of ${chart.scale}`);
  }
  const pictures = purpose === 'build' ? BUILD_PICTURES_MAX : GRAPH_PICTURES_MAX;
  if (chart.kind === 'picture' && chart.axisMax > pictures * chart.scale) {
    add(['axisMax'], `a picture graph to ${purpose} has at most ${pictures} pictures in a row`);
  }
  if ((chart.kind === 'tally' || chart.kind === 'table') && chart.axisMax > GRAPH_TALLY_MAX) {
    add(['axisMax'], `a ${chart.kind} counts to at most ${GRAPH_TALLY_MAX}`);
  }
  if (chart.kind === 'bar' && purpose === 'build' && chart.axisMax > BUILD_BAR_MAX) {
    add(['axisMax'], `a bar the child builds has at most ${BUILD_BAR_MAX} blocks`);
  }
  const steps = Math.round(axisTop(chart) / chart.scale);
  if (chart.kind === 'bar' && steps > GRAPH_BAR_STEPS_MAX) {
    add(['axisMax'], `a bar graph's axis has at most ${GRAPH_BAR_STEPS_MAX} steps of its scale`);
  }
  // The top the axis may draw (the cap rounded up to its next labelled line), not the raw cap.
  if (
    chart.kind === 'bar' &&
    !across &&
    Math.ceil(steps / 5) * 5 * chart.scale > GRAPH_VERTICAL_TOP_MAX
  ) {
    add(['axisMax'], `vertical bars count to at most ${GRAPH_VERTICAL_TOP_MAX}`);
  }
  if (chart.kind === 'bar' && !Number.isInteger(chart.axisMax)) {
    add(['axisMax'], 'the axis top is a whole number');
  }
}
