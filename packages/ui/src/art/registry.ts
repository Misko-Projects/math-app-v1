import { buildingArt } from './buildings';
import type { BuildingArt, ItemArt } from './core/types';
import { decorArt } from './decor';
import { materialArt } from './materials';

/**
 * Art lookup by GameData `art` id (02 §5.8: `materials[].art`, `buildings[].art`, `decor[].art`).
 * Ids are `<group>/<id>`: `building/road-crew`, `decor/shell-bench`, `material/plank`. Residents
 * have no art id: the Pebbling generator draws them from species, palette and number.
 */
export type ArtGroup = 'building' | 'decor' | 'material';

export function buildingArtFor(art: string): BuildingArt | undefined {
  return lookup(buildingArt, 'building', art);
}

export function decorArtFor(art: string): ItemArt | undefined {
  return lookup(decorArt, 'decor', art);
}

export function materialArtFor(art: string): ItemArt | undefined {
  return lookup(materialArt, 'material', art);
}

/** Every registered art id, by group (for coverage tests against the compiled game data). */
export function registeredArt(): Record<ArtGroup, string[]> {
  return {
    building: Object.keys(buildingArt).map((k) => `building/${k}`),
    decor: Object.keys(decorArt).map((k) => `decor/${k}`),
    material: Object.keys(materialArt).map((k) => `material/${k}`),
  };
}

function lookup<T>(map: Readonly<Record<string, T>>, group: ArtGroup, art: string): T | undefined {
  const prefix = `${group}/`;
  if (!art.startsWith(prefix)) return undefined;
  const id = art.slice(prefix.length);
  return Object.hasOwn(map, id) ? map[id] : undefined;
}
