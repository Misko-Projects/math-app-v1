// 02 §4.3 projections, table-driven: inventory, island, collection, weekly goals and unlock rules.

import type {
  AnyEventEnvelope,
  EventPayloads,
  EventType,
  GameData,
  UnlockRule,
} from '@number-island/shared';
import { collectionStateSchema } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { foldCollection } from './collection';
import { foldGoals } from './goals';
import { applyInventoryEvent, foldInventory, initInventory } from './inventory';
import { applyIslandEvent, foldIsland, initIsland, islandFacts } from './island';
import { evaluateUnlock, type UnlockFacts } from './unlock';

const C1 = '019a0000-0000-7000-8000-00000000c001';
const C2 = '019a0000-0000-7000-8000-00000000c002';
const T0 = Date.UTC(2026, 10, 2, 16);
const H = 3_600_000;

let counter = 0;
function ev<T extends EventType>(
  type: T,
  payload: EventPayloads[T],
  ts: number,
  childId: string | null = C1,
): AnyEventEnvelope {
  counter += 1;
  return {
    id: `019a0000-0000-7000-8000-${counter.toString(16).padStart(12, '0')}`,
    familyId: '019a0000-0000-7000-8000-00000000f001',
    childId,
    deviceId: '019a0000-0000-7000-8000-00000000d001',
    ts,
    type,
    v: 1,
    payload,
    contentVersion: 'test',
  } as AnyEventEnvelope;
}

const game: GameData = {
  materials: [
    { id: 'stone', name: 'game.material.stone', art: 'material/stone' },
    { id: 'light', name: 'game.material.light', art: 'material/light' },
  ],
  buildings: [
    {
      id: 'road-crew',
      kind: 'workshop',
      workshopId: 'road-crew',
      art: 'b/rc',
      footprint: [2, 1],
      unlock: { start: true },
      levels: [
        { level: 1, recipe: {}, unlocks: [] },
        { level: 2, recipe: { stone: 10 }, unlocks: ['decor:shell-bench'] },
        { level: 3, recipe: { stone: 20 }, unlocks: ['outfit:hat-sailor', 'decor:flag'] },
      ],
    },
    {
      id: 'lighthouse',
      kind: 'project',
      art: 'b/lh',
      footprint: [2, 2],
      unlock: { start: true },
      shared: true,
      levels: [
        { level: 1, recipe: { stone: 20 }, unlocks: ['decor:lantern-string', 'resident:tuck'] },
      ],
    },
  ],
  residents: [],
  decor: [
    { id: 'shell-bench', art: 'd/sb', footprint: [1, 1], source: 'starter' },
    { id: 'lantern-string', art: 'd/ls', footprint: [2, 1], source: 'festival' },
    { id: 'flag', art: 'd/f', footprint: [1, 1], source: 'project' },
    { id: 'rose', art: 'd/r', footprint: [1, 1], source: 'gift' },
  ],
  outfits: [
    { option: 'hat-captain', unlock: { masteredCount: 2 } },
    { option: 'scarf', unlock: { roadLength: 30 } },
  ],
  island: {
    grid: [12, 8],
    rings: [
      { plots: [[5, 3]], unlock: { start: true } },
      { plots: [[3, 2]], unlock: { roadLength: 20 } },
      {
        plots: [[1, 1]],
        unlock: { all: [{ building: 'road-crew', level: 2 }, { residentCount: 2 }] },
      },
      { plots: [[0, 0]], unlock: { skill: 'CPS.03', atLeast: 'practiced' } },
    ],
    road: [{ n: 1, plot: [0, 7] }],
  },
  festivals: [
    { id: 'lantern-night', kind: 'festival', everyDaysOfPlay: 7, rewardDecor: ['lantern-string'] },
  ],
};

