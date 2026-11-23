// @vitest-environment node
// Road Crew's parade stone over the real store and the compiled game data (#27): one stone of
// the request's goes onto the road, with the island's own events, and the others stay stored.

import type { Recipe } from '@number-island/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { DataStore } from '@/data/store';
import { CHILD_K, fixtureContent, testEnv } from '@/data/store.test-support';
import { ROAD_REF } from '@/island/building/actions';
import { roadCrew } from '.';
import { layParadeStone } from './paradeStone';

const { gameData } = fixtureContent();

const open: DataStore[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

async function storeWith(made: Recipe) {
  const store = await testEnv().open();
  open.push(store);
  if (Object.keys(made).length > 0) {
    await store.append(
      'material.produced',
      { sessionId: 's1', requestId: 'r1', workshopId: roadCrew.id, materials: made },
      { childId: CHILD_K },
    );
  }
  return store;
}

const written = async (store: DataStore) =>
  (await store.events()).map((e) => [e.type, e.payload] as const).slice(1);

describe("Road Crew's parade stone (05 §4 W1)", () => {
  it('a request that made stones lays the next one and keeps the others in the Storehouse', async () => {
    const made = { stone: 3 };
    const store = await storeWith(made);
    expect(await layParadeStone(store, CHILD_K, gameData, made)).toBe(1);
    expect(await written(store)).toEqual([
      ['road.extended', { to: 1 }],
      ['material.spent', { materials: { stone: 1 }, purpose: { kind: 'build', ref: ROAD_REF } }],
    ]);
    expect((await store.island()).roadLength).toBe(1);
    expect((await store.inventory()).materials.stone).toBe(2);
  });

  it('a request that made no stone lays none, whatever the Storehouse holds', async () => {
    const store = await storeWith({ stone: 4 });
    expect(await layParadeStone(store, CHILD_K, gameData, {})).toBeNull();
    expect(await written(store)).toEqual([]);
    expect((await store.inventory()).materials.stone).toBe(4);
  });

  it('where the road waits for land that is not open, every stone stays in the Storehouse', async () => {
    const made = { stone: 2 };
    const store = await storeWith(made);
    // Stones 1–6 lie on the sandbar; stone 7 is on the first shore, which is not open yet.
    await store.append('road.extended', { to: 6 }, { childId: CHILD_K });
    const before = (await store.events()).length;
    expect(await layParadeStone(store, CHILD_K, gameData, made)).toBeNull();
    expect((await store.events()).length).toBe(before);
    expect((await store.island()).roadLength).toBe(6);
    expect((await store.inventory()).materials.stone).toBe(2);
  });
});

describe("Road Crew's definition (02 §5.6)", () => {
  it('hosts the formats of 05 §4 W1 and makes road stones at the Road Crew building', () => {
    expect(roadCrew.formats).toEqual(['hundred-chart', 'number-line-jump', 'tap-count', 'order']);
    expect(roadCrew.strands).toEqual(['CNT', 'CMP']);
    expect(roadCrew.produces).toEqual(['stone']);
    const building = gameData.buildings.find((b) => b.id === roadCrew.building);
    expect(building?.workshopId).toBe(roadCrew.id);
  });
});
