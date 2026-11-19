import type { ArtProps } from '../core/ArtSvg';
import { ArtSvg } from '../core/ArtSvg';
import { paint } from '../core/paint';
import { ContactShadow } from '../core/Shading';

/**
 * A numbered stepping stone's state (05 §3, §4 W1). Each state differs by shape and motion, never
 * by colour alone (06 §7):
 * - `laid`: a solid stone with its number, highlight and contact shadow.
 * - `next`: the stone the child is about to lay; a dashed outline with a pulsing ring and a hop.
 * - `counting`: the stone being counted aloud right now; lifted, with a solid ring and a sparkle.
 * - `planned`: not built yet; a flat dashed outline with a softer number and no shadow.
 */
export type RoadStoneState = 'laid' | 'next' | 'counting' | 'planned';

export const ROAD_STONE_STATES: readonly RoadStoneState[] = ['laid', 'next', 'counting', 'planned'];

/** A stone's numeral size at design size: the same for every number, 1 to 1000. */
export const STONE_NUMERAL = 27;

/**
 * Design-size metrics of a stone for a number: wider for more digits and bigger every ten, while
 * the numeral stays one size (05 §11: readable and consistent; a long number widens its stone,
 * never shrinks its text).
 */
export function stoneMetrics(n: number) {
  const digits = String(Math.max(0, Math.floor(n))).length;
  const ten = n > 0 && n % 10 === 0;
  const scale = ten ? 1.16 : 1;
  const w = (52 + Math.max(0, digits - 1) * 20) * scale;
  const h = 40 * scale;
  const font = STONE_NUMERAL;
  return { w, h, font, ten, hundred: n > 0 && n % 100 === 0 };
}

/** Next-stone ring: its radii beyond the stone, and how far its pulse scales it. */
const NEXT_RING = { dx: 10, dy: 9, pulse: 1.05 } as const;
/** Counting ring radii beyond the stone, and the counted stone's lift. */
const COUNT_RING = { dx: 9, dy: 8, lift: 5 } as const;
/** How far the counted stone is lifted above its place (design units). */
export const COUNTED_LIFT = COUNT_RING.lift;
/** Ten-flag pole height above the stone's top. */
const FLAG_POLE = 14;
/** The counting sparkle's centre, relative to the stone's left edge and top. */
const SPARKLE_DX = -6;
const SPARKLE_DY = 3;

export interface StoneExtent {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Everything a stone draws, relative to its centre at design size: the stone, its contact shadow,
 * the next-stone ring at the peak of its pulse, the counting ring, lift and sparkle, and the
 * ten-flag. The road uses it so that no two numbered stones ever touch (05 §3).
 */
export function stoneExtent(n: number, state: RoadStoneState): StoneExtent {
  const m = stoneMetrics(n);
  const rx = m.w / 2;
  const ry = m.h / 2;
  let left = -rx - 2;
  let right = rx + 2;
  let top = -ry - 2;
  let bottom = ry + 12; // contact shadow
  if (state === 'next') {
    const ex = (rx + NEXT_RING.dx) * NEXT_RING.pulse + 2;
    const ey = (ry + NEXT_RING.dy) * NEXT_RING.pulse + 2;
    left = Math.min(left, -ex);
    right = Math.max(right, ex);
    top = Math.min(top, 2 - ey - 5); // the stone hops 5 inside its ring
    bottom = Math.max(bottom, 2 + ey);
  }
  const lift = state === 'counting' ? COUNT_RING.lift : 0;
  if (state === 'counting') {
    // The ring, and the sparkle on the left side (within the ring's height).
    left = Math.min(left, -rx - COUNT_RING.dx - 2, -rx + SPARKLE_DX - 12);
    right = Math.max(right, rx + COUNT_RING.dx + 2);
    top = Math.min(top, -lift - ry - COUNT_RING.dy - 2);
    bottom = Math.max(bottom, -lift + ry + COUNT_RING.dy + 3);
  }
  if (m.ten) {
    // The hundred flag's tip reaches 21 past the pole, plus half its 2.5 outline.
    right = Math.max(right, rx - 6 + 21 + 1.5);
    top = Math.min(top, -lift - ry + 2 - FLAG_POLE - 2);
  }
  return { left, right, top, bottom };
}

export interface RoadStoneMarkProps {
  n: number;
  state?: RoadStoneState;
  /** Centre of the stone's top face. */
  x?: number;
  y?: number;
}

/** A stone drawn in scene units, centred on (x, y): used by the road and by RoadStone. */
export function RoadStoneMark({ n, state = 'laid', x = 0, y = 0 }: RoadStoneMarkProps) {
  const m = stoneMetrics(n);
  const rx = m.w / 2;
  const ry = m.h / 2;
  const planned = state === 'planned';
  const lifted = state === 'counting' ? -COUNT_RING.lift : 0;
  // A slightly irregular pebble: a rounded blob around an ellipse (no two stones look stamped).
  const wobble = ((n * 37) % 7) - 3;
  const top = `M${-rx} ${0}C${-rx} ${-ry - 2 + wobble * 0.3} ${-rx * 0.35} ${-ry - 1} ${0} ${-ry}C${rx * 0.45} ${-ry + 1} ${rx} ${-ry * 0.8 - wobble * 0.3} ${rx} ${0}C${rx} ${ry * 0.85} ${rx * 0.4} ${ry + 1} ${0} ${ry}C${-rx * 0.45} ${ry} ${-rx} ${ry * 0.8} ${-rx} ${0}Z`;
  return (
    <g
      transform={`translate(${x} ${y})`}
      data-stone={n}
      data-state={state}
      data-ten={m.ten ? 'true' : undefined}
    >
      {planned ? null : <ContactShadow cx={0} cy={ry + 6} rx={rx * 0.95} ry={6} />}
      {state === 'next' ? (
        <ellipse
          className="motion-loop art-loop art-ring"
          cx={0}
          cy={2}
          rx={rx + NEXT_RING.dx}
          ry={ry + NEXT_RING.dy}
          fill="none"
          stroke={paint('ink')}
          strokeWidth={4}
          strokeDasharray="10 8"
          strokeLinecap="round"
        />
      ) : null}
      <g className={state === 'next' ? 'motion-loop art-loop art-hop' : undefined}>
        <g transform={`translate(0 ${lifted})`}>
          {state === 'counting' ? (
            <ellipse
              cx={0}
              cy={1}
              rx={rx + COUNT_RING.dx}
              ry={ry + COUNT_RING.dy}
              fill={paint('sunshine-light')}
              stroke={paint('ink')}
              strokeWidth={4}
            />
          ) : null}
          {planned ? null : (
            <path
              d={top}
              transform="translate(0 6)"
              fill={paint('pebble-deep')}
              stroke={paint('ink-soft')}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
          )}
          <path
            d={top}
            fill={paint('pebble')}
            stroke={planned ? paint('ink-soft') : paint('pebble-deep')}
            strokeWidth={planned ? 2.5 : 3}
            strokeDasharray={planned || state === 'next' ? '7 6' : undefined}
            strokeLinejoin="round"
            opacity={planned ? 0.92 : 1}
          />
          {planned ? null : (
            <path
              d={`M${-rx * 0.62} ${-ry * 0.32}Q${-rx * 0.45} ${-ry * 0.78} ${-rx * 0.05} ${-ry * 0.78}`}
              fill="none"
              stroke={paint('cloud')}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.7}
            />
          )}
          <text
            x={0}
            y={m.font * 0.36}
            textAnchor="middle"
            fontSize={m.font}
            fontWeight={800}
            fill={paint(planned ? 'ink-soft' : 'ink')}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {n}
          </text>
          {m.ten ? <TenFlag x={rx - 6} y={-ry + 2} hundred={m.hundred} /> : null}
          {/* On the left side, inside the ring's height: clear of the ten flag (top-right) and of
              the stone in the row above. */}
          {state === 'counting' ? <Sparkle x={-rx + SPARKLE_DX} y={-ry + SPARKLE_DY} /> : null}
        </g>
      </g>
    </g>
  );
}

