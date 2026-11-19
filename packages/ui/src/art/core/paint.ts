import type { PaletteColor } from '../../tokens/tokens';

/**
 * Paint helpers for the art kit (05 §11). Art never hard-codes a hex value: it paints with the
 * design tokens through `var(--color-*)`, so the one palette in theme.css drives every component,
 * and a `data-lighting="sunset"` scene re-tints them all at once.
 */

/** A palette colour as a CSS value for SVG `fill` / `stroke`. */
export function paint(color: PaletteColor): string {
  return `var(--color-${color})`;
}

/**
 * The outline shade of each fill (05 §11: "2–3 px outlines in a darker shade of the fill"). Every
 * art fill outlines with the colour listed here, never with black or a colour outside the palette.
 */
export const OUTLINE_OF = {
  sea: 'sea-dark',
  'sea-deep': 'sea-dark',
  'sea-dark': 'ink',
  shallows: 'sea-deep',
  foam: 'shallows',
  sky: 'sea-deep',
  'sky-light': 'sky',
  horizon: 'sand-deep',
  sand: 'sand-deep',
  'sand-deep': 'wood-deep',
  'sand-shadow': 'sand-deep',
  paper: 'sand-deep',
  coral: 'coral-deep',
  'coral-deep': 'ink',
  sun: 'sun-deep',
  'sun-deep': 'wood-deep',
  sunshine: 'sunshine-deep',
  'sunshine-light': 'sunshine-deep',
  'sunshine-deep': 'wood-deep',
  leaf: 'leaf-deep',
  'leaf-deep': 'leaf-dark',
  'leaf-dark': 'ink',
  'leaf-light': 'leaf-deep',
  wood: 'wood-deep',
  'wood-deep': 'ink',
  cloud: 'pebble-deep',
  pebble: 'pebble-deep',
  'pebble-deep': 'ink-soft',
  ink: 'ink',
  'ink-soft': 'ink',
} as const satisfies Record<PaletteColor, PaletteColor>;

/** The outline paint for a fill. */
export function outline(fill: PaletteColor): string {
  return paint(OUTLINE_OF[fill]);
}

/** Stroke widths in art units, at an art component's design size (05 §11: 2–3 px outlines). */
export const STROKE = { outline: 3, detail: 2.5, fine: 2 } as const;

/** Fill + outline props for an SVG shape, with rounded joins. */
export function filled(fill: PaletteColor, width: number = STROKE.outline) {
  return {
    fill: paint(fill),
    stroke: outline(fill),
    strokeWidth: width,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
}

/**
 * A small deterministic PRNG (mulberry32) for scattering detail (grass tufts, wave glyphs). Art must
 * render identically on every load (visual snapshots), so it never uses Math.random.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed from integers (e.g. a plot's coordinates). */
export function hashSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
