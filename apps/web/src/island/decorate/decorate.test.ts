// @vitest-environment node
// Decorate mode over the real store and the compiled game data (#22 part 4): what a family may
// place, the decor cap on one device and across two, where a piece fits, and the time cap.

import { foldCollection, foldIsland } from '@number-island/engine/shell';
import type { AnyEventEnvelope, EventPayloads, EventType } from '@number-island/shared';
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
import { createNonMathTime } from '../hub';
import { placeDecor, removeDecor } from './actions';
import { decorAnchors, decorInstanceId, decorItems, NON_MATH_SHARE, nonMathLeft } from './rules';

const { gameData } = fixtureContent();
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
  // The first shore is open: a home, and its resident.
  await store.append(
    'building.placed',
    { instanceId: 'shell-cottage', buildingId: 'shell-cottage', plot: [3, 4] },
    { childId: CHILD_K },
  );
  await store.append(
    'resident.arrived',
    { residentId: 'hobb', homeInstanceId: 'shell-cottage', via: 'home' },
    { childId: CHILD_K },
  );
  return { env, store };
}

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

const itemsOf = async (store: DataStore) =>
  decorItems(gameData, await store.island(), await store.collection());
const standing = async (store: DataStore) =>
  (await itemsOf(store)).filter((i) => i.pos !== null).map((i) => i.instanceId);

const BENCH = decorInstanceId('shell-bench', 1);
const POT = decorInstanceId('flower-pot', 1);

describe('the decor a family owns (05 §6)', () => {
  it('starts with one of each starter piece, all in the tray', async () => {
    const { store } = await family();
    const items = await itemsOf(store);
    const starters = gameData.decor.filter((d) => d.source === 'starter');
    expect(starters.length).toBeGreaterThan(0);
    expect(items.map((i) => i.instanceId)).toEqual(starters.map((d) => decorInstanceId(d.id, 1)));
    expect(items.every((i) => i.pos === null)).toBe(true);
  });

  it('a request that earned a decor adds a piece of it (collection.unlocked)', async () => {
    const { store } = await family();
    const [puzzle] = gameData.decor.filter((d) => d.source === 'puzzle');
    if (!puzzle) throw new Error('no puzzle decor in the game data');
    expect((await itemsOf(store)).some((i) => i.def.id === puzzle.id)).toBe(false);
    for (let i = 0; i < 2; i += 1)
      await store.append(
        'collection.unlocked',
        { kind: 'decor', id: puzzle.id },
        { childId: CHILD_K },
      );
    expect(
      (await itemsOf(store)).filter((i) => i.def.id === puzzle.id).map((i) => i.instanceId),
    ).toEqual([decorInstanceId(puzzle.id, 1), decorInstanceId(puzzle.id, 2)]);
  });
});

