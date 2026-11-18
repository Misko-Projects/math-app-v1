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
} as const;

export type PaletteColor = keyof typeof PALETTE;

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
