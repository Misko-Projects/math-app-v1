import type { ResidentDef } from '@number-island/shared';
import type { PaletteColor } from '../../tokens/tokens';
import { hashSeed, OUTLINE_OF } from '../core/paint';

/**
 * The Pebbling generator's model (05 §5, 02 §5.8 ResidentDef): pure data and maths, no React, so the
 * unit tests and the game can use it without a DOM.
 */

/** Every Pebbling species the game data uses. Each has its own body silhouette. */
export const PEBBLING_SPECIES = [
  'crab',
  'hermit-crab',
  'turtle',
  'snail',
  'starfish',
  'seal',
  'puffin',
  'seahorse',
  'whale',
  'clockfish',
  'clam',
] as const;
export type PebblingSpecies = (typeof PEBBLING_SPECIES)[number];

/** Every ResidentDef palette. Each maps to token fills (PALETTE_FILLS). */
export const PEBBLING_PALETTES = [
  'coral',
  'sun',
  'sunshine',
  'leaf',
  'sea',
  'sky',
  'sand',
  'wood',
] as const;
export type PebblingPalette = (typeof PEBBLING_PALETTES)[number];

/** ResidentDef.family: the special Pebblings (05 §5). */
export const PEBBLING_FAMILIES = ['tens', 'hundreds', 'fraction', 'clock', 'coin'] as const;
export type PebblingFamily = NonNullable<ResidentDef['family']>;

export const PEBBLING_POSES = ['idle', 'cheer', 'wave'] as const;
export type PebblingPose = (typeof PEBBLING_POSES)[number];

/** The token fills of one palette. Outlines are always OUTLINE_OF the fill (05 §11). */
export interface PaletteFills {
  /** Body and shell. */
  body: PaletteColor;
  /** The body's outline shade (OUTLINE_OF[body]). */
  deep: PaletteColor;
  /** Claws, feet, fins and spots. */
  accent: PaletteColor;
  /** Bellies, and the pebble bed the ten-frame sits on. */
  belly: PaletteColor;
  /** Cheek blush (drawn translucent). */
  cheek: PaletteColor;
}

function fills(
  body: PaletteColor,
  accent: PaletteColor,
  belly: PaletteColor,
  cheek: PaletteColor,
): PaletteFills {
  return { body, deep: OUTLINE_OF[body], accent, belly, cheek };
}

export const PALETTE_FILLS: Readonly<Record<PebblingPalette, PaletteFills>> = {
  coral: fills('coral', 'sun', 'sand', 'coral-deep'),
  sun: fills('sun', 'coral', 'sand', 'coral'),
  sunshine: fills('sunshine', 'sun', 'paper', 'coral'),
  leaf: fills('leaf-light', 'sunshine', 'sand', 'coral'),
  sea: fills('sea', 'shallows', 'foam', 'coral'),
  sky: fills('sky', 'shallows', 'cloud', 'coral'),
  sand: fills('sand', 'wood', 'paper', 'coral'),
  wood: fills('wood', 'sand', 'sand', 'coral'),
};

/**
 * The pebble marks (06 §7: shape, not colour, tells lit from empty). A lit pebble is a filled stone
 * with a highlight; an empty socket is a hollow ring. Both sit on the palette's pebble bed.
 */
export const PEBBLE_MARK = {
  lit: 'sea-deep',
  litEdge: 'sea-dark',
  empty: 'ink-soft',
} as const satisfies Record<string, PaletteColor>;

/** Ten-frame geometry at a Pebbling's design size (a single critter's art is 220 units wide). */
export const TEN_FRAME = { cols: 5, rows: 2, pitch: 22, pebbleR: 9, ringR: 7.25, pad: 6 } as const;

/** A single critter's design box. At a 120 px buddy the pebble diameter is 18 × 120 / 220 ≈ 9.8 px. */
export const CRITTER_W = 220;
export const CRITTER_H = 200;

export interface TenFrameSlot {
  index: number;
  row: number;
  col: number;
  lit: boolean;
}

/**
 * The ten sockets of a ten-frame, in fill order: the top row left → right, then the bottom row
 * (5-grouping visible). `lit` is clamped to 0–10.
 */
export function tenFrameSlots(lit: number): TenFrameSlot[] {
  const n = clampInt(lit, 0, 10);
  return Array.from({ length: 10 }, (_, index) => ({
    index,
    row: Math.floor(index / TEN_FRAME.cols),
    col: index % TEN_FRAME.cols,
    lit: index < n,
  }));
}

/** How many pebbles each of the Hundred Whale's ten ten-frames lights (frame by frame). */
export function hundredFrames(lit: number): number[] {
  const n = clampInt(lit, 0, 100);
  return Array.from({ length: 10 }, (_, i) => clampInt(n - i * 10, 0, 10));
}

/**
 * The tens family (05 §5): `tens` Ten Turtles (each a full ten-shell) plus a small friend carrying
 * the ones. Turtles ride in rows of five, so 100 is two neat rows of five.
 */
export function tensLayout(n: number): { tens: number; ones: number; rows: number[] } {
  const total = clampInt(n, 0, 109);
  const tens = Math.min(10, Math.floor(total / 10));
  const ones = total - tens * 10;
  const rows = tens <= 5 ? [tens] : [5, tens - 5];
  return { tens, ones, rows: tens === 0 ? [] : rows };
}