describe('placing, moving and putting away', () => {
  it('a piece goes on a free plot, moves to another, and comes back to the tray', async () => {
    const { store } = await family();
    const items = await itemsOf(store);
    const bench = items.find((i) => i.instanceId === BENCH);
    if (!bench) throw new Error('no bench');
    const [a, b] = decorAnchors(gameData, await store.island(), items, bench);
    if (!a || !b) throw new Error('no free plots');

    expect(await placeDecor(store, gameData, CHILD_K, BENCH, a)).toBe('ok');
    expect((await itemsOf(store)).find((i) => i.instanceId === BENCH)?.pos).toEqual(a);
    expect(await placeDecor(store, gameData, CHILD_G2, BENCH, b)).toBe('ok');
    expect((await itemsOf(store)).find((i) => i.instanceId === BENCH)?.pos).toEqual(b);
    expect(await removeDecor(store, CHILD_K, BENCH)).toBe('ok');
    expect(await standing(store)).toEqual([]);
    expect(await removeDecor(store, CHILD_K, BENCH)).toBe('stale');
    // Placed again after it was put away.
    expect(await placeDecor(store, gameData, CHILD_K, BENCH, a)).toBe('ok');
    expect(await standing(store)).toEqual([BENCH]);

    const types = (await store.events()).map((e) => e.type).filter((t) => t.startsWith('decor.'));
    expect(types).toEqual(['decor.placed', 'decor.moved', 'decor.removed', 'decor.placed']);
  });

  it('never on the road, on a building, on water or on another piece', async () => {
    const { store } = await family();
    const island = await store.island();
    const items = await itemsOf(store);
    const bench = items.find((i) => i.instanceId === BENCH);
    if (!bench) throw new Error('no bench');
    const free = decorAnchors(gameData, island, items, bench).map((p) => p.join());
    const road = gameData.island.road.map((s) => s.plot.join());
    const land = gameData.island.rings
      .slice(0, island.ringsUnlocked)
      .flatMap((r) => r.plots)
      .map((p) => p.join());
    expect(free.length).toBeGreaterThan(0);
    for (const p of free) {
      expect(road).not.toContain(p);
      expect(land).toContain(p);
      expect(p).not.toBe('3,4');
    }
    // A plot off the land, the home's plot and a road plot are all refused; nothing is written.
    const before = (await store.events()).length;
    const roadPlot = gameData.island.road[0]?.plot as [number, number];
    for (const plot of [[11, 7], [3, 4], roadPlot] as [number, number][])
      expect(await placeDecor(store, gameData, CHILD_K, BENCH, plot)).toBe('stale');
    expect((await store.events()).length).toBe(before);

    const [a] = decorAnchors(gameData, island, items, bench);
    if (!a) throw new Error('no free plot');
    await placeDecor(store, gameData, CHILD_K, BENCH, a);
    expect(await placeDecor(store, gameData, CHILD_K, POT, a)).toBe('stale');
    const pot = (await itemsOf(store)).find((i) => i.instanceId === POT);
    if (!pot) throw new Error('no pot');
    expect(
      decorAnchors(gameData, await store.island(), await itemsOf(store), pot).map((p) => p.join()),
    ).not.toContain(a.join());
  });
});

