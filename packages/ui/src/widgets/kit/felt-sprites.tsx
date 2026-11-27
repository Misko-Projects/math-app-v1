import type { ReactElement, ReactNode } from 'react';
import type { SpriteTone } from './sprites';

/*
 * Felt & Stitch counted objects (05 §11): each sprite is cut felt on a darker felt backing, so it
 * reads at the smallest size it is drawn at (10 px counters on numeral cards) and its outline
 * keeps 3:1 on the cream mat and the sage tray edge (FELT_EDGE_BACKGROUNDS, sprites.test.ts).
 *
 * Detail comes in three tiers, switched by the sprite's own drawn width (a container query on
 * the sprite's svg, kit.css), never by script:
 *   - every size: the silhouette in two felt tones and the bead eyes;
 *   - `ni-felt-md` (32 px and up): one running stitch set in from the edge, the mouth;
 *   - `ni-felt-lg` (48 px and up): the felt grain, a light rim, glints, cheeks, ribs and dots.
 * A browser without container queries draws the first tier at every size: a whole, tidy sprite.
 * The lift is a CSS drop-shadow on the svg (kit.css), not a shape: no oval under anything.
 */

/** One felt colour set: the cut piece, its second tone, the thread, and the backing (edge). */
export interface FeltColors {
  fill: string;
  accent: string;
  thread: string;
  edge: string;
}

const DENIM: FeltColors = {
  fill: '#3F5E8A',
  accent: '#A4BED5',
  thread: '#DCE6F0',
  edge: '#1B2A40',
};
const MUSTARD: FeltColors = {
  fill: '#E2A62A',
  accent: '#F0CB78',
  thread: '#F6EEDB',
  edge: '#563A06',
};
const TERRA: FeltColors = {
  fill: '#C5633D',
  accent: '#F0AC98',
  thread: '#F6EEDB',
  edge: '#55200F',
};
const CREAM: FeltColors = {
  fill: '#FFFBF2',
  accent: '#E6DDCB',
  thread: '#A5855B',
  edge: '#463630',
};

