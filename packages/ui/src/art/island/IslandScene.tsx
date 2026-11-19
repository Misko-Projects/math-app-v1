import type { IslandDef } from '@number-island/shared';
import {
  type ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useReducedMotion } from '../../preferences/UiProvider';
import type { ArtProps } from '../core/ArtSvg';
import { ArtSvg } from '../core/ArtSvg';
import {
  type Box,
  HALO_REACH,
  HORIZON_Y,
  ISLAND_LAYOUT,
  landPlots,
  plotKey,
  SCENE_BLEED,
  SCENE_H,
  SCENE_W,
  type StonePlacement,
  terrainOf,
} from './geometry';
import { IslandLand } from './IslandLand';
import { NextStoneHit, NumberedRoad } from './NumberedRoad';
import { PlotMarker, type PlotMarkerProps } from './PlotMarker';
import { nextHitRadius, planRoad, roadFootprint } from './roadPlan';
import { Sea } from './Sea';
import { Sky } from './Sky';

/**
 * How far each moving layer travels when the camera pans (1 = with the island). The sky is the
 * fixed backdrop and never moves, so it is always framed whole.
 */
export const PARALLAX = { seaFar: 0.35, seaNear: 0.65, island: 1 } as const;

/** The grid's top edge in scene units. */
const GRID_TOP = ISLAND_LAYOUT.skyH + ISLAND_LAYOUT.padTop;

/** Open sea always kept between the island's halo and the horizon, in scene units. */
export const HORIZON_GAP = 16;

/**
 * The camera may look at most this far down the island (positive y). The island's shallows halo
 * reaches HALO_REACH above the back row of land; at this pan its curved top still sits HORIZON_GAP
 * below the horizon, so the whole island, halo included, always stays in the sea with a clear
 * band of water behind it.
 */
export const CAMERA_MAX_Y = GRID_TOP - HALO_REACH - HORIZON_Y - HORIZON_GAP;

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
   * pans are held at CAMERA_MAX_Y, so the island never reaches the horizon.
   */
  camera?: { x: number; y: number };
  /** Highlighted plots (building placement, 05 §6). Drawn on top of everything on the island. */
  plotMarkers?: readonly PlotMarkerProps[];
  /** Show only this part of the scene (scene units), for example the land, zoomed in. */
  crop?: Box;
  /** Things on the island (buildings, decor, residents), positioned with plotBox/plotCenter. */
  children?: ReactNode;
  /**
   * `fill`: a full-screen map. The scene fills its container, scaled to fit whole and centred
   * (06 §1: landscape or portrait), and its sky and sea bleed past it to every edge, so no edge is
   * left unpainted. Give the container `overflow: hidden`. Default `width` (the scene is `size`
   * wide).
   */
  fit?: 'width' | 'fill';
}

/**
 * The island map (05 §3): a gently tilted top-down 12 × 8 plot grid on a layered sea, with the sky
 * at the horizon, day or sunset lighting, the Numbered Road and whatever stands on the island.
 * When the camera pans, the far and near sea move at different rates (parallax) and the sky stays
 * put; the camera is held so the island and its halo always stay in the sea, below the horizon.
 * Ground detail keeps off the road, with a clear zone around the next stone, whose tap target
 * (`data-hit="next"`) is drawn on top of all. Under reduced motion (06 §7) the sea moves together
 * with the island and the idle loops stop.
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
  fit,
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
  const onLand = useMemo(() => (s: StonePlacement) => land.has(plotKey(s.plot)), [land]);
  const plan = useMemo(
    () => planRoad({ road: island.road, roadLength, counting, onLand, land }),
    [island.road, roadLength, counting, onLand, land],
  );
  const blocked = useMemo(() => roadFootprint(plan), [plan]);
  const cam = clampCamera(camera);
  const f = (k: keyof typeof PARALLAX) => (reduced ? 1 : PARALLAX[k]);
  const shift = (k: keyof typeof PARALLAX) => ({ x: -cam.x * f(k), y: -cam.y * f(k) });
  const isl = shift('island');
  const view = crop ?? { x: 0, y: 0, w: SCENE_W, h: SCENE_H };
  // CSS px per scene unit as drawn, so the next stone's tap target stays ≥ 80 px however small
  // the map is (portrait, small screens, a wider crop; 06 §1, §4). Measured after every render
  // (a new crop or fit changes the scale without resizing the element) and on every resize; the
  // state only changes when the scale does.
  const svgRef = useRef<SVGSVGElement>(null);
  const [pxPerUnit, setPxPerUnit] = useState(0);
  const measure = useCallback(() => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return;
    const next = Math.hypot(m.a, m.b);
    setPxPerUnit((prev) => (Math.abs(prev - next) > 1e-4 ? next : prev));
  }, []);
  useLayoutEffect(() => {
    measure();
  });
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [measure]);
  return (
    <ArtSvg
      svgRef={svgRef}
      width={view.w}
      height={view.h}
      originX={view.x}
      originY={view.y}
      size={size}
      fit={fit}
      title={title}
      lighting={lighting}
      className={className}
      style={{ overflow: fit === 'fill' ? 'visible' : 'hidden', ...style }}
      rootProps={{ 'data-scene': 'island', 'data-parallax': reduced ? 'off' : 'on' }}
    >
      <defs>
        <clipPath id={clip}>
          <rect
            x={-SCENE_BLEED}
            y={HORIZON_Y}
            width={SCENE_W + 2 * SCENE_BLEED}
            height={SCENE_H + SCENE_BLEED}
          />
        </clipPath>
      </defs>
      <Sky width={SCENE_W} horizon={HORIZON_Y} lighting={lighting} />
      {/* Only the drifting wave glyphs are clipped to the sea; the island never needs a clip. */}
      <g clipPath={`url(#${clip})`}>
        <Sea
          width={SCENE_W}
          top={HORIZON_Y}
          height={SCENE_H - HORIZON_Y}
          far={shift('seaFar')}
          near={shift('seaNear')}
        />
      </g>
      <g data-layer="island" transform={`translate(${isl.x} ${isl.y})`}>
        <IslandLand plots={plots} terrain={terrain} clearPlots={marked} blocked={blocked} />
      </g>
      {/* What stands on the island, then the road above it (05 §11: nothing hides a road stone),
          the plot markers, and the next stone's tap target on top of all. */}
      <g data-layer="on-island" transform={`translate(${isl.x} ${isl.y})`}>
        {children}
        <NumberedRoad road={island.road} roadLength={roadLength} plan={plan} />
        {plotMarkers.map((m) => (
          <PlotMarker key={plotKey(m.plot)} {...m} />
        ))}
        <NextStoneHit plan={plan} radius={nextHitRadius(pxPerUnit)} />
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
