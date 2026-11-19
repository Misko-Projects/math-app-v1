import { type ReactNode, useId } from 'react';
import { pictureProps } from './a11y';
import './kit.css';

/**
 * A number line (03 §5.1 `number-line` stimulus): ticks, numerals (≥ 32 px, 05 §11), marks and
 * jump arcs. Drawn at a fixed pixel width so numerals never shrink below their size. Widgets that
 * place or hop on the line (number-line-place, number-line-jump) draw on top through `children`,
 * which receives the value → x mapping.
 */

export interface NumberLineScale {
  min: number;
  max: number;
  width: number;
  /** Left/right padding in px (room for the end numerals). */
  pad: number;
  /** x (px) of a value. */
  x: (value: number) => number;
  /** The value at an x (px), unclamped. */
  value: (x: number) => number;
  /** y (px) of the line itself inside the SVG (set by NumberLineView). */
  lineY: number;
}

export function numberLineScale(
  min: number,
  max: number,
  width: number,
  pad = 40,
): NumberLineScale {
  const span = max - min || 1;
  const inner = Math.max(1, width - 2 * pad);
  return {
    min,
    max,
    width,
    pad,
    x: (v) => pad + ((v - min) / span) * inner,
    value: (x) => min + ((x - pad) / inner) * span,
    lineY: 96,
  };
}

/** Values from min to max in steps of `every` (aligned to multiples of `every`), plus the ends. */
export function stepsBetween(min: number, max: number, every: number | null): number[] {
  if (every === null || every <= 0) return [];
  const out: number[] = [];
  const first = Math.ceil(min / every) * every;
  // Integer step counting avoids floating drift (0.1 steps).
  const n = Math.floor((max - first) / every + 1e-9);
  for (let i = 0; i <= n && i < 2000; i++) out.push(Number((first + i * every).toFixed(6)));
  return out;
}

export interface NumberLineMark {
  at: number;
  label?: string;
  arrow?: boolean;
}

export interface NumberLineViewProps {
  min: number;
  max: number;
  ticksEvery: number | null;
  labelsEvery: number | null;
  marks?: NumberLineMark[];
  jumps?: { from: number; to: number }[];
  /** Width in CSS px (default 880). */
  width?: number;
  /** Format a value for its numeral (default: the number itself). */
  format?: (value: number) => string;
  /** Accessible name. Defaults to none (decorative inside a labelled widget). */
  label?: string;
  /**
   * Room at each end in px (default: half the widest end numeral, at least 40). A line with no
   * numerals may go down to 30, the end caps' reach.
   */
  pad?: number;
  /**
   * Every tick stays, but every 5th is longer and every 10th longest (by value: 5, 10, 15, 20…),
   * so a small line keeps one tick per step and still reads at a glance. Default: all alike.
   */
  tickRhythm?: boolean;
  /** Space above the line, in px (default: room for whatever marks and jumps it shows). */
  headroom?: number;
  /** Overlay drawn in the line's SVG coordinate space. */
  children?: (scale: NumberLineScale) => ReactNode;
  className?: string;
}

const LINE_Y = 104;
/** Numeral size on the line: well above the 32 px floor (05 §11), so it reads as big as the cards. */
const NUMERAL_PX = 40;

/** Rough width of a numeral string at 32 px Baloo 2 (for thinning crowded labels). */
const numeralWidth = (s: string) => s.length * 24 + 8;

