import { clockText, hourAngle, minuteAngle, onFace, timeOf } from '@number-island/engine';
import type { ReactNode } from 'react';
import { Shine } from '../../art/characters/parts';
import { paint } from '../../art/core/paint';
import { pictureProps } from './a11y';
import './clock.css';

/**
 * The clock (U05 #14), after the art kit's Clockfish face: a paper face, 60 minute ticks (every
 * fifth one long), the numbers 1–12, and two geared hands drawn from ONE time `t` (minutes after
 * 12:00), so they can never disagree: the minute hand at 6° a minute, the hour hand at 30° an hour
 * plus 0.5° a minute (at 3:30 exactly halfway between 3 and 4). The hands differ by length, width
 * and tip, not only colour (06 §7): the hour hand is short, thick and ink; the minute hand long,
 * thin and sea-deep.
 *
 * `ClockFace` is the SVG (widgets put controls over it); `ClockView` is the `clock` stimulus;
 * `DigitalClock` is the h:mm readout.
 */

/** Face geometry in the SVG's units (viewBox −100…100). */
export const CLOCK = {
  r: 94,
  tickOuter: 86,
  numeralR: 67,
  hourLen: 44,
  minuteLen: 76,
} as const;

/** A point at `r` units and `deg` degrees clockwise from 12. */
export function polarPoint(r: number, deg: number): { x: number; y: number } {
  const a = ((deg - 90) * Math.PI) / 180;
  return {
    x: Math.round(r * Math.cos(a) * 1000) / 1000,
    y: Math.round(r * Math.sin(a) * 1000) / 1000,
  };
}

/** How near a press must be to a hand to take hold of it, in face units (17 px at 288 px). */
export const HAND_GRAB = 12;

/** The distance from `(x, y)` to the hand drawn from the centre to `len` units at `deg`. */
function handDistance(x: number, y: number, len: number, deg: number): number {
  const tip = polarPoint(len, deg);
  const along = Math.max(0, Math.min(1, (x * tip.x + y * tip.y) / (len * len)));
  return Math.hypot(x - along * tip.x, y - along * tip.y);
}

/**
 * The hand a press on the face takes hold of, for a face showing `t`: `(x, y)` is the press in
 * face units from the centre (x right, y down). A press on a hand takes that hand wherever along
 * it the finger lands, so the long hand can be held near the middle and the short hand by its
 * tip. A press on neither hand, or where the two lie together (by the hub, or one over the
 * other), goes by where it is: near the middle the short hand, out by the numbers the long one.
 */
export function clockHandAt(x: number, y: number, t: number): 'hour' | 'minute' {
  const zone = Math.hypot(x, y) < CLOCK.hourLen * 1.15 ? 'hour' : 'minute';
  const toMinute = handDistance(x, y, CLOCK.minuteLen, minuteAngle(t));
  const toHour = handDistance(x, y, CLOCK.hourLen, hourAngle(t));
  if (Math.min(toMinute, toHour) > HAND_GRAB) return zone;
  if (Math.abs(toMinute - toHour) < HAND_GRAB / 3) return zone;
  return toMinute < toHour ? 'minute' : 'hour';
}

/** The face time for `{ h, m }`. */
export const faceTime = (h: number, m: number): number => onFace((h % 12) * 60 + m);

export interface ClockFaceProps {
  /** Minutes after 12:00 the hands show (any number; folded onto the face). */
  t: number;
  /** Draw the numbers 1–12 (03 §5.5 `numerals`). */
  numerals?: boolean;
  /** Diameter in CSS px. Numerals are ≥ 32 px from 276 px up. */
  size: number;
  /** A hand to light up (demo `highlight-hand`, `point-hour`, a selected hand). */
  highlight?: 'hour' | 'minute' | null;
  /** The five-minute marks counted so far (demo `count-fives`), in minutes from 12. */
  fives?: { from: number; to: number } | null;
  label?: string;
  className?: string;
  /** Drawn on top, in the face's units (−100…100). */
  children?: ReactNode;
}

function Hand({ kind, deg, lit }: { kind: 'hour' | 'minute'; deg: number; lit: boolean }) {
  const len = kind === 'hour' ? CLOCK.hourLen : CLOCK.minuteLen;
  const w = kind === 'hour' ? 10 : 5.5;
  const color = kind === 'hour' ? 'ink' : 'sea-deep';
  // The hour hand: a broad arrow that stops short of the numbers. The minute hand reaches the
  // minute ticks, as a real one does, but slims to a needle where it crosses the number it points
  // at (from r 50), so that number stays readable under it.
  const d =
    kind === 'hour'
      ? `M${-w / 2} 12L${-w / 2} ${-(len - 14)}L0 ${-len}L${w / 2} ${-(len - 14)}L${w / 2} 12Z`
      : `M${-w / 2} 12L${-w / 2} -48L-1.1 -55L-1.1 ${-(len - 6)}L0 ${-len}L1.1 ${-(len - 6)}L1.1 -55L${w / 2} -48L${w / 2} 12Z`;
  // The glow of a lit hand follows the hand's broad part only: on the long hand it stops before the
  // numbers (r 46), so the number the hand points at is never hidden under the glow.
  const halo = kind === 'hour' ? d : `M${-w / 2} 12L${-w / 2} -46L${w / 2} -46L${w / 2} 12Z`;
  return (
    <g
      className="ni-clock__hand"
      data-hand={kind}
      data-angle={deg.toFixed(2)}
      data-lit={lit ? 'true' : undefined}
      transform={`rotate(${deg})`}
    >
      {lit ? (
        <path
          d={halo}
          fill="none"
          stroke={paint('sunshine')}
          strokeWidth={12}
          strokeLinejoin="round"
        />
      ) : null}
      <path
        d={d}
        fill={paint(color)}
        stroke={paint(color)}
        strokeWidth={kind === 'hour' ? 2 : 1}
        strokeLinejoin="round"
        data-hand-shape={kind}
      />
    </g>
  );
}