describe('foldInventory', () => {
  it.each<
    [string, AnyEventEnvelope[], Record<string, number>, Record<string, Record<string, number>>]
  >([
    ['empty', [], {}, {}],
    [
      'produce adds, by child',
      [
        ev(
          'material.produced',
          { sessionId: 's', requestId: 'r', workshopId: 'road-crew', materials: { stone: 3 } },
          T0,
        ),
      ],
      { stone: 3 },
      { [C1]: { stone: 3 } },
    ],
    [
      'family-level production has no child tag',
      [
        ev(
          'material.produced',
          { sessionId: null, requestId: null, workshopId: null, materials: { light: 2 } },
          T0,
          null,
        ),
      ],
      { light: 2 },
      {},
    ],
    [
      'spend subtracts',
      [
        ev(
          'material.produced',
          { sessionId: null, requestId: null, workshopId: null, materials: { stone: 5 } },
          T0,
        ),
        ev(
          'material.spent',
          { materials: { stone: 2 }, purpose: { kind: 'build', ref: 'x' } },
          T0 + 1,
        ),
      ],
      { stone: 3 },
      { [C1]: { stone: 5 } },
    ],
    [
      'a concurrent spend clamps at 0',
      [
        ev(
          'material.produced',
          { sessionId: null, requestId: null, workshopId: null, materials: { stone: 5 } },
          T0,
        ),
        ev(
          'material.spent',
          { materials: { stone: 4 }, purpose: { kind: 'build', ref: 'a' } },
          T0 + 1,
          C1,
        ),
        ev(
          'material.spent',
          { materials: { stone: 4 }, purpose: { kind: 'build', ref: 'b' } },
          T0 + 1,
          C2,
        ),
        ev(
          'material.produced',
          { sessionId: null, requestId: null, workshopId: null, materials: { stone: 2 } },
          T0 + 2,
        ),
      ],
      { stone: 2 },
      { [C1]: { stone: 7 } },
    ],
    [
      'spending an unknown material stays at 0',
      [ev('material.spent', { materials: { gem: 3 }, purpose: { kind: 'decor', ref: 'x' } }, T0)],
      { gem: 0 },
      {},
    ],
    [
      'zero amounts are ignored',
      [
        ev(
          'material.produced',
          { sessionId: null, requestId: null, workshopId: null, materials: { stone: 0 } },
          T0,
        ),
      ],
      {},
      {},
    ],
    [
      'a tombstone keeps shared materials, drops the tag, and ignores the child afterwards (any casing)',
      [
        ev(
          'material.produced',
          { sessionId: null, requestId: null, workshopId: null, materials: { stone: 5 } },
          T0,
          C2,
        ),
        ev(
          'material.produced',
          { sessionId: null, requestId: null, workshopId: null, materials: { stone: 1 } },
          T0 + 5,
          C2.toUpperCase(),
        ),
        ev(
          'material.produced',
          { sessionId: null, requestId: null, workshopId: null, materials: { light: 2 } },
          T0,
          C1,
        ),
        ev('child.deleted', { childId: C2 }, T0 + 1, null),
      ],
      { stone: 5, light: 2 },
      { [C1]: { light: 2 } },
    ],
  ])('%s', (_n, events, materials, producedByChild) => {
    const s = foldInventory(events);
    expect({ materials: s.materials, producedByChild: s.producedByChild }).toEqual({
      materials,
      producedByChild,
    });
  });

  it('incrementally, a tombstone drops the attribution and ignores the child from then on', () => {
    const produced = (ts: number, childId: string) =>
      ev(
        'material.produced',
        { sessionId: null, requestId: null, workshopId: null, materials: { stone: 2 } },
        ts,
        childId,
      );
    const events = [produced(T0, C2), ev('child.deleted', { childId: C2 }, T0 + 1, null)];
    const s = [...events, produced(T0 + 2, C2.toUpperCase())].reduce(
      applyInventoryEvent,
      initInventory(),
    );
    expect(s.materials).toEqual({ stone: 2 });
    expect(s.producedByChild).toEqual({});
  });
});

