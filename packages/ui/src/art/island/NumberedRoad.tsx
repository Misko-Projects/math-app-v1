import type { IslandDef } from '@number-island/shared';
import { useMemo } from 'react';
import { paint } from '../core/paint';
import { type StonePlacement, smoothPath } from './geometry';
import { RoadStoneMark, TenFlag } from './RoadStone';
import {
  beadLine,
  NEXT_HIT_RADIUS,
  type PlannedStone,
  planRoad,
  type RoadBead,
  type RoadPlan,
  type RoadSign,
  SIGN_NUMERAL,
} from './roadPlan';

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
  /** A plan already made with planRoad (the island scene shares one with its ground detail). */
  plan?: RoadPlan;
}

/**
 * The Numbered Road (05 §3), a linear board: a soft sandy trail through the stones in order, one
 * stone for every number, each at its own spot. Where the road has room, a stone is a numbered
 * stone. Where stones crowd (`planRoad`), each is an evenly spaced bead, so the beads between two
 * numbers always match the numbers missing, and signposts carry stone 1, the tens and the
 * hundreds at the same numeral size. The next and counted stones are always full numbered stones:
 * among beads they stand just beside the road on a stem from an ink pin at their own place.
 */
export function NumberedRoad({
  road,
  roadLength,
  counting = null,
  showNext = true,
  plannedAhead = 0,
  onLand,
  plan: given,
}: NumberedRoadProps) {
  const plan = useMemo(
    () => given ?? planRoad({ road, roadLength, counting, showNext, plannedAhead, onLand }),
    [given, road, roadLength, counting, showNext, plannedAhead, onLand],
  );
  if (plan.numbered.length === 0 && plan.beads.length === 0) return null;
  const trail = plan.trail.length > 1 ? smoothPath(plan.trail) : '';
  const outer = 34 * plan.scale;
  const inner = 26 * plan.scale;
  return (
    <g data-layer="road" data-road-length={roadLength}>
      {trail && roadLength > 1 ? (
        <>
          <path
            d={trail}
            fill="none"
            stroke={paint('sand-deep')}
            strokeWidth={outer}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.55}
          />
          <path
            d={trail}
            fill="none"
            stroke={paint('sand-shadow')}
            strokeWidth={inner}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {plan.beads.map((b) => (b.pin ? <Pin key={b.n} bead={b} /> : <Bead key={b.n} bead={b} />))}
      {plan.numbered.map((s) => (
        <Stone key={s.n} stone={s} scale={plan.scale} />
      ))}
      {plan.signs.map((s) => (
        <Signpost key={`sign-${s.n}`} sign={s} />
      ))}
    </g>
  );
}

/**
 * A numbered stone. One standing beside a crowded road (the next or counted stone among beads)
 * is joined to the pin at its own place by an ink stem.
 */
function Stone({ stone, scale }: { stone: PlannedStone; scale: number }) {
  const { n, x, y, state, callout } = stone;
  const start = callout?.points[0];
  const end = callout?.points[callout.points.length - 1];
  return (
    <g data-callout={callout ? n : undefined}>
      {callout && start && end ? (
        <path
          d={`M${start.x} ${start.y}L${end.x} ${end.y}`}
          stroke={paint('ink')}
          strokeWidth={callout.width}
          strokeLinecap="butt"
        />
      ) : null}
      <g transform={`translate(${x} ${y}) scale(${scale})`}>
        <RoadStoneMark n={n} state={state} />
      </g>
    </g>
  );
}

/**
 * One stone as a bead, where the road is crowded. States differ by shape, not colour alone
 * (06 §7): laid is a solid little stone with a highlight; planned is a dashed outline. (The next
 * and counted stones are never beads: they stand beside the road as full stones, see Stone.)
 * Every outline is ink (≥ 3:1 on sand and grass).
 */
function Bead({ bead }: { bead: RoadBead }) {
  const { n, x, y, r, state } = bead;
  const planned = state === 'planned';
  const line = beadLine(r);
  return (
    <g
      transform={`translate(${x} ${y})`}
      data-stone={n}
      data-state={state}
      data-bead="true"
      data-ten={n % 10 === 0 ? 'true' : undefined}
    >
      {planned ? null : (
        <ellipse
          cx={0}
          cy={r * 0.7}
          rx={r * 1.05}
          ry={r * 0.4}
          fill={paint('ink')}
          opacity={0.15}
        />
      )}
      <circle
        cx={0}
        cy={0}
        r={r}
        fill={paint(planned ? 'sand' : 'pebble-deep')}
        stroke={paint(planned ? 'ink-soft' : 'ink')}
        strokeWidth={line}
        strokeDasharray={planned ? `${Math.max(1, r * 0.6)} ${Math.max(0.8, r * 0.5)}` : undefined}
      />
      {/* A laid bead is a solid little stone: a darker body with a light highlight on top. */}
      {planned || r < 2.5 ? null : (
        <path
          d={`M${-r * 0.5} ${-r * 0.2}Q${-r * 0.35} ${-r * 0.6} ${r * 0.1} ${-r * 0.6}`}
          fill="none"
          stroke={paint('pebble')}
          strokeWidth={Math.min(2, r * 0.3)}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

/**
 * The pin at the next or counted stone's own place on a crowded road, where its stem starts: a
 * solid ink dot the size of a bead, so the count along the road stays true.
 */
function Pin({ bead }: { bead: RoadBead }) {
  return (
    <circle
      data-spot={bead.n}
      data-state={bead.state}
      cx={bead.x}
      cy={bead.y}
      r={bead.r}
      fill={paint('ink')}
    />
  );
}

/**
 * A numbered signpost by its bead (stone 1, a ten or a hundred among beads): an ink post from the
 * bead to a plaque with the numeral, at the same size as a numbered stone's.
 */
function Signpost({ sign }: { sign: RoadSign }) {
  const { n, x, y, w, h, anchor, state, points, postWidth } = sign;
  const counting = state === 'counting';
  const next = state === 'next';
  // The post runs from its bead's edge to the plaque, as wide as the road's density allows.
  const start = points[0] ?? anchor;
  const end = points[points.length - 1] ?? { x, y };
  return (
    <g data-sign={n} data-state={state}>
      <path
        d={`M${start.x} ${start.y}L${end.x} ${end.y}`}
        stroke={paint('ink')}
        strokeWidth={postWidth}
        strokeLinecap="butt"
      />
      {/* A ten flies the stone's leaf flag, a hundred its coral flag with a dot (as on the stones),
          its pole tucked behind the plaque's top right corner. */}
      {n % 10 === 0 ? (
        <TenFlag x={x + w / 2 - 8} y={y - h / 2 + 2} hundred={n % 100 === 0} />
      ) : null}
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={10}
        fill={paint(counting ? 'sunshine-light' : 'cloud')}
        stroke={paint('ink')}
        strokeWidth={counting ? 4 : 2.5}
        strokeDasharray={next ? '7 5' : undefined}
      />
      <text
        x={x}
        y={y + SIGN_NUMERAL * 0.36}
        textAnchor="middle"
        fontSize={SIGN_NUMERAL}
        fontWeight={800}
        fill={paint('ink')}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {n}
      </text>
    </g>
  );
}

/**
 * The next stone's tap target: an invisible disc at least 80 CSS px across however large the map
 * is drawn (06 §4; `radius` from nextHitRadius), drawn above everything that stands on the
 * island, so a building beside the road never takes the tap. Art stays presentational: the map
 * screen listens for pointer events on the scene and treats a target with `data-hit="next"` as
 * the next stone, next to its own accessible control.
 */
export function NextStoneHit({
  plan,
  radius = NEXT_HIT_RADIUS,
}: {
  plan: RoadPlan;
  radius?: number;
}) {
  if (!plan.next) return null;
  return (
    <circle
      data-hit="next"
      cx={plan.next.x}
      cy={plan.next.y}
      r={radius}
      fill="transparent"
      pointerEvents="all"
    />
  );
}
