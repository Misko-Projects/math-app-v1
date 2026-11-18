// foldInventory (02 §4.3): the family-wide Storehouse. Each material is clamped at 0, so a
// concurrent sibling spend can at worst make a build "free", never negative.

import type { AnyEventEnvelope, ChildId, InventoryState, Recipe } from '@number-island/shared';
import { isEvent, sortEvents } from './order';
import { own } from './records';
import { childKey, fromDeletedChild } from './tombstones';

/** Private bookkeeping: the lower-case ids of tombstoned children (08 §4). */
export type EngineInventoryState = InventoryState & { _deleted?: string[] };

export function initInventory(): EngineInventoryState {
  return { materials: {}, producedByChild: {} };
}

const amounts = (r: Recipe): [string, number][] =>
  Object.entries(r)
    .filter((kv): kv is [string, number] => typeof kv[1] === 'number' && kv[1] > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

export function applyInventoryEvent(
  state: EngineInventoryState,
  e: AnyEventEnvelope,
): EngineInventoryState {
  if (fromDeletedChild(state._deleted, e)) return state;
  if (isEvent(e, 'material.produced')) {
    const produced = amounts(e.payload.materials);
    if (produced.length === 0) return state;
    const materials = { ...state.materials };
    for (const [m, n] of produced) materials[m] = (own(materials, m) ?? 0) + n;
    let producedByChild = state.producedByChild;
    if (e.childId !== null) {
      const key = childKey(e.childId);
      const mine: Recipe = { ...(own(state.producedByChild, key) ?? {}) };
      for (const [m, n] of produced) mine[m] = (own(mine, m) ?? 0) + n;
      producedByChild = { ...state.producedByChild, [key]: mine };
    }
    return { ...state, materials, producedByChild };
  }
  if (isEvent(e, 'material.spent')) {
    const materials = { ...state.materials };
    for (const [m, n] of amounts(e.payload.materials))
      materials[m] = Math.max(0, (own(materials, m) ?? 0) - n);
    return { ...state, materials };
  }
  if (isEvent(e, 'child.deleted')) {
    const key = childKey(e.payload.childId);
    if (state._deleted?.includes(key)) return state;
    const { [key as ChildId]: _gone, ...rest } = state.producedByChild;
    return { ...state, producedByChild: rest, _deleted: [...(state._deleted ?? []), key].sort() };
  }
  return state;
}

export function foldInventory(events: readonly AnyEventEnvelope[]): EngineInventoryState {
  return sortEvents(events).reduce(applyInventoryEvent, initInventory());
}
