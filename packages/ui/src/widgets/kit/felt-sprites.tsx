import type { ReactElement, ReactNode } from 'react';
import type { SpriteTone } from './sprites';

/*
 * Felt & Stitch counted objects (05 §11): each sprite is cut felt laid on the mat. Its silhouette
 * keeps 3:1 on every surface counted objects sit on (FELT_SURFACES: the cream mat and tray inside,
 * cards, horizon and sand; the sage of a tray is its edge, never under a sprite), and it reads at
 * the smallest size it is drawn at (10 px counters on numeral cards).
 *
 * Detail comes in tiers, switched by the sprite's own drawn width (a container query on the
 * sprite's svg, kit.css), never by script:
 *   - under 48 px (`ni-felt-sm`, and the base rule): a same-hue, mid-dark edge on every piece, so a
 *     pink crab at 20 px still reads as a pink crab;
 *   - every size: the silhouette in two felt tones and the bead eyes;
 *   - `ni-felt-md` (32 px and up): one running stitch set in from the edge, the mouth;
 *   - `ni-felt-lg` (48 px and up): the felt grain, a light rim on the lit side, glints, cheeks,
 *     ribs and dots. No edge where the felt colour holds 3:1 by itself (`edge: false`); a thin
 *     same-hue one, only as dark as 3:1 needs, where it does not.
 * A browser without container queries draws the first tier at every size: a whole, tidy sprite.
 * The lift is a CSS drop-shadow on the drawing (`ni-felt-lift`, kit.css) in the sprite's own
 * units, so it grows with the sprite; it is never a shape: no oval under anything.
 */

/**
 * One felt colour set: the cut piece, its second tone, the thread, the same-hue edge, and
 * whether a large piece keeps that edge (false: the felt colour holds 3:1 by itself).
 */
export interface FeltColors {
  fill: string;
  accent: string;
  thread: string;
  edge: string;
  keepEdge: boolean;
}

/** What counted objects lie on (the slice-1 felt tokens). */
export const FELT_SURFACES = {
  paper: '#F6EEDB',
  cloud: '#FFFBF2',
  horizon: '#F3E6CC',
  sand: '#E9DDC4',
} as const;

const DENIM: FeltColors = {
  fill: '#3F5E8A',
  accent: '#A4BED5',
  thread: '#DCE6F0',
  edge: '#2E4568',
  keepEdge: false,
};
const MUSTARD: FeltColors = {
  fill: '#E2A62A',
  accent: '#F0CB78',
  thread: '#F6EEDB',
  edge: '#A07316',
  keepEdge: true,
};
const TERRA: FeltColors = {
  fill: '#C15F3A',
  accent: '#F0AC98',
  thread: '#F6EEDB',
  edge: '#8E3F22',
  keepEdge: false,
};
const CREAM: FeltColors = {
  fill: '#FFFBF2',
  accent: '#E6DDCB',
  thread: '#A5855B',
  edge: '#857462',
  keepEdge: true,
};

/** Each kind's own colours (tone `a`); `b` is its second group colour where denim would clash. */
export const FELT_KINDS = {
  crab: {
    a: { fill: '#D9466B', accent: '#F4A3B8', thread: '#F9D2DC', edge: '#A62C4C', keepEdge: false },
  },
  shell: {
    a: { fill: '#EDB79E', accent: '#F6EEDB', thread: '#C5633D', edge: '#B0552F', keepEdge: true },
  },
  fish: {
    a: { fill: '#E2A62A', accent: '#C15F3A', thread: '#F6EEDB', edge: '#A07316', keepEdge: true },
  },
  starfish: {
    a: { fill: '#E39A5A', accent: '#C15F3A', thread: '#F6EEDB', edge: '#B0611F', keepEdge: true },
  },
  leaf: {
    a: { fill: '#678360', accent: '#B5C8A1', thread: '#F6EEDB', edge: '#4A6649', keepEdge: false },
  },
  pebble: {
    a: { fill: '#667E9C', accent: '#B4C3D3', thread: '#F6EEDB', edge: '#46597A', keepEdge: false },
    b: MUSTARD,
  },
  firefly: {
    a: { fill: '#3F5E8A', accent: '#F0CB78', thread: '#F6EEDB', edge: '#2E4568', keepEdge: false },
    b: MUSTARD,
  },
  dot: {
    a: { fill: '#E39A5A', accent: '#F0CB78', thread: '#F6EEDB', edge: '#B0611F', keepEdge: true },
  },
  stone: {
    a: { fill: '#E6DDCB', accent: '#CFC3AC', thread: '#8E7A60', edge: '#85776A', keepEdge: true },
  },
  counter: { a: TERRA, b: MUSTARD },
} as const satisfies Record<string, { a: FeltColors; b?: FeltColors }>;

