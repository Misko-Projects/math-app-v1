// @vitest-environment node
// Building over the real store and the compiled game data (#22 part 2): what a family may build,
// what a build writes and costs, the clamp at 0 when two devices spend the same materials, the
// road's next stone, and unlock rules evaluated family-wide.

import * as engine from '@number-island/engine';
import {
  displacedPlacements,
  foldInventory,
  foldIsland,
  islandFacts,
} from '@number-island/engine/shell';
import type {
  AnyEventEnvelope,
  EventPayloads,
  EventType,
  GameData,
  Recipe,
} from '@number-island/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { DataStore } from '@/data/store';
import {
  CHILD_G2,
  CHILD_K,
  FAMILY,
  fixtureContent,
  profile,
  testEnv,
} from '@/data/store.test-support';
import { workshopCapabilities } from '@/workshops/registry';
import { layNextStone, placeBuilding, ROAD_REF, settleResidents, upgradeBuilding } from './actions';
import { familyFacts } from './familyFacts';
import {
  type BuildCard,
  buildCards,
  countingWalk,
  freeAnchors,
  nextStone,
  unmetHints,
} from './rules';

const { graph, gameData } = fixtureContent();
const OTHER_DEVICE = '019a0000-0000-7000-8000-00000000d002';

const open: DataStore[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

async function family() {
  const env = testEnv();
  const store = await env.open();
  open.push(store);
  await store.putProfile(profile(CHILD_K, 'K', 'Ada'));
  await store.putProfile(profile(CHILD_G2, '2', 'Ben'));
  return { env, store };
}

const produce = (store: DataStore, materials: Recipe, childId = CHILD_K) =>
  store.append(
    'material.produced',
    { sessionId: 's1', requestId: 'r1', workshopId: 'practice-pier', materials },
    { childId },
  );

let n = 0;
function fromOtherDevice<T extends EventType>(
  type: T,
  payload: EventPayloads[T],
  ts: number,
  childId: string,
): AnyEventEnvelope {
  n += 1;
  return {
    id: `019c0000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`,
    familyId: FAMILY,
    childId,
    deviceId: OTHER_DEVICE,
    ts,
    type,
    v: 1,
    payload,
    contentVersion: 'server',
  } as AnyEventEnvelope;
}

async function cardsOf(store: DataStore) {
  const island = await store.island();
  return buildCards(gameData, island, await store.inventory(), islandFacts(island));
}
const card = (cards: BuildCard[], id: string) => {
  const found = cards.find((c) => c.building.id === id);
  if (!found) throw new Error(`no card for ${id}`);
  return found;
};
const types = async (store: DataStore) => (await store.events()).map((e) => e.type);

describe('what a family may build (05 §4 rule 7, §6)', () => {
  it('a new family: the first home is short, the dock waits for a home, the beach for the road', async () => {
    const { store } = await family();
    const cards = await cardsOf(store);
    const cottage = card(cards, 'shell-cottage');
    expect(cottage).toMatchObject({ state: 'short', level: 1, instanceId: null });
    expect(cottage.needs).toEqual([
      { materialId: 'stone', need: 5, have: 0, missing: 5 },
      { materialId: 'light', need: 3, have: 0, missing: 3 },
    ]);
    // The sandbar has one plot off the road: only a 1 × 1 home fits (island.yaml).
    expect(cottage.anchors).toEqual([[3, 4]]);
    expect(card(cards, 'road-crew')).toMatchObject({ state: 'no-room', needs: [] });
    expect(card(cards, 'ten-boat-dock')).toMatchObject({
      state: 'locked',
      hints: [{ kind: 'building', buildingId: 'shell-cottage', level: 1 }],
    });
    expect(card(cards, 'treasure-beach').hints).toEqual([{ kind: 'road', length: 20 }]);
    expect(card(cards, 'brick-factory').hints).toEqual([{ kind: 'practice' }]);
    // What cannot be bought comes after what can; locked cards come last.
    const order = cards.map((c) => c.state);
    expect(order).toEqual([...order].sort((a, b) => rank(a) - rank(b)));
  });

  it('a recipe line never shows more than it needs, and a part-paid one says what is left', async () => {
    const { store } = await family();
    await produce(store, { stone: 3, light: 40 });
    expect(card(await cardsOf(store), 'shell-cottage').needs).toEqual([
      { materialId: 'stone', need: 5, have: 3, missing: 2 },
      { materialId: 'light', need: 3, have: 3, missing: 0 },
    ]);
  });

  it('`all` lists every unmet part once; `any` its shortest way in', () => {
    const facts = { buildings: {}, roadLength: 0, residentCount: 0 };
    expect(
      unmetHints(
        { all: [{ building: 'a' }, { roadLength: 20 }, { building: 'a' }, { start: true }] },
        facts,
      ),
    ).toEqual([
      { kind: 'building', buildingId: 'a', level: 1 },
      { kind: 'road', length: 20 },
    ]);
    expect(
      unmetHints(
        { any: [{ all: [{ building: 'a' }, { roadLength: 5 }] }, { minGrade: '1' }] },
        facts,
      ),
    ).toEqual([{ kind: 'practice' }]);
    expect(unmetHints({ building: 'a', level: 2 }, { ...facts, buildings: { a: 2 } })).toEqual([]);
  });

  it('a footprint fits only on open land, off the road and clear of what stands', async () => {
    const { store } = await family();
    const island = await store.island();
    expect(freeAnchors(gameData, island, [2, 1])).toEqual([]);
    const open2 = { ...island, ringsUnlocked: 2 };
    const road = new Set(gameData.island.road.map((s) => s.plot.join(',')));
    const anchors = freeAnchors(gameData, open2, [2, 2]);
    expect(anchors.length).toBeGreaterThan(0);
    for (const [x, y] of anchors)
      for (const p of [`${x},${y}`, `${x + 1},${y}`, `${x},${y + 1}`, `${x + 1},${y + 1}`])
        expect(road.has(p), p).toBe(false);
    const first = anchors[0];
    if (!first) throw new Error('no anchor');
    const taken = {
      ...open2,
      buildings: {
        storehouse: {
          buildingId: 'storehouse',
          plot: first,
          level: 1 as const,
          placedBy: null,
          ts: 0,
        },
      },
    };
    const after = freeAnchors(gameData, taken, [1, 1]).map((p) => p.join(','));
    expect(after).not.toContain(first.join(','));
    expect(after).not.toContain(`${first[0] + 1},${first[1] + 1}`);
  });
});

const rank = (s: BuildCard['state']) => ['ready', 'short', 'no-room', 'locked'].indexOf(s);

describe('what a build writes (02 §4.3)', () => {
  it('the first home: placed, paid exactly, its resident moves in and the first shore opens', async () => {
    const { store } = await family();
    await produce(store, { stone: 7, light: 3 });
    const cottage = card(await cardsOf(store), 'shell-cottage');
    expect(cottage.state).toBe('ready');
    const result = await placeBuilding(store, CHILD_K, gameData, cottage, [3, 4]);
    expect(result).toEqual({ ok: true, instanceId: 'shell-cottage', level: 1, plot: [3, 4] });
    expect((await types(store)).slice(1)).toEqual([
      'building.placed',
      'material.spent',
      'resident.arrived',
    ]);
    const spent = (await store.events()).find((e) => e.type === 'material.spent');
    expect(spent?.payload).toEqual({
      materials: { stone: 5, light: 3 },
      purpose: { kind: 'build', ref: 'shell-cottage' },
    });
    expect((await store.inventory()).materials).toMatchObject({ stone: 2, light: 0 });
    const island = await store.island();
    expect(island.buildings['shell-cottage']).toMatchObject({
      buildingId: 'shell-cottage',
      plot: [3, 4],
      level: 1,
      placedBy: CHILD_K,
    });
    expect(island.residents.hobb).toMatchObject({ homeInstanceId: 'shell-cottage' });
    expect(island.ringsUnlocked).toBe(2);
    // The home unlocks the dock for the whole family, and the free workshops now have room.
    const cards = await cardsOf(store);
    expect(card(cards, 'ten-boat-dock').state).toBe('short');
    expect(card(cards, 'road-crew').state).toBe('ready');
    expect(card(cards, 'shell-cottage')).toMatchObject({ level: 2, instanceId: 'shell-cottage' });
  });

  it('a build interrupted before its resident arrived is made good on the next visit, at no cost', async () => {
    const { store } = await family();
    await produce(store, { stone: 5, light: 3 });
    const cottage = card(await cardsOf(store), 'shell-cottage');
    // The placement and the payment commit; the arrival's write fails (the browser closed).
    const interrupted: DataStore = Object.create(store, {
      append: {
        value: (...args: Parameters<DataStore['append']>) =>
          args[0] === 'resident.arrived'
            ? Promise.reject(new Error('closed'))
            : store.append(...args),
      },
    });
    await expect(placeBuilding(interrupted, CHILD_K, gameData, cottage, [3, 4])).rejects.toThrow(
      'closed',
    );
    let island = await store.island();
    expect(island.buildings['shell-cottage']).toBeDefined();
    expect(island.residents).toEqual({});
    expect(island.ringsUnlocked).toBe(1);
    // The island opens again (either child): Hobb moves in, and the first shore opens.
    await settleResidents(store, CHILD_G2, gameData);
    island = await store.island();
    expect(island.residents.hobb).toMatchObject({ homeInstanceId: 'shell-cottage' });
    expect(island.ringsUnlocked).toBe(2);
    expect(await types(store)).toEqual([
      'material.produced',
      'building.placed',
      'material.spent',
      'resident.arrived',
    ]);
    // Settling again writes nothing, and a level not reached brings nobody (Lark is level 2).
    await settleResidents(store, CHILD_K, gameData);
    expect((await types(store)).filter((t) => t === 'resident.arrived')).toHaveLength(1);
    expect((await store.island()).residents.lark).toBeUndefined();
  });

  it('a build the family cannot pay for is not started: nothing is written', async () => {
    const { store } = await family();
    await produce(store, { stone: 5, light: 3 });
    const cottage = card(await cardsOf(store), 'shell-cottage');
    // The sibling's device spent the light meanwhile.
    await store.ingest(
      [
        fromOtherDevice(
          'material.spent',
          { materials: { light: 2 }, purpose: { kind: 'build', ref: 'road' } },
          (await store.events())[0]?.ts ?? 0,
          CHILD_G2,
        ),
      ],
      { source: 'server' },
    );
    const before = await types(store);
    expect(await placeBuilding(store, CHILD_K, gameData, cottage, [3, 4])).toEqual({
      ok: false,
      reason: 'short',
    });
    expect(await types(store)).toEqual(before);
    expect((await store.island()).buildings).toEqual({});
  });

  it('a plot that is no longer free, or a building that already stands, is refused', async () => {
    const { store } = await family();
    await produce(store, { stone: 20, light: 20 });
    const cottage = card(await cardsOf(store), 'shell-cottage');
    expect(await placeBuilding(store, CHILD_K, gameData, cottage, [4, 4])).toEqual({
      ok: false,
      reason: 'taken',
    });
    expect((await placeBuilding(store, CHILD_K, gameData, cottage, [3, 4])).ok).toBe(true);
    expect(await placeBuilding(store, CHILD_K, gameData, cottage, [3, 4])).toEqual({
      ok: false,
      reason: 'stale',
    });
    expect((await types(store)).filter((t) => t === 'building.placed')).toHaveLength(1);
  });

  it('a free workshop is placed without a spend; an upgrade pays its level and never goes down', async () => {
    const { store } = await family();
    await produce(store, { stone: 15, light: 3 });
    await placeBuilding(
      store,
      CHILD_K,
      gameData,
      card(await cardsOf(store), 'shell-cottage'),
      [3, 4],
    );
    const crew = card(await cardsOf(store), 'road-crew');
    const plot = crew.anchors[0];
    if (!plot) throw new Error('no plot for the Road Crew');
    const before = (await types(store)).filter((t) => t === 'material.spent').length;
    expect((await placeBuilding(store, CHILD_G2, gameData, crew, plot)).ok).toBe(true);
    expect((await types(store)).filter((t) => t === 'material.spent')).toHaveLength(before);
    const up = card(await cardsOf(store), 'road-crew');
    expect(up).toMatchObject({ level: 2, state: 'ready', instanceId: 'road-crew' });
    expect(await upgradeBuilding(store, CHILD_G2, gameData, up)).toMatchObject({
      ok: true,
      level: 2,
    });
    expect((await store.island()).buildings['road-crew']?.level).toBe(2);
    expect((await store.inventory()).materials.stone).toBe(0);
    const last = (await store.events()).filter((e) => e.type === 'material.spent').at(-1);
    expect(last?.payload).toEqual({
      materials: { stone: 10 },
      purpose: { kind: 'upgrade', ref: 'road-crew' },
    });
    // The same card again is stale (the building is at level 2 now), and level 3 is short.
    expect(await upgradeBuilding(store, CHILD_G2, gameData, up)).toEqual({
      ok: false,
      reason: 'stale',
    });
    expect(card(await cardsOf(store), 'road-crew')).toMatchObject({ level: 3, state: 'short' });
  });

  it('two devices spend the same materials while apart: the inventory is clamped at 0', async () => {
    const { env, store } = await family();
    const made = await produce(store, { stone: 5, light: 3 });
    // The sibling's device saw the same Storehouse and spent it on the same home, elsewhere.
    const theirs = [
      fromOtherDevice(
        'building.placed',
        { instanceId: 'shell-cottage', buildingId: 'shell-cottage', plot: [3, 4] },
        made.ts + 1,
        CHILD_G2,
      ),
      fromOtherDevice(
        'material.spent',
        { materials: { stone: 5, light: 3 }, purpose: { kind: 'build', ref: 'shell-cottage' } },
        made.ts + 2,
        CHILD_G2,
      ),
    ];
    // This device builds a second thing from the same piles before the sync arrives.
    await store.append(
      'material.spent',
      { materials: { stone: 4, light: 3 }, purpose: { kind: 'build', ref: 'road' } },
      { childId: CHILD_K },
    );
    await store.ingest(theirs, { source: 'server' });
    const inventory = await store.inventory();
    expect(inventory.materials).toMatchObject({ stone: 0, light: 0 });
    expect(inventory).toEqual(foldInventory(await store.events()));
    for (const count of Object.values(inventory.materials)) expect(count).toBeGreaterThanOrEqual(0);
    // One building, wherever the events are folded, and what is made next counts from 0.
    expect(Object.keys(foldIsland(await store.events(), gameData).buildings)).toEqual([
      'shell-cottage',
    ]);
    env.clock.advance(60_000);
    await produce(store, { stone: 2 });
    expect((await store.inventory()).materials.stone).toBe(2);
    expect(card(await cardsOf(store), 'shell-cottage')).toMatchObject({ level: 2, state: 'short' });
  });
});

describe('a building that lost its plots to an earlier one (02 §4.3; #22 part 3)', () => {
  it('is gone with its resident once the earlier placement arrives, and is built again for one recipe', async () => {
    const { env, store } = await family();
    await produce(store, { stone: 20, light: 3, plank: 20 });
    await placeBuilding(
      store,
      CHILD_K,
      gameData,
      card(await cardsOf(store), 'shell-cottage'),
      [3, 4],
    );
    await store.append(
      'building.placed',
      { instanceId: 'ten-boat-dock', buildingId: 'ten-boat-dock', plot: [1, 2] },
      { childId: CHILD_K },
    );
    const apart = env.clock.now();
    env.clock.advance(60_000);
    // Ada, offline: the Driftwood Hut on [7,3], and Ottie moves in.
    const hut = () => cardsOf(store).then((cards) => card(cards, 'driftwood-hut'));
    expect(await placeBuilding(store, CHILD_K, gameData, await hut(), [7, 3])).toMatchObject({
      ok: true,
      instanceId: 'driftwood-hut',
    });
    expect((await store.island()).residents.ottie).toMatchObject({
      homeInstanceId: 'driftwood-hut',
    });
    const before = (await store.inventory()).materials;
    // Ben's Lantern Grove, placed earlier on [6,2]–[7,3] on his tablet, arrives by sync.
    await store.ingest(
      [
        fromOtherDevice(
          'building.placed',
          { instanceId: 'lantern-grove', buildingId: 'lantern-grove', plot: [6, 2] },
          apart + 1,
          CHILD_G2,
        ),
      ],
      { source: 'server' },
    );
    let island = await store.island();
    expect(Object.keys(island.buildings).sort()).toEqual([
      'lantern-grove',
      'shell-cottage',
      'ten-boat-dock',
    ]);
    expect(displacedPlacements(island).map((d) => d.instanceId)).toEqual(['driftwood-hut']);
    // Ottie did not move into a hut that does not stand, and asks for nothing.
    expect(Object.keys(island.residents)).not.toContain('ottie');
    const asking = () =>
      store
        .island()
        .then((i) => workshopCapabilities(gameData, i).flatMap((c) => c.residents ?? []));
    expect(await asking()).not.toContain('ottie');
    expect((await store.inventory()).materials).toEqual(before);

    // Built again from the sheet: the same card, a free plot, exactly one more recipe.
    env.clock.advance(60_000);
    const again = await hut();
    expect(again).toMatchObject({ level: 1, state: 'ready' });
    const [plot] = freeAnchors(gameData, island, again.building.footprint);
    if (!plot) throw new Error('no free plot for the hut');
    expect(await placeBuilding(store, CHILD_K, gameData, again, plot)).toMatchObject({
      ok: true,
      instanceId: 'driftwood-hut',
    });
    island = await store.island();
    expect(island.buildings['driftwood-hut']).toMatchObject({ plot, level: 1, placedBy: CHILD_K });
    expect(displacedPlacements(island)).toEqual([]);
    expect(island.residents.ottie).toMatchObject({ homeInstanceId: 'driftwood-hut' });
    expect(await asking()).toContain('ottie');
    expect((await store.inventory()).materials).toMatchObject({
      plank: (before.plank ?? 0) - 6,
      stone: (before.stone ?? 0) - 4,
    });
    // Another device that gets everything in another order shows the same island.
    const other = await testEnv().open();
    open.push(other);
    await other.ingest([...(await store.events())].reverse(), { source: 'server' });
    expect(await other.island()).toEqual(island);
  });
});

describe('the Numbered Road (05 §3)', () => {
  it('the next stone costs one stone; without one nothing is written', async () => {
    const { store } = await family();
    expect(nextStone(gameData, await store.island())).toEqual({ n: 1, plot: [4, 4] });
    expect(await layNextStone(store, CHILD_K, gameData)).toEqual({ ok: false, reason: 'short' });
    expect(await types(store)).toEqual([]);
    await produce(store, { stone: 2 });
    expect(await layNextStone(store, CHILD_K, gameData)).toEqual({ ok: true, to: 1, arrived: 0 });
    expect(await layNextStone(store, CHILD_K, gameData)).toEqual({ ok: true, to: 2, arrived: 0 });
    expect((await store.island()).roadLength).toBe(2);
    expect((await store.inventory()).materials.stone).toBe(0);
    expect((await store.events()).at(-1)?.payload).toEqual({
      materials: { stone: 1 },
      purpose: { kind: 'build', ref: ROAD_REF },
    });
    expect(await layNextStone(store, CHILD_K, gameData)).toEqual({ ok: false, reason: 'short' });
  });

  it('a stone is laid only on open land: the road waits at the sandbar for the first shore', async () => {
    const { store } = await family();
    const island = await store.island();
    // Stones 1–6 lie on the sandbar; stone 7 is on the first shore.
    expect(nextStone(gameData, { ...island, roadLength: 5 })?.n).toBe(6);
    expect(nextStone(gameData, { ...island, roadLength: 6 })).toBeNull();
    expect(nextStone(gameData, { ringsUnlocked: 2, roadLength: 6 })?.n).toBe(7);
    expect(nextStone(gameData, { ringsUnlocked: 6, roadLength: 1000 })).toBeNull();
  });

  it('the walk counts on to the new stone: by ones, then by tens', () => {
    expect(countingWalk(gameData, 1)).toEqual([1]);
    expect(countingWalk(gameData, 3)).toEqual([1, 2, 3]);
    expect(countingWalk(gameData, 20)).toEqual([16, 17, 18, 19, 20]);
    expect(countingWalk(gameData, 120)).toEqual([98, 99, 100, 110, 120]);
  });
});

describe('residents arrive by their own rule (05 §5)', () => {
  it('the road brings residents as it grows, each once, and a starter buddy never arrives', async () => {
    const { store } = await family();
    await produce(store, { stone: 1 });
    await store.append('road.extended', { to: 19 }, { childId: CHILD_K });
    await settleResidents(store, CHILD_K, gameData);
    expect((await store.island()).residents).toEqual({});
    // Stone 20 is on the first shore: open it, then lay the stone; Toma comes with the road.
    await store.append(
      'resident.arrived',
      { residentId: 'hobb', homeInstanceId: null, via: 'home' },
      { childId: CHILD_K },
    );
    expect(await layNextStone(store, CHILD_K, gameData)).toEqual({ ok: true, to: 20, arrived: 1 });
    const island = await store.island();
    expect(Object.keys(island.residents).sort()).toEqual(['hobb', 'toma']);
    expect((await store.events()).at(-1)).toMatchObject({
      type: 'resident.arrived',
      payload: { residentId: 'toma', homeInstanceId: null, via: 'ferry' },
    });
    await settleResidents(store, CHILD_G2, gameData);
    expect((await types(store)).filter((t) => t === 'resident.arrived')).toHaveLength(2);
  });

  it('two passes started together write each arrival once', async () => {
    const { store } = await family();
    await store.append('road.extended', { to: 100 }, { childId: CHILD_K });
    // The island opens (one pass) and the learner facts load while it is still writing (another).
    const counts = await Promise.all([
      settleResidents(store, CHILD_K, gameData),
      settleResidents(store, CHILD_K, gameData, { skillAtLeast: () => true }),
      settleResidents(store, CHILD_G2, gameData),
    ]);
    const arrivals = (await store.events())
      .filter((e) => e.type === 'resident.arrived')
      .map((e) => (e.payload as { residentId: string }).residentId);
    expect(new Set(arrivals).size).toBe(arrivals.length);
    expect(arrivals).toEqual(expect.arrayContaining(['toma', 'vina', 'moku', 'tenley']));
    // The first pass brought the road's residents, the second only who the skill rule adds.
    expect(counts[0]).toBe(9);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[2]).toBe(0);
    expect(counts[0] + counts[1]).toBe(arrivals.length);
  });

  it('a skill rule holds once the family reaches it, whichever child did', async () => {
    const { store } = await family();
    await settleResidents(store, CHILD_K, gameData, {
      skillAtLeast: () => false,
    });
    expect((await store.island()).residents.tenley).toBeUndefined();
    await settleResidents(store, CHILD_K, gameData, {
      skillAtLeast: (skill, level) => skill === 'CPS.03' && level === 'practiced',
    });
    expect((await store.island()).residents.tenley).toMatchObject({ homeInstanceId: null });
  });
});