describe('foldIsland', () => {
  const placed = (id: string, buildingId: string, ts: number, childId: string | null = C1) =>
    ev('building.placed', { instanceId: id, buildingId, plot: [5, 3] }, ts, childId);

  it('starts with the start rings unlocked and nothing built', () => {
    const s = foldIsland([], game);
    expect(s).toMatchObject({
      name: null,
      ringsUnlocked: 1,
      roadLength: 0,
      buildings: {},
      giftsPending: [],
    });
  });

  it.each<[string, AnyEventEnvelope[], string | null]>([
    [
      'the latest name wins',
      [ev('island.named', { name: 'Shell' }, T0), ev('island.named', { name: 'Coral' }, T0 + 1)],
      'Coral',
    ],
    [
      'ts ties break by id',
      [ev('island.named', { name: 'First' }, T0), ev('island.named', { name: 'Second' }, T0)],
      'Second',
    ],
  ])('island.named: %s', (_n, events, name) => {
    expect(foldIsland(events, game).name).toBe(name);
  });

  it('the road keeps its maximum and unlocks rings that never re-lock', () => {
    const s = foldIsland(
      [ev('road.extended', { to: 25 }, T0), ev('road.extended', { to: 12 }, T0 + 1)],
      game,
    );
    expect(s.roadLength).toBe(25);
    expect(s.ringsUnlocked).toBe(2);
  });

  it('rings unlock as a prefix; skill rules need learner facts and stay locked', () => {
    const s = foldIsland(
      [
        ev('road.extended', { to: 20 }, T0),
        placed('i1', 'road-crew', T0 + 1),
        ev('building.upgraded', { instanceId: 'i1', level: 2 }, T0 + 2),
        ev('resident.arrived', { residentId: 'nib', homeInstanceId: null, via: 'start' }, T0 + 3),
        ev('resident.arrived', { residentId: 'tuck', homeInstanceId: 'i1', via: 'home' }, T0 + 4),
      ],
      game,
    );
    expect(s.ringsUnlocked).toBe(3);
  });

  it('buildings: placed once, upgrades only raise the level, never un-built', () => {
    const s = foldIsland(
      [
        placed('i1', 'road-crew', T0),
        placed('i1', 'lighthouse', T0 + 5, C2),
        ev('building.upgraded', { instanceId: 'i1', level: 3 }, T0 + 1),
        ev('building.upgraded', { instanceId: 'i1', level: 2 }, T0 + 2),
        ev('building.upgraded', { instanceId: 'nope', level: 2 }, T0 + 3),
      ],
      game,
    );
    expect(s.buildings).toEqual({
      i1: { buildingId: 'road-crew', plot: [5, 3], level: 3, placedBy: C1, ts: T0 },
    });
  });

  it('an upgrade whose clock ran ahead of its placement still applies', () => {
    const s = foldIsland(
      [
        ev('building.upgraded', { instanceId: 'i1', level: 2 }, T0),
        placed('i1', 'road-crew', T0 + 1),
      ],
      game,
    );
    expect(s.buildings.i1?.level).toBe(2);
    expect(islandFacts(s).buildings).toEqual({ 'road-crew': 2 });
  });

  it('decor: place, move (LWW by ts then id), remove; moves after removal are ignored', () => {
    const s = foldIsland(
      [
        ev('decor.placed', { instanceId: 'd1', decorId: 'rose', pos: [1, 1] }, T0),
        ev('decor.moved', { instanceId: 'd1', pos: [2, 2] }, T0 + 2),
        ev('decor.moved', { instanceId: 'd1', pos: [3, 3] }, T0 + 1),
        ev('decor.placed', { instanceId: 'd2', decorId: 'flag', pos: [4, 4] }, T0),
        ev('decor.removed', { instanceId: 'd2' }, T0 + 1),
        ev('decor.moved', { instanceId: 'd2', pos: [5, 5] }, T0 + 2),
      ],
      game,
    );
    expect(s.decor).toEqual({ d1: { decorId: 'rose', pos: [2, 2], placedBy: C1, ts: T0 + 2 } });
  });

  it('residents keep their first arrival', () => {
    const s = foldIsland(
      [
        ev('resident.arrived', { residentId: 'nib', homeInstanceId: null, via: 'start' }, T0 + 5),
        ev('resident.arrived', { residentId: 'nib', homeInstanceId: 'h', via: 'home' }, T0 + 9),
      ],
      game,
    );
    expect(s.residents).toEqual({ nib: { arrivedTs: T0 + 5, homeInstanceId: null } });
  });

  it('projects record contributions and per-child badges counts', () => {
    const spend = (childId: string, stone: number, ts: number) =>
      ev(
        'material.spent',
        { materials: { stone }, purpose: { kind: 'project', ref: 'lighthouse' } },
        ts,
        childId,
      );
    const s = foldIsland(
      [
        spend(C1, 5, T0),
        spend(C2, 3, T0 + 1),
        spend(C1, 2, T0 + 2),
        ev('material.spent', { materials: { stone: 9 }, purpose: { kind: 'build', ref: 'x' } }, T0),
      ],
      game,
    );
    expect(s.projects).toEqual({
      lighthouse: { contributed: { stone: 10 }, byChild: { [C1]: 7, [C2]: 3 } },
    });
  });

  it('festivals: days of play count distinct UTC days with a session and reset on completion', () => {
    const session = (ts: number, childId = C1) =>
      ev(
        'session.started',
        { sessionId: `s${ts}`, budgetMinutes: 10, trigger: 'child' },
        ts,
        childId,
      );
    const s1 = foldIsland(
      [session(T0), session(T0 + H, C2), session(T0 + 24 * H), session(T0 + 48 * H)],
      game,
    );
    expect(s1.festival).toEqual({ active: null, completed: 0, daysOfPlaySinceLast: 3 });
    const s2 = foldIsland(
      [
        session(T0),
        session(T0 + 24 * H),
        ev(
          'festival.started',
          { festivalId: 'lantern-night', kind: 'festival' },
          T0 + 25 * H,
          null,
        ),
        ev(
          'festival.completed',
          { festivalId: 'lantern-night', rewardDecor: ['lantern-string'] },
          T0 + 26 * H,
          null,
        ),
        session(T0 + 27 * H),
        session(T0 + 48 * H),
      ],
      game,
    );
    // The session after the completion, on the same UTC day, is the first day of play since.
    expect(s2.festival).toEqual({ active: null, completed: 1, daysOfPlaySinceLast: 2 });
    const s3 = foldIsland(
      [ev('festival.started', { festivalId: 'f', kind: 'storm-watch' }, T0, null)],
      game,
    );
    expect(s3.festival.active).toEqual({ festivalId: 'f', startedTs: T0 });
  });

  it('gifts: pending until opened, also when opened before left arrives', () => {
    const left = (id: string, ts: number) =>
      ev('gift.left', { giftId: id, toChildId: C1, decorId: 'rose', message: null }, ts, null);
    const s = foldIsland(
      [
        left('g1', T0),
        left('g2', T0 + 1),
        ev('gift.opened', { giftId: 'g1' }, T0 + 2),
        ev('gift.opened', { giftId: 'g3' }, T0 + 3),
        left('g3', T0 + 4),
      ],
      game,
    );
    expect(s.giftsPending).toEqual(['g2']);
  });

  it('milestones: defined (LWW) and reached once, in either order', () => {
    const trigger: UnlockRule = { building: 'lighthouse' };
    const s = foldIsland(
      [
        ev('milestone.defined', { milestoneId: 'm1', label: 'Pancakes', trigger }, T0, null),
        ev('milestone.reached', { milestoneId: 'm1' }, T0 + 5),
        ev('milestone.reached', { milestoneId: 'm1' }, T0 + 6),
        ev(
          'milestone.defined',
          { milestoneId: 'm1', label: 'Pancake breakfast', trigger },
          T0 + 7,
          null,
        ),
        ev('milestone.reached', { milestoneId: 'm2' }, T0 + 1),
        ev('milestone.defined', { milestoneId: 'm2', label: 'Zoo', trigger }, T0 + 2, null),
      ],
      game,
    );
    expect(s.milestones).toEqual({
      m1: { label: 'Pancake breakfast', trigger, reachedTs: T0 + 5 },
      m2: { label: 'Zoo', trigger, reachedTs: T0 + 1 },
    });
  });

  it('incrementally, a tombstone keeps the island but drops the child’s attributions', () => {
    const events = [
      placed('i1', 'road-crew', T0, C2),
      ev('decor.placed', { instanceId: 'd1', decorId: 'rose', pos: [1, 1] }, T0, C2),
      ev(
        'material.spent',
        { materials: { stone: 2 }, purpose: { kind: 'project', ref: 'lighthouse' } },
        T0,
        C2,
      ),
      ev('child.deleted', { childId: C2.toUpperCase() }, T0 + 1, null),
      placed('i2', 'road-crew', T0 + 2, C2),
    ];
    let s = initIsland(game);
    for (const e of events) s = applyIslandEvent(s, e, game);
    expect(s.buildings.i1?.placedBy).toBeNull();
    expect(s.buildings.i2).toBeUndefined();
    expect(s.decor.d1?.placedBy).toBeNull();
    expect(s.projects.lighthouse).toEqual({ contributed: { stone: 2 }, byChild: {} });
  });

  it('the full fold equals the incremental one: the island stays, attributions go', () => {
    const s = foldIsland(
      [
        placed('i1', 'road-crew', T0, C2),
        ev('decor.placed', { instanceId: 'd1', decorId: 'rose', pos: [1, 1] }, T0, C2),
        ev(
          'material.spent',
          { materials: { stone: 2 }, purpose: { kind: 'project', ref: 'lighthouse' } },
          T0,
          C2,
        ),
        ev('child.deleted', { childId: C2 }, T0 + 1, null),
        placed('i2', 'road-crew', T0 + 2, C2.toUpperCase()),
      ],
      game,
    );
    expect(Object.keys(s.buildings)).toEqual(['i1']);
    expect(s.buildings.i1?.placedBy).toBeNull();
    expect(s.decor.d1?.placedBy).toBeNull();
    expect(s.projects).toEqual({ lighthouse: { contributed: { stone: 2 }, byChild: {} } });
  });

  it('instance ids that name Object.prototype members are ordinary ids', () => {
    const s = foldIsland(
      [
        placed('constructor', 'road-crew', T0),
        ev('building.upgraded', { instanceId: 'toString', level: 2 }, T0 + 1),
        placed('toString', 'road-crew', T0 + 2),
        ev('decor.placed', { instanceId: 'hasOwnProperty', decorId: 'rose', pos: [1, 1] }, T0),
        ev('milestone.reached', { milestoneId: 'valueOf' }, T0),
      ],
      game,
    );
    expect(Object.hasOwn(s.buildings, 'constructor')).toBe(true);
    expect(s.buildings.constructor).toMatchObject({ buildingId: 'road-crew', level: 1 });
    expect(s.buildings.toString).toMatchObject({ level: 2 });
    expect(Object.hasOwn(s.decor, 'hasOwnProperty')).toBe(true);
    expect(islandFacts(s).buildings).toEqual({ 'road-crew': 2 });
  });
});