export type FeltKind = keyof typeof FELT_KINDS;

/** The tones content gives each kind (fit probe and content scan, slice 3 task 0). */
export const FELT_TONES_USED: Readonly<Record<FeltKind, readonly SpriteTone[]>> = {
  crab: ['a', 'b'],
  shell: ['a', 'b', 'red', 'white', 'blue'],
  fish: ['a', 'b'],
  starfish: ['a', 'b'],
  leaf: ['a', 'b'],
  pebble: ['a', 'b'],
  firefly: ['a'],
  dot: ['a', 'b'],
  stone: ['a'],
  counter: ['a', 'b'],
};

/** The colours a kind is drawn in for a tone. */
export function feltColors(kind: FeltKind, tone: SpriteTone): FeltColors {
  const k: { a: FeltColors; b?: FeltColors } = FELT_KINDS[kind];
  switch (tone) {
    case 'b':
      return k.b ?? DENIM;
    case 'blue':
      return DENIM;
    case 'red':
      return TERRA;
    case 'white':
      return CREAM;
    default:
      return k.a;
  }
}

/** What a felt drawing gets: its colours, the id of its grain pattern, and its face variant. */
export interface FeltCtx {
  c: FeltColors;
  grain: string;
  variant: number;
}

export type FeltDraw = (ctx: FeltCtx) => ReactElement;

const BEAD = '#2B2220';
const MOUTH = '#3A2D29';

// ---------------------------------------------------------------- geometry

const f1 = (v: number) => Number(v.toFixed(2));

function starPoints(R: number, r: number, cx: number, cy: number, k = 5) {
  return Array.from({ length: k * 2 }, (_, i) => {
    const rad = i % 2 === 0 ? R : r;
    const a = ((-90 + (i * 180) / k) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] as const;
  });
}

/** A star with rounded tips and valleys (felt-r2 `smooth_star`). */
function smoothStar(R: number, r: number, cx: number, cy: number, f = 0.24): string {
  const v = starPoints(R, r, cx, cy);
  const m = v.length;
  let d = '';
  for (let i = 0; i < m; i += 1) {
    const p = v[(i - 1 + m) % m] as readonly [number, number];
    const c = v[i] as readonly [number, number];
    const q = v[(i + 1) % m] as readonly [number, number];
    const a = [c[0] + f * (p[0] - c[0]), c[1] + f * (p[1] - c[1])];
    const b = [c[0] + f * (q[0] - c[0]), c[1] + f * (q[1] - c[1])];
    d += `${i === 0 ? 'M' : 'L'}${f1(a[0] ?? 0)},${f1(a[1] ?? 0)}Q${f1(c[0])},${f1(c[1])} ${f1(b[0] ?? 0)},${f1(b[1] ?? 0)}`;
  }
  return `${d}z`;
}

