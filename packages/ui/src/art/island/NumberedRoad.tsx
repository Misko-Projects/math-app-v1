import type { IslandDef } from '@number-island/shared';
import { useMemo } from 'react';
import { paint } from '../core/paint';
import { type StonePlacement, smoothPath } from './geometry';
import { RoadStoneMark } from './RoadStone';
import { planRoad, type RoadPlan } from './roadPlan';

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
  /** Land plot keys (`x,y`): a stone stepped out beside the road only lands on these. */
  land?: ReadonlySet<string>;
  /** A plan already made with planRoad (the island scene shares one with its ground detail). */
  plan?: RoadPlan;
}

/**
 * The Numbered Road (05 §3): a soft sandy trail through the stones in order, with each laid stone
 * numbered, the next stone waiting and optional planned stones beyond. `planRoad` decides which
 * stones keep their numerals so that no two numbered stones (rings, flags and lift included) ever
 * touch; on a crowded road the others become small plain pebbles and the tens stay as landmarks.
 */
export function NumberedRoad({
  road,
  roadLength,
  counting = null,
  showNext = true,
  plannedAhead = 0,
  onLand,
  land,
  plan: given,
}: NumberedRoadProps) {
  const plan = useMemo(
    () => given ?? planRoad({ road, roadLength, counting, showNext, plannedAhead, onLand, land }),
    [given, road, roadLength, counting, showNext, plannedAhead, onLand, land],
  );
  if (plan.numbered.length === 0 && plan.pebbles.length === 0) return null;
  const trail = plan.trail.length > 1 ? smoothPath(plan.trail) : '';
  return (
    <g
      data-layer="road"
      data-road-length={roadLength}
      data-compact={plan.compact ? 'true' : undefined}
    >
      {trail && roadLength > 1 ? (
        <>
          <path
            d={trail}
            fill="none"
            stroke={paint('sand-deep')}
            strokeWidth={34 * plan.scale}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.55}
          />
          <path
            d={trail}
            fill="none"
            stroke={paint('sand-shadow')}
            strokeWidth={26 * plan.scale}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {plan.pebbles.map((p) => (
        <Pebble key={p.n} n={p.n} x={p.x} y={p.y} />
      ))}
      {/* A stepped-out stone's leader: a dashed ink line from its true spot, which gets a dot. */}
      {plan.numbered.map((s) =>
        s.leader ? (
          <g key={`leader-${s.n}`} data-leader={s.n}>
            <path
              d={`M${s.leader.x} ${s.leader.y}L${s.x} ${s.y}`}
              stroke={paint('ink')}
              strokeWidth={3}
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
            <circle
              cx={s.leader.x}
              cy={s.leader.y}
              r={5}
              fill={paint('pebble')}
              stroke={paint('ink')}
              strokeWidth={2.5}
            />
          </g>
        ) : null,
      )}
      {plan.numbered.map((s) => (
        <g key={s.n} transform={`translate(${s.x} ${s.y}) scale(${plan.scale})`}>
          <RoadStoneMark n={s.n} state={s.state} />
        </g>
      ))}
    </g>
  );
}

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