describe('foldCollection', () => {
  it('starter decor is owned from the start', () => {
    expect(foldCollection([], game)).toMatchObject({
      residents: [],
      decorOwned: { 'shell-bench': 1 },
      outfitsUnlocked: [],
      badges: {},
    });
  });

  it.each<[string, AnyEventEnvelope[], Partial<ReturnType<typeof foldCollection>>]>([
    [
      'residents: arrivals and resident unlocks, once each, in arrival order',
      [
        ev('resident.arrived', { residentId: 'tuck', homeInstanceId: null, via: 'home' }, T0 + 1),
        ev('resident.arrived', { residentId: 'nib', homeInstanceId: null, via: 'start' }, T0),
        ev('collection.unlocked', { kind: 'resident', id: 'tuck' }, T0 + 2),
        ev('collection.unlocked', { kind: 'resident', id: 'marlo' }, T0 + 3),
      ],
      { residents: ['nib', 'tuck', 'marlo'] },
    ],
    [
      'building level unlocks grant decor and outfits once per level',
      [
        ev('building.placed', { instanceId: 'i1', buildingId: 'road-crew', plot: [1, 1] }, T0),
        ev('building.upgraded', { instanceId: 'i1', level: 2 }, T0 + 1),
        ev('building.upgraded', { instanceId: 'i1', level: 2 }, T0 + 2),
        ev('building.upgraded', { instanceId: 'i1', level: 3 }, T0 + 3),
        ev('building.placed', { instanceId: 'i2', buildingId: 'lighthouse', plot: [2, 2] }, T0 + 4),
      ],
      {
        decorOwned: { 'shell-bench': 2, flag: 1, 'lantern-string': 1 },
        outfitsUnlocked: ['hat-sailor'],
      },
    ],
    [
      'an upgrade to level 3 before placement grants levels 2 and 3 on placement',
      [
        ev('building.upgraded', { instanceId: 'i1', level: 3 }, T0),
        ev('building.placed', { instanceId: 'i1', buildingId: 'road-crew', plot: [1, 1] }, T0 + 1),
      ],
      { decorOwned: { 'shell-bench': 2, flag: 1 }, outfitsUnlocked: ['hat-sailor'] },
    ],
    [
      'festival rewards and decor unlocks add up',
      [
        ev(
          'festival.completed',
          { festivalId: 'lantern-night', rewardDecor: ['lantern-string'] },
          T0,
          null,
        ),
        ev(
          'festival.completed',
          { festivalId: 'lantern-night', rewardDecor: ['lantern-string'] },
          T0 + 1,
          null,
        ),
        ev('collection.unlocked', { kind: 'decor', id: 'rose' }, T0 + 2),
      ],
      { decorOwned: { 'shell-bench': 1, 'lantern-string': 2, rose: 1 } },
    ],
    [
      'an opened gift grants its decor once, also when opened before left arrives',
      [
        ev('gift.left', { giftId: 'g1', toChildId: C1, decorId: 'rose', message: null }, T0, null),
        ev('gift.opened', { giftId: 'g1' }, T0 + 1),
        ev('gift.opened', { giftId: 'g1' }, T0 + 2),
        ev('gift.opened', { giftId: 'g2' }, T0 + 3),
        ev(
          'gift.left',
          { giftId: 'g2', toChildId: null, decorId: 'rose', message: 'hi' },
          T0 + 4,
          null,
        ),
        ev(
          'gift.left',
          { giftId: 'g3', toChildId: null, decorId: null, message: 'hi' },
          T0 + 5,
          null,
        ),
        ev('gift.opened', { giftId: 'g3' }, T0 + 6),
      ],
      { decorOwned: { 'shell-bench': 1, rose: 2 } },
    ],
    [
      'badges: first per skill per child; masteredCount unlocks an outfit; null child ignored',
      [
        ev('collection.unlocked', { kind: 'badge', id: 'CNT.01' }, T0),
        ev('collection.unlocked', { kind: 'badge', id: 'CNT.01' }, T0 + 1),
        ev('collection.unlocked', { kind: 'badge', id: 'CNT.02' }, T0 + 2, C2),
        ev('collection.unlocked', { kind: 'badge', id: 'CNT.03' }, T0 + 3, null),
        ev('collection.unlocked', { kind: 'badge', id: 'CNT.02' }, T0 + 4),
      ],
      {
        badges: {
          [C1]: [
            { skillId: 'CNT.01', ts: T0 },
            { skillId: 'CNT.02', ts: T0 + 4 },
          ],
          [C2]: [{ skillId: 'CNT.02', ts: T0 + 2 }],
        },
        outfitsUnlocked: ['hat-captain'],
      },
    ],
    [
      'outfits: explicit unlocks and road-length rules, once each',
      [
        ev('collection.unlocked', { kind: 'outfit', id: 'boots' }, T0),
        ev('collection.unlocked', { kind: 'outfit', id: 'boots' }, T0 + 1),
        ev('road.extended', { to: 30 }, T0 + 2),
      ],
      { outfitsUnlocked: ['boots', 'scarf'] },
    ],
    [
      'a tombstone removes the child’s badges',
      [
        ev('collection.unlocked', { kind: 'badge', id: 'CNT.01' }, T0, C2),
        ev('child.deleted', { childId: C2 }, T0 + 1, null),
      ],
      { badges: {} },
    ],
  ])('%s', (_n, events, expected) => {
    expect(foldCollection(events, game)).toMatchObject(expected);
  });
});

