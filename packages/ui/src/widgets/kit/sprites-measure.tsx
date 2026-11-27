import type { ReactElement } from 'react';

/**
 * Object sprites for the measurement and geometry lessons (U05): food and island things,
 * containers and tools, solid-shaped objects (GEO.07 sorts them by solid) and heavy or light
 * things (MEA.15/MEA.16). Same style as `sprites.tsx`: a 64 × 64 box, cozy flat vector, a 3 px
 * outline in the fill's darker shade with round joins, one soft highlight top-left and a contact
 * shadow. All original art, painted only with palette tokens.
 *
 * Solids read by their faces: spheres get a shaded crescent, cylinders elliptical ends, cones a
 * curved base, cubes and prisms three faces in light, base and dark shades of one hue.
 *
 * Each drawing returns shapes only; the caller wraps it in `<svg viewBox="0 0 64 64">`. Tone 'b'
 * is the alternate tint for coloured sub-groups: darker as well as a different hue.
 */

type Tone = 'a' | 'b' | 'red' | 'white' | 'blue';

export type MeasureDraw = (tone: Tone) => ReactElement;

type Token =
  | 'sea'
  | 'sea-deep'
  | 'sea-dark'
  | 'shallows'
  | 'foam'
  | 'sky'
  | 'sky-light'
  | 'horizon'
  | 'sand'
  | 'sand-deep'
  | 'sand-shadow'
  | 'paper'
  | 'coral'
  | 'coral-deep'
  | 'sun'
  | 'sun-deep'
  | 'sunshine'
  | 'sunshine-light'
  | 'sunshine-deep'
  | 'leaf'
  | 'leaf-deep'
  | 'leaf-dark'
  | 'leaf-light'
  | 'wood'
  | 'wood-deep'
  | 'cloud'
  | 'pebble'
  | 'pebble-deep'
  | 'ink'
  | 'ink-soft';

const v = (token: Token) => `var(--color-${token})`;

/** A fill and its outline shade. */
interface Pair {
  fill: string;
  line: string;
}

const pair = (fill: Token, line: Token): Pair => ({ fill: v(fill), line: v(line) });

const CORAL = pair('coral', 'coral-deep');
const SUN = pair('sun', 'sun-deep');
const SUNSHINE = pair('sunshine', 'sunshine-deep');
const LEAF = pair('leaf', 'leaf-deep');
const WOOD = pair('wood', 'wood-deep');
const PEBBLE = pair('pebble', 'pebble-deep');
const CARD = pair('sand-deep', 'wood-deep');
const IRON = pair('ink-soft', 'ink');
const BOBBER = pair('cloud', 'ink-soft');
/** Tone b's default pair (as `toneFill` in sprites.tsx): darker and bluer than every tone a. */
const SEA_B = pair('sea-deep', 'sea-dark');

/** The named colours (sprites.tsx `SpriteTone`): the same on every drawing. */
const WHITE = pair('cloud', 'ink');

const tint = (tone: Tone, a: Pair, b: Pair = SEA_B) => {
  switch (tone) {
    case 'b':
      return b;
    case 'blue':
      return SEA_B;
    case 'red':
      return CORAL;
    case 'white':
      return WHITE;
    default:
      return a;
  }
};

const SHADOW = <ellipse cx="32" cy="57" rx="20" ry="4.5" fill="rgb(38 70 83 / 0.18)" />;

const HIGHLIGHT = (d: string) => (
  <path d={d} stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" fill="none" />
);

/** Props for a filled shape outlined in its shade. */
const painted = (c: Pair, width = 3) =>
  ({
    fill: c.fill,
    stroke: c.line,
    strokeWidth: width,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
  }) as const;

/** Props for an unfilled line. */
const stroked = (color: string, width = 2.5, opacity = 1) =>
  ({
    fill: 'none',
    stroke: color,
    strokeWidth: width,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
    opacity,
  }) as const;

/** Rounds to 0.01 for tidy path strings. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One face of a solid: the fill, then a light (`shade` > 0, white) or dark (`shade` < 0, the
 * outline shade) wash, then the outline, so faces of one hue read as lit, plain and in shadow.
 */
function face(d: string, c: Pair, shade = 0, width = 3) {
  return (
    <g>
      <path d={d} fill={c.fill} />
      {shade > 0 && <path d={d} fill="#fff" opacity={shade} />}
      {shade < 0 && <path d={d} fill={c.line} opacity={-shade} />}
      <path
        d={d}
        fill="none"
        stroke={c.line}
        strokeWidth={width}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </g>
  );
}