export function NumberLineView({
  min,
  max,
  ticksEvery,
  labelsEvery,
  marks = [],
  jumps = [],
  width = 880,
  format = (v) => String(v),
  label,
  headroom,
  pad: padProp,
  tickRhythm = false,
  children,
  className,
}: NumberLineViewProps) {
  const arrowId = `ni-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const pad = Math.max(30, padProp ?? Math.max(40, numeralWidth(format(max)) / 2 + 8));
  const s = numberLineScale(min, max, width, pad);
  const ticks = stepsBetween(min, max, ticksEvery);
  // Numerals: every labelsEvery. When they would touch, keep an even stride (every 2nd, 5th, 10th…
  // label) so the pattern stays regular, never a greedy gap here and there.
  const candidates = stepsBetween(min, max, labelsEvery);
  const widest = Math.max(0, ...candidates.map((v) => numeralWidth(format(v))));
  const spacing = labelsEvery ? Math.abs(s.x(min + labelsEvery) - s.x(min)) : 0;
  const stride = [1, 2, 5, 10, 20, 50, 100].find((k) => spacing * k >= widest + 10) ?? 100;
  const unit = (labelsEvery ?? 1) * stride;
  // Where a jump lands, its own arrowhead points at the mark; no second pointer on top of it.
  const jumpEnds = new Set(jumps.map((j) => j.to));
  // Numerals follow labelsEvery (which numbers a question hides is the generator's choice, 03 §5.1),
  // with one rule: a mark that carries its own label ("?", or a given number) replaces the tick's
  // numeral, so a hidden term is never printed under its "?". A bare arrow mark keeps its numeral.
  // Positions compare at the label steps' 6-decimal precision, so a computed 0.1 + 0.2 still matches 0.3.
  const at6 = (v: number) => Number(v.toFixed(6));
  const relabelled = new Set(marks.filter((m) => m.label !== undefined).map((m) => at6(m.at)));
  const labels = candidates.filter(
    (v) => Math.abs(v / unit - Math.round(v / unit)) < 1e-6 && !relabelled.has(at6(v)),
  );
  // Jump arcs and arrow pointers need room above the line; a bare line doesn't.
  const lineY =
    headroom ??
    (jumps.length > 0 ? LINE_Y : marks.some((m) => m.arrow || m.label !== undefined) ? 88 : 30);
  // Room below the line only when numerals are drawn there.
  const height = lineY + (labels.length > 0 ? 64 : 30);
  const svg = (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative (aria-hidden) when static; a named group when a widget draws controls in it
    <svg
      className={['ni-numberline', className].filter(Boolean).join(' ')}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      {...(children ? { role: 'group', 'aria-label': label } : { 'aria-hidden': true })}
      focusable="false"
    >
      {/* Jump arcs above the line. */}
      {jumps.map((j) => {
        const x1 = s.x(j.from);
        const x2 = s.x(j.to);
        const h = Math.min(70, 18 + Math.abs(x2 - x1) * 0.35);
        return (
          <path
            key={`${j.from}>${j.to}`}
            className="ni-numberline__jump"
            // Arcs start and end above the tick tops, so the arrowhead stays clear of any marker.
            d={`M${x1} ${lineY - 22} Q${(x1 + x2) / 2} ${lineY - 22 - 2 * h} ${x2} ${lineY - 22}`}
            markerEnd={`url(#${arrowId})`}
          />
        );
      })}
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 10 5 0 10z" fill="var(--color-coral-deep)" />
        </marker>
      </defs>
      <line
        className="ni-numberline__axis"
        x1={pad - 24}
        x2={width - pad + 24}
        y1={lineY}
        y2={lineY}
      />
      <path
        className="ni-numberline__cap"
        d={`M${pad - 30} ${lineY}l12 -9v18z M${width - pad + 30} ${lineY}l-12 -9v18z`}
      />
      {ticks.map((v) => {
        const step = Math.round(v / (ticksEvery ?? 1));
        const rank = !tickRhythm
          ? 'all'
          : step % 10 === 0
            ? 'ten'
            : step % 5 === 0
              ? 'five'
              : 'one';
        const half = rank === 'ten' ? 18 : rank === 'five' ? 14 : rank === 'one' ? 8 : 14;
        return (
          <line
            key={`t${v}`}
            className="ni-numberline__tick"
            data-rank={tickRhythm ? rank : undefined}
            data-at={v}
            x1={s.x(v)}
            x2={s.x(v)}
            y1={lineY - half}
            y2={lineY + half}
          />
        );
      })}
      {labels.map((v) => (
        <text
          key={`l${v}`}
          className="ni-numberline__numeral"
          x={s.x(v)}
          y={lineY + 18 + NUMERAL_PX * 0.9}
          fontSize={NUMERAL_PX}
          textAnchor="middle"
        >
          {format(v)}
        </text>
      ))}
      {marks.map((m) => (
        <g key={`m${m.at}`} className="ni-numberline__mark" data-at={m.at}>
          <circle cx={s.x(m.at)} cy={lineY} r={9} />
          {m.arrow && !jumpEnds.has(m.at) ? (
            <path
              className="ni-numberline__pointer"
              d={`M${s.x(m.at)} ${lineY - 16}l-14 -22h28z`}
            />
          ) : null}
          {m.label !== undefined ? (
            <text
              className="ni-numberline__marklabel"
              x={s.x(m.at)}
              y={lineY - (m.arrow && !jumpEnds.has(m.at) ? 44 : 20)}
              fontSize={NUMERAL_PX}
              textAnchor="middle"
            >
              {m.label}
            </text>
          ) : null}
        </g>
      ))}
      {children?.({ ...s, lineY })}
    </svg>
  );
  // A static line with a name is one picture; an interactive one exposes its own controls.
  return label && !children ? <div {...pictureProps(label)}>{svg}</div> : svg;
}
