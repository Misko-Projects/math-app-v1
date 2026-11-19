import type { StimulusSpec } from '@number-island/shared';
import { pictureProps } from './a11y';
import './gauge.css';

/**
 * Measuring instruments (03 §5.1 `gauge` stimulus; mea.massvolume reads, MEA.17–18): a kitchen
 * scale with a dial, a beaker, or a thermometer. Every one reads exactly its `value`: ticks every
 * `ticksEvery` from `min` to `max`, a numeral every `labelsEvery` (every second, fifth … one when
 * they would crowd, so the pattern stays even), and the needle, water level or column at `value`.
 * Numerals are 34 px and the drawing never shrinks below 32 px numerals (05 §11).
 */

export type GaugeSpec = Extract<StimulusSpec, { kind: 'gauge' }>;

/** Unit symbols written on the instrument. */
export const GAUGE_UNIT: Record<GaugeSpec['unit'], string> = {
  g: 'g',
  kg: 'kg',
  L: 'L',
  degF: '°F',
  degC: '°C',
};

export const GAUGE_NUMERAL_PX = 34;
const NUMERAL_PX = GAUGE_NUMERAL_PX;
const numeralWidth = (s: string) => s.length * 20 + 6;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** The fraction of the way from min to max a value sits. */
export const gaugeFraction = (g: GaugeSpec, v: number): number =>
  clamp01((v - g.min) / (g.max - g.min || 1));

/** Values from `from` to `to` in steps of `step`, counted from `from` (integer steps, no drift). */
function stepsFrom(from: number, to: number, step: number): number[] {
  if (!(step > 0)) return [];
  const n = Math.floor((to - from) / step + 1e-9);
  return Array.from({ length: Math.min(n, 2000) + 1 }, (_, i) =>
    Number((from + i * step).toFixed(6)),
  );
}

/** Tick values: min, min + ticksEvery, … up to max (a gauge starts its scale at its min). */
export const gaugeTicks = (g: GaugeSpec): number[] => stepsFrom(g.min, g.max, g.ticksEvery);

const onStep = (v: number, from: number, step: number) =>
  Math.abs((v - from) / step - Math.round((v - from) / step)) < 1e-6;

/**
 * The labelled values: every labelsEvery from min, thinned by an even stride (1, 2, 5, 10 …) so
 * neighbouring numerals are at least `room` px apart when one label step spans `stepPx`.
 */
export function gaugeLabels(g: GaugeSpec, stepPx: number, room: number): number[] {
  if (!(g.labelsEvery > 0)) return [];
  const all = gaugeTicks({ ...g, ticksEvery: g.labelsEvery });
  const stride = [1, 2, 5, 10, 20, 50, 100].find((k) => stepPx * k >= room) ?? 100;
  return all.filter((v) => onStep(v, g.min, g.labelsEvery * stride));
}

// ---------- dial (kitchen scale) ----------

/** The dial sweeps 270°: min at the lower left, max at the lower right (clockwise). */
export const DIAL_START = 135;
export const DIAL_SWEEP = 270;
/** The needle's angle in degrees (0 = pointing right, clockwise, y down). */
export const dialAngle = (g: GaugeSpec, v: number): number =>
  DIAL_START + DIAL_SWEEP * gaugeFraction(g, v);

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

export const DIAL_SIZE = { w: 300, h: 330 } as const;

