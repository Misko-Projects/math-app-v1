import {
  axisTicks,
  axisTop,
  type ChartSlot,
  chartSlots,
  slotValues,
  symbolParts,
  tallyGroups,
} from '@number-island/engine';
import type { ChartSpec } from '@number-island/shared';

/**
 * Pure chart geometry (03 §5.1 `ChartSpec`, U05 #14) in CSS px, shared by `ChartView` and the two
 * bar-graph widgets. Maths truth first: a bar's top sits exactly on its value (`valueToPos`, the
 * same function that places the axis ticks); a picture graph draws exactly `value / scale`
 * symbols (whole ones, then the part of one: a half for halves); tally marks group in fives (four
 * strokes and a gate); a line plot stacks one X per count above its position. The unit tests in
 * `chartLayout.test.ts` assert each of these.
 *
 * Numerals are never smaller than 32 px (05 §11); a crowded axis labels every 2nd, 5th or 10th
 * tick instead (every tick keeps its gridline).
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Segment = [x1: number, y1: number, x2: number, y2: number];

export interface SymbolBox extends Box {
  /** 1 for a whole symbol; less for the part of one (drawn as its left part). */
  part: number;
}

export interface SlotGeometry extends ChartSlot {
  index: number;
  value: number;
  /** The label cell (sprite and name). Line-plot positions have none (the axis numeral). */
  labelBox: Box | null;
  /** The row or column the slot's marks go in (a drop target when building). */
  lane: Box;
  /** bar: the bar (zero height at 0). */
  bar?: Box;
  /** picture: one box per symbol. */
  symbols?: SymbolBox[];
  /** tally: the strokes of each group (a group of five ends with its gate). */
  tally?: Segment[][];
  /** line plot: one box per X, bottom up. */
  xs?: Box[];
  /** table: the count cell. */
  cell?: Box;
}

export interface AxisTick {
  value: number;
  /** Position along the value axis (y for vertical charts, x for horizontal ones). */
  pos: number;
  labelled: boolean;
  /** Whether the tick draws its gridline (a long axis in a short plot thins them out). */
  line: boolean;
}

export interface ChartGeometry {
  kind: ChartSpec['kind'];
  orientation: ChartSpec['orientation'];
  width: number;
  height: number;
  /** The plot area the marks are drawn in. */
  plot: Box;
  slots: SlotGeometry[];
  /** bar graphs: the value axis; line plots: the number line's ticks (pos = x). */
  ticks: AxisTick[];
  /** The axis line (bar graphs and line plots). */
  axisLine: Segment | null;
  /** Where a value sits along the value axis (bar graphs; line plots: where a position sits). */
  valueToPos: (v: number) => number;
  /** Picture graph symbol size, tally stroke height, X size. */
  mark: number;
  /** Picture graphs with a scale other than 1: where the key ("each picture = 2") goes. */
  key: Box | null;
  /** Font size of the numerals (≥ 32). */
  numeral: number;
}

export interface ChartLayoutOptions {
  width: number;
  height: number;
  /** Smallest label cell side (the age mode's target when labels are buttons). */
  target?: number;
  /** Space between label cells. */
  gap?: number;
  /** Counts to draw instead of the chart's own (bar-graph-build). */
  values?: readonly number[];
  /** Space above and below the rows of a horizontal chart (default 12). */
  padY?: number;
}

export const NUMERAL_PX = 32;
/** Gridlines of a bar graph are at least this far apart (closer ones are thinned out). */
export const GRID_MIN_PX = 8;
/**
 * The smallest picture-graph symbol and line-plot X. A box too small for a chart's marks at this
 * size makes the geometry bigger than the box (its `width` and `height` say so), never marks
 * outside the chart: the caller then scales the whole chart down.
 */
export const MARK_MIN_PX = 14;
/** Rough Baloo 2 numeral advance at NUMERAL_PX (bold): about 0.62 em a digit. */
const DIGIT_PX = 20;
const PAD = 12;

const digits = (n: number) => String(n).replace('.', '').length;

/** Every k-th tick is labelled, k from 1, 2, 5, 10, … so labels are at least `min` px apart. */
export function labelStride(spacing: number, min: number): number {
  for (const k of [1, 2, 5, 10, 20, 50]) if (spacing * k >= min) return k;
  return 100;
}

