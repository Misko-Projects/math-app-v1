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

/** Design-size metrics of a stone for a number (wider for more digits; bigger every ten). */
export function stoneMetrics(n: number) {
  const digits = String(Math.max(0, Math.floor(n))).length;
  const ten = n > 0 && n % 10 === 0;
  const scale = ten ? 1.16 : 1;
  const w = (52 + Math.max(0, digits - 1) * 20) * scale;
  const h = 40 * scale;
  const font = (digits <= 2 ? 27 : digits === 3 ? 25 : 23) * scale;
  return { w, h, font, ten, hundred: n > 0 && n % 100 === 0 };
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
  const lifted = state === 'counting' ? -7 : 0;
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
          rx={rx + 10}
          ry={ry + 9}
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
              rx={rx + 9}
              ry={ry + 8}
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
          {/* Top-left, so it never meets the ten flag on the top-right. */}
          {state === 'counting' ? <Sparkle x={-rx - 2} y={-ry - 6} /> : null}
        </g>
      </g>
    </g>
  );
}

/** The little flag on every tenth stone (counting by tens has a landmark you can see). */
function TenFlag({ x, y, hundred }: { x: number; y: number; hundred: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} data-part="ten-flag">
      {/* Ink pole and dark outlines keep the flag ≥ 3:1 on sand and grass (06 §7). */}
      <path d="M0 4V-30" stroke={paint('ink')} strokeWidth={3} strokeLinecap="round" />
      <path
        className="motion-loop art-loop"
        style={{ animation: 'var(--animate-flutter)', transformOrigin: '0 0' }}
        d={hundred ? 'M1 -30l22 6l-22 7z' : 'M1 -30l18 5l-18 6z'}
        fill={paint(hundred ? 'coral' : 'leaf')}
        stroke={paint('ink')}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {hundred ? (
        <circle
          cx={9}
          cy={-23.5}
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

/**
 * One numbered stepping stone as a standalone piece, for the Road Crew workshop, recipe cards and
 * the gallery. At its default 112 px width the numeral is ≥ 32 px (05 §11).
 */
export function RoadStone({
  n,
  state = 'laid',
  size = 112,
  title,
  lighting,
  ...rest
}: RoadStoneProps) {
  const m = stoneMetrics(n);
  const padX = 14;
  const padTop = m.ten ? 44 : 22;
  const w = m.w + 2 * padX + (m.ten ? 14 : 0);
  const h = m.h + padTop + 22;
  const scaledSize = typeof size === 'number' ? (size * w) / (52 + 2 * padX) : size;
  return (
    <ArtSvg
      width={w}
      height={h}
      originX={-w / 2}
      originY={-m.h / 2 - padTop}
      size={scaledSize}
      title={title}
      lighting={lighting}
      {...rest}
    >
      <RoadStoneMark n={n} state={state} />
    </ArtSvg>
  );
}
