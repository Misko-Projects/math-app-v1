// foldCollection (02 §4.3): Pebblings collected (arrived), decor owned, family-wide outfits and
// mastery badges. Collection grows from building and helping, never from random draws (05 §5).
// Readings fixed by E02 are listed in 02 §4.3.

import type {
  AnyEventEnvelope,
  BuildingId,
  ChildId,
  CollectionState,
  DecorId,
  GameData,
} from '@number-island/shared';
import { decorIdSchema, residentIdSchema, skillIdSchema } from '@number-island/shared';
import { z } from 'zod';
import { eventTime, isEvent, sortEvents } from './order';

const outfitOptionSchema = z.string().min(1);

import { has, own } from './records';
import { childKey, fromDeletedChild } from './tombstones';
import { evaluateUnlock } from './unlock';

/** Private bookkeeping (02 §5.8 allows `_`-prefixed fields). */
export type EngineCollectionState = CollectionState & {
  /** gift id → its decor, from `gift.left`; and the gifts already opened. */
  _gifts?: Record<string, DecorId | null>;
  _giftsOpened?: string[];
  /** building instance → building id and the highest level whose unlocks were granted. */
  _instances?: Record<string, { buildingId: BuildingId; level: number }>;
  _pendingUpgrades?: Record<string, number>;
  _roadLength?: number;
  /** Lower-case ids of tombstoned children (08 §4). */
  _deleted?: string[];
};

export function initCollection(gameData: GameData): EngineCollectionState {
  const decorOwned: Record<DecorId, number> = {};
  for (const d of gameData.decor) if (d.source === 'starter') decorOwned[d.id] = 1;
  return withOutfits({ residents: [], decorOwned, outfitsUnlocked: [], badges: {} }, gameData);
}

const addDecor = (
  owned: Record<DecorId, number>,
  ids: readonly DecorId[],
): Record<DecorId, number> => {
  if (ids.length === 0) return owned;
  const next = { ...owned };
  for (const id of ids) next[id] = (own(next, id) ?? 0) + 1;
  return next;
};

const addUnique = (xs: string[], id: string): string[] => (xs.includes(id) ? xs : [...xs, id]);

const GRANT_ID: Record<
  'resident' | 'decor' | 'outfit' | 'badge',
  { safeParse(v: unknown): { success: boolean } }
> = {
  resident: residentIdSchema,
  decor: decorIdSchema,
  outfit: outfitOptionSchema,
  badge: skillIdSchema,
};
const validGrant = (kind: keyof typeof GRANT_ID, id: string) =>
  GRANT_ID[kind].safeParse(id).success;

/** Grants a building level's `unlocks` (`decor:<id>`, `outfit:<option>`; residents arrive by event). */
function grantLevels(
  state: EngineCollectionState,
  gameData: GameData,
  buildingId: BuildingId,
  from: number,
  to: number,
): EngineCollectionState {
  const def = gameData.buildings.find((b) => b.id === buildingId);
  if (!def || to <= from) return state;
  let next = state;
  for (const level of def.levels) {
    if (level.level <= from || level.level > to) continue;
    for (const u of level.unlocks) {
      const [kind, id] = [u.slice(0, u.indexOf(':')), u.slice(u.indexOf(':') + 1)];
      if (kind === 'decor') next = { ...next, decorOwned: addDecor(next.decorOwned, [id]) };
      if (kind === 'outfit')
        next = { ...next, outfitsUnlocked: addUnique(next.outfitsUnlocked, id) };
    }
  }
  return next;
}

/** Outfits whose unlock rule the collection's own facts satisfy (buildings, road, residents, badges). */
function withOutfits(state: EngineCollectionState, gameData: GameData): EngineCollectionState {
  const buildings: Record<BuildingId, number> = {};
  for (const i of Object.values(state._instances ?? {})) {
    buildings[i.buildingId] = Math.max(own(buildings, i.buildingId) ?? 0, i.level);
  }
  const facts = {
    buildings,
    roadLength: state._roadLength ?? 0,
    residentCount: state.residents.length,
    maxMasteredCount: Math.max(0, ...Object.values(state.badges).map((b) => b.length)),
  };
  let outfits = state.outfitsUnlocked;
  for (const o of gameData.outfits) {
    if (!outfits.includes(o.option) && evaluateUnlock(o.unlock, facts))
      outfits = [...outfits, o.option];
  }
  return outfits === state.outfitsUnlocked ? state : { ...state, outfitsUnlocked: outfits };
}

export function applyCollectionEvent(
  state: EngineCollectionState,
  e: AnyEventEnvelope,
  gameData: GameData,
): EngineCollectionState {
  if (fromDeletedChild(state._deleted, e)) return state;
  const next = applyRaw(state, e, gameData);
  return next === state ? state : withOutfits(next, gameData);
}

