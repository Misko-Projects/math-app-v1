import type { ReactNode } from 'react';
import type { ArtProps } from '../core/ArtSvg';
import { ArtSvg } from '../core/ArtSvg';
import { ContactShadow } from '../core/Shading';
import { HundredWhaleBody, WHALE_H, WHALE_W } from './HundredWhale';
import { Hop, Loop, PebbleFrame } from './parts';
import {
  CRITTER_H,
  CRITTER_W,
  coinValue,
  drawableNumber,
  effectiveFamily,
  hundredFrames,
  PALETTE_FILLS,
  type PebblingFamily,
  type PebblingPalette,
  type PebblingPose,
  type PebblingSpecies,
  tensLayout,
} from './pebbling';
import { ClockFace, Coin, FractionShell } from './slots';
import { type BodyProps, SHADOW_RX, SPECIES_BODY } from './species';

export interface PebblingProps extends ArtProps {
  species: PebblingSpecies;
  palette: PebblingPalette;
  /**
   * The quantity in the shell (05 §5). 0–10 lights that many pebbles in one ten-frame; above 10 (or
   * with `family: 'tens'`) Ten Turtles carry the tens and a friend the ones. For the families it is
   * the fraction (0–1), the hour (1–12) or the coin value (1, 5, 10, 25). `null` draws a plain shell.
   */
  number: number | null;
  family?: PebblingFamily;
  pose?: PebblingPose;
  /** Coin Clam: also print the value as an ink numeral on the coin. */
  showValue?: boolean;
}

/** Seconds between neighbours' loops in a family, so they bob and blink out of step. */
const STAGGER = 0.37;

interface CritterProps {
  species: PebblingSpecies;
  palette: PebblingPalette;
  pose: PebblingPose;
  slot?: ReactNode;
  variant?: BodyProps['variant'];
  delay?: number;
  x?: number;
  y?: number;
  scale?: number;
  /** In a tens family: `ten` (a Ten Turtle) or `ones` (the friend). Exposed as data-role. */
  kind?: 'ten' | 'ones';
}

/** One critter in its 220 × 200 box: the shadow stays on the ground while the body bobs or hops. */
function Critter({
  species,
  palette,
  pose,
  slot,
  variant,
  delay = 0,
  x = 0,
  y = 0,
  scale = 1,
  kind,
}: CritterProps) {
  const c = PALETTE_FILLS[palette];
  const Body = SPECIES_BODY[species];
  const floats = species === 'seahorse' || species === 'clockfish';
  return (
    <g
      transform={`translate(${x} ${y})${scale === 1 ? '' : ` scale(${scale})`}`}
      data-critter={species}
      data-role={kind}
    >
      <ContactShadow
        cx={110}
        cy={191}
        rx={SHADOW_RX[species]}
        ry={8}
        opacity={floats ? 0.1 : 0.18}
      />
      <Hop on={pose === 'cheer'} duration={0.9} delay={delay}>
        <Loop token={floats ? 'bob-slow' : 'bob'} on={pose !== 'cheer'} delay={delay * 2}>
          <Body c={c} pose={pose} slot={slot} delay={delay} variant={variant} />
        </Loop>
      </Hop>
    </g>
  );
}

function frameSlot(palette: PebblingPalette, lit: number, scale = 1) {
  const c = PALETTE_FILLS[palette];
  return <PebbleFrame x={0} y={0} lit={lit} bed={c.belly} edge={c.deep} scale={scale} />;
}

interface Layout {
  w: number;
  h: number;
  /** Default rendered width, in px. */
  size: number;
  body: ReactNode;
}

/** The friend's scale next to a Ten Turtle (its pebbles stay ≥ 9 px at the family's default size). */
const FRIEND_SCALE = 0.74;
const TURTLE_STEP = 186;
const ROW_STEP = 118;
const BACK_ROW_SHIFT = 60;
/** A Ten Turtle's default width in a family, in CSS px (pebbles ≈ 9 px across). */
const TURTLE_PX = 112;

