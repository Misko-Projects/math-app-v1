import type { ExpressionSpec, ExpressionToken, StimulusSpec } from '@number-island/shared';
import type { CSSProperties, ReactNode } from 'react';
import { useNarrationText } from '../../preferences/UiProvider';
import { pictureProps } from './a11y';
import { dotsLayout, groupIndexes, objectSetLayout } from './layout';
import { NumberLineView } from './NumberLineView';
import { ObjectSetView } from './ObjectSetView';
import { ObjectSprite } from './sprites';
import './kit.css';

/**
 * Static pictures for `StimulusSpec` (03 §5.1): what many formats show above their answer control
 * (numeral-pick, number-pad, dot-flash, compare, …). Each kind has one renderer below. Kinds that
 * belong to later widget issues (clock, coins, fractions, gauges, charts, shapes, bar models) are
 * added here by those issues, one `case` each; until then they draw a neutral card (and a dev tag),
 * so an item never breaks.
 *
 * A stimulus is a picture, not an answer: its accessible name says what it is ("Look at the
 * picture"), never the quantity the child is asked for.
 */

export interface StimulusViewProps {
  spec: StimulusSpec;
  /** Box the picture fits in, in CSS px. */
  maxWidth?: number;
  maxHeight?: number;
  /** Smallest object cell in px (default 28); small pictures (choice cards) may go lower. */
  minCell?: number;
  /** Renders a blank token of an expression stimulus (number-pad draws its entry slots here). */
  renderBlank?: (id: string) => ReactNode;
  /** Accessible name; defaults to the generic "picture" label. */
  label?: string;
  className?: string;
}

