import { useId } from 'react';
import { hashSeed, paint, seededRandom } from '../core/paint';
import { SCENE_BLEED } from './geometry';

export interface SeaLayerOffset {
  x: number;
  y: number;
}

export interface SeaProps {
  width: number;
  /** Top of the sea (the horizon). */
  top: number;
  height: number;
  /** Translation of the far and near wave layers (parallax, set by the scene). */
  far?: SeaLayerOffset;
  near?: SeaLayerOffset;
  /** Calm water the wave glyphs and glints keep out of (the island's shallows). */
  calm?: SeaCalm;
}

export interface SeaCalm {
  /** The calm water's outline, in its own units: it masks the waves as they drift and pan. */
  path: string;
  /**
   * Whether a point (in the same units) is in the calm water or within CALM_MARGIN of it. A wave
   * that could reach it at rest or while drifting is not drawn, so the mask never has to cut one
   * in a still frame.
   */
  near: (x: number, y: number) => boolean;
  /** Where the calm water sits in the scene (the island's offset). */
  x: number;
  y: number;
}

interface Glyph {
  x: number;
  y: number;
  s: number;
}

/**
 * Whether a glyph stays clear of the calm water wherever its idle drift takes it (`drift` is the
 * range of its sideways travel). `layer` is its parallax layer's offset.
 */
function clearOfCalm(
  g: Glyph,
  layer: SeaLayerOffset | undefined,
  drift: readonly [number, number],
  calm: SeaCalm | undefined,
): boolean {
  if (!calm) return true;
  const ox = (layer?.x ?? 0) - calm.x;
  const oy = (layer?.y ?? 0) - calm.y;
  const half = 16 * g.s + 2; // the wave's half-width plus its round cap
  const from = g.x - half + drift[0];
  const to = g.x + half + drift[1];
  for (let x = from; x <= to + 4; x += 4) {
    const px = Math.min(x, to) + ox;
    for (const dy of [-5 * g.s, 0]) if (calm.near(px, g.y + dy + oy)) return false;
  }
  return true;
}

/** The drift keyframes' sideways travel (art.css art-drift, art-drift-back). */
const FAR_DRIFT = [-36, 0] as const;
const NEAR_DRIFT = [0, 28] as const;
const STILL = [0, 0] as const;

/** Wave glyph rows, scattered deterministically over the sea plus a margin for panning. */
function glyphs(seed: number, width: number, top: number, height: number, density: number) {
  const rnd = seededRandom(hashSeed(seed));
  const out: Glyph[] = [];
  const rowGap = 46;
  for (let y = top + 24, row = 0; y < top + height + 80; y += rowGap, row++) {
    const depth = (y - top) / height; // 0 at the horizon, 1 at the front
    const step = 260 / density;
    for (let x = -160 + (row % 2) * (step / 2); x < width + 160; x += step) {
      if (rnd() > 0.72) continue;
      out.push({
        x: x + (rnd() - 0.5) * step * 0.5,
        y: y + (rnd() - 0.5) * 12,
        s: 0.55 + depth * 0.7,
      });
    }
  }
  return out;
}

const WAVE = 'M-16 0q8 -7 16 0q8 -7 16 0';
/** Open water (scene units) kept free of waves beyond the calm area's edge. */
export const CALM_MARGIN = 14;

/**
 * The layered sea (05 §3): a deep-to-near wash, then a far and a near layer of wave glyphs that
 * drift slowly and move at different rates when the camera pans (parallax). A few glints sparkle.
 * Idle loops and parallax stop under reduced motion (the scene passes zero offsets then).
 */