describe('unlock rules are family-wide (05 §4 rule 7)', () => {
  async function facts(store: DataStore) {
    const learners = [];
    for (const p of await store.allProfiles()) {
      const state = await store.skillStates(p.id);
      if (state) learners.push({ profile: p, state });
    }
    return familyFacts(engine, graph, await store.island(), learners, store.now());
  }

  it("one child's grade and mastered skills unlock buildings for both", async () => {
    const { store } = await family();
    const f = await facts(store);
    // Ben is in grade 2: the Puzzle Tower (grade 1 up) is unlocked for Ada too.
    expect(f.maxGrade).toBe('2');
    expect(unmetHints({ minGrade: '1' }, f)).toEqual([]);
    expect(unmetHints({ minGrade: '3' }, f)).toEqual([{ kind: 'practice' }]);
    expect(f.skillAtLeast?.('CPS.04', 'practiced')).toBe(false);
    // A skill Ben has mastered counts for the family at every level.
    await store.append(
      'skill.override',
      { skillId: 'CPS.04', to: 'mastered' },
      { childId: CHILD_G2 },
    );
    const after = await facts(store);
    for (const level of ['ready', 'practiced', 'mastered'] as const)
      expect(after.skillAtLeast?.('CPS.04', level), level).toBe(true);
    expect(after.maxMasteredCount).toBe(1);
    expect(unmetHints({ masteredCount: 1 }, after)).toEqual([]);
    const island = await store.island();
    const cards = buildCards(gameData, { ...island, ringsUnlocked: 2 }, await store.inventory(), {
      ...after,
      ...islandFacts(island),
    });
    expect(card(cards, 'brick-factory').state).toBe('short');
    expect(card(cards, 'puzzle-tower').state).toBe('short');
  });

  it('a skill no child has reached, or one the content does not hold, unlocks nothing', async () => {
    const { store } = await family();
    const f = await facts(store);
    expect(f.skillAtLeast?.('MUL.05', 'ready')).toBe(false);
    expect(f.skillAtLeast?.('NOPE.99', 'ready')).toBe(false);
    expect(f.maxMasteredCount).toBe(0);
  });
});

