// @vitest-environment node
// The wind-down recap over the real store (#22 part 4): what a child made and built in one
// session, and the line that says it.

import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import { afterEach, describe, expect, it } from 'vitest';
import type { DataStore } from '@/data/store';
import { CHILD_G2, CHILD_K, fixtureContent, profile, testEnv } from '@/data/store.test-support';
import { emptyRecap, recapPhrases, sessionRecap } from './recap';

const { gameData } = fixtureContent();

const open: DataStore[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

const made = (sessionId: string, materials: Record<string, number>) => ({
  sessionId,
  requestId: `r-${sessionId}`,
  workshopId: 'practice-pier',
  materials,
});

describe('the wind-down recap (06 §2)', () => {
  it("is this child's session: its products, and what the child built since it began", async () => {
    const env = testEnv();
    const store = await env.open();
    open.push(store);
    await store.putProfile(profile(CHILD_K, 'K', 'Ada'));
    await store.putProfile(profile(CHILD_G2, '2', 'Ben'));
    // Yesterday, and the sibling: neither is in today's recap.
    await store.append('material.produced', made('old', { stone: 9 }), { childId: CHILD_K });
    await store.append(
      'building.placed',
      { instanceId: 'shell-cottage', buildingId: 'shell-cottage', plot: [3, 4] },
      { childId: CHILD_K },
    );
    env.clock.advance(24 * 60 * 60_000);
    const session = { sessionId: 'today', startedAt: env.clock.now() };
    await store.append('material.produced', made('today', { stone: 3 }), { childId: CHILD_K });
    await store.append('material.produced', made('today', { stone: 2, light: 4 }), {
      childId: CHILD_K,
    });
    await store.append('material.produced', made('bens', { plank: 7 }), { childId: CHILD_G2 });
    await store.append('road.extended', { to: 1 }, { childId: CHILD_K });
    await store.append('road.extended', { to: 2 }, { childId: CHILD_K });
    await store.append(
      'building.placed',
      { instanceId: 'ten-boat-dock', buildingId: 'ten-boat-dock', plot: [1, 2] },
      { childId: CHILD_K },
    );
    await store.append(
      'building.upgraded',
      { instanceId: 'shell-cottage', level: 2 },
      { childId: CHILD_K },
    );
    await store.append(
      'building.upgraded',
      { instanceId: 'ten-boat-dock', level: 2 },
      { childId: CHILD_K },
    );
    await store.append(
      'building.placed',
      { instanceId: 'lantern-grove', buildingId: 'lantern-grove', plot: [6, 2] },
      { childId: CHILD_G2 },
    );

    const recap = sessionRecap(await store.events(), gameData, CHILD_K, session);
    expect(recap).toEqual({
      made: { stone: 5, light: 4 },
      built: ['ten-boat-dock', 'shell-cottage'],
      stones: 2,
    });
    expect(emptyRecap(recap)).toBe(false);
    expect(recapPhrases(recap, gameData)).toEqual([
      { id: 'ui.winddown.made' },
      { number: 5 },
      { id: 'game.material.stone' },
      { number: 4 },
      { id: 'game.material.light' },
      { id: 'ui.winddown.built' },
      { id: 'game.building.ten-boat-dock' },
      { id: 'game.building.shell-cottage' },
      { number: 2 },
      { id: 'game.material.stone' },
      { id: 'ui.winddown.done' },
    ]);

    // Ben's session made planks and a grove; a session with nothing is the goodbye alone.
    const bens = sessionRecap(await store.events(), gameData, CHILD_G2, {
      sessionId: 'bens',
      startedAt: session.startedAt,
    });
    expect(bens).toEqual({ made: { plank: 7 }, built: ['lantern-grove'], stones: 0 });
    const none = sessionRecap(await store.events(), gameData, CHILD_K, {
      sessionId: 'later',
      startedAt: env.clock.now() + 1,
    });
    expect(emptyRecap(none)).toBe(true);
    expect(recapPhrases(none, gameData)).toEqual([{ id: 'ui.winddown.done' }]);
  });

  it('every line the recap can say is a narration line', () => {
    const narration = compileContent(readContentFiles()).content?.narration ?? {};
    for (const key of [
      'ui.winddown.made',
      'ui.winddown.built',
      'ui.winddown.done',
      ...gameData.materials.map((m) => m.name),
      ...gameData.buildings.map((b) => `game.building.${b.id}`),
    ])
      expect(narration[key], key).toBeDefined();
  });
});
