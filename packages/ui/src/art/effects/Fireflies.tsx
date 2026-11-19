import {
  cancelFrame,
  frame,
  type MotionValue,
  motion,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useReducedMotion } from '../../preferences/UiProvider';
import { paint } from '../core/paint';
import {
  FIREFLY_BOX,
  type Firefly,
  fireflies,
  fireflyAt,
  fireflyLayers,
  fireflyStatic,
} from './particles';
import { resolveColor } from './pixi';
import { type EffectProps, useRunCompletion } from './playhead';
import { type PixiBuild, usePixiEffect } from './usePixiEffect';

export interface FirefliesProps extends EffectProps {
  /** Number of fireflies on the Pixi canvas (the SVG fallback draws at most FALLBACK_FLIES). */
  count?: number;
  /** Fireflies blink in this many groups (Lantern Grove: "fireflies blink in groups"). */
  groups?: number;
  /**
   * Stop after this many ms (the swarm disappears) and call `onDone`. Default: glow until
   * unmounted, never finishing.
   */
  duration?: number;
}

/** `progress` 0–1 spans this much of the loop (the group blink pattern repeats every 12 s). */
export const FIREFLY_LOOP_MS = 12000;
export const FIREFLY_FALLBACK_FLIES = 18;

function SvgFly({ f, t, still }: { f: Firefly; t: MotionValue<number>; still: boolean }) {
  const at = (v: number) => (still && v < 0 ? fireflyStatic(f) : fireflyAt(f, v));
  const x = useTransform(t, (v) => at(v).x);
  const y = useTransform(t, (v) => at(v).y);
  const halo = useTransform(t, (v) => fireflyLayers(at(v).glow).halo);
  const core = useTransform(t, (v) => fireflyLayers(at(v).glow).core);
  return (
    <motion.g style={{ x, y }} data-particle="firefly">
      <motion.g style={{ opacity: halo }}>
        <circle r={f.r * 4} fill={paint('sunshine-light')} opacity={0.28} />
        <circle r={f.r * 2.2} fill={paint('sunshine-light')} opacity={0.6} />
      </motion.g>
      <motion.circle r={f.r * 1.1} fill={paint('cloud')} style={{ opacity: core }} />
    </motion.g>
  );
}

function FirefliesSvg({
  flies,
  t,
  still,
}: {
  flies: readonly Firefly[];
  t: MotionValue<number>;
  still: boolean;
}) {
  return (
    <svg
      viewBox={`0 0 ${FIREFLY_BOX.w} ${FIREFLY_BOX.h}`}
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
      aria-hidden="true"
      focusable="false"
    >
      {flies.map((f) => (
        <SvgFly key={`${f.x0}-${f.y0}`} f={f} t={t} still={still} />
      ))}
    </svg>
  );
}

/**
 * Fireflies (Lantern Grove, 05 §4 W2): many soft lights that wander and blink in groups, on a lazily
 * loaded Pixi canvas, looping until unmounted (or for `duration` ms, then gone). Without WebGL it
 * draws a smaller SVG swarm with Motion, with the same lifetime. `progress` renders a still frame.
 * Reduced motion (06 §7): a still, softly glowing swarm (also gone after `duration`).
 */
export function Fireflies({
  seed = 1,
  progress,
  onDone,
  size = '100%',
  count = 36,
  groups = 3,
  duration,
  lighting,
  className,
  style,
}: FirefliesProps) {
  const reduced = useReducedMotion();
  const still = progress !== undefined;
  const live = !reduced && !still;
  const host = useRef<HTMLDivElement>(null);
  const flies = useMemo(() => fireflies(seed, count, groups), [seed, count, groups]);
  const light = useMemo(() => flies.slice(0, FIREFLY_FALLBACK_FLIES), [flies]);
  const end = duration ?? Number.POSITIVE_INFINITY;

  const build = useCallback<PixiBuild>(
    (pixi, app, k) => {
      const el = host.current;
      const glow = resolveColor(el, 'sunshine-light');
      const core = resolveColor(el, 'cloud');
      const sprites = flies.map((f) => {
        const halo = new pixi.Graphics();
        halo.circle(0, 0, f.r * 4).fill({ color: glow, alpha: 0.28 });
        halo.circle(0, 0, f.r * 2.2).fill({ color: glow, alpha: 0.6 });
        halo.scale.set(k);
        const dot = new pixi.Graphics();
        dot.circle(0, 0, f.r * 1.1).fill({ color: core });
        dot.scale.set(k);
        app.stage.addChild(halo, dot);
        return { halo, dot };
      });
      return (ms) => {
        for (let i = 0; i < flies.length; i++) {
          const s = fireflyAt(flies[i] as Firefly, ms);
          const g = sprites[i];
          if (!g) continue;
          const layers = fireflyLayers(s.glow);
          g.halo.position.set(s.x * k, s.y * k);
          g.dot.position.set(s.x * k, s.y * k);
          g.halo.alpha = layers.halo;
          g.dot.alpha = layers.core;
        }
        return ms >= end;
      };
    },
    [flies, end],
  );
  // One run is this scene (the flies and the duration): every path ends it, and `onDone` fires,
  // once. A finished run shows nothing, like the Pixi canvas, which is removed.
  const { finished, finish } = useRunCompletion(build, onDone);
  const status = usePixiEffect(live && !finished, host, FIREFLY_BOX.w, build, finish);

  // Still frames, the reduced-motion swarm (t < 0 = static) and the SVG fallback, which keeps the
  // Pixi canvas's lifetime: it wanders for `duration` ms, or for as long as it is shown.
  const t = useMotionValue(still ? progress * FIREFLY_LOOP_MS : reduced ? -1 : 0);
  useEffect(() => {
    if (still) {
      t.set(progress * FIREFLY_LOOP_MS);
      return;
    }
    if (reduced) {
      t.set(-1);
      if (end === Number.POSITIVE_INFINITY) return;
      const timer = setTimeout(finish, end);
      return () => clearTimeout(timer);
    }
    if (status !== 'svg') return;
    let start: number | undefined;
    const tick = ({ timestamp }: { timestamp: number }) => {
      start ??= timestamp;
      const ms = timestamp - start;
      t.set(Math.min(ms, end));
      if (ms >= end) {
        cancelFrame(tick);
        finish();
      }
    };
    frame.update(tick, true);
    return () => cancelFrame(tick);
  }, [t, still, progress, reduced, status, end, finish]);

  const renderer = still ? 'still' : finished ? 'done' : reduced ? 'static' : status;
  const svg = still || (!finished && (reduced || status === 'svg'));
  return (
    <div
      ref={host}
      className={className}
      style={{
        position: 'relative',
        width: size,
        aspectRatio: `${FIREFLY_BOX.w} / ${FIREFLY_BOX.h}`,
        pointerEvents: 'none',
        ...style,
      }}
      data-lighting={lighting}
      data-effect="fireflies"
      data-renderer={renderer}
      aria-hidden="true"
    >
      {svg ? (
        <FirefliesSvg flies={still || reduced ? flies : light} t={t} still={still || reduced} />
      ) : null}
    </div>
  );
}
