import type { ChartSpec } from '@number-island/shared';
import { type CSSProperties, type ReactNode, useLayoutEffect, useState } from 'react';
import { outline, paint } from '../../art/core/paint';
import { useNarrationText, useUiPreferences } from '../../preferences/UiProvider';
import { CATEGORY_MARKS, type PaletteColor } from '../../tokens/tokens';
import { pictureProps } from './a11y';
import {
  type Box,
  type ChartGeometry,
  chartGeometry,
  LABEL_FONT_PX,
  NUMERAL_PX,
  nameWidth,
  type SlotGeometry,
} from './chartLayout';
import { ObjectSprite } from './sprites';
import './chart.css';

/**
 * A chart (03 §5.1 `ChartSpec`): picture graph, bar graph, line plot, tally chart or table,
 * vertical or horizontal, at any `scale` (2, 5, 10: a key says what one picture stands for, and a
 * picture graph draws the part of a symbol for the remainder). Used by StimulusView (`chart`
 * stimuli in number-pad and compare) and by both bar-graph widgets, which pass `values` (what the
 * child has built), `renderLabel` (category buttons) and `renderOverlay` (drop targets).
 *
 * Geometry comes from `chartGeometry` (pure, unit-tested): bars end exactly on their value, picture
 * graphs show exactly value / scale symbols, tally marks group in fives. Every category shows its
 * sprite and its `label` narration key (`noun.<id>.many`), so a category never depends on colour
 * (06 §7). Numerals are 32 px or more.
 */

export interface ChartViewProps {
  chart: ChartSpec;
  /** The box the chart fills, in CSS px. */
  maxWidth?: number;
  maxHeight?: number;
  /** Smallest label cell (the age-mode target when labels are buttons). */
  target?: number;
  /** Counts to draw instead of the chart's own (bar-graph-build). */
  values?: readonly number[];
  /** Accessible name of a static chart; defaults to "Look at the picture". */
  label?: string;
  /** Wraps a slot's label content (a category button). Makes the chart a group, not an image. */
  renderLabel?: (slot: SlotGeometry, content: ReactNode) => ReactNode;
  /** Draws over the chart in its own px coordinates (drop targets, handles). */
  renderOverlay?: (g: ChartGeometry) => ReactNode;
  /** A slot Pip points at (demo `point-bar`). */
  pointed?: string | null;
  /** A bar whose top is followed across to the axis (demo `read-axis`). */
  readLine?: string | null;
  /** The first `n` marks of a slot are ringed (demo `count-pictures`). */
  counted?: { id: string; n: number } | null;
  /** Space above and below a horizontal chart's rows (default 12; a build board needs less). */
  padY?: number;
  /**
   * Print the category names beside their pictures (default). A data board that sits next to a
   * named chart shows the pictures alone, so its marks keep the room.
   */
  names?: boolean;
  /**
   * The graph widgets' label style: names at `LABEL_FONT_PX` on one line, in a label cell sized
   * for the longest name. Only for charts whose names are bounded (the bar-graph formats check
   * them, `graphLabelIssues`); a `chart` stimulus keeps the kit's default label, which wraps.
   */
  widgetLabels?: boolean;
  className?: string;
}

/**
 * Bar fills by category: the CVD-safe category fills (tokens `CATEGORY_MARKS`, alternating light
 * and dark), outlined in their own shade. Categories are also named and pictured, never told
 * apart by colour alone.
 */
const BAR_FILLS: readonly PaletteColor[] = CATEGORY_MARKS.map((m) => m.fill);

/** A natural box for a chart inside `maxWidth` × `maxHeight` (small charts stay small). */
export function chartBox(
  chart: ChartSpec,
  maxWidth: number,
  maxHeight: number,
  target = 56,
): { width: number; height: number } {
  const n = Math.max(1, chart.kind === 'line-plot' ? 6 : chart.categories.length);
  if (chart.kind === 'line-plot') return { width: maxWidth, height: Math.min(maxHeight, 300) };
  if (chart.orientation === 'vertical') {
    const axis = chart.kind === 'bar' ? 70 : 0;
    const col = Math.max(target, 150);
    return {
      width: Math.min(maxWidth, 24 + axis + n * col + (n - 1) * 12),
      height: chart.kind === 'table' ? Math.min(maxHeight, 200) : maxHeight,
    };
  }
  const row = Math.max(target, 76);
  const key = chart.kind === 'picture' && chart.scale !== 1 ? 52 : 0;
  const axis = chart.kind === 'bar' ? NUMERAL_PX + 22 : 0;
  return {
    width: chart.kind === 'table' ? Math.min(maxWidth, 420) : maxWidth,
    height: Math.min(maxHeight, 24 + key + axis + n * row + (n - 1) * 12),
  };
}

