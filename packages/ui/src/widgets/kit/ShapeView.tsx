import type { ShapeCard, ShapeKind } from '@number-island/shared';
import { pictureProps } from './a11y';
import './shapes.css';

/**
 * Shape cards (03 §5.1 `ShapeCard`, the `shape` stimulus and shape-sort cards), drawn exactly: a
 * square's four sides are equal and its corners square, a rhombus has four equal sides and no
 * square corner, a trapezoid exactly one pair of parallel sides, regular polygons are regular, an
 * open figure is visibly open, and solids are drawn as solids (front, top and side faces, hidden
 * edges dashed). `rotationDeg` turns the shape about its centre and `scale` resizes it; shapes in
 * one picture share one scale (`extent`), so a card at scale 1.5 really is 1.5 × as big.
 *
 * Geometry is in design units: y down, centred on (0, 0); one card at scale 1 spans about 80.
 */

type Pt = [number, number];

export type ShapeGeometry =
  | { type: 'polygon'; points: Pt[] }
  | { type: 'open'; points: Pt[] }
  | { type: 'circle'; r: number }
  | { type: 'ellipse'; rx: number; ry: number }
  | { type: 'solid'; solid: SolidKind };

export type SolidKind = 'cube' | 'rect-prism' | 'pyramid' | 'cylinder' | 'cone' | 'sphere';

const SQ3 = Math.sqrt(3);

/** A regular polygon with `n` corners and circumradius `r`, a flat side at the bottom. */
export function regularPolygon(n: number, r: number): Pt[] {
  const start = Math.PI / 2 + Math.PI / n; // the bottom side is horizontal
  return Array.from({ length: n }, (_, i) => {
    const a = start + (2 * Math.PI * i) / n;
    return [round(r * Math.cos(a)), round(r * Math.sin(a))] as Pt;
  });
}

const round = (x: number) => Math.round(x * 1e6) / 1e6;

/** Centres a polygon's vertex average on (0, 0). */
function centred(points: Pt[]): Pt[] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => [round(x - cx), round(y - cy)]);
}

/** The exact geometry of a shape kind (design units, y down, centred). */
export function shapeGeometry(kind: ShapeKind): ShapeGeometry {
  switch (kind) {
    case 'circle':
      return { type: 'circle', r: 38 };
    case 'oval':
      return { type: 'ellipse', rx: 44, ry: 27 };
    case 'triangle': {
      // Equilateral, side 80.
      const h = (80 * SQ3) / 2;
      return {
        type: 'polygon',
        points: centred([
          [-40, h / 2],
          [0, -h / 2],
          [40, h / 2],
        ]),
      };
    }
    case 'square':
      return {
        type: 'polygon',
        points: [
          [-33, -33],
          [33, -33],
          [33, 33],
          [-33, 33],
        ],
      };
    case 'rectangle':
      // 88 × 46: clearly longer than tall.
      return {
        type: 'polygon',
        points: [
          [-44, -23],
          [44, -23],
          [44, 23],
          [-44, 23],
        ],
      };
    case 'rhombus': {
      // Side 52 with 60° and 120° corners (the pattern-block rhombus), standing on a corner.
      const s = 52;
      return {
        type: 'polygon',
        points: [
          [0, -(s * SQ3) / 2],
          [s / 2, 0],
          [0, (s * SQ3) / 2],
          [-s / 2, 0],
        ].map(([x, y]) => [round(x as number), round(y as number)]) as Pt[],
      };
    }
    case 'trapezoid': {
      // The pattern-block trapezoid: bottom 2s, top and legs s, 60° base corners.
      const s = 42;
      const h = (s * SQ3) / 2;
      return {
        type: 'polygon',
        points: centred([
          [-s, h / 2],
          [-s / 2, -h / 2],
          [s / 2, -h / 2],
          [s, h / 2],
        ]),
      };
    }
    case 'kite':
      return {
        type: 'polygon',
        points: [
          [0, -42],
          [28, -12],
          [0, 44],
          [-28, -12],
        ],
      };
    case 'quadrilateral':
      // Clearly irregular: four different side lengths, no parallel sides, no square corner.
      return {
        type: 'polygon',
        points: [
          [-44, -30],
          [10, -34],
          [44, 30],
          [-30, 18],
        ],
      };
    case 'pentagon':
      return { type: 'polygon', points: regularPolygon(5, 42) };
    case 'hexagon':
      return { type: 'polygon', points: regularPolygon(6, 40) };
    case 'octagon':
      return { type: 'polygon', points: regularPolygon(8, 42) };
    case 'open-figure': {
      // A triangle with a gap at its top: three sides, two corners, not closed.
      const h = (80 * SQ3) / 2;
      const [l, top, r] = centred([
        [-40, h / 2],
        [0, -h / 2],
        [40, h / 2],
      ]) as [Pt, Pt, Pt];
      const gap = 0.3; // each side stops 30 % short of the top corner
      const short = (from: Pt): Pt => [
        round(top[0] + (from[0] - top[0]) * gap),
        round(top[1] + (from[1] - top[1]) * gap),
      ];
      return { type: 'open', points: [short(l), l, r, short(r)] };
    }
    default:
      return { type: 'solid', solid: kind };
  }
}