/** Each kind's own colours (tone `a`); `b` is its second group colour where denim would clash. */
export const FELT_KINDS = {
  crab: { a: { fill: '#D9466B', accent: '#F4A3B8', thread: '#F9D2DC', edge: '#5E1229' } },
  shell: { a: { fill: '#EDB79E', accent: '#F6EEDB', thread: '#C5633D', edge: '#6B2F17' } },
  fish: { a: { fill: '#E2A62A', accent: '#C5633D', thread: '#F6EEDB', edge: '#563A06' } },
  starfish: { a: { fill: '#E39A5A', accent: '#C5633D', thread: '#F6EEDB', edge: '#5E3010' } },
  leaf: { a: { fill: '#7F9C78', accent: '#B5C8A1', thread: '#F6EEDB', edge: '#1F3321' } },
  pebble: {
    a: { fill: '#6F86A2', accent: '#B4C3D3', thread: '#F6EEDB', edge: '#1E2B40' },
    b: MUSTARD,
  },
  firefly: {
    a: { fill: '#3F5E8A', accent: '#F0CB78', thread: '#F6EEDB', edge: '#1B2A40' },
    b: MUSTARD,
  },
  dot: { a: { fill: '#E39A5A', accent: '#F0CB78', thread: '#F6EEDB', edge: '#5E3010' } },
  stone: { a: { fill: '#E6DDCB', accent: '#CFC3AC', thread: '#8E7A60', edge: '#463630' } },
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
): { edge: string; pts: [number, number][] } {
  const angs = [160, 132, 104, 76, 48, 20];
  const pts = angs.map(
    (a) =>
      [cx + R * Math.cos((a * Math.PI) / 180), cy - R * 0.98 * Math.sin((a * Math.PI) / 180)] as [
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
 * A felt piece: the dark backing showing a little below and right (its thickness), the piece
 * with its edge, and the grain over it from 48 px up. `edge` false: an appliqué sewn on top.
 */
function Piece({
  d,
  fill,
  edge,
  grain,
  backing = true,
}: {
  d: string;
  fill: string;
  edge: string;
  grain: string;
  backing?: boolean;
}) {
  return (
    <g data-felt-piece="">
      {backing ? (
        <path
          d={d}
          fill={edge}
          stroke={edge}
          className="ni-felt-edge"
          strokeLinejoin="round"
          transform="translate(0.6 1.2)"
        />
      ) : null}
      <path d={d} fill={fill} stroke={edge} className="ni-felt-edge" strokeLinejoin="round" />
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
  [24, 3, 40, 7],
  [22, 11, 37, 20],
  [16, 17, 27, 29],
]
  .flatMap(([a, b, c, d]) => [`M${a},${b}L${c},${d}`, `M${-(a ?? 0)},${b}L${-(c ?? 0)},${d}`])
  .concat(['M-22,-12L-33,-25', 'M22,-12L33,-25'])
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
  <g transform="translate(32 37) scale(0.72)">
    <path
      d={CRAB_LIMBS}
      fill="none"
      stroke={c.edge}
      strokeWidth={9}
      strokeLinecap="round"
      transform="translate(0.8 1.6)"
    />
    <path d={CRAB_LIMBS} fill="none" stroke={c.edge} strokeWidth={9} strokeLinecap="round" />
    <path d={CRAB_LIMBS} fill="none" stroke={c.fill} strokeWidth={4.6} strokeLinecap="round" />
    <g transform="translate(-33 -25) scale(-1 1)">
      <Piece d={CLAW} fill={c.fill} edge={c.edge} grain={grain} />
    </g>
    <g transform="translate(33 -25)">
      <Piece d={CLAW} fill={c.fill} edge={c.edge} grain={grain} />
    </g>
    <Piece d={CRAB_BODY} fill={c.fill} edge={c.edge} grain={grain} />
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
    <g className="ni-felt-md" data-face={variant % CRAB_FACES}>
      {crabFace(variant, c)}
    </g>
  </g>
);

// ---------------------------------------------------------------- the shell

const SHELL = fan(32, 50, 29);
const SHELL_INNER = fan(32, 50, 19.5, 2);

const shell: FeltDraw = ({ c, grain }) => {
  const ribs = SHELL.pts
    .slice(1, -1)
    .map(([x, y]) => `M32,47L${f1(32 + (x - 32) * 0.86)},${f1(50 + (y - 50) * 0.86)}`)
    .join('');
  const dots = SHELL.pts.slice(0, -1).map(([x, y], i) => {
    const n = SHELL.pts[i + 1] as [number, number];
    const mx = (x + n[0]) / 2;
    const my = (y + n[1]) / 2;
    return (
      <circle
        key={`${mx}`}
        cx={f1(32 + (mx - 32) * 0.9)}
        cy={f1(50 + (my - 50) * 0.9)}
        r={1.6}
        fill={c.thread}
      />
    );
  });
  return (
    <>
      <Piece
        d="M23.5,48h17a4,4 0 0 1 4,4v2a4,4 0 0 1 -4,4h-17a4,4 0 0 1 -4,-4v-2a4,4 0 0 1 4,-4z"
        fill={MUSTARD.fill}
        edge={MUSTARD.edge}
        grain={grain}
      />
      <Piece d={SHELL.edge} fill={c.fill} edge={c.edge} grain={grain} />
      <Applique d={SHELL_INNER.edge} fill={c.accent} edge={c.edge} grain={grain} />
      <Rim d="M9,38C10,30 15,25 21,22.5" />
      <Stitch d={ribs} color={c.thread} width={1.5} dash="3 2.6" />
      <Only tier="lg">{dots}</Only>
      <Stitch d="M27,55h10" color={MUSTARD.thread} width={1.4} dash="2.4 2.2" />
    </>
  );
};

// ---------------------------------------------------------------- the fish

const FISH_BODY = 'M14,32C18,22 27,16 38,16C47,16 54,23 57,32C54,41 47,48 38,48C27,48 18,42 14,32Z';

const fish: FeltDraw = ({ c, grain }) => (
  <>
    <Piece
      d="M5,20C10.5,23 14,27 17,32C14,37 10.5,41 5,44C6.5,36 6.5,28 5,20Z"
      fill={c.accent}
      edge={c.edge}
      grain={grain}
    />
    <Piece
      d="M30,18C31,12 37,9.5 43,11C41,14.5 39,16.5 36,18Z"
      fill={c.accent}
      edge={c.edge}
      grain={grain}
    />
    <Piece d={FISH_BODY} fill={c.fill} edge={c.edge} grain={grain} />
    <Applique
      d="M24,40C30,44.5 38,45.5 45,44C41,41 33,39.5 24,40Z"
      fill={c.accent}
      edge={c.edge}
      grain={grain}
    />
    <Rim d="M22,23.5C26,20 31,18.5 36,18.3" />
    <Stitch d="M33,21C30,27 30,37 33,43" color={c.thread} width={1.6} />
    <circle cx={46} cy={29} r={4.8} fill="#F6EEDB" stroke={c.edge} strokeWidth={1.2} />
    <Bead cx={46.6} cy={29.4} r={2.9} />
    <Thread className="ni-felt-md" d="M49.5,37Q52,36 53.5,34" width={1.6} />
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
      <Piece d={STAR} fill={c.fill} edge={c.edge} grain={grain} />
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
    <Piece d={LEAF} fill={c.fill} edge={c.edge} grain={grain} />
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

const PEBBLE = 'M9,34C9,21 19,12 33,12C46,12 55,20 55,32C55,44 45,52 32,52C18,52 9,45 9,34Z';

const pebble: FeltDraw = ({ c, grain }) => (
  <>
    <Piece d={PEBBLE} fill={c.fill} edge={c.edge} grain={grain} />
    <Applique
      d="M17,27C19,21 25,18 31,18C29,22 24,26 17,27Z"
      fill={c.accent}
      edge={c.fill}
      grain={grain}
    />
    <Rim d="M14,37C14,31 16,26 20,22" />
    <Stitch
      d="M14,34C14,24 22,17 33,17C43,17 50,23 50,32C50,41 43,47 32,47C21,47 14,42 14,34Z"
      color={c.thread}
      width={1.5}
    />
  </>
);

// ---------------------------------------------------------------- the firefly

const firefly: FeltDraw = ({ c, grain }) => (
  <>
    <Piece
      d="M20,10C29,9 33,17 31,25C24,26 17,21 20,10Z"
      fill="#F6EEDB"
      edge={c.edge}
      grain={grain}
    />
    <Piece
      d="M44,10C35,9 31,17 33,25C40,26 47,21 44,10Z"
      fill="#F6EEDB"
      edge={c.edge}
      grain={grain}
    />
    <Piece d={circlePath(32, 43, 12)} fill={c.accent} edge={c.edge} grain={grain} />
    <Piece
      d="M32,16C38,16 41,22 41,30C41,37 37,40 32,40C27,40 23,37 23,30C23,22 26,16 32,16Z"
      fill={c.fill}
      edge={c.edge}
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
    <Piece d={circlePath(32, 33, 18)} fill={c.fill} edge={c.edge} grain={grain} />
    <Rim d="M19,30C20,25 24,21 29,20" />
    <Stitch d={circlePath(32, 33, 13)} color={c.thread} width={1.5} />
  </>
);

const STONE = 'M7,39C7,24 18,12 33,12C47,12 57,22 57,36C57,48 47,55 32,55C17,55 7,50 7,39Z';

const stone: FeltDraw = ({ c, grain }) => (
  <>
    <Piece d={STONE} fill={c.fill} edge={c.edge} grain={grain} />
    <Applique
      d="M36,20C43,19 49,23 51,29C45,29 39,26 36,20Z"
      fill={c.accent}
      edge={c.accent}
      grain={grain}
    />
    <Rim d="M13,38C13,29 18,22 25,18" />
    <Stitch
      d="M12,39C12,27 21,17 33,17C44,17 52,25 52,36C52,45 44,50 32,50C20,50 12,46 12,39Z"
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
      <Piece d={circlePath(32, 32, 21)} fill={c.fill} edge={c.edge} grain={grain} />
      <Rim d="M16,28C17,21 22,16 29,15" />
      {tone === 'b' ? (
        <g data-mark="ring">
          <circle cx={32} cy={32} r={11} fill="none" stroke="#2B4467" strokeWidth={4} />
          <circle cx={32} cy={32} r={3.8} fill="#2B4467" />
          <Stitch d={circlePath(32, 32, 16.5)} color={c.thread} width={1.4} dash="3 2.6" />
        </g>
      ) : (
        <Stitch d={circlePath(32, 32, 15)} color={c.thread} width={1.6} />
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
