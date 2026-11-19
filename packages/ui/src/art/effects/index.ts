// Effects (05 §11, 06 §6; U02): sparkle, confetti, fireflies and splash. DOM/SVG effects use Motion;
// Pixi is used only where many particles animate at once, and is lazy-loaded (a dynamic import in
// usePixiEffect, so pixi.js never lands in the initial bundle).

export { CONFETTI_FALLBACK_PIECES, Confetti, type ConfettiProps } from './Confetti';
export { EFFECT_CONTRAST_PAIRS } from './contrast';
export {
  FIREFLY_FALLBACK_FLIES,
  FIREFLY_LOOP_MS,
  Fireflies,
  type FirefliesProps,
} from './Fireflies';
export {
  CONFETTI_BOX,
  CONFETTI_COLORS,
  CONFETTI_MS,
  type ConfettiPiece,
  confettiAt,
  confettiPieces,
  EFFECT_FADE_MS,
  FIREFLY_BOX,
  type Firefly,
  fireflies,
  fireflyAt,
  fireflyLayers,
  fireflyStatic,
  type ParticleState,
  SPARKLE_BOX,
  SPARKLE_MS,
  SPLASH_BOX,
  SPLASH_MS,
  sparkleAt,
  sparkleCore,
  sparkleParticles,
  splashCore,
  splashDropAt,
  splashDrops,
} from './particles';
export { canvasSlotTaken, hexToNumber, resolveColor, webglAvailable } from './pixi';
export type { EffectProps } from './playhead';
export { SPARKLE_PEAK, Sparkle } from './Sparkle';
export { SPLASH_PEAK, Splash } from './Splash';