export function Sea({ width, top, height, far, near, calm }: SeaProps) {
  const id = useId();
  const wash = `sea-wash-${id}`;
  const calmMask = `sea-calm-${id}`;
  const region = {
    x: -SCENE_BLEED,
    y: top - SCENE_BLEED,
    width: width + 2 * SCENE_BLEED,
    height: height + 2 * SCENE_BLEED,
  };
  const farGlyphs = glyphs(11, width, top, height * 0.55, 1).filter((g) =>
    clearOfCalm(g, far, FAR_DRIFT, calm),
  );
  const nearGlyphs = glyphs(29, width, top + height * 0.4, height * 0.6, 0.8).filter((g) =>
    clearOfCalm(g, near, NEAR_DRIFT, calm),
  );
  const glints = glyphs(53, width, top + 10, height, 0.35)
    .slice(0, 9)
    .filter((g) => clearOfCalm({ ...g, s: 0.5 }, near, STILL, calm));
  return (
    <g data-layer="sea">
      <defs>
        <linearGradient
          id={wash}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={top}
          x2={0}
          y2={top + height + 300}
        >
          <stop offset="0" stopColor={paint('sea-deep')} />
          <stop offset="0.55" stopColor={paint('sea')} />
          <stop offset="1" stopColor={paint('sea')} />
        </linearGradient>
        {calm && (
          <mask id={calmMask} maskUnits="userSpaceOnUse" {...region}>
            <rect {...region} fill="white" />
            {/* A band of open water around the calm area too, so a wave the mask cuts ends in
                the sea, not as a stray tick against the shallows. */}
            <path
              d={calm.path}
              transform={`translate(${calm.x} ${calm.y})`}
              fill="black"
              stroke="black"
              strokeWidth={CALM_MARGIN * 2}
              strokeLinejoin="round"
            />
          </mask>
        )}
      </defs>
      {/* Bleeds far past the scene; the wash is in scene units, so it looks the same inside it. */}
      <rect
        x={-SCENE_BLEED}
        y={top}
        width={width + 2 * SCENE_BLEED}
        height={height + SCENE_BLEED}
        fill={`url(#${wash})`}
      />
      <path
        d={`M${-SCENE_BLEED} ${top}H${width + SCENE_BLEED}`}
        stroke={paint('foam')}
        strokeWidth={3}
        opacity={0.6}
      />
      <g data-part="waves" mask={calm ? `url(#${calmMask})` : undefined}>
        <g data-layer="sea-far" transform={`translate(${far?.x ?? 0} ${far?.y ?? 0})`}>
          <g className="motion-loop art-drift">
            {farGlyphs.map((g) => (
              <path
                key={`f${g.x.toFixed(1)}-${g.y.toFixed(1)}`}
                d={WAVE}
                transform={`translate(${g.x.toFixed(1)} ${g.y.toFixed(1)}) scale(${g.s.toFixed(2)})`}
                fill="none"
                stroke={paint('shallows')}
                strokeWidth={3}
                strokeLinecap="round"
                opacity={0.55}
              />
            ))}
          </g>
        </g>
        <g data-layer="sea-near" transform={`translate(${near?.x ?? 0} ${near?.y ?? 0})`}>
          <g className="motion-loop art-drift-back">
            {nearGlyphs.map((g) => (
              <path
                key={`n${g.x.toFixed(1)}-${g.y.toFixed(1)}`}
                d={WAVE}
                transform={`translate(${g.x.toFixed(1)} ${g.y.toFixed(1)}) scale(${g.s.toFixed(2)})`}
                fill="none"
                stroke={paint('foam')}
                strokeWidth={3.5}
                strokeLinecap="round"
                opacity={0.7}
              />
            ))}
          </g>
          {glints.map((g, i) => (
            <path
              key={`g${g.x.toFixed(1)}-${g.y.toFixed(1)}`}
              className="motion-loop art-loop art-glint"
              style={{ animationDelay: `${(i * 0.61) % 5.5}s` }}
              d={`M${g.x} ${g.y - 7}l2.5 4.5l4.5 2.5l-4.5 2.5l-2.5 4.5l-2.5 -4.5l-4.5 -2.5l4.5 -2.5z`}
              fill={paint('cloud')}
              opacity={0}
            />
          ))}
        </g>
      </g>
    </g>
  );
}
