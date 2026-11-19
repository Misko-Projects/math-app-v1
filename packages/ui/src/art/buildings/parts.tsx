import type { CSSProperties, ReactNode } from 'react';
import type { PaletteColor } from '../../tokens/tokens';
import { filled, hashSeed, OUTLINE_OF, outline, paint, STROKE, seededRandom } from '../core/paint';
import { ContactShadow, Highlight } from '../core/Shading';
import type { BuildingStage } from '../core/types';

/**
 * Shared building blocks for the island's buildings (05 §4, §6, §11). Every building is drawn in
 * scene units (one plot is 100 × 70) with the origin at the bottom-centre of its footprint, y up
 * negative, so the island hub can drop it on `plotBox(plot, footprint)`. Light comes from the
 * top-left; every fill is outlined in its OUTLINE_OF shade; each piece has one soft highlight and
 * stands on a contact shadow.
 */

/** What a building drawing receives: its stage, and whether the island is at sunset (lit). */
export interface DrawProps {
  stage: BuildingStage;
  lit: boolean;
}

export type Level = 1 | 2 | 3;

/** The level of a built stage (construction counts as 0, so `lv >= 2` reads naturally). */
export function levelOf(stage: BuildingStage): 0 | Level {
  return stage === 'construction' ? 0 : stage;
}

/** Props for a CSS idle loop on an SVG element (06 §7: `.motion-loop` stops under reduced motion). */
export function loop(
  animation: 'bob' | 'bob-slow' | 'sway' | 'smoke' | 'flutter' | 'shimmer' | 'pulse-soft',
  opts: { delay?: number; origin?: string } = {},
): { className: string; style: CSSProperties } {
  return {
    className: 'motion-loop art-loop',
    style: {
      animation: `var(--animate-${animation})`,
      animationDelay: opts.delay ? `${opts.delay}s` : undefined,
      transformOrigin: opts.origin,
    },
  };
}

/** A twinkle (art.css `art-glint`), staggered by `delay` seconds. */
export function glint(delay = 0): { className: string; style: CSSProperties } {
  return {
    className: 'motion-loop art-loop art-glint',
    style: { animationDelay: delay ? `${-delay}s` : undefined },
  };
}

