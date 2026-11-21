import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PALETTE, REDUCED_MOTION_MAX_MS } from '../../tokens/tokens';
import { pairRatio } from '../core/contrast';
import {
  CONFETTI_MS,
  Confetti,
  confettiAt,
  confettiPieces,
  EFFECT_CONTRAST_PAIRS,
  EFFECT_FADE_MS,
  Fireflies,
  fireflies,
  fireflyAt,
  fireflyStatic,
  hexToNumber,
  resolveColor,
  SPARKLE_MS,
  SPLASH_MS,
  Sparkle,
  Splash,
  sparkleAt,
  sparkleParticles,
  splashDropAt,
  splashDrops,
} from '.';

const dir = fileURLToPath(new URL('.', import.meta.url));
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);

describe('effect timing (06 §6, §7)', () => {
  it('every one-shot effect finishes within 2 s; reduced-motion fades are ≤ 150 ms', () => {
    expect(CONFETTI_MS).toBeLessThanOrEqual(2000);
    expect(SPARKLE_MS).toBeLessThanOrEqual(2000);
    expect(SPLASH_MS).toBeLessThanOrEqual(2000);
    expect(EFFECT_FADE_MS).toBeLessThanOrEqual(REDUCED_MOTION_MAX_MS);
  });

  it('confetti: nothing shows at the start, pieces fly mid-way, and all are gone at 2 s', () => {
    for (const seed of SEEDS) {
      const pieces = confettiPieces(seed);
      expect(pieces.every((p) => confettiAt(p, 0).opacity === 0)).toBe(true);
      expect(pieces.some((p) => confettiAt(p, CONFETTI_MS / 2).opacity > 0.5)).toBe(true);
      for (const ms of [CONFETTI_MS, 2000, 5000]) {
        expect(
          pieces.every((p) => confettiAt(p, ms).opacity === 0),
          `${seed} @ ${ms}`,
        ).toBe(true);
      }
      // One assertion per seed, not three per piece and frame: `expect` is the cost here (tens of
      // thousands of calls made this test take over 5 s on a loaded CI runner).
      const bad: string[] = [];
      for (let ms = 0; ms <= CONFETTI_MS; ms += 100) {
        for (const p of pieces) {
          const s = confettiAt(p, ms);
          const ok =
            s.opacity >= 0 && s.opacity <= 1 && Number.isFinite(s.x) && Number.isFinite(s.y);
          if (!ok) bad.push(`${seed} @ ${ms}: ${JSON.stringify(s)}`);
        }
      }
      expect(bad).toEqual([]);
    }
  });

  it('sparkle and splash particles have faded by the end', () => {
    for (const seed of SEEDS) {
      expect(sparkleParticles(seed).every((p) => sparkleAt(p, 1).opacity === 0)).toBe(true);
      expect(sparkleParticles(seed).some((p) => sparkleAt(p, 0.3).opacity > 0.5)).toBe(true);
      expect(splashDrops(seed).every((d) => splashDropAt(d, 1).opacity === 0)).toBe(true);
      expect(splashDrops(seed).some((d) => splashDropAt(d, 0.3).opacity > 0.5)).toBe(true);
    }
  });
});

describe('particle generators are deterministic (seeded, no Math.random)', () => {
  it('the same seed gives the same particles and frames; another seed differs', () => {
    for (const seed of SEEDS) {
      expect(sparkleParticles(seed)).toEqual(sparkleParticles(seed));
      expect(splashDrops(seed)).toEqual(splashDrops(seed));
      expect(confettiPieces(seed)).toEqual(confettiPieces(seed));
      expect(fireflies(seed)).toEqual(fireflies(seed));
      const p = confettiPieces(seed)[0];
      if (p) expect(confettiAt(p, 640)).toEqual(confettiAt(p, 640));
    }
    expect(confettiPieces(1)).not.toEqual(confettiPieces(2));
    expect(sparkleParticles(1)).not.toEqual(sparkleParticles(2));
    expect(fireflies(1)).not.toEqual(fireflies(2));
  });

  it('still frames render identically every time', () => {
    const still = (c: unknown, progress: number) =>
      renderToStaticMarkup(createElement(c as typeof Sparkle, { progress, seed: 5 }));
    for (const c of [Sparkle, Splash, Confetti, Fireflies]) {
      for (const p of [0, 0.3, 0.7]) {
        const a = still(c, p);
        expect(a).toContain('data-renderer="still"');
        expect(a).toBe(still(c, p));
      }
    }
    expect(still(Confetti, 0.4)).not.toContain('<canvas');
  });
});

describe('fireflies (Lantern Grove)', () => {
  it('glow between dim and fully lit, never invisible, and blink in groups', () => {
    const flies = fireflies(3, 36, 3);
    for (let ms = 0; ms < 12000; ms += 250) {
      for (const f of flies) {
        const s = fireflyAt(f, ms);
        expect(s.glow).toBeGreaterThanOrEqual(0.12);
        expect(s.glow).toBeLessThanOrEqual(1);
      }
    }
    // A group lights together: when one of its fireflies peaks, its group-mates are lit too.
    const groupOf = (g: number) => flies.filter((f) => f.group === g);
    const leader = groupOf(0)[0];
    expect(leader).toBeDefined();
    if (!leader) return;
    let peak = 0;
    for (let ms = 0; ms < 4000; ms += 20)
      if (fireflyAt(leader, ms).glow > fireflyAt(leader, peak).glow) peak = ms;
    for (const f of groupOf(0)) expect(fireflyAt(f, peak).glow).toBeGreaterThan(0.6);
    expect(fireflyStatic(leader)).toEqual(fireflyStatic(leader));
  });
});

describe('Pixi colours come from the theme', () => {
  it('parses CSS hex and falls back to the token table without a theme', () => {
    expect(hexToNumber(PALETTE.coral)).toBe(Number.parseInt(PALETTE.coral.slice(1), 16));
    expect(hexToNumber(' #fff ')).toBe(0xffffff);
    expect(hexToNumber('var(--x)')).toBeNull();
    expect(resolveColor(null, 'sunshine')).toBe(Number.parseInt(PALETTE.sunshine.slice(1), 16));
  });
});

describe('effect contrast (06 §7)', () => {
  for (const p of EFFECT_CONTRAST_PAIRS) {
    for (const l of ['day', 'sunset'] as const) {
      it(`${p.use} (${l}) ≥ ${p.min}:1`, () => {
        expect(pairRatio(p, l)).toBeGreaterThanOrEqual(p.min);
      });
    }
  }
});

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((f) => {
    const p = join(root, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('effect source', () => {
  it('never hard-codes a colour outside the tokens, and never uses Math.random', () => {
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const src = readFileSync(`${dir}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      expect(src, f).not.toMatch(/Math\.random\s*\(/);
    }
  });

  it('loads pixi.js only through one dynamic import (02 §6: never in the initial bundle)', () => {
    const src = fileURLToPath(new URL('../..', import.meta.url));
    let dynamic = 0;
    for (const f of sourceFiles(src)) {
      const text = readFileSync(f, 'utf8');
      // Type-only imports are erased; any other static import would pull Pixi into the bundle.
      expect(text, f).not.toMatch(/^\s*import\s+(?!type\b)[^;]*from\s+['"]pixi\.js['"]/m);
      expect(text, f).not.toMatch(/^\s*export\s+(?!type\b)[^;]*from\s+['"]pixi\.js['"]/m);
      dynamic += [...text.matchAll(/[^f]\simport\(['"]pixi\.js['"]\)/g)].length;
    }
    expect(dynamic).toBe(1);
  });
});
