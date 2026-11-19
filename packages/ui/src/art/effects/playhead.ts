import { animate, type MotionValue, useMotionValue } from 'motion/react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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

const NO_RUN: unique symbol = Symbol('no run');

/**
 * One completion per run. `finish` calls the latest `onDone` the first time it is called for
 * `run` and does nothing after that, so the reduced-motion, Pixi and SVG paths can all call it,
 * StrictMode can run their effects twice and reduced motion can be switched after the end without
 * finishing the run again. `run` identifies the run (the effect's memoised particle layout): a new
 * one, from a new seed or key, starts a new run. `finished` says whether this run has finished.
 */
export function useRunCompletion(
  run: unknown,
  onDone?: () => void,
): { finished: boolean; finish: () => void } {
  const done = useLatest(onDone);
  const finishedRun = useRef<unknown>(NO_RUN);
  const [shownFinished, setShownFinished] = useState<unknown>(NO_RUN);
  const finish = useCallback(() => {
    if (finishedRun.current === run) return;
    finishedRun.current = run;
    setShownFinished(() => run); // `run` may be a function: never an updater
    done.current?.();
  }, [run, done]);
  return { finished: shownFinished === run, finish };
}

/**
 * A 0–1 playhead driven by Motion. With `progress` it is a still frame; otherwise it plays once
 * over `durationMs` and then calls `onDone`. A new `run` (see useRunCompletion) plays again from
 * the start.
 */
export function usePlayhead(
  durationMs: number,
  progress: number | undefined,
  playing: boolean,
  onDone?: () => void,
  run?: unknown,
): MotionValue<number> {
  const t = useMotionValue(progress ?? 0);
  const done = useLatest(onDone);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `run` restarts the playhead.
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
  }, [t, progress, playing, durationMs, done, run]);
  return t;
}

/**
 * Reduced motion (06 §7): nothing moves; the effect's peak frame fades in and out, each fade at
 * most 150 ms, then `onDone`. Returns the opacity (1 when inactive). A new `run` fades again.
 */
export function useReducedFade(
  active: boolean,
  onDone?: () => void,
  run?: unknown,
): MotionValue<number> {
  const opacity = useMotionValue(active ? 0 : 1);
  const done = useLatest(onDone);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `run` restarts the fade.
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
  }, [opacity, active, done, run]);
  return opacity;
}
