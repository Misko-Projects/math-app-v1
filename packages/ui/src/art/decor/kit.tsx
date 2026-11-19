import type { CSSProperties, ReactNode } from 'react';
import type { PaletteColor } from '../../tokens/tokens';
import { filled, paint } from '../core/paint';
import { ContactShadow } from '../core/Shading';

/*
 * Shared pieces for decor (05 §6, §11). Decor is drawn in scene units, in the island's tilted
 * top-down view, with the origin at the bottom-centre of the item's footprint box: one plot is
 * 100 × 70 (ISLAND_LAYOUT), so a 1 × 1 item spans x −50…50 and y −70…0, and a 2 × 2 item x −100…100
 * and y −140…0. Standing items rest on a contact shadow centred on the footprint (GROUND_Y).
 */

/** Where decor comes from (05 §6, §7), for the gallery. GameData decides the real sources. */
export type DecorGroup = 'island' | 'beach' | 'festival' | 'stars';

export const DECOR_GROUPS: readonly { id: DecorGroup; name: string }[] = [
  { id: 'island', name: 'Island and garden (projects and building levels)' },
  { id: 'beach', name: 'Beach finds (gifts and surprises)' },
  { id: 'festival', name: 'Festivals and Storm Watch' },
  { id: 'stars', name: 'Puzzle Tower stars' },
];

export type Footprint = readonly [number, number];

export interface DesignBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DecorDrawProps {
  /** Sunset lighting: lamps and lanterns are lit and glow. */
  lit: boolean;
}

export interface DecorDef {
  footprint: Footprint;
  /** The art's box in design units around the anchor (bottom-centre of the footprint). */
  viewBox: DesignBox;
  group: DecorGroup;
  draw: (p: DecorDrawProps) => ReactNode;
  /** Has an idle loop (05 §11). Loops stop under reduced motion (06 §7). */
  loops: boolean;
}

const PLOT_W = 100;
const PLOT_H = 70;

/** y of the ground point a standing item rests on, for a footprint (the footprint's centre). */
export function groundY(footprint: Footprint = [1, 1]): number {
  return -(footprint[1] * PLOT_H) / 2 + 8;
}

/** A decor definition: its footprint, the vertical extent of its art (top/bottom), group, drawing. */
export function decor(
  footprint: Footprint,
  top: number,
  bottom: number,
  group: DecorGroup,
  draw: (p: DecorDrawProps) => ReactNode,
  loops = false,
): DecorDef {
  const w = footprint[0] * PLOT_W;
  return { footprint, viewBox: { x: -w / 2, y: top, w, h: bottom - top }, group, draw, loops };
}

export const G1 = groundY([1, 1]);

/** The contact shadow every standing item rests on. */
export function Ground({
  rx,
  x = 0,
  y = G1,
  ry,
}: {
  rx: number;
  x?: number;
  y?: number;
  ry?: number;
}) {
  return <ContactShadow cx={x} cy={y} rx={rx} ry={ry ?? Math.max(4, rx * 0.26)} />;
}

/** A soft highlight stroke on the lit (top-left) side. */
export function Shine({
  d,
  width = 3.5,
  opacity = 0.7,
}: {
  d: string;
  width?: number;
  opacity?: number;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={paint('cloud')}
      strokeWidth={width}
      strokeLinecap="round"
      opacity={opacity}
    />
  );
}

/** A plain detail line in a palette colour. */
export function Line({
  d,
  color,
  width = 2.5,
  opacity,
  dash,
}: {
  d: string;
  color: PaletteColor;
  width?: number;
  opacity?: number;
  dash?: string;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={paint(color)}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacity}
      strokeDasharray={dash}
    />
  );
}

/** A filled shape outlined in its OUTLINE_OF shade. */
export function Shape({
  d,
  fill,
  width,
  opacity,
}: {
  d: string;
  fill: PaletteColor;
  width?: number;
  opacity?: number;
}) {
  return <path d={d} {...filled(fill, width)} opacity={opacity} />;
}

/** A four-point glint. */
export function Twinkle({
  x,
  y,
  r = 5,
  className,
  delay,
}: {
  x: number;
  y: number;
  r?: number;
  className?: string;
  delay?: number;
}) {
  const k = r * 0.28;
  return (
    <path
      className={className}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
      d={`M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`}
      fill={paint('cloud')}
      stroke={paint('sunshine-deep')}
      strokeWidth={1.4}
      strokeLinejoin="round"
    />
  );
}

/**
 * The warm halo of a lit lamp or lantern at sunset: flat translucent rings (no gradients) that
 * breathe with the theme's shimmer loop.
 */
export function Glow({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g data-glow="on">
      <circle
        className="motion-loop art-loop"
        style={{ animation: 'var(--animate-shimmer)' }}
        cx={x}
        cy={y}
        r={r}
        fill={paint('sunshine')}
        opacity={0.4}
      />
      <circle cx={x} cy={y} r={r * 0.62} fill={paint('sunshine-light')} opacity={0.75} />
    </g>
  );
}

/**
 * Idle loops (05 §11: "flags flutter, windmill turns…"), all from art.css and the theme, so all of
 * them stop under reduced motion (06 §7): `spin` is art.css's `art-spin`; the others are the
 * theme's animation tokens, which become `none` under reduced motion.
 */
export type LoopKind = 'spin' | 'sway' | 'flutter' | 'bob' | 'shimmer';

const LOOP_TOKEN: Record<Exclude<LoopKind, 'spin'>, string> = {
  sway: 'var(--animate-sway)',
  flutter: 'var(--animate-flutter)',
  bob: 'var(--animate-bob)',
  shimmer: 'var(--animate-shimmer)',
};

