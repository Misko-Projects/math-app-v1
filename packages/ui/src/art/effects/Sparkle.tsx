import { type MotionValue, motion, useTransform } from 'motion/react';
import { useMemo } from 'react';
import { useReducedMotion } from '../../preferences/UiProvider';
import { ArtSvg } from '../core/ArtSvg';
import { paint } from '../core/paint';
import {
  SPARKLE_BOX,
  SPARKLE_MS,
  type SparkleParticle,
  sparkleAt,
  sparkleCore,
  sparkleParticles,
} from './particles';
import { type EffectProps, usePlayhead, useReducedFade, useRunCompletion } from './playhead';

/** The frame shown under reduced motion (the burst at its fullest). */
export const SPARKLE_PEAK = 0.36;

function glint(r: number) {
  const k = r * 0.28;
  return `M0 ${-r}Q${k} ${-k} ${r} 0Q${k} ${k} 0 ${r}Q${-k} ${k} ${-r} 0Q${-k} ${-k} 0 ${-r}Z`;
}

function SparklePiece({ p, t }: { p: SparkleParticle; t: MotionValue<number> }) {
  const x = useTransform(t, (v) => sparkleAt(p, v).x);
  const y = useTransform(t, (v) => sparkleAt(p, v).y);
  const rotate = useTransform(t, (v) => sparkleAt(p, v).rotate);
  const scale = useTransform(t, (v) => sparkleAt(p, v).scale);
  const opacity = useTransform(t, (v) => sparkleAt(p, v).opacity);
  return (
    <motion.g style={{ x, y, rotate, scale, opacity }} data-particle={p.kind}>
      {p.kind === 'star' ? (
        <path
          d={glint(p.size)}
          fill={paint(p.color)}
          stroke={paint('ink')}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      ) : (
        <circle r={p.size} fill={paint(p.color)} stroke={paint('ink')} strokeWidth={1.2} />
      )}
    </motion.g>
  );
}

function SparkleCore({ t }: { t: MotionValue<number> }) {
  const flashScale = useTransform(t, (v) => sparkleCore(v).flashR / 24);
  const flashOpacity = useTransform(t, (v) => sparkleCore(v).flashOpacity);
  const ringScale = useTransform(t, (v) => sparkleCore(v).ringR / 48);
  const ringOpacity = useTransform(t, (v) => sparkleCore(v).ringOpacity);
  return (
    <>
      <motion.g style={{ x: 60, y: 60, scale: ringScale, opacity: ringOpacity }}>
        <circle r={48} fill="none" stroke={paint('sunshine')} strokeWidth={4} />
      </motion.g>
      <motion.g style={{ x: 60, y: 60, scale: flashScale, opacity: flashOpacity }}>
        <circle r={24} fill={paint('sunshine-light')} />
        <path d={glint(16)} fill={paint('cloud')} />
      </motion.g>
    </>
  );
}

/**
 * Sparkle (05 §11, 06 §6 "product pop"): a small burst of glints on a correct action, drawn with
 * Motion. Plays once (SPARKLE_MS) unless `progress` asks for a still frame. Reduced motion: the peak
 * frame fades in and out (≤ 150 ms each way), nothing flies.
 */
export function Sparkle({
  seed = 1,
  progress,
  onDone,
  size = 120,
  lighting,
  className,
  style,
}: EffectProps) {
  const reduced = useReducedMotion();
  const still = progress !== undefined;
  const particles = useMemo(() => sparkleParticles(seed), [seed]);
  // One `onDone` per run, from the playhead or the reduced-motion fade; a new seed is a new run.
  const { finish } = useRunCompletion(particles, onDone);
  const t = usePlayhead(
    SPARKLE_MS,
    reduced ? (progress ?? SPARKLE_PEAK) : progress,
    !still && !reduced,
    finish,
  );
  const fade = useReducedFade(reduced && !still, finish);
  return (
    <ArtSvg
      width={SPARKLE_BOX.w}
      height={SPARKLE_BOX.h}
      size={size}
      lighting={lighting}
      className={className}
      style={style}
      rootProps={{
        'data-effect': 'sparkle',
        'data-renderer': reduced ? 'fade' : still ? 'still' : 'motion',
      }}
    >
      <motion.g style={{ opacity: fade }}>
        <SparkleCore t={t} />
        {particles.map((p) => (
          <SparklePiece key={`${p.angle}`} p={p} t={t} />
        ))}
      </motion.g>
    </ArtSvg>
  );
}