describe('the decor cap (#22: "the decor cap is enforced")', () => {
  it('a piece the family does not own is refused, and one in the log is not on the island', async () => {
    const { store } = await family();
    const [a, b] = decorAnchors(
      gameData,
      await store.island(),
      await itemsOf(store),
      (await itemsOf(store))[0] as Awaited<ReturnType<typeof itemsOf>>[number],
    );
    if (!a || !b) throw new Error('no free plots');
    // The family owns one bench: there is no second one to place.
    expect(await placeDecor(store, gameData, CHILD_K, decorInstanceId('shell-bench', 2), a)).toBe(
      'stale',
    );
    // A fountain is earned by a project: not owned yet.
    expect(await placeDecor(store, gameData, CHILD_K, decorInstanceId('fountain', 1), a)).toBe(
      'stale',
    );
    // Events that claim more than the family owns do not show: the island keeps to the cap.
    await store.append(
      'decor.placed',
      { instanceId: decorInstanceId('shell-bench', 2), decorId: 'shell-bench', pos: a },
      { childId: CHILD_K },
    );
    await store.append(
      'decor.placed',
      { instanceId: 'made-up', decorId: 'shell-bench', pos: b },
      { childId: CHILD_K },
    );
    expect(await standing(store)).toEqual([]);
    expect(await placeDecor(store, gameData, CHILD_K, BENCH, a)).toBe('ok');
    expect(await standing(store)).toEqual([BENCH]);
  });

  it('two tablets that place the same owned piece while apart end with one of it', async () => {
    const { env, store } = await family();
    const items = await itemsOf(store);
    const bench = items.find((i) => i.instanceId === BENCH);
    if (!bench) throw new Error('no bench');
    const [a, b] = decorAnchors(gameData, await store.island(), items, bench);
    if (!a || !b) throw new Error('no free plots');
    // Ada places the bench here; Ben placed the same bench on his tablet a moment later.
    expect(await placeDecor(store, gameData, CHILD_K, BENCH, a)).toBe('ok');
    const mine = await store.events();
    const bens = fromOtherDevice(
      'decor.placed',
      { instanceId: BENCH, decorId: 'shell-bench', pos: b },
      env.clock.now() + 5_000,
      CHILD_G2,
    );
    // Whichever order the events arrive in, every device folds the same island: one bench, on
    // the plot of the later placement.
    for (const events of [
      [...mine, bens],
      [bens, ...mine],
    ]) {
      const island = foldIsland(events, gameData);
      const benches = decorItems(gameData, island, foldCollection(events, gameData)).filter(
        (i) => i.def.id === 'shell-bench',
      );
      expect(benches).toHaveLength(1);
      expect(benches[0]?.pos).toEqual(b);
      expect(Object.keys(island.decor)).toEqual([BENCH]);
    }
  });

  it('a piece a building was put on from another tablet is back in the tray, and can be placed again', async () => {
    const { env, store } = await family();
    const items = await itemsOf(store);
    const bench = items.find((i) => i.instanceId === BENCH);
    if (!bench) throw new Error('no bench');
    const [a] = decorAnchors(gameData, await store.island(), items, bench);
    if (!a) throw new Error('no free plot');
    await placeDecor(store, gameData, CHILD_K, BENCH, a);
    const small = gameData.buildings.find(
      (d) => d.id !== 'shell-cottage' && d.footprint[0] === 1 && d.footprint[1] === 1,
    );
    if (!small) throw new Error('no other 1 × 1 building in the game data');
    const events = [
      ...(await store.events()),
      fromOtherDevice(
        'building.placed',
        { instanceId: small.id, buildingId: small.id, plot: a },
        env.clock.now() + 5_000,
        CHILD_G2,
      ),
    ];
    const island = foldIsland(events, gameData);
    expect(Object.values(island.buildings).some((x) => x.plot.join() === a.join())).toBe(true);
    const after = decorItems(gameData, island, foldCollection(events, gameData));
    expect(after.find((i) => i.instanceId === BENCH)?.pos).toBeNull();
    const again = after.find((i) => i.instanceId === BENCH);
    if (!again) throw new Error('no bench');
    expect(decorAnchors(gameData, island, after, again).length).toBeGreaterThan(0);
  });
});

describe('the non-math time cap (05 §8)', () => {
  it('island time may be a quarter of the active time: nothing is left before the first request', () => {
    expect(NON_MATH_SHARE).toBe(0.25);
    // The session starts on the island: all of its time is island time.
    expect(nonMathLeft(0, 0)).toBe(0);
    expect(nonMathLeft(60_000, 60_000)).toBe(0);
    // Three minutes in a workshop after one on the island: a quarter of four minutes is used.
    expect(nonMathLeft(4 * 60_000, 60_000)).toBe(0);
    // Six minutes of math and one on the island: one more minute keeps it at a quarter.
    const left = nonMathLeft(7 * 60_000, 60_000);
    expect(left).toBeCloseTo(60_000);
    expect((60_000 + left) / (7 * 60_000 + left)).toBeCloseTo(NON_MATH_SHARE);
    expect(nonMathLeft(7 * 60_000 + left, 60_000 + left)).toBeCloseTo(0);
  });

  it('counts the time on the island across visits, on the session clock', () => {
    const time = createNonMathTime();
    time.arrive(0);
    expect(time.ms(20_000)).toBe(20_000);
    time.leave(30_000); // into a workshop
    expect(time.ms(200_000)).toBe(30_000);
    time.arrive(210_000); // back
    time.arrive(215_000); // (a second mount of the same visit changes nothing)
    expect(time.ms(240_000)).toBe(60_000);
    time.leave(240_000);
    expect(time.ms(999_000)).toBe(60_000);
  });
});