export function StimulusView({
  spec,
  maxWidth = 720,
  maxHeight = 300,
  minCell,
  renderBlank,
  label,
  className,
}: StimulusViewProps) {
  const t = useNarrationText();
  const name = label ?? t('ui.widget.picture');
  const cls = ['ni-stimulus', className].filter(Boolean).join(' ');
  switch (spec.kind) {
    case 'none':
      return null;
    case 'objects':
      return (
        <div className={cls} data-kind="objects">
          <ObjectSetView
            layout={objectSetLayout(spec.set)}
            maxWidth={maxWidth}
            maxHeight={maxHeight}
            minCell={minCell}
            label={name}
          />
        </div>
      );
    case 'dots':
      return (
        <div className={cls} data-kind="dots">
          {spec.arrangement === 'fingers' ? (
            <FingersView groups={spec.groups} label={name} maxHeight={maxHeight} />
          ) : (
            <ObjectSetView
              layout={dotsLayout(spec)}
              maxWidth={maxWidth}
              maxHeight={maxHeight}
              minCell={minCell}
              label={name}
            />
          )}
        </div>
      );
    case 'ten-frame':
      return (
        <div className={cls} data-kind="ten-frame">
          <TenFrameView
            frames={spec.frames}
            filled={spec.filled}
            colors={spec.colors}
            label={name}
            maxWidth={maxWidth}
            maxHeight={maxHeight}
          />
        </div>
      );
    case 'rekenrek':
      return (
        <div className={cls} data-kind="rekenrek">
          <RekenrekView rows={spec.rows} label={name} />
        </div>
      );
    case 'number-line':
      return (
        <div className={cls} data-kind="number-line">
          <NumberLineView
            min={spec.min}
            max={spec.max}
            ticksEvery={spec.ticksEvery}
            labelsEvery={spec.labelsEvery}
            marks={spec.marks}
            jumps={spec.jumps}
            width={Math.min(maxWidth, 880)}
            label={name}
          />
        </div>
      );
    case 'number-bond':
      return (
        <div className={cls} data-kind="number-bond">
          <NumberBondView whole={spec.whole} parts={spec.parts} label={name} />
        </div>
      );
    case 'expression':
      return (
        <div className={cls} data-kind="expression">
          <ExpressionView expr={spec.expr} renderBlank={renderBlank} />
        </div>
      );
    case 'groups':
      return (
        <div className={cls} data-kind="groups">
          <ObjectSetView
            layout={objectSetLayout({
              count: spec.groups * spec.perGroup,
              sprite: spec.sprite,
              layout: 'groups',
              groups: Array.from({ length: spec.groups }, () => spec.perGroup),
              layoutSeed: 1,
            })}
            maxWidth={maxWidth}
            maxHeight={maxHeight}
            minCell={minCell}
            label={name}
          />
        </div>
      );
    case 'array':
      return (
        <div className={cls} data-kind="array">
          <ObjectSetView
            layout={objectSetLayout({
              count: spec.rows * spec.cols,
              sprite: spec.sprite ?? 'counter',
              layout: 'array',
              rows: spec.rows,
              layoutSeed: 1,
            })}
            maxWidth={maxWidth}
            maxHeight={maxHeight}
            minCell={minCell}
            label={name}
          />
        </div>
      );
    case 'base-ten':
      return (
        <div className={cls} data-kind="base-ten">
          <BaseTenView
            hundreds={spec.hundreds}
            tens={spec.tens}
            ones={spec.ones}
            thousands={spec.thousands ?? 0}
            label={name}
          />
        </div>
      );
    case 'scene':
      return (
        <div className={cls} data-kind="scene" role="img" aria-label={name}>
          {spec.sprites.map((s) => (
            <ObjectSetView
              key={s.sprite}
              layout={objectSetLayout({
                count: s.count,
                sprite: s.sprite,
                layout: 'line',
                layoutSeed: 1,
              })}
              maxWidth={maxWidth}
              maxHeight={maxHeight / Math.max(1, spec.sprites.length)}
            />
          ))}
        </div>
      );
    default:
      // Kinds a later widget issue renders (U04/U05). A neutral card, never a crash.
      return (
        <div
          className={cls}
          data-kind={spec.kind}
          data-unsupported="true"
          role="img"
          aria-label={name}
        >
          <ObjectSprite sprite="pebble" />
          {import.meta.env?.DEV ? (
            <code className="ni-stimulus__dev" aria-hidden="true">
              {spec.kind}
            </code>
          ) : null}
        </div>
      );
  }
}

// ---------- fingers ----------

/** Raised fingers, one hand per group of up to 5 (03 §3.2 `fingers`). */
export function FingersView({
  groups,
  label,
  maxHeight = 260,
}: {
  groups: readonly number[];
  label?: string;
  maxHeight?: number;
}) {
  // Split groups into hands of at most five raised fingers.
  const hands: { id: string; up: number; group: number }[] = [];
  groups.forEach((g, gi) => {
    let left = Math.max(0, g);
    do {
      hands.push({ id: `h${hands.length}`, up: Math.min(5, left), group: gi });
      left -= 5;
    } while (left > 0);
  });
  const h = Math.min(220, maxHeight);
  return (
    <div className="ni-fingers" {...pictureProps(label)}>
      {hands.map((hand, i) => (
        <Hand
          key={hand.id}
          up={hand.up}
          tone={hand.group % 2 === 1 ? 'b' : 'a'}
          height={h}
          mirror={i % 2 === 1}
        />
      ))}
    </div>
  );
}

/**
 * Fingers left to right: thumb, index, middle, ring, pinky. x is the finger's centre, `top`
 * the tip of a raised finger, in a 100 × 120 box; the palm spans x 20–80 from y 52 down.
 */
const FINGERS = [
  { x: 14, top: 44, w: 16, tilt: -34 }, // thumb, on the side
  { x: 31, top: 8, w: 15, tilt: -5 },
  { x: 46, top: 2, w: 15, tilt: 0 },
  { x: 61, top: 6, w: 15, tilt: 4 },
  { x: 75, top: 18, w: 14, tilt: 9 },
];