/** A scallop fan from a hinge: the shell's outer edge (felt-r2 `shell`). */
function fan(
  cx: number,
  cy: number,
  R: number,
  inset = 0,
  fy = 0.98,
): { edge: string; pts: [number, number][] } {
  const angs = [160, 132, 104, 76, 48, 20];
  const pts = angs.map(
    (a) =>
      [cx + R * Math.cos((a * Math.PI) / 180), cy - R * fy * Math.sin((a * Math.PI) / 180)] as [
        number,
        number,
      ],
  );
  const h = 6 - inset;
  let d = `M${f1(cx - h)},${f1(cy + 3)}L${f1(pts[0]?.[0] ?? 0)},${f1(pts[0]?.[1] ?? 0)}`;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1] as [number, number];
    const b = pts[i] as [number, number];
    const r = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.58;
    d += `A${f1(r)},${f1(r)} 0 0 1 ${f1(b[0])},${f1(b[1])}`;
  }
  return { edge: `${d}L${f1(cx + h)},${f1(cy + 3)}z`, pts };
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M${cx - r},${cy}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0z`;
}

// ---------------------------------------------------------------- parts

/**
 * A felt piece with its grain from 48 px up. Under 48 px it has a same-hue edge; from 48 px only
 * where `keep` (its felt colour cannot hold 3:1 alone), thin.
 */
function Piece({
  d,
  fill,
  edge,
  keep,
  grain,
}: {
  d: string;
  fill: string;
  edge: string;
  keep: boolean;
  grain: string;
}) {
  return (
    <g data-felt-piece="">
      <path
        d={d}
        fill={fill}
        stroke={edge}
        className={keep ? 'ni-felt-edge ni-felt-edge--keep' : 'ni-felt-edge'}
        strokeLinejoin="round"
      />
      <path
        d={d}
        className="ni-felt-lg"
        fill={`url(#${grain})`}
        style={{ mixBlendMode: 'overlay' }}
        opacity={0.75}
      />
    </g>
  );
}

/** An appliqué: a second felt tone sewn flat on a piece (no backing, a thin edge of its own). */
function Applique({
  d,
  fill,
  edge,
  grain,
}: {
  d: string;
  fill: string;
  edge: string;
  grain: string;
}) {
  return (
    <g>
      <path d={d} fill={fill} stroke={edge} strokeWidth={1.2} strokeLinejoin="round" />
      <path
        d={d}
        className="ni-felt-lg"
        fill={`url(#${grain})`}
        style={{ mixBlendMode: 'overlay' }}
        opacity={0.6}
      />
    </g>
  );
}

/** A running stitch (32 px and up), with its pressed-in shadow from 48 px. */
function Stitch({
  d,
  color,
  width = 1.6,
  dash = '3.4 2.8',
}: {
  d: string;
  color: string;
  width?: number;
  dash?: string;
}) {
  return (
    <g
      className="ni-felt-md"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dash}
      strokeWidth={width}
    >
      <path
        className="ni-felt-lg"
        d={d}
        stroke="#2a1a10"
        opacity={0.3}
        transform="translate(0.4 0.7)"
      />
      <path d={d} stroke={color} />
    </g>
  );
}

