import type { Grade } from '@number-island/shared';

/**
 * TypeScript mirror of the numeric tokens in theme.css, for code that needs them as numbers
 * (snap maths, tests, layout checks). tokens.test.ts keeps both files in step.
 */

/**
 * Age mode (06 §4, §5). `k` is Kindergarten: no required reading, icon buttons with spoken labels,
 * touch targets ≥ 80 px. `g1-up` is grade 1 and above: targets ≥ 64 px, text shown beside icons.
 */
export type AgeMode = 'k' | 'g1-up';

export const AGE_MODES: readonly AgeMode[] = ['k', 'g1-up'];

/** The age mode for a child's grade. */
export function ageModeForGrade(grade: Grade): AgeMode {
  return grade === 'K' ? 'k' : 'g1-up';
}

/** 06 §4 minimum hit target per age mode, in CSS px. */
export const MIN_TARGET_PX: Readonly<Record<AgeMode, number>> = { k: 80, 'g1-up': 64 };

/** Rendered sizes of the primitives per age mode (each ≥ MIN_TARGET_PX). */
export const TARGET_PX = {
  k: { min: 80, icon: 88, big: 96, glyph: 44 },
  'g1-up': { min: 64, icon: 72, big: 76, glyph: 36 },
} as const satisfies Record<AgeMode, { min: number; icon: number; big: number; glyph: number }>;

/** 06 §4 minimum spacing between touch targets, in CSS px. */
export const TARGET_GAP_PX = 12;

/** 06 §4 default snap distance for drag targets, in CSS px (a child setting can change it, 06 §7). */
export const DEFAULT_SNAP_RADIUS_PX = 48;

/** Drag starts once the pointer has moved this far; a shorter press is a tap. */
export const DRAG_START_PX = 8;

/** 06 §4 debounce for "check" buttons. */
export const CHECK_DEBOUNCE_MS = 400;

/** Motion durations in ms (theme.css --duration-*). */
export const DURATION_MS = {
  tap: 90,
  quick: 150,
  base: 220,
  gentle: 320,
  slow: 520,
} as const;

/** 06 §7: with reduced motion every animation becomes a fade of at most this many ms. */
export const REDUCED_MOTION_MAX_MS = 150;

/** z-layers, lowest first (theme.css --z-*). */
export const Z_LAYER = {
  scene: 0,
  widget: 10,
  chrome: 20,
  bubble: 30,
  drag: 40,
  sheet: 50,
  toast: 60,
  gate: 70,
} as const;

/** Palette (05 §11 plus outline shades), as in theme.css --color-*. */
export const PALETTE = {
  sea: '#5b7aa6',
  'sea-deep': '#3f5e8a',
  'sea-dark': '#2b4467',
  shallows: '#a4bed5',
  foam: '#eef2f2',
  sky: '#bdd0df',
  'sky-light': '#e2e9ee',
  horizon: '#f3e6cc',
  sand: '#e9ddc4',
  'sand-deep': '#bfa27a',
  'sand-shadow': '#dccba8',
  paper: '#f6eedb',
  coral: '#c5633d',
  'coral-deep': '#9d4a2b',
  sun: '#e39a5a',
  'sun-deep': '#b8743a',
  sunshine: '#e2a62a',
  'sunshine-light': '#f0cb78',
  'sunshine-deep': '#b9821b',
  leaf: '#7f9c78',
  'leaf-deep': '#4a6649',
  'leaf-dark': '#354d35',
  'leaf-light': '#b5c8a1',
  wood: '#c89a69',
  'wood-deep': '#8e6741',
  cloud: '#fffbf2',
  pebble: '#e6ddcb',
  'pebble-deep': '#a0937c',
  ink: '#3a2d29',
  'ink-soft': '#5a4a42',
} as const;

export type PaletteColor = keyof typeof PALETTE;

/**
 * The pre-felt palette. Sprites, scenes and characters are still drawn for it, so theme.css pins
 * these values on their SVG roots (`.ni-art`, `.ni-sprite`) until each is redrawn in felt.
 */
