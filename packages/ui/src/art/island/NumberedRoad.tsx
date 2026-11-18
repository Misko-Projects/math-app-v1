import type { IslandDef } from '@number-island/shared';
import { useMemo } from 'react';
import { paint } from '../core/paint';
import { roadLayout, type StonePlacement, smoothPath } from './geometry';
import { RoadStoneMark, type RoadStoneState } from './RoadStone';

export interface NumberedRoadProps {
  /** GameData `island.road`: stone n → plot. */
  road: IslandDef['road'];
  /** Stones 1…roadLength are laid (`road.extended` keeps the max, 02 §5.8 IslandState). */
  roadLength: number;
  /** The stone being counted aloud right now (05 §3: moving along the road counts aloud). */
  counting?: number | null;
  /** Show the next stone to lay (default true). */
  showNext?: boolean;
  /** Also show this many planned stones beyond the next one, as dashed outlines (default 0). */
  plannedAhead?: number;
  /** Only stones whose plot passes this test are drawn (for example, plots that are land). */
  onLand?: (s: StonePlacement) => boolean;
}

/**
 * The Numbered Road (05 §3): a soft sandy trail through the stones in order, with each laid stone
 * numbered, the next stone waiting, and optional planned stones beyond. When many stones share
 * plots (a road of 100), the stones step down in size so neighbours never overlap.
 */
export function NumberedRoad({
  road,
  roadLength,
  counting = null,
  showNext = true,
  plannedAhead = 0,
  onLand,
}: NumberedRoadProps) {
  const placed = useMemo(() => roadLayout(road), [road]);
  const lastShown = roadLength + (showNext ? 1 : 0) + (showNext ? plannedAhead : 0);
  const shown = placed.filter((s) => s.n <= lastShown && (!onLand || onLand(s)));
  if (shown.length === 0) return null;
  const laid = shown.filter((s) => s.n <= roadLength);
  const trail = smoothPath((laid.length > 1 ? laid : shown).map((s) => ({ x: s.x, y: s.y })));
  const gap = minGap(shown);
  // Roomy roads number every stone. Crowded ones (a long road sharing plots) number only the
  // landmarks: every ten, the first stone, the next stone and the one being counted. The others
  // become small plain pebbles, so nothing overlaps and the tens still read at a glance.
  const compact = gap < COMPACT_GAP;
  const scale = compact ? 0.8 : Math.min(1, gap / 64);
  const stateOf = (n: number): RoadStoneState =>
    n === counting
      ? 'counting'
      : n <= roadLength
        ? 'laid'
        : n === roadLength + 1
          ? 'next'
          : 'planned';
  const numbered = (n: number) =>
    !compact || n === 1 || n % 10 === 0 || n === counting || n > roadLength;
  // Draw back to front (higher y on top), so lower stones overlap the ones behind them; numbered
  // stones go last so a pebble never covers a number.
  const order = [...shown].sort(
    (a, b) => Number(numbered(a.n)) - Number(numbered(b.n)) || a.y - b.y || a.n - b.n,
  );
  return (
    <g data-layer="road" data-road-length={roadLength}>
      {laid.length > 1 ? (
        <>
          <path
            d={trail}
            fill="none"
            stroke={paint('sand-deep')}
            strokeWidth={34 * scale}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.55}
          />
          <path
            d={trail}
            fill="none"
            stroke={paint('sand-shadow')}
            strokeWidth={26 * scale}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {order.map((s) =>
        numbered(s.n) ? (
          <g key={s.n} transform={`translate(${s.x} ${s.y}) scale(${scale})`}>
            <RoadStoneMark n={s.n} state={stateOf(s.n)} />
          </g>
        ) : (
          <Pebble key={s.n} n={s.n} x={s.x} y={s.y} />
        ),
      )}
    </g>
  );
}

/** Below this centre-to-centre distance (scene units), the road switches to compact. */
export const COMPACT_GAP = 52;

/** A laid stone without its number, on a crowded road. */
function Pebble({ n, x, y }: { n: number; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} data-stone={n} data-state="laid" data-compact="true">
      <ellipse cx={0} cy={6} rx={9} ry={3} fill={paint('ink')} opacity={0.15} />
      <ellipse
        cx={0}
        cy={0}
        rx={8}
        ry={6}
        fill={paint('pebble')}
        stroke={paint('pebble-deep')}
        strokeWidth={2.5}
      />
    </g>
  );
}

/** The smallest distance between consecutive stones. */
export function minGap(stones: readonly StonePlacement[]): number {
  let gap = Number.POSITIVE_INFINITY;
  const sorted = [...stones].sort((a, b) => a.n - b.n);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1] as StonePlacement;
    const b = sorted[i] as StonePlacement;
    gap = Math.min(gap, Math.hypot(a.x - b.x, a.y - b.y));
  }
  return gap;
}
