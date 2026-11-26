import type { ReactElement } from 'react';
import { stepsBetween } from './NumberLineView';
import './length.css';

/**
 * Things to measure, units to measure with, and a ruler (U05: compare-length, measure-length).
 * Everything is drawn to scale: an object `length` units long is exactly `length × unitPx` px
 * wide, from its first pixel to its last (round caps and leaves stay inside), and a unit of size
 * s (cube 1, shell 2, stick 4) is exactly `s × unitPx` px wide. Widgets place them at
 * `start × unitPx`, so ends line up exactly with ruler marks.
 */

const r2 = (x: number) => Math.round(x * 100) / 100;

export interface LengthObjectProps {
  /** Art-kit id: rope, ribbon, plank, log, vine (others draw as a plank). */
  sprite: string;
  /** Exact drawn width in px. */
  width: number;
  height?: number;
  className?: string;
}

/**
 * A stretchable object exactly `width` px long (decorative; the caller names it). Nothing along
 * it repeats (evidence review: a leaf per unit let a child count leaves
 * instead of laying units): its marks are at its ends or irregular, never periodic.
 */
export function LengthObject({ sprite, width, height = 40, className }: LengthObjectProps) {
  const w = Math.max(2, width);
  const h = height;
  let body: ReactElement;
  switch (sprite) {
    case 'rope': {
      // A smooth rope with a knot at each end: no repeating mark along it (evidence review: evenly
      // spaced twists read as a second scale). The knots lie inside the drawing, so its ends are
      // still exactly 0 and `width`.
      const t = h * 0.42;
      const y = h / 2;
      const k = Math.min(t * 0.62, w / 4);
      body = (
        <g data-art="rope">
          {/* A dark edge under the rope (≥ 3:1 against a pale lane; evidence review). */}
          <line className="ni-len__rope-edge" x1={k} x2={w - k} y1={y} y2={y} strokeWidth={t + 5} />
          <line className="ni-len__rope" x1={k} x2={w - k} y1={y} y2={y} strokeWidth={t} />
          {/* One unbroken sheen along the top: it reads as round cord, not as marks. */}
          <line
            className="ni-len__rope-sheen"
            x1={k * 1.6}
            x2={w - k * 1.6}
            y1={r2(y - t * 0.2)}
            y2={r2(y - t * 0.2)}
            strokeWidth={Math.max(2, t * 0.16)}
          />
          {[k, w - k].map((x) => (
            <circle
              key={x}
              className="ni-len__rope-knot"
              cx={r2(x)}
              cy={y}
              r={r2(k - 1.5)}
              strokeWidth={3}
            />
          ))}
        </g>
      );
      break;
    }
    case 'ribbon': {
      // A chunky band (94 % of the drawing's height; evidence review: it was a thin strip) with
      // forked ends and straight edges: nothing along it repeats (no scallops to count).
      const top = h * 0.03;
      const bot = h * 0.97;
      const notch = Math.min(Math.max(10, h * 0.25), w / 6);
      body = (
        <g data-art="ribbon">
          <path
            className="ni-len__ribbon"
            d={`M0 ${r2(top)} L${r2(w)} ${r2(top)} L${r2(w - notch)} ${r2(h / 2)} L${r2(w)} ${r2(bot)} L0 ${r2(bot)} L${r2(notch)} ${r2(h / 2)} Z`}
          />
          <line
            className="ni-len__ribbon-line"
            x1={notch + 4}
            x2={w - notch - 4}
            y1={h / 2}
            y2={h / 2}
          />
        </g>
      );
      break;
    }
    case 'log': {
      const top = h * 0.12;
      const lh = h * 0.76;
      const rx = Math.min(lh * 0.28, w / 4);
      body = (
        <g data-art="log">
          <rect
            className="ni-len__log"
            x={1.5}
            y={top}
            width={w - 3}
            height={lh}
            rx={Math.min(6, w / 4)}
          />
          <path
            className="ni-len__bark"
            d={`M${r2(w * 0.15)} ${r2(top + lh * 0.3)} h${r2(w * 0.25)} M${r2(w * 0.45)} ${r2(top + lh * 0.7)} h${r2(w * 0.3)}`}
          />
          <ellipse
            className="ni-len__log-end"
            cx={w - rx - 1.5}
            cy={top + lh / 2}
            rx={rx}
            ry={lh / 2 - 1.5}
          />
          <ellipse
            className="ni-len__log-ring"
            cx={w - rx - 1.5}
            cy={top + lh / 2}
            rx={rx * 0.5}
            ry={lh / 4}
          />
        </g>
      );
      break;
    }
    case 'vine': {
      // A stem with one pair of leaves at its root (the left end) and a curl at its tip: no
      // leaves along it (evidence review: one leaf per unit gave the count away).
      const y = h / 2;
      const x = Math.min(h * 0.5, w / 3);
      const curl = Math.min(h * 0.22, w / 6);
      body = (
        <g data-art="vine">
          <path
            className="ni-len__vine"
            d={`M2 ${y} L${r2(w - 2 - curl)} ${y} q${r2(curl)} 0 ${r2(curl)} ${r2(-curl)} q0 ${r2(-curl * 0.8)} ${r2(-curl * 0.8)} ${r2(-curl * 0.8)}`}
          />
          {[-1, 1].map((up) => (
            <path
              key={up}
              className="ni-len__leaf"
              d={`M${r2(x)} ${y} q${r2(-h * 0.32)} ${r2(up * h * 0.12)} ${r2(-h * 0.2)} ${r2(up * h * 0.4)} q${r2(h * 0.3)} ${r2(-up * h * 0.04)} ${r2(h * 0.2)} ${r2(-up * h * 0.4)} Z`}
            />
          ))}
        </g>
      );
      break;
    }
    default:
      body = (
        <g data-art="plank">
          <rect
            className="ni-len__plank"
            x={1.5}
            y={h * 0.2}
            width={w - 3}
            height={h * 0.6}
            rx={4}
          />
          <path
            className="ni-len__grain"
            d={`M${r2(w * 0.08)} ${r2(h * 0.42)} h${r2(w * 0.3)} M${r2(w * 0.5)} ${r2(h * 0.6)} h${r2(w * 0.35)}`}
          />
        </g>
      );
  }
  return (
    <svg
      className={['ni-len', className].filter(Boolean).join(' ')}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      focusable="false"
      data-length-px={w}
    >
      {body}
    </svg>
  );
}