function ticksFor(
  chart: Pick<ChartSpec, 'axisMax' | 'scale'>,
  toPos: (v: number) => number,
  minSpacing: number,
): AxisTick[] {
  const values = axisTicks(chart);
  const spacing = Math.abs(toPos(chart.scale) - toPos(0));
  const stride = labelStride(spacing, minSpacing);
  // Gridlines closer than GRID_MIN_PX would read as a texture, not as counts: then only the
  // labelled ticks and the ones halfway between them (the fives between tens) keep a line.
  const lineEvery =
    spacing >= GRID_MIN_PX
      ? 1
      : stride % 2 === 0 && (spacing * stride) / 2 >= GRID_MIN_PX
        ? stride / 2
        : stride;
  return values.map((value, k) => ({
    value,
    pos: toPos(value),
    labelled: k % stride === 0,
    line: k % lineEvery === 0,
  }));
}

/** Tally strokes for one count in a box: groups of five, each four strokes and a gate. */
export function tallyStrokes(
  count: number,
  box: Box,
  orientation: 'horizontal' | 'vertical',
  stroke: number,
): Segment[][] {
  const groups = tallyGroups(count);
  const d = stroke * 0.32; // space between strokes
  const groupW = 4 * d;
  const groupGap = d * 1.7;
  return groups.map((n, g) => {
    const x0 =
      orientation === 'horizontal'
        ? box.x + d * 0.5 + g * (groupW + groupGap)
        : box.x + (box.w - groupW) / 2 + d * 0.5;
    const yTop =
      orientation === 'horizontal'
        ? box.y + (box.h - stroke) / 2
        : box.y + box.h - (g + 1) * (stroke + d * 1.6) + d * 0.8;
    const yBot = yTop + stroke;
    const lines: Segment[] = Array.from({ length: Math.min(n, 4) }, (_, i) => [
      x0 + i * d,
      yTop,
      x0 + i * d,
      yBot,
    ]);
    // The fifth mark is the gate: a slash across the four.
    if (n === 5)
      lines.push([
        x0 - d * 0.55,
        yBot - stroke * 0.12,
        x0 + 3 * d + d * 0.55,
        yTop + stroke * 0.12,
      ]);
    return lines;
  });
}

/** The px a tally of `count` needs along its row, for a stroke height. */
export function tallyLength(count: number, stroke: number): number {
  const d = stroke * 0.32;
  const g = tallyGroups(count).length;
  return g === 0 ? 0 : g * 4 * d + (g - 1) * d * 1.7 + d;
}

function lineGeometry(
  chart: ChartSpec,
  values: number[],
  o: Required<Omit<ChartLayoutOptions, 'values' | 'padY'>>,
): ChartGeometry {
  const slots = chartSlots(chart);
  const left = PAD + 24;
  const n = Math.max(1, slots.length - 1);
  const top = PAD;
  const below = NUMERAL_PX + PAD + 14;
  const most = Math.max(1, chart.axisMax, ...values);
  // Room for every X at MARK_MIN_PX: neighbours apart across, the tallest stack up.
  const width = Math.max(o.width, 2 * left + (n * MARK_MIN_PX) / 0.8);
  const height = Math.max(o.height, top + 10 + most * (MARK_MIN_PX + 4) + below);
  const right = width - PAD - 24;
  const spacing = (right - left) / n;
  const at = (i: number) => left + i * spacing;
  const axisY = height - below;
  const mark = Math.max(MARK_MIN_PX, Math.min(40, spacing * 0.8, (axisY - top - 10) / most - 4));
  const min = chart.lineScale?.min ?? 0;
  const step = chart.lineScale?.step ?? 1;
  // Whole-number positions carry numerals; halves and quarters are shorter ticks. Labels are
  // counted from the first whole number on the scale, so a scale that starts on a half or a
  // quarter still labels its whole numbers.
  const wholeEvery = Math.round(1 / step);
  const wholeStride = labelStride(spacing * wholeEvery, 48);
  const firstWhole = Math.ceil(min - 1e-9);
  const ticks: AxisTick[] = slots.map((s, i) => {
    const value = s.at ?? 0;
    return {
      value,
      pos: at(i),
      labelled: Number.isInteger(value) && Math.round(value - firstWhole) % wholeStride === 0,
      line: true,
    };
  });
  const geo: SlotGeometry[] = slots.map((s, i) => {
    const v = values[i] ?? 0;
    // Each position's lane is the strip around it, clipped to the chart.
    const x0 = Math.max(4, at(i) - spacing / 2 + 6);
    const x1 = Math.min(width - 4, at(i) + spacing / 2 - 6);
    const lane = { x: x0, y: top, w: x1 - x0, h: axisY - top };
    return {
      ...s,
      index: i,
      value: v,
      labelBox: null,
      lane,
      xs: Array.from({ length: Math.max(0, Math.floor(v)) }, (_, k) => ({
        x: at(i) - mark / 2,
        y: axisY - 10 - (k + 1) * (mark + 4),
        w: mark,
        h: mark,
      })),
    };
  });
  return {
    kind: chart.kind,
    orientation: 'horizontal',
    width,
    height,
    plot: { x: left, y: top, w: right - left, h: axisY - top },
    slots: geo,
    ticks,
    axisLine: [left - 18, axisY, right + 18, axisY],
    valueToPos: (v) => left + ((v - min) / step) * spacing,
    mark,
    key: null,
    numeral: NUMERAL_PX,
  };
}

