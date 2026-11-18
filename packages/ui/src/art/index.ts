// Art kit (05 §11, U02): SVG React components parameterised by state, painted with the design
// tokens. See README.md for the conventions and the "Art Gallery" Storybook for every piece.
// Styles: import "@number-island/ui/art.css" after theme.css (idle loops).

export * from './buildings';
export * from './characters';
export { type ArtProps, ArtSvg, type ArtSvgProps } from './core/ArtSvg';
export { filled, hashSeed, OUTLINE_OF, outline, paint, STROKE, seededRandom } from './core/paint';
export {
  ContactShadow,
  type ContactShadowProps,
  Highlight,
  type HighlightProps,
} from './core/Shading';
export {
  BUILDING_STAGES,
  type BuildingArt,
  type BuildingArtProps,
  type BuildingStage,
  type ItemArt,
} from './core/types';
export * from './decor';
export * from './effects';
export {
  type Box,
  gridToScene,
  HORIZON_Y,
  ISLAND_LAYOUT,
  landLoops,
  landPlots,
  type Point as ScenePoint,
  plotBox,
  plotCenter,
  plotKey,
  roadLayout,
  roundedPath,
  SCENE_H,
  SCENE_W,
  type StonePlacement,
  smoothPath,
  TERRAIN_KINDS,
  type TerrainKind,
  terrainOf,
  traceOutline,
} from './island/geometry';
export { IslandLand, type IslandLandProps } from './island/IslandLand';
export { IslandScene, type IslandSceneProps, PARALLAX } from './island/IslandScene';
export { COMPACT_GAP, NumberedRoad, type NumberedRoadProps } from './island/NumberedRoad';
export { PlotMarker, type PlotMarkerProps, type PlotMarkerState } from './island/PlotMarker';
export {
  ROAD_STONE_STATES,
  RoadStone,
  RoadStoneMark,
  type RoadStoneMarkProps,
  type RoadStoneProps,
  type RoadStoneState,
  stoneMetrics,
} from './island/RoadStone';
export { Sea, type SeaProps } from './island/Sea';
export { Cloud, Sky, type SkyProps } from './island/Sky';
export {
  TerrainTile,
  type TerrainTileProps,
  TILE_KINDS,
  type TileKind,
} from './island/TerrainTile';
export * from './materials';
export {
  type ArtGroup,
  buildingArtFor,
  decorArtFor,
  materialArtFor,
  registeredArt,
} from './registry';