describe('foldGoals', () => {
  const progress = (weekStart: string, ts: number, childId: string | null = C1) =>
    ev('goal.progress', { weekStart, delta: 1, requestId: `r${ts}` }, ts, childId);

  it.each<
    [string, AnyEventEnvelope[], Record<string, { weeklyGoal: number }>, Record<string, unknown>]
  >([
    ['empty', [], {}, {}],
    [
      'accumulates within the week toward the child’s target',
      [progress('2026-11-02', T0), progress('2026-11-02', T0 + 1)],
      { [C1]: { weeklyGoal: 5 } },
      { [C1]: { weekStart: '2026-11-02', target: 5, progress: 2, weeksCompleted: 0 } },
    ],
    [
      'a new week starts from 0 and completed weeks are kept',
      [
        ...Array.from({ length: 5 }, (_, i) => progress('2026-11-02', T0 + i)),
        progress('2026-11-09', T0 + 7 * 24 * H),
      ],
      { [C1]: { weeklyGoal: 5 } },
      { [C1]: { weekStart: '2026-11-09', target: 5, progress: 1, weeksCompleted: 1 } },
    ],
    [
      'a late event for an earlier week does not change the current week',
      [progress('2026-11-09', T0 + 7 * 24 * H), progress('2026-11-02', T0 + 7 * 24 * H + 1)],
      {},
      { [C1]: { weekStart: '2026-11-09', target: 6, progress: 1, weeksCompleted: 0 } },
    ],
    [
      'children are independent; default target 6; family-level events ignored',
      [
        progress('2026-11-02', T0),
        progress('2026-11-02', T0, C2),
        progress('2026-11-02', T0, null),
      ],
      { [C2]: { weeklyGoal: 1 } },
      {
        [C1]: { weekStart: '2026-11-02', target: 6, progress: 1, weeksCompleted: 0 },
        [C2]: { weekStart: '2026-11-02', target: 1, progress: 1, weeksCompleted: 1 },
      },
    ],
    [
      'a tombstone removes the child',
      [progress('2026-11-02', T0, C2), ev('child.deleted', { childId: C2 }, T0 + 1, null)],
      {},
      {},
    ],
  ])('%s', (_n, events, settings, byChild) => {
    expect(foldGoals(events, settings).byChild).toEqual(byChild);
  });
});

