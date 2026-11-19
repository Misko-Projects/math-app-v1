// Buildings (05 §4, §6; U02): the 13 workshops, the Practice Pier, the Storehouse, homes and
// projects, each under construction and at levels 1–3, by day and at sunset. Keyed by GameData art
// id `building/<id>`; BUILDING_DESIGN gives each one's footprint and art box for the island hub.
export {
  BuildingArtView,
  type BuildingArtViewProps,
  buildingArt,
  buildingDrawing,
  PlacedBuilding,
  type PlacedBuildingProps,
} from './BuildingArt';
export { BUILDING_CONTRAST_PAIRS } from './contrast';
export {
  BUILDING_DESIGN,
  BUILDING_IDS,
  BUILDING_PAD,
  type BuildingArtId,
  type BuildingDesign,
  buildingAnchor,
  COAST_BUILDINGS,
} from './design';
