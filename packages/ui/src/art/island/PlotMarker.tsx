import type { Plot } from '@number-island/shared';
import { paint } from '../core/paint';
import { plotBox } from './geometry';

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

export function PlotMarker({ plot, footprint = [1, 1], state = 'available' }: PlotMarkerProps) {
  const b = plotBox(plot, footprint);
  const inset = 8;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const selected = state === 'selected';
  return (
    <g data-plot-marker={state} data-plot={`${plot[0]},${plot[1]}`}>
      <rect
        x={b.x + inset}
        y={b.y + inset}
        width={b.w - 2 * inset}
        height={b.h - 2 * inset}
        rx={16}
        fill={paint('cloud')}
        fillOpacity={selected ? 0.5 : 0.32}
        stroke={paint('ink')}
        strokeWidth={selected ? 6 : 4}
        strokeDasharray={selected ? undefined : '12 9'}
        strokeLinecap="round"
      />
      <g
        className={selected ? 'motion-loop art-loop' : undefined}
        style={selected ? { animation: 'var(--animate-pulse-soft)' } : undefined}
      >
        <circle
          cx={cx}
          cy={cy}
          r={15}
          fill={paint(selected ? 'ink' : 'cloud')}
          stroke={paint(selected ? 'cloud' : 'ink')}
          strokeWidth={3}
        />
        <path
          d={selected ? `M${cx - 7} ${cy}l5 5l9 -10` : `M${cx - 7} ${cy}h14M${cx} ${cy - 7}v14`}
          fill="none"
          stroke={paint(selected ? 'cloud' : 'ink')}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}