/** The content box of an element, kept up to date (ResizeObserver). */
export function useMeasuredBox<T extends HTMLElement>(): [
  (el: T | null) => void,
  { width: number; height: number } | null,
] {
  const [el, setEl] = useState<T | null>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.floor(el.clientWidth || r.width);
      const h = Math.floor(el.clientHeight || r.height);
      setBox((b) => (b && b.width === w && b.height === h ? b : { width: w, height: h }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, box];
}

const at = (b: Box): CSSProperties => ({ left: b.x, top: b.y, width: b.w, height: b.h });

/** A category's picture and name, as its label cell shows it. */
export function CategoryLabel({
  slot,
  orientation,
  names = true,
}: {
  slot: SlotGeometry;
  orientation: 'vertical' | 'horizontal';
  names?: boolean;
}) {
  const t = useNarrationText();
  const box = slot.labelBox ?? { x: 0, y: 0, w: 64, h: 64 };
  // With no name beside it the picture has the whole cell.
  const sprite = Math.round(
    names
      ? Math.min(orientation === 'vertical' ? box.h * 0.5 : box.h * 0.6, box.w * 0.45, 52)
      : Math.min(box.h * 0.8, box.w * 0.8, 52),
  );
  return (
    <span className="ni-chart__labelface" data-orientation={orientation}>
      <span className="ni-chart__labelsprite" style={{ width: sprite, height: sprite }}>
        <ObjectSprite sprite={slot.id} />
      </span>
      {slot.label && names ? <span className="ni-chart__name">{t(slot.label)}</span> : null}
    </span>
  );
}

export function ChartView({
  chart,
  maxWidth = 720,
  maxHeight = 300,
  target = 56,
  values,
  label,
  renderLabel,
  renderOverlay,
  pointed = null,
  readLine = null,
  counted = null,
  padY,
  names = true,
  widgetLabels = false,
  className,
}: ChartViewProps) {
  const t = useNarrationText();
  const { ageMode } = useUiPreferences();
  const labelFont = LABEL_FONT_PX[ageMode === 'k' ? 'k' : 'g1-up'];
  const longest = names ? Math.max(0, ...chart.categories.map((c) => [...t(c.label)].length)) : 0;
  const size = chartBox(chart, maxWidth, maxHeight, target);
  const g = chartGeometry(chart, {
    ...size,
    target,
    values,
    padY,
    ...(widgetLabels ? { labelFont, nameWidth: nameWidth(longest, labelFont) } : {}),
  });
  const interactive = Boolean(renderLabel || renderOverlay);
  const name = label ?? t('ui.widget.picture');
  const cls = ['ni-chart', className].filter(Boolean).join(' ');
  const axisEnd = g.axisLine;

  return (
    <div
      className={cls}
      data-labels={widgetLabels ? 'widget' : undefined}
      data-kind={chart.kind}
      data-orientation={g.orientation}
      data-scale={chart.scale}
      style={{ width: g.width, height: g.height }}
      {...(interactive ? { role: 'group', 'aria-label': name } : pictureProps(name))}
    >
      <svg
        className="ni-chart__svg"
        width={g.width}
        height={g.height}
        viewBox={`0 0 ${g.width} ${g.height}`}
        aria-hidden="true"
        focusable="false"
      >
        {/* Lanes: a soft stripe per category, so rows and columns read as one line each. */}
        {g.slots.map((s) =>
          chart.kind === 'line-plot' ? null : (
            <rect
              key={`lane-${s.id}`}
              className="ni-chart__lane"
              data-pointed={pointed === s.id ? 'true' : undefined}
              x={s.lane.x}
              y={s.lane.y}
              width={s.lane.w}
              height={s.lane.h}
              rx={12}
            />
          ),
        )}
        {/* Gridlines at every tick (scale), numerals at the labelled ones. */}
        {g.ticks.map((tk) =>
          chart.kind === 'line-plot' || !tk.line ? null : g.orientation === 'vertical' ? (
            <line
              key={`grid-${tk.value}`}
              className="ni-chart__grid"
              data-value={tk.value}
              data-labelled={tk.labelled ? 'true' : undefined}
              x1={g.plot.x}
              x2={g.plot.x + g.plot.w}
              y1={tk.pos}
              y2={tk.pos}
            />
          ) : (
            <line
              key={`grid-${tk.value}`}
              className="ni-chart__grid"
              data-value={tk.value}
              data-labelled={tk.labelled ? 'true' : undefined}
              x1={tk.pos}
              x2={tk.pos}
              y1={g.plot.y - 6}
              y2={g.plot.y + g.plot.h + 6}
            />
          ),
        )}
        {g.slots.map((s) => {
          const fill = BAR_FILLS[s.index % BAR_FILLS.length] as PaletteColor;
          return s.bar && s.value > 0 ? (
            <rect
              key={`bar-${s.id}`}
              className="ni-chart__bar"
              data-slot={s.id}
              data-value={s.value}
              x={s.bar.x}
              y={s.bar.y}
              width={s.bar.w}
              height={s.bar.h}
              rx={4}
              fill={paint(fill)}
              stroke={outline(fill)}
              strokeWidth={3}
            />
          ) : null;
        })}
        {readLine
          ? g.slots
              .filter((s) => s.id === readLine && s.bar)
              .map((s) => {
                const b = s.bar as Box;
                return g.orientation === 'vertical' ? (
                  <line
                    key="read"
                    className="ni-chart__read"
                    x1={b.x + b.w}
                    y1={b.y}
                    x2={g.plot.x - 4}
                    y2={b.y}
                  />
                ) : (
                  <line
                    key="read"
                    className="ni-chart__read"
                    x1={b.x + b.w}
                    y1={b.y + b.h}
                    x2={b.x + b.w}
                    y2={g.plot.y + g.plot.h + 6}
                  />
                );
              })
          : null}
        {axisEnd ? (
          <line
            className="ni-chart__axis"
            x1={axisEnd[0]}
            y1={axisEnd[1]}
            x2={axisEnd[2]}
            y2={axisEnd[3]}
          />
        ) : null}
        {chart.kind === 'bar'
          ? g.ticks
              .filter((tk) => tk.labelled)
              .map((tk) =>
                g.orientation === 'vertical' ? (
                  <text
                    key={`num-${tk.value}`}
                    className="ni-chart__numeral"
                    x={g.plot.x - 14}
                    y={tk.pos + g.numeral * 0.34}
                    textAnchor="end"
                    fontSize={g.numeral}
                  >
                    {tk.value}
                  </text>
                ) : (
                  <text
                    key={`num-${tk.value}`}
                    className="ni-chart__numeral"
                    x={tk.pos}
                    y={g.plot.y + g.plot.h + 12 + g.numeral * 0.9}
                    textAnchor="middle"
                    fontSize={g.numeral}
                  >
                    {tk.value}
                  </text>
                ),
              )
          : null}
        {chart.kind === 'line-plot' ? <LinePlotAxis g={g} /> : null}
        {g.slots.map((s) =>
          s.tally ? (
            <g
              key={`tally-${s.id}`}
              className="ni-chart__tally"
              data-slot={s.id}
              data-marks={s.value}
              // A data board (pictures without names) draws short strokes thinner, so the gaps
              // between them stay open.
              style={
                widgetLabels && !names
                  ? ({ '--tally-stroke': Math.max(3, Math.min(5, g.mark * 0.12)) } as CSSProperties)
                  : undefined
              }
            >
              {s.tally.map((group, gi) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a tally group's place is its identity
                <g key={gi} data-group-size={group.length}>
                  {group.map(([x1, y1, x2, y2], k) => (
                    <line
                      // biome-ignore lint/suspicious/noArrayIndexKey: stroke order within a group
                      key={k}
                      className="ni-chart__stroke"
                      data-gate={k === 4 ? 'true' : undefined}
                      data-counted={
                        counted?.id === s.id && gi * 5 + k < counted.n ? 'true' : undefined
                      }
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                    />
                  ))}
                </g>
              ))}
            </g>
          ) : null,
        )}
        {g.slots.map((s) =>
          s.xs ? (
            <g key={`xs-${s.id}`} className="ni-chart__xs" data-slot={s.id} data-marks={s.value}>
              {s.xs.map((b, k) => (
                <path
                  // biome-ignore lint/suspicious/noArrayIndexKey: Xs stack bottom up
                  key={k}
                  className="ni-chart__x"
                  data-counted={counted?.id === s.id && k < counted.n ? 'true' : undefined}
                  d={`M${b.x + b.w * 0.18} ${b.y + b.h * 0.18}L${b.x + b.w * 0.82} ${b.y + b.h * 0.82}M${b.x + b.w * 0.82} ${b.y + b.h * 0.18}L${b.x + b.w * 0.18} ${b.y + b.h * 0.82}`}
                />
              ))}
            </g>
          ) : null,
        )}
        {chart.kind === 'table' ? <TableGrid g={g} labelCells={!renderLabel} /> : null}
        {g.slots.map((s) =>
          s.cell ? (
            <text
              key={`cell-${s.id}`}
              className="ni-chart__numeral"
              data-slot={s.id}
              data-counted={counted?.id === s.id ? 'true' : undefined}
              x={s.cell.x + s.cell.w / 2}
              y={s.cell.y + s.cell.h / 2 + 40 * 0.34}
              textAnchor="middle"
              fontSize={40}
            >
              {s.value}
            </text>
          ) : null,
        )}
      </svg>
      {/* Picture-graph symbols: the category's sprite, the last one cut to its part. */}
      {g.slots.map((s) =>
        s.symbols ? (
          <span
            key={`sym-${s.id}`}
            className="ni-chart__symbols"
            data-slot={s.id}
            data-symbols={s.symbols.reduce((n, b) => n + b.part, 0)}
            aria-hidden="true"
          >
            {s.symbols.map((b, k) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: symbols read left to right
                key={k}
                className="ni-chart__symbol"
                data-part={b.part < 1 ? b.part : undefined}
                data-counted={counted?.id === s.id && k < counted.n ? 'true' : undefined}
                style={{ ...at(b), width: b.w * b.part }}
              >
                <span className="ni-chart__symbolart" style={{ width: b.w, height: b.h }}>
                  <ObjectSprite sprite={s.id} />
                </span>
              </span>
            ))}
          </span>
        ) : null,
      )}
      {g.key ? (
        <span className="ni-chart__key" style={at(g.key)} aria-hidden="true">
          <span className="ni-chart__keysprite">
            <ObjectSprite sprite={g.slots[0]?.id ?? 'pebble'} />
          </span>
          <span className="ni-chart__keytext">= {chart.scale}</span>
        </span>
      ) : null}
      {g.slots.map((s) => {
        if (!s.labelBox) return null;
        const content = <CategoryLabel slot={s} orientation={g.orientation} names={names} />;
        return (
          <span
            key={`label-${s.id}`}
            className="ni-chart__label"
            data-slot={s.id}
            data-pointed={pointed === s.id ? 'true' : undefined}
            style={at(s.labelBox)}
          >
            {renderLabel ? renderLabel(s, content) : content}
          </span>
        );
      })}
      {g.key && interactive ? (
        <span className="ni-visually-hidden">{t('ui.widget.chart.key', { n: chart.scale })}</span>
      ) : null}
      {renderOverlay ? renderOverlay(g) : null}
    </div>
  );
}

