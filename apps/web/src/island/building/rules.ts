// Building, upgrades and the Numbered Road's next stone (05 §3, §4 rules 7–8, §6; #22 part 2):
// what the family may build now, what each recipe still needs, where a building fits, and how a
// locked building unlocks. Everything is read from GameData and the family's projections, and
// every rule is family-wide. Framework-free.
//
// - One building per `BuildingDef`: its instance id is the building's id, so two devices that
//   place the same building while apart end with one building (`foldIsland` keeps the first).
// - A new building needs its `UnlockRule` to hold, its level-1 recipe in the Storehouse, and a
//   place where its footprint fits: open land, off every plot the road will ever use, clear of
//   what stands. A built one buys its next level (to 3) with that level's recipe; a building that
//   stands never locks again.
// - The road: the next stone costs `ROAD_STONE_COST` of `ROAD_MATERIAL` and must lie on open land.

import { evaluateUnlock, type UnlockFacts } from '@number-island/engine/shell';
import type {
  BuildingDef,
  BuildingId,
  GameData,
  InventoryState,
  IslandState,
  MaterialId,
  Plot,
  Recipe,
  UnlockRule,
} from '@number-island/shared';

/** The material a road stone is made of (05 §4: the Road Crew's product). */
export const ROAD_MATERIAL: MaterialId = 'stone';
/** What one road stone costs, in `ROAD_MATERIAL`. Not in game data yet: the one place it is set. */
export const ROAD_STONE_COST = 1;

/** One line of a recipe: what it asks for and how much of that the family has. */
export interface RecipeNeed {
  materialId: MaterialId;
  need: number;
  /** The part of `need` that is in the Storehouse (never more than `need`). */
  have: number;
  missing: number;
}

/** A recipe against the Storehouse, in GameData's material order; zero amounts are left out. */
export function recipeNeeds(
  gameData: Pick<GameData, 'materials'>,
  recipe: Recipe,
  inventory: Pick<InventoryState, 'materials'>,
): RecipeNeed[] {
  return gameData.materials.flatMap((m) => {
    const need = Math.max(0, Math.floor(recipe[m.id] ?? 0));
    if (need === 0) return [];
    const have = Math.min(need, Math.max(0, Math.floor(inventory.materials[m.id] ?? 0)));
    return [{ materialId: m.id, need, have, missing: need - have }];
  });
}

export const affordable = (needs: readonly RecipeNeed[]) => needs.every((n) => n.missing === 0);

/** What a locked building waits for, as something a picture can show. */
export type RuleHint =
  | { kind: 'building'; buildingId: BuildingId; level: 1 | 2 | 3 }
  | { kind: 'road'; length: number }
  | { kind: 'residents'; count: number }
  /** A learner rule (a skill, a grade, a number of mastered skills): more play opens it. */
  | { kind: 'practice' };

const hintKey = (h: RuleHint) => JSON.stringify(h);

/**
 * The parts of `rule` that do not hold yet. `all` lists every unmet part; `any` lists its
 * alternative with the fewest (the first of those), which is the shortest way in.
 */
export function unmetHints(rule: UnlockRule, facts: UnlockFacts): RuleHint[] {
  if (evaluateUnlock(rule, facts)) return [];
  if ('all' in rule) {
    const seen = new Map<string, RuleHint>();
    for (const r of rule.all) for (const h of unmetHints(r, facts)) seen.set(hintKey(h), h);
    return [...seen.values()];
  }
  if ('any' in rule) {
    let best: RuleHint[] | null = null;
    for (const r of rule.any) {
      const hints = unmetHints(r, facts);
      if (best === null || hints.length < best.length) best = hints;
    }
    return best ?? [];
  }
  if ('building' in rule)
    return [{ kind: 'building', buildingId: rule.building, level: rule.level ?? 1 }];
  if ('roadLength' in rule) return [{ kind: 'road', length: rule.roadLength }];
  if ('residentCount' in rule) return [{ kind: 'residents', count: rule.residentCount }];
  return [{ kind: 'practice' }];
}

const key = (p: Plot) => `${p[0]},${p[1]}`;

/** Every plot a footprint covers from its top-left plot. */
export function footprintPlots(plot: Plot, footprint: readonly [number, number]): Plot[] {
  const out: Plot[] = [];
  for (let dy = 0; dy < footprint[1]; dy++)
    for (let dx = 0; dx < footprint[0]; dx++) out.push([plot[0] + dx, plot[1] + dy]);
  return out;
}

/**
 * The top-left plots where `footprint` fits (05 §6 "tap a highlighted plot"): all of it on open
 * land, off every plot the road uses (laid or not), and clear of every building. Rows from the
 * back, west to east.
 */
