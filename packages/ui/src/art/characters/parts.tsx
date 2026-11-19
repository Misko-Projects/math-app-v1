import type { CSSProperties, ReactNode } from 'react';
import type { PaletteColor } from '../../tokens/tokens';
import { OUTLINE_OF, paint } from '../core/paint';
import { PEBBLE_MARK, TEN_FRAME, tenFrameSlots } from './pebbling';

/**
 * Parts every character shares (05 §11): eyes, cheeks, mouths, limbs, the pebble frame, and the idle
 * loops. Sharing them is what makes Pip, Glim and the Pebblings read as one cast: the same eye
 * construction, outline weight and top-left light.
 */

// ---------- motion ----------

/** Theme loop tokens (theme.css). Each one is `none` under reduced motion. */
export type LoopToken =
  | 'bob'
  | 'bob-slow'
  | 'sway'
  | 'blink'
  | 'pulse-soft'
  | 'wave-claw'
  | 'shimmer'
  | 'flutter';

export interface LoopTiming {
  /** Seconds; overrides the token's duration (the keyframes stay the token's). */
  duration?: number;
  /** Seconds; negative values start part-way through, so a group never moves in lockstep. */
  delay?: number;
}

function timing(t: LoopTiming): CSSProperties {
  const s: CSSProperties = {};
  if (t.duration !== undefined) s.animationDuration = `${t.duration}s`;
  if (t.delay !== undefined) s.animationDelay = `${t.delay}s`;
  return s;
}

/**
 * Props for an idle loop on a `<g>`: the animation comes from a theme token, so reduced motion (OS
 * or data-reduced-motion) turns it off; `motion-loop` stops it again for good measure.
 */
export function loopProps(token: LoopToken, t: LoopTiming = {}) {
  return {
    className: 'motion-loop art-loop',
    style: { animation: `var(--animate-${token})`, ...timing(t) } as CSSProperties,
  };
}

export function Loop({
  token,
  on = true,
  children,
  ...t
}: LoopTiming & { token: LoopToken; on?: boolean; children: ReactNode }) {
  if (!on) return <g>{children}</g>;
  return <g {...loopProps(token, t)}>{children}</g>;
}

/**
 * A hop (art.css `art-hop`, 5 units) amplified `amp` times by drawing it in a scaled frame, so a
 * cheer reads at character size without a new keyframe.
 */
export function Hop({
  on = true,
  amp = 3,
  children,
  ...t
}: LoopTiming & { on?: boolean; amp?: number; children: ReactNode }) {
  if (!on) return <g>{children}</g>;
  return (
    <g transform={`scale(${amp})`}>
      <g className="motion-loop art-loop art-hop" style={timing(t)}>
        <g transform={`scale(${1 / amp})`}>{children}</g>
      </g>
    </g>
  );
}

/**
 * A part that turns about a pivot (a claw on its shoulder, a beak on its hinge). Children are drawn
 * relative to the pivot, at rest. `angle` turns them outward (mirrored parts turn the mirrored way)
 * and `loop` adds an idle swing about the same pivot. A transparent circle centres the loop's
 * fill-box on the pivot, so `transform-origin: center` is the pivot in every browser.
 */
export function Pivot({
  x,
  y,
  angle = 0,
  mirror = false,
  reach = 80,
  loop,
  children,
}: {
  x: number;
  y: number;
  angle?: number;
  mirror?: boolean;
  reach?: number;
  loop?: { token: LoopToken } & LoopTiming;
  children: ReactNode;
}) {
  const turned = <g transform={`${mirror ? 'scale(-1 1) ' : ''}rotate(${angle})`}>{children}</g>;
  return (
    <g transform={`translate(${x} ${y})`}>
      {loop ? (
        <g {...loopProps(loop.token, loop)}>
          <circle r={reach} fill="none" />
          {turned}
        </g>
      ) : (
        turned
      )}
    </g>
  );
}

// ---------- shapes ----------

/** Fill + outline in the fill's own shade (05 §11), with rounded joins. */
export function fillOf(fill: PaletteColor, width = 3) {
  return {
    fill: paint(fill),
    stroke: paint(OUTLINE_OF[fill]),
    strokeWidth: width,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
}

/** A thick rounded stroke with an outline (legs, stalks, arms, antennae). */
export function Tube({ d, w, fill }: { d: string; w: number; fill: PaletteColor }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={paint(OUTLINE_OF[fill])} strokeWidth={w + 5} />
      <path d={d} stroke={paint(fill)} strokeWidth={w} />
    </g>
  );
}