/** The radius of the circle (about the centre) that holds a card at scale 1, unrotated or not. */
export function baseRadius(kind: ShapeKind): number {
  const g = shapeGeometry(kind);
  switch (g.type) {
    case 'circle':
      return g.r;
    case 'ellipse':
      return Math.max(g.rx, g.ry);
    case 'solid':
      return 50;
    default:
      return Math.max(...g.points.map(([x, y]) => Math.hypot(x, y)));
  }
}

/** Half the side of the square box a card needs: radius × scale plus room for the outline. */
export const shapeExtent = (card: Pick<ShapeCard, 'shape' | 'scale'>): number =>
  baseRadius(card.shape) * card.scale + 8;

// ---------- colours ----------

/** Card colour names (generators/geo/shapes.ts COLORS plus `tan`) → a palette fill and its shade. */
const COLOR: Record<string, { fill: string; line: string }> = {
  red: { fill: 'var(--color-coral)', line: 'var(--color-coral-deep)' },
  blue: { fill: 'var(--color-sea)', line: 'var(--color-sea-dark)' },
  yellow: { fill: 'var(--color-sunshine)', line: 'var(--color-sunshine-deep)' },
  green: { fill: 'var(--color-leaf)', line: 'var(--color-leaf-dark)' },
  orange: { fill: 'var(--color-sun)', line: 'var(--color-sun-deep)' },
  purple: { fill: 'var(--color-sea-deep)', line: 'var(--color-sea-dark)' },
  tan: { fill: 'var(--color-sand-deep)', line: 'var(--color-wood-deep)' },
};
export const shapeColor = (name: string) =>
  COLOR[name] ?? (COLOR.tan as { fill: string; line: string });

// ---------- attribute marks ----------

/** What a card's overlay marks (`highlight-attribute {prop}`, `count-sides`). */
export type ShapeMark = 'sides' | 'corners' | 'rightAngles' | 'equalSides' | 'shape' | null;

export function markFor(prop: string | null | undefined): ShapeMark {
  switch (prop) {
    case 'sides':
    case 'parallelPairs':
      return 'sides';
    case 'corners':
      return 'corners';
    case 'rightAngles':
      return 'rightAngles';
    case 'equalSides':
      return 'equalSides';
    case null:
    case undefined:
      return null;
    default:
      return 'shape';
  }
}

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Groups of equal side lengths: side i's group number (sides of one length share one). */
export function equalSideGroups(points: Pt[]): number[] {
  const lens = points.map((p, i) => dist(p, points[(i + 1) % points.length] as Pt));
  const groups: number[] = [];
  const reps: number[] = [];
  for (const l of lens) {
    let g = reps.findIndex((r) => Math.abs(r - l) < 0.5);
    if (g < 0) {
      reps.push(l);
      g = reps.length - 1;
    }
    groups.push(g);
  }
  return groups;
}