function Dial({ g }: { g: GaugeSpec }) {
  const { w: W, h: H } = DIAL_SIZE;
  const cx = W / 2;
  const cy = 190;
  const R = 118;
  const labelR = R - 50;
  const spanDeg = (g.labelsEvery / (g.max - g.min || 1)) * DIAL_SWEEP;
  const stepPx = ((spanDeg * Math.PI) / 180) * labelR;
  const widest = Math.max(...gaugeTicks(g).map((v) => numeralWidth(String(v))), 30);
  const labels = gaugeLabels(g, stepPx, widest + 8);
  const [nx, ny] = polar(cx, cy, R - 24, dialAngle(g, g.value));
  return (
    <svg
      className="ni-gauge__svg"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
    >
      {/* the pan */}
      <path className="ni-gauge__pan" d={`M${cx - 100} 28 Q${cx} 60 ${cx + 100} 28 Z`} />
      <rect className="ni-gauge__stem" x={cx - 12} y={40} width={24} height={24} rx={5} />
      {/* the body and the dial face */}
      <rect className="ni-gauge__body" x={14} y={60} width={W - 28} height={H - 70} rx={40} />
      <circle className="ni-gauge__face" cx={cx} cy={cy} r={R + 8} />
      {gaugeTicks(g).map((v) => {
        const a = dialAngle(g, v);
        const long = onStep(v, g.min, g.labelsEvery);
        const [x1, y1] = polar(cx, cy, R, a);
        const [x2, y2] = polar(cx, cy, R - (long ? 24 : 13), a);
        return (
          <line
            key={`t${v}`}
            className={long ? 'ni-gauge__tick ni-gauge__tick--major' : 'ni-gauge__tick'}
            data-tick={v}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
          />
        );
      })}
      {labels.map((v) => {
        const [x, y] = polar(cx, cy, labelR, dialAngle(g, v));
        return (
          <text
            key={`l${v}`}
            className="ni-gauge__numeral"
            data-label={v}
            x={x}
            y={y + NUMERAL_PX * 0.34}
            fontSize={NUMERAL_PX}
            textAnchor="middle"
          >
            {v}
          </text>
        );
      })}
      <text className="ni-gauge__unit" x={cx} y={cy + 76} fontSize={NUMERAL_PX} textAnchor="middle">
        {GAUGE_UNIT[g.unit]}
      </text>
      <line
        className="ni-gauge__needle"
        data-value={g.value}
        data-angle={dialAngle(g, g.value)}
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
      />
      <circle className="ni-gauge__hub" cx={cx} cy={cy} r={12} />
    </svg>
  );
}

// ---------- beaker and thermometer (vertical scales) ----------

/** y (px) of a value on a vertical scale from `bottom` (min) up to `top` (max). */
export const levelY = (g: GaugeSpec, v: number, top: number, bottom: number): number =>
  bottom - gaugeFraction(g, v) * (bottom - top);

function VerticalScale({
  g,
  top,
  bottom,
  x,
}: {
  g: GaugeSpec;
  top: number;
  bottom: number;
  /** x of the edge the ticks start from; ticks and numerals go right. */
  x: number;
}) {
  const stepPx = (g.labelsEvery / (g.max - g.min || 1)) * (bottom - top);
  const labels = gaugeLabels(g, stepPx, NUMERAL_PX + 4);
  return (
    <g>
      {gaugeTicks(g).map((v) => {
        const y = levelY(g, v, top, bottom);
        const long = onStep(v, g.min, g.labelsEvery);
        return (
          <line
            key={`t${v}`}
            className={long ? 'ni-gauge__tick ni-gauge__tick--major' : 'ni-gauge__tick'}
            data-tick={v}
            x1={x}
            x2={x + (long ? 28 : 16)}
            y1={y}
            y2={y}
          />
        );
      })}
      {labels.map((v) => (
        <text
          key={`l${v}`}
          className="ni-gauge__numeral"
          data-label={v}
          x={x + 38}
          y={levelY(g, v, top, bottom) + NUMERAL_PX * 0.34}
          fontSize={NUMERAL_PX}
          textAnchor="start"
        >
          {v}
        </text>
      ))}
    </g>
  );
}

/** The beaker drawing and its scale (px): min at `bottom`, max at `top`. */
export const BEAKER = { w: 280, h: 330, left: 60, right: 170, top: 50, bottom: 300 } as const;