export function ClockFace({
  t,
  numerals = true,
  size,
  highlight = null,
  fives = null,
  label,
  className,
  children,
}: ClockFaceProps) {
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const major = i % 5 === 0;
    const a = polarPoint(CLOCK.tickOuter - (major ? 11 : 6), i * 6);
    const b = polarPoint(CLOCK.tickOuter, i * 6);
    return { i, major, d: `M${a.x} ${a.y}L${b.x} ${b.y}` };
  });
  const { h, m } = timeOf(t);
  const counted =
    fives && fives.to > fives.from
      ? Array.from({ length: Math.floor(fives.to / 5) - Math.floor(fives.from / 5) }, (_, k) => {
          const minute = (Math.floor(fives.from / 5) + k + 1) * 5;
          return { minute, ...polarPoint(CLOCK.tickOuter + 4.5, minute * 6) };
        })
      : [];
  const sweep =
    fives && fives.to > fives.from
      ? (() => {
          const a = polarPoint(CLOCK.tickOuter - 2, fives.from * 6);
          const b = polarPoint(CLOCK.tickOuter - 2, fives.to * 6);
          const large = (fives.to - fives.from) * 6 > 180 ? 1 : 0;
          return `M0 0L${a.x} ${a.y}A${CLOCK.tickOuter - 2} ${CLOCK.tickOuter - 2} 0 ${large} 1 ${b.x} ${b.y}Z`;
        })()
      : null;
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: an img named by aria-label when labelled, else aria-hidden
    <svg
      className={['ni-clock', className].filter(Boolean).join(' ')}
      viewBox="-100 -100 200 206"
      width={size}
      height={(size * 206) / 200}
      data-time={clockText(h, m)}
      data-t={onFace(t)}
      {...pictureProps(label)}
      focusable="false"
    >
      <ellipse cx="3" cy="99" rx="78" ry="6" fill={paint('ink')} opacity={0.14} />
      <circle r={CLOCK.r + 4} fill={paint('sea-deep')} />
      <circle r={CLOCK.r} fill={paint('paper')} stroke={paint('sea-dark')} strokeWidth={3} />
      <circle
        r={CLOCK.r - 4}
        fill="none"
        stroke={paint('sand-deep')}
        strokeWidth={2}
        opacity={0.6}
      />
      {/* The glass shine sits on the face, UNDER the ticks, numbers and hands: drawn on top it
          paled the numbers it crosses (10 and 11). */}
      <Shine x={0} y={0} rx={CLOCK.r - 6} opacity={0.3} />
      {sweep ? <path d={sweep} className="ni-clock__sweep" /> : null}
      <g className="ni-clock__ticks">
        {ticks.map((k) => (
          <path
            key={k.i}
            d={k.d}
            data-tick={k.major ? 'five' : 'one'}
            stroke={paint(k.major ? 'ink' : 'ink-soft')}
            strokeWidth={k.major ? 3.2 : 1.6}
            strokeLinecap="round"
          />
        ))}
      </g>
      {numerals ? (
        <g className="ni-clock__numerals">
          {Array.from({ length: 12 }, (_, i) => {
            const n = i + 1;
            const p = polarPoint(CLOCK.numeralR, n * 30);
            return (
              <text key={n} x={p.x} y={p.y + 8} textAnchor="middle" data-numeral={n} fontSize={23}>
                {n}
              </text>
            );
          })}
        </g>
      ) : null}
      {counted.map((c) => (
        <circle
          key={c.minute}
          cx={c.x}
          cy={c.y}
          r={3.4}
          className="ni-clock__five"
          data-minute={c.minute}
        />
      ))}
      <Hand kind="hour" deg={hourAngle(t)} lit={highlight === 'hour'} />
      <Hand kind="minute" deg={minuteAngle(t)} lit={highlight === 'minute'} />
      <circle r={7} fill={paint('coral')} stroke={paint('ink')} strokeWidth={2} />
      {children}
    </svg>
  );
}

/** A digital readout: h:mm in big numerals on a dark screen. */
export function DigitalClock({
  h,
  m,
  label,
  className,
}: {
  h: number;
  m: number;
  label?: string;
  className?: string;
}) {
  const text = clockText(h, m);
  return (
    <span
      className={['ni-digital', className].filter(Boolean).join(' ')}
      data-time={text}
      {...pictureProps(label)}
    >
      <span className="ni-digital__screen" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}

/** The `clock` stimulus (03 §5.1): the face for `h:m`, and a digital readout beside it when asked. */
export function ClockView({
  h,
  m,
  numerals,
  digital,
  label,
  maxHeight = 300,
}: {
  h: number;
  m: number;
  numerals: boolean;
  digital?: boolean;
  label?: string;
  maxHeight?: number;
}) {
  // Never under 280 px: the numbers stay ≥ 32 px (23 face units at 280 px is 32.2 px).
  const size = numerals
    ? Math.max(280, Math.min(300, maxHeight - 16))
    : Math.max(200, Math.min(300, maxHeight - 16));
  return (
    <div className="ni-clockview" {...pictureProps(label)}>
      <ClockFace t={faceTime(h, m)} numerals={numerals} size={size} />
      {digital ? <DigitalClock h={timeOf(faceTime(h, m)).h} m={m} /> : null}
    </div>
  );
}