/** Corners whose inside angle is square (90° ± 0.5°). */
export function squareCorners(points: Pt[]): number[] {
  return points
    .map((b, i) => {
      const a = points[(i - 1 + points.length) % points.length] as Pt;
      const c = points[(i + 1) % points.length] as Pt;
      const dot = (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]);
      const cos = dot / (dist(a, b) * dist(b, c));
      return Math.abs(cos) < Math.cos((89.5 * Math.PI) / 180) ? i : -1;
    })
    .filter((i) => i >= 0);
}

/** The sides and corners a mark counts on a drawn polygon or open figure. */
export function countedParts(points: readonly Pt[], open: boolean) {
  const n = points.length;
  const sides = Array.from(
    { length: open ? n - 1 : n },
    (_, i) => [points[i], points[(i + 1) % n]] as [Pt, Pt],
  );
  return { sides, corners: open ? points.slice(1, -1) : [...points] };
}

/**
 * Attribute marks. Sides and corners light up one by one (`upto` of them, all by default); the
 * widget shows the count as a numeral beside the card (numerals ≥ 32 px, outside the drawing).
 */
function Marks({
  points,
  mark,
  open,
  upto,
}: {
  points: Pt[];
  mark: ShapeMark;
  open: boolean;
  upto?: number;
}) {
  if (!mark || mark === 'shape') return null;
  const n = points.length;
  const { sides, corners } = countedParts(points, open);
  if (mark === 'sides') {
    return (
      <g className="ni-shape__marks" data-mark="sides">
        {sides.slice(0, upto ?? sides.length).map(([a, b], i) => (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: sides are a fixed list
            key={i}
            className="ni-shape__side-mark"
            data-side={i}
            x1={(a as Pt)[0]}
            y1={(a as Pt)[1]}
            x2={(b as Pt)[0]}
            y2={(b as Pt)[1]}
          />
        ))}
      </g>
    );
  }
  if (mark === 'corners') {
    return (
      <g className="ni-shape__marks" data-mark="corners">
        {corners.slice(0, upto ?? corners.length).map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: corners are a fixed list
          <circle key={i} className="ni-shape__corner" data-corner={i} cx={p[0]} cy={p[1]} r={7} />
        ))}
      </g>
    );
  }
  if (mark === 'rightAngles') {
    const square = open ? [] : squareCorners(points);
    return (
      <g className="ni-shape__marks" data-mark="rightAngles">
        {square.map((i) => {
          const b = points[i] as Pt;
          const a = points[(i - 1 + n) % n] as Pt;
          const c = points[(i + 1) % n] as Pt;
          const u = (p: Pt): Pt => {
            const d = dist(b, p);
            return [((p[0] - b[0]) / d) * 10, ((p[1] - b[1]) / d) * 10];
          };
          const [ux, uy] = u(a);
          const [vx, vy] = u(c);
          return (
            <path
              key={i}
              className="ni-shape__right"
              d={`M${b[0] + ux} ${b[1] + uy} L${b[0] + ux + vx} ${b[1] + uy + vy} L${b[0] + vx} ${b[1] + vy}`}
            />
          );
        })}
      </g>
    );
  }
  // equalSides: hash marks, the same number on sides of the same length.
  const groups = open ? [] : equalSideGroups(points);
  return (
    <g className="ni-shape__marks" data-mark="equalSides">
      {sides.map(([a, b], i) => {
        if (open) return null;
        const pa = a as Pt;
        const pb = b as Pt;
        const mx = (pa[0] + pb[0]) / 2;
        const my = (pa[1] + pb[1]) / 2;
        const d = dist(pa, pb) || 1;
        const tx = (pb[0] - pa[0]) / d;
        const ty = (pb[1] - pa[1]) / d;
        const count = (groups[i] ?? 0) + 1;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: sides are a fixed list
          <g key={i}>
            {Array.from({ length: count }, (_, k) => {
              const off = (k - (count - 1) / 2) * 6;
              const x = mx + tx * off;
              const y = my + ty * off;
              return (
                <line
                  // biome-ignore lint/suspicious/noArrayIndexKey: hash marks are a fixed list
                  key={k}
                  className="ni-shape__hash"
                  x1={x - ty * 8}
                  y1={y + tx * 8}
                  x2={x + ty * 8}
                  y2={y - tx * 8}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

// ---------- solids ----------

/** A solid in oblique view: faces in one hue, the top lighter and the side darker (token tints). */
function Solid({ kind, c }: { kind: SolidKind; c: { fill: string; line: string } }) {
  const face = { fill: c.fill, stroke: c.line, strokeWidth: 3, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'cube':
    case 'rect-prism': {
      const [w, h] = kind === 'cube' ? [52, 52] : [76, 38];
      const d: Pt = kind === 'cube' ? [18, -18] : [20, -16];
      const x0 = -(w + d[0]) / 2;
      const y0 = (h - d[1]) / 2;
      const at = (x: number, y: number) => `${round(x0 + x)} ${round(y0 + y)}`;
      return (
        <g data-solid={kind}>
          {/* hidden edges */}
          <path
            className="ni-shape__hidden"
            d={`M${at(d[0], d[1])} L${at(d[0], d[1] - h)} M${at(d[0], d[1])} L${at(0, 0)} M${at(d[0], d[1])} L${at(w + d[0], d[1])}`}
          />
          <path {...face} d={`M${at(0, 0)} L${at(w, 0)} L${at(w, -h)} L${at(0, -h)} Z`} />
          <path
            {...face}
            d={`M${at(0, -h)} L${at(w, -h)} L${at(w + d[0], d[1] - h)} L${at(d[0], d[1] - h)} Z`}
          />
          <path
            className="ni-shape__tint-light"
            d={`M${at(0, -h)} L${at(w, -h)} L${at(w + d[0], d[1] - h)} L${at(d[0], d[1] - h)} Z`}
          />
          <path
            {...face}
            d={`M${at(w, 0)} L${at(w + d[0], d[1])} L${at(w + d[0], d[1] - h)} L${at(w, -h)} Z`}
          />
          <path
            className="ni-shape__tint-dark"
            d={`M${at(w, 0)} L${at(w + d[0], d[1])} L${at(w + d[0], d[1] - h)} L${at(w, -h)} Z`}
          />
        </g>
      );
    }
    case 'pyramid': {
      // Square base seen from the front and above; apex over the base centre.
      const fl: Pt = [-40, 32];
      const fr: Pt = [20, 32];
      const br: Pt = [40, 14];
      const bl: Pt = [-20, 14];
      const apex: Pt = [0, -44];
      const pt = (p: Pt) => `${p[0]} ${p[1]}`;
      return (
        <g data-solid="pyramid">
          <path
            className="ni-shape__hidden"
            d={`M${pt(fl)} L${pt(bl)} L${pt(br)} M${pt(bl)} L${pt(apex)}`}
          />
          <path {...face} d={`M${pt(fl)} L${pt(fr)} L${pt(apex)} Z`} />
          <path {...face} d={`M${pt(fr)} L${pt(br)} L${pt(apex)} Z`} />
          <path className="ni-shape__tint-dark" d={`M${pt(fr)} L${pt(br)} L${pt(apex)} Z`} />
        </g>
      );
    }
    case 'cylinder':
      return (
        <g data-solid="cylinder">
          <path {...face} d="M-32 -30 L-32 30 A32 11 0 0 0 32 30 L32 -30 A32 11 0 0 1 -32 -30 Z" />
          <path className="ni-shape__hidden" d="M-32 30 A32 11 0 0 1 32 30" />
          <ellipse {...face} cx={0} cy={-30} rx={32} ry={11} />
          <ellipse className="ni-shape__tint-light" cx={0} cy={-30} rx={32} ry={11} />
        </g>
      );
    case 'cone':
      return (
        <g data-solid="cone">
          <path {...face} d="M0 -46 L-34 30 A34 11 0 0 0 34 30 Z" />
          <path className="ni-shape__hidden" d="M-34 30 A34 11 0 0 1 34 30" />
          <path className="ni-shape__tint-dark" d="M0 -46 L14 32 A34 11 0 0 0 34 30 Z" />
        </g>
      );
    case 'sphere':
      return (
        <g data-solid="sphere">
          <circle {...face} cx={0} cy={0} r={40} />
          <path className="ni-shape__hidden" d="M-40 0 A40 12 0 0 1 40 0" />
          <path className="ni-shape__equator" d="M-40 0 A40 12 0 0 0 40 0" />
          <path className="ni-shape__shine" d="M-22 -20 A28 28 0 0 1 -4 -30" />
        </g>
      );
  }
}

// ---------- the card ----------

export interface ShapeViewProps {
  card: Pick<ShapeCard, 'shape' | 'rotationDeg' | 'scale' | 'color'>;
  /** Half the side of the drawing box in design units; pass one value for a whole set. */
  extent?: number;
  /** Size in CSS px (the drawing is square). */
  size?: number;
  mark?: ShapeMark;
  /** How many sides or corners the mark has reached (counting one by one); all by default. */
  upto?: number;
  /** Accessible name; decorative (aria-hidden) without one. */
  label?: string;
  className?: string;
}

export function ShapeView({
  card,
  extent,
  size = 120,
  mark = null,
  upto,
  label,
  className,
}: ShapeViewProps) {
  const e = extent ?? shapeExtent(card);
  const g = shapeGeometry(card.shape);
  const c = shapeColor(card.color);
  const rotation = g.type === 'solid' ? 0 : card.rotationDeg;
  const k = card.scale;
  const scalePts = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [round(x * k), round(y * k)]);
  let body: React.ReactNode;
  switch (g.type) {
    case 'circle':
      body = (
        <circle
          className="ni-shape__fill"
          cx={0}
          cy={0}
          r={g.r * k}
          fill={c.fill}
          stroke={c.line}
        />
      );
      break;
    case 'ellipse':
      body = (
        <ellipse
          className="ni-shape__fill"
          cx={0}
          cy={0}
          rx={g.rx * k}
          ry={g.ry * k}
          fill={c.fill}
          stroke={c.line}
        />
      );
      break;
    case 'polygon': {
      const pts = scalePts(g.points);
      body = (
        <>
          <polygon
            className="ni-shape__fill"
            points={pts.map((p) => p.join(',')).join(' ')}
            fill={c.fill}
            stroke={c.line}
          />
          <Marks points={pts} mark={mark} open={false} upto={upto} />
        </>
      );
      break;
    }
    case 'open': {
      const pts = scalePts(g.points);
      body = (
        <>
          <polyline
            className="ni-shape__open"
            points={pts.map((p) => p.join(',')).join(' ')}
            stroke={c.line}
          />
          <Marks points={pts} mark={mark} open upto={upto} />
        </>
      );
      break;
    }
    case 'solid':
      body = (
        <g transform={`scale(${k})`}>
          <Solid kind={g.solid} c={c} />
        </g>
      );
      break;
  }
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: a named img when labelled, aria-hidden otherwise (pictureProps)
    <svg
      className={['ni-shape', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox={`${-e} ${-e} ${2 * e} ${2 * e}`}
      focusable="false"
      data-shape={card.shape}
      data-mark={mark ?? undefined}
      {...pictureProps(label)}
    >
      <g
        transform={rotation ? `rotate(${rotation})` : undefined}
        data-highlight={mark === 'shape' ? 'true' : undefined}
      >
        {body}
      </g>
    </svg>
  );
}

/** Several shapes on one scale (the `shape` stimulus): a row of cards, no controls. */
export function ShapeSetView({
  shapes,
  maxWidth = 720,
  maxHeight = 240,
  label,
}: {
  shapes: readonly ShapeCard[];
  maxWidth?: number;
  maxHeight?: number;
  label?: string;
}) {
  const extent = Math.max(...shapes.map(shapeExtent), 1);
  const gap = 16;
  const size = Math.max(
    56,
    Math.min(maxHeight, (maxWidth - gap * (shapes.length - 1)) / Math.max(1, shapes.length), 220),
  );
  return (
    <div className="ni-shapes" style={{ gap }} {...pictureProps(label)}>
      {shapes.map((s) => (
        <ShapeView key={s.id} card={s} extent={extent} size={size} />
      ))}
    </div>
  );
}
