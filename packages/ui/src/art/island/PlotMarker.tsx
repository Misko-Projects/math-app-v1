import type { Plot } from '@number-island/shared';
import { paint } from '../core/paint';
import { GRASS_INSET, GRASS_WOBBLE, plotBox } from './geometry';

/**
 * A buildable-plot highlight (05 §6: "tap a highlighted plot"). States differ by shape and motion,
 * not colour alone (06 §7): `available` is a dashed outline with a plus; `selected` is a solid
 * thick ring with a check that gently pulses. Outlines are ink, ≥ 3:1 on sand and grass by day and
 * at sunset (06 §7).
 */
export type PlotMarkerState = 'available' | 'selected';

export interface PlotMarkerProps {
  plot: Plot;
  footprint?: readonly [number, number];
  state?: PlotMarkerState;
}

/** A marker's thickest outline (selected), in scene units. */
export const PLOT_MARKER_STROKE = 5;
/**
 * How far a marker's outline (its stroke's centre line) sits inside its plot, in scene units: the
 * marker stays fully inside the grass drawn on the plot (GRASS_INSET + GRASS_WOBBLE in, plus the
 * grass edge's own 1.5-unit line) with a clear margin of one outline width.
 */
export const PLOT_MARKER_INSET =
  GRASS_INSET + GRASS_WOBBLE + 1.5 + PLOT_MARKER_STROKE + PLOT_MARKER_STROKE / 2;
/** The plus or check badge's radius. */
const BADGE_R = 9.5;

export function PlotMarker({ plot, footprint = [1, 1], state = 'available' }: PlotMarkerProps) {
  const b = plotBox(plot, footprint);
  const inset = PLOT_MARKER_INSET;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const selected = state === 'selected';
  const k = BADGE_R / 15; // the badge's icon, scaled from its 15-unit design
  return (
    <g data-plot-marker={state} data-plot={`${plot[0]},${plot[1]}`}>
      <rect
        x={b.x + inset}
        y={b.y + inset}
        width={b.w - 2 * inset}
        height={b.h - 2 * inset}
        rx={11}
        fill={paint('cloud')}
        fillOpacity={selected ? 0.5 : 0.32}
        stroke={paint('ink')}
        strokeWidth={selected ? PLOT_MARKER_STROKE : 3.5}
        strokeDasharray={selected ? undefined : '10 7'}
        strokeLinecap="round"
      />
      <g
        className={selected ? 'motion-loop art-loop' : undefined}
        style={selected ? { animation: 'var(--animate-pulse-soft)' } : undefined}
      >
        <circle
          cx={cx}
          cy={cy}
          r={BADGE_R}
          fill={paint(selected ? 'ink' : 'cloud')}
          stroke={paint(selected ? 'cloud' : 'ink')}
          strokeWidth={2.5}
        />
        <path
          d={
            selected
              ? `M${cx - 7 * k} ${cy}l${5 * k} ${5 * k}l${9 * k} ${-10 * k}`
              : `M${cx - 7 * k} ${cy}h${14 * k}M${cx} ${cy - 7 * k}v${14 * k}`
          }
          fill="none"
          stroke={paint(selected ? 'cloud' : 'ink')}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}