/** A sewn thread line (a mouth, a vein): solid, round-ended. */
function Thread({
  d,
  color = MOUTH,
  width = 1.8,
  className,
}: {
  d: string;
  color?: string;
  width?: number;
  className?: string;
}) {
  return (
    <path
      className={className}
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** A bead eye: the bead at every size, its glint from 48 px. */
function Bead({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={BEAD} />
      <circle
        className="ni-felt-lg"
        cx={cx - r * 0.32}
        cy={cy - r * 0.36}
        r={r * 0.32}
        fill="#fff"
      />
    </g>
  );
}

/** The light rim along the top-left of a piece (48 px and up): its felt fullness. */
function Rim({ d }: { d: string }) {
  return (
    <path
      className="ni-felt-lg"
      d={d}
      fill="none"
      stroke="#fff6e2"
      strokeWidth={1.6}
      strokeLinecap="round"
      opacity={0.45}
    />
  );
}

const Only = ({ tier, children }: { tier: 'md' | 'lg'; children: ReactNode }) => (
  <g className={`ni-felt-${tier}`}>{children}</g>
);

// ---------------------------------------------------------------- the crab

const CRAB_BODY =
  'M-26.5,2C-26.5,-13.5 -14.5,-19.5 0,-19.5C14.5,-19.5 26.5,-13.5 26.5,2C26.5,12.5 14.5,18 0,18C-14.5,18 -26.5,12.5 -26.5,2z';
const CRAB_LIMBS = [
  [24, 3, 39, 11],
  [22, 11, 35, 24],
  [16, 17, 24, 33],
]
  .flatMap(([a, b, c, d]) => [`M${a},${b}L${c},${d}`, `M${-(a ?? 0)},${b}L${-(c ?? 0)},${d}`])
  .concat(['M-20,-12L-28,-30', 'M20,-12L28,-30'])
  .join('');
// felt-r2 claw_path(r 11.5, mid -112°, half 27°)
const CLAW = 'M1.5,2.5L1,-11.46A11.5,11.5 0 1 1 -8.68,-7.54z';

/** The number of crab faces (`variant` modulo this). Every face sits inside the same body. */
export const CRAB_FACES = 5;

function crabFace(v: number, c: FeltColors) {
  switch (v % CRAB_FACES) {
    case 1: // a small round "oh"
      return <ellipse cx={0} cy={8} rx={2.8} ry={3.2} fill="#3a1d24" />;
    case 2: // a wide grin
      return <Thread d="M-8.5,4Q0,13.5 8.5,4" width={2} />;
    case 3: // a smile with its tongue out
      return (
        <>
          <Thread d="M-6.5,5Q0,11 6.5,5" width={2} />
          <path d="M-1,8.4h5v2.6a2.5,2.5 0 0 1 -5,0z" fill={c.accent} />
        </>
      );
    case 4: // lashes and a smile
      return (
        <>
          <Thread d="M-18.5,-16l-3,-3M-12,-18.5l-.8,-4M3.5,-16l-3,-3M10,-18.5l-.8,-4" width={1.5} />
          <Thread d="M-6,5Q0,10.5 6,5" width={2} />
        </>
      );
    default: // a smile
      return <Thread d="M-6,5Q0,10.5 6,5" width={2} />;
  }
}

const crab: FeltDraw = ({ c, grain, variant }) => (
  <g transform="translate(32 41) scale(0.61)">
    {/* The legs' edge: under 48 px, and at every size where the felt cannot hold 3:1 alone. */}
    <path
      className={c.keepEdge ? undefined : 'ni-felt-sm'}
      d={CRAB_LIMBS}
      fill="none"
      stroke={c.edge}
      strokeWidth={10.6}
      strokeLinecap="round"
    />
    <path d={CRAB_LIMBS} fill="none" stroke={c.fill} strokeWidth={7.2} strokeLinecap="round" />
    <g transform="translate(-28 -30) scale(-1 1)">
      <Piece d={CLAW} fill={c.fill} edge={c.edge} keep={c.keepEdge} grain={grain} />
    </g>
    <g transform="translate(28 -30)">
      <Piece d={CLAW} fill={c.fill} edge={c.edge} keep={c.keepEdge} grain={grain} />
    </g>
    <Piece d={CRAB_BODY} fill={c.fill} edge={c.edge} keep={c.keepEdge} grain={grain} />
    <Rim d="M-21,-6C-19,-13 -11,-16.5 -3,-17" />
    <Stitch
      d="M-21.5,2C-21.5,-10 -12,-15 0,-15C12,-15 21.5,-10 21.5,2C21.5,10 12,14 0,14C-12,14 -21.5,10 -21.5,2z"
      color={c.thread}
      width={2}
      dash="4.2 3.6"
    />
    <Only tier="lg">
      <circle cx={-18} cy={4} r={3.6} fill={c.accent} />
      <circle cx={18} cy={4} r={3.6} fill={c.accent} />
    </Only>
    <circle cx={-10} cy={-8} r={7.4} fill="#F6EEDB" stroke={c.edge} strokeWidth={1.4} />
    <circle cx={10} cy={-8} r={7.4} fill="#F6EEDB" stroke={c.edge} strokeWidth={1.4} />
    <Bead cx={-9.4} cy={-7.4} r={4.4} />
    <Bead cx={10.6} cy={-7.4} r={4.4} />
    {/* 32-47 px: every crab the same smile; from 48 px its own face (identity, not place). */}
    <g className="ni-felt-md ni-felt-sm">{crabFace(0, c)}</g>
    <g className="ni-felt-lg" data-face={variant % CRAB_FACES}>
      {crabFace(variant, c)}
    </g>
  </g>
);

// ---------------------------------------------------------------- the shell

/** Hinge y and the fan's height factor: a scallop about as tall as it is wide. */
const HINGE = 53;
const SHELL = fan(32, HINGE, 25.5, 0, 1.62);
const SHELL_INNER = fan(32, HINGE, 17.3, 2, 1.62);

const shell: FeltDraw = ({ c, grain }) => {
  const ribs = SHELL.pts
    .slice(1, -1)
    .map(
      ([x, y]) => `M32,${HINGE - 3}L${f1(32 + (x - 32) * 0.86)},${f1(HINGE + (y - HINGE) * 0.86)}`,
    )
    .join('');
  const dots = SHELL.pts.slice(0, -1).map(([x, y], i) => {
    const n = SHELL.pts[i + 1] as [number, number];
    const mx = (x + n[0]) / 2;
    const my = (y + n[1]) / 2;
    return (
      <circle
        key={`${mx}`}
        cx={f1(32 + (mx - 32) * 0.9)}
        cy={f1(HINGE + (my - HINGE) * 0.9)}
        r={1.6}
        fill={c.thread}
      />
    );
  });
  return (
    <>
      <Piece
        d="M24.5,51h15a4,4 0 0 1 4,4v1a4,4 0 0 1 -4,4h-15a4,4 0 0 1 -4,-4v-1a4,4 0 0 1 4,-4z"
        fill={MUSTARD.fill}
        edge={MUSTARD.edge}
        keep
        grain={grain}
      />
      <Piece d={SHELL.edge} fill={c.fill} edge={c.edge} keep={c.keepEdge} grain={grain} />
      <Applique d={SHELL_INNER.edge} fill={c.accent} edge={c.edge} grain={grain} />
      <Rim d="M10,40C10,30 14,22 20,17" />
      <Stitch d={ribs} color={c.thread} width={1.5} dash="3 2.6" />
      <Only tier="lg">{dots}</Only>
      <Stitch d="M27,57.5h10" color={MUSTARD.thread} width={1.4} dash="2.4 2.2" />
    </>
  );
};

// ---------------------------------------------------------------- the fish

const FISH_BODY = 'M14,32C18,20 27,13 38,13C47,13 54,21 57,32C54,43 47,51 38,51C27,51 18,44 14,32Z';

const fish: FeltDraw = ({ c, grain }) => (
  <>
    <Piece
      d="M5,18C10.5,22 14,27 17,32C14,37 10.5,42 5,46C6.5,37 6.5,27 5,18Z"
      fill={c.accent}
      edge={c.edge}
      keep
      grain={grain}
    />
    <Piece
      d="M30,15C31,8.5 37,5.5 43,7C41,10.5 39,13 36,15Z"
      fill={c.accent}
      edge={c.edge}
      keep
      grain={grain}
    />
    <Piece d={FISH_BODY} fill={c.fill} edge={c.edge} keep={c.keepEdge} grain={grain} />
    <Applique
      d="M24,42C30,47.5 38,48.5 45,47C41,43.5 33,41.5 24,42Z"
      fill={c.accent}
      edge={c.edge}
      grain={grain}
    />
    <Rim d="M21,22C25,18 31,15.5 36,15.3" />
    <Stitch d="M33,18C29.5,25 29.5,39 33,46" color={c.thread} width={1.6} />
    <circle cx={46} cy={27.5} r={5} fill="#F6EEDB" stroke={c.edge} strokeWidth={1.2} />
    <Bead cx={46.6} cy={27.9} r={3} />
    <Thread className="ni-felt-md" d="M49,37Q52,36.5 54,34" width={1.6} />
  </>
);

// ---------------------------------------------------------------- the starfish

const STAR = smoothStar(29, 13.5, 32, 34);
const STAR_STITCH = smoothStar(24.5, 10.5, 32, 34.4);

const starfish: FeltDraw = ({ c, grain }) => {
  const dots = [-90, -18, 54, 126, 198].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return [11, 17].map((rad) => (
      <circle
        key={`${deg}-${rad}`}
        cx={f1(32 + rad * Math.cos(a))}
        cy={f1(34 + rad * Math.sin(a))}
        r={1.7}
        fill={c.accent}
      />
    ));
  });
  return (
    <>
      <Piece d={STAR} fill={c.fill} edge={c.edge} keep={c.keepEdge} grain={grain} />
      <Rim d="M13,26.5C17,25.5 21,25 24,24.5" />
      <Stitch d={STAR_STITCH} color={c.thread} width={1.5} dash="3 2.6" />
      <Only tier="lg">{dots}</Only>
      <Bead cx={27.5} cy={31} r={2.6} />
      <Bead cx={36.5} cy={31} r={2.6} />
      <Thread className="ni-felt-md" d="M29,36.5Q32,39.5 35,36.5" width={1.6} />
    </>
  );
};

