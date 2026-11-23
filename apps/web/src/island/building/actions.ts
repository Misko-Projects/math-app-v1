// What building writes (02 §4.3; #22 part 2). Each action reads the island and the Storehouse
// as they are now and refuses a build the family cannot pay for, so the inventory never goes
// below 0 on this device; two devices that spend the same materials while apart are clamped at 0
// by `foldInventory`.
//
// - A new building: `building.placed`, `material.spent` (purpose `build`, or `project` for a
//   shared project, whose `ref` is the building id), then `resident.arrived` for every resident
//   whose arrival rule now holds (a level names the ones it brings, `resident:<id>`).
// - An upgrade: `building.upgraded`, `material.spent` (purpose `upgrade`, or `project`), then the
//   level's residents.
// - Residents are settled from the island as it stands (`settleResidents`), so an interruption
//   after a placement never leaves a home without the resident it brings.
// - A road stone: `road.extended`, `material.spent` (one stone, purpose `build`, ref `road`), then
//   the residents the longer road brings.
//
// The thing built is written before its cost: an interruption between the two leaves the family
// with the building, never with materials gone for nothing.

import { evaluateUnlock, islandFacts, type UnlockFacts } from '@number-island/engine/shell';
import type { ChildId, GameData, Plot, Recipe } from '@number-island/shared';
import type { DataStore } from '@/data/store';
import {
  affordable,
  type BuildCard,
  builtInstance,
  freeAnchors,
  nextStone,
  ROAD_MATERIAL,
  ROAD_STONE_COST,
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

/**
 * Writes `resident.arrived` for every resident whose own arrival rule holds (`arrival.unlock`:
 * a building at a level, a road length, a skill) and who is not on the island; the starter
 * buddies are there from the start and never arrive. A building level names the residents it
 * brings (`resident:<id>`), and their rules say the same, so one rule serves homes, the road and
 * the ferry. It reads the island as it is, so it also makes good a build that was interrupted
 * before its arrival was written: it runs after each build and each road stone, and when the
 * island opens. `learners` are the family's learner facts; without them only island rules hold.
 *
 * One pass at a time per store: a pass that starts while another is writing waits for it and
 * then reads the island again, so no arrival is ever written twice. Returns how many arrived.
 */
export function settleResidents(
  store: Store,
  childId: ChildId,
  gameData: Pick<GameData, 'residents'>,
  learners: Partial<UnlockFacts> = {},
): Promise<number> {
  const before = settling.get(store) ?? Promise.resolve(0);
  const pass = before.catch(() => 0).then(() => settlePass(store, childId, gameData, learners));
  settling.set(store, pass);
  return pass;
}

/** The pass in flight (or the last one) of each store. */
const settling = new WeakMap<Store, Promise<number>>();

async function settlePass(
  store: Store,
  childId: ChildId,
  gameData: Pick<GameData, 'residents'>,
  learners: Partial<UnlockFacts>,
): Promise<number> {
  let arrived = 0;
  const island = await store.island();
  const facts = { ...learners, ...islandFacts(island) };
  for (const resident of gameData.residents) {
    if (resident.arrival.via === 'start' || resident.id in island.residents) continue;
    if (!evaluateUnlock(resident.arrival.unlock, facts)) continue;
    const home = resident.arrival.home ? builtInstance(island, resident.arrival.home) : null;
    await store.append(
      'resident.arrived',
      {
        residentId: resident.id,
        homeInstanceId: home?.instanceId ?? null,
        via: resident.arrival.via,
      },
      { childId },
    );
    arrived += 1;
  }
  return arrived;
}

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
  await settleResidents(store, childId, gameData);
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
  await settleResidents(store, childId, gameData);
  return { ok: true, instanceId: built.instanceId, level, plot: built.plot };
}

export type StoneResult =
  /** `arrived`: how many residents the longer road brought. */
  { ok: true; to: number; arrived: number } | { ok: false; reason: 'short' | 'stale' };

/** Lays the road's next stone for its cost (`ROAD_STONE_COST`). */
export async function layNextStone(
  store: Store,
  childId: ChildId,
  gameData: Pick<GameData, 'island' | 'residents'>,
): Promise<StoneResult> {
  const next = nextStone(gameData, await store.island());
  if (!next) return { ok: false, reason: 'stale' };
  if (((await store.inventory()).materials[ROAD_MATERIAL] ?? 0) < ROAD_STONE_COST)
    return { ok: false, reason: 'short' };
  await store.append('road.extended', { to: next.n }, { childId });
  await store.append(
    'material.spent',
    { materials: { [ROAD_MATERIAL]: ROAD_STONE_COST }, purpose: { kind: 'build', ref: ROAD_REF } },
    { childId },
  );
  const arrived = await settleResidents(store, childId, gameData);
  return { ok: true, to: next.n, arrived };
}
