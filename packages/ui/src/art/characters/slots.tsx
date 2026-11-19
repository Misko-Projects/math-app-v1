import type { PaletteColor } from '../../tokens/tokens';
import { OUTLINE_OF, paint } from '../core/paint';
import { Shine } from './parts';
import {
  COIN_LOOK,
  type CoinValue,
  clockHour,
  fractionParts,
  type PaletteFills,
  PEBBLE_MARK,
} from './pebbling';

/**
 * What the family Pebblings carry instead of a ten-frame (05 §5), each drawn centred on (0, 0):
 * the Half-Crab's fraction shell, the Clockfish's face and the Coin Clam's coin. As with pebbles,
 * filled and empty differ by shape and outline, never by colour alone (06 §7).
 */

function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [
    Math.round(r * Math.cos(a) * 100) / 100,
    Math.round(r * Math.sin(a) * 100) / 100,
  ] as const;
}

/** The Half-Crab's round shell: `parts` equal wedges from 12 o'clock, `filled` of them filled. */
export function FractionShell({
  value,
  c,
  r = 50,
}: {
  value: number;
  c: PaletteFills;
  r?: number;
}) {
  const { parts, filled } = fractionParts(value);
  const step = 360 / parts;
  return (
    <g data-part="fraction" data-parts={parts} data-filled={filled}>
      <circle r={r} fill={paint(c.belly)} stroke={paint(c.deep)} strokeWidth={3} />
      {Array.from({ length: parts }, (_, i) => {
        const [x0, y0] = polar(r - 5, i * step);
        const [x1, y1] = polar(r - 5, (i + 1) * step);
        const large = step > 180 ? 1 : 0;
        const lit = i < filled;
        return (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: wedges are positional
            key={i}
            data-fraction={lit ? 'filled' : 'empty'}
            d={`M0 0L${x0} ${y0}A${r - 5} ${r - 5} 0 ${large} 1 ${x1} ${y1}Z`}
            fill={lit ? paint(PEBBLE_MARK.lit) : 'none'}
            stroke={paint(lit ? PEBBLE_MARK.litEdge : PEBBLE_MARK.empty)}
            strokeWidth={lit ? 2 : 2.5}
            strokeLinejoin="round"
            strokeDasharray={lit ? undefined : '6 5'}
          />
        );
      })}
      {/* Two-tone spokes between every part: a dark line that shows on the light shell bed, with a
          light core that shows between two filled (dark) parts, so the equal parts always read. */}
      {Array.from({ length: parts }, (_, i) => {
        const [x, y] = polar(r - 5, i * step);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: spokes are positional
          <g key={`s${i}`} data-part="spoke">
            <path
              d={`M0 0L${x} ${y}`}
              stroke={paint(PEBBLE_MARK.empty)}
              strokeWidth={4.5}
              strokeLinecap="round"
            />
            <path
              d={`M0 0L${x} ${y}`}
              stroke={paint(PEBBLE_MARK.spokeCore)}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </g>
        );
      })}
      <circle r={4} fill={paint(PEBBLE_MARK.empty)} />
      <Shine x={0} y={0} rx={r - 6} opacity={0.3} />
    </g>
  );
}

/** The Clockfish's face: 12 ticks, a short thick hour hand at `hour` and the long minute hand at 12. */
export function ClockFace({ hour, r = 50 }: { hour: number; r?: number }) {
  const h = clockHour(hour);
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const major = i % 3 === 0;
    const [x0, y0] = polar(r - (major ? 13 : 10), i * 30);
    const [x1, y1] = polar(r - 6, i * 30);
    return { d: `M${x0} ${y0}L${x1} ${y1}`, major, i };
  });
  const [hx, hy] = polar(r * 0.5, h * 30);
  const [mx, my] = polar(r * 0.76, 0);
  return (
    <g data-part="clock" data-hour={h}>
      <circle r={r} fill={paint('paper')} stroke={paint('ink-soft')} strokeWidth={3.5} />
      <circle r={r - 3.5} fill="none" stroke={paint('sand-deep')} strokeWidth={2} opacity={0.6} />
      {ticks.map((t) => (
        <path
          key={t.i}
          d={t.d}
          stroke={paint(t.major ? 'ink' : 'ink-soft')}
          strokeWidth={t.major ? 4 : 2.5}
          strokeLinecap="round"
        />
      ))}
      <path
        data-hand="minute"
        d={`M0 0L${mx} ${my}`}
        stroke={paint('ink')}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path
        data-hand="hour"
        d={`M0 0L${hx} ${hy}`}
        stroke={paint('ink')}
        strokeWidth={7.5}
        strokeLinecap="round"
      />
      <circle r={5} fill={paint('coral')} stroke={paint('ink')} strokeWidth={2} />
      <Shine x={0} y={0} rx={r - 4} opacity={0.35} />
    </g>
  );
}

