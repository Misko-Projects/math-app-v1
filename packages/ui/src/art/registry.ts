import { buildingArt } from './buildings';
import type { BuildingArt, ItemArt } from './core/types';
import { decorArt } from './decor';
import { materialArt } from './materials';

/**
 * Art lookup by GameData `art` id (02 §5.8: `materials[].art`, `buildings[].art`, `decor[].art`).
 * GameData ids are `<group>/<id>` (`building/road-crew`, `decor/shell-bench`, `material/plank`);
 * each group's map is keyed by the bare `<id>` (`buildingArt['road-crew']`). Residents have no art
 * id: the Pebbling generator draws them from species, palette and number.
 */
export type ArtGroup = 'building' | 'decor' | 'material';

export function buildingArtFor(art: string): BuildingArt | undefined {
  return lookupArt(buildingArt, 'building', art);
}

export function decorArtFor(art: string): ItemArt | undefined {
  return lookupArt(decorArt, 'decor', art);
}

export function materialArtFor(art: string): ItemArt | undefined {
  return lookupArt(materialArt, 'material', art);
}

/** Every registered GameData art id, by group (for coverage tests against the compiled data). */
export function registeredArt(): Record<ArtGroup, string[]> {
  return {
    building: artIds(buildingArt, 'building'),
    decor: artIds(decorArt, 'decor'),
    material: artIds(materialArt, 'material'),
  };
}

/** The GameData art ids of one group's map (keys are bare ids). */
export function artIds(map: Readonly<Record<string, unknown>>, group: ArtGroup): string[] {
  return Object.keys(map).map((k) => `${group}/${k}`);
}

/** Resolve a GameData art id (`<group>/<id>`) in one group's map; undefined for other groups. */
export function lookupArt<T>(
  map: Readonly<Record<string, T>>,
  group: ArtGroup,
  art: string,
): T | undefined {
  const prefix = `${group}/`;
  if (!art.startsWith(prefix)) return undefined;
  const id = art.slice(prefix.length);
  return Object.hasOwn(map, id) ? map[id] : undefined;
}