/** A thick outlined line (rod, handle, rope): the shade underneath, the fill on top. */
function tube(d: string, c: Pair, width: number) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={c.line} strokeWidth={width + 3} />
      <path d={d} stroke={c.fill} strokeWidth={width} />
    </g>
  );
}

/** The shaded lower-right crescent that turns a disc of radius 21 at (32, 33) into a sphere. */
const SPHERE_SHADE = 'M46.85 18.15A21 21 0 0 1 17.15 47.85C38 53 52 38 46.85 18.15Z';

// ---- Isometric cube -------------------------------------------------------------------------

interface IsoCube {
  top: string;
  left: string;
  right: string;
  /** SVG matrices mapping the unit square onto each face (for pips and panels). */
  mTop: string;
  mLeft: string;
  mRight: string;
}

/** A cube seen from above a corner: centre vertex (cx, cy), half width hw; bottom at cy + 1.09hw. */
function isoCube(cx: number, cy: number, hw: number): IsoCube {
  const q = r2(hw * (12 / 22));
  const h = r2(hw * (24 / 22));
  const l = r2(cx - hw);
  const rt = r2(cx + hw);
  const up = r2(cy - q);
  return {
    top: `M${l} ${up}L${cx} ${r2(cy - 2 * q)}L${rt} ${up}L${cx} ${cy}Z`,
    left: `M${l} ${up}L${cx} ${cy}L${cx} ${r2(cy + h)}L${l} ${r2(up + h)}Z`,
    right: `M${cx} ${cy}L${rt} ${up}L${rt} ${r2(up + h)}L${cx} ${r2(cy + h)}Z`,
    mTop: `matrix(${hw} ${-q} ${hw} ${q} ${l} ${up})`,
    mLeft: `matrix(${hw} ${q} 0 ${h} ${l} ${up})`,
    mRight: `matrix(${hw} ${-q} 0 ${h} ${cx} ${cy})`,
  };
}

const BIG_CUBE = isoCube(32, 30, 22);

/** Unit-square pip layouts (die faces 1, 3 and 5). */
const PIPS: Readonly<Record<1 | 3 | 5, ReadonlyArray<readonly [number, number]>>> = {
  1: [[0.5, 0.5]],
  3: [
    [0.24, 0.24],
    [0.5, 0.5],
    [0.76, 0.76],
  ],
  5: [
    [0.24, 0.24],
    [0.76, 0.24],
    [0.5, 0.5],
    [0.24, 0.76],
    [0.76, 0.76],
  ],
};

function pips(count: 1 | 3 | 5, matrix: string, fill: string, radius: number) {
  return (
    <g transform={matrix} fill={fill}>
      {PIPS[count].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={radius} />
      ))}
    </g>
  );
}

/** A five-point star in the unit square (toy block decoration). */
const STAR_D = `M${Array.from({ length: 10 }, (_, i) => {
  const radius = i % 2 === 1 ? 0.13 : 0.31;
  const angle = -Math.PI / 2 + (i * Math.PI) / 5;
  return `${r2(0.5 + radius * Math.cos(angle))} ${r2(0.52 + radius * Math.sin(angle))}`;
}).join('L')}Z`;

const HEART_D =
  'M.5 .8C.26 .64 .2 .5 .2 .4 .2 .28 .3 .22 .38 .22 .44 .22 .48 .26 .5 .3 .52 .26 .56 .22 .62 .22 .7 .22 .8 .28 .8 .4 .8 .5 .74 .64 .5 .8Z';

/** A raised inset panel on a cube face (unit-square coordinates). */
function panel(matrix: string, line: string) {
  return (
    <g transform={matrix}>
      <rect x="0.14" y="0.14" width="0.72" height="0.72" rx="0.06" fill="#fff" opacity="0.28" />
      <rect
        x="0.14"
        y="0.14"
        width="0.72"
        height="0.72"
        rx="0.06"
        fill="none"
        stroke={line}
        strokeWidth="2"
        opacity="0.6"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

// ---- Curves (vine) --------------------------------------------------------------------------

type Pt = readonly [number, number];
type Cubic = readonly [Pt, Pt, Pt, Pt];

/** Point and unit tangent of a cubic Bézier at t. */
function cubicAt([a, b, c, d]: Cubic, t: number): { at: Pt; dir: Pt } {
  const u = 1 - t;
  const x = u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0];
  const y = u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1];
  const dx = 3 * u * u * (b[0] - a[0]) + 6 * u * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0]);
  const dy = 3 * u * u * (b[1] - a[1]) + 6 * u * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1]);
  const len = Math.hypot(dx, dy) || 1;
  return { at: [x, y], dir: [dx / len, dy / len] };
}