/**
 * Lays out a chart in a `width` × `height` box. The geometry may be taller than `height` when the
 * label cells cannot shrink below `target` (the caller then has too little room).
 */
export function chartGeometry(chart: ChartSpec, opts: ChartLayoutOptions): ChartGeometry {
  const o = {
    width: Math.max(160, opts.width),
    height: Math.max(120, opts.height),
    target: opts.target ?? 56,
    gap: opts.gap ?? 12,
  };
  const padY = opts.padY ?? PAD;
  const values = opts.values ? [...opts.values] : slotValues(chart);
  if (chart.kind === 'line-plot') return lineGeometry(chart, values, o);
  const slots = chartSlots(chart);
  const n = Math.max(1, slots.length);
  const top = axisTop(chart);
  const scale = chart.scale;
  const keyH = chart.kind === 'picture' && scale !== 1 ? 52 : 0;
  const numW = digits(top) * DIGIT_PX + 16;

  if (chart.orientation === 'horizontal') {
    const axisH = chart.kind === 'bar' ? NUMERAL_PX + 22 : 0;
    // A table is a label column and a count column that share the width it has.
    const tableW = Math.round(Math.min(132, Math.max(72, (o.width - 2 * PAD) * 0.38)));
    const labelW =
      chart.kind === 'table'
        ? Math.max(o.target, Math.min(200, o.width - 2 * PAD - tableW - o.gap))
        : Math.min(200, Math.max(o.target, 150, Math.round(o.width * 0.24)));
    const avail = o.height - keyH - axisH - 2 * padY;
    const rowH = Math.max(o.target, Math.min(104, (avail - (n - 1) * o.gap) / n));
    const rowsH = n * rowH + (n - 1) * o.gap;
    const y0 = padY + keyH;
    const height = Math.max(o.height, y0 + rowsH + axisH + padY);
    const plotX = PAD + labelW + (chart.kind === 'table' ? o.gap : 16);
    const plotR =
      chart.kind === 'table'
        ? plotX + tableW
        : o.width - PAD - (chart.kind === 'bar' ? numW / 2 : 8);
    const symCols = Math.round(top / scale);
    const sgap = 6;
    // A picture graph's row holds every symbol at MARK_MIN_PX: a narrower box widens the chart.
    const symRowW = chart.kind === 'picture' ? symCols * MARK_MIN_PX + (symCols - 1) * sgap : 0;
    const plot = { x: plotX, y: y0, w: Math.max(40, symRowW, plotR - plotX), h: rowsH };
    const width = Math.max(o.width, plot.x + plot.w + (o.width - plotR));
    const unit = plot.w / top;
    const toPos = (v: number) => plot.x + v * unit;
    const sym = Math.max(
      MARK_MIN_PX,
      Math.min(rowH - 14, 64, (plot.w - (symCols - 1) * sgap) / symCols),
    );
    const groupsMax = Math.max(1, Math.ceil(top / 5));
    const strokeFit = (plot.w - 12) / (0.32 * (4 * groupsMax + 1.7 * (groupsMax - 1) + 1));
    const stroke = Math.min(rowH * 0.64, 56, strokeFit);
    const geo: SlotGeometry[] = slots.map((s, i) => {
      const v = values[i] ?? 0;
      const y = y0 + i * (rowH + o.gap);
      const lane = { x: plot.x, y, w: plot.w, h: rowH };
      const base: SlotGeometry = {
        ...s,
        index: i,
        value: v,
        labelBox: { x: PAD, y, w: labelW, h: rowH },
        lane,
      };
      switch (chart.kind) {
        case 'bar':
          return { ...base, bar: { x: plot.x, y: y + rowH * 0.18, w: v * unit, h: rowH * 0.64 } };
        case 'picture': {
          const { whole, part } = symbolParts(v, scale);
          const boxes: SymbolBox[] = Array.from({ length: whole + (part > 0 ? 1 : 0) }, (_, k) => ({
            x: plot.x + k * (sym + sgap),
            y: y + (rowH - sym) / 2,
            w: sym,
            h: sym,
            part: k < whole ? 1 : part,
          }));
          return { ...base, symbols: boxes };
        }
        case 'tally':
          return {
            ...base,
            tally: tallyStrokes(v, { ...lane, x: lane.x + 4 }, 'horizontal', stroke),
          };
        default:
          return { ...base, cell: { x: plot.x, y, w: tableW, h: rowH } };
      }
    });
    const ticks = chart.kind === 'bar' ? ticksFor(chart, toPos, numW + 10) : [];
    const axisY = y0 + rowsH + 6;
    return {
      kind: chart.kind,
      orientation: 'horizontal',
      width: chart.kind === 'table' ? plot.x + tableW + PAD : width,
      height,
      plot,
      slots: geo,
      ticks,
      axisLine: chart.kind === 'bar' ? [plot.x, y0 - 6, plot.x, axisY] : null,
      valueToPos: toPos,
      mark: chart.kind === 'picture' ? sym : stroke,
      key: keyH ? { x: width - PAD - 200, y: PAD - 4, w: 200, h: keyH - 8 } : null,
      numeral: NUMERAL_PX,
    };
  }

  // Vertical: columns, labels underneath, the value axis on the left (bar graphs).
  const axisW = chart.kind === 'bar' ? numW + 14 : 0;
  const labelH = Math.max(o.target, 76);
  const x0 = PAD + axisW;
  const colW = Math.max(o.target, Math.min(170, (o.width - x0 - PAD - (n - 1) * o.gap) / n));
  const colsW = n * colW + (n - 1) * o.gap;
  const width = Math.max(o.width, x0 + colsW + PAD);
  const topPad = PAD + keyH + (chart.kind === 'bar' ? NUMERAL_PX / 2 : 0);
  const tableH = 72;
  const symRows = Math.round(top / scale);
  const sgap = 5;
  // A picture graph's column holds every symbol at MARK_MIN_PX: a shorter box makes it taller.
  const symColH = chart.kind === 'picture' ? symRows * MARK_MIN_PX + (symRows - 1) * sgap : 0;
  const plotH =
    chart.kind === 'table'
      ? tableH
      : Math.max(60, symColH, o.height - topPad - labelH - o.gap - PAD);
  const baseY = topPad + plotH;
  const plot = { x: x0, y: topPad, w: colsW, h: plotH };
  const unit = plotH / top;
  const toPos = (v: number) => baseY - v * unit;
  const sym = Math.max(
    MARK_MIN_PX,
    Math.min(colW - 16, 64, (plotH - (symRows - 1) * sgap) / symRows),
  );
  const stacks = Math.max(1, Math.ceil(top / 5));
  const stroke = Math.min(colW * 0.5, 52, plotH / (stacks * 1.52));
  const geo: SlotGeometry[] = slots.map((s, i) => {
    const v = values[i] ?? 0;
    const x = x0 + i * (colW + o.gap);
    const lane = { x, y: topPad, w: colW, h: plotH };
    const labelBox =
      chart.kind === 'table'
        ? { x, y: topPad, w: colW, h: labelH }
        : { x, y: baseY + o.gap, w: colW, h: labelH };
    const base: SlotGeometry = { ...s, index: i, value: v, labelBox, lane };
    switch (chart.kind) {
      case 'bar': {
        const bw = Math.min(colW * 0.62, 96);
        return {
          ...base,
          bar: { x: x + (colW - bw) / 2, y: baseY - v * unit, w: bw, h: v * unit },
        };
      }
      case 'picture': {
        const { whole, part } = symbolParts(v, scale);
        const boxes: SymbolBox[] = Array.from({ length: whole + (part > 0 ? 1 : 0) }, (_, k) => ({
          x: x + (colW - sym) / 2,
          y: baseY - (k + 1) * sym - k * sgap,
          w: sym,
          h: sym,
          part: k < whole ? 1 : part,
        }));
        return { ...base, symbols: boxes };
      }
      case 'tally':
        return { ...base, tally: tallyStrokes(v, lane, 'vertical', stroke) };
      default:
        return {
          ...base,
          lane: { x, y: topPad + labelH, w: colW, h: tableH },
          cell: { x, y: topPad + labelH, w: colW, h: tableH },
        };
    }
  });
  return {
    kind: chart.kind,
    orientation: 'vertical',
    width,
    height:
      chart.kind === 'table'
        ? topPad + labelH + tableH + PAD
        : Math.max(o.height, baseY + o.gap + labelH + PAD),
    plot,
    slots: geo,
    ticks: chart.kind === 'bar' ? ticksFor(chart, toPos, NUMERAL_PX * 0.9) : [],
    axisLine: chart.kind === 'bar' ? [x0 - 6, baseY, x0 + colsW + 6, baseY] : null,
    valueToPos: toPos,
    mark: chart.kind === 'picture' ? sym : stroke,
    key: keyH ? { x: width - PAD - 200, y: PAD - 4, w: 200, h: keyH - 8 } : null,
    numeral: NUMERAL_PX,
  };
}