describe('what the planner may use (02 §5.6)', () => {
  const caps = (data: Pick<GameData, 'buildings' | 'residents'>, built: string[] = []) =>
    workshopCapabilities(data, {
      buildings: Object.fromEntries(
        built.map((id) => [
          id,
          {
            buildingId: id,
            plot: [1, 2] as [number, number],
            level: 1 as const,
            placedBy: null,
            ts: 0,
          },
        ]),
      ),
      residents: {},
    });

  it('the free workshops work from the start; one with a cost has to be built', () => {
    const available = (list: ReturnType<typeof caps>) =>
      Object.fromEntries(list.map((c) => [c.workshopId, c.available]));
    expect(available(caps(gameData))).toMatchObject({
      'road-crew': true,
      'lantern-grove': true,
      'practice-pier': true,
    });
    // The same data with a cost on the Road Crew's first level: unavailable until it stands.
    const priced = {
      ...gameData,
      buildings: gameData.buildings.map((b) =>
        b.id === 'road-crew'
          ? {
              ...b,
              levels: b.levels.map((l) => (l.level === 1 ? { ...l, recipe: { stone: 1 } } : l)),
            }
          : b,
      ),
    };
    expect(available(caps(priced))['road-crew']).toBe(false);
    expect(available(caps(priced, ['road-crew']))['road-crew']).toBe(true);
  });
});
