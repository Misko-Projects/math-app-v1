import type { PaletteColor } from '../../tokens/tokens';
import { hashSeed, seededRandom } from '../core/paint';

/*
 * Pure, seeded particle generators for the effects (05 §11, 06 §6). Every frame is a function of
 * (seed, time), so a still frame for the gallery or a visual snapshot is exactly the frame the live
 * effect shows at that moment, and nothing uses Math.random.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (v: number) => 1 - (1 - v) ** 3;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Durations in ms. Confetti obeys 06 §6 (a build celebration lasts at most 2 s). */
export const SPARKLE_MS = 700;
export const SPLASH_MS = 950;
export const CONFETTI_MS = 1800;
/** 06 §7: under reduced motion an effect is a fade of at most this long (each way). */
export const EFFECT_FADE_MS = 150;

/* ----------------------------------------------------------------------------------------------
 * Sparkle: a small burst on a correct action. Design box 120 × 120, centred on (60, 60).
 */

export const SPARKLE_BOX = { w: 120, h: 120 } as const;

export interface SparkleParticle {
  kind: 'star' | 'dot';
  angle: number;
  dist: number;
  size: number;
  delay: number;
  spin: number;
  color: PaletteColor;
}

const SPARKLE_COLORS: PaletteColor[] = ['sunshine', 'cloud', 'sunshine-light', 'sun'];

export function sparkleParticles(seed = 1): SparkleParticle[] {
  const rnd = seededRandom(hashSeed(seed, 0x5a1));
  return Array.from({ length: 12 }, (_, i) => {
    const star = i % 2 === 0;
    return {
      kind: star ? 'star' : 'dot',
      angle: ((i * 30 + (rnd() - 0.5) * 18) * Math.PI) / 180,
      dist: star ? 38 + rnd() * 12 : 26 + rnd() * 12,
      size: star ? 6.5 + rnd() * 3 : 2.6 + rnd() * 1.4,
      delay: rnd() * 0.12,
      spin: (rnd() - 0.5) * 180,
      color: SPARKLE_COLORS[i % SPARKLE_COLORS.length] ?? 'sunshine',
    };
  });
}

export interface ParticleState {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  scaleY: number;
  opacity: number;
}

/** A sparkle particle at progress t (0–1). */
export function sparkleAt(p: SparkleParticle, t: number): ParticleState {
  const u = clamp01((t - p.delay) / (0.95 - p.delay));
  const e = 1 - (1 - u) ** 4;
  const scale = u < 0.22 ? (u / 0.22) * 1.1 : lerp(1.1, 0, ((u - 0.22) / 0.78) ** 2);
  return {
    x: 60 + Math.cos(p.angle) * p.dist * e,
    y: 60 + Math.sin(p.angle) * p.dist * e,
    rotate: p.spin * u,
    scale: u <= 0 ? 0 : scale,
    scaleY: 1,
    opacity: u <= 0 ? 0 : u < 0.62 ? 1 : 1 - (u - 0.62) / 0.38,
  };
}

/** The sparkle's centre flash and ring at progress t. */
export function sparkleCore(t: number) {
  const u = clamp01(t / 0.55);
  return {
    flashR: 6 + 18 * easeOut(clamp01(t / 0.25)),
    flashOpacity: t < 0.25 ? 0.9 : Math.max(0, 0.9 - ((t - 0.25) / 0.35) * 0.9),
    ringR: 8 + 40 * easeOut(u),
    ringOpacity: u >= 1 ? 0 : 0.9 * (1 - u),
  };
}

/* ----------------------------------------------------------------------------------------------
 * Splash: water thrown up when something lands in the sea (the Ten-Boat). Design box 160 × 120;
 * the water line is at y = 92.
 */

export const SPLASH_BOX = { w: 160, h: 120, waterY: 92 } as const;

export interface SplashDrop {
  x0: number;
  vx: number;
  vy: number;
  r: number;
  delay: number;
}

const SPLASH_G = 780;

