// @vitest-environment node
// A full request through the TaskRunner with the fixture content, over the real data store on a
// fake IndexedDB (#20: "attempt events and projections update correctly").

import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import * as engine from '@number-island/engine';
import {
  type AnyEventEnvelope,
  type AttemptPayload,
  defaultChildSettings,
  type EventPayloads,
  type GeneratedItem,
  type InteractionEvent,
  type PlannedRequest,
  type PlannedTask,
  type ResponseValue,
} from '@number-island/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DataStore } from '@/data/store';
import { CHILD_K, fixtureContent, profile, testEnv } from '@/data/store.test-support';
import {
  browseRequest,
  pierPlayable,
  planPierRequest,
} from '@/workshops/practice-pier/pierRequest';
import { childContext } from './childContext';
import { createTaskRunner, type RunnerEngine, type RunnerSession } from './TaskRunner';

const SESSION = 'session-1';
const kid = profile(CHILD_K, 'K');
const child = childContext(kid, defaultChildSettings('K'));

beforeAll(() => {
  const compiled = compileContent(readContentFiles()).content;
  if (!compiled) throw new Error('the fixture content does not compile');
  engine.initContent({
    templates: compiled.templates,
    narration: compiled.narration,
    misconceptions: compiled.misconceptions,
  });
});

/** The engine, remembering each generated item so a test can answer it right or wrong. */
function spiedEngine() {
  const items: GeneratedItem[] = [];
  const spied: RunnerEngine = {
    ...engine,
    generateItem: (...args) => {
      const item = engine.generateItem(...args);
      items.push(item);
      return item;
    },
  };
  return { engine: spied, last: () => items.at(-1) as GeneratedItem, items };
}

function fakeSession(over: Partial<RunnerSession> = {}) {
  const log = { mathMs: 0, items: 0 };
  const session: RunnerSession = {
    sessionId: SESSION,
    elapsedMs: () => 0,
    budgetMs: 10 * 60_000,
    windingDown: () => false,
    recordMath: (ms) => {
      log.mathMs += ms;
    },
    recordItem: () => {
      log.items += 1;
    },
    ...over,
  };
  return { session, log };
}

async function openStore(): Promise<DataStore> {
  const store = await testEnv().open();
  await store.putProfile(kid);
  return store;
}

async function plannedRequest(store: DataStore): Promise<PlannedRequest> {
  const state = await store.skillStates(CHILD_K);
  if (!state) throw new Error('no learner state');
  const request = planPierRequest(engine, {
    child,
    state,
    graph: fixtureContent().graph,
    island: await store.island(),
    now: store.now(),
    minutes: 10,
  });
  if (!request) throw new Error('the planner offered nothing the pier can play');
  return request;
}

const wrongAnswer: ResponseValue = { kind: 'skip' };
const attempts = (events: AnyEventEnvelope[]) =>
  events.filter((e) => e.type === 'attempt').map((e) => e.payload as AttemptPayload);