export interface UnitPieceProps {
  /** cube, shell or stick (standard units draw as cubes). */
  unit: string;
  /** Exact drawn width in px (the unit's length). */
  width: number;
  className?: string;
}

/** A measuring unit exactly `width` px long: a cube block, a long shell, a stick. */
/** How tall a unit is drawn at width `w`: a cube is square, a shell half as tall as long. */
export function unitHeight(unit: string, w: number): number {
  if (unit === 'shell') return Math.max(16, w * 0.5);
  if (unit === 'stick') return Math.max(12, Math.min(22, w * 0.12));
  return w;
}

export function UnitPiece({ unit, width, className }: UnitPieceProps) {
  const w = Math.max(2, width);
  let h: number;
  let body: ReactElement;
  if (unit === 'shell') {
    h = unitHeight(unit, w);
    body = (
      <g data-art="shell">
        <path
          className="ni-len__shell"
          d={`M1.5 ${r2(h * 0.62)} C${r2(w * 0.12)} ${r2(h * 0.05)} ${r2(w * 0.88)} ${r2(h * 0.05)} ${r2(w - 1.5)} ${r2(h * 0.62)} C${r2(w * 0.7)} ${r2(h - 1.5)} ${r2(w * 0.3)} ${r2(h - 1.5)} 1.5 ${r2(h * 0.62)} Z`}
        />
        {[0.3, 0.5, 0.7].map((f) => (
          <path
            key={f}
            className="ni-len__shell-rib"
            d={`M${r2(w * f)} ${r2(h * 0.22)} L${r2(w * 0.5)} ${r2(h * 0.86)}`}
          />
        ))}
      </g>
    );
  } else if (unit === 'stick') {
    h = unitHeight(unit, w);
    body = (
      <g data-art="stick">
        <rect
          className="ni-len__stick"
          x={1.5}
          y={1.5}
          width={w - 3}
          height={h - 3}
          rx={(h - 3) / 2}
        />
        <path className="ni-len__grain" d={`M${r2(w * 0.15)} ${r2(h / 2)} h${r2(w * 0.25)}`} />
      </g>
    );
  } else {
    h = unitHeight(unit, w);
    body = (
      <g data-art="cube">
        <rect
          className="ni-len__cube"
          x={1.5}
          y={1.5}
          width={w - 3}
          height={h - 3}
          rx={Math.min(5, w / 6)}
        />
        <path
          className="ni-len__cube-shine"
          d={`M${r2(w * 0.25)} ${r2(h * 0.28)} h${r2(w * 0.3)}`}
        />
      </g>
    );
  }
  return (
    <svg
      className={['ni-unit', className].filter(Boolean).join(' ')}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      focusable="false"
      data-unit={unit}
      data-length-px={w}
    >
      {body}
    </svg>
  );
}