const VINE: Cubic = [
  [6, 42],
  [22, 22],
  [40, 56],
  [58, 30],
];
const VINE_D = `M${VINE[0].join(' ')}C${VINE[1].join(' ')} ${VINE[2].join(' ')} ${VINE[3].join(' ')}`;

/** Leaves along the vine, alternating sides: base point and angle in degrees. */
const VINE_LEAVES = [0.14, 0.34, 0.54, 0.74, 0.92].map((t, i) => {
  const {
    at: [x, y],
    dir: [tx, ty],
  } = cubicAt(VINE, t);
  const angle = (Math.atan2(ty, tx) * 180) / Math.PI + (i % 2 === 0 ? -55 : 55);
  return { x: r2(x), y: r2(y), angle: r2(angle) };
});

// ---- Small shared bits ----------------------------------------------------------------------

/** Shingle rows of a pyramid roof: lines across both faces at fractions of the way down. */
function pyramidRows(apex: Pt, corners: readonly [Pt, Pt, Pt], at: readonly number[]) {
  const lerp = (p: Pt, t: number) =>
    `${r2(apex[0] + (p[0] - apex[0]) * t)} ${r2(apex[1] + (p[1] - apex[1]) * t)}`;
  return at
    .map((t) => `M${lerp(corners[0], t)}L${lerp(corners[1], t)}L${lerp(corners[2], t)}`)
    .join('');
}

// ---- Food and island things -----------------------------------------------------------------

const bun: MeasureDraw = (tone) => {
  const c = tint(tone, SUN);
  const body = 'M7 46c0-14 11-25 25-25s25 11 25 25c0 4-3 7-8 7H15c-5 0-8-3-8-7Z';
  return (
    <>
      {SHADOW}
      <path d={body} fill={c.fill} />
      <path d="M7 46c8 3 42 3 50 0 0 4-3 7-8 7H15c-5 0-8-3-8-7Z" fill={c.line} opacity="0.25" />
      <path d="M18 37l8-8M29 33l9-9M41 35l7-7" {...stroked(v('sunshine-light'), 3)} />
      <path d={body} {...painted(c)} fill="none" />
      {HIGHLIGHT('M13 38c2-5 4-8 7-10')}
    </>
  );
};

const orange: MeasureDraw = (tone) => {
  const c = tint(tone, SUN);
  return (
    <>
      {SHADOW}
      <circle cx="32" cy="33" r="21" fill={c.fill} />
      <path d={SPHERE_SHADE} fill={c.line} opacity="0.3" />
      <g fill={c.line} opacity="0.45">
        <circle cx="24" cy="40" r="0.9" />
        <circle cx="29" cy="46" r="0.9" />
        <circle cx="37" cy="44" r="0.9" />
        <circle cx="42" cy="37" r="0.9" />
        <circle cx="31" cy="36" r="0.9" />
        <circle cx="39" cy="27" r="0.9" />
        <circle cx="22" cy="31" r="0.9" />
      </g>
      <circle cx="32" cy="33" r="21" {...painted(c)} fill="none" />
      <path d="M32 13v-3" {...stroked(v('wood-deep'), 3)} />
      <path d="M33 11c2-5 8-7 13-5-2 5-8 7-13 5Z" {...painted(LEAF, 2.5)} />
      {HIGHLIGHT('M19 26c2-4 5-6 9-7')}
    </>
  );
};

// ---- Containers and tools -------------------------------------------------------------------

const bucket: MeasureDraw = (tone) => {
  const c = tint(tone, SUNSHINE);
  return (
    <>
      {SHADOW}
      <path d="M14 22C14 3 50 3 50 22" {...stroked(v('ink-soft'), 3)} />
      <path d="M12 24h40l-5 29H17Z" {...painted(c)} />
      <path d="M42 24H52L47 53H39Z" fill={c.line} opacity="0.2" />
      <path d="M13.7 34H50.3L49.2 40H14.8Z" fill="#fff" opacity="0.4" />
      <path d="M12 24h40l-5 29H17Z" {...painted(c)} fill="none" />
      <rect x="9" y="18" width="46" height="8" rx="4" {...painted(c)} />
      {HIGHLIGHT('M15 22h12')}
    </>
  );
};

