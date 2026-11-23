// What building writes (02 §4.3; #22 part 2). Each action reads the island and the Storehouse
// as they are now and refuses a build the family cannot pay for, so the inventory never goes
// below 0 on this device; two devices that spend the same materials while apart are clamped at 0
// by `foldInventory`.
//
// - A new building: `building.placed`, `material.spent` (purpose `build`, or `project` for a
//   shared project, whose `ref` is the building id), then `resident.arrived` for every resident
//   its level names (`resident:<id>`).
// - An upgrade: `building.upgraded`, `material.spent` (purpose `upgrade`, or `project`), then the
//   level's residents.
// - A road stone: `road.extended`, `material.spent` (one stone, purpose `build`, ref `road`).
//
// The thing built is written before its cost: an interruption between the two leaves the family
// with the building, never with materials gone for nothing.

import type { ChildId, GameData, Plot, Recipe } from '@number-island/shared';
import type { DataStore } from '@/data/store';
import {
  affordable,
  type BuildCard,
  builtInstance,
  freeAnchors,
  nextStone,
  ROAD_MATERIAL,
  recipeNeeds,
} from './rules';

type Store = Pick<DataStore, 'append' | 'island' | 'inventory'>;

export type BuildRefusal = 'short' | 'taken' | 'stale';
export type BuildResult =
  | { ok: true; instanceId: string; level: 1 | 2 | 3; plot: Plot }
  | { ok: false; reason: BuildRefusal };

/** The ref of the road's `material.spent`. */
export const ROAD_REF = 'road';

const amounts = (recipe: Recipe): Recipe =>
  Object.fromEntries(Object.entries(recipe).filter(([, n]) => typeof n === 'number' && n > 0));

async function pay(
  store: Store,
  childId: ChildId,
  recipe: Recipe,
  purpose: { kind: 'build' | 'upgrade' | 'project'; ref: string },
) {
  const materials = amounts(recipe);
  if (Object.keys(materials).length === 0) return;
  await store.append('material.spent', { materials, purpose }, { childId });
}

async function arrive(
  store: Store,
  childId: ChildId,
  gameData: Pick<GameData, 'residents'>,
  unlocks: readonly string[],
  instanceId: string,
) {
  const island = await store.island();
  for (const unlock of unlocks) {
    if (!unlock.startsWith('resident:')) continue;
    const resident = gameData.residents.find((r) => r.id === unlock.slice('resident:'.length));
    if (!resident || resident.id in island.residents) continue;
    await store.append(
      'resident.arrived',
      {
        residentId: resident.id,
        homeInstanceId: instanceId,
        via: resident.arrival.via === 'ferry' ? 'ferry' : 'home',
      },
      { childId },
    );
  }
}

const unlocksOf = (card: BuildCard) =>
  card.building.levels.find((l) => l.level === card.level)?.unlocks ?? [];

/** Places a new building on `plot` and pays its level-1 recipe. */
export async function placeBuilding(
  store: Store,
  childId: ChildId,
  gameData: Pick<GameData, 'buildings' | 'materials' | 'island' | 'residents'>,
  card: BuildCard,
  plot: Plot,
): Promise<BuildResult> {
  const { building } = card;
  const island = await store.island();
  if (card.level !== 1 || builtInstance(island, building.id)) return { ok: false, reason: 'stale' };
  const fits = freeAnchors(gameData, island, building.footprint).some(
    (p) => p[0] === plot[0] && p[1] === plot[1],
  );
  if (!fits) return { ok: false, reason: 'taken' };
  if (!affordable(recipeNeeds(gameData, card.recipe, await store.inventory())))
    return { ok: false, reason: 'short' };
  const instanceId = building.id;
  await store.append(
    'building.placed',
    { instanceId, buildingId: building.id, plot: [plot[0], plot[1]] },
    { childId },
  );
  await pay(
    store,
    childId,
    card.recipe,
    building.kind === 'project'
      ? { kind: 'project', ref: building.id }
      : { kind: 'build', ref: instanceId },
  );
  await arrive(store, childId, gameData, unlocksOf(card), instanceId);
  return { ok: true, instanceId, level: 1, plot };
}

/** Buys the next level of a building that stands. */
export async function upgradeBuilding(
  store: Store,
  childId: ChildId,
  gameData: Pick<GameData, 'materials' | 'residents'>,
  card: BuildCard,
): Promise<BuildResult> {
  const { building, level } = card;
  const built = builtInstance(await store.island(), building.id);
  if (level === 1 || !built || built.level !== level - 1) return { ok: false, reason: 'stale' };
  if (!affordable(recipeNeeds(gameData, card.recipe, await store.inventory())))
    return { ok: false, reason: 'short' };
  await store.append('building.upgraded', { instanceId: built.instanceId, level }, { childId });
  await pay(
    store,
    childId,
    card.recipe,
    building.kind === 'project'
      ? { kind: 'project', ref: building.id }
      : { kind: 'upgrade', ref: built.instanceId },
  );
  await arrive(store, childId, gameData, unlocksOf(card), built.instanceId);
  return { ok: true, instanceId: built.instanceId, level, plot: built.plot };
}

export type StoneResult = { ok: true; to: number } | { ok: false; reason: 'short' | 'stale' };

/** Lays the road's next stone for one `stone`. */
export async function layNextStone(
  store: Store,
  childId: ChildId,
  gameData: Pick<GameData, 'island'>,
): Promise<StoneResult> {
  const next = nextStone(gameData, await store.island());
  if (!next) return { ok: false, reason: 'stale' };
  if (((await store.inventory()).materials[ROAD_MATERIAL] ?? 0) < 1)
    return { ok: false, reason: 'short' };
  await store.append('road.extended', { to: next.n }, { childId });
  await store.append(
    'material.spent',
    { materials: { [ROAD_MATERIAL]: 1 }, purpose: { kind: 'build', ref: ROAD_REF } },
    { childId },
  );
  return { ok: true, to: next.n };
}
