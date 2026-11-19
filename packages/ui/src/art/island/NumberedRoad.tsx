import type { IslandDef } from '@number-island/shared';
import { useMemo } from 'react';
import { paint } from '../core/paint';
import { type StonePlacement, smoothPath } from './geometry';
import { RoadStoneMark } from './RoadStone';
import {
  beadRing,
  NEXT_HIT_RADIUS,
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
 * numbers always match the numbers missing, and signposts carry the numerals that matter there
 * (1, the tens and hundreds, the next stone and the one being counted) at the same size.
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
      {plan.numbered.map((s) => (
        <g key={s.n} transform={`translate(${s.x} ${s.y}) scale(${plan.scale})`}>
          <RoadStoneMark n={s.n} state={s.state} />
        </g>
      ))}
      {plan.beads.map((b) => (
        <Bead key={b.n} bead={b} />
      ))}
      {plan.signs.map((s) => (
        <Signpost key={`sign-${s.n}`} sign={s} />
      ))}
    </g>
  );
}

/**
 * One stone as a bead, where the road is crowded. States differ by shape and motion, not colour
 * alone (06 §7): laid is a solid little stone with a highlight; next is a light dashed bead;
 * planned is a dashed outline. Where there is room (`ringed`), the next bead also wears a dashed
 * ring that pulses and the counted bead is lifted inside a solid sunshine ring; on a very dense
 * stretch the counted bead is sunshine with a thicker outline, and its signpost (sunshine, with a
 * thick border) and the next one's (dashed border) carry the highlight. Every outline is ink
 * (≥ 3:1 on sand and grass).
 */
function Bead({ bead }: { bead: RoadBead }) {
  const { n, x, y, r, state, ringed } = bead;
  const planned = state === 'planned';
  const next = state === 'next';
  const counting = state === 'counting';
  const lift = counting && ringed ? -1.5 : 0;
  const line = r < 2 ? 1 : r < 5 ? 1.5 : 2;
  return (
    <g
      transform={`translate(${x} ${y})`}
      data-stone={n}
      data-state={state}
      data-bead={ringed ? 'ringed' : 'plain'}
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
      {counting && ringed ? (
        <circle
          cx={0}
          cy={0}
          r={beadRing(r).radius}
          fill={paint('sunshine-light')}
          stroke={paint('ink')}
          strokeWidth={2.5}
        />
      ) : null}
      {next && ringed ? (
        <circle
          className="motion-loop art-loop art-ring"
          cx={0}
          cy={0}
          r={beadRing(r).radius}
          fill="none"
          stroke={paint('ink')}
          strokeWidth={2.5}
          strokeDasharray="5 4"
        />
      ) : null}
      <circle
        cx={0}
        cy={lift}
        r={r}
        fill={paint(
          planned ? 'sand' : next ? 'pebble' : counting && !ringed ? 'sunshine' : 'pebble-deep',
        )}
        stroke={paint(planned ? 'ink-soft' : 'ink')}
        strokeWidth={counting && !ringed ? Math.min(2, line + 0.5) : line}
        strokeDasharray={
          planned || next ? `${Math.max(1, r * 0.6)} ${Math.max(0.8, r * 0.5)}` : undefined
        }
      />
      {/* A laid bead is a solid little stone: a darker body with a light highlight on top. */}
      {planned || next || r < 2.5 ? null : (
        <path
          d={`M${-r * 0.5} ${-r * 0.2 + lift}Q${-r * 0.35} ${-r * 0.6 + lift} ${r * 0.1} ${-r * 0.6 + lift}`}
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
 * A numbered signpost by its bead: an ink post from the bead to a plaque with the numeral, at the
 * same size as a numbered stone's. The counted stone's plaque is sunshine with a thick border; the
 * next stone's border is dashed (shape, not colour alone, 06 §7).
 */
function Signpost({ sign }: { sign: RoadSign }) {
  const { n, x, y, w, h, anchor, state, points } = sign;
  const counting = state === 'counting';
  const next = state === 'next';
  const end = points[points.length - 1] ?? { x, y };
  return (
    <g data-sign={n} data-state={state}>
      <path
        d={`M${anchor.x} ${anchor.y}L${end.x} ${end.y}`}
        stroke={paint('ink')}
        strokeWidth={3}
        strokeLinecap="round"
      />
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