const barrel: MeasureDraw = (tone) => {
  const c = tint(tone, WOOD);
  const body = 'M15 9C10 24 10 39 15 53c3 2 31 2 34 0 5-14 5-29 0-44Z';
  return (
    <>
      {SHADOW}
      <path d={body} fill={c.fill} />
      <path
        d="M41 10C44 25 44 39 41 54c3 0 6-.3 8-1 5-14 5-29 0-44Z"
        fill={c.line}
        opacity="0.22"
      />
      <path
        d="M24 13c-2 13-2 27 0 41M32 13.5v41M40 13c2 13 2 27 0 41"
        {...stroked(c.line, 2, 0.45)}
      />
      <path d={body} {...painted(c)} fill="none" />
      <path
        d="M12.6 18c9 3 29.8 3 38.8 0M12.6 44.5c9 3 29.8 3 38.8 0"
        {...stroked(v('ink-soft'), 3.5)}
      />
      {face('M15 9a17 4.5 0 1 0 34 0a17 4.5 0 1 0-34 0Z', c, 0.3)}
      <ellipse cx="32" cy="9" rx="12" ry="2.8" {...stroked(c.line, 2, 0.5)} />
      {HIGHLIGHT('M17 25c-1 5-1 10 0 15')}
    </>
  );
};

const tub: MeasureDraw = (tone) => {
  const c = tint(tone, PEBBLE);
  // A wide wash tub: two side handles, ribbed sides and water inside.
  return (
    <>
      {SHADOW}
      <path d="M9 27c-5 0-5 8 0 8M55 27c5 0 5 8 0 8" {...stroked(c.line, 3)} />
      <path d="M7 22L13 49C15 54 49 54 51 49L57 22Z" {...painted(c)} />
      <path d="M44 22H57L51 49C50 51 48 52 45 52.5Z" fill={c.line} opacity="0.2" />
      <path d="M9.5 33c10 3 35 3 45 0M12 44c10 3 30 3 40 0" {...stroked(c.line, 2.5, 0.5)} />
      <ellipse cx="32" cy="22" rx="25" ry="6.5" {...painted(c)} />
      <ellipse
        cx="32"
        cy="22.5"
        rx="20.5"
        ry="4.2"
        fill={v('shallows')}
        stroke={c.line}
        strokeWidth="2"
      />
      {HIGHLIGHT('M13 30l2.5 12')}
    </>
  );
};

const jug: MeasureDraw = (tone) => {
  const c = tint(tone, CORAL);
  return (
    <>
      {SHADOW}
      {tube('M40 14c10-1 15 7 12 16', c, 4.5)}
      <path d="M25 9l-8-3c0 5 3 8 8 9Z" {...painted(c)} />
      <path
        d="M24 8h16l-1 9c8 4 13 12 13 21 0 9-4 14-9 16H21c-5-2-9-7-9-16 0-9 5-17 13-21Z"
        {...painted(c)}
      />
      <path d="M13.5 33c12 4 26 4 38 0" {...stroked(v('cloud'), 3, 0.55)} />
      <ellipse cx="32" cy="8" rx="8" ry="2.5" fill={c.line} stroke={c.line} strokeWidth="3" />
      {HIGHLIGHT('M17 30c1-4 3-7 7-9')}
    </>
  );
};

const sack: MeasureDraw = (tone) => {
  const c = tint(tone, CARD);
  return (
    <>
      {SHADOW}
      <path d="M23 26L19 10c4 2 8-1 13 1 5-2 9 1 13-1l-4 16Z" {...painted(c)} />
      <path
        d="M21 25C10 29 6 38 6 46c0 5 4 8 10 8h32c6 0 10-3 10-8 0-8-4-17-15-21Z"
        {...painted(c)}
      />
      <path d="M25 34c-3 6-4 12-3 18M41 34c3 6 4 12 3 18" {...stroked(c.line, 2.5, 0.45)} />
      <rect
        x="30"
        y="38"
        width="10"
        height="9"
        rx="1"
        transform="rotate(-8 35 42.5)"
        {...painted(pair('sand', 'wood-deep'), 2)}
      />
      {tube('M21 25c7 4 15 4 22 0', WOOD, 3.5)}
      <path d="M37 28l2 7M39 28l5 5" {...stroked(v('wood-deep'), 2.5)} />
      {HIGHLIGHT('M12 42c1-4 3-8 7-11')}
    </>
  );
};