// ---------------------------------------------------------------- the leaf

const LEAF = 'M10,52C7,30 21,10 54,8C56,34 41,51 14,53Z';

const leaf: FeltDraw = ({ c, grain }) => (
  <>
    <Piece d={LEAF} fill={c.fill} edge={c.edge} keep={c.keepEdge} grain={grain} />
    <Applique
      d="M13,49C13,32 27,15 51,11C50,20 44,27 36,32C28,37 20,42 13,49Z"
      fill={c.accent}
      edge={c.edge}
      grain={grain}
    />
    <Thread d="M7,57C15,45 28,31 47,15" color={c.edge} width={2.4} />
    <Rim d="M14,36C17,25 25,16 36,12" />
    <Stitch
      d="M21,42L16,33M29,34L24,24M37,25.5L34,16.5M21,42L30,46M29,34L39,37.5M37,25.5L46,27"
      color={c.thread}
      width={1.4}
      dash="2.6 2.2"
    />
  </>
);

// ---------------------------------------------------------------- the pebble

const PEBBLE = 'M10,33C10,18 20,8 33,8C46,8 54,18 54,32C54,47 45,56 32,56C18,56 10,47 10,33Z';

const pebble: FeltDraw = ({ c, grain }) => (
  <>
    <Piece d={PEBBLE} fill={c.fill} edge={c.edge} keep={c.keepEdge} grain={grain} />
    <Applique
      d="M17,24C19,17 25,13.5 31,13.5C29,18 24,22.5 17,24Z"
      fill={c.accent}
      edge={c.fill}
      grain={grain}
    />
    <Rim d="M15,37C14.5,29 16.5,23 21,18" />
    <Stitch
      d="M15,33C15,21 23,13 33,13C43,13 49,21 49,32C49,44 42,51 32,51C21,51 15,44 15,33Z"
      color={c.thread}
      width={1.5}
    />
  </>
);

