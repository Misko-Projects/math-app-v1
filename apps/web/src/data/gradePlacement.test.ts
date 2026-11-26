// @vitest-environment node
// The grade-prior placement over the real store and the fixture content (04 §5, Refs #26): written
// once per child and grade, converging when two devices both write it, moving only untried skills
// when the grade changes, and what the first plan of each kind of new child then holds.

import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import * as engine from '@number-island/engine';
import {
  type AttemptPayload,
  type ChildProfile,
  defaultChildSettings,
  type Grade,
} from '@number-island/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { planIslandRequests } from '@/island/planRequests';
import { childContext } from '@/runner/childContext';
import { ensureGradePlacement, gradePriorId } from './gradePlacement';
import type { DataStore } from './store';
import { CHILD_K, fixtureContent, profile, testEnv } from './store.test-support';

const { graph: contentGraph, gameData } = fixtureContent();
// A fixed version name, so the plans change only when the planner or what it reads changes.
const graph = { ...contentGraph, contentVersion: 'grade-placement-test' };

beforeAll(() => {
  const compiled = compileContent(readContentFiles()).content;
  if (!compiled) throw new Error('the fixture content does not compile');
  engine.initContent({
    templates: compiled.templates,
    narration: compiled.narration,
    misconceptions: compiled.misconceptions,
  });
});

const kid = (grade: Grade, advanced = false): ChildProfile => ({
  ...profile(CHILD_K, grade),
  advanced,
});
const ctx = (p: ChildProfile) => childContext(p, defaultChildSettings(p.grade));

async function open(p: ChildProfile, name = 'test', env = testEnv()): Promise<DataStore> {
  const store = await env.open(name);
  await store.putProfile(p);
  return store;
}

const placements = async (store: DataStore) =>
  (await store.events()).filter((e) => engine.isEvent(e, 'placement.completed'));

const DAY = 86_400_000;

/** The skills of each request the island offers the new child `after` ms after placement. */
async function firstRequests(p: ChildProfile, after = 0): Promise<string[][]> {
  const store = await open(p);
  await ensureGradePlacement(engine, store, graph, ctx(p));
  const state = await store.skillStates(p.id);
  if (!state) throw new Error('no learner state');
  const { requests } = planIslandRequests(engine, {
    child: ctx(p),
    state,
    graph,
    gameData,
    island: await store.island(),
    inventory: await store.inventory(),
    now: store.now() + after,
    minutes: 10,
  });
  return requests.map((r) => [...new Set(r.tasks.map((t) => t.skillId))]);
}

const gradeOf = (s: string) => graph.skills[s]?.grade;

describe('the grade-prior placement', () => {
  it('is written once per child and grade, with the engine prior of the profile', async () => {
    const p = kid('2', true);
    const store = await open(p);
    // Two plan runs at once (a re-render) share one check: one event.
    const both = await Promise.all([
      ensureGradePlacement(engine, store, graph, ctx(p)),
      ensureGradePlacement(engine, store, graph, ctx(p)),
    ]);
    expect(both).toEqual([true, true]);
    expect(await ensureGradePlacement(engine, store, graph, ctx(p))).toBe(false);
    const [e, ...rest] = await placements(store);
    expect(rest).toEqual([]);
    const state = engine.foldLearnerState([], graph, { childId: p.id, isK: false });
    expect(e?.payload).toEqual(
      engine.gradePriorPlacement({ graph, child: ctx(p), state, placementId: 'grade-prior:2+' }),
    );
    expect(e?.childId).toBe(p.id);
  });

  it('two devices that both wrote it converge on the state of one', async () => {
    const p = kid('1');
    // Two tablets of one family (one clock and id source, two databases), both offline.
    const env = testEnv();
    const a = await open(p, 'a', env);
    const b = await open(p, 'b', env);
    await ensureGradePlacement(engine, a, graph, ctx(p));
    env.clock.advance(60_000);
    await ensureGradePlacement(engine, b, graph, ctx(p));
    const one = await a.skillStates(p.id);
    await a.ingest(await b.events(), { source: 'server' });
    await b.ingest(await a.events(), { source: 'server' });
    expect(await placements(a)).toHaveLength(2);
    expect(await a.skillStates(p.id)).toEqual(one);
    expect(await b.skillStates(p.id)).toEqual(one);
    // Neither writes another: the latest is already for grade 1.
    expect(await ensureGradePlacement(engine, a, graph, ctx(p))).toBe(false);
  });

  it('a changed grade gives untried skills a new start and keeps the evidence of tried ones', async () => {
    const k = kid('K');
    const store = await open(k);
    await ensureGradePlacement(engine, store, graph, ctx(k));
    const tried = 'CNT.01';
    const tpl = graph.templates[graph.skills[tried]?.templates[0] as string];
    if (!tpl) throw new Error('no template');
    const a: AttemptPayload = {
      sessionId: 's1',
      skillId: tried,
      templateId: tpl.id,
      seed: 1,
      params: {},
      format: tpl.format,
      tier: tpl.tier,
      representation: tpl.representation ?? 'objects',
      response: { kind: 'number', value: 1 },
      correct: false,
      partialCredit: 0,
      latencyMs: 3_000,
      hintsUsed: 0,
      attemptNo: 1,
      misconceptionIds: [],
      context: 'practice',
      workshopId: null,
    };
    await store.append('attempt', a, { childId: k.id });
    const before = await store.skillStates(k.id);
    const g2 = kid('2');
    await store.putProfile(g2);
    expect(await ensureGradePlacement(engine, store, graph, ctx(g2))).toBe(true);
    const after = await store.skillStates(k.id);
    const latest = (await placements(store)).at(-1);
    expect(latest?.payload).toMatchObject({ placementId: gradePriorId(g2), items: 0 });
    expect(Object.keys(latest?.payload.posterior ?? {})).not.toContain(tried);
    expect(after?.skills[tried]).toEqual(before?.skills[tried]);
    expect(after?.placement.prior?.p[tried]).toBe(before?.placement.prior?.p[tried]);
    // A grade-1 skill nobody tried is now assumed known (K and grade 1 are below grade 2).
    const g1 = Object.keys(graph.skills).find((s) => gradeOf(s) === '1') as string;
    expect(before?.skills[g1]?.assumed ?? false).toBe(false);
    expect(after?.skills[g1]?.assumed).toBe(true);
    // Back to K: a new placement again, the tried skill still untouched.
    expect(await ensureGradePlacement(engine, store, graph, ctx(k))).toBe(true);
    expect((await store.skillStates(k.id))?.skills[tried]).toEqual(before?.skills[tried]);
  });
});