/**
 * The little flag on every tenth stone (counting by tens has a landmark you can see): leaf green,
 * or coral with a white dot on a hundred. Signposts on a crowded road fly the same flag.
 */
export function TenFlag({ x, y, hundred }: { x: number; y: number; hundred: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} data-part="ten-flag">
      {/* Ink pole and dark outlines keep the flag ≥ 3:1 on sand and grass (06 §7). */}
      <path d={`M0 4V-${FLAG_POLE}`} stroke={paint('ink')} strokeWidth={3} strokeLinecap="round" />
      <path
        className="motion-loop art-loop"
        style={{ animation: 'var(--animate-flutter)', transformOrigin: '0 0' }}
        d={hundred ? `M1 -${FLAG_POLE}l20 6l-20 7z` : `M1 -${FLAG_POLE}l17 5l-17 6z`}
        fill={paint(hundred ? 'coral' : 'leaf')}
        stroke={paint('ink')}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {hundred ? (
        <circle
          cx={8.5}
          cy={-FLAG_POLE + 6.5}
          r={2.8}
          fill={paint('cloud')}
          stroke={paint('ink')}
          strokeWidth={1.5}
        />
      ) : null}
    </g>
  );
}

function Sparkle({ x, y }: { x: number; y: number }) {
  return (
    <path
      className="motion-loop art-loop"
      style={{ animation: 'var(--animate-pulse-soft)' }}
      d={`M${x} ${y - 10}l3 7l7 3l-7 3l-3 7l-3 -7l-7 -3l7 -3z`}
      fill={paint('sunshine')}
      stroke={paint('ink')}
      strokeWidth={2}
      strokeLinejoin="round"
    />
  );
}

export interface RoadStoneProps extends ArtProps {
  n: number;
  state?: RoadStoneState;
}

/** Standalone stones render at this many CSS px per design unit unless `size` is given. */
export const ROAD_STONE_SCALE = 1.4;

/** The standalone stone's viewBox: everything any state draws, so a state change never jumps. */
export function roadStoneBox(n: number) {
  const all = ROAD_STONE_STATES.map((s) => stoneExtent(n, s));
  const left = Math.min(...all.map((e) => e.left));
  const right = Math.max(...all.map((e) => e.right));
  const top = Math.min(...all.map((e) => e.top));
  const bottom = Math.max(...all.map((e) => e.bottom));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * One numbered stepping stone as a standalone piece, for the Road Crew workshop, recipe cards and
 * the gallery. `size` is the rendered width (ArtProps). Without it the stone renders at
 * ROAD_STONE_SCALE, where every numeral, 1 to 1000, is ≥ 32 px (05 §11), and wider numbers make a
 * wider stone.
 */
export function RoadStone({ n, state = 'laid', size, title, lighting, ...rest }: RoadStoneProps) {
  const box = roadStoneBox(n);
  return (
    <ArtSvg
      width={box.w}
      height={box.h}
      originX={box.x}
      originY={box.y}
      size={size ?? Math.round(box.w * ROAD_STONE_SCALE)}
      title={title}
      lighting={lighting}
      {...rest}
    >
      <RoadStoneMark n={n} state={state} />
    </ArtSvg>
  );
}