// ---------------------------------------------------------------- the firefly

const firefly: FeltDraw = ({ c, grain }) => (
  <>
    <Piece
      d="M13,12C24,7 32,15 31,25C22,28 12,23 13,12Z"
      fill={CREAM.fill}
      edge={CREAM.edge}
      keep
      grain={grain}
    />
    <Piece
      d="M51,12C40,7 32,15 33,25C42,28 52,23 51,12Z"
      fill={CREAM.fill}
      edge={CREAM.edge}
      keep
      grain={grain}
    />
    <Piece d={circlePath(32, 43, 12)} fill={c.accent} edge={MUSTARD.edge} keep grain={grain} />
    <Piece
      d="M32,16C38,16 41,22 41,30C41,37 37,40 32,40C27,40 23,37 23,30C23,22 26,16 32,16Z"
      fill={c.fill}
      edge={c.edge}
      keep={c.keepEdge}
      grain={grain}
    />
    <Stitch d={circlePath(32, 43.5, 8)} color={MUSTARD.edge} width={1.4} dash="2.6 2.2" />
    <Bead cx={28.5} cy={24} r={2.4} />
    <Bead cx={35.5} cy={24} r={2.4} />
    <Thread d="M29,14Q27,8 23,7M35,14Q37,8 41,7" color={c.edge} width={1.8} />
    <Only tier="lg">
      <circle cx={23} cy={7} r={1.8} fill={c.accent} />
      <circle cx={41} cy={7} r={1.8} fill={c.accent} />
    </Only>
  </>
);