describe('TaskRunner', () => {
  it('plays a planned request to the end: every attempt is logged and the projection follows', async () => {
    const store = await openStore();
    const request = await plannedRequest(store);
    const { engine: spied, last } = spiedEngine();
    const { session, log } = fakeSession();
    const runner = await createTaskRunner({
      residents: [],
      engine: spied,
      store,
      graph: fixtureContent().graph,
      child,
      session,
      request,
      hosts: pierPlayable,
    });

    expect(request.tasks.length).toBeGreaterThanOrEqual(3);
    expect(runner.progress()).toEqual({ done: 0, total: request.tasks.length, materialEarned: 0 });

    let played = 0;
    for (let task = runner.current(); task; task = runner.next()) {
      if (task.kind !== 'item') throw new Error('part 1 presents items only');
      // The UI never sees the answer (02 §5.8 PresentedItem).
      expect(task.item).not.toHaveProperty('answer');
      expect(task.item.prompt.text.length).toBeGreaterThan(0);
      const before = await store.skillStates(CHILD_K);
      const fb = await runner.submit(engine.itemExampleCorrect(last()), { latencyMs: 2345.6 });
      expect(fb).toMatchObject({ correct: true, retry: false, partialCredit: 1 });
      expect(fb.say.key).toMatch(/^fb\.(correct|praise)\./);
      const after = await store.skillStates(CHILD_K);
      expect(after?.nTotal).toBe((before?.nTotal ?? 0) + 1);
      played += 1;
      expect(runner.progress().done).toBe(played);
    }

    expect(runner.endReason()).toBe('complete');
    expect(played).toBe(runner.progress().total);
    const summary = await runner.finish();
    expect(summary).toMatchObject({ items: played, firstTryCorrect: played, reason: 'complete' });
    // Finishing twice writes one event.
    await runner.finish();

    const events = await store.events();
    const logged = attempts(events);
    expect(logged).toHaveLength(played);
    for (const a of logged) {
      const tpl = fixtureContent().graph.templates[a.templateId];
      expect(a).toMatchObject({
        sessionId: SESSION,
        correct: true,
        partialCredit: 1,
        latencyMs: 2346,
        hintsUsed: 0,
        attemptNo: 1,
        workshopId: 'practice-pier',
        format: tpl?.format,
        tier: tpl?.tier,
      });
      expect(a.representation.length).toBeGreaterThan(0);
    }
    expect(logged.map((a) => a.context)).toEqual(request.tasks.map((t) => t.context));
    expect(events.filter((e) => e.type === 'request.accepted')).toHaveLength(1);
    const completed = events.filter((e) => e.type === 'request.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]?.payload as EventPayloads['request.completed']).toMatchObject({
      requestId: request.id,
      items: played,
      firstTryCorrect: played,
      endedEarly: false,
    });

    // The cached projection equals a fold of the log, and every played skill is in it.
    const state = await store.skillStates(CHILD_K);
    expect(state?.nTotal).toBe(played);
    for (const a of logged) expect(state?.skills[a.skillId]?.n).toBeGreaterThan(0);
    // Math density (04 §7): the runner reports each item and its interaction time to the session.
    expect(log).toEqual({ items: played, mathMs: played * 2346 });
  });

  it('a wrong first try is tried again on the same item; a second wrong moves on', async () => {
    const store = await openStore();
    const graph = fixtureContent().graph;
    const skill = graph.nodes.find((s) =>
      (graph.skills[s]?.templates ?? []).some((id) => graph.templates[id]?.format === 'number-pad'),
    );
    if (!skill) throw new Error('no number-pad skill in the fixture content');
    const request = browseRequest(graph, { skillId: skill, templateId: null }, 11);
    const { engine: spied, last, items } = spiedEngine();
    const { session, log } = fakeSession();
    const runner = await createTaskRunner({
      residents: [],
      engine: spied,
      store,
      graph,
      child,
      session,
      request,
      hosts: pierPlayable,
    });

    const first = runner.current();
    const fb1 = await runner.submit(wrongAnswer, { latencyMs: 3000 });
    expect(fb1).toMatchObject({ correct: false, retry: true, partialCredit: 0 });
    const again = runner.next();
    expect(again).toMatchObject({ kind: 'item', attemptNo: 2 });
    expect(again && again.kind === 'item' && again.item).toBe(
      first && first.kind === 'item' && first.item,
    );
    expect(items).toHaveLength(1);
    expect(runner.progress().done).toBe(0);

    const fb2 = await runner.submit(wrongAnswer, { latencyMs: 3000 });
    expect(fb2).toMatchObject({ correct: false, retry: false });
    expect(fb2.say.key).toBe('fb.reveal');
    expect(runner.progress().done).toBe(1);
    // An item that is resolved takes no further answer.
    await expect(runner.submit(wrongAnswer, { latencyMs: 1 })).rejects.toThrow(/no item/);

    const logged = attempts(await store.events());
    expect(logged.map((a) => [a.attemptNo, a.correct, a.seed])).toEqual([
      [1, false, last().seed],
      [2, false, last().seed],
    ]);
    // Only the first try is rated (04 §2.3), and one item was played.
    expect((await store.skillStates(CHILD_K))?.nTotal).toBe(1);
    expect(log.items).toBe(1);

    // Leaving now ends the request early.
    const summary = await runner.finish();
    expect(summary).toMatchObject({ items: 1, firstTryCorrect: 0 });
    if (request.tasks.length > 1) expect(summary.reason).toBe('child-exit');
  });

  it('winds down after the current item: the item is finished, then the request ends', async () => {
    const store = await openStore();
    const request = await plannedRequest(store);
    const { engine: spied, last } = spiedEngine();
    let winding = false;
    const { session } = fakeSession({ windingDown: () => winding });
    const runner = await createTaskRunner({
      residents: [],
      engine: spied,
      store,
      graph: fixtureContent().graph,
      child,
      session,
      request,
      hosts: pierPlayable,
    });

    await runner.submit(engine.itemExampleCorrect(last()), { latencyMs: 1000 });
    expect(runner.next()).not.toBeNull();
    // The session signals its wind-down while the second item is on screen.
    winding = true;
    expect(runner.current()).not.toBeNull();
    const fb = await runner.submit(wrongAnswer, { latencyMs: 4000 });
    // The current item still gets its second try.
    expect(fb.retry).toBe(true);
    expect(runner.next()).toMatchObject({ attemptNo: 2 });
    await runner.submit(engine.itemExampleCorrect(last()), { latencyMs: 4000 });
    expect(runner.next()).toBeNull();
    expect(runner.endReason()).toBe('wind-down');
    expect(await runner.finish()).toMatchObject({
      items: 2,
      firstTryCorrect: 1,
      reason: 'wind-down',
    });
    const completed = (await store.events()).find((e) => e.type === 'request.completed');
    expect(completed?.payload).toMatchObject({ items: 2, endedEarly: true });
  });

  it('opens no item after a wind-down signalled while the feedback was showing', async () => {
    const store = await openStore();
    const request = await plannedRequest(store);
    const { engine: spied, last } = spiedEngine();
    let winding = false;
    const { session } = fakeSession({ windingDown: () => winding });
    const runner = await createTaskRunner({
      residents: [],
      engine: spied,
      store,
      graph: fixtureContent().graph,
      child,
      session,
      request,
      hosts: pierPlayable,
    });

    const fb = await runner.submit(engine.itemExampleCorrect(last()), { latencyMs: 1000 });
    expect(fb.correct).toBe(true);
    // The item is resolved and more tasks are planned; the signal arrives before "next".
    winding = true;
    expect(runner.next()).toBeNull();
    expect(runner.endReason()).toBe('wind-down');
    expect(await runner.finish()).toMatchObject({
      items: 1,
      firstTryCorrect: 1,
      reason: 'wind-down',
    });
  });

  it('logs a misconception once per item, however many tries repeat it', async () => {
    const store = await openStore();
    const graph = fixtureContent().graph;
    const { engine: spied, last } = spiedEngine();
    const { session } = fakeSession();
    // A shipped "how many?" item with at least four objects (CNT.02.t1, tap-count).
    let runner: Awaited<ReturnType<typeof createTaskRunner>> | null = null;
    let count = 0;
    for (let nonce = 1; nonce < 40 && count < 4; nonce += 1) {
      runner = await createTaskRunner({
        residents: [],
        engine: spied,
        store,
        graph,
        child,
        session,
        request: browseRequest(graph, { skillId: 'CNT.02', templateId: 'CNT.02.t1' }, nonce),
        hosts: pierPlayable,
      });
      const right = engine.itemExampleCorrect(last());
      count = right.kind === 'number' ? right.value : 0;
    }
    if (!runner || count < 4) throw new Error('no CNT.02.t1 item with four objects');
    expect(last().format).toBe('tap-count');
    const before = (await store.events()).length;

    // The child misses one object and answers one too few, then presses Check again unchanged.
    const oneShort: ResponseValue = { kind: 'number', value: count - 1 };
    const first = await runner.submit(oneShort, { latencyMs: 4000, trace: [] });
    expect(first.misconceptionIds).toEqual(['MC.off-by-one-counting']);
    expect(first.retry).toBe(true);
    runner.next();
    const second = await runner.submit(oneShort, { latencyMs: 4000, trace: [] });
    expect(second.misconceptionIds).toEqual([]);

    const logged = attempts((await store.events()).slice(before));
    expect(logged.map((a) => [a.attemptNo, a.misconceptionIds])).toEqual([
      [1, ['MC.off-by-one-counting']],
      [2, []],
    ]);
    const hits = (await store.skillStates(CHILD_K))?.skills['CNT.02']?.misconceptionHits ?? [];
    expect(hits.map((h) => h.id)).toEqual(['MC.off-by-one-counting']);
  });

  it('counting again on the second try is not logged as a recount', async () => {
    const store = await openStore();
    const graph = fixtureContent().graph;
    const { engine: spied, last } = spiedEngine();
    const { session } = fakeSession();
    const start = (nonce: number) =>
      createTaskRunner({
        residents: [],
        engine: spied,
        store,
        graph,
        child,
        session,
        request: browseRequest(graph, { skillId: 'CNT.03', templateId: 'CNT.03.t1' }, nonce),
        hosts: pierPlayable,
      });
    const tap = (i: number, ms: number): InteractionEvent => ({ t: 'tap', target: `obj-${i}`, ms });
    const countOf = () => {
      const right = engine.itemExampleCorrect(last());
      return right.kind === 'number' ? right.value : 0;
    };
    const pass = (n: number, from: number) => Array.from({ length: n }, (_, i) => tap(i, from + i));

    // The child counts every object once, answers two too many, then counts again as the retry
    // line asks ("Let's count again. Touch each one once.") and answers right.
    let runner = await start(3);
    let n = countOf();
    expect(n).toBeGreaterThanOrEqual(2);
    const first = await runner.submit(
      { kind: 'number', value: n + 2 },
      { latencyMs: 5000, trace: pass(n, 0) },
    );
    expect(first).toMatchObject({ correct: false, retry: true, misconceptionIds: [] });
    runner.next();
    const second = await runner.submit(
      { kind: 'number', value: n },
      { latencyMs: 5000, trace: [...pass(n, 0), ...pass(n, 100)] },
    );
    expect(second).toMatchObject({ correct: true, misconceptionIds: [] });
    expect((await store.skillStates(CHILD_K))?.skills['CNT.03']?.misconceptionHits ?? []).toEqual(
      [],
    );

    // The same two passes before a first answer are a recount, and are logged (the rule is live).
    runner = await start(4);
    n = countOf();
    const recount = await runner.submit(
      { kind: 'number', value: n },
      { latencyMs: 5000, trace: [...pass(n, 0), ...pass(n, 100)] },
    );
    expect(recount.misconceptionIds).toEqual(['MC.recount-from-one']);
  });

  it('finishing while an answer is being written counts that attempt', async () => {
    const store = await openStore();
    const request = await plannedRequest(store);
    const { engine: spied, last } = spiedEngine();
    const { session, log } = fakeSession();
    const runner = await createTaskRunner({
      residents: [],
      engine: spied,
      store,
      graph: fixtureContent().graph,
      child,
      session,
      request,
      hosts: pierPlayable,
    });

    // The child presses Check and then Home before the write has finished.
    const writing = runner.submit(engine.itemExampleCorrect(last()), { latencyMs: 1500 });
    // The session has the item and its time at once: a session that ends now (the child left
    // during a wind-down, and the child home ends it) saves totals that include this answer.
    expect(log).toEqual({ items: 1, mathMs: 1500 });
    const summary = await runner.finish();
    await writing;
    expect(summary).toMatchObject({ items: 1, firstTryCorrect: 1, reason: 'child-exit' });
    const types = (await store.events()).map((e) => e.type);
    expect(types).toEqual(['request.accepted', 'attempt', 'request.completed']);
  });

  it('drops an inserted task the pier cannot show', async () => {
    const store = await openStore();
    const graph = fixtureContent().graph;
    const request = browseRequest(graph, { skillId: 'PV.01', templateId: null }, 5);
    // A format without a widget: the pier cannot show it (nothing is excluded for its size, #13).
    const excluded = Object.values(graph.templates).find((t) => !pierPlayable(t))?.id as string;
    expect(excluded).toBeDefined();
    const playable = request.tasks[0] as PlannedTask;
    let inserted = false;
    const { engine: base, last } = spiedEngine();
    const spied: RunnerEngine = {
      ...base,
      adaptNext: (input) => {
        const decision = engine.adaptNext(input);
        if (inserted || decision.action !== 'continue') return decision;
        inserted = true;
        return {
          ...decision,
          insert: [
            { ...playable, templateId: excluded, seed: 91 },
            { ...playable, seed: 92 },
          ],
        };
      },
    };
    const { session } = fakeSession();
    const runner = await createTaskRunner({
      residents: [],
      engine: spied,
      store,
      graph,
      child,
      session,
      request,
      hosts: pierPlayable,
    });
    const before = runner.progress().total;

    await runner.submit(engine.itemExampleCorrect(last()), { latencyMs: 2000 });
    expect(inserted).toBe(true);
    expect(runner.progress().total).toBe(before + 1);
    const next = runner.next();
    expect(next?.kind === 'item' && [next.item.templateId, next.item.seed]).toEqual([
      playable.templateId,
      92,
    ]);
  });
});
