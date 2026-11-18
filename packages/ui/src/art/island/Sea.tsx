import { useId } from 'react';
import { hashSeed, paint, seededRandom } from '../core/paint';

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
}

interface Glyph {
  x: number;
  y: number;
  s: number;
}

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

/**
 * The layered sea (05 §3): a deep-to-near wash, then a far and a near layer of wave glyphs that
 * drift slowly and move at different rates when the camera pans (parallax). A few glints sparkle.
 * Idle loops and parallax stop under reduced motion (the scene passes zero offsets then).
 */
export function Sea({ width, top, height, far, near }: SeaProps) {
  const id = useId();
  const wash = `sea-wash-${id}`;
  const farGlyphs = glyphs(11, width, top, height * 0.55, 1);
  const nearGlyphs = glyphs(29, width, top + height * 0.4, height * 0.6, 0.8);
  const glints = glyphs(53, width, top + 10, height, 0.35).slice(0, 9);
  return (
    <g data-layer="sea">
      <defs>
        <linearGradient id={wash} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={paint('sea-deep')} />
          <stop offset="0.55" stopColor={paint('sea')} />
          <stop offset="1" stopColor={paint('sea')} />
        </linearGradient>
      </defs>
      <rect x={-300} y={top} width={width + 600} height={height + 300} fill={`url(#${wash})`} />
      <path
        d={`M-300 ${top}H${width + 300}`}
        stroke={paint('foam')}
        strokeWidth={3}
        opacity={0.6}
      />
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
  );
}
