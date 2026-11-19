import { useId } from 'react';
import type { Lighting } from '../../tokens/tokens';
import { paint } from '../core/paint';
import { SCENE_BLEED } from './geometry';

export interface SkyProps {
  width: number;
  /** y of the horizon (the sky fills 0…horizon). */
  horizon: number;
  lighting: Lighting;
}

interface CloudSpec {
  x: number;
  y: number;
  s: number;
  slow?: boolean;
}

const CLOUDS: readonly CloudSpec[] = [
  { x: 0.12, y: 0.36, s: 1 },
  { x: 0.47, y: 0.22, s: 0.72, slow: true },
  { x: 0.78, y: 0.42, s: 0.88 },
];

/**
 * The sky band above the horizon: a gentle wash (05 §11 allows sky and sea washes), the sun and a
 * few drifting clouds. At sunset the theme remaps the sky colours, and the sun sits low and large.
 */
export function Sky({ width, horizon, lighting }: SkyProps) {
  const id = useId();
  const wash = `sky-wash-${id}`;
  const sunset = lighting === 'sunset';
  return (
    <g data-layer="sky">
      <defs>
        <linearGradient
          id={wash}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={-200}
          x2={0}
          y2={horizon}
        >
          <stop offset="0" stopColor={paint('sky')} />
          <stop offset="0.65" stopColor={paint('sky-light')} />
          <stop offset="1" stopColor={paint('horizon')} />
        </linearGradient>
      </defs>
      {/* Bleeds far past the scene (a full-screen map shows it around the scene); the wash is in
          scene units, so the sky inside the scene is the same at any bleed. */}
      <rect
        x={-SCENE_BLEED}
        y={-SCENE_BLEED}
        width={width + 2 * SCENE_BLEED}
        height={horizon + SCENE_BLEED}
        fill={`url(#${wash})`}
      />
      {sunset ? (
        <g data-part="sun">
          <circle
            cx={width * 0.68}
            cy={horizon - 8}
            r={92}
            fill={paint('sunshine-light')}
            opacity={0.35}
          />
          <circle
            cx={width * 0.68}
            cy={horizon - 8}
            r={58}
            fill={paint('sun')}
            stroke={paint('sun-deep')}
            strokeWidth={3}
          />
          <path
            d={`M${width * 0.68 - 38} ${horizon - 40}a 44 44 0 0 1 30 -18`}
            fill="none"
            stroke={paint('cloud')}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.5}
          />
        </g>
      ) : (
        <g data-part="sun">
          <circle cx={width * 0.86} cy={58} r={52} fill={paint('sunshine-light')} opacity={0.45} />
          <circle
            cx={width * 0.86}
            cy={58}
            r={34}
            fill={paint('sunshine')}
            stroke={paint('sunshine-deep')}
            strokeWidth={3}
          />
          <path
            d={`M${width * 0.86 - 20} ${46}a 24 24 0 0 1 16 -12`}
            fill="none"
            stroke={paint('cloud')}
            strokeWidth={5}
            strokeLinecap="round"
            opacity={0.6}
          />
        </g>
      )}
      {CLOUDS.map((c) => (
        <g
          key={`${c.x}-${c.y}`}
          transform={`translate(${c.x * width} ${c.y * horizon}) scale(${c.s})`}
        >
          <g className={`motion-loop art-loop ${c.slow ? 'art-drift-back' : 'art-drift'}`}>
            <Cloud />
          </g>
        </g>
      ))}
    </g>
  );
}

/** A flat, puffy cloud with a flat base and a soft outline. */
export function Cloud() {
  return (
    <g>
      <path
        d="M-62 14 Q-66 -8 -42 -10 Q-38 -34 -12 -30 Q2 -48 26 -34 Q50 -36 52 -12 Q72 -8 66 14 Z"
        fill={paint('cloud')}
        stroke={paint('sky')}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path d="M-50 14 H56" stroke={paint('sky-light')} strokeWidth={4} strokeLinecap="round" />
    </g>
  );
}