/** The soft highlight crescent (top-left light) for a round shape of radius r at (x, y). */
export function Shine({
  x,
  y,
  rx,
  ry = rx,
  opacity = 0.42,
}: {
  x: number;
  y: number;
  rx: number;
  ry?: number;
  opacity?: number;
}) {
  // A crescent hugging the top-left of the shape, from about 10 o'clock to 12.
  const a = { x: x - rx * 0.74, y: y - ry * 0.28 };
  const b = { x: x - rx * 0.12, y: y - ry * 0.8 };
  const c = { x: x - rx * 0.62, y: y - ry * 0.7 };
  const d = `M${a.x} ${a.y}Q${c.x} ${c.y} ${b.x} ${b.y}Q${x - rx * 0.5} ${y - ry * 0.56} ${a.x} ${a.y}Z`;
  return (
    <path
      d={d}
      fill={paint('cloud')}
      opacity={opacity}
      stroke={paint('cloud')}
      strokeWidth={rx * 0.12}
      strokeOpacity={opacity}
      strokeLinejoin="round"
    />
  );
}

// ---------- faces ----------

export interface EyeProps {
  x: number;
  y: number;
  /** Eye radius (the white). */
  r?: number;
  /** Outline shade of the white: the body's deep colour. */
  edge?: PaletteColor;
  /** Where the pupil looks, as a fraction of the room it has (−1 … 1). */
  look?: readonly [number, number];
  /** Pip and Pebblings on a light face can use a plain ink eye with no white. */
  sclera?: boolean;
}

/** The shared eye: a white with an ink pupil and a top-left catchlight. */
export function Eye({ x, y, r = 10, edge = 'ink', look = [0, 0], sclera = true }: EyeProps) {
  const pr = sclera ? r * 0.64 : r;
  const room = sclera ? r - pr - 1 : 0;
  const px = x + look[0] * room;
  const py = y + look[1] * room;
  return (
    <g data-part="eye">
      {sclera ? (
        <circle cx={x} cy={y} r={r} fill={paint('cloud')} stroke={paint(edge)} strokeWidth={2.5} />
      ) : null}
      <circle cx={px} cy={py} r={pr} fill={paint('ink')} />
      <circle cx={px - pr * 0.34} cy={py - pr * 0.36} r={pr * 0.34} fill={paint('cloud')} />
      <circle cx={px + pr * 0.36} cy={py + pr * 0.3} r={pr * 0.14} fill={paint('cloud')} />
    </g>
  );
}

/** An eye's white bulb, kept when it closes so the eye never seems to vanish. */
export interface EyeBulb {
  edge: PaletteColor;
}

/**
 * A closed eye: one clean curved lid line (no squashed eye, so no slivers at small sizes). An eye
 * with a white keeps its bulb and closes with the lid line across it.
 */
function Lid({
  x,
  y,
  r,
  color,
  bulb,
}: {
  x: number;
  y: number;
  r: number;
  color: PaletteColor;
  bulb?: EyeBulb;
}) {
  return (
    <g>
      {bulb ? (
        <circle
          cx={x}
          cy={y}
          r={r}
          fill={paint('cloud')}
          stroke={paint(bulb.edge)}
          strokeWidth={2.5}
          data-part="closed-bulb"
        />
      ) : null}
      <path
        d={`M${x - r * 0.8} ${y}Q${x} ${y + r * 0.6} ${x + r * 0.8} ${y}`}
        fill="none"
        stroke={paint(color)}
        strokeWidth={Math.max(2.5, r * 0.3)}
        strokeLinecap="round"
      />
    </g>
  );
}

/**
 * Eyes that blink (art.css `art-blink-open` / `art-blink-lid`, 5 s): for a moment the open eyes hide
 * and curved lids show. Under reduced motion the eyes stay open and the lids hidden. Lids are ink,
 * or `lid` on a dark face (Glim's screen).
 */
export function Blink({
  eyes,
  delay,
  lid = 'ink',
  children,
}: {
  eyes: readonly { x: number; y: number; r: number; bulb?: EyeBulb }[];
  delay?: number;
  lid?: PaletteColor;
  children: ReactNode;
}) {
  const style: CSSProperties | undefined =
    delay !== undefined ? { animationDelay: `${delay}s` } : undefined;
  return (
    <g data-part="blink">
      <g className="motion-loop art-blink-open" style={style}>
        {children}
      </g>
      <g className="motion-loop art-blink-lid" style={style} data-part="lids">
        {eyes.map((e) => (
          <Lid key={`${e.x},${e.y}`} {...e} color={lid} />
        ))}
      </g>
    </g>
  );
}

/** A pair of eyes that blink together. */
export function Eyes({
  left,
  right,
  delay,
  ...eye
}: Omit<EyeProps, 'x' | 'y'> & {
  left: readonly [number, number];
  right: readonly [number, number];
  delay?: number;
}) {
  const r = eye.r ?? 10;
  // Eyes with a white keep their bulb when they close.
  const bulb = (eye.sclera ?? true) ? { edge: eye.edge ?? 'ink' } : undefined;
  return (
    <Blink
      eyes={[
        { x: left[0], y: left[1], r, bulb },
        { x: right[0], y: right[1], r, bulb },
      ]}
      delay={delay}
    >
      <Eye x={left[0]} y={left[1]} {...eye} />
      <Eye x={right[0]} y={right[1]} {...eye} />
    </Blink>
  );
}

