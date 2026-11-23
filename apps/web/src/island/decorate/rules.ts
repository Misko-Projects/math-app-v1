// Decorate mode's rules (05 §6 "Decor", §8 "Non-math time cap"; #22 part 4). Framework-free.
//
// - The decor cap: the family has on the island at most what it owns of each decor
//   (`foldCollection.decorOwned`: the starters, and what buildings, festivals, gifts and requests
//   with challenge items earned). An owned piece has a fixed instance id, `<decorId>-<n>` with
//   n from 1 to the count owned. Two tablets that place the same piece while apart therefore
//   write the same instance, and `foldIsland` keeps one of it (the later place wins): the cap
//   holds across devices with the fold as it is.
// - What stands: an owned instance whose footprint lies on open land, off every plot the road
//   uses and clear of every building and of the decor that stood before it (by time, then id).
//   Anything else in the fold is not drawn and is back in the tray: a piece a building was put
//   on from another tablet, or an instance the family does not own.
// - The time cap: the time outside workshops (the island: building, decorating, walking) may be
//   at most a quarter of the session's active time so far. Decorating is open while some of that
//   is left; each request played earns more.

import type { CollectionState, DecorId, GameData, IslandState, Plot } from '@number-island/shared';
import { footprintPlots, freeAnchors } from '../building/rules';

/** The share of a session's active time that may be spent outside workshops (05 §8). */
export const NON_MATH_SHARE = 0.25;

/**
 * How much longer the child may stay on the island before the cap, in milliseconds of active
 * time: `islandMs` of the session's `activeMs` were spent there so far. 0 when the cap is reached.
 */
export function nonMathLeft(activeMs: number, islandMs: number): number {
  return Math.max(0, (NON_MATH_SHARE * activeMs - islandMs) / (1 - NON_MATH_SHARE));
}

export type DecorDef = GameData['decor'][number];

export const decorInstanceId = (decorId: DecorId, n: number) => `${decorId}-${n}`;

/** One owned piece of decor: where it stands, or null while it is in the tray. */
export interface DecorItem {
  instanceId: string;
  def: DecorDef;
  pos: Plot | null;
}

const key = (p: Plot) => `${p[0]},${p[1]}`;

type Data = Pick<GameData, 'island' | 'buildings' | 'decor'>;
type Island = Pick<IslandState, 'ringsUnlocked' | 'buildings' | 'decor'>;

/** Every plot a 1 × 1 piece could stand on: open land, off the road, clear of every building. */
const openPlots = (gameData: Data, island: Island) =>
  new Set(freeAnchors(gameData, island, [1, 1]).map(key));

/** Every piece the family owns, in GameData order, with where it stands. */
export function decorItems(
  gameData: Data,
  island: Island,
  collection: Pick<CollectionState, 'decorOwned'>,
): DecorItem[] {
  const items: DecorItem[] = gameData.decor.flatMap((def) =>
    Array.from({ length: collection.decorOwned[def.id] ?? 0 }, (_, i) => ({
      instanceId: decorInstanceId(def.id, i + 1),
      def,
      pos: null,
    })),
  );
  const byInstance = new Map(items.map((item) => [item.instanceId, item]));
  const free = openPlots(gameData, island);
  const placed = Object.entries(island.decor)
    .map(([instanceId, d]) => ({ instanceId, ...d }))
    .sort((a, b) => a.ts - b.ts || (a.instanceId < b.instanceId ? -1 : 1));
  for (const d of placed) {
    const item = byInstance.get(d.instanceId);
    if (!item || item.def.id !== d.decorId) continue;
    const plots = footprintPlots(d.pos, item.def.footprint).map(key);
    if (!plots.every((p) => free.has(p))) continue;
    for (const p of plots) free.delete(p);
    item.pos = [d.pos[0], d.pos[1]];
  }
  return items;
}

/**
 * The top-left plots where `item` fits now: open land, off the road, clear of every building and
 * of every other piece that stands (its own plots count as free: it can be moved a little).
 */
export function decorAnchors(
  gameData: Data,
  island: Island,
  items: readonly DecorItem[],
  item: DecorItem,
): Plot[] {
  const free = openPlots(gameData, island);
  for (const other of items) {
    if (other.instanceId === item.instanceId || other.pos === null) continue;
    for (const p of footprintPlots(other.pos, other.def.footprint)) free.delete(key(p));
  }
  return freeAnchors(gameData, island, [1, 1]).filter(
    (plot) =>
      footprintPlots(plot, item.def.footprint).every((p) => free.has(key(p))) &&
      !(item.pos && item.pos[0] === plot[0] && item.pos[1] === plot[1]),
  );
}
