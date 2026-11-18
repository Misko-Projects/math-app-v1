import type { IslandDef } from '@number-island/shared';
import { type ReactNode, useMemo } from 'react';
import { useReducedMotion } from '../../preferences/UiProvider';
import type { ArtProps } from '../core/ArtSvg';
import { ArtSvg } from '../core/ArtSvg';
import { HORIZON_Y, landPlots, plotKey, SCENE_H, SCENE_W, terrainOf } from './geometry';
import { IslandLand } from './IslandLand';
import { NumberedRoad } from './NumberedRoad';
import { PlotMarker, type PlotMarkerProps } from './PlotMarker';
import { Sea } from './Sea';
import { Sky } from './Sky';

/** How far each layer moves when the camera pans (1 = with the island). */
export const PARALLAX = { sky: 0.12, seaFar: 0.35, seaNear: 0.65, island: 1 } as const;

export interface IslandSceneProps extends Omit<ArtProps, 'lighting'> {
  /** GameData `island` (rings and road). */
  island: Pick<IslandDef, 'rings' | 'road'>;
  /** IslandState.ringsUnlocked: how many rings are land (≥ 1, the starting sandbar). */
  ringsUnlocked: number;
  /** IslandState.roadLength. */
  roadLength: number;
  /** The road stone being counted aloud, if any. */
  counting?: number | null;
  lighting?: 'day' | 'sunset';
  /** Camera pan in scene units (positive x looks further right). */
  camera?: { x: number; y: number };
  /** Highlighted plots (building placement, 05 §6). */
  plotMarkers?: readonly PlotMarkerProps[];
  /** Things on the island (buildings, decor, residents), positioned with plotBox/plotCenter. */
  children?: ReactNode;
}

/**
 * The island map (05 §3): a gently tilted top-down 12 × 8 plot grid on a layered sea, with the sky
 * at the horizon, day or sunset lighting, the Numbered Road and whatever stands on the island. Sky
 * and sea layers move at different rates when the camera pans (parallax); under reduced motion
 * (06 §7) every layer moves together and the idle loops stop.
 */
export function IslandScene({
  island,
  ringsUnlocked,
  roadLength,
  counting = null,
  lighting = 'day',
  camera = { x: 0, y: 0 },
  plotMarkers = [],
  children,
  size,
  title,
  className,
  style,
}: IslandSceneProps) {
  const reduced = useReducedMotion();
  const plots = useMemo(() => landPlots(island, ringsUnlocked), [island, ringsUnlocked]);
  const terrain = useMemo(() => terrainOf(island, ringsUnlocked), [island, ringsUnlocked]);
  const land = useMemo(() => new Set(plots.map(plotKey)), [plots]);
  const f = (k: keyof typeof PARALLAX) => (reduced ? 1 : PARALLAX[k]);
  const shift = (k: keyof typeof PARALLAX) => ({ x: -camera.x * f(k), y: -camera.y * f(k) });
  const sky = shift('sky');
  const isl = shift('island');
  return (
    <ArtSvg
      width={SCENE_W}
      height={SCENE_H}
      size={size}
      title={title}
      lighting={lighting}
      className={className}
      style={{ overflow: 'hidden', ...style }}
      rootProps={{ 'data-scene': 'island', 'data-parallax': reduced ? 'off' : 'on' }}
    >
      <g transform={`translate(${sky.x} ${sky.y})`}>
        <Sky width={SCENE_W} horizon={HORIZON_Y} lighting={lighting} />
      </g>
      <Sea
        width={SCENE_W}
        top={HORIZON_Y + sky.y}
        height={SCENE_H - HORIZON_Y}
        far={shift('seaFar')}
        near={shift('seaNear')}
      />
      <g data-layer="island" transform={`translate(${isl.x} ${isl.y})`}>
        <IslandLand plots={plots} terrain={terrain} />
        {plotMarkers.map((m) => (
          <PlotMarker key={plotKey(m.plot)} {...m} />
        ))}
        <NumberedRoad
          road={island.road}
          roadLength={roadLength}
          counting={counting}
          onLand={(s) => land.has(plotKey(s.plot))}
        />
        {children}
      </g>
    </ArtSvg>
  );
}