const pallet: MeasureDraw = (tone) => {
  const c = tint(tone, WOOD);
  // A low flat pallet: slatted deck, three blocks, a bottom board; the right end in shade.
  return (
    <>
      {SHADOW}
      <path d="M16 40H26V48H16ZM34 40H44V48H34Z" fill={c.line} opacity="0.45" />
      {face('M8 48H52V53H8Z', c)}
      {face('M8 40H16V48H8Z', c)}
      {face('M26 40H34V48H26Z', c)}
      {face('M44 40H52V48H44Z', c)}
      {face('M52 40L58 32V45L52 53Z', c, -0.3)}
      {face('M8 35H52V40H8Z', c)}
      {face('M52 35L58 27V32L52 40Z', c, -0.3)}
      {face('M14 27H58L52 35H8Z', c, 0.25)}
      <path d="M16.8 35l6-8M25.6 35l6-8M34.4 35l6-8M43.2 35l6-8" {...stroked(c.line, 2, 0.7)} />
      {HIGHLIGHT('M17 30h10')}
    </>
  );
};

const lantern: MeasureDraw = (tone) => {
  const c = tint(tone, CORAL);
  return (
    <>
      {SHADOW}
      <circle cx="32" cy="32" r="19" fill={v('sunshine-light')} opacity="0.45" />
      <circle cx="32" cy="8" r="4.5" {...stroked(c.line, 3)} />
      <path d="M17 21H47L40 12H24Z" {...painted(c)} />
      <rect
        x="20"
        y="21"
        width="24"
        height="23"
        fill={v('sunshine-light')}
        stroke={c.line}
        strokeWidth="3"
      />
      <path d="M32 25c4 4 5 8 5 11a5 5 0 0 1-10 0c0-3 1-7 5-11Z" {...painted(SUN, 2)} />
      <path d="M32 32c2 2 2.5 4 2.5 5a2.5 2.5 0 0 1-5 0c0-1 .5-3 2.5-5Z" fill={v('sunshine')} />
      <path d="M25.5 21V44M38.5 21V44" {...stroked(c.line, 2.5)} />
      <rect x="16" y="44" width="32" height="9" rx="3" {...painted(c)} />
      {HIGHLIGHT('M25 16.5h6')}
    </>
  );
};

const book: MeasureDraw = (tone) => {
  const c = tint(tone, SUN);
  // A closed book lying flat: cover on top, boards and page block on the front and side.
  return (
    <>
      {SHADOW}
      {face('M6 36H48V50H6Z', c)}
      <path d="M7.5 38.5H48V47H7.5Z" fill={v('paper')} stroke={c.line} strokeWidth="2" />
      <path d="M10 41h36M10 44h36" {...stroked(v('sand-deep'), 1.5)} />
      {face('M48 36L58 22V36L48 50Z', c, -0.28)}
      <path
        d="M48 38.5L58 24.5V33L48 47Z"
        fill={v('paper')}
        stroke={c.line}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M48 41.3L58 27.3M48 44.1L58 30.1" {...stroked(v('sand-deep'), 1.5)} />
      {face('M16 22H58L48 36H6Z', c, 0.25)}
      <path d="M19 25H51L44.5 33H13Z" {...stroked(c.line, 2, 0.45)} />
      <path d="M30 47v7l2.5-2 2.5 2v-7" {...painted(CORAL, 1.5)} />
      {HIGHLIGHT('M20 24.5h9')}
    </>
  );
};

const box: MeasureDraw = (tone) => {
  const c = tint(tone, CARD);
  // A closed cardboard box: front, side and taped top, a rectangular prism.
  return (
    <>
      {SHADOW}
      {face('M6 28H44V54H6Z', c)}
      {face('M44 28L58 16V42L44 54Z', c, -0.28)}
      {face('M6 28L20 16H58L44 28Z', c, 0.3)}
      <path d="M22 28L36 16H42L28 28ZM22 28H28V37H22Z" fill={v('sand')} opacity="0.85" />
      <path d="M25 28L39 16" {...stroked(c.line, 1.8, 0.6)} />
      {HIGHLIGHT('M10 33v10')}
    </>
  );
};