const FRACTION_DENOMINATORS = [2, 3, 4, 5, 6, 8, 10, 12];

/** The Half-Crab's shell (05 §5): equal parts, `filled` of them filled. 0.75 → 3 of 4. */
export function fractionParts(value: number): { parts: number; filled: number } {
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  if (v === 0 || v === 1) return { parts: 2, filled: v * 2 };
  for (const d of FRACTION_DENOMINATORS) {
    const f = v * d;
    if (Math.abs(f - Math.round(f)) < 0.02) return { parts: d, filled: Math.round(f) };
  }
  return { parts: 12, filled: Math.round(v * 12) };
}

/** The Clockfish's hour (1–12); 0 reads as 12. The minute hand always points at 12. */
export function clockHour(value: number): number {
  const h = Number.isFinite(value) ? Math.round(value) : 12;
  return ((((h - 1) % 12) + 12) % 12) + 1;
}

export const COIN_VALUES = [1, 5, 10, 25] as const;
export type CoinValue = (typeof COIN_VALUES)[number];

/**
 * How a coin shows its value without words: size (the dime is smallest, the quarter largest), metal
 * and rim (reeded or smooth). Radii are in critter units.
 */
export const COIN_LOOK: Readonly<
  Record<CoinValue, { r: number; face: PaletteColor; rim: 'smooth' | 'reeded' }>
> = {
  1: { r: 35, face: 'sun', rim: 'smooth' },
  5: { r: 39, face: 'pebble', rim: 'smooth' },
  10: { r: 32, face: 'pebble', rim: 'reeded' },
  25: { r: 44, face: 'pebble', rim: 'reeded' },
};

/** The coin nearest a value (1, 5, 10 or 25). */
export function coinValue(value: number): CoinValue {
  let best: CoinValue = 1;
  for (const c of COIN_VALUES) if (Math.abs(c - value) < Math.abs(best - value)) best = c;
  return best;
}

/** What the generator draws for a resident. */
export interface PebblingSpec {
  species: PebblingSpecies;
  palette: PebblingPalette;
  /** The quantity in the shell; null draws a plain shell (a special Pebbling with no number). */
  number: number | null;
  family?: PebblingFamily;
}

const SPECIES_ALIASES: Readonly<Record<string, PebblingSpecies>> = {
  'sea-star': 'starfish',
  'seal-pup': 'seal',
  'puffin-chick': 'puffin',
  puffling: 'puffin',
  'clock-fish': 'clockfish',
  'coin-clam': 'clam',
  'half-crab': 'crab',
  'ten-turtle': 'turtle',
  'hundred-whale': 'whale',
  hermit: 'hermit-crab',
};

const PALETTE_ALIASES: Readonly<Record<string, PebblingPalette>> = {
  moss: 'leaf',
  grass: 'leaf',
  'sea-glass': 'sea',
  teal: 'sea',
  sunset: 'sun',
  orange: 'sun',
  yellow: 'sunshine',
  gold: 'sunshine',
  driftwood: 'wood',
  shell: 'sand',
};

/** Each family's own species (Half-Crab, Clockfish, Coin Clam, Ten Turtle, Hundred Whale). */
const FAMILY_SPECIES: Readonly<Record<PebblingFamily, PebblingSpecies>> = {
  tens: 'turtle',
  hundreds: 'whale',
  fraction: 'crab',
  clock: 'clockfish',
  coin: 'clam',
};

function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

/** A species name from game data ("hermit crab", "sea star") as a generator species. */
export function speciesOf(name: string): PebblingSpecies | undefined {
  const s = slug(name);
  if ((PEBBLING_SPECIES as readonly string[]).includes(s)) return s as PebblingSpecies;
  return SPECIES_ALIASES[s];
}

/** A palette name from game data as a generator palette. */
export function paletteOf(name: string): PebblingPalette | undefined {
  const s = slug(name);
  if ((PEBBLING_PALETTES as readonly string[]).includes(s)) return s as PebblingPalette;
  return PALETTE_ALIASES[s];
}

/**
 * ResidentDef → Pebbling props. Unknown names never throw: the species falls back to the family's
 * own species (or a crab) and the palette to a stable pick from the resident id, so a typo in game
 * data still draws a Pebbling (content:validate is where names are checked).
 */
export function pebblingFromResident(
  def: Pick<ResidentDef, 'id' | 'species' | 'palette' | 'number' | 'family'>,
): PebblingSpec {
  const family = def.family;
  const species = speciesOf(def.species) ?? (family ? FAMILY_SPECIES[family] : 'crab');
  const palette =
    paletteOf(def.palette) ??
    (PEBBLING_PALETTES[
      hashSeed(...[...def.id].map((ch) => ch.charCodeAt(0))) % PEBBLING_PALETTES.length
    ] as PebblingPalette);
  const spec: PebblingSpec = { species, palette, number: def.number };
  if (family) spec.family = family;
  return spec;
}

/** The family a spec is drawn as: a plain number above 10 rides with the Ten Turtles. */
export function effectiveFamily(spec: Pick<PebblingSpec, 'number' | 'family'>) {
  if (spec.family) return spec.family;
  return spec.number !== null && spec.number > 10 ? 'tens' : undefined;
}

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(v)));
}