describe('review round 2 regressions (PR #54)', () => {
  it('case-variant settings for one child resolve the same way in any record order', () => {
    const events = [
      ev('goal.progress', { weekStart: '2026-11-02', delta: 1, requestId: 'r1' }, T0, C1),
    ];
    const upperFirst = { [C1.toUpperCase()]: { weeklyGoal: 6 }, [C1]: { weeklyGoal: 1 } };
    const lowerFirst = { [C1]: { weeklyGoal: 1 }, [C1.toUpperCase()]: { weeklyGoal: 6 } };
    const a = foldGoals(events, upperFirst).byChild[C1];
    const b = foldGoals(events, lowerFirst).byChild[C1];
    expect(a).toEqual(b);
    expect(a).toMatchObject({ target: 1, weeksCompleted: 1 }); // the canonical lower-case key wins
    const mixedOnly = {
      [C1.toUpperCase()]: { weeklyGoal: 3 },
      [C1.replace('c', 'C')]: { weeklyGoal: 4 },
    };
    const reversed = Object.fromEntries(Object.entries(mixedOnly).reverse());
    expect(foldGoals(events, mixedOnly).byChild[C1]?.target).toBe(
      foldGoals(events, reversed).byChild[C1]?.target,
    );
  });

  it('building-level grants with an empty or invalid id never reach the collection', () => {
    const g: GameData = {
      ...game,
      buildings: [
        ...game.buildings,
        {
          id: 'odd-hut',
          kind: 'home',
          art: 'b/oh',
          footprint: [1, 1],
          unlock: { start: true },
          levels: [
            { level: 1, recipe: {}, unlocks: ['outfit:', 'decor:', 'decor:Bad Id', 'decor:rose'] },
          ],
        },
      ],
    };
    const s = foldCollection(
      [ev('building.placed', { instanceId: 'h1', buildingId: 'odd-hut', plot: [1, 1] }, T0)],
      g,
    );
    expect(collectionStateSchema.safeParse(s).success).toBe(true);
    expect(s.outfitsUnlocked).toEqual([]);
    expect(s.decorOwned).toEqual({ 'shell-bench': 1, rose: 1 });
  });
});