/**
 * A looping group. CSS transforms replace an element's SVG `transform` attribute, so the loop sits
 * on its own group; `origin` is the pivot in the group's own box (for example "50% 0%" to hang
 * from the top). `delay` (s) starts the loop part-way through, so neighbours don't move in step.
 */
export function Loop({
  kind,
  origin = '50% 50%',
  delay = 0,
  children,
}: {
  kind: LoopKind;
  origin?: string;
  delay?: number;
  children: ReactNode;
}) {
  // The shorthand comes first so the delay longhand applies on top of it.
  const style: CSSProperties = kind === 'spin' ? {} : { animation: LOOP_TOKEN[kind] };
  style.transformOrigin = origin;
  if (delay) style.animationDelay = `${-delay}s`;
  return (
    <g
      className={kind === 'spin' ? 'motion-loop art-loop art-spin' : 'motion-loop art-loop'}
      style={style}
      data-loop={kind}
    >
      {children}
    </g>
  );
}

/** A five-petal flower head (tulips and daisies use their own shapes). */
export function Blossom({
  x,
  y,
  r,
  petal,
  center = 'sunshine',
}: {
  x: number;
  y: number;
  r: number;
  petal: PaletteColor;
  center?: PaletteColor;
}) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse
          key={a}
          cx={x + Math.cos(((a - 90) * Math.PI) / 180) * r * 0.62}
          cy={y + Math.sin(((a - 90) * Math.PI) / 180) * r * 0.62}
          rx={r * 0.48}
          ry={r * 0.48}
          {...filled(petal, 1.6)}
        />
      ))}
      <circle cx={x} cy={y} r={r * 0.36} {...filled(center, 1.4)} />
    </g>
  );
}

/** A rounded stem with a leaf. */
export function Stem({ x, y, h, lean = 0 }: { x: number; y: number; h: number; lean?: number }) {
  return (
    <g>
      <path
        d={`M${x} ${y}q${lean * 0.5} ${-h * 0.5} ${lean} ${-h}`}
        fill="none"
        stroke={paint('leaf-deep')}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      <path
        d={`M${x + lean * 0.2} ${y - h * 0.3}q7 -3 9 -10q-8 1 -9 10z`}
        {...filled('leaf', 1.6)}
      />
    </g>
  );
}

/** The pool of warm light a lit lamp casts on the ground at sunset. */
export function LightPool({ x = 0, y = G1, rx }: { x?: number; y?: number; rx: number }) {
  return (
    <ellipse cx={x} cy={y} rx={rx} ry={rx * 0.3} fill={paint('sunshine-light')} opacity={0.7} />
  );
}

/** A dark iron post (lamps, chimes): ink keeps it ≥ 3:1 on sand and grass (decor/contrast.ts). */
export function Post({
  x,
  top,
  bottom,
  w = 5,
}: {
  x: number;
  top: number;
  bottom: number;
  w?: number;
}) {
  return (
    <rect
      x={x - w / 2}
      y={top}
      width={w}
      height={bottom - top}
      rx={w / 2}
      fill={paint('ink-soft')}
      stroke={paint('ink')}
      strokeWidth={2}
    />
  );
}

const f = (n: number) => Number(n.toFixed(2));

/**
 * A scallop-shell fan: the upper half of a circle around (cx, cy) with `n` rounded bumps, and the
 * ribs from the hinge to each bump.
 */
export function scallopFan(cx: number, cy: number, r: number, n: number) {
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const a = Math.PI + (i * Math.PI) / n;
    return { x: f(cx + Math.cos(a) * r), y: f(cy + Math.sin(a) * r) };
  });
  const s = f(Math.sin(Math.PI / n / 2) * r * 1.05);
  let d = `M${pts[0]?.x} ${pts[0]?.y}`;
  for (const p of pts.slice(1)) d += `A${s} ${s} 0 0 1 ${p.x} ${p.y}`;
  d += 'Z';
  const ribs = pts
    .slice(1, -1)
    .map((p) => `M${cx} ${cy}L${f(cx + (p.x - cx) * 0.86)} ${f(cy + (p.y - cy) * 0.86)}`);
  return { d, ribs };
}

/** A bumpy blob (bushes, clouds, leafy crowns): `n` rounded bumps around an ellipse. */
export function bumpyBlob(cx: number, cy: number, rx: number, ry: number, n: number, bump = 1) {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i * 2 * Math.PI) / n - Math.PI / 2;
    return { x: f(cx + Math.cos(a) * rx), y: f(cy + Math.sin(a) * ry) };
  });
  let d = `M${pts[0]?.x} ${pts[0]?.y}`;
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n] as { x: number; y: number };
    const q = pts[i - 1] as { x: number; y: number };
    const s = f((Math.hypot(p.x - q.x, p.y - q.y) / 2) * bump);
    d += `A${s} ${s} 0 0 1 ${p.x} ${p.y}`;
  }
  return `${d}Z`;
}

/** A point and unit normal on a quadratic Bézier, for rings along trunks and strings. */
export function quadAt(
  a: { x: number; y: number },
  c: { x: number; y: number },
  b: { x: number; y: number },
  t: number,
) {
  const u = 1 - t;
  const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
  const y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
  const dx = 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x);
  const dy = 2 * u * (c.y - a.y) + 2 * t * (b.y - c.y);
  const len = Math.hypot(dx, dy) || 1;
  return { x: f(x), y: f(y), nx: -dy / len, ny: dx / len };
}

/** A small mound of soil a plant grows from. */
export function Soil({ x, y, rx }: { x: number; y: number; rx: number }) {
  return (
    <path
      d={`M${x - rx} ${y}q${rx} ${-rx * 0.5} ${rx * 2} 0q${-rx} ${rx * 0.3} ${-rx * 2} 0z`}
      {...filled('wood', 2)}
    />
  );
}