const tent: MeasureDraw = (tone) => {
  const c = tint(tone, LEAF);
  // A pyramid tent: square base, two triangular faces meeting at the pole, a half-open door.
  return (
    <>
      {SHADOW}
      <path d="M31 7V2.5" {...stroked(v('ink-soft'), 2.5)} />
      <path d="M31 2.5l7 2.5-7 2.5Z" {...painted(CORAL, 1.5)} />
      {face('M31 7L36 54L58 45Z', c, -0.3)}
      {face('M31 7L6 48L36 54Z', c)}
      <path d="M26.5 26.8L15 49.8L27 52.2Z" {...painted(IRON, 2)} />
      {face('M26.5 26.8L15 49.8L20.5 50.9Z', c, 0.3, 2)}
      {HIGHLIGHT('M28 15l-7 12')}
    </>
  );
};

const ROOF_APEX: Pt = [32, 8];
const ROOF_CORNERS: readonly [Pt, Pt, Pt] = [
  [6, 44],
  [34, 51],
  [58, 42],
];
const ROOF_ROWS = pyramidRows(ROOF_APEX, ROOF_CORNERS, [0.3, 0.55, 0.8]);

const roofTop: MeasureDraw = (tone) => {
  const c = tint(tone, CORAL);
  // A pyramid roof cap: two tiled triangular faces to a point, an eave board and a finial.
  return (
    <>
      {SHADOW}
      {face('M6 44L34 51V55L6 48Z', WOOD)}
      {face('M34 51L58 42V46L34 55Z', WOOD, -0.3)}
      {face('M32 8L34 51L58 42Z', c, -0.3)}
      {face('M32 8L6 44L34 51Z', c)}
      <path d={ROOF_ROWS} {...stroked(c.line, 2, 0.55)} />
      <path d="M32 8V4.5" {...stroked(v('ink-soft'), 2.5)} />
      <circle cx="32" cy="4" r="2.2" {...painted(SUNSHINE, 2)} />
      {HIGHLIGHT('M29 15l-7 10')}
    </>
  );
};

const can: MeasureDraw = (tone) => {
  const label = tint(tone, CORAL);
  // A tin can (cylinder): elliptical lid, curved base, a label band wrapping round it.
  return (
    <>
      {SHADOW}
      <path d="M12 14V48A20 6 0 0 0 52 48V14Z" {...painted(PEBBLE)} />
      <path d="M12 20A20 6 0 0 0 52 20V42A20 6 0 0 1 12 42Z" {...painted(label, 2.5)} />
      <path d="M12 31A20 6 0 0 0 52 31" {...stroked(v('cloud'), 2.5, 0.7)} />
      <path d="M44 14H52V48A20 6 0 0 1 44 53.4Z" fill={v('ink')} opacity="0.13" />
      {face('M12 14a20 6 0 1 0 40 0a20 6 0 1 0-40 0Z', PEBBLE, 0.4)}
      <ellipse cx="32" cy="14" rx="16" ry="4.2" {...stroked(v('pebble-deep'), 2, 0.6)} />
      {HIGHLIGHT('M17 24v14')}
    </>
  );
};

const drum: MeasureDraw = (tone) => {
  const c = tint(tone, CORAL);
  // A drum (cylinder): white drumhead on top, hoops at both ends, zigzag cords between.
  return (
    <>
      {SHADOW}
      <path d="M8 18V44A24 8 0 0 0 56 44V18Z" {...painted(c)} />
      <path d="M44 18H56V44A24 8 0 0 1 44 50.9Z" fill={c.line} opacity="0.22" />
      <path d="M10 26L17 46L24 27.5L32 48.5L40 27.5L47 46L54 26" {...stroked(v('cloud'), 2.2)} />
      {tube('M8 44A24 8 0 0 0 56 44', SUNSHINE, 3)}
      <ellipse cx="32" cy="18" rx="24" ry="8" fill={v('paper')} />
      {tube('M8 18a24 8 0 1 0 48 0a24 8 0 1 0-48 0Z', SUNSHINE, 3)}
      {HIGHLIGHT('M17 15c3-2 7-3 11-3.5')}
    </>
  );
};

const partyHat: MeasureDraw = (tone) => {
  const c = tint(tone, SUNSHINE);
  // A cone: straight sides to a point, a curved round base.
  return (
    <>
      {SHADOW}
      <path d="M32 7L13 47A19 5 0 0 0 51 47Z" fill={c.fill} />
      <path d="M32 7L51 47A19 5 0 0 1 41 51.4Z" fill={c.line} opacity="0.25" />
      <g fill={v('coral')}>
        <circle cx="31" cy="22" r="2.4" />
        <circle cx="36" cy="31" r="2.4" />
        <circle cx="25" cy="36" r="2.4" />
        <circle cx="40" cy="42" r="2.4" />
        <circle cx="29" cy="46" r="2.4" />
      </g>
      <path d="M32 7L13 47A19 5 0 0 0 51 47Z" {...painted(c)} fill="none" />
      <circle cx="32" cy="7" r="4.5" {...painted(CORAL, 2.5)} />
      {HIGHLIGHT('M27 19l-5 12')}
    </>
  );
};