describe('review round 1 regressions (PR #54)', () => {
  it('weekly targets match settings whatever the casing of child ids', () => {
    const settings = { [C1.toUpperCase()]: { weeklyGoal: 1 } };
    const s = foldGoals(
      [
        ev(
          'goal.progress',
          { weekStart: '2026-11-02', delta: 1, requestId: 'r1' },
          T0,
          C1.toUpperCase(),
        ),
        ev(
          'goal.progress',
          { weekStart: '2026-11-09', delta: 1, requestId: 'r2' },
          T0 + 7 * 24 * H,
          C1,
        ),
      ],
      settings,
    );
    expect(s.byChild[C1]).toEqual({
      weekStart: '2026-11-09',
      target: 1,
      progress: 1,
      weeksCompleted: 2,
    });
  });

  it.each<[string, 'badge' | 'resident' | 'decor', string]>([
    ['a badge id that is not a skill id', 'badge', 'unknown-badge'],
    ['a resident id that is not kebab-case', 'resident', 'Not_A_Resident'],
    ['a decor id that is not kebab-case', 'decor', 'Bad Decor'],
  ])('collection.unlocked with %s is ignored', (_n, kind, id) => {
    const s = foldCollection(
      [
        ev('collection.unlocked', { kind, id }, T0),
        ev('collection.unlocked', { kind: 'badge', id: 'CNT.01' }, T0 + 1),
      ],
      game,
    );
    expect(collectionStateSchema.safeParse(s).success).toBe(true);
    expect(s.badges[C1]).toEqual([{ skillId: 'CNT.01', ts: T0 + 1 }]);
    expect(s.residents).toEqual([]);
    expect(s.decorOwned).toEqual({ 'shell-bench': 1 });
    expect(s.outfitsUnlocked).toEqual([]);
  });

  it('collection instance ids that name Object.prototype members still grant their levels', () => {
    const s = foldCollection(
      [
        ev('building.placed', { instanceId: 'i1', buildingId: 'road-crew', plot: [1, 1] }, T0),
        ev(
          'building.placed',
          { instanceId: 'constructor', buildingId: 'road-crew', plot: [2, 2] },
          T0 + 1,
        ),
        ev('building.upgraded', { instanceId: 'constructor', level: 2 }, T0 + 2),
      ],
      game,
    );
    expect(s.decorOwned).toEqual({ 'shell-bench': 2 });
  });
});