export function splashDrops(seed = 1): SplashDrop[] {
  const rnd = seededRandom(hashSeed(seed, 0x5b1a));
  return Array.from({ length: 11 }, (_, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const spread = (0.15 + rnd() * 0.85) * side;
    return {
      x0: 80 + spread * 12,
      vx: spread * (55 + rnd() * 65),
      vy: 215 + rnd() * 95 - Math.abs(spread) * 40,
      r: 2.6 + rnd() * 2.6,
      delay: rnd() * 0.12,
    };
  });
}

/** A droplet at progress t: thrown up, then pulled back into the water. */
export function splashDropAt(d: SplashDrop, t: number): ParticleState {
  const s = Math.max(0, t * (SPLASH_MS / 1000) - d.delay);
  const y = SPLASH_BOX.waterY - 6 - d.vy * s + 0.5 * SPLASH_G * s * s;
  const below = y > SPLASH_BOX.waterY;
  const vy = -d.vy + SPLASH_G * s;
  return {
    x: d.x0 + d.vx * s,
    y,
    rotate: (Math.atan2(vy, d.vx) * 180) / Math.PI - 90,
    scale: s <= 0 ? 0 : Math.min(1, s / 0.06),
    scaleY: 1 + Math.min(0.6, Math.abs(vy) / 500),
    opacity: s <= 0 || below ? 0 : t > 0.85 ? (1 - t) / 0.15 : 1,
  };
}

/** The splash's crown (height 0–1) and two ripple rings at progress t. */
export function splashCore(t: number) {
  const crown = t < 0.3 ? easeOut(t / 0.3) : Math.max(0, 1 - easeOut((t - 0.3) / 0.45));
  const ring = (start: number) => {
    const u = clamp01((t - start) / (1 - start));
    return {
      rx: 14 + 62 * easeOut(u),
      ry: 4 + 12 * easeOut(u),
      opacity: u <= 0 || u >= 1 ? 0 : 1 - u,
    };
  };
  return { crown, rings: [ring(0.05), ring(0.3)] as const };
}

/* ----------------------------------------------------------------------------------------------
 * Confetti: the build celebration (06 §6: a burst, at most 2 s). Design box 400 × 300; pieces burst
 * up from the build spot, then drift down with drag, flutter and fade.
 */

export const CONFETTI_BOX = { w: 400, h: 300 } as const;

export type ConfettiShape = 'rect' | 'circle' | 'triangle' | 'ribbon';

export interface ConfettiPiece {
  shape: ConfettiShape;
  color: PaletteColor;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot0: number;
  spin: number;
  flip: number;
  flipPhase: number;
  sway: number;
  swayFreq: number;
  delay: number;
}

export const CONFETTI_COLORS: readonly PaletteColor[] = [
  'coral',
  'sunshine',
  'sea',
  'leaf-light',
  'sky',
  'sun',
];

const SHAPES: ConfettiShape[] = ['rect', 'circle', 'triangle', 'ribbon'];
const DRAG = 2.2;
const GRAVITY = 900;

export function confettiPieces(seed = 1, count = 90): ConfettiPiece[] {
  const rnd = seededRandom(hashSeed(seed, 0xc0f));
  return Array.from({ length: count }, (_, i) => {
    const shape = SHAPES[i % SHAPES.length] ?? 'rect';
    const big = 8 + rnd() * 5;
    const vx = (rnd() - 0.5) * 2 * 380;
    const vy = -(560 + rnd() * 300);
    return {
      shape,
      color: CONFETTI_COLORS[(i * 7) % CONFETTI_COLORS.length] ?? 'coral',
      x0: CONFETTI_BOX.w / 2 + (rnd() - 0.5) * 70,
      y0: CONFETTI_BOX.h * 0.7 + (rnd() - 0.5) * 14,
      vx,
      vy,
      w: shape === 'ribbon' ? 3.5 : big,
      h: shape === 'ribbon' ? 13 + rnd() * 5 : shape === 'rect' ? big * 0.62 : big,
      rot0: rnd() * 360,
      spin: (rnd() - 0.5) * 900,
      flip: 7 + rnd() * 9,
      flipPhase: rnd() * Math.PI * 2,
      sway: 10 + rnd() * 18,
      swayFreq: 3 + rnd() * 3,
      delay: rnd() * 0.1,
    };
  });
}