describe('the first plan of a new child', () => {
  const all = (plan: string[][]) => plan.flat();

  it('K: starts at the roots', async () => {
    const plan = await firstRequests(kid('K'));
    expect(plan).toMatchInlineSnapshot(`
      [
        [
          "CNT.01",
        ],
        [
          "GEO.01",
        ],
      ]
    `);
    expect(all(plan).every((s) => gradeOf(s) === 'K')).toBe(true);
  });

  it('advanced K: not all the first counting skill', async () => {
    const plan = await firstRequests(kid('K', true));
    expect(plan).toMatchInlineSnapshot(`
      [
        [
          "CNT.11",
          "ADD.15",
        ],
        [
          "PV.09",
          "ADD.01",
        ],
      ]
    `);
    expect(all(plan).some((s) => s !== 'CNT.01')).toBe(true);
  });

  it('grade 1', async () => {
    const plan = await firstRequests(kid('1'));
    expect(plan).toMatchInlineSnapshot(`
      [
        [
          "CNT.11",
          "ADD.15",
        ],
        [
          "PV.09",
          "ADD.01",
        ],
        [
          "CNT.10",
          "ADD.15",
        ],
      ]
    `);
    expect(all(plan).some((s) => s !== 'CNT.01')).toBe(true);
  });

  it('grade 2', async () => {
    const plan = await firstRequests(kid('2'));
    expect(plan).toMatchInlineSnapshot(`
      [
        [
          "PV.12",
          "ADD.01",
        ],
        [
          "PV.04",
          "ADD.01",
        ],
        [
          "ADD.06",
          "ADD.14",
          "ADD.01",
        ],
      ]
    `);
  });

  it('advanced grade 2: everything shipped is assumed; the verification reviews reach grade 2', async () => {
    // Advanced counts as grade 3, so every shipped skill (K to grade 2) has the prior 0.85 and is
    // assumed. With no skill left to introduce, the first session practises facts, and the
    // assumed skills come up for verification after their first interval (04 §5, I = 2 days).
    // The facts include grade 2's (ADD.14, ADD.22): assumed is practiced, not fluent (04 §6.5).
    const facts = new Set(['ADD.14', 'ADD.22']);
    const plan = await firstRequests(kid('2', true));
    expect(all(plan).some((s) => gradeOf(s) === '2' && !facts.has(s))).toBe(false);
    const later = await firstRequests(kid('2', true), 2.1 * DAY);
    expect(later).toMatchInlineSnapshot(`
      [
        [
          "ADD.06",
          "MDA.19",
          "MDA.22",
          "MON.03",
          "ADD.01",
        ],
        [
          "MUL.04",
          "MDA.19",
          "MDA.22",
          "ADD.01",
        ],
        [
          "MUL.05",
          "MDA.19",
          "MDA.22",
          "ADD.01",
        ],
      ]
    `);
    // Grade 2's verification reviews (place value before #17 slice 2a, two-digit adding since).
    expect(all(later).some((s) => gradeOf(s) === '2' && !facts.has(s))).toBe(true);
    expect(plan).toMatchInlineSnapshot(`
      [
        [
          "ADD.06",
          "ADD.14",
          "ADD.01",
        ],
        [
          "MUL.04",
          "ADD.01",
        ],
        [
          "MUL.05",
          "ADD.01",
        ],
      ]
    `);
  });
});
