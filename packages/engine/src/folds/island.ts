// foldIsland (02 §4.3): the shared island. A standing building is never un-built and its level
// never goes down. Two buildings never share a plot: a `building.placed` whose footprint overlaps
// a standing building does not apply, so of two placements made offline on the same plots the
// first by ts then id stands and the other is kept as displaced (`displacedPlacements`) for the
// app to tell its child. Decor positions are last-writer-wins by ts then id; the road keeps its
// maximum; rings unlock as their rules hold and never re-lock. Readings fixed by E02 are listed
// in 02 §4.3.

import type {
  AnyEventEnvelope,
  BuildingId,
  ChildId,
  GameData,
  IslandState,
  Recipe,
} from '@number-island/shared';
import { eventTime, isEvent, sameId, sortEvents } from './order';
import { own } from './records';
import { childKey, fromDeletedChild } from './tombstones';
import { evaluateUnlock, type UnlockFacts } from './unlock';

/** Private bookkeeping (02 §5.8 allows `_`-prefixed fields): events that arrived before their target. */
export type EngineIslandState = IslandState & {
  _upgrades?: Record<string, 2 | 3>;
  _giftsOpened?: string[];
  _reached?: Record<string, number>;
  _lastPlayDay?: string | null;
  /** Lower-case ids of tombstoned children (08 §4). */
  _deleted?: string[];
  /** Placements that lost their plots to an earlier one, by instance id. */
  _displaced?: Record<string, DisplacedPlacement>;
};

/** A `building.placed` that did not apply because its plots were already built on. */
export interface DisplacedPlacement {
  buildingId: BuildingId;
  plot: [number, number];
  placedBy: ChildId | null;
  ts: number;
}

/** The placements that lost their plots, oldest first (ts, then instance id). */
export function displacedPlacements(
  state: EngineIslandState,
): (DisplacedPlacement & { instanceId: string })[] {
  return Object.entries(state._displaced ?? {})
    .map(([instanceId, d]) => ({ instanceId, ...d }))
    .sort((a, b) => a.ts - b.ts || (a.instanceId < b.instanceId ? -1 : 1));
}

