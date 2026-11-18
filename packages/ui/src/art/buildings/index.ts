import type { BuildingArt } from '../core/types';

// Buildings (05 §4, §6; U02): the 13 workshops, the Practice Pier, the Storehouse, homes and
// projects, each under construction and at levels 1–3. Keyed by GameData art id `building/<id>`.
export const buildingArt: Readonly<Record<string, BuildingArt>> = {};
