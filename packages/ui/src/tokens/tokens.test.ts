import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ageModeForGrade,
  CONTRAST_PAIRS,
  LEGACY_ART_PALETTE,
  contrastRatio,
  DURATION_MS,
  litColor,
  MIN_TARGET_PX,
  PALETTE,
  REDUCED_MOTION_MAX_MS,
  SUNSET_PALETTE,
  TARGET_GAP_PX,
  TARGET_PX,
  Z_LAYER,
} from './tokens';

const css = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** The value of `--name` inside the first block whose selector matches `selector`. */
/** The sunset remap applies to a lit scene and to art and sprites inside one (their legacy pin). */
const SUNSET_SELECTOR = '[data-lighting="sunset"],\n[data-lighting="sunset"] :is(.ni-art, .ni-sprite)';

function cssVar(name: string, selector = ':root'): string | undefined {
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const [, sel, body] of blocks) {
    if (sel?.trim() !== selector) continue;
    const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(body ?? '');
    if (m) return m[1]?.trim();
  }
  return undefined;
}

function themeVar(name: string): string | undefined {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
}

describe('design tokens', () => {
  it('mirrors every palette colour of theme.css', () => {
    for (const [name, hex] of Object.entries(PALETTE)) {
      expect(themeVar(`color-${name}`), name).toBe(hex);
    }
  });

  it('includes the 05 §11 Felt & Stitch palette', () => {
    for (const hex of [
      '#3f5e8a', // denim
      '#2b4467', // navy
      '#e9ddc4', // linen
      '#f6eedb', // cream
      '#e2a62a', // mustard
      '#c5633d', // terracotta
      '#4a6649', // sage (deep)
      '#c89a69', // wood
      '#3a2d29', // ink
    ]) {
      expect(Object.values(PALETTE)).toContain(hex);
    }
  });

  it('pins the legacy palette on art and sprite roots until they are redrawn in felt', () => {
    for (const [name, hex] of Object.entries(LEGACY_ART_PALETTE)) {
      expect(cssVar(`color-${name}`, '.ni-art,\n.ni-sprite'), name).toBe(hex);
    }
    expect(Object.keys(LEGACY_ART_PALETTE).sort()).toEqual(Object.keys(PALETTE).sort());
  });

  it('draws every felt edge and glyph the controls use at ≥ 3:1 (06 §7)', () => {
    for (const [use, fg, bg] of [
      ['navy glyph on a wood button', 'sea-dark', 'wood'],
      ['wood button edge on linen', 'wood-deep', 'sand'],
      ['Check edge on linen', 'sea-dark', 'sand'],
      ['disabled dashed edge on linen', 'ink-soft', 'sand'],
      ['disabled dashed edge on its faded felt', 'ink-soft', 'pebble'],
      ['focus ring on linen', 'ink', 'sand'],
      ['invite ring on linen', 'sea-deep', 'sand'],
    ] as const) {
      expect(contrastRatio(PALETTE[fg], PALETTE[bg]), use).toBeGreaterThanOrEqual(3);
    }
  });

  it('meets the 06 §4 target sizes per age mode', () => {
    expect(MIN_TARGET_PX).toEqual({ k: 80, 'g1-up': 64 });
    for (const mode of ['k', 'g1-up'] as const) {
      const { min, icon, big } = TARGET_PX[mode];
      expect(min).toBeGreaterThanOrEqual(MIN_TARGET_PX[mode]);
      expect(icon).toBeGreaterThanOrEqual(MIN_TARGET_PX[mode]);
      expect(big).toBeGreaterThanOrEqual(MIN_TARGET_PX[mode]);
    }
    expect(TARGET_GAP_PX).toBeGreaterThanOrEqual(12);
  });

  it('keeps the CSS target sizes in step with TARGET_PX', () => {
    const map = {
      min: 'target-min',
      icon: 'target-icon',
      big: 'target-big',
      glyph: 'icon-size',
    } as const;
    for (const [key, name] of Object.entries(map)) {
      const k = TARGET_PX.k[key as keyof typeof map];
      const g = TARGET_PX['g1-up'][key as keyof typeof map];
      expect(cssVar(name, '[data-age-mode="k"]'), `k ${name}`).toBe(`${k}px`);
      expect(cssVar(name), `g1-up ${name}`).toBe(`${g}px`);
    }
    expect(cssVar('target-gap')).toBe(`${TARGET_GAP_PX}px`);
  });

  it('keeps durations and z-layers in step', () => {
    for (const [k, v] of Object.entries(DURATION_MS))
      expect(cssVar(`duration-${k}`)).toBe(`${v}ms`);
    for (const [k, v] of Object.entries(Z_LAYER)) expect(cssVar(`z-${k}`)).toBe(String(v));
  });

  it('caps every duration at 150 ms under reduced motion (06 §7)', () => {
    for (const k of ['base', 'gentle', 'slow']) {
      expect(cssVar(`duration-${k}`, '[data-reduced-motion="true"]')).toBe(
        `${REDUCED_MOTION_MAX_MS}ms`,
      );
    }
  });

  it('stops every looping animation token and fades every entrance under reduced motion', () => {
    const tokens = [...css.matchAll(/--(animate-[\w-]+):\s*([^;]+);/g)];
    const loops = new Set(tokens.filter(([, , v]) => v?.includes('infinite')).map(([, n]) => n));
    expect(loops.size).toBeGreaterThan(5);
    for (const name of loops) {
      expect(cssVar(name as string, '[data-reduced-motion="true"]'), name).toBe('none');
    }
    for (const name of ['animate-rise', 'animate-pop-in']) {
      expect(cssVar(name, '[data-reduced-motion="true"]')).toBe('ni-fade-in 150ms ease-out both');
    }
  });

  it('gives every text/icon pair the primitives use ≥ 4.5:1 contrast (06 §7)', () => {
    for (const p of CONTRAST_PAIRS) {
      expect(contrastRatio(PALETTE[p.fg], PALETTE[p.bg]), p.use).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('mirrors the sunset lighting remap of theme.css', () => {
    for (const [name, hex] of Object.entries(SUNSET_PALETTE)) {
      expect(cssVar(`color-${name}`, SUNSET_SELECTOR), name).toBe(hex);
      expect(PALETTE).toHaveProperty(name);
    }
    expect(litColor('sky', 'sunset')).toBe(SUNSET_PALETTE.sky);
    expect(litColor('ink', 'sunset')).toBe(PALETTE.ink);
  });

  it('keeps ink, pebble, paper and cloud unchanged at sunset, so numerals keep contrast', () => {
    for (const c of ['ink', 'ink-soft', 'pebble', 'paper', 'cloud'] as const) {
      expect(SUNSET_PALETTE).not.toHaveProperty(c);
    }
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('maps grades to age modes', () => {
    expect(ageModeForGrade('K')).toBe('k');
    expect(ageModeForGrade('1')).toBe('g1-up');
    expect(ageModeForGrade('3')).toBe('g1-up');
  });
});