function tensFamily(
  n: number,
  species: PebblingSpecies,
  palette: PebblingPalette,
  pose: PebblingPose,
): Layout {
  const { tens, ones, rows } = tensLayout(n);
  if (tens === 0) return single(species, palette, pose, frameSlot(palette, ones));
  // Teens: the Ten Turtle wears its own colours, so the friend with the ones stands out.
  const turtlePalette: PebblingPalette = ones === 0 ? palette : palette === 'leaf' ? 'sea' : 'leaf';
  const items: ReactNode[] = [];
  let w = 0;
  const twoRows = rows.length === 2;
  const frontY = twoRows ? ROW_STEP : 0;
  // Draw the back row first, right to left, so each head overlaps the shell behind it.
  rows.forEach((count, row) => {
    const shift = twoRows && row === 0 ? BACK_ROW_SHIFT : 0;
    const y = twoRows && row === 1 ? frontY : 0;
    for (let i = count - 1; i >= 0; i--) {
      const index = row * 5 + i;
      const x = shift + i * TURTLE_STEP;
      w = Math.max(w, x + CRITTER_W);
      items.push(
        <Critter
          key={`t${index}`}
          species="turtle"
          palette={turtlePalette}
          pose={pose}
          slot={frameSlot(turtlePalette, 10)}
          delay={-index * STAGGER}
          x={x}
          y={y}
          kind="ten"
        />,
      );
    }
  });
  let h = frontY + CRITTER_H;
  if (ones > 0) {
    const lastRow = rows[rows.length - 1] ?? 1;
    const fx = (lastRow - 1) * TURTLE_STEP + CRITTER_W - 18;
    const fy = frontY + CRITTER_H * (1 - FRIEND_SCALE) + 8;
    w = Math.max(w, fx + CRITTER_W * FRIEND_SCALE);
    h = Math.max(h, fy + CRITTER_H * FRIEND_SCALE);
    items.push(
      <Critter
        key="friend"
        species={species}
        palette={palette}
        pose={pose}
        slot={frameSlot(palette, ones)}
        delay={-(tens + 1) * STAGGER}
        x={fx}
        y={fy}
        scale={FRIEND_SCALE}
        kind="ones"
      />,
    );
  }
  // By default every turtle is drawn the same size (TURTLE_PX wide), however many ride together.
  // A teen draws bigger so the friend's smaller pebbles stay ≥ 9 px across too.
  const px = ones > 0 ? TURTLE_PX / FRIEND_SCALE : TURTLE_PX;
  return { w, h, size: Math.round((px * w) / CRITTER_W), body: items };
}

function single(
  species: PebblingSpecies,
  palette: PebblingPalette,
  pose: PebblingPose,
  slot?: ReactNode,
  variant?: BodyProps['variant'],
): Layout {
  return {
    w: CRITTER_W,
    h: CRITTER_H,
    size: 160,
    body: <Critter species={species} palette={palette} pose={pose} slot={slot} variant={variant} />,
  };
}

function layoutFor(
  p: Required<Pick<PebblingProps, 'species' | 'palette' | 'pose'>> & PebblingProps,
): Layout {
  const family = effectiveFamily(p);
  const n = p.number;
  const c = PALETTE_FILLS[p.palette];
  if (n === null) return single(p.species, p.palette, p.pose);
  switch (family) {
    case 'tens':
      return tensFamily(n, p.species, p.palette, p.pose);
    case 'hundreds':
      return {
        w: WHALE_W,
        h: WHALE_H,
        size: 340,
        body: <HundredWhaleBody palette={p.palette} pose={p.pose} frames={hundredFrames(n)} />,
      };
    case 'fraction':
      return single('crab', p.palette, p.pose, <FractionShell value={n} c={c} />, 'round');
    case 'clock':
      return single('clockfish', p.palette, p.pose, <ClockFace hour={n} />);
    case 'coin':
      return single(
        'clam',
        p.palette,
        p.pose,
        <Coin value={coinValue(n)} showValue={p.showValue} />,
        'open',
      );
    default:
      return single(p.species, p.palette, p.pose, frameSlot(p.palette, n));
  }
}

/**
 * The procedural Pebbling (05 §5): a shore critter whose shell holds its number as lit pebbles in a
 * 2 × 5 ten-frame, or a family of them (Ten Turtles, the Hundred Whale, the Half-Crab, the Clockfish
 * and the Coin Clam). Every lit pebble is marked `data-pebble="lit"` and every empty socket
 * `data-pebble="empty"`. Idle: bob and blink; cheer: a hop with claws up; wave: one limb waves.
 * Children's names and words come from the caller (`title`), never from here.
 */
export function Pebbling({
  species,
  palette,
  number,
  family,
  pose = 'idle',
  showValue,
  size,
  title,
  lighting,
  ...rest
}: PebblingProps) {
  // A number the family can't show exactly is never drawn as a nearby quantity: the Pebbling shows
  // a plain shell and marks the value it was given (data-unsupported-number).
  const drawable = drawableNumber({ number: number ?? null, family });
  const shown = drawable ? (number ?? null) : null;
  const layout = layoutFor({ species, palette, number: shown, family, pose, showValue });
  const pad = 6;
  return (
    <ArtSvg
      width={layout.w + pad * 2}
      height={layout.h + pad * 2}
      originX={-pad}
      originY={-pad}
      size={size ?? layout.size}
      title={title}
      lighting={lighting}
      rootProps={{
        'data-pebbling': species,
        'data-number': shown ?? undefined,
        'data-unsupported-number': drawable ? undefined : String(number),
        'data-family': effectiveFamily({ number: shown, family }),
        'data-pose': pose,
      }}
      {...rest}
    >
      {layout.body}
    </ArtSvg>
  );
}