const iceCream: MeasureDraw = (tone) => {
  const scoop = tint(tone, CORAL);
  const wafer = CARD;
  // A wafer cone (pointed, round top) holding a scoop with a drippy edge.
  return (
    <>
      {SHADOW}
      <path d="M15 30L32 56L49 30Z" fill={wafer.fill} />
      <path d="M32 30H49L32 56Z" fill={wafer.line} opacity="0.2" />
      <path
        d="M24 30L36.5 49.1M32 30L40.5 43M40 30L44.5 36.9M40 30L27.5 49.1M32 30L23.5 43M24 30L19.5 36.9"
        {...stroked(wafer.line, 1.8, 0.7)}
      />
      <path d="M15 30L32 56L49 30Z" {...painted(wafer)} fill="none" />
      <path
        d="M14 31c-2-11 6-21 18-21s20 10 18 21c0 4-4 5-5 3-1 4-5 4-6 2-1 3-6 3-7 1-1 2-6 2-7-1-1 2-5 2-6-2-1 2-5 1-5-3Z"
        {...painted(scoop)}
      />
      {HIGHLIGHT('M21 20c2-3 5-5 8-5')}
    </>
  );
};

const dice: MeasureDraw = (tone) => {
  const c = tint(tone, BOBBER, SEA_B);
  const pip = tone === 'b' ? v('cloud') : v('ink');
  const cube = BIG_CUBE;
  // A die as a cube: three faces showing 1, 5 and 3.
  return (
    <>
      {SHADOW}
      {face(cube.left, c, -0.08)}
      {face(cube.right, c, -0.22)}
      {face(cube.top, c, 0.15)}
      {pips(1, cube.mTop, v('coral'), 0.15)}
      {pips(5, cube.mLeft, pip, 0.1)}
      {pips(3, cube.mRight, pip, 0.1)}
      {HIGHLIGHT('M15 18.5l9-5')}
    </>
  );
};

const block: MeasureDraw = (tone) => {
  const c = tint(tone, SUN);
  const cube = BIG_CUBE;
  // A toy building block (cube) with raised panels, a star and a heart.
  return (
    <>
      {SHADOW}
      {face(cube.left, c)}
      {face(cube.right, c, -0.28)}
      {face(cube.top, c, 0.3)}
      {panel(cube.mTop, c.line)}
      {panel(cube.mLeft, c.line)}
      {panel(cube.mRight, c.line)}
      <path d={STAR_D} transform={cube.mLeft} fill={v('coral')} />
      <path d={HEART_D} transform={cube.mRight} fill={v('coral')} />
      {HIGHLIGHT('M15 18.5l9-5')}
    </>
  );
};

const ball: MeasureDraw = (tone) => {
  const c = tint(tone, CORAL);
  // A beach ball (sphere): coloured panels from pole to pole and a shaded crescent.
  return (
    <>
      {SHADOW}
      <circle cx="32" cy="33" r="21" fill={v('cloud')} />
      <path d="M32 12A21 21 0 0 0 32 54C18 44 18 22 32 12Z" fill={c.fill} />
      <path d="M32 12A21 21 0 0 1 32 54C46 44 46 22 32 12Z" fill={v('sunshine')} />
      <path d={SPHERE_SHADE} fill={v('ink')} opacity="0.12" />
      <path d="M32 12C18 22 18 44 32 54M32 12C46 22 46 44 32 54" {...stroked(c.line, 2)} />
      <circle cx="32" cy="33" r="21" {...painted(c)} fill="none" />
      <ellipse cx="32" cy="13.5" rx="4" ry="2" {...painted(BOBBER, 1.5)} />
      {HIGHLIGHT('M17 26c2-4 4-6 7-8')}
    </>
  );
};

// ---- Measuring things -----------------------------------------------------------------------

const VINE_LEAF = 'M0 0C3-5 10-8 17-7C14 1 7 4 0 0Z';