// ---------------------------------------------------------------- dot, stone, counters

const dot: FeltDraw = ({ c, grain }) => (
  <>
    <Piece
      d={circlePath(32, 32, 19.5)}
      fill={c.fill}
      edge={c.edge}
      keep={c.keepEdge}
      grain={grain}
    />
    <Rim d="M17,29C18,23 22,18.5 28,17.5" />
    <Stitch d={circlePath(32, 32, 14.5)} color={c.thread} width={1.5} />
  </>
);

const STONE = 'M7,37C7,20 18,8 33,8C47,8 57,19 57,34C57,49 47,57 32,57C17,57 7,51 7,37Z';

const stone: FeltDraw = ({ c, grain }) => (
  <>
    <Piece d={STONE} fill={c.fill} edge={c.edge} keep={c.keepEdge} grain={grain} />
    <Applique
      d="M36,16C43,15 49,19 51,26C45,26 39,23 36,16Z"
      fill={c.accent}
      edge={c.accent}
      grain={grain}
    />
    <Rim d="M13,36C13,26 18,18 25,14" />
    <Stitch
      d="M12,37C12,24 21,13 33,13C44,13 52,22 52,34C52,46 44,52 32,52C20,52 12,47 12,37Z"
      color={c.thread}
      width={1.5}
    />
  </>
);

/**
 * The two-colour counters (ten-frames, number bonds). Colour b also differs by a mark at every
 * size (06 §7, never colour alone): a sewn denim ring and a centre bead (`data-mark="ring"`).
 */
const counter =
  (tone: 'a' | 'b'): FeltDraw =>
  ({ c, grain }) => (
    <>
      <Piece
        d={circlePath(32, 32, 23.5)}
        fill={c.fill}
        edge={c.edge}
        keep={c.keepEdge}
        grain={grain}
      />
      <Rim d="M14,28C15,20 21,14 29,12.5" />
      {tone === 'b' ? (
        <g data-mark="ring">
          <circle cx={32} cy={32} r={12} fill="none" stroke="#2B4467" strokeWidth={4.4} />
          <circle cx={32} cy={32} r={4.2} fill="#2B4467" />
          <Stitch d={circlePath(32, 32, 18.5)} color={c.thread} width={1.4} dash="3 2.6" />
        </g>
      ) : (
        <Stitch d={circlePath(32, 32, 17)} color={c.thread} width={1.6} />
      )}
    </>
  );

/** The felt drawings, by sprite id. */
export const FELT_DRAWINGS: Readonly<
  Record<FeltKind, FeltDraw | ((tone: SpriteTone) => FeltDraw)>
> = {
  crab,
  shell,
  fish,
  starfish,
  leaf,
  pebble,
  firefly,
  dot,
  stone,
  counter: (tone: SpriteTone) => counter(tone === 'b' ? 'b' : 'a'),
};

export function isFeltKind(sprite: string): sprite is FeltKind {
  return Object.hasOwn(FELT_KINDS, sprite);
}

/** Draws a felt kind in a tone (the counter's ring belongs to its tone b). */
export function drawFelt(kind: FeltKind, tone: SpriteTone, grain: string, variant: number) {
  const entry = FELT_DRAWINGS[kind];
  const draw =
    kind === 'counter' ? (entry as (t: SpriteTone) => FeltDraw)(tone) : (entry as FeltDraw);
  return draw({ c: feltColors(kind, tone), grain, variant });
}
