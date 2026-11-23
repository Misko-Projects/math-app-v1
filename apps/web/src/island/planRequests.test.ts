// @vitest-environment node
// The island's plan over the real store and the fixture content: what a new child is offered,
// what a request brings to the Storehouse, and that the next plan reflects what was just played.

import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import * as engine from '@number-island/engine';
import {
  defaultChildSettings,
  type GeneratedItem,
  type PlannedRequest,
} from '@number-island/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DataStore } from '@/data/store';
import { CHILD_K, fixtureContent, profile, testEnv } from '@/data/store.test-support';
import { childContext } from '@/runner/childContext';
import { createTaskRunner, type RunnerEngine } from '@/runner/TaskRunner';
import { pierPlayable } from '@/workshops/practice-pier/pierRequest';
import {
  UNREGISTERED_PRODUCTS,
  WORKSHOPS,
  workshopCapabilities,
  workshopFor,
} from '@/workshops/registry';
import { planIslandRequests } from './planRequests';

const kid = profile(CHILD_K, 'K');
const child = childContext(kid, defaultChildSettings('K'));
const { graph, gameData } = fixtureContent();

beforeAll(() => {
  const compiled = compileContent(readContentFiles()).content;
  if (!compiled) throw new Error('the fixture content does not compile');
  engine.initContent({
    templates: compiled.templates,
    narration: compiled.narration,
    misconceptions: compiled.misconceptions,
  });
});

async function plan(store: DataStore): Promise<PlannedRequest[]> {
  const state = await store.skillStates(CHILD_K);
  if (!state) throw new Error('no learner state');
  return planIslandRequests(engine, {
    child,
    state,
    graph,
    gameData,
    island: await store.island(),
    now: store.now(),
    minutes: 10,
  });
}

/** Plays `request` to its end, every item right, and returns what it produced. */
async function playRight(store: DataStore, request: PlannedRequest) {
  const items: GeneratedItem[] = [];
  const spied: RunnerEngine = {
    ...engine,
    generateItem: (...args) => {
      const item = engine.generateItem(...args);
      items.push(item);
      return item;
    },
  };
  const runner = await createTaskRunner({
    engine: spied,
    store,
    graph,
    child,
    request,
    hosts: pierPlayable,
    session: {
      sessionId: 'session-1',
      elapsedMs: () => 0,
      budgetMs: 10 * 60_000,
      windingDown: () => false,
      recordMath: () => {},
      recordItem: () => {},
    },
  });
  for (let task = runner.current(); task; task = runner.next()) {
    if (task.kind !== 'item') throw new Error('this request has items only');
    await runner.submit(engine.itemExampleCorrect(items.at(-1) as GeneratedItem), {
      latencyMs: 2000,
    });
  }
  return runner.finish();
}

describe('workshop registration (02 §5.6)', () => {
  it('a request plays in its registered workshop, and on the Practice Pier when it has none', () => {
    expect(workshopFor('practice-pier').id).toBe('practice-pier');
    expect(workshopFor('road-crew').id).toBe('practice-pier');
    expect(WORKSHOPS.map((w) => w.id)).toContain('practice-pier');
  });

  it('the stand-in products are only for workshops that have not registered, and are real', () => {
    const materials = new Set(gameData.materials.map((m) => m.id));
    const workshops = new Set(gameData.buildings.flatMap((b) => b.workshopId ?? []));
    for (const [id, produces] of Object.entries(UNREGISTERED_PRODUCTS)) {
      expect(
        WORKSHOPS.some((w) => w.id === id),
        id,
      ).toBe(false);
      expect(workshops.has(id), id).toBe(true);
      for (const m of produces) expect(materials.has(m), m).toBe(true);
    }
  });

  it('on a new island the workshops that stand from the start are available, with their residents', async () => {
    const store = await testEnv().open();
    const caps = workshopCapabilities(gameData, await store.island());
    // Every workshop that makes a material is listed; only the free ones are available.
    expect(caps.filter((c) => !c.available).map((c) => c.workshopId)).toContain('ten-boat-dock');
    const available = caps.filter((c) => c.available);
    expect(available.map((c) => [c.workshopId, c.available, c.produces])).toEqual([
      ['road-crew', true, ['stone']],
      ['lantern-grove', true, ['light']],
      // The pier is registered: its entry brings the residents that like it; it makes no product
      // of its own (the planner gives it the asking resident's).
      ['practice-pier', true, []],
    ]);
    for (const cap of available.filter((c) => c.workshopId !== 'practice-pier')) {
      // Not registered yet: it hosts no format, so its requests go to the Practice Pier.
      expect(cap.formats).toEqual([]);
      expect(cap.residents.length).toBeGreaterThan(0);
      for (const id of cap.residents) {
        const resident = gameData.residents.find((r) => r.id === id);
        expect(resident?.starterBuddy, id).toBe(true);
        expect(resident?.affinity, id).toContain(cap.workshopId);
      }
    }
  });
});