export const LEGACY_ART_PALETTE = {
  sea: '#2a9d8f',
  'sea-deep': '#1f7a8c',
  'sea-dark': '#17606e',
  shallows: '#8fd3c7',
  foam: '#f3fbf8',
  sky: '#bfe4ee',
  'sky-light': '#e6f5f6',
  horizon: '#fbeed3',
  sand: '#f4e3c3',
  'sand-deep': '#d9bb87',
  'sand-shadow': '#e7cfa2',
  paper: '#fffaf0',
  coral: '#e76f51',
  'coral-deep': '#b9503a',
  sun: '#f4a261',
  'sun-deep': '#d9833f',
  sunshine: '#e9c46a',
  'sunshine-light': '#f6d58a',
  'sunshine-deep': '#c9a245',
  leaf: '#5c9e4f',
  'leaf-deep': '#3f7537',
  'leaf-dark': '#2f5a29',
  'leaf-light': '#7dbb6a',
  wood: '#c98a55',
  'wood-deep': '#8f5a31',
  cloud: '#ffffff',
  pebble: '#ece6da',
  'pebble-deep': '#a99f8c',
  ink: '#264653',
  'ink-soft': '#3d6170',
} as const satisfies Record<PaletteColor, string>;

/** Island lighting (05 §3): art scenes are drawn by day or at sunset. */
export type Lighting = 'day' | 'sunset';

/**
 * The sunset remap of the environment colours, as in theme.css `[data-lighting="sunset"]`. Colours
 * not listed (ink, pebble, paper, cloud, coral, sun…) are the same at sunset, so text and numerals
 * drawn in them keep their contrast.
 */
export const SUNSET_PALETTE = {
  sky: '#f3b98f',
  'sky-light': '#fbdcbc',
  horizon: '#f8cd9c',
  sea: '#2b8789',
  'sea-deep': '#236779',
  'sea-dark': '#1b5163',
  shallows: '#9fcbbd',
  foam: '#fdeee0',
  sand: '#f1d5b2',
  'sand-deep': '#cfa173',
  'sand-shadow': '#e3bc93',
  leaf: '#5b8e4c',
  'leaf-light': '#79a65f',
  'leaf-deep': '#3e6b36',
} as const satisfies Partial<Record<PaletteColor, string>>;

/** The hex value of a palette colour under the given lighting. */
export function litColor(color: PaletteColor, lighting: Lighting = 'day'): string {
  if (lighting === 'sunset' && color in SUNSET_PALETTE) {
    return SUNSET_PALETTE[color as keyof typeof SUNSET_PALETTE];
  }
  return PALETTE[color];
}

/**
 * Foreground/background pairs the primitives use for text, numerals and icons. Each must reach
 * 4.5:1 (06 §7); tokens.test.ts checks them.
 */
export const CONTRAST_PAIRS: readonly { use: string; fg: PaletteColor; bg: PaletteColor }[] = [
  { use: 'sea button label', fg: 'cloud', bg: 'sea-deep' },
  { use: 'leaf button label', fg: 'cloud', bg: 'leaf-deep' },
  { use: 'sun button label', fg: 'ink', bg: 'sunshine' },
  { use: 'cloud button label', fg: 'ink', bg: 'cloud' },
  { use: 'panel text', fg: 'ink', bg: 'paper' },
  { use: 'sand panel text', fg: 'ink', bg: 'sand' },
  { use: 'sea panel text', fg: 'ink', bg: 'sky-light' },
  { use: 'soft text on paper', fg: 'ink-soft', bg: 'paper' },
  { use: 'number display', fg: 'ink', bg: 'cloud' },
  { use: 'speech bubble', fg: 'ink', bg: 'cloud' },
];

/**
 * Marks for math-relevant categories (bar-graph series, sort groups, chart keys): 06 §7 says never
 * colour alone, and some palette pairs (coral/wood, teal/green) merge under protanopia,
 * deuteranopia and achromatopsia. Each category pairs a fill with a distinct shape, and the fills
 * alternate light and dark, so categories stay apart under any colour-vision deficiency.
 */
export const CATEGORY_MARKS = [
  { id: 'cat-1', fill: 'sea-deep', shape: 'circle' },
  { id: 'cat-2', fill: 'sunshine', shape: 'triangle' },
  { id: 'cat-3', fill: 'coral-deep', shape: 'square' },
  { id: 'cat-4', fill: 'sky', shape: 'diamond' },
  { id: 'cat-5', fill: 'ink', shape: 'star' },
  { id: 'cat-6', fill: 'leaf-light', shape: 'hexagon' },
] as const satisfies readonly { id: string; fill: PaletteColor; shape: string }[];

export type CategoryShape = (typeof CATEGORY_MARKS)[number]['shape'];

/** WCAG 2.x relative luminance of a #rrggbb colour. */
export function relativeLuminance(hex: string): number {
  const channel = (i: number) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2.x contrast ratio of two #rrggbb colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