const line = (color: PaletteColor, width: number = STROKE.detail) => ({
  fill: 'none',
  stroke: paint(color),
  strokeWidth: width,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/** A plain stroke in a palette colour (detail lines, poles, ropes). */
export { line as stroke };

/** The soft ground shadow a building stands on. */
export function Ground({ w, y = -4, ry }: { w: number; y?: number; ry?: number }) {
  return <ContactShadow cx={0} cy={y} rx={w / 2} ry={ry ?? Math.min(10, w * 0.08)} />;
}

/** Idle-loop elements that may leave the art box (smoke). Kept apart for the clipping checks. */
export function Fx({ children }: { children: ReactNode }) {
  return <g data-part="fx">{children}</g>;
}

// ---------------------------------------------------------------------------------------------
// Walls, roofs, windows and doors
// ---------------------------------------------------------------------------------------------

export interface WallProps {
  /** Left edge and base line. */
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: PaletteColor;
  /** Horizontal siding lines (wood) or a stone-block pattern. */
  texture?: 'siding' | 'planks' | 'stone' | 'brick' | 'none';
  rx?: number;
}

/** A wall block with its texture and a highlight along the lit (left) edge. */
export function Wall({ x, y, w, h, fill = 'paper', texture = 'none', rx = 3 }: WallProps) {
  const edge = OUTLINE_OF[fill];
  const marks: string[] = [];
  if (texture === 'siding') {
    for (let yy = y - 9; yy > y - h + 4; yy -= 9) marks.push(`M${x + 3} ${yy}H${x + w - 3}`);
  } else if (texture === 'planks') {
    for (let xx = x + 10; xx < x + w - 4; xx += 10) marks.push(`M${xx} ${y - 3}V${y - h + 4}`);
  } else if (texture === 'stone' || texture === 'brick') {
    const rowH = texture === 'brick' ? 7 : 11;
    const brickW = texture === 'brick' ? 14 : 20;
    let row = 0;
    for (let yy = y - rowH; yy > y - h + 3; yy -= rowH) {
      marks.push(`M${x + 3} ${yy}H${x + w - 3}`);
      const off = row % 2 === 0 ? brickW / 2 : 0;
      for (let xx = x + off + brickW / 2; xx < x + w - 4; xx += brickW) {
        marks.push(`M${xx} ${yy}V${Math.min(y - 3, yy + rowH)}`);
      }
      row++;
    }
  }
  return (
    <g>
      <rect x={x} y={y - h} width={w} height={h} rx={rx} {...filled(fill)} />
      {marks.length > 0 ? (
        <path d={marks.join('')} {...line(edge, 1.6)} opacity={texture === 'brick' ? 0.6 : 0.5} />
      ) : null}
      <path
        d={`M${x + 4} ${y - 6}V${y - h + 6}`}
        {...line('cloud', 3)}
        opacity={fill === 'paper' || fill === 'cloud' ? 0 : 0.35}
      />
    </g>
  );
}

export interface RoofProps {
  /** Centre x and the eave line (the wall top). */
  cx: number;
  y: number;
  w: number;
  h: number;
  fill?: PaletteColor;
  overhang?: number;
}

/** A pitched (gable) roof with a rounded ridge, tile rows and a highlight on the lit slope. */
export function Gable({ cx, y, w, h, fill = 'coral', overhang = 7 }: RoofProps) {
  const l = cx - w / 2 - overhang;
  const r = cx + w / 2 + overhang;
  const top = y - h;
  const rows: string[] = [];
  for (const t of [0.36, 0.68]) {
    const yy = y - t * h;
    const half = (1 - t) * (r - l) * 0.5 - 4;
    if (half > 6) rows.push(`M${cx - half} ${yy}H${cx + half}`);
  }
  return (
    <g>
      <path
        d={`M${l} ${y + 1}L${cx - 5} ${top + 4}Q${cx} ${top - 1} ${cx + 5} ${top + 4}L${r} ${y + 1}Q${r + 1} ${y + 5} ${r - 3} ${y + 5}H${l + 3}Q${l - 1} ${y + 5} ${l} ${y + 1}Z`}
        {...filled(fill)}
      />
      <path d={rows.join('')} {...line(OUTLINE_OF[fill], 2)} strokeDasharray="7 5" opacity={0.6} />
      <Highlight
        d={`M${l + 8} ${y - 2}L${cx - 6} ${top + 9}L${cx - 9} ${top + 14}L${l + 13} ${y - 2}Z`}
        opacity={0.32}
      />
    </g>
  );
}

/**
 * A lean-to roof over a wall of width w whose top is at y (sheds, porches, wings). It slopes down
 * to the right (or the left), and the wall's gable is filled up to it in `wall`.
 */
export function ShedRoof({
  x,
  y,
  w,
  rise = 10,
  fill = 'sunshine',
  overhang = 6,
  wall,
  down = 'right',
}: {
  x: number;
  y: number;
  w: number;
  rise?: number;
  fill?: PaletteColor;
  overhang?: number;
  wall?: PaletteColor;
  down?: 'right' | 'left';
}) {
  const hiX = down === 'right' ? x : x + w;
  const loX = down === 'right' ? x + w : x;
  const dir = down === 'right' ? 1 : -1;
  const hiEnd = hiX - dir * overhang;
  const loEnd = loX + dir * overhang;
  const slope = rise / w;
  return (
    <g>
      {wall ? (
        <path
          d={`M${hiX} ${y + 1}V${y - rise + 2}L${loX} ${y + 1}Z`}
          fill={paint(wall)}
          stroke={outline(wall)}
          strokeWidth={STROKE.outline}
          strokeLinejoin="round"
        />
      ) : null}
      <path
        d={`M${hiEnd} ${y - rise - 2 - overhang * slope}L${loEnd} ${y - 2 + overhang * slope}V${y + 4 + overhang * slope}L${hiEnd} ${y - rise + 4 - overhang * slope}Z`}
        {...filled(fill)}
      />
      <path
        d={`M${hiEnd + dir * 6} ${y - rise + 0.5}L${loEnd - dir * 10} ${y - 3}`}
        {...line('cloud', 2.5)}
        opacity={0.4}
      />
    </g>
  );
}

/** A cone or pyramid roof for towers. */
export function Cone({ cx, y, w, h, fill = 'sea-deep', overhang = 5 }: RoofProps) {
  const l = cx - w / 2 - overhang;
  const r = cx + w / 2 + overhang;
  return (
    <g>
      <path
        d={`M${l} ${y + 2}Q${cx - w * 0.15} ${y - h * 0.45} ${cx} ${y - h}Q${cx + w * 0.15} ${y - h * 0.45} ${r} ${y + 2}Q${cx} ${y + 7} ${l} ${y + 2}Z`}
        {...filled(fill)}
      />
      <path
        d={`M${cx - w * 0.28} ${y - 2}Q${cx - w * 0.12} ${y - h * 0.45} ${cx - 2} ${y - h + 8}`}
        {...line('cloud', 3)}
        opacity={0.35}
      />
    </g>
  );
}

/** A dome (kilns, cupolas, the reef house), resting on y. */
export function Dome({
  cx,
  y,
  w,
  h,
  fill = 'sea',
}: {
  cx: number;
  y: number;
  w: number;
  h: number;
  fill?: PaletteColor;
}) {
  return (
    <g>
      <path
        d={`M${cx - w / 2} ${y}C${cx - w / 2} ${y - h * 1.3} ${cx + w / 2} ${y - h * 1.3} ${cx + w / 2} ${y}Z`}
        {...filled(fill)}
      />
      <path
        d={`M${cx - w * 0.32} ${y - h * 0.3}Q${cx - w * 0.26} ${y - h * 0.78} ${cx - w * 0.05} ${y - h * 0.86}`}
        {...line('cloud', 3)}
        opacity={0.4}
      />
    </g>
  );
}

/** A striped awning (shop fronts, stalls) with a scalloped edge. */
export function Awning({
  x,
  y,
  w,
  h = 14,
  stripe = 'coral',
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  stripe?: PaletteColor;
}) {
  const n = Math.max(3, Math.round(w / 12));
  const sw = w / n;
  const stripes: ReactNode[] = [];
  let scallop = `M${x} ${y}`;
  for (let i = 0; i < n; i++) {
    const sx = x + i * sw;
    stripes.push(
      <path
        key={`s${sx.toFixed(1)}`}
        d={`M${sx} ${y - h}H${sx + sw}V${y}Q${sx + sw / 2} ${y + 6} ${sx} ${y}Z`}
        fill={paint(i % 2 === 0 ? stripe : 'cloud')}
      />,
    );
    scallop += `Q${sx + sw / 2} ${y + 6} ${sx + sw} ${y}`;
  }
  return (
    <g>
      {stripes}
      <path
        d={`${scallop}V${y - h}H${x}Z`}
        fill="none"
        stroke={outline(stripe)}
        strokeWidth={STROKE.outline}
        strokeLinejoin="round"
      />
    </g>
  );
}

export interface WindowProps {
  /** Centre. */
  x: number;
  y: number;
  w?: number;
  h?: number;
  lit: boolean;
  shape?: 'square' | 'round' | 'arch' | 'triangle';
  /** Frame colour (default wood-deep: ≥ 3:1 on paper and sand walls, see contrast.ts). */
  frame?: PaletteColor;
}

/**
 * A window. By day the pane shows the sky with a glint; at sunset it glows (sunshine-light) inside a
 * soft halo of its own shape, so "lit" reads by shape as well as colour (06 §7).
 */
export function Window({ x, y, w = 14, h = 14, lit, shape = 'square', frame }: WindowProps) {
  const edge = paint(frame ?? 'wood-deep');
  const pane = paint(lit ? 'sunshine-light' : 'sky-light');
  const common = { fill: pane, stroke: edge, strokeWidth: 2.5, strokeLinejoin: 'round' as const };
  let pane$: ReactNode;
  let halo: ReactNode = null;
  let bars = '';
  if (shape === 'round') {
    const r = w / 2;
    if (lit)
      halo = <circle cx={x} cy={y} r={r + 6} fill={paint('sunshine-light')} opacity={0.65} />;
    pane$ = <circle cx={x} cy={y} r={r} {...common} />;
    bars = `M${x - r + 2} ${y}H${x + r - 2}M${x} ${y - r + 2}V${y + r - 2}`;
  } else if (shape === 'triangle') {
    const p = `M${x} ${y - h / 2}L${x + w / 2} ${y + h / 2}H${x - w / 2}Z`;
    if (lit)
      halo = (
        <path
          d={p}
          transform={`translate(${x} ${y}) scale(1.7) translate(${-x} ${-y})`}
          fill={paint('sunshine-light')}
          opacity={0.65}
        />
      );
    pane$ = <path d={p} {...common} />;
    bars = `M${x} ${y - h / 2 + 4}V${y + h / 2 - 1}`;
  } else {
    const top = shape === 'arch' ? w / 2 : 2.5;
    const d =
      shape === 'arch'
        ? `M${x - w / 2} ${y + h / 2}V${y - h / 2 + top}A${w / 2} ${w / 2} 0 0 1 ${x + w / 2} ${y - h / 2 + top}V${y + h / 2}Z`
        : '';
    if (lit)
      halo = (
        <rect
          x={x - w / 2 - 6}
          y={y - h / 2 - 6}
          width={w + 12}
          height={h + 12}
          rx={shape === 'arch' ? w / 2 + 6 : 7}
          fill={paint('sunshine-light')}
          opacity={0.65}
        />
      );
    pane$ =
      shape === 'arch' ? (
        <path d={d} {...common} />
      ) : (
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={2.5} {...common} />
      );
    bars = `M${x - w / 2 + 2} ${y + (shape === 'arch' ? 2 : 0)}H${x + w / 2 - 2}M${x} ${y - h / 2 + 2}V${y + h / 2 - 2}`;
  }
  return (
    <g data-part={lit ? 'window-lit' : 'window'}>
      {halo}
      {pane$}
      <path d={bars} stroke={edge} strokeWidth={2} strokeLinecap="round" fill="none" />
      {lit ? null : (
        <path
          d={`M${x - w / 2 + 3} ${y - 1}l${Math.min(5, w / 3)} ${-Math.min(5, h / 3)}`}
          {...line('cloud', 2.5)}
          opacity={0.9}
        />
      )}
    </g>
  );
}

/** A door (bottom-centre at x, y), arched or round-topped, with a knob and a doorstep. */
export function Door({
  x,
  y,
  w = 16,
  h = 24,
  fill = 'wood',
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  fill?: PaletteColor;
}) {
  const r = w / 2;
  return (
    <g>
      <rect x={x - r - 3} y={y - 2} width={w + 6} height={5} rx={2} {...filled('pebble', 2)} />
      <path
        d={`M${x - r} ${y - 1}V${y - h + r}A${r} ${r} 0 0 1 ${x + r} ${y - h + r}V${y - 1}Z`}
        {...filled(fill)}
      />
      <path
        d={`M${x - r / 3} ${y - 3}V${y - h + r + 1}M${x + r / 3} ${y - 3}V${y - h + r + 1}`}
        {...line(OUTLINE_OF[fill], 1.5)}
        opacity={0.55}
      />
      <circle cx={x + r * 0.5} cy={y - h * 0.42} r={1.8} fill={paint('sunshine-deep')} />
    </g>
  );
}

/** A chimney (bottom-left x, y) whose smoke is drawn separately with <Smoke>. */
export function Chimney({
  x,
  y,
  w = 12,
  h = 20,
  fill = 'pebble',
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  fill?: PaletteColor;
}) {
  return (
    <g>
      <rect x={x} y={y - h} width={w} height={h + 6} rx={2} {...filled(fill)} />
      <rect x={x - 2} y={y - h - 4} width={w + 4} height={6} rx={2} {...filled(fill)} />
    </g>
  );
}

/**
 * Chimney smoke (05 §11 idle loop): three puffs rising and fading. Standing still (reduced motion,
 * snapshots) they read as a small curl of smoke.
 */
export function Smoke({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  const puffs = [
    { dx: 0, dy: 0, r: 5, d: 0 },
    { dx: 4, dy: -10, r: 6.5, d: 1.5 },
    { dx: 9, dy: -22, r: 8, d: 3 },
  ];
  return (
    <Fx>
      {puffs.map((p) => {
        const l = loop('smoke', { delay: -(p.d + delay) });
        return (
          <circle
            key={p.d}
            className={l.className}
            style={l.style}
            cx={x + p.dx}
            cy={y + p.dy}
            r={p.r}
            {...filled('cloud', 2)}
            opacity={0.92}
          />
        );
      })}
    </Fx>
  );
}

// ---------------------------------------------------------------------------------------------
// Flags, bunting, lanterns and sparkle
// ---------------------------------------------------------------------------------------------

/** A flag on a pole (bottom of the pole at x, y), fluttering. */
export function Flag({
  x,
  y,
  h = 30,
  w = 18,
  fill = 'coral',
  delay = 0,
}: {
  x: number;
  y: number;
  h?: number;
  w?: number;
  fill?: PaletteColor;
  delay?: number;
}) {
  const l = loop('flutter', { delay: -delay, origin: '0% 50%' });
  return (
    <g data-part="flag">
      <path d={`M${x} ${y}V${y - h}`} {...line('wood-deep', 3)} />
      <path
        className={l.className}
        style={l.style}
        d={`M${x + 1.5} ${y - h + 1}Q${x + w * 0.55} ${y - h - 2} ${x + w} ${y - h + 6}Q${x + w * 0.55} ${y - h + 9} ${x + 1.5} ${y - h + 13}Z`}
        {...filled(fill, 2.5)}
      />
      <circle cx={x} cy={y - h - 2} r={2.6} {...filled('sunshine', 1.5)} />
    </g>
  );
}

const BUNTING: readonly PaletteColor[] = ['coral', 'sunshine', 'sea', 'leaf-light', 'sun'];

/** A sagging string of pennants between two points. */
export function Bunting({
  x1,
  y1,
  x2,
  y2,
  sag = 8,
  n = 6,
  colors = BUNTING,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  sag?: number;
  n?: number;
  colors?: readonly PaletteColor[];
}) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 + sag * 2;
  const at = (t: number) => ({
    x: (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t ** 2 * x2,
    y: (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t ** 2 * y2,
  });
  const flags = Array.from({ length: n }, (_, i) => at((i + 0.5) / n));
  return (
    <g data-part="bunting">
      <path d={`M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`} {...line('wood-deep', 1.8)} />
      {flags.map((p, i) => {
        const fill = colors[i % colors.length] ?? 'coral';
        const l = loop('flutter', { delay: -i * 0.35, origin: '50% 0%' });
        return (
          <path
            key={`b${p.x.toFixed(1)}`}
            className={l.className}
            style={l.style}
            d={`M${p.x - 4.5} ${p.y - 0.5}L${p.x + 4.5} ${p.y - 0.5}L${p.x} ${p.y + 9}Z`}
            {...filled(fill, 1.6)}
          />
        );
      })}
    </g>
  );
}

/** A soft glow halo (sunset): a filled disc plus a faint outer ring, so glow reads by shape too. */
export function Glow({ x, y, r }: { x: number; y: number; r: number }) {
  const l = loop('shimmer');
  return (
    <g data-part="glow">
      <circle cx={x} cy={y} r={r} fill={paint('sunshine-light')} opacity={0.5} />
      <circle
        className={l.className}
        style={l.style}
        cx={x}
        cy={y}
        r={r * 1.35}
        fill={paint('sunshine-light')}
        opacity={0.6}
      />
    </g>
  );
}

/**
 * A paper lantern hanging from (x, y - hang), body centred at (x, y). By day it is a coloured paper
 * lantern; at sunset it glows inside a halo and twinkles.
 */
export function Lantern({
  x,
  y,
  lit,
  hang = 8,
  fill = 'sunshine',
  delay = 0,
  s = 1,
}: {
  x: number;
  y: number;
  lit: boolean;
  hang?: number;
  fill?: PaletteColor;
  delay?: number;
  s?: number;
}) {
  const sway = loop('sway', { delay: -delay, origin: '50% 0%' });
  return (
    <g data-part={lit ? 'lantern-lit' : 'lantern'}>
      {lit ? <Glow x={x} y={y} r={9 * s} /> : null}
      <g className={sway.className} style={sway.style}>
        <path d={`M${x} ${y - hang * s}V${y - 6 * s}`} {...line('wood-deep', 1.6)} />
        <ellipse
          cx={x}
          cy={y}
          rx={5.6 * s}
          ry={7 * s}
          fill={paint(lit ? 'sunshine-light' : fill)}
          stroke={paint('ink')}
          strokeWidth={2}
        />
        <path
          d={`M${x} ${y - 6 * s}V${y + 6 * s}M${x - 3.6 * s} ${y - 4.5 * s}Q${x - 5.5 * s} ${y} ${x - 3.6 * s} ${y + 4.5 * s}`}
          {...line('ink-soft', 1.2)}
          opacity={0.6}
        />
        <rect
          x={x - 3.5 * s}
          y={y - 8.5 * s}
          width={7 * s}
          height={3 * s}
          rx={1}
          {...filled('wood-deep', 1.2)}
        />
        <rect
          x={x - 3 * s}
          y={y + 6 * s}
          width={6 * s}
          height={2.4 * s}
          rx={1}
          {...filled('wood-deep', 1.2)}
        />
      </g>
      {lit ? <Sparkle x={x + 8 * s} y={y - 8 * s} s={0.55 * s} delay={delay + 0.8} /> : null}
    </g>
  );
}

/** A four-point sparkle that twinkles (gems, stars, lit lanterns). */
export function Sparkle({
  x,
  y,
  s = 1,
  delay = 0,
  fill = 'sunshine-light',
}: {
  x: number;
  y: number;
  s?: number;
  delay?: number;
  fill?: PaletteColor;
}) {
  const g = glint(delay);
  return (
    <path
      className={g.className}
      style={g.style}
      d={`M${x} ${y - 9 * s}Q${x + 1.6 * s} ${y - 1.6 * s} ${x + 9 * s} ${y}Q${x + 1.6 * s} ${y + 1.6 * s} ${x} ${y + 9 * s}Q${x - 1.6 * s} ${y + 1.6 * s} ${x - 9 * s} ${y}Q${x - 1.6 * s} ${y - 1.6 * s} ${x} ${y - 9 * s}Z`}
      fill={paint(fill)}
      stroke={paint('sunshine-deep')}
      strokeWidth={1.4}
      strokeLinejoin="round"
    />
  );
}

/** A five-point star (Puzzle Tower, the festival stage). */
export function Star({
  x,
  y,
  r,
  fill = 'sunshine',
}: {
  x: number;
  y: number;
  r: number;
  fill?: PaletteColor;
}) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.48;
    pts.push(`${(x + Math.cos(a) * rr).toFixed(2)} ${(y + Math.sin(a) * rr).toFixed(2)}`);
  }
  return (
    <g data-part="star">
      <path
        d={`M${pts.join('L')}Z`}
        fill={paint(fill)}
        stroke={paint('ink')}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path
        d={`M${x - r * 0.38} ${y - r * 0.08}L${x - r * 0.1} ${y - r * 0.5}`}
        {...line('cloud', 2.5)}
        opacity={0.7}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// Nature and props
// ---------------------------------------------------------------------------------------------

/** A bumpy round outline (tree canopies, bushes, the burrow's turf). */
export function blobPath(cx: number, cy: number, rx: number, ry = rx, bumps = 7, phase = 0) {
  let d = '';
  for (let i = 0; i <= bumps; i++) {
    const a = phase + (i * 2 * Math.PI) / bumps - Math.PI / 2;
    const px = cx + Math.cos(a) * rx;
    const py = cy + Math.sin(a) * ry;
    if (i === 0) {
      d = `M${px.toFixed(2)} ${py.toFixed(2)}`;
      continue;
    }
    const m = a - Math.PI / bumps;
    const qx = cx + Math.cos(m) * rx * 1.22;
    const qy = cy + Math.sin(m) * ry * 1.22;
    d += `Q${qx.toFixed(2)} ${qy.toFixed(2)} ${px.toFixed(2)} ${py.toFixed(2)}`;
  }
  return `${d}Z`;
}

/** A round tree (trunk base at x, y) that sways gently, optionally with fruit. */
export function Tree({
  x,
  y,
  r = 22,
  trunk = 20,
  fill = 'leaf',
  fruit,
  delay = 0,
  children,
}: {
  x: number;
  y: number;
  r?: number;
  trunk?: number;
  fill?: PaletteColor;
  fruit?: PaletteColor;
  delay?: number;
  /** Things hung on the tree (lanterns), drawn over the canopy and swaying with it. */
  children?: ReactNode;
}) {
  const cy = y - trunk - r * 0.7;
  const sway = loop('sway', { delay: -delay, origin: '50% 100%' });
  const fruitAt = fruit
    ? [
        [-0.45, 0.05],
        [0.35, -0.25],
        [0.05, 0.4],
        [0.5, 0.3],
        [-0.15, -0.45],
      ]
    : [];
  return (
    <g data-part="tree" className={sway.className} style={sway.style}>
      <path
        d={`M${x - 4} ${y}Q${x - 2} ${y - trunk * 0.6} ${x - 3} ${cy + r * 0.4}H${x + 3}Q${x + 2} ${y - trunk * 0.6} ${x + 4} ${y}Z`}
        {...filled('wood')}
      />
      <path d={blobPath(x, cy, r, r * 0.92, 7, delay)} {...filled(fill)} />
      <path
        d={`M${x - r * 0.55} ${cy - r * 0.1}Q${x - r * 0.45} ${cy - r * 0.62} ${x - r * 0.02} ${cy - r * 0.68}`}
        {...line('leaf-light', 4)}
        opacity={0.85}
      />
      {fruitAt.map(([fx, fy]) => (
        <circle
          key={`${fx}${fy}`}
          cx={x + (fx ?? 0) * r}
          cy={cy + (fy ?? 0) * r}
          r={3.6}
          {...filled(fruit ?? 'coral', 1.8)}
        />
      ))}
      {children}
    </g>
  );
}

/** A palm tree (trunk base at x, y). */
export function Palm({
  x,
  y,
  h = 56,
  delay = 0,
}: {
  x: number;
  y: number;
  h?: number;
  delay?: number;
}) {
  const sway = loop('sway', { delay: -delay, origin: '50% 100%' });
  const tx = x + 8;
  const ty = y - h;
  const fronds = [
    `M${tx} ${ty}Q${tx - 16} ${ty - 12} ${tx - 30} ${ty + 4}Q${tx - 16} ${ty - 4} ${tx} ${ty}Z`,
    `M${tx} ${ty}Q${tx + 16} ${ty - 14} ${tx + 30} ${ty + 2}Q${tx + 15} ${ty - 4} ${tx} ${ty}Z`,
    `M${tx} ${ty}Q${tx - 6} ${ty - 18} ${tx - 20} ${ty - 22}Q${tx - 8} ${ty - 12} ${tx} ${ty}Z`,
    `M${tx} ${ty}Q${tx + 8} ${ty - 18} ${tx + 22} ${ty - 20}Q${tx + 8} ${ty - 10} ${tx} ${ty}Z`,
    `M${tx} ${ty}Q${tx - 4} ${ty + 4} ${tx - 18} ${ty + 16}Q${tx - 6} ${ty + 2} ${tx} ${ty}Z`,
  ];
  return (
    <g data-part="palm" className={sway.className} style={sway.style}>
      <path
        d={`M${x - 4} ${y}Q${x - 2} ${y - h * 0.6} ${tx - 3} ${ty + 2}H${tx + 3}Q${x + 5} ${y - h * 0.6} ${x + 4} ${y}Z`}
        {...filled('wood')}
      />
      <path
        d={`M${x - 3} ${y - h * 0.25}h7M${x - 2} ${y - h * 0.5}h7M${x} ${y - h * 0.75}h7`}
        {...line('wood-deep', 1.6)}
        opacity={0.7}
      />
      {fronds.map((d) => (
        <path key={d} d={d} {...filled('leaf', 2.4)} />
      ))}
      <circle cx={tx - 3} cy={ty + 4} r={3.5} {...filled('wood-deep', 1.5)} />
      <circle cx={tx + 3} cy={ty + 5} r={3.5} {...filled('wood-deep', 1.5)} />
    </g>
  );
}

/** A low round bush. */
export function Bush({
  x,
  y,
  r = 10,
  fill = 'leaf',
}: {
  x: number;
  y: number;
  r?: number;
  fill?: PaletteColor;
}) {
  return (
    <g>
      <path d={`${blobPath(x, y - r * 0.6, r, r * 0.7, 5, 0.3)}`} {...filled(fill, 2.5)} />
      <path
        d={`M${x - r * 0.5} ${y - r * 0.8}q${r * 0.3} ${-r * 0.4} ${r * 0.6} ${-r * 0.35}`}
        {...line('leaf-light', 2.5)}
      />
    </g>
  );
}

const FLOWER_COLORS: readonly PaletteColor[] = ['coral', 'sunshine', 'cloud', 'sun'];

/** A little row of flowers along y. */
export function Flowers({
  x,
  y,
  n = 3,
  gap = 9,
}: {
  x: number;
  y: number;
  n?: number;
  gap?: number;
}) {
  return (
    <g data-part="flowers">
      {Array.from({ length: n }, (_, i) => {
        const fx = x + i * gap;
        const fy = y - 6 - (i % 2) * 3;
        const c = FLOWER_COLORS[i % FLOWER_COLORS.length] ?? 'coral';
        return (
          <g key={`fl${fx}`}>
            <path d={`M${fx} ${y}V${fy}`} {...line('leaf-deep', 1.8)} />
            <circle cx={fx} cy={fy} r={3.2} {...filled(c, 1.5)} />
            <circle
              cx={fx}
              cy={fy}
              r={1.2}
              fill={paint(c === 'sunshine' ? 'sun-deep' : 'sunshine')}
            />
          </g>
        );
      })}
    </g>
  );
}

/** A low picket fence from x1 to x2 on y. */
export function Fence({ x1, x2, y, h = 12 }: { x1: number; x2: number; y: number; h?: number }) {
  const posts: number[] = [];
  for (let x = x1; x <= x2 + 0.1; x += 8) posts.push(x);
  return (
    <g data-part="fence">
      <path d={`M${x1 - 2} ${y - h * 0.65}H${x2 + 2}`} {...line('wood-deep', 4.5)} />
      <path d={`M${x1 - 2} ${y - h * 0.65}H${x2 + 2}`} {...line('paper', 2)} />
      {posts.map((x) => (
        <path
          key={`p${x}`}
          d={`M${x - 2.2} ${y}V${y - h + 2}L${x} ${y - h}L${x + 2.2} ${y - h + 2}V${y}Z`}
          {...filled('paper', 1.6)}
        />
      ))}
    </g>
  );
}

/** A wooden crate (bottom-left at x, y). */
export function Crate({
  x,
  y,
  s = 14,
  fill = 'wood',
}: {
  x: number;
  y: number;
  s?: number;
  fill?: PaletteColor;
}) {
  return (
    <g data-part="crate">
      <rect x={x} y={y - s} width={s} height={s} rx={1.8} {...filled(fill, 2.2)} />
      <path
        d={`M${x + 2.5} ${y - 2.5}L${x + s - 2.5} ${y - s + 2.5}M${x + 2.5} ${y - s + 2.5}L${x + s - 2.5} ${y - 2.5}`}
        {...line(OUTLINE_OF[fill], 1.6)}
        opacity={0.75}
      />
      <path d={`M${x + 2.5} ${y - s + 3}h${s * 0.4}`} {...line('cloud', 2)} opacity={0.5} />
    </g>
  );
}

/** A barrel (bottom-centre at x, y). */
export function Barrel({ x, y, h = 16 }: { x: number; y: number; h?: number }) {
  const w = h * 0.78;
  return (
    <g data-part="barrel">
      <path
        d={`M${x - w / 2} ${y}Q${x - w / 2 - 3} ${y - h / 2} ${x - w / 2} ${y - h}H${x + w / 2}Q${x + w / 2 + 3} ${y - h / 2} ${x + w / 2} ${y}Z`}
        {...filled('wood', 2.2)}
      />
      <path
        d={`M${x - w / 2 - 0.5} ${y - h * 0.28}H${x + w / 2 + 0.5}M${x - w / 2 - 0.5} ${y - h * 0.72}H${x + w / 2 + 0.5}`}
        {...line('ink-soft', 2)}
      />
    </g>
  );
}

/** A grey shore rock (bottom-centre at x, y). */
export function Rock({ x, y, w = 24, h = 14 }: { x: number; y: number; w?: number; h?: number }) {
  return (
    <g>
      <path
        d={`M${x - w / 2} ${y}Q${x - w / 2 - 1} ${y - h * 0.8} ${x - w * 0.12} ${y - h}Q${x + w * 0.35} ${y - h * 1.05} ${x + w / 2} ${y - h * 0.35}Q${x + w / 2 + 1} ${y} ${x + w * 0.3} ${y}Z`}
        {...filled('pebble', 2.5)}
      />
      <path
        d={`M${x - w * 0.3} ${y - h * 0.55}Q${x - w * 0.2} ${y - h * 0.85} ${x} ${y - h * 0.86}`}
        {...line('cloud', 2.5)}
        opacity={0.7}
      />
    </g>
  );
}

/** How far below the anchor (the footprint's front edge) a water inlet runs: past the beach and lip. */
export const WATER_EDGE = 30;

/** How far the shallows rim reaches beyond the water, and the most any edge wobbles. */
const WATER_RIM = 6;
const WATER_WOBBLE = 3;

/**
 * A soft pond outline inside a box: a rounded superellipse whose edge swells and dips gently in a
 * few long, smooth waves (within ±WATER_WOBBLE; the phases come from `seed`, so it is the same on
 * every load), drawn as a closed smooth spline. Loops with the same seed swell together, so a rim
 * drawn round a pool keeps an even width. It never leaves the box.
 */
function blobLoop(b: { x: number; y: number; w: number; h: number }, seed: number): string {
  const rnd = seededRandom(seed);
  const [p2, p3] = [rnd() * 2 * Math.PI, rnd() * 2 * Math.PI];
  const n = 32;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const rx = b.w / 2 - WATER_WOBBLE;
  const ry = b.h / 2 - WATER_WOBBLE;
  const pts = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * 2 * Math.PI;
    const o = WATER_WOBBLE * (0.6 * Math.sin(2 * t + p2) + 0.4 * Math.sin(3 * t + p3));
    // Exponent 2.6: rounder than a rectangle, fuller than an ellipse (room for piers and boats).
    const c = Math.cos(t);
    const s = Math.sin(t);
    const px = Math.sign(c) * Math.abs(c) ** (2 / 2.6);
    const py = Math.sign(s) * Math.abs(s) ** (2 / 2.6);
    return { x: cx + px * (rx + o), y: cy + py * (ry + o) };
  });
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const at = (i: number) => pts[(i + n) % n] as { x: number; y: number };
  let d = `M${r1(at(0).x)} ${r1(at(0).y)}`;
  for (let i = 0; i < n; i++) {
    const [q0, q1, q2, q3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${r1(q1.x + (q2.x - q0.x) / 6)} ${r1(q1.y + (q2.y - q0.y) / 6)} ${r1(q2.x - (q3.x - q1.x) / 6)} ${r1(q2.y - (q3.y - q1.y) / 6)} ${r1(q2.x)} ${r1(q2.y)}`;
  }
  return `${d}Z`;
}

/**
 * A little cove (docks, piers, the ferry, the bridge): an organic pool of sea with a pale shallows
 * rim and a broken foam line, the same colours as the island's own shallows halo. It runs from `y`
 * (behind the footprint's front edge) forward to just short of WATER_EDGE, so on a coast plot it
 * spills over the beach and the island's lip into the sea's halo and reads as part of the shore;
 * standalone it is a whole, soft-edged pool. Every edge is a smooth wobbling curve (05 §11: soft
 * rounded shapes, no straight edges), and the rim stays inside the art box (BUILDING_PAD.water).
 */
export function Water({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const foam = loop('shimmer');
  const front = WATER_EDGE - WATER_RIM;
  const seed = hashSeed(Math.round(x), Math.round(w));
  const pool = (o: number) =>
    blobLoop({ x: x - o, y: y - o, w: w + 2 * o, h: front - y + 2 * o }, seed);
  const body = pool(0);
  const rim = pool(WATER_RIM);
  const deep = pool(-Math.min(14, h / 4));
  return (
    <g data-part="water">
      <path d={rim} fill={paint('shallows')} />
      <path d={body} fill={paint('sea')} />
      <path d={deep} fill={paint('sea-deep')} opacity={0.35} />
      <path
        d={body}
        fill="none"
        stroke={paint('foam')}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="22 7 9 7"
        opacity={0.9}
      />
      <path
        className={foam.className}
        style={foam.style}
        d={`M${x + w * 0.12} ${y + h * 0.62}q5 -4 10 0t10 0M${x + w * 0.62} ${y + h * 0.75}q5 -4 10 0t10 0M${x + w * 0.4} ${y + h * 0.4}q4 -3 8 0`}
        {...line('foam', 2.2)}
      />
    </g>
  );
}

/** A wooden post or pile driven into the ground or water. */
export function Post({ x, y, h, w = 6 }: { x: number; y: number; h: number; w?: number }) {
  return <rect x={x - w / 2} y={y - h} width={w} height={h} rx={2} {...filled('wood', 2.2)} />;
}

/** A plank deck (pier, bridge, stage) from x1 to x2 at y, `t` thick, with board seams. */
export function Deck({
  x1,
  x2,
  y,
  t = 8,
  fill = 'wood',
}: {
  x1: number;
  x2: number;
  y: number;
  t?: number;
  fill?: PaletteColor;
}) {
  const seams: string[] = [];
  for (let x = x1 + 12; x < x2 - 4; x += 12) seams.push(`M${x} ${y + 1.5}V${y + t - 1.5}`);
  return (
    <g data-part="deck">
      <rect x={x1} y={y} width={x2 - x1} height={t} rx={2} {...filled(fill)} />
      <path d={seams.join('')} {...line(OUTLINE_OF[fill], 1.5)} opacity={0.6} />
      <path
        d={`M${x1 + 4} ${y + 2.5}H${x1 + (x2 - x1) * 0.4}`}
        {...line('cloud', 2)}
        opacity={0.4}
      />
    </g>
  );
}

/** A rope railing between posts along a deck. */
export function Railing({
  x1,
  x2,
  y,
  h = 12,
  step = 24,
}: {
  x1: number;
  x2: number;
  y: number;
  h?: number;
  step?: number;
}) {
  const posts: number[] = [];
  for (let x = x1; x <= x2 + 0.1; x += step) posts.push(x);
  let rope = `M${x1} ${y - h + 2}`;
  for (let i = 1; i < posts.length; i++) {
    const a = posts[i - 1] ?? x1;
    const b = posts[i] ?? x2;
    rope += `Q${(a + b) / 2} ${y - h + 8} ${b} ${y - h + 2}`;
  }
  return (
    <g data-part="railing">
      {posts.map((x) => (
        <Post key={`r${x}`} x={x} y={y + 1} h={h + 1} w={4.5} />
      ))}
      <path d={rope} {...line('sand-deep', 2.2)} />
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------------------------

/** A beam drawn as an outlined stroke (frames and scaffolds). */
function Beam({ d, w = 4.5 }: { d: string; w?: number }) {
  return (
    <g>
      <path d={d} {...line('wood-deep', w + 2.4)} />
      <path d={d} {...line('wood', w)} />
    </g>
  );
}

/** A scaffold tower (bottom-left at x, y). */
export function Scaffold({
  x,
  y,
  w,
  h,
  tiers = 2,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tiers?: number;
}) {
  const step = h / tiers;
  const levels = Array.from({ length: tiers }, (_, i) => y - step * (i + 1));
  const braces = levels.map((ly, i) =>
    i % 2 === 0 ? `M${x} ${ly + step}L${x + w} ${ly}` : `M${x + w} ${ly + step}L${x} ${ly}`,
  );
  return (
    <g data-part="scaffold">
      <Beam d={`${braces.join('')}`} w={2.5} />
      <Beam d={`M${x} ${y}V${y - h - 4}M${x + w} ${y}V${y - h - 4}`} />
      {levels.map((ly) => (
        <rect
          key={`l${ly}`}
          x={x - 6}
          y={ly - 2}
          width={w + 12}
          height={5}
          rx={1.5}
          {...filled('sand-deep', 2)}
        />
      ))}
    </g>
  );
}

/** A small sign on a post, showing what is being built (an icon, never words). */
export function Sign({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <g data-part="sign">
      <Post x={x} y={y} h={30} w={4.5} />
      <rect x={x - 14} y={y - 42} width={28} height={22} rx={5} {...filled('paper', 2.5)} />
      <g transform={`translate(${x} ${y - 31})`}>{children}</g>
    </g>
  );
}

/** A striped sawhorse barrier (construction). */
export function Barrier({ x, y, w = 30 }: { x: number; y: number; w?: number }) {
  return (
    <g data-part="barrier">
      <path
        d={`M${x + 3} ${y}L${x + 7} ${y - 14}M${x + w - 3} ${y}L${x + w - 7} ${y - 14}`}
        {...line('wood-deep', 3)}
      />
      <rect x={x} y={y - 20} width={w} height={8} rx={2} {...filled('cloud', 2.2)} />
      <path
        d={Array.from(
          { length: Math.floor(w / 9) },
          (_, i) => `M${x + 4 + i * 9} ${y - 12.5}l5 -7`,
        ).join('')}
        {...line('coral', 3.5)}
      />
    </g>
  );
}

export type SiteRoof = 'gable' | 'flat' | 'dome' | 'tower' | 'none';

export interface SiteProps {
  /** The footprint in plots [w, h] (the staked-out plot fills it). */
  foot: readonly [number, number];
  /** Width and wall height of the frame, centred on cx, standing on y. */
  w: number;
  h: number;
  cx?: number;
  y?: number;
  roof?: SiteRoof;
  /** The icon on the sign (what this will become). */
  icon: ReactNode;
  /** Extra construction pieces drawn behind the frame (water, posts, a hull). */
  behind?: ReactNode;
  /** Extra pieces drawn in front. */
  front?: ReactNode;
  /** Mirror the props (scaffold on the left, crates on the right). */
  flip?: boolean;
  /** Skip the staked plot (sites over water: docks, piers, the bridge). */
  noPlot?: boolean;
}

/**
 * The shared construction stage: the plot staked out with string, a foundation of stones, a wooden
 * frame in the shape of the building, a scaffold, crates and planks, a barrier and a sign with the
 * building's icon. Clearly unfinished, never messy, and filling the footprint.
 */
export function Site({
  foot,
  w,
  h,
  cx = 0,
  y = -12,
  roof = 'gable',
  icon,
  behind,
  front,
  flip = false,
  noPlot = false,
}: SiteProps) {
  const half = (foot[0] * 100) / 2;
  const depth = foot[1] * 70;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const top = y - h;
  const studs: string[] = [`M${x0} ${y}V${top}M${x1} ${y}V${top}M${x0 - 3} ${top}H${x1 + 3}`];
  for (let x = x0 + 18; x < x1 - 8; x += 18) studs.push(`M${x} ${y}V${top}`);
  studs.push(`M${x0} ${y - h * 0.5}H${x1}`);
  let roofBeams = '';
  if (roof === 'gable') {
    roofBeams = `M${x0 - 4} ${top + 2}L${cx} ${top - h * 0.62}L${x1 + 4} ${top + 2}M${cx} ${top}V${top - h * 0.62}`;
  } else if (roof === 'tower') {
    roofBeams = `M${x0 + 4} ${top}L${cx} ${top - h * 0.45}L${x1 - 4} ${top}`;
  } else if (roof === 'dome') {
    roofBeams = `M${x0} ${top}Q${cx} ${top - h * 0.8} ${x1} ${top}M${cx} ${top}V${top - h * 0.4}`;
  } else if (roof === 'flat') {
    roofBeams = `M${x0 - 4} ${top - 6}H${x1 + 4}`;
  }
  const side = flip ? -1 : 1;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const scafX = clamp(flip ? x0 - 20 : x1 - 4, -half + 8, half - 32);
  const crateX = clamp(flip ? x1 + 4 : x0 - 30, -half + 6, half - 36);
  const barrierX = clamp(flip ? x0 - 30 : x1 - 4, -half + 6, half - 34);
  const signX = clamp(flip ? x1 - 8 : x0 + 8, -half + 18, half - 18);
  const px0 = -half + 8;
  const px1 = half - 8;
  const py0 = -depth + 12;
  const py1 = -5;
  const stakes: [number, number][] = [
    [px0, py0],
    [px1, py0],
    [px0, py1],
    [px1, py1],
  ];
  /** The stake each rope runs to, going round the plot: 0 → 1 → 3 → 2 → 0. */
  const RING = [1, 3, 0, 2];
  return (
    <g data-part="site">
      {noPlot ? null : (
        <g data-part="plot">
          <rect
            x={px0}
            y={py0}
            width={px1 - px0}
            height={py1 - py0}
            rx={12}
            fill={paint('sand-shadow')}
            opacity={0.55}
          />
          {/* A rope strung between the four stakes, sagging a little between each pair. */}
          <path
            data-part="rope"
            d={stakes
              .map((a, i) => [a, stakes[RING[i] as number] as [number, number]] as const)
              .map(
                ([[ax, ay], [bx, by]]) =>
                  `M${ax} ${ay - 6}Q${(ax + bx) / 2} ${(ay + by) / 2 - 2} ${bx} ${by - 6}`,
              )
              .join('')}
            {...line('wood-deep', 1.8)}
          />
          {stakes.map(([sx, sy]) => (
            <rect
              key={`${sx},${sy}`}
              x={sx - 2.5}
              y={sy - 9}
              width={5}
              height={11}
              rx={1.5}
              {...filled('wood', 1.8)}
            />
          ))}
        </g>
      )}
      <Ground w={w + 40} y={y + 4} />
      {behind}
      <Beam d={`${studs.join('')}${roofBeams}`} />
      <Beam d={`M${x0 + 2} ${y - 2}L${x0 + 18} ${y - h * 0.5}`} w={2.5} />
      <path
        d={Array.from(
          { length: Math.ceil(w / 16) },
          (_, i) => `M${x0 + i * 16 + 2} ${y + 1}h12`,
        ).join('')}
        {...line('pebble-deep', 6)}
      />
      <path
        d={Array.from(
          { length: Math.ceil(w / 16) },
          (_, i) => `M${x0 + i * 16 + 2} ${y + 1}h12`,
        ).join('')}
        {...line('pebble', 3)}
      />
      <Scaffold x={scafX} y={y} w={24} h={h + 12} tiers={roof === 'tower' ? 3 : 2} />
      <Crate x={crateX} y={y + 2} s={15} />
      <Crate x={crateX + 15} y={y + 2} s={13} />
      <Crate x={crateX + 7} y={y - 13} s={12} />
      <g transform={`translate(${cx + side * (w * 0.15)} 0)`}>
        <rect x={-14} y={y - 4} width={28} height={5} rx={2} {...filled('wood', 2)} />
        <rect x={-11} y={y - 9} width={24} height={5} rx={2} {...filled('wood', 2)} />
      </g>
      {front}
      <Barrier x={barrierX} y={y + 8} w={28} />
      <Sign x={signX} y={y + 10}>
        {icon}
      </Sign>
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// Sign icons (what each building makes), about 18 units across, centred on 0,0
// ---------------------------------------------------------------------------------------------

export type IconKind =
  | 'stone'
  | 'lantern'
  | 'boat'
  | 'gem'
  | 'brick'
  | 'sprout'
  | 'bread'
  | 'coin'
  | 'clock'
  | 'shapes'
  | 'scale'
  | 'fruit'
  | 'star'
  | 'crate'
  | 'shell'
  | 'house'
  | 'light'
  | 'bridge'
  | 'note';

export function Icon({ kind }: { kind: IconKind }) {
  switch (kind) {
    case 'stone':
      return <ellipse cx={0} cy={0} rx={8} ry={5.5} {...filled('pebble', 2)} />;
    case 'lantern':
      return (
        <g>
          <ellipse
            cx={0}
            cy={1}
            rx={5}
            ry={6}
            fill={paint('sunshine')}
            stroke={paint('ink')}
            strokeWidth={1.8}
          />
          <rect x={-3} y={-7} width={6} height={2.5} rx={1} {...filled('wood-deep', 1)} />
        </g>
      );
    case 'boat':
      return (
        <g>
          <path d="M-9 0H9L6 6H-6Z" {...filled('coral', 1.8)} />
          <path d="M0 0V-8L6 -1" {...line('ink', 1.6)} />
        </g>
      );
    case 'gem':
      return <path d="M-7 -2L-3 -6H3L7 -2L0 7Z" {...filled('sky', 1.8)} />;
    case 'brick':
      return (
        <g>
          <rect x={-9} y={-1} width={9} height={5} {...filled('coral', 1.5)} />
          <rect x={0} y={-1} width={9} height={5} {...filled('coral', 1.5)} />
          <rect x={-5} y={-6} width={10} height={5} {...filled('coral', 1.5)} />
        </g>
      );
    case 'sprout':
      return (
        <g>
          <path d="M0 6V-2" {...line('leaf-deep', 2)} />
          <path
            d="M0 -1Q-8 -2 -7 -7Q0 -7 0 -1ZM0 -2Q6 -9 9 -4Q5 0 0 -2Z"
            {...filled('leaf', 1.5)}
          />
        </g>
      );
    case 'bread':
      return (
        <g>
          <path d="M-9 4Q-10 -6 0 -6Q10 -6 9 4Z" {...filled('sun', 1.8)} />
          <path d="M-4 -3l2 4M0 -4l2 4M4 -3l2 4" {...line('sun-deep', 1.4)} />
        </g>
      );
    case 'coin':
      return (
        <g>
          <circle r={7} {...filled('sunshine', 1.8)} />
          <circle r={3.5} fill="none" stroke={paint('sunshine-deep')} strokeWidth={1.4} />
        </g>
      );
    case 'clock':
      return (
        <g>
          <circle r={7.5} fill={paint('cloud')} stroke={paint('ink')} strokeWidth={1.8} />
          <path d="M0 0V-5M0 0L3.5 2" {...line('ink', 1.6)} />
        </g>
      );
    case 'shapes':
      return (
        <g>
          <path d="M-9 4L-5 -4L-1 4Z" {...filled('coral', 1.4)} />
          <circle cx={5} cy={-2} r={3.5} {...filled('sea', 1.4)} />
          <rect x={1} y={2} width={6} height={4} {...filled('sunshine', 1.2)} />
        </g>
      );
    case 'scale':
      return (
        <g>
          <path d="M0 6V-5M-8 -4H8" {...line('ink', 1.6)} />
          <path d="M-11 0H-5L-8 -4ZM5 0H11L8 -4Z" {...filled('sunshine', 1.2)} />
        </g>
      );
    case 'fruit':
      return (
        <g>
          <circle cx={0} cy={1} r={6} {...filled('coral', 1.8)} />
          <path d="M0 -4Q4 -9 7 -6Q4 -3 0 -4Z" {...filled('leaf', 1.2)} />
        </g>
      );
    case 'star':
      return <Star x={0} y={0} r={8} />;
    case 'crate':
      return <Crate x={-7} y={7} s={14} />;
    case 'shell':
      return (
        <g>
          <path d="M-8 5Q-9 -6 0 -7Q9 -6 8 5Z" {...filled('pebble', 1.8)} />
          <path d="M0 5V-6M-4 5L-5 -4M4 5L5 -4" {...line('pebble-deep', 1.3)} />
        </g>
      );
    case 'house':
      return (
        <g>
          <path d="M-7 6V-1H7V6Z" {...filled('paper', 1.6)} />
          <path d="M-9 -1L0 -8L9 -1Z" {...filled('coral', 1.6)} />
        </g>
      );
    case 'light':
      return (
        <g>
          <path d="M-4 7L-3 -4H3L4 7Z" {...filled('coral', 1.6)} />
          <path d="M-3 -4V-7H3V-4" {...filled('sunshine', 1.4)} />
        </g>
      );
    case 'bridge':
      return (
        <g>
          <path d="M-10 4V-1H10V4H6Q0 -4 -6 4Z" {...filled('pebble', 1.6)} />
        </g>
      );
    case 'note':
      return (
        <g>
          <path d="M3 3V-7L7 -5" {...line('ink', 1.8)} />
          <ellipse cx={0} cy={4} rx={3.5} ry={2.6} fill={paint('ink')} />
        </g>
      );
  }
}
