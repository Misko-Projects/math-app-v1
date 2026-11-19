import { animate, type MotionValue, useMotionValue } from 'motion/react';
import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import type { Lighting } from '../../tokens/tokens';
import { EFFECT_FADE_MS } from './particles';

/** Props every effect accepts. */
export interface EffectProps {
  /** Seed for the particle layout: the same seed always draws the same effect. Default 1. */
  seed?: number;
  /**
   * Render one still frame (0 = start, 1 = end) instead of playing: for galleries and visual
   * snapshots. Leave it out to play the effect once on mount.
   */
  progress?: number;
  /** Called once when the effect has finished (immediately when it is switched off). */
  onDone?: () => void;
  /** Rendered width (CSS length or px). Height follows the effect's design box. */
  size?: number | string;
  /** Day or sunset (re-tints the palette, like the art). */
  lighting?: Lighting;
  className?: string;
  style?: CSSProperties;
}

/** The latest callback, without re-running effects when the caller passes a new closure. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

/**
 * A 0–1 playhead driven by Motion. With `progress` it is a still frame; otherwise it plays once
 * over `durationMs` and then calls `onDone`.
 */
export function usePlayhead(
  durationMs: number,
  progress: number | undefined,
  playing: boolean,
  onDone?: () => void,
): MotionValue<number> {
  const t = useMotionValue(progress ?? 0);
  const done = useLatest(onDone);
  useEffect(() => {
    if (progress !== undefined) {
      t.set(progress);
      return;
    }
    if (!playing) return;
    t.set(0);
    const controls = animate(t, 1, {
      duration: durationMs / 1000,
      ease: 'linear',
      onComplete: () => done.current?.(),
    });
    return () => controls.stop();
  }, [t, progress, playing, durationMs, done]);
  return t;
}

/**
 * Reduced motion (06 §7): nothing moves; the effect's peak frame fades in and out, each fade at
 * most 150 ms, then `onDone`. Returns the opacity (1 when inactive).
 */
export function useReducedFade(active: boolean, onDone?: () => void): MotionValue<number> {
  const opacity = useMotionValue(active ? 0 : 1);
  const done = useLatest(onDone);
  useEffect(() => {
    if (!active) {
      opacity.set(1);
      return;
    }
    const fade = EFFECT_FADE_MS / 1000;
    const controls = animate(opacity, [0, 1, 1, 0], {
      duration: fade * 4,
      times: [0, 0.25, 0.75, 1],
      ease: 'linear',
      onComplete: () => done.current?.(),
    });
    return () => controls.stop();
  }, [opacity, active, done]);
  return opacity;
}