describe('evaluateUnlock', () => {
  const facts: UnlockFacts = { buildings: { 'road-crew': 2 }, roadLength: 20, residentCount: 3 };
  const learner: UnlockFacts = {
    ...facts,
    skillAtLeast: (s, at) => s === 'CPS.03' && at !== 'mastered',
    skillKindAtLeast: (k) => k === 'fact-fluency',
    maxGrade: '1',
    maxMasteredCount: 4,
  };
  it.each<[string, UnlockRule, UnlockFacts, boolean]>([
    ['start', { start: true }, facts, true],
    ['building at level 1 by default', { building: 'road-crew' }, facts, true],
    ['building level 3 not reached', { building: 'road-crew', level: 3 }, facts, false],
    ['unbuilt building', { building: 'lighthouse' }, facts, false],
    ['road length reached', { roadLength: 20 }, facts, true],
    ['road length not reached', { roadLength: 21 }, facts, false],
    ['resident count', { residentCount: 3 }, facts, true],
    ['all', { all: [{ start: true }, { roadLength: 21 }] }, facts, false],
    ['any', { any: [{ roadLength: 21 }, { residentCount: 1 }] }, facts, true],
    [
      'skill without learner facts is false',
      { skill: 'CPS.03', atLeast: 'practiced' },
      facts,
      false,
    ],
    ['skill with learner facts', { skill: 'CPS.03', atLeast: 'practiced' }, learner, true],
    ['skill mastered not reached', { skill: 'CPS.03', atLeast: 'mastered' }, learner, false],
    ['skill kind', { skillKind: 'fact-fluency', atLeast: 'practiced' }, learner, true],
    ['min grade met', { minGrade: '1' }, learner, true],
    ['min grade not met', { minGrade: '2' }, learner, false],
    ['min grade without facts', { minGrade: 'K' }, facts, false],
    ['mastered count', { masteredCount: 4 }, learner, true],
    ['mastered count not reached', { masteredCount: 5 }, learner, false],
  ])('%s', (_n, rule, f, expected) => {
    expect(evaluateUnlock(rule, f)).toBe(expected);
  });
});