/**
 * Ruler numerals (evidence review): a Baloo 2 digit's ink is about 0.65 em tall, so 50 px draws
 * digits at least 32 px tall as seen, not only a 32 px font size. A digit is about 31 px wide.
 */
export const RULER_NUMERAL_PX = 50;
const DIGIT_W = 31;
/** The widest numeral on a ruler to `max`, with room either side (px). */
const numeralW = (max: number) => String(Math.ceil(max)).length * DIGIT_W + 12;

/**
 * The marks a ruler labels: every whole unit, thinned by an even stride (1, 2, 5, 10) when
 * numerals would touch at `unitPx` px per unit.
 */
export function rulerLabels(max: number, unitPx: number): number[] {
  const widest = numeralW(max);
  const stride = [1, 2, 5, 10, 20].find((k) => k * unitPx >= widest) ?? 20;
  return stepsBetween(0, max, 1).filter((v) => v % stride === 0);
}

/**
 * Every whole unit labelled when each neighbouring pair of numerals fits, measured pair by pair
 * (a "9" beside a "10" needs less room than two "10"s); otherwise `rulerLabels`. MEA.09's rulers
 * use it, so a 10 cm ruler keeps every numeral at 960 × 600.
 */
export function rulerLabelsEach(max: number, unitPx: number): number[] {
  const all = stepsBetween(0, max, 1);
  const fits = all.every((v, i) => i === 0 || (numeralW(v - 1) + numeralW(v)) / 2 <= unitPx);
  return fits ? all : rulerLabels(max, unitPx);
}

export interface RulerProps {
  /** The ruler runs from 0 to `max` units. */
  max: number;
  unitPx: number;
  /** Ticks every `precision` of a unit (1, 0.5, 0.25). */
  precision?: number;
  /** Unit symbol printed at the left end (cm, in…). */
  unitLabel?: string;
  /** Marks a value on the ruler (align-zero, read-end): an ink triangle under the mark. */
  marks?: number[];
  /**
   * Upside down (MEA.09's inch ruler above the object): the marks hang from the bottom edge,
   * towards the object, and the numerals sit above them.
   */
  flip?: boolean;
  /** The drawn width, when it must match another ruler's (default `rulerWidth`). */
  width?: number;
  /** The labelled marks (default `rulerLabels`). */
  labels?: readonly number[];
  /**
   * Shorter marks and the numerals closer to them, for two rulers in a short area (MEA.09 at
   * 960 × 600): 72 px tall (70 flipped) instead of 96, numerals still 50 px.
   */
  dense?: boolean;
  className?: string;
}

/**
 * A ruler at a fixed px per unit: 0 at x = 0 (the ruler's own left padding is `RULER_PAD`), long
 * ticks on whole units, shorter ones on halves, shortest on quarters, numerals ≥ 32 px.
 */
// 0 sits 30 px in: half a 50 px digit (about 16) plus at least 12 px of ruler left of the "0"
// (evidence review: it was 2 to 4 px from the edge).
export const RULER_PAD = 30;
const UNIT_PX = 26;
const UNIT_GAP = 12;
/** Half the width of the widest numeral at the end of a ruler. */
const numeralHalf = (max: number) => numeralW(max) / 2;
/** The numerals' baseline: their ink clears the marks (y 34 to 47) and sits in the body. */
const NUMERAL_BASELINE = 84;

/**
 * A ruler's drawn width. The unit symbol has its own slot after the end numeral (inside the
 * ruler body, past its last mark), so it never touches a numeral or a tick.
 */
