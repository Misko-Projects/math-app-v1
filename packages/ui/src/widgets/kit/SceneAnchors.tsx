import type { ReactElement } from 'react';

/**
 * Reference objects for the position-words scene ("put the crab above the crate"). Each drawing
 * fills its own viewBox edge to edge (within the outline's half width), so the box is the
 * object's visible extent and children judge above, below and beside from what they see. Same
 * style as the sprites: flat vector, outlined in the fill's shade, one soft highlight. No contact
 * shadow: the box is the object. Decorative (aria-hidden); the scene names the anchor.
 */

type AnchorId = 'crate' | 'sack' | 'pallet' | 'jug' | 'lantern';

/** Each anchor's viewBox size; the aspect ratio is the object's width : height in the scene. */
export const ANCHOR_VIEWBOX: Readonly<Record<AnchorId, { w: number; h: number }>> = {
  crate: { w: 80, h: 80 },
  sack: { w: 64, h: 80 },
  pallet: { w: 96, h: 32 },
  jug: { w: 48, h: 72 },
  lantern: { w: 40, h: 72 },
};

interface Pair {
  fill: string;
  line: string;
}

const WOOD: Pair = { fill: 'var(--color-wood)', line: 'var(--color-wood-deep)' };
const SACKING: Pair = { fill: 'var(--color-sand-deep)', line: 'var(--color-wood-deep)' };
const PATCH: Pair = { fill: 'var(--color-sand)', line: 'var(--color-wood-deep)' };
const CORAL: Pair = { fill: 'var(--color-coral)', line: 'var(--color-coral-deep)' };
const FLAME: Pair = { fill: 'var(--color-sun)', line: 'var(--color-sun-deep)' };
const GLASS = 'var(--color-sunshine-light)';

const HIGHLIGHT = (d: string) => (
  <path d={d} stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" fill="none" />
);

const painted = (c: Pair, width = 3) =>
  ({
    fill: c.fill,
    stroke: c.line,
    strokeWidth: width,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
  }) as const;

const stroked = (color: string, width = 2.5, opacity = 1) =>
  ({
    fill: 'none',
    stroke: color,
    strokeWidth: width,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
    opacity,
  }) as const;

/** A face with a light (> 0) or dark (< 0) wash under its outline. */
function face(d: string, c: Pair, shade = 0) {
  return (
    <g>
      <path d={d} fill={c.fill} />
      {shade > 0 && <path d={d} fill="#fff" opacity={shade} />}
      {shade < 0 && <path d={d} fill={c.line} opacity={-shade} />}
      <path d={d} {...painted(c)} fill="none" />
    </g>
  );
}

/** A thick outlined line: the shade underneath, the fill on top. */
function tube(d: string, c: Pair, width: number) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={c.line} strokeWidth={width + 3} />
      <path d={d} stroke={c.fill} strokeWidth={width} />
    </g>
  );
}

/** 80 × 80: a square slatted crate with a diagonal brace. */
const crate = () => (
  <>
    <rect x="1.5" y="1.5" width="77" height="77" rx="3" {...painted(WOOD)} />
    <rect x="11" y="11" width="58" height="58" fill={WOOD.line} opacity="0.45" />
    <rect x="11" y="12" width="58" height="17" {...painted(WOOD, 2)} />
    <rect x="11" y="31.5" width="58" height="17" {...painted(WOOD, 2)} />
    <rect x="11" y="51" width="58" height="17" {...painted(WOOD, 2)} />
    {tube('M15 65L65 15', WOOD, 7)}
    <path d="M16 20h12M40 40h14M18 59h10" {...stroked(WOOD.line, 2, 0.4)} />
    <g fill={WOOD.line}>
      <circle cx="6" cy="6" r="1.8" />
      <circle cx="74" cy="6" r="1.8" />
      <circle cx="6" cy="74" r="1.8" />
      <circle cx="74" cy="74" r="1.8" />
    </g>
    {HIGHLIGHT('M11 6.3h24')}
  </>
);

/** 64 × 80: a tied cloth sack, bulging at the bottom, a ruffled top above the tie. */
const sack = () => (
  <>
    <path d="M23 31L17 3c5 2.5 10-1.5 15 0 5-1.5 10 2.5 15 0l-6 28Z" {...painted(SACKING)} />
    <path
      d="M21 30C8 36 1.5 52 1.5 64c0 9 6 14.5 14 14.5h33c8 0 14-5.5 14-14.5 0-12-6.5-28-19.5-34Z"
      {...painted(SACKING)}
    />
    <path d="M24 41c-4 9-5 20-4 32M42 41c4 9 5 20 4 32" {...stroked(SACKING.line, 2.5, 0.45)} />
    <rect
      x="31"
      y="50"
      width="13"
      height="12"
      rx="1.5"
      transform="rotate(-8 37.5 56)"
      {...painted(PATCH, 2)}
    />
    {tube('M21 30c7 4.5 15 4.5 23 0', WOOD, 4)}
    <path d="M38 34l2 9M40.5 34l6 7" {...stroked(WOOD.line, 3)} />
    {HIGHLIGHT('M9 55c1-6 4-11 9-15')}
  </>
);

