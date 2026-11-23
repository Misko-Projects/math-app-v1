// Workshop registration (02 §5.6). A workshop registers by adding its definition
// (`workshops/<id>/index.ts`) to `WORKSHOPS`; nothing else in the app names a workshop. Framework-free.
//
// - `workshopFor(id)`: the module that plays a request. A workshop without a module is played on
//   the Practice Pier, the generic host of every format (05 §4, 04 §6.3).
// - `workshopCapabilities(gameData, island)`: what the session planner may use (02 §5.4).
//   A workshop is available when it stands on the island, or when its building is there from the
//   start (`unlock: { start: true }`: Road Crew and Lantern Grove, whose level 1 costs nothing).
//   Its residents are the Pebblings that list it as an affinity and are on the island, the
//   starter buddies included. A registered workshop brings its formats, strands and products. One
//   that is not registered yet hosts no format, so the planner sends its requests to the Practice
//   Pier, which then makes that workshop's product (the material its resident asked for).

import type {
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
 * The products of the workshops that stand from the start (05 §4 "Produces") until their modules
 * register; a registered workshop's definition says its own, and its entry here goes.
 */
export const UNREGISTERED_PRODUCTS: Readonly<Record<WorkshopId, readonly MaterialId[]>> = {
  'road-crew': ['stone'],
  'lantern-grove': ['light'],
};

const registered = (id: WorkshopId) => WORKSHOPS.find((w) => w.id === id);

export function workshopFor(id: WorkshopId): AppWorkshop {
  return registered(id) ?? practicePier;
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
      available: built.has(building.id) || 'start' in building.unlock,
      residents: gameData.residents
        .filter((r) => r.affinity.includes(id) && (r.starterBuddy || r.id in island.residents))
        .map((r) => r.id),
      produces: [...produces],
    });
  }
  return caps;
}