/**
 * The order fingers go up: index, middle, ring, pinky, then the thumb. 1–4 never use the thumb
 * (a sideways thumb reads as up or down), so every count is unambiguous; 5 is the open hand.
 */
const RAISE_ORDER: readonly number[] = [4, 0, 1, 2, 3];

function Hand({
  up,
  tone,
  height,
  mirror,
}: {
  up: number;
  tone: 'a' | 'b';
  height: number;
  mirror: boolean;
}) {
  const skin = tone === 'b' ? 'var(--color-sunshine-light)' : 'var(--color-horizon)';
  const line = tone === 'b' ? 'var(--color-sun-deep)' : 'var(--color-wood-deep)';
  const PALM_TOP = 52;
  const finger = (i: number) => {
    const f = FINGERS[i] as (typeof FINGERS)[number];
    const raised = (RAISE_ORDER[i] ?? 9) < up;
    if (!raised && i === 0) {
      // A folded thumb lies across the palm: a short sideways stub, clearly not pointing up.
      return (
        <rect
          key={i}
          x={22}
          y={66}
          width={30}
          height={13}
          rx={6.5}
          fill={skin}
          stroke={line}
          strokeWidth="3"
        />
      );
    }
    // A raised finger reaches up from inside the palm; a folded one is a knuckle on top of it.
    const cx = f.x;
    const top = raised ? f.top : PALM_TOP - 6;
    const bottom = raised ? PALM_TOP + 18 : top + 16;
    return (
      <rect
        key={i}
        x={cx - f.w / 2}
        y={top}
        width={f.w}
        height={bottom - top}
        rx={f.w / 2}
        fill={skin}
        stroke={line}
        strokeWidth="3"
        transform={raised ? `rotate(${f.tilt} ${f.x} ${PALM_TOP + 10})` : undefined}
        data-raised={raised ? 'true' : undefined}
      />
    );
  };
  const raisedIdx = FINGERS.map((_, i) => i).filter((i) => (RAISE_ORDER[i] ?? 9) < up);
  const foldedIdx = FINGERS.map((_, i) => i).filter((i) => (RAISE_ORDER[i] ?? 9) >= up);
  return (
    <svg
      className="ni-hand-art"
      viewBox="0 0 100 124"
      height={height}
      width={(height * 100) / 124}
      aria-hidden="true"
      focusable="false"
      data-up={up}
      style={mirror ? { transform: 'scaleX(-1)' } : undefined}
    >
      <ellipse cx="50" cy="118" rx="30" ry="5" fill="rgb(38 70 83 / 0.16)" />
      {raisedIdx.map(finger)}
      <path
        d={`M20 ${PALM_TOP + 4}c0-3 2-5 5-5h50c3 0 5 2 5 5v32c0 16-13 28-29 28h-2c-16 0-29-12-29-28V${PALM_TOP + 4}Z`}
        fill={skin}
        stroke={line}
        strokeWidth="3"
      />
      {foldedIdx.map(finger)}
      <path
        d="M38 96c7 3 17 3 24 0"
        stroke={line}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.5"
        fill="none"
      />
    </svg>
  );
}

// ---------- ten-frame ----------

export function TenFrameView({
  frames,
  filled,
  colors,
  label,
  maxWidth = 720,
  maxHeight = 300,
}: {
  frames: 1 | 2;
  filled: readonly number[];
  colors?: readonly ('a' | 'b')[][];
  label?: string;
  maxWidth?: number;
  maxHeight?: number;
}) {
  const objects = [];
  const outlines = [];
  for (let f = 0; f < frames; f++) {
    outlines.push({ x: f * 5.5, y: 0, cols: 5, rows: 2 });
    const n = Math.max(0, Math.min(10, filled[f] ?? 0));
    for (let k = 0; k < n; k++) {
      const c = colors?.[f]?.[k] ?? 'a';
      objects.push({
        index: f * 10 + k,
        kind: 'object' as const,
        sprite: 'counter',
        // A margin inside each cell, so counters never touch the frame lines.
        x: f * 5.5 + (k % 5) + 0.09,
        y: Math.floor(k / 5) + 0.09,
        scale: 0.82,
        group: c === 'b' ? 1 : 0,
        tone: c,
      });
    }
  }
  return (
    <ObjectSetView
      layout={{ objects, frames: outlines, width: frames * 5.5 - 0.5, height: 2 }}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      label={label}
    />
  );
}

