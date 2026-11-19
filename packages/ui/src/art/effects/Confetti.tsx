import { animate, type MotionValue, motion, useMotionValue, useTransform } from 'motion/react';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef } from 'react';
import { useReducedMotion } from '../../preferences/UiProvider';
import { OUTLINE_OF, paint } from '../core/paint';
import {
  CONFETTI_BOX,
  CONFETTI_MS,
  type ConfettiPiece,
  confettiAt,
  confettiPieces,
} from './particles';
import { resolveColor } from './pixi';
import { type EffectProps, useLatest } from './playhead';
import { type PixiBuild, usePixiEffect } from './usePixiEffect';

export interface ConfettiProps extends EffectProps {
  /** Number of pieces on the Pixi canvas (the SVG fallback draws at most FALLBACK_PIECES). */
  count?: number;
}

/** The SVG fallback (no WebGL) and still frames stay light. */
export const CONFETTI_FALLBACK_PIECES = 36;

function PieceShape({ p }: { p: ConfettiPiece }) {
  const fill = paint(p.color);
  const edge = paint(OUTLINE_OF[p.color]);
  const common = { fill, stroke: edge, strokeWidth: 1.2, strokeLinejoin: 'round' as const };
  switch (p.shape) {
    case 'circle':
      return <circle r={p.w / 2} {...common} />;
    case 'triangle':
      return <path d={`M0 ${-p.h / 2}L${p.w / 2} ${p.h / 2}H${-p.w / 2}Z`} {...common} />;
    case 'ribbon':
      return <rect x={-p.w / 2} y={-p.h / 2} width={p.w} height={p.h} rx={p.w / 2} {...common} />;
    default:
      return <rect x={-p.w / 2} y={-p.h / 2} width={p.w} height={p.h} rx={1.2} {...common} />;
  }
}

function SvgPiece({ p, t }: { p: ConfettiPiece; t: MotionValue<number> }) {
  const x = useTransform(t, (v) => confettiAt(p, v).x);
  const y = useTransform(t, (v) => confettiAt(p, v).y);
  const rotate = useTransform(t, (v) => confettiAt(p, v).rotate);
  const opacity = useTransform(t, (v) => confettiAt(p, v).opacity);
  const scaleX = useTransform(t, (v) => confettiAt(p, v).scale);
  const scaleY = useTransform(t, (v) => confettiAt(p, v).scale * confettiAt(p, v).scaleY);
  // Outer: place and turn; inner: the paper's flip (the same order as the Pixi sprites).
  return (
    <motion.g style={{ x, y, rotate, opacity }} data-particle={p.shape}>
      <motion.g style={{ scaleX, scaleY }}>
        <PieceShape p={p} />
      </motion.g>
    </motion.g>
  );
}

function ConfettiSvg({ pieces, t }: { pieces: readonly ConfettiPiece[]; t: MotionValue<number> }) {
  return (
    <svg
      viewBox={`0 0 ${CONFETTI_BOX.w} ${CONFETTI_BOX.h}`}
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
      aria-hidden="true"
      focusable="false"
    >
      {pieces.map((p) => (
        <SvgPiece key={`${p.x0}-${p.vx}`} p={p} t={t} />
      ))}
    </svg>
  );
}

const box = (size: number | string): CSSProperties => ({
  position: 'relative',
  width: size,
  aspectRatio: `${CONFETTI_BOX.w} / ${CONFETTI_BOX.h}`,
  pointerEvents: 'none',
});

/**
 * Confetti (06 §6: "Build: confetti burst (Pixi), max 2 s"). Plays once on mount on a lazily loaded
 * Pixi canvas (CONFETTI_MS ≤ 2 s), then destroys the canvas and calls `onDone`. Without WebGL it
 * draws a lighter SVG burst with Motion. `progress` renders a still SVG frame. Reduced motion
 * (06 §7): no confetti at all; `onDone` fires straight away.
 */
export function Confetti({
  seed = 1,
  progress,
  onDone,
  size = '100%',
  count = 90,
  lighting,
  className,
  style,
}: ConfettiProps) {
  const reduced = useReducedMotion();
  const still = progress !== undefined;
  const live = !reduced && !still;
  const host = useRef<HTMLDivElement>(null);
  const pieces = useMemo(() => confettiPieces(seed, count), [seed, count]);
  const light = useMemo(() => pieces.slice(0, CONFETTI_FALLBACK_PIECES), [pieces]);
  const done = useLatest(onDone);

  const build = useCallback<PixiBuild>(
    (pixi, app, k) => {
      const el = host.current;
      const sprites = pieces.map((p) => {
        const g = new pixi.Graphics();
        const color = resolveColor(el, p.color);
        const stroke = { width: 1.2, color: resolveColor(el, OUTLINE_OF[p.color]) };
        if (p.shape === 'circle') g.circle(0, 0, p.w / 2);
        else if (p.shape === 'triangle') g.poly([0, -p.h / 2, p.w / 2, p.h / 2, -p.w / 2, p.h / 2]);
        else if (p.shape === 'ribbon') g.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, p.w / 2);
        else g.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 1.2);
        g.fill(color).stroke(stroke);
        app.stage.addChild(g);
        return g;
      });
      return (ms) => {
        for (let i = 0; i < pieces.length; i++) {
          const s = confettiAt(pieces[i] as ConfettiPiece, ms);
          const g = sprites[i];
          if (!g) continue;
          g.position.set(s.x * k, s.y * k);
          g.rotation = (s.rotate * Math.PI) / 180;
          g.scale.set(s.scale * k, s.scale * s.scaleY * k);
          g.alpha = s.opacity;
        }
        return ms >= CONFETTI_MS;
      };
    },
    [pieces],
  );
  const status = usePixiEffect(live, host, CONFETTI_BOX.w, build, () => done.current?.());

  // The SVG fallback: the same burst with fewer pieces, driven by Motion.
  const t = useMotionValue(still ? progress * CONFETTI_MS : 0);
  useEffect(() => {
    if (still) {
      t.set(progress * CONFETTI_MS);
      return;
    }
    if (status !== 'svg') return;
    const controls = animate(t, CONFETTI_MS, {
      duration: CONFETTI_MS / 1000,
      ease: 'linear',
      onComplete: () => done.current?.(),
    });
    return () => controls.stop();
  }, [t, still, progress, status, done]);

  // Reduced motion: confetti is off (06 §7), so the celebration is over at once.
  useEffect(() => {
    if (reduced && !still) done.current?.();
  }, [reduced, still, done]);

  const renderer = reduced && !still ? 'off' : still ? 'still' : status;
  return (
    <div
      ref={host}
      className={className}
      style={{ ...box(size), ...style }}
      data-lighting={lighting}
      data-effect="confetti"
      data-renderer={renderer}
      aria-hidden="true"
    >
      {still ? <ConfettiSvg pieces={pieces} t={t} /> : null}
      {!still && status === 'svg' ? <ConfettiSvg pieces={light} t={t} /> : null}
    </div>
  );
}
