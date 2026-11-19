import { type MotionValue, motion, useTransform } from 'motion/react';
import { useMemo } from 'react';
import { useReducedMotion } from '../../preferences/UiProvider';
import { ArtSvg } from '../core/ArtSvg';
import { paint } from '../core/paint';
import {
  SPLASH_BOX,
  SPLASH_MS,
  type SplashDrop,
  splashCore,
  splashDropAt,
  splashDrops,
} from './particles';
import { type EffectProps, usePlayhead, useReducedFade, useRunCompletion } from './playhead';

/** The frame shown under reduced motion (the crown at its tallest). */
export const SPLASH_PEAK = 0.3;

const W = SPLASH_BOX.waterY;
/** The water crown's fingers: centre x and height (design units, base at y = 0). */
const FINGERS: readonly [number, number][] = [
  [-25, 20],
  [-12, 33],
  [1, 44],
  [14, 31],
  [26, 18],
];

const r1 = (n: number) => Number(n.toFixed(1));

const CROWN = (() => {
  let d = 'M-36 0Q-31 -2 -30 -5';
  for (const [cx, h] of FINGERS) {
    d += `L${cx - 5} ${-h * 0.25}Q${cx - 3.4} ${r1(-h * 0.62)} ${r1(cx - 2.4)} ${-h + 2.4}`;
    d += `A2.5 2.5 0 0 1 ${r1(cx + 2.4)} ${-h + 2.4}Q${cx + 3.4} ${r1(-h * 0.62)} ${cx + 5} ${-h * 0.25}`;
  }
  return `${d}L30 -5Q31 -2 36 0Z`;
})();

function Drop({ d, t }: { d: SplashDrop; t: MotionValue<number> }) {
  const x = useTransform(t, (v) => splashDropAt(d, v).x);
  const y = useTransform(t, (v) => splashDropAt(d, v).y);
  const rotate = useTransform(t, (v) => splashDropAt(d, v).rotate);
  const scale = useTransform(t, (v) => splashDropAt(d, v).scale);
  const scaleY = useTransform(t, (v) => splashDropAt(d, v).scaleY);
  const opacity = useTransform(t, (v) => splashDropAt(d, v).opacity);
  return (
    <motion.g style={{ x, y, rotate, scale, scaleY, opacity }} data-particle="drop">
      <circle r={d.r} fill={paint('foam')} stroke={paint('sea-deep')} strokeWidth={1.4} />
    </motion.g>
  );
}

function Ripple({ t, i }: { t: MotionValue<number>; i: 0 | 1 }) {
  const scaleX = useTransform(t, (v) => splashCore(v).rings[i].rx / 76);
  const scaleY = useTransform(t, (v) => splashCore(v).rings[i].ry / 16);
  const opacity = useTransform(t, (v) => splashCore(v).rings[i].opacity);
  return (
    <motion.g style={{ x: 80, y: W + 2, scaleX, scaleY, opacity }}>
      <ellipse rx={76} ry={16} fill="none" stroke={paint('foam')} strokeWidth={i === 0 ? 3 : 2.4} />
    </motion.g>
  );
}

function Crown({ t }: { t: MotionValue<number> }) {
  const scaleY = useTransform(t, (v) => Math.max(0.001, splashCore(v).crown));
  const scaleX = useTransform(t, (v) => 0.75 + 0.35 * splashCore(v).crown);
  const opacity = useTransform(t, (v) => (splashCore(v).crown > 0.02 ? 1 : 0));
  return (
    <motion.g style={{ x: 80, y: W + 1, scaleX, scaleY, opacity, originY: 1 }}>
      <path
        d={CROWN}
        fill={paint('shallows')}
        stroke={paint('sea-deep')}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {FINGERS.map(([cx, h]) => (
        <g key={cx}>
          <path
            d={`M${cx - 1.6} ${-h * 0.3}Q${cx - 1.8} ${-h * 0.6} ${cx - 0.6} ${-h + 5}`}
            fill="none"
            stroke={paint('foam')}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle
            cx={cx}
            cy={-h - 5}
            r={2.6}
            fill={paint('foam')}
            stroke={paint('sea-deep')}
            strokeWidth={1.3}
          />
        </g>
      ))}
    </motion.g>
  );
}

/**
 * Splash (05 §4 W3, the Ten-Boat): water thrown up where something lands in the sea, with a crown,
 * droplets and ripples, drawn with Motion. Plays once (SPLASH_MS) unless `progress` asks for a still
 * frame. Reduced motion: the crown frame fades in and out (≤ 150 ms each way).
 */
export function Splash({
  seed = 1,
  progress,
  onDone,
  size = 160,
  lighting,
  className,
  style,
}: EffectProps) {
  const reduced = useReducedMotion();
  const still = progress !== undefined;
  const drops = useMemo(() => splashDrops(seed), [seed]);
  // One `onDone` per run, from the playhead or the reduced-motion fade. A new seed is a new run,
  // which plays (or fades) afresh; a finished run shows nothing and never replays, even when
  // reduced motion is switched afterwards.
  const { finished, finish } = useRunCompletion(drops, onDone);
  const over = finished && !still;
  const t = usePlayhead(
    SPLASH_MS,
    reduced ? (progress ?? SPLASH_PEAK) : progress,
    !still && !reduced && !over,
    finish,
    drops,
  );
  const fade = useReducedFade(reduced && !still && !over, finish, drops);
  return (
    <ArtSvg
      width={SPLASH_BOX.w}
      height={SPLASH_BOX.h}
      size={size}
      lighting={lighting}
      className={className}
      style={style}
      rootProps={{
        'data-effect': 'splash',
        'data-renderer': reduced ? 'fade' : still ? 'still' : over ? 'done' : 'motion',
      }}
    >
      {over ? null : (
        <motion.g style={{ opacity: fade }}>
          <Ripple t={t} i={1} />
          <Ripple t={t} i={0} />
          <Crown t={t} />
          {drops.map((d) => (
            <Drop key={`${d.x0}-${d.vx}`} d={d} t={t} />
          ))}
        </motion.g>
      )}
    </ArtSvg>
  );
}