describe('a built workshop makes its product (05 §4; #22 part 2)', () => {
  const placed = (store: DataStore, buildingId: string, plot: [number, number]) =>
    store.append(
      'building.placed',
      { instanceId: buildingId, buildingId, plot },
      { childId: CHILD_K },
    );

  it('once the Ten-Boat Dock stands, the residents who prefer it ask for planks, and a request makes them', async () => {
    const env = testEnv();
    const store = await env.open();
    await store.putProfile(kid);
    await placed(store, 'shell-cottage', [3, 4]);
    await store.append(
      'resident.arrived',
      { residentId: 'hobb', homeInstanceId: 'shell-cottage', via: 'home' },
      { childId: CHILD_K },
    );
    const before = workshopCapabilities(gameData, await store.island());
    const residentsOf = (caps: typeof before, id: string) =>
      caps.find((c) => c.workshopId === id)?.residents ?? [];
    // Before the dock: Seela and Hobb prefer it, and ask for what their next affinity makes.
    expect(before.find((c) => c.workshopId === 'ten-boat-dock')?.available).toBe(false);
    expect(residentsOf(before, 'lantern-grove')).toContain('seela');
    expect(residentsOf(before, 'road-crew')).toContain('hobb');

    await placed(store, 'ten-boat-dock', [1, 2]);
    const caps = workshopCapabilities(gameData, await store.island());
    const dock = caps.find((c) => c.workshopId === 'ten-boat-dock');
    expect(dock).toMatchObject({ available: true, produces: ['plank'], formats: [] });
    expect(dock?.residents).toEqual(expect.arrayContaining(['seela', 'hobb']));
    expect(residentsOf(caps, 'lantern-grove')).not.toContain('seela');
    expect(residentsOf(caps, 'road-crew')).not.toContain('hobb');
    // Stone and light are still asked for by the residents who prefer those.
    expect(residentsOf(caps, 'road-crew').length).toBeGreaterThan(0);
    expect(residentsOf(caps, 'lantern-grove').length).toBeGreaterThan(0);

    // The planner's own output: over a few visits a request asks for planks, and playing it
    // puts planks in the Storehouse.
    let plank: PlannedRequest | undefined;
    for (let visit = 0; visit < 12 && !plank; visit += 1) {
      env.clock.advance(60 * 60_000);
      plank = (await plan(store)).find((r) => 'plank' in r.reward.materials);
    }
    if (!plank) throw new Error('no request asked for planks in 12 visits');
    expect(plank.workshopId).toBe('practice-pier');
    expect(['seela', 'hobb']).toContain(plank.residentId);
    const summary = await playRight(store, plank);
    expect(summary.materials.plank).toBeGreaterThan(0);
    expect((await store.inventory()).materials.plank).toBe(summary.materials.plank);
  });
});

describe('the island plan (04 §6.3)', () => {
  it('offers a new child two or three requests, each voiced by a resident and making a material', async () => {
    const store = await testEnv().open();
    await store.putProfile(kid);
    const requests = await plan(store);
    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(requests.length).toBeLessThanOrEqual(3);
    for (const request of requests) {
      expect(request.workshopId).toBe('practice-pier');
      expect(gameData.residents.some((r) => r.id === request.residentId)).toBe(true);
      const made = Object.entries(request.reward.materials);
      expect(made).toHaveLength(1);
      expect(['stone', 'light']).toContain(made[0]?.[0]);
      expect(request.tasks.length).toBeGreaterThan(0);
    }
  });

  it('a played request fills the Storehouse, and the next plan reflects what was played', async () => {
    const env = testEnv();
    const store = await env.open();
    await store.putProfile(kid);
    const first = await plan(store);
    const recommended = first[0] as PlannedRequest;
    const summary = await playRight(store, recommended);
    const made = Object.entries(summary.materials);
    expect(made.length).toBeGreaterThan(0);
    // One unit per item answered right, of the material the resident asked for.
    expect(summary.materials).toEqual(recommended.reward.materials);
    expect((await store.inventory()).materials).toEqual(summary.materials);

    env.clock.advance(3 * 60_000);
    const next = await plan(store);
    expect(next.length).toBeGreaterThan(0);
    // The tasks just played are not offered again as they were: the plan moved on.
    const played = recommended.tasks.map((t) => `${t.templateId}:${t.seed}`);
    const offered = (next[0] as PlannedRequest).tasks.map((t) => `${t.templateId}:${t.seed}`);
    expect(offered).not.toEqual(played);
    expect(next.map((r) => r.id)).not.toContain(recommended.id);
  });
});