// ---------- rekenrek ----------

/** A rekenrek: rows of 10 beads (5 coral, 5 white), `rows[i]` pushed to the left. */
export function RekenrekView({ rows, label }: { rows: readonly number[]; label?: string }) {
  const bead = 44;
  const gap = 4;
  const width = 10 * (bead + gap) + 220;
  return (
    <div className="ni-rekenrek-wrap" {...pictureProps(label)}>
      <svg
        className="ni-rekenrek"
        width={width}
        height={rows.length * 70 + 30}
        viewBox={`0 0 ${width} ${rows.length * 70 + 30}`}
        aria-hidden="true"
        focusable="false"
      >
        <rect
          x="4"
          y="4"
          width="16"
          height={rows.length * 70 + 22}
          rx="6"
          className="ni-rekenrek__post"
        />
        <rect
          x={width - 20}
          y="4"
          width="16"
          height={rows.length * 70 + 22}
          rx="6"
          className="ni-rekenrek__post"
        />
        {rows.map((pushed, r) => {
          const y = 40 + r * 70;
          const n = Math.max(0, Math.min(10, pushed));
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
            <g key={r}>
              <line x1="20" x2={width - 20} y1={y} y2={y} className="ni-rekenrek__wire" />
              {Array.from({ length: 10 }, (_, i) => {
                const left = i < n;
                const x = left ? 28 + i * (bead + gap) : width - 28 - (10 - i) * (bead + gap) + gap;
                const coral = i < 5;
                return (
                  <ellipse
                    // biome-ignore lint/suspicious/noArrayIndexKey: beads are positional
                    key={i}
                    cx={x + bead / 2}
                    cy={y}
                    rx={bead / 2}
                    ry={bead / 2 + 2}
                    className={coral ? 'ni-bead ni-bead--a' : 'ni-bead ni-bead--b'}
                    data-pushed={left ? 'true' : undefined}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------- number bond ----------

/** A number bond: the whole on top, its parts below, joined by lines; `?` or null is a blank. */
export function NumberBondView({
  whole,
  parts,
  label,
  renderSlot,
}: {
  whole: number | '?' | null;
  parts: readonly (number | '?' | null)[];
  label?: string;
  /** Render a slot yourself ('whole' or 'part-<i>'), e.g. an input or drop target. */
  renderSlot?: (slot: string, value: number | '?' | null) => ReactNode;
}) {
  const slot = (id: string, v: number | '?' | null) =>
    renderSlot ? (
      renderSlot(id, v)
    ) : (
      <span
        className="ni-bond__circle"
        data-slot={id}
        data-empty={v === null || v === '?' ? 'true' : undefined}
      >
        {v === null ? '' : String(v)}
      </span>
    );
  return (
    <div
      className="ni-bond"
      // A static bond is one picture; with renderSlot its slots are controls, so it stays a group.
      {...(renderSlot ? { role: 'group', 'aria-label': label } : pictureProps(label))}
      style={{ '--parts': parts.length } as CSSProperties}
    >
      <svg
        className="ni-bond__lines"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {parts.map((_, i) => {
          const x = parts.length === 1 ? 50 : 20 + (60 * i) / (parts.length - 1);
          // biome-ignore lint/suspicious/noArrayIndexKey: bond legs are positional
          return <line key={i} x1="50" y1="25" x2={x} y2="75" />;
        })}
      </svg>
      <div className="ni-bond__whole">{slot('whole', whole)}</div>
      <div className="ni-bond__parts">
        {parts.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
          <div key={i}>{slot(`part-${i}`, p)}</div>
        ))}
      </div>
    </div>
  );
}

// ---------- expression ----------

const OP_GLYPH: Record<string, string> = { '+': '+', '-': '−', '×': '×', '÷': '÷' };

function money(cents: number, style: 'cents' | 'dollars'): string {
  if (style === 'cents') return `${cents}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}

/** An expression, token by token (03 §5.1 `ExpressionToken`); blanks render through `renderBlank`. */
export function ExpressionView({
  expr,
  renderBlank,
}: {
  expr: ExpressionSpec;
  renderBlank?: (id: string) => ReactNode;
}) {
  const token = (tok: ExpressionToken, i: number): ReactNode => {
    switch (tok.t) {
      case 'num':
        return <span className="ni-expr__num">{tok.v}</span>;
      case 'op':
        return <span className="ni-expr__op">{OP_GLYPH[tok.v] ?? tok.v}</span>;
      case 'rel':
        return <span className="ni-expr__op">{tok.v === '?' ? '?' : tok.v}</span>;
      case 'blank':
        return renderBlank ? (
          renderBlank(tok.id)
        ) : (
          <span className="ni-expr__blank" data-blank={tok.id} />
        );
      case 'var':
        return <span className="ni-expr__var">{tok.name}</span>;
      case 'frac':
        return (
          <span className="ni-expr__frac">
            <span>{tok.a === 'blank' ? (renderBlank?.(`frac-${i}-a`) ?? '□') : tok.a}</span>
            <span>{tok.b === 'blank' ? (renderBlank?.(`frac-${i}-b`) ?? '□') : tok.b}</span>
          </span>
        );
      case 'money':
        return <span className="ni-expr__num">{money(tok.cents, tok.style)}</span>;
      case 'time':
        return (
          <span className="ni-expr__num">
            {tok.h}:{String(tok.m).padStart(2, '0')}
          </span>
        );
      case 'paren':
        return <span className="ni-expr__op">{tok.v}</span>;
    }
  };
  return (
    <div className="ni-expr" data-tokens={expr.tokens.length}>
      {expr.tokens.map((tok, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional
        <span key={i} className="ni-expr__token" data-t={tok.t}>
          {token(tok, i)}
        </span>
      ))}
    </div>
  );
}

// ---------- base ten (simple picture; base-ten widgets live in U04) ----------

export function BaseTenView({
  thousands,
  hundreds,
  tens,
  ones,
  label,
}: {
  thousands: number;
  hundreds: number;
  tens: number;
  ones: number;
  label?: string;
}) {
  const unit = 14;
  const items: ReactNode[] = [];
  const blocks = [
    ...Array.from({ length: thousands }, () => 'cube'),
    ...Array.from({ length: hundreds }, () => 'flat'),
    ...Array.from({ length: tens }, () => 'rod'),
  ];
  blocks.forEach((b, i) => {
    const size = b === 'rod' ? { w: unit, h: unit * 10 } : { w: unit * 10, h: unit * 10 };
    items.push(
      <span
        // biome-ignore lint/suspicious/noArrayIndexKey: blocks are positional
        key={`b${i}`}
        className={`ni-baseten__block ni-baseten__block--${b}`}
        style={{ width: size.w, height: size.h, backgroundSize: `${unit}px ${unit}px` }}
      />,
    );
  });
  return (
    <div className="ni-baseten" {...pictureProps(label)}>
      {items}
      <span className="ni-baseten__ones" style={{ width: unit * 2 + 4 }}>
        {groupIndexes(ones).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: unit cubes are positional
          <span key={i} className="ni-baseten__unit" style={{ width: unit, height: unit }} />
        ))}
      </span>
    </div>
  );
}