/** 96 × 32: a low flat pallet, slatted deck, three blocks, a bottom board, right end in shade. */
const pallet = () => (
  <>
    <path d="M13 14H37.5V23H13ZM50 14H74.5V23H50Z" fill={WOOD.line} opacity="0.75" />
    {face('M1.5 23H86V30.5H1.5Z', WOOD)}
    {face('M1.5 14H13V23H1.5Z', WOOD)}
    {face('M37.5 14H50V23H37.5Z', WOOD)}
    {face('M74.5 14H86V23H74.5Z', WOOD)}
    {face('M86 23L94.5 15.5V23L86 30.5Z', WOOD, -0.3)}
    {face('M86 14L94.5 6.5V15.5L86 23Z', WOOD, -0.3)}
    {face('M1.5 9H86V14H1.5Z', WOOD)}
    {face('M86 9L94.5 1.5V6.5L86 14Z', WOOD, -0.3)}
    {face('M10 1.5H94.5L86 9H1.5Z', WOOD, 0.25)}
    <path
      d="M18.4 9l8.5-7.5M35.3 9l8.5-7.5M52.2 9l8.5-7.5M69.1 9l8.5-7.5"
      {...stroked(WOOD.line, 2, 0.7)}
    />
    {HIGHLIGHT('M14 5.3h18')}
  </>
);

/** 48 × 72: a water jug with a spout on the left and a handle on the right. */
const jug = () => (
  <>
    {tube('M27 12C40 10 42 22 42 26S40 36 36 40', CORAL, 5)}
    <path d="M15 4L1.5 2.5C3 7 8 11 15 12Z" {...painted(CORAL)} />
    <path
      d="M14 4.5H28L27.5 17C36 21 38 32 38 44 38 58 34 66 29 70.5H13C8 66 4 58 4 44 4 32 6 21 14.5 17Z"
      {...painted(CORAL)}
    />
    <path
      d="M30 22C36 27 38 35 38 44 38 58 34 66 29 70.5H25C30 64 33 56 33 44 33 35 32 28 30 22Z"
      fill={CORAL.line}
      opacity="0.2"
    />
    <path d="M5 40c10 4 22 4 32.5 0" {...stroked('var(--color-cloud)', 3, 0.55)} />
    <ellipse cx="21" cy="4.5" rx="7" ry="3" fill={CORAL.line} stroke={CORAL.line} strokeWidth="3" />
    {HIGHLIGHT('M9 36c1-5 3-9 7-12')}
  </>
);

/** 40 × 72: a standing lantern, ring and cap on top, a glowing glass, a wide base. */
const lantern = () => (
  <>
    <circle cx="20" cy="7" r="4" {...stroked(CORAL.line, 3)} />
    <path d="M1.5 21H38.5L29 11H11Z" {...painted(CORAL)} />
    <rect x="7" y="21" width="26" height="37" fill={GLASS} stroke={CORAL.line} strokeWidth="3" />
    <path
      d="M20 30c5 5 6.5 10 6.5 14a6.5 6.5 0 0 1-13 0c0-4 1.5-9 6.5-14Z"
      {...painted(FLAME, 2)}
    />
    <path
      d="M20 39c2.5 2.5 3 5 3 6.5a3 3 0 0 1-6 0c0-1.5.5-4 3-6.5Z"
      fill="var(--color-sunshine)"
    />
    <path d="M12.5 21V58M27.5 21V58" {...stroked(CORAL.line, 2.5)} />
    <rect x="1.5" y="58" width="37" height="12.5" rx="3" {...painted(CORAL)} />
    {HIGHLIGHT('M12 17h7')}
  </>
);

const ANCHOR_ART: Readonly<Record<AnchorId, () => ReactElement>> = {
  crate,
  sack,
  pallet,
  jug,
  lantern,
};

const isAnchor = (sprite: string): sprite is AnchorId => Object.hasOwn(ANCHOR_VIEWBOX, sprite);

export interface AnchorArtProps {
  sprite: string;
  className?: string;
}

/** One scene anchor, drawn to fill its box; unknown ids draw the crate. */
export function AnchorArt({ sprite, className }: AnchorArtProps): ReactElement {
  const id: AnchorId = isAnchor(sprite) ? sprite : 'crate';
  const { w, h } = ANCHOR_VIEWBOX[id];
  return (
    <svg
      // `ni-art` pins the legacy art palette (theme.css) until the scene props are redrawn in felt.
      className={className ? `ni-art ${className}` : 'ni-art'}
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      data-anchor={sprite}
    >
      {ANCHOR_ART[id]()}
    </svg>
  );
}