function LinePlotAxis({ g }: { g: ChartGeometry }) {
  const y = g.axisLine?.[1] ?? 0;
  return (
    <>
      {g.ticks.map((tk) => (
        <line
          key={`tick-${tk.value}`}
          className="ni-chart__tick"
          data-whole={Number.isInteger(tk.value) ? 'true' : undefined}
          x1={tk.pos}
          x2={tk.pos}
          y1={y - (Number.isInteger(tk.value) ? 14 : 9)}
          y2={y + (Number.isInteger(tk.value) ? 14 : 9)}
        />
      ))}
      {g.ticks
        .filter((tk) => tk.labelled)
        .map((tk) => (
          <text
            key={`num-${tk.value}`}
            className="ni-chart__numeral"
            x={tk.pos}
            y={y + 18 + g.numeral * 0.8}
            textAnchor="middle"
            fontSize={g.numeral}
          >
            {tk.value}
          </text>
        ))}
    </>
  );
}

/** The table's cells (label cells only when the labels are not buttons with their own frame). */
function TableGrid({ g, labelCells }: { g: ChartGeometry; labelCells: boolean }) {
  const boxes = g.slots.flatMap((s) =>
    [labelCells ? s.labelBox : null, s.cell].filter((b): b is Box => Boolean(b)),
  );
  return (
    <>
      {boxes.map((b) => (
        <rect
          key={`${b.x}-${b.y}`}
          className="ni-chart__tablecell"
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
        />
      ))}
    </>
  );
}