const vine: MeasureDraw = (tone) => {
  const c = tint(tone, LEAF);
  const stem = pair('leaf-deep', 'leaf-dark');
  return (
    <>
      {SHADOW}
      {tube(VINE_D, stem, 3)}
      <path d="M58 30c3-3 2-8-2-8s-4 5-1 5" {...stroked(v('leaf-dark'), 2)} />
      <path d="M22 34c-3-3-1-7 2-6" {...stroked(v('leaf-dark'), 2)} />
      {VINE_LEAVES.map(({ x, y, angle }) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${angle})`}>
          <path d={VINE_LEAF} {...painted(c, 2.5)} />
          <path d="M1 0C6-2 10-3 15-5" {...stroked(c.line, 1.5, 0.6)} />
        </g>
      ))}
      {HIGHLIGHT('M9 37c2-3 4-5 6-7')}
    </>
  );
};

/** Every measurement and geometry sprite, keyed by sprite id. */
// K02 slice 4c-1 (MEA.08): everyday things a child knows the size of, to sort by the unit they are
// measured in: a pencil and a shoe (inches), a door and a table (feet).

const pencil: MeasureDraw = (tone) => {
  const c = tint(tone, SUNSHINE);
  // A pencil lying across the box: painted body, bare wood cone, dark tip, pink eraser.
  return (
    <>
      {SHADOW}
      <g transform="rotate(-20 32 34)">
        <path d="M14 29H44V39H14Z" {...painted(c)} />
        <path d="M14 34H44" {...stroked(c.line, 1.5, 0.5)} />
        <path d="M44 29L56 34L44 39Z" {...painted(WOOD, 2.5)} />
        <path d="M52.5 32.5L56 34L52.5 35.5Z" fill={v('ink')} />
        <path d="M7 29H14V39H7A3 3 0 0 1 4 36V32A3 3 0 0 1 7 29Z" {...painted(CORAL)} />
        <path d="M11 29V39" {...stroked(v('pebble-deep'), 2.5)} />
        {HIGHLIGHT('M17 31.5h12')}
      </g>
    </>
  );
};

const shoe: MeasureDraw = (tone) => {
  const c = tint(tone, CORAL);
  // A sneaker side on: toe to the right, laces on top, a pale sole.
  return (
    <>
      {SHADOW}
      <path
        d="M8 47V26A4 4 0 0 1 12 22H22A4 4 0 0 1 26 26V30C34 31 42 34 50 38A8 8 0 0 1 56 45V47Z"
        {...painted(c)}
      />
      <path d="M6 46H58V51A3 3 0 0 1 55 54H9A3 3 0 0 1 6 51Z" {...painted(WHITE)} />
      <path d="M29 32l4 4M35 34l4 4M41 36.5l3 3" {...stroked(v('cloud'), 3)} />
      {HIGHLIGHT('M12 27v8')}
    </>
  );
};

const door: MeasureDraw = (tone) => {
  const c = tint(tone, WOOD);
  // A front door, tall and narrow, standing on the ground: two panels and a round knob.
  return (
    <>
      {SHADOW}
      <path d="M17 4H47V56H17Z" {...painted(c)} />
      <path d="M22 9H42V27H22Z" {...stroked(c.line, 2.5, 0.6)} />
      <path d="M22 32H42V51H22Z" {...stroked(c.line, 2.5, 0.6)} />
      <circle cx="41" cy="30" r="2.8" {...painted(SUN, 2)} />
      {HIGHLIGHT('M21 7v14')}
    </>
  );
};

const table: MeasureDraw = (tone) => {
  const c = tint(tone, WOOD);
  // A kitchen table: a wide top on four legs (two seen), standing on the ground.
  return (
    <>
      {SHADOW}
      <path d="M12 26V55M52 26V55" {...stroked(c.line, 5)} />
      <path d="M12 26V55M52 26V55" {...stroked(c.fill, 2)} />
      <path d="M4 20H60V27H4Z" {...painted(c)} />
      <path d="M14 30H50" {...stroked(c.line, 3, 0.6)} />
      {HIGHLIGHT('M8 22.5h20')}
    </>
  );
};

export const MEASURE_DRAWINGS: Readonly<Record<string, MeasureDraw>> = {
  bun,
  orange,
  bucket,
  barrel,
  tub,
  jug,
  sack,
  pallet,
  lantern,
  book,
  box,
  tent,
  'roof-top': roofTop,
  can,
  drum,
  'party-hat': partyHat,
  'ice-cream': iceCream,
  dice,
  block,
  ball,
  vine,
  pencil,
  shoe,
  door,
  table,
};