export function rulerWidth(max: number, unitPx: number, unitLabel?: string): number {
  // The symbol ends 12+ px inside the body's right edge (evidence review: "cm" nearly touched it).
  const slot = unitLabel ? numeralHalf(max) + UNIT_GAP + unitLabel.length * 14 + 30 : 0;
  return max * unitPx + 2 * RULER_PAD + Math.max(0, slot - RULER_PAD);
}
export function Ruler({
  max,
  unitPx,
  precision = 1,
  unitLabel,
  marks = [],
  flip = false,
  width: fixedWidth,
  labels: fixedLabels,
  dense = false,
  className,
}: RulerProps) {
  const width = fixedWidth ?? rulerWidth(max, unitPx, unitLabel);
  // The digits end 8+ px above the bottom edge (baseline 84, ink about 1 px below it).
  const height = dense ? (flip ? 70 : 72) : 96;
  // Flipped, the marks hang from the bottom edge and the digits' ink (about 33 px) sits 8+ px
  // below the top edge, clear of the longest mark (40 px). Dense: 3+ px below the top edge and
  // 3+ px clear of the marks either way.
  const baseline = dense ? (flip ? 36 : 70) : flip ? 44 : NUMERAL_BASELINE;
  const tickY = (len: number) =>
    flip ? { y1: height - 2, y2: height - 2 - len } : { y1: 2, y2: 2 + len };
  const ticks = stepsBetween(0, max, precision);
  const labels = new Set(fixedLabels ?? rulerLabels(max, unitPx));
  // Tiers (evidence review: half-cm ticks drew as tall as whole ones): every fifth whole unit
  // longest, whole units long, halves shorter, quarters shortest. Steps are compared within a
  // rounding tolerance, never by exact float equality.
  const isMultiple = (v: number, of: number) => Math.abs(v / of - Math.round(v / of)) < 1e-6;
  const tier = (v: number) =>
    isMultiple(v, 5) && max >= 10
      ? 'five'
      : isMultiple(v, 1)
        ? 'whole'
        : isMultiple(v, 0.5)
          ? 'half'
          : 'quarter';
  const TICK = dense
    ? ({ five: 32, whole: 28, half: 16, quarter: 10 } as const)
    : ({ five: 40, whole: 30, half: 18, quarter: 11 } as const);
  const tickLen = (v: number) => TICK[tier(v)];
  return (
    <svg
      className={['ni-ruler', className].filter(Boolean).join(' ')}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className="ni-ruler__body"
        x={1.5}
        y={1.5}
        width={width - 3}
        height={height - 3}
        rx={8}
      />
      {ticks.map((v) => (
        <line
          key={v}
          className={`ni-ruler__tick ni-ruler__tick--${tier(v)}`}
          data-tick={v}
          x1={RULER_PAD + v * unitPx}
          x2={RULER_PAD + v * unitPx}
          {...tickY(tickLen(v))}
        />
      ))}
      {[...labels].map((v) => (
        <text
          key={v}
          className="ni-ruler__numeral"
          data-label={v}
          x={RULER_PAD + v * unitPx}
          y={baseline}
          fontSize={RULER_NUMERAL_PX}
          textAnchor="middle"
        >
          {v}
        </text>
      ))}
      {unitLabel ? (
        <text
          className="ni-ruler__unit"
          data-unit-label={unitLabel}
          x={RULER_PAD + max * unitPx + numeralHalf(max) + UNIT_GAP}
          y={baseline}
          fontSize={UNIT_PX}
          textAnchor="start"
        >
          {unitLabel}
        </text>
      ) : null}
      {marks.map((v) => (
        <path
          key={`m${v}`}
          className="ni-ruler__mark"
          data-mark={v}
          d={`M${RULER_PAD + v * unitPx} 34 l-9 13 h18 z`}
        />
      ))}
    </svg>
  );
}

/** A laid string's drawn height (px): a 6 px cord between two beads. */
export const STRING_H = 18;

/** A laid string (compare-length indirect): a cord exactly `width` px long. */
export function StringPiece({ width, className }: { width: number; className?: string }) {
  const w = Math.max(2, width);
  return (
    <svg
      className={['ni-string', className].filter(Boolean).join(' ')}
      width={w}
      height={STRING_H}
      viewBox={`0 0 ${w} ${STRING_H}`}
      aria-hidden="true"
      focusable="false"
      data-length-px={w}
    >
      {/* Exactly `w` long: the beads sit inside the ends. */}
      <line className="ni-string__cord" x1={3} x2={w - 3} y1={9} y2={9} />
      <circle className="ni-string__end" cx={7} cy={9} r={5.5} />
      <circle className="ni-string__end" cx={w - 7} cy={9} r={5.5} />
    </svg>
  );
}