function applyRaw(
  state: EngineCollectionState,
  e: AnyEventEnvelope,
  gameData: GameData,
): EngineCollectionState {
  if (isEvent(e, 'resident.arrived')) {
    const residents = addUnique(state.residents, e.payload.residentId);
    return residents === state.residents ? state : { ...state, residents };
  }
  if (isEvent(e, 'building.placed')) {
    const { instanceId, buildingId } = e.payload;
    if (own(state._instances, instanceId)) return state;
    const level = own(state._pendingUpgrades, instanceId) ?? 1;
    const placed = {
      ...state,
      _instances: { ...state._instances, [instanceId]: { buildingId, level } },
    };
    return grantLevels(placed, gameData, buildingId, 0, level);
  }
  if (isEvent(e, 'building.upgraded')) {
    const { instanceId, level } = e.payload;
    const inst = own(state._instances, instanceId);
    if (!inst) {
      const prev = own(state._pendingUpgrades, instanceId) ?? 1;
      return level > prev
        ? { ...state, _pendingUpgrades: { ...state._pendingUpgrades, [instanceId]: level } }
        : state;
    }
    if (level <= inst.level) return state;
    const upgraded = {
      ...state,
      _instances: { ...state._instances, [instanceId]: { ...inst, level } },
    };
    return grantLevels(upgraded, gameData, inst.buildingId, inst.level, level);
  }
  if (isEvent(e, 'road.extended')) {
    return e.payload.to > (state._roadLength ?? 0)
      ? { ...state, _roadLength: e.payload.to }
      : state;
  }
  if (isEvent(e, 'festival.completed')) {
    return { ...state, decorOwned: addDecor(state.decorOwned, e.payload.rewardDecor) };
  }
  if (isEvent(e, 'gift.left')) {
    if (has(state._gifts, e.payload.giftId)) return state;
    const gifts = { ...state._gifts, [e.payload.giftId]: e.payload.decorId };
    // A gift opened before its `gift.left` arrived (clock skew) grants its decor now.
    if (state._giftsOpened?.includes(e.payload.giftId) && e.payload.decorId) {
      return {
        ...state,
        _gifts: gifts,
        decorOwned: addDecor(state.decorOwned, [e.payload.decorId]),
      };
    }
    return { ...state, _gifts: gifts };
  }
  if (isEvent(e, 'gift.opened')) {
    if (state._giftsOpened?.includes(e.payload.giftId)) return state;
    const decor = own(state._gifts, e.payload.giftId);
    return {
      ...state,
      _giftsOpened: [...(state._giftsOpened ?? []), e.payload.giftId],
      ...(decor ? { decorOwned: addDecor(state.decorOwned, [decor]) } : {}),
    };
  }
  if (isEvent(e, 'collection.unlocked')) {
    const { kind, id } = e.payload;
    // The event schema accepts any id; only ids of the kind's grammar enter the projection, so the
    // state always satisfies collectionStateSchema and stray ids never count toward unlocks.
    if (!validGrant(kind, id)) return state;
    if (kind === 'resident') {
      const residents = addUnique(state.residents, id);
      return residents === state.residents ? state : { ...state, residents };
    }
    if (kind === 'decor') return { ...state, decorOwned: addDecor(state.decorOwned, [id]) };
    if (kind === 'outfit') {
      const outfitsUnlocked = addUnique(state.outfitsUnlocked, id);
      return outfitsUnlocked === state.outfitsUnlocked ? state : { ...state, outfitsUnlocked };
    }
    // Badge: a mastery moment of the envelope's child (05 §7); the first one per skill counts.
    if (e.childId === null) return state;
    const key = childKey(e.childId);
    const mine = own(state.badges, key) ?? [];
    if (mine.some((b) => b.skillId === id)) return state;
    return {
      ...state,
      badges: { ...state.badges, [key]: [...mine, { skillId: id, ts: eventTime(e) }] },
    };
  }
  if (isEvent(e, 'child.deleted')) {
    const key = childKey(e.payload.childId);
    if (state._deleted?.includes(key)) return state;
    const { [key as ChildId]: _gone, ...badges } = state.badges;
    return { ...state, badges, _deleted: [...(state._deleted ?? []), key].sort() };
  }
  return state;
}

export function foldCollection(
  events: readonly AnyEventEnvelope[],
  gameData: GameData,
): EngineCollectionState {
  let state = initCollection(gameData);
  for (const e of sortEvents(events)) state = applyCollectionEvent(state, e, gameData);
  return state;
}
