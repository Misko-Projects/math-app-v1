// Workshop registration (02 §5.6). A workshop registers by adding its definition
// (`workshops/<id>/index.ts`) to `WORKSHOPS`; nothing else in the app names a workshop. Framework-free.
//
// - `workshopFor(id)`: the module that plays a request. A workshop without a module is played on
//   the Practice Pier, the generic host of every format (05 §4, 04 §6.3).
// - `workshopCapabilities(gameData, island)`: what the session planner may use (02 §5.4).
//   A workshop is available when it is built on the island, or when it works from the start:
//   its rule is `start: true` and its level 1 costs nothing (Road Crew, Lantern Grove and the
//   pier itself). Those cannot be placed on the first sandbar, and without them a new family
//   could make no material at all; every other workshop has to be unlocked and built (#22 part 2).
//   A Pebbling on the island (the starter buddies included) is the resident of one workshop: the
//   first of its affinities that is available and makes something, else every one it lists. A
//   registered workshop brings its formats, strands and products. One that is not registered
//   yet hosts no format, so the planner sends its requests to the Practice
//   Pier, which then makes that workshop's product (the material its resident asked for).

import type {
  BuildingDef,
  GameData,
  IslandState,
  MaterialId,
  WorkshopCapability,
  WorkshopId,
} from '@number-island/shared';
import { practicePier } from './practice-pier';
import type { AppWorkshop } from './types';

/** Every registered workshop. */
export const WORKSHOPS: readonly AppWorkshop[] = [practicePier];

/**
 * What each workshop makes (05 §4 "Produces") until its module registers; a registered
 * workshop's definition says its own, and its entry here goes. The Puzzle Tower makes no material.
 */
export const UNREGISTERED_PRODUCTS: Readonly<Record<WorkshopId, readonly MaterialId[]>> = {
  'road-crew': ['stone'],
  'lantern-grove': ['light'],
  'ten-boat-dock': ['plank'],
  'treasure-beach': ['gem'],
  'brick-factory': ['brick'],
  'garden-terraces': ['produce'],
  bakery: ['bread'],
  market: ['coin'],
  'clock-tower': ['ticket'],
  'builders-yard': ['glass', 'beam'],
  'weigh-station': ['rope', 'flag'],
  'rhythm-orchard': ['fruit'],
};

const registered = (id: WorkshopId) => WORKSHOPS.find((w) => w.id === id);

export function workshopFor(id: WorkshopId): AppWorkshop {
  return registered(id) ?? practicePier;
}

/** A workshop that needs no building: its rule is `start` and its level 1 is free. */
function worksFromStart(building: BuildingDef): boolean {
  const first = building.levels.find((l) => l.level === 1);
  return (
    'start' in building.unlock &&
    first !== undefined &&
    Object.values(first.recipe).every((n) => !n)
  );
}

export function workshopCapabilities(
  gameData: Pick<GameData, 'buildings' | 'residents'>,
  island: Pick<IslandState, 'buildings' | 'residents'>,
): WorkshopCapability[] {
  const built = new Set(Object.values(island.buildings).map((b) => b.buildingId));
  const caps: WorkshopCapability[] = [];
  for (const building of gameData.buildings) {
    const id = building.workshopId;
    if (building.kind !== 'workshop' || id === undefined) continue;
    const module = registered(id);
    const produces = module?.produces ?? UNREGISTERED_PRODUCTS[id];
    if (produces === undefined) continue;
    caps.push({
      workshopId: id,
      formats: module ? [...module.formats] : [],
      strands: module ? [...module.strands] : [],
      available: built.has(building.id) || worksFromStart(building),
      residents: [],
      produces: [...produces],
    });
  }
  // A resident on the island asks for one workshop: the first of its affinities that is
  // available and makes something (its affinities are in order of preference), else every
  // workshop it lists. So once the Ten-Boat Dock stands, the residents who prefer it ask for
  // planks, whatever else they like; the Practice Pier makes what the resident asks for.
  for (const r of gameData.residents) {
    if (!r.starterBuddy && !(r.id in island.residents)) continue;
    const listed = r.affinity.flatMap((id) => caps.find((c) => c.workshopId === id) ?? []);
    const first = listed.find((c) => c.available && c.produces.length > 0);
    for (const cap of first ? [first] : listed) cap.residents.push(r.id);
  }
  return caps;
}