/** A confetti piece `ms` after the burst (closed form: linear drag plus gravity). */
export function confettiAt(p: ConfettiPiece, ms: number): ParticleState {
  const s = Math.max(0, ms / 1000 - p.delay);
  const e = (1 - Math.exp(-DRAG * s)) / DRAG;
  const term = GRAVITY / DRAG;
  const end = CONFETTI_MS / 1000;
  const sway = Math.sin(s * p.swayFreq + p.flipPhase) * p.sway * Math.min(1, s * 2);
  return {
    x: p.x0 + p.vx * e + sway,
    y: p.y0 + term * s + (p.vy - term) * e,
    rotate: p.rot0 + p.spin * s,
    scale: s <= 0 ? 0 : Math.min(1, s / 0.05),
    scaleY: Math.cos(s * p.flip + p.flipPhase),
    opacity:
      s <= 0
        ? 0
        : ms >= CONFETTI_MS
          ? 0
          : s > end * 0.7
            ? Math.max(0, 1 - (s - end * 0.7) / (end * 0.3 - p.delay))
            : 1,
  };
}

/* ----------------------------------------------------------------------------------------------
 * Fireflies: many soft lights that wander and blink in groups (Lantern Grove, 05 §4 W2). Design box
 * 400 × 260. Loops for as long as it is shown.
 */

export const FIREFLY_BOX = { w: 400, h: 260 } as const;

export interface Firefly {
  x0: number;
  y0: number;
  ax: number;
  ay: number;
  wx: number;
  wy: number;
  px: number;
  py: number;
  /** Blink period in seconds and phase (0–1). Fireflies in a group share a phase. */
  period: number;
  phase: number;
  group: number;
  r: number;
}

export function fireflies(seed = 1, count = 36, groups = 3): Firefly[] {
  const rnd = seededRandom(hashSeed(seed, 0xf1f));
  return Array.from({ length: count }, (_, i) => {
    const group = i % groups;
    return {
      x0: 24 + rnd() * (FIREFLY_BOX.w - 48),
      y0: 24 + rnd() * (FIREFLY_BOX.h - 48),
      ax: 8 + rnd() * 16,
      ay: 6 + rnd() * 10,
      wx: 0.4 + rnd() * 0.5,
      wy: 0.5 + rnd() * 0.6,
      px: rnd() * Math.PI * 2,
      py: rnd() * Math.PI * 2,
      period: 2.4 + (group % 2) * 0.6,
      phase: group / groups + rnd() * 0.06,
      group,
      r: 2.4 + rnd() * 1.4,
    };
  });
}

export interface FireflyState {
  x: number;
  y: number;
  /** 0 (dim) – 1 (fully lit). */
  glow: number;
}

/** A firefly `ms` into the loop. */
export function fireflyAt(f: Firefly, ms: number): FireflyState {
  const s = ms / 1000;
  const cycle = (((s / f.period + f.phase) % 1) + 1) % 1;
  // A quick soft flash for 40% of the period, dark (but never invisible) for the rest.
  const on = cycle < 0.4 ? Math.sin((cycle / 0.4) * Math.PI) : 0;
  return {
    x: f.x0 + Math.sin(s * f.wx + f.px) * f.ax + Math.sin(s * f.wx * 2.3 + f.py) * f.ax * 0.35,
    y: f.y0 + Math.sin(s * f.wy + f.py) * f.ay,
    glow: 0.12 + 0.88 * on ** 1.5,
  };
}

/** How a glow level draws: the halo only shows while lit; the small core never quite goes out. */
export function fireflyLayers(glow: number) {
  return { halo: glow * glow, core: 0.3 + 0.7 * glow };
}

/** Reduced motion (06 §7): a still, softly glowing swarm. */
export function fireflyStatic(f: Firefly): FireflyState {
  return { x: f.x0, y: f.y0, glow: f.group === 0 ? 0.95 : 0.6 };
}