/** Translucent cheek blush ovals. */
export function Cheeks({
  left,
  right,
  color = 'coral',
  rx = 7.5,
}: {
  left: readonly [number, number];
  right: readonly [number, number];
  color?: PaletteColor;
  rx?: number;
}) {
  return (
    <g fill={paint(color)} opacity={0.5} data-part="cheeks">
      <ellipse cx={left[0]} cy={left[1]} rx={rx} ry={rx * 0.62} />
      <ellipse cx={right[0]} cy={right[1]} rx={rx} ry={rx * 0.62} />
    </g>
  );
}

/** A smile; `open` is the cheer smile (an ink D with a coral tongue). */
export function Smile({
  x,
  y,
  w = 16,
  open = false,
}: {
  x: number;
  y: number;
  w?: number;
  open?: boolean;
}) {
  const h = w / 2;
  if (open) {
    return (
      <g data-part="mouth">
        <path
          d={`M${x - h} ${y - 1}Q${x} ${y - 3} ${x + h} ${y - 1}Q${x + h * 0.8} ${y + w * 0.72} ${x} ${y + w * 0.72}Q${x - h * 0.8} ${y + w * 0.72} ${x - h} ${y - 1}Z`}
          fill={paint('ink')}
          stroke={paint('ink')}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <ellipse cx={x} cy={y + w * 0.5} rx={h * 0.5} ry={w * 0.16} fill={paint('coral')} />
      </g>
    );
  }
  return (
    <path
      data-part="mouth"
      d={`M${x - h} ${y}Q${x} ${y + w * 0.62} ${x + h} ${y}`}
      fill="none"
      stroke={paint('ink')}
      strokeWidth={2.75}
      strokeLinecap="round"
    />
  );
}

// ---------- pebbles ----------

/** A lit pebble (filled, with a highlight) or an empty socket (a hollow ring). */
export function Pebble({
  x,
  y,
  lit,
  r = TEN_FRAME.pebbleR,
}: {
  x: number;
  y: number;
  lit: boolean;
  r?: number;
}) {
  if (!lit) {
    return (
      <circle
        data-pebble="empty"
        cx={x}
        cy={y}
        r={r * (TEN_FRAME.ringR / TEN_FRAME.pebbleR)}
        fill="none"
        stroke={paint(PEBBLE_MARK.empty)}
        strokeWidth={r * 0.27}
      />
    );
  }
  return (
    <g data-pebble="lit">
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={paint(PEBBLE_MARK.lit)}
        stroke={paint(PEBBLE_MARK.litEdge)}
        strokeWidth={r * 0.2}
      />
      <ellipse
        cx={x - r * 0.32}
        cy={y - r * 0.36}
        rx={r * 0.36}
        ry={r * 0.24}
        transform={`rotate(-35 ${x - r * 0.32} ${y - r * 0.36})`}
        fill={paint('cloud')}
        opacity={0.8}
      />
    </g>
  );
}

/** The size of a ten-frame bed at a scale. */
export function frameSize(scale = 1) {
  const { pitch, pad, cols, rows } = TEN_FRAME;
  return { w: (cols * pitch + 2 * pad) * scale, h: (rows * pitch + 2 * pad) * scale };
}

/**
 * The 2 × 5 ten-frame on a Pebbling's shell, centred on (x, y): a pebble bed in the palette's light
 * fill, outlined in the body shade, with `lit` pebbles filled top row first.
 */
export function PebbleFrame({
  x,
  y,
  lit,
  bed,
  edge,
  scale = 1,
}: {
  x: number;
  y: number;
  lit: number;
  bed: PaletteColor;
  edge: PaletteColor;
  scale?: number;
}) {
  const { pitch, pebbleR } = TEN_FRAME;
  const { w, h } = frameSize(scale);
  const p = pitch * scale;
  return (
    <g data-part="ten-frame" data-lit={Math.max(0, Math.min(10, Math.round(lit)))}>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={h * 0.36}
        fill={paint(bed)}
        stroke={paint(edge)}
        strokeWidth={3}
      />
      {/* The five-and-five seam: a soft centre line between the rows. */}
      <path
        d={`M${x - w / 2 + 10 * scale} ${y}H${x + w / 2 - 10 * scale}`}
        stroke={paint(edge)}
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.35}
      />
      {tenFrameSlots(lit).map((s) => (
        <Pebble
          key={s.index}
          x={x + (s.col - 2) * p}
          y={y + (s.row - 0.5) * p}
          lit={s.lit}
          r={pebbleR * scale}
        />
      ))}
    </g>
  );
}