/**
 * A coin. Its value shows by size (the dime is the smallest, the quarter the largest), metal and rim:
 * reeded (ridged) for 10 and 25, smooth for 1 and 5. `showValue` adds the value as an ink numeral
 * on the light face (≥ 4.5:1, contrast.ts).
 */
export function Coin({ value, showValue = false }: { value: CoinValue; showValue?: boolean }) {
  const look = COIN_LOOK[value];
  const { r, face } = look;
  const edge: PaletteColor = OUTLINE_OF[face];
  const ridgeCount = Math.round(r * 1.1);
  const ridges =
    look.rim === 'reeded'
      ? Array.from({ length: ridgeCount }, (_, i) => {
          const deg = (i / ridgeCount) * 360;
          const [x0, y0] = polar(r - 1.5, deg);
          const [x1, y1] = polar(r - 6.5, deg);
          return `M${x0} ${y0}L${x1} ${y1}`;
        }).join('')
      : null;
  return (
    <g data-part="coin" data-value={value} data-rim={look.rim}>
      <ellipse cx={2} cy={r + 4} rx={r * 0.9} ry={5} fill={paint('ink')} opacity={0.16} />
      <circle r={r} fill={paint(face)} stroke={paint(edge)} strokeWidth={3} />
      {ridges ? (
        <path d={ridges} stroke={paint('ink-soft')} strokeWidth={1.8} strokeLinecap="round" />
      ) : (
        <circle r={r - 5} fill="none" stroke={paint('ink-soft')} strokeWidth={2.5} />
      )}
      <circle r={r - 9} fill="none" stroke={paint(edge)} strokeWidth={1.8} opacity={0.7} />
      {showValue ? (
        <text
          y={r * 0.3}
          textAnchor="middle"
          fontSize={value >= 10 ? r * 0.82 : r * 0.92}
          fontWeight={800}
          fill={paint('ink')}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {value}
        </text>
      ) : (
        <CoinEmblem value={value} r={r} edge={edge} />
      )}
      <Shine x={0} y={0} rx={r} opacity={0.5} />
    </g>
  );
}

/** A small picture on the coin face (no words): a shell, a star, a wave or a sun. */
function CoinEmblem({ value, r, edge }: { value: CoinValue; r: number; edge: PaletteColor }) {
  const k = r / 34;
  const stroke = {
    fill: 'none',
    stroke: paint(edge),
    strokeWidth: 2.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (value) {
    case 1:
      return (
        <path
          d={`M${-10 * k} ${6 * k}Q0 ${-16 * k} ${10 * k} ${6 * k}Z M0 ${6 * k}V${-6 * k}M${-5 * k} ${5 * k}L${-2 * k} ${-4 * k}M${5 * k} ${5 * k}L${2 * k} ${-4 * k}`}
          {...stroke}
        />
      );
    case 5:
      return (
        <path
          d={`M${-12 * k} ${2 * k}Q${-6 * k} ${-6 * k} 0 ${2 * k}T${12 * k} ${2 * k}`}
          {...stroke}
        />
      );
    case 10:
      return (
        <path
          d={`M0 ${-11 * k}L${3 * k} ${-3 * k}L${11 * k} ${-3 * k}L${4.5 * k} ${2 * k}L${7 * k} ${10 * k}L0 ${5 * k}L${-7 * k} ${10 * k}L${-4.5 * k} ${2 * k}L${-11 * k} ${-3 * k}L${-3 * k} ${-3 * k}Z`}
          {...stroke}
        />
      );
    default:
      return (
        <g {...stroke}>
          <circle r={7 * k} />
          <path
            d={`M0 ${-12 * k}V${-15 * k}M0 ${12 * k}V${15 * k}M${-12 * k} 0H${-15 * k}M${12 * k} 0H${15 * k}`}
          />
        </g>
      );
  }
}