export function freeAnchors(
  gameData: Pick<GameData, 'island' | 'buildings'>,
  island: Pick<IslandState, 'ringsUnlocked' | 'buildings'>,
  footprint: readonly [number, number],
): Plot[] {
  const land = gameData.island.rings.slice(0, island.ringsUnlocked).flatMap((r) => r.plots);
  const taken = new Set(gameData.island.road.map((s) => key(s.plot)));
  for (const b of Object.values(island.buildings)) {
    const def = gameData.buildings.find((d) => d.id === b.buildingId);
    for (const p of footprintPlots(b.plot, def?.footprint ?? [1, 1])) taken.add(key(p));
  }
  const free = new Set(land.map(key).filter((k) => !taken.has(k)));
  return land
    .filter((p) => footprintPlots(p, footprint).every((q) => free.has(key(q))))
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** A building as the island has it: its instance, or null when it does not stand. */
export function builtInstance(
  island: Pick<IslandState, 'buildings'>,
  buildingId: BuildingId,
): { instanceId: string; level: 1 | 2 | 3; plot: Plot } | null {
  let best: { instanceId: string; level: 1 | 2 | 3; plot: Plot } | null = null;
  for (const [instanceId, b] of Object.entries(island.buildings)) {
    if (b.buildingId !== buildingId) continue;
    if (best === null || b.level > best.level) best = { instanceId, level: b.level, plot: b.plot };
  }
  return best;
}

export type BuildCardState =
  /** Can be bought now. */
  | 'ready'
  /** Unlocked, but the Storehouse is short. */
  | 'short'
  /** Unlocked and paid for, but nowhere fits it yet. */
  | 'no-room'
  /** Its rule does not hold yet. */
  | 'locked';

/** One thing the build sheet offers: a new building, or the next level of one that stands. */
export interface BuildCard {
  building: BuildingDef;
  /** The instance that stands, or null for a new building. */
  instanceId: string | null;
  /** The level this card buys. */
  level: 1 | 2 | 3;
  recipe: Recipe;
  state: BuildCardState;
  needs: RecipeNeed[];
  /** Why it is locked (empty unless `locked`). */
  hints: RuleHint[];
  /** Where a new building fits (empty for an upgrade). */
  anchors: Plot[];
}

const ORDER: Record<BuildCardState, number> = { ready: 0, short: 1, 'no-room': 2, locked: 3 };

/**
 * The build sheet's cards: what can be bought first, then what is short (the least missing
 * first), then what has no room, then what is locked; otherwise in GameData order. A building at
 * level 3 has nothing left to buy and is left out.
 */
export function buildCards(
  gameData: Pick<GameData, 'buildings' | 'materials' | 'island'>,
  island: Pick<IslandState, 'ringsUnlocked' | 'buildings'>,
  inventory: Pick<InventoryState, 'materials'>,
  facts: UnlockFacts,
): BuildCard[] {
  const cards: BuildCard[] = [];
  for (const building of gameData.buildings) {
    const built = builtInstance(island, building.id);
    const level = built ? built.level + 1 : 1;
    const def = building.levels.find((l) => l.level === level);
    if (!def) continue;
    const needs = recipeNeeds(gameData, def.recipe, inventory);
    const base = {
      building,
      instanceId: built?.instanceId ?? null,
      level: def.level,
      recipe: def.recipe,
      needs,
    };
    if (built) {
      cards.push({ ...base, state: affordable(needs) ? 'ready' : 'short', hints: [], anchors: [] });
      continue;
    }
    const hints = unmetHints(building.unlock, facts);
    if (hints.length > 0) {
      cards.push({ ...base, state: 'locked', hints, anchors: [] });
      continue;
    }
    const anchors = freeAnchors(gameData, island, building.footprint);
    const state = !affordable(needs) ? 'short' : anchors.length === 0 ? 'no-room' : 'ready';
    cards.push({ ...base, state, hints: [], anchors });
  }
  // Among the short ones, the one closest to being paid for comes first.
  const left = (card: BuildCard) =>
    card.state === 'short' ? card.needs.reduce((sum, n) => sum + n.missing, 0) : 0;
  return cards
    .map((card, i) => ({ card, i }))
    .sort(
      (a, b) =>
        ORDER[a.card.state] - ORDER[b.card.state] || left(a.card) - left(b.card) || a.i - b.i,
    )
    .map(({ card }) => card);
}

/** The road's next stone, when it can be laid at all: the first one past the road, on open land. */
export function nextStone(
  gameData: Pick<GameData, 'island'>,
  island: Pick<IslandState, 'ringsUnlocked' | 'roadLength'>,
): { n: number; plot: Plot } | null {
  const next = gameData.island.road.find((s) => s.n > island.roadLength);
  if (!next) return null;
  const land = new Set(
    gameData.island.rings
      .slice(0, island.ringsUnlocked)
      .flatMap((r) => r.plots)
      .map(key),
  );
  return land.has(key(next.plot)) ? next : null;
}

/** How many stones the walk along the road counts: the new stone and the few before it. */
export const COUNT_ON = 5;

/** The stones counted aloud when the road reaches `to`: counting on, ending on the new stone. */
export function countingWalk(gameData: Pick<GameData, 'island'>, to: number): number[] {
  const laid = gameData.island.road.map((s) => s.n).filter((n) => n <= to);
  return laid.slice(-COUNT_ON);
}
