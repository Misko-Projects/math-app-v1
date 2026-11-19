import type { Plot } from '@number-island/shared';
import type { ComponentType } from 'react';
import type { Lighting } from '../../tokens/tokens';
import { ArtSvg } from '../core/ArtSvg';
import type { BuildingArt, BuildingArtProps, BuildingStage } from '../core/types';
import { BUILDING_DESIGN, BUILDING_IDS, type BuildingArtId, buildingAnchor } from './design';
import { BurrowHouse, DriftwoodHut, ReefHouse, ShellCottage, Storehouse } from './homes';
import type { DrawProps } from './parts';
import { EastBridge, FestivalStage, Lighthouse } from './projects';
import { ClockTower, PracticePier, TenBoatDock, TreasureBeach } from './shore';
import {
  Bakery,
  BrickFactory,
  BuildersYard,
  GardenTerraces,
  LanternGrove,
  Market,
  PuzzleTower,
  RhythmOrchard,
  RoadCrew,
  WeighStation,
} from './workshops';

/** Each building's drawing, in scene units with the anchor (bottom-centre of footprint) at 0,0. */
export const buildingDrawing: Readonly<Record<BuildingArtId, ComponentType<DrawProps>>> = {
  'road-crew': RoadCrew,
  'lantern-grove': LanternGrove,
  'ten-boat-dock': TenBoatDock,
  'treasure-beach': TreasureBeach,
  'brick-factory': BrickFactory,
  'garden-terraces': GardenTerraces,
  bakery: Bakery,
  market: Market,
  'clock-tower': ClockTower,
  'builders-yard': BuildersYard,
  'weigh-station': WeighStation,
  'rhythm-orchard': RhythmOrchard,
  'puzzle-tower': PuzzleTower,
  'practice-pier': PracticePier,
  storehouse: Storehouse,
  'shell-cottage': ShellCottage,
  'driftwood-hut': DriftwoodHut,
  'burrow-house': BurrowHouse,
  'reef-house': ReefHouse,
  lighthouse: Lighthouse,
  'east-bridge': EastBridge,
  'festival-stage': FestivalStage,
};

export interface BuildingArtViewProps extends BuildingArtProps {
  id: BuildingArtId;
}

/** A building as a standalone SVG at its design box (one CSS px per scene unit by default). */
export function BuildingArtView({
  id,
  stage,
  size,
  lighting,
  title,
  className,
  style,
}: BuildingArtViewProps) {
  const Drawing = buildingDrawing[id];
  const vb = BUILDING_DESIGN[id].viewBox;
  return (
    <ArtSvg
      width={vb.w}
      height={vb.h}
      originX={vb.x}
      originY={vb.y}
      size={size ?? vb.w}
      title={title}
      lighting={lighting}
      className={className}
      style={style}
      rootProps={{ 'data-building': id, 'data-stage': String(stage) }}
    >
      <g data-part="art">
        <Drawing stage={stage} lit={lighting === 'sunset'} />
      </g>
    </ArtSvg>
  );
}

function artFor(id: BuildingArtId): BuildingArt {
  const art: BuildingArt = (props: BuildingArtProps) => <BuildingArtView id={id} {...props} />;
  art.displayName = `BuildingArt(${id})`;
  return art;
}

/**
 * Building art by id (05 §4, §6, §11): `building/<id>` → a component taking `stage`
 * (`'construction' | 1 | 2 | 3`) and `lighting`. Rendered standalone at one CSS px per scene unit
 * unless `size` says otherwise.
 */
export const buildingArt: Readonly<Record<string, BuildingArt>> = Object.fromEntries(
  BUILDING_IDS.map((id) => [id, artFor(id)]),
);

export interface PlacedBuildingProps {
  id: BuildingArtId;
  /** The footprint's top-left plot. */
  plot: Plot;
  stage: BuildingStage;
  /** The scene's lighting (windows and lanterns glow at sunset). */
  lighting?: Lighting;
}

/**
 * A building inside the island scene (IslandScene children): drawn in scene units on
 * `plotBox(plot, footprint)`, anchored at the bottom-centre of its footprint. Draw rows from the
 * back (small y) to the front so nearer buildings overlap farther ones.
 */
export function PlacedBuilding({ id, plot, stage, lighting = 'day' }: PlacedBuildingProps) {
  const Drawing = buildingDrawing[id];
  const a = buildingAnchor(plot, BUILDING_DESIGN[id].footprint);
  return (
    <g
      transform={`translate(${a.x} ${a.y})`}
      data-building={id}
      data-stage={String(stage)}
      data-plot={`${plot[0]},${plot[1]}`}
    >
      <Drawing stage={stage} lit={lighting === 'sunset'} />
    </g>
  );
}