function Beaker({ g }: { g: GaugeSpec }) {
  const { w: W, h: H, left, right, top, bottom } = BEAKER;
  const water = levelY(g, g.value, top, bottom);
  return (
    <svg
      className="ni-gauge__svg"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
    >
      <rect
        className="ni-gauge__water"
        data-value={g.value}
        data-level={water}
        x={left}
        y={water}
        width={right - left}
        height={bottom - water}
      />
      <line className="ni-gauge__surface" x1={left} x2={right} y1={water} y2={water} />
      {/* the glass: an open top with a spout on the left */}
      <path
        className="ni-gauge__glass"
        d={`M${left - 14} ${top - 28} Q${left} ${top - 26} ${left} ${top - 10} L${left} ${bottom - 12} Q${left} ${bottom + 2} ${left + 14} ${bottom + 2} L${right - 14} ${bottom + 2} Q${right} ${bottom + 2} ${right} ${bottom - 12} L${right} ${top - 24}`}
      />
      <VerticalScale g={g} top={top} bottom={bottom} x={right - 28} />
      <text
        className="ni-gauge__unit"
        x={(left + right) / 2 - 14}
        y={top - 4}
        fontSize={NUMERAL_PX}
        textAnchor="middle"
      >
        {GAUGE_UNIT[g.unit]}
      </text>
    </svg>
  );
}

/** The thermometer drawing and its scale (px). */
export const THERMOMETER = { w: 230, h: 340, cx: 70, top: 36, bottom: 258 } as const;

function Thermometer({ g }: { g: GaugeSpec }) {
  const { w: W, h: H, cx, top, bottom } = THERMOMETER;
  const level = levelY(g, g.value, top, bottom);
  return (
    <svg
      className="ni-gauge__svg"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
    >
      <rect
        className="ni-gauge__tube"
        x={cx - 17}
        y={top - 22}
        width={34}
        height={bottom - top + 50}
        rx={17}
      />
      <circle className="ni-gauge__tube" cx={cx} cy={bottom + 40} r={30} />
      <circle className="ni-gauge__column" cx={cx} cy={bottom + 40} r={21} />
      <rect
        className="ni-gauge__column"
        data-value={g.value}
        data-level={level}
        x={cx - 8}
        y={level}
        width={16}
        height={bottom + 26 - level}
      />
      <VerticalScale g={g} top={top} bottom={bottom} x={cx + 21} />
      <text
        className="ni-gauge__unit"
        x={cx + 100}
        y={H - 24}
        fontSize={NUMERAL_PX}
        textAnchor="middle"
      >
        {GAUGE_UNIT[g.unit]}
      </text>
    </svg>
  );
}

export const GAUGE_SIZE: Record<GaugeSpec['instrument'], { w: number; h: number }> = {
  scale: DIAL_SIZE,
  beaker: { w: BEAKER.w, h: BEAKER.h },
  thermometer: { w: THERMOMETER.w, h: THERMOMETER.h },
};

export interface GaugeViewProps {
  spec: GaugeSpec;
  /** Box the picture fits in (CSS px): it scales down to fit, never below 32 px numerals. */
  maxWidth?: number;
  maxHeight?: number;
  label?: string;
}

export function GaugeView({ spec, maxWidth = 400, maxHeight = 400, label }: GaugeViewProps) {
  const natural = GAUGE_SIZE[spec.instrument];
  const k = Math.max(32 / NUMERAL_PX, Math.min(1, maxWidth / natural.w, maxHeight / natural.h));
  return (
    <div
      className="ni-gauge"
      data-instrument={spec.instrument}
      style={{ width: natural.w * k, height: natural.h * k }}
      {...pictureProps(label)}
    >
      <div
        style={{
          transform: `scale(${k})`,
          transformOrigin: '0 0',
          width: natural.w,
          height: natural.h,
        }}
      >
        {spec.instrument === 'scale' ? (
          <Dial g={spec} />
        ) : spec.instrument === 'beaker' ? (
          <Beaker g={spec} />
        ) : (
          <Thermometer g={spec} />
        )}
      </div>
    </div>
  );
}
