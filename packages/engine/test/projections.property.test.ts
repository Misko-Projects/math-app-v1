// 04 §8 / 02 §4.3 projection properties over the fixture GameData: order independence,
// incremental = full fold, the inventory never negative, buildings never un-built.

import {
  type AnyEventEnvelope,
  collectionStateSchema,
  inventoryStateSchema,
  islandStateSchema,
  weeklyGoalStateSchema,
} from '@number-island/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyCollectionEvent, foldCollection, initCollection } from '../src/folds/collection';
import { applyGoalsEvent, foldGoals, initGoals } from '../src/folds/goals';
import { applyInventoryEvent, foldInventory, initInventory } from '../src/folds/inventory';
import { applyIslandEvent, foldIsland, initIsland } from '../src/folds/island';
import { sortEvents } from '../src/folds/order';
import { createRng } from '../src/rng';
import { fixtureGameData } from './fixture';
import { CHILD_1, CHILD_2 } from './support/events';
import { randomIslandEvent } from './support/island-events';

const game = fixtureGameData();
const settings = { [CHILD_1]: { weeklyGoal: 3 }, [CHILD_2]: { weeklyGoal: 5 } };
const T0 = Date.UTC(2026, 10, 2, 16);

const logArb = fc
  .record({ seed: fc.integer({ min: 1, max: 1_000_000 }), size: fc.integer({ min: 0, max: 120 }) })
  .map(({ seed, size }) => {
    const rng = createRng(seed);
    return Array.from({ length: size }, (_, i) =>
      randomIslandEvent(game, rng, seed * 1_000 + i, T0 + rng.int(0, 60) * 3_600_000),
    );
  });

const folds = {
  inventory: (events: readonly AnyEventEnvelope[]) => foldInventory(events),
  island: (events: readonly AnyEventEnvelope[]) => foldIsland(events, game),
  collection: (events: readonly AnyEventEnvelope[]) => foldCollection(events, game),
  goals: (events: readonly AnyEventEnvelope[]) => foldGoals(events, settings),
};

function incremental(events: readonly AnyEventEnvelope[]) {
  let inventory = initInventory();
  let island = initIsland(game);
  let collection = initCollection(game);
  let goals = initGoals();
  for (const e of sortEvents(events)) {
    inventory = applyInventoryEvent(inventory, e);
    island = applyIslandEvent(island, e, game);
    collection = applyCollectionEvent(collection, e, game);
    goals = applyGoalsEvent(goals, e, settings);
  }
  return { inventory, island, collection, goals };
}