/** Every plot a building covers from its top-left plot; a building the data lacks covers one. */
function covered(gameData: GameData, buildingId: BuildingId, plot: readonly number[]): string[] {
  const [w, h] = gameData.buildings.find((b) => b.id === buildingId)?.footprint ?? [1, 1];
  const [x = 0, y = 0] = plot;
  const out: string[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push(`${x + dx},${y + dy}`);
  return out;
}

export function initIsland(gameData: GameData): EngineIslandState {
  const state: EngineIslandState = {
    name: null,
    ringsUnlocked: 0,
    roadLength: 0,
    buildings: {},
    decor: {},
    residents: {},
    projects: {},
    festival: { active: null, completed: 0, daysOfPlaySinceLast: 0 },
    giftsPending: [],
    milestones: {},
  };
  return withRings(state, gameData);
}

/** The island facts unlock rules read (02 §5.8 UnlockRule), from an island state. */
export function islandFacts(state: IslandState): UnlockFacts {
  const buildings: Record<BuildingId, number> = {};
  for (const b of Object.values(state.buildings)) {
    buildings[b.buildingId] = Math.max(own(buildings, b.buildingId) ?? 0, b.level);
  }
  return {
    buildings,
    roadLength: state.roadLength,
    residentCount: Object.keys(state.residents).length,
  };
}

function withRings(state: EngineIslandState, gameData: GameData): EngineIslandState {
  const facts = islandFacts(state);
  let n = 0;
  for (const ring of gameData.island.rings) {
    if (!evaluateUnlock(ring.unlock, facts)) break;
    n += 1;
  }
  return n > state.ringsUnlocked ? { ...state, ringsUnlocked: n } : state;
}

const utcDay = (ts: number) => new Date(ts).toISOString().slice(0, 10);

const total = (r: Recipe) =>
  Object.values(r).reduce<number>((s, n) => s + (typeof n === 'number' && n > 0 ? n : 0), 0);

export function applyIslandEvent(
  state: EngineIslandState,
  e: AnyEventEnvelope,
  gameData: GameData,
): EngineIslandState {
  if (fromDeletedChild(state._deleted, e)) return state;
  const next = applyRaw(state, e, gameData);
  return next === state ? state : withRings(next, gameData);
}

function applyRaw(
  state: EngineIslandState,
  e: AnyEventEnvelope,
  gameData: GameData,
): EngineIslandState {
  if (isEvent(e, 'island.named')) return { ...state, name: e.payload.name };
  if (isEvent(e, 'road.extended')) {
    return e.payload.to > state.roadLength ? { ...state, roadLength: e.payload.to } : state;
  }
  if (isEvent(e, 'building.placed')) {
    const { instanceId, buildingId, plot } = e.payload;
    if (own(state.buildings, instanceId)) return state; // placed once; never moved or rebuilt
    if (own(state._displaced, instanceId)) return state;
    const taken = new Set(
      Object.values(state.buildings).flatMap((b) => covered(gameData, b.buildingId, b.plot)),
    );
    if (covered(gameData, buildingId, plot).some((k) => taken.has(k))) {
      // Its plots are built on: the earlier placement stands (events fold in ts, then id order).
      return {
        ...state,
        _displaced: {
          ...state._displaced,
          [instanceId]: {
            buildingId,
            plot: [plot[0], plot[1]],
            placedBy: e.childId,
            ts: eventTime(e),
          },
        },
      };
    }
    const level = own(state._upgrades, instanceId) ?? 1;
    return {
      ...state,
      buildings: {
        ...state.buildings,
        [instanceId]: {
          buildingId,
          plot: [plot[0], plot[1]],
          level,
          placedBy: e.childId,
          ts: eventTime(e),
        },
      },
    };
  }
  if (isEvent(e, 'building.upgraded')) {
    const { instanceId, level } = e.payload;
    const b = own(state.buildings, instanceId);
    if (!b) {
      // The upgrade's clock ran ahead of the placement: keep it until the placement arrives.
      const prev = own(state._upgrades, instanceId) ?? 1;
      return level > prev
        ? { ...state, _upgrades: { ...state._upgrades, [instanceId]: level } }
        : state;
    }
    if (level <= b.level) return state;
    return { ...state, buildings: { ...state.buildings, [instanceId]: { ...b, level } } };
  }
  if (isEvent(e, 'decor.placed')) {
    const { instanceId, decorId, pos } = e.payload;
    return {
      ...state,
      decor: {
        ...state.decor,
        [instanceId]: { decorId, pos: [pos[0], pos[1]], placedBy: e.childId, ts: eventTime(e) },
      },
    };
  }
  if (isEvent(e, 'decor.moved')) {
    const d = own(state.decor, e.payload.instanceId);
    if (!d) return state;
    const pos = e.payload.pos;
    return {
      ...state,
      decor: {
        ...state.decor,
        [e.payload.instanceId]: { ...d, pos: [pos[0], pos[1]], ts: eventTime(e) },
      },
    };
  }
  if (isEvent(e, 'decor.removed')) {
    if (!own(state.decor, e.payload.instanceId)) return state;
    const { [e.payload.instanceId]: _gone, ...decor } = state.decor;
    return { ...state, decor };
  }
  if (isEvent(e, 'resident.arrived')) {
    if (own(state.residents, e.payload.residentId)) return state;
    return {
      ...state,
      residents: {
        ...state.residents,
        [e.payload.residentId]: {
          arrivedTs: eventTime(e),
          homeInstanceId: e.payload.homeInstanceId,
        },
      },
    };
  }
  if (isEvent(e, 'material.spent') && e.payload.purpose.kind === 'project') {
    const ref = e.payload.purpose.ref;
    const prev = own(state.projects, ref) ?? { contributed: {}, byChild: {} };
    const contributed: Recipe = { ...prev.contributed };
    for (const [m, n] of Object.entries(e.payload.materials)) {
      if (typeof n === 'number' && n > 0) contributed[m] = (own(contributed, m) ?? 0) + n;
    }
    const byChild = { ...prev.byChild };
    if (e.childId !== null) {
      const key = childKey(e.childId);
      byChild[key] = (own(byChild, key) ?? 0) + total(e.payload.materials);
    }
    return { ...state, projects: { ...state.projects, [ref]: { contributed, byChild } } };
  }
  if (isEvent(e, 'session.started')) {
    // Days of play (05 §7 festivals): distinct UTC days with a session, family-wide.
    const day = utcDay(eventTime(e));
    if (state._lastPlayDay === day) return state;
    return {
      ...state,
      _lastPlayDay: day,
      festival: { ...state.festival, daysOfPlaySinceLast: state.festival.daysOfPlaySinceLast + 1 },
    };
  }
  if (isEvent(e, 'festival.started')) {
    return {
      ...state,
      festival: {
        ...state.festival,
        active: { festivalId: e.payload.festivalId, startedTs: eventTime(e) },
      },
    };
  }
  if (isEvent(e, 'festival.completed')) {
    // Days of play restart: a session later on the same day counts as the first day since.
    return {
      ...state,
      _lastPlayDay: null,
      festival: { active: null, completed: state.festival.completed + 1, daysOfPlaySinceLast: 0 },
    };
  }
  if (isEvent(e, 'gift.left')) {
    const id = e.payload.giftId;
    if (state.giftsPending.includes(id) || state._giftsOpened?.includes(id)) return state;
    return { ...state, giftsPending: [...state.giftsPending, id] };
  }
  if (isEvent(e, 'gift.opened')) {
    const id = e.payload.giftId;
    if (state._giftsOpened?.includes(id)) return state;
    return {
      ...state,
      giftsPending: state.giftsPending.filter((g) => g !== id),
      _giftsOpened: [...(state._giftsOpened ?? []), id],
    };
  }
  if (isEvent(e, 'milestone.defined')) {
    const { milestoneId, label, trigger } = e.payload;
    const reachedTs =
      own(state.milestones, milestoneId)?.reachedTs ?? own(state._reached, milestoneId) ?? null;
    return {
      ...state,
      milestones: { ...state.milestones, [milestoneId]: { label, trigger, reachedTs } },
    };
  }
  if (isEvent(e, 'milestone.reached')) {
    const id = e.payload.milestoneId;
    const m = own(state.milestones, id);
    if (m) {
      if (m.reachedTs !== null) return state;
      return {
        ...state,
        milestones: { ...state.milestones, [id]: { ...m, reachedTs: eventTime(e) } },
      };
    }
    if (own(state._reached, id) !== undefined) return state;
    return { ...state, _reached: { ...state._reached, [id]: eventTime(e) } };
  }
  if (isEvent(e, 'child.deleted')) return forgetChild(state, e.payload.childId);
  return state;
}

/** A tombstone keeps the shared island but drops the deleted child's attributions (08 §4). */
function forgetChild(state: EngineIslandState, childId: ChildId): EngineIslandState {
  const key = childKey(childId);
  if (state._deleted?.includes(key)) return state;
  const buildings = Object.fromEntries(
    Object.entries(state.buildings).map(([k, b]) => [
      k,
      sameId(b.placedBy, childId) ? { ...b, placedBy: null } : b,
    ]),
  );
  const decor = Object.fromEntries(
    Object.entries(state.decor).map(([k, d]) => [
      k,
      sameId(d.placedBy, childId) ? { ...d, placedBy: null } : d,
    ]),
  );
  const projects = Object.fromEntries(
    Object.entries(state.projects).map(([k, p]) => {
      const { [key]: _gone, ...byChild } = p.byChild;
      return [k, { ...p, byChild }];
    }),
  );
  const deleted = [...(state._deleted ?? []), key].sort();
  const next: EngineIslandState = { ...state, buildings, decor, projects, _deleted: deleted };
  if (state._displaced) {
    // A displaced placement is only a message for its child: it goes with the child.
    next._displaced = Object.fromEntries(
      Object.entries(state._displaced).filter(([, d]) => !sameId(d.placedBy, childId)),
    );
  }
  return next;
}

export function foldIsland(
  events: readonly AnyEventEnvelope[],
  gameData: GameData,
): EngineIslandState {
  let state = initIsland(gameData);
  for (const e of sortEvents(events)) state = applyIslandEvent(state, e, gameData);
  return state;
}
