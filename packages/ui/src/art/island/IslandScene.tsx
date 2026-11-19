import type { IslandDef } from '@number-island/shared';
import { type ReactNode, useId, useMemo } from 'react';
import { useReducedMotion } from '../../preferences/UiProvider';
import type { ArtProps } from '../core/ArtSvg';
import { ArtSvg } from '../core/ArtSvg';
import {
  type Box,
  HORIZON_Y,
  ISLAND_LAYOUT,
  landPlots,
  plotKey,
  SCENE_H,
  SCENE_W,
  terrainOf,
} from './geometry';
import { IslandLand } from './IslandLand';
import { NumberedRoad } from './NumberedRoad';
import { PlotMarker, type PlotMarkerProps } from './PlotMarker';
import { Sea } from './Sea';
import { Sky } from './Sky';

/**
 * How far each moving layer travels when the camera pans (1 = with the island). The sky is the
 * fixed backdrop and never moves, so it is always framed whole.
 */
export const PARALLAX = { seaFar: 0.35, seaNear: 0.65, island: 1 } as const;

/**
 * The camera may look at most this far down the island (positive y): any further and the back row
 * of land, with the road on it, would rise above the horizon into the sky. The land's top edge
 * (grid top less its 10-unit outline offset and up to 8 units of wobble) stays 4 units below it.
 */
export const CAMERA_MAX_Y = ISLAND_LAYOUT.skyH + ISLAND_LAYOUT.padTop - 10 - 8 - 4 - HORIZON_Y;

/** The camera as the scene uses it: vertical pans past CAMERA_MAX_Y are held there. */
export function clampCamera(camera: { x: number; y: number }): { x: number; y: number } {
  return { x: camera.x, y: Math.min(camera.y, CAMERA_MAX_Y) };
}

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
  /**
   * Camera pan in scene units (positive x looks further right, positive y further down). Vertical
   * pans are held at CAMERA_MAX_Y, so land and road never rise above the horizon.
   */
  camera?: { x: number; y: number };
  /** Highlighted plots (building placement, 05 §6). Drawn on top of everything on the island. */
  plotMarkers?: readonly PlotMarkerProps[];
  /** Show only this part of the scene (scene units), for example the land, zoomed in. */
  crop?: Box;
  /** Things on the island (buildings, decor, residents), positioned with plotBox/plotCenter. */
  children?: ReactNode;
}

/**
 * The island map (05 §3): a gently tilted top-down 12 × 8 plot grid on a layered sea, with the sky
 * at the horizon, day or sunset lighting, the Numbered Road and whatever stands on the island.
 * When the camera pans, the far and near sea move at different rates (parallax) and the sky stays
 * put. Everything below the horizon is clipped to the sea, so nothing ever crosses into the sky.
 * Under reduced motion (06 §7) the sea moves together with the island and the idle loops stop.
 */
export function IslandScene({
  island,
  ringsUnlocked,
  roadLength,
  counting = null,
  lighting = 'day',
  camera = { x: 0, y: 0 },
  plotMarkers = [],
  crop,
  children,
  size,
  title,
  className,
  style,
}: IslandSceneProps) {
  const reduced = useReducedMotion();
  const clip = `sea-clip-${useId()}`;
  const plots = useMemo(() => landPlots(island, ringsUnlocked), [island, ringsUnlocked]);
  const terrain = useMemo(() => terrainOf(island, ringsUnlocked), [island, ringsUnlocked]);
  const land = useMemo(() => new Set(plots.map(plotKey)), [plots]);
  const marked = useMemo(() => plotMarkers.flatMap((m) => markerPlots(m)), [plotMarkers]);
  const cam = clampCamera(camera);
  const f = (k: keyof typeof PARALLAX) => (reduced ? 1 : PARALLAX[k]);
  const shift = (k: keyof typeof PARALLAX) => ({ x: -cam.x * f(k), y: -cam.y * f(k) });
  const isl = shift('island');
  const view = crop ?? { x: 0, y: 0, w: SCENE_W, h: SCENE_H };
  return (
    <ArtSvg
      width={view.w}
      height={view.h}
      originX={view.x}
      originY={view.y}
      size={size}
      title={title}
      lighting={lighting}
      className={className}
      style={{ overflow: 'hidden', ...style }}
      rootProps={{ 'data-scene': 'island', 'data-parallax': reduced ? 'off' : 'on' }}
    >
      <defs>
        <clipPath id={clip}>
          <rect x={-600} y={HORIZON_Y} width={SCENE_W + 1200} height={SCENE_H} />
        </clipPath>
      </defs>
      <Sky width={SCENE_W} horizon={HORIZON_Y} lighting={lighting} />
      <g clipPath={`url(#${clip})`}>
        <Sea
          width={SCENE_W}
          top={HORIZON_Y}
          height={SCENE_H - HORIZON_Y}
          far={shift('seaFar')}
          near={shift('seaNear')}
        />
        <g data-layer="island" transform={`translate(${isl.x} ${isl.y})`}>
          <IslandLand plots={plots} terrain={terrain} clearPlots={marked} />
        </g>
      </g>
      {/* What stands on the island is not clipped: a tall building in the back row rises in front
          of the horizon, as it would in the tilted view. */}
      <g data-layer="on-island" transform={`translate(${isl.x} ${isl.y})`}>
        <NumberedRoad
          road={island.road}
          roadLength={roadLength}
          counting={counting}
          onLand={(s) => land.has(plotKey(s.plot))}
          land={land}
        />
        {children}
        {plotMarkers.map((m) => (
          <PlotMarker key={plotKey(m.plot)} {...m} />
        ))}
      </g>
    </ArtSvg>
  );
}

/** Every plot a marker covers (its footprint). */
function markerPlots(m: PlotMarkerProps): string[] {
  const [w, h] = m.footprint ?? [1, 1];
  const out: string[] = [];
  for (let dx = 0; dx < w; dx++)
    for (let dy = 0; dy < h; dy++) out.push(`${m.plot[0] + dx},${m.plot[1] + dy}`);
  return out;
}