describe('projection fold properties (fixture GameData)', () => {
  for (const [name, fold] of Object.entries(folds)) {
    it(`${name}: order-independent for the same event set`, () => {
      fc.assert(
        fc.property(logArb, fc.integer(), (events, seed) => {
          expect(fold(createRng(seed).shuffle(events))).toEqual(fold(events));
        }),
        { numRuns: 200 },
      );
    });
  }

  it('applyXEvent incrementally equals every full fold', () => {
    fc.assert(
      fc.property(logArb, (events) => {
        expect(incremental(events)).toEqual({
          inventory: folds.inventory(events),
          island: folds.island(events),
          collection: folds.collection(events),
          goals: folds.goals(events),
        });
      }),
      { numRuns: 200 },
    );
  });

  it('the inventory never goes negative, at any point of the log', () => {
    fc.assert(
      fc.property(logArb, (events) => {
        let state = initInventory();
        for (const e of sortEvents(events)) {
          state = applyInventoryEvent(state, e);
          for (const n of Object.values(state.materials)) expect(n).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('buildings are never un-built or downgraded; road, rings and residents never shrink', () => {
    fc.assert(
      fc.property(logArb, (events) => {
        let prev = initIsland(game);
        for (const e of sortEvents(events)) {
          const next = applyIslandEvent(prev, e, game);
          for (const [id, b] of Object.entries(prev.buildings)) {
            const after = next.buildings[id];
            expect(after?.buildingId).toBe(b.buildingId);
            expect(after?.plot).toEqual(b.plot);
            expect(after?.level ?? 0).toBeGreaterThanOrEqual(b.level);
          }
          expect(next.roadLength).toBeGreaterThanOrEqual(prev.roadLength);
          expect(next.ringsUnlocked).toBeGreaterThanOrEqual(prev.ringsUnlocked);
          expect(Object.keys(next.residents)).toEqual(
            expect.arrayContaining(Object.keys(prev.residents)),
          );
          prev = next;
        }
      }),
      { numRuns: 200 },
    );
  });

  it('a building placed anywhere in the log survives the whole fold', () => {
    fc.assert(
      fc.property(logArb, (events) => {
        const island = folds.island(events);
        for (const e of events) {
          if (e.type === 'building.placed') {
            expect(
              island.buildings[(e.payload as { instanceId: string }).instanceId],
            ).toBeDefined();
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('every projection stays inside its 02 §5.8 schema', () => {
    fc.assert(
      fc.property(logArb, (events) => {
        expect(inventoryStateSchema.safeParse(folds.inventory(events)).error?.issues ?? []).toEqual(
          [],
        );
        expect(islandStateSchema.safeParse(folds.island(events)).error?.issues ?? []).toEqual([]);
        expect(
          collectionStateSchema.safeParse(folds.collection(events)).error?.issues ?? [],
        ).toEqual([]);
        expect(weeklyGoalStateSchema.safeParse(folds.goals(events)).error?.issues ?? []).toEqual(
          [],
        );
      }),
      { numRuns: 100 },
    );
  });

  it('a tombstone anywhere purges the child from every projection, in any id casing', () => {
    fc.assert(
      fc.property(logArb, fc.integer({ min: 0, max: 60 }), fc.boolean(), (events, at, upper) => {
        const tomb = {
          ...(events[0] ?? randomIslandEvent(game, createRng(1), 1, T0)),
          id: '019a0000-0000-7000-8000-ffffffffffff',
          childId: null,
          ts: T0 + at * 3_600_000,
          type: 'child.deleted',
          payload: { childId: upper ? CHILD_2.toUpperCase() : CHILD_2 },
        } as AnyEventEnvelope;
        const purged = [...events.filter((e) => e.childId !== CHILD_2), tomb];
        const withTomb = [...events, tomb];
        for (const fold of Object.values(folds)) expect(fold(withTomb)).toEqual(fold(purged));
        const key = CHILD_2.toLowerCase();
        expect(folds.inventory(withTomb).producedByChild[key]).toBeUndefined();
        expect(folds.collection(withTomb).badges[key]).toBeUndefined();
        expect(folds.goals(withTomb).byChild[key]).toBeUndefined();
        for (const b of Object.values(folds.island(withTomb).buildings)) {
          expect(b.placedBy).not.toBe(CHILD_2);
        }
        // Incrementally, the client purges and rebuilds (D01); applying the purged log one
        // event at a time equals the full fold.
        expect(incremental(sortEvents(purged))).toEqual(
          incremental(withTomb.filter((e) => e.childId !== CHILD_2)),
        );
      }),
      { numRuns: 100 },
    );
  });

  it('weekly progress never decreases within a week', () => {
    fc.assert(
      fc.property(logArb, (events) => {
        let prev = initGoals();
        for (const e of sortEvents(events)) {
          const next = applyGoalsEvent(prev, e, settings);
          for (const [child, g] of Object.entries(prev.byChild)) {
            const after = next.byChild[child];
            if (after?.weekStart === g.weekStart)
              expect(after.progress).toBeGreaterThanOrEqual(g.progress);
            expect(after?.weeksCompleted ?? 0).toBeGreaterThanOrEqual(g.weeksCompleted);
          }
          prev = next;
        }
      }),
      { numRuns: 100 },
    );
  });
});
