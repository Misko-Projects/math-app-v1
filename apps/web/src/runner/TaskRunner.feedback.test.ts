// @vitest-environment node
// The feedback flow of the TaskRunner (#20 part 2: "the hint ladder, show-solution, tier
// step-down, prerequisite probe and frustration rules are observable in tests"), with the shipped
// content over the real data store on a fake IndexedDB.

import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import * as engine from '@number-island/engine';
import {
  type AdaptDecision,
  type AnyEventEnvelope,
  type AttemptPayload,
  defaultChildSettings,
  type EventPayloads,
  type GeneratedItem,
  type ItemTemplate,
  type MisconceptionSpec,
  type PlannedRequest,
  type PlannedTask,
  type ResponseValue,
  type SkillId,
  type Tier,
} from '@number-island/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DataStore } from '@/data/store';
import { CHILD_K, fixtureContent, profile, testEnv } from '@/data/store.test-support';
import { pierPlayable, planPierRequest } from '@/workshops/practice-pier/pierRequest';
import { childContext } from './childContext';
import { createRemediationQueue } from './remediationQueue';
import {
  createTaskRunner,
  type QueuedRemediation,
  type RunnerEngine,
  type RunnerSession,
} from './TaskRunner';

const kid = profile(CHILD_K, 'K');
const child = childContext(kid, defaultChildSettings('K'));
const graph = () => fixtureContent().graph;

beforeAll(() => {
  const compiled = compileContent(readContentFiles()).content;
  if (!compiled) throw new Error('the content does not compile');
  engine.initContent({
    templates: compiled.templates,
    narration: compiled.narration,
    misconceptions: compiled.misconceptions,
  });
});

const session: RunnerSession = {
  sessionId: 'session-1',
  elapsedMs: () => 0,
  budgetMs: 10 * 60_000,
  windingDown: () => false,
  recordMath: () => {},
  recordItem: () => {},
};

/** A wrong answer of every format, with no misconception in it. */
const wrong: ResponseValue = { kind: 'skip' };
/** Slow enough never to be a rapid tap. */
const meta = { latencyMs: 3000 };

function request(tasks: PlannedTask[], materials: PlannedRequest['reward']['materials'] = {}) {
  return {
    id: 'request-1',
    residentId: 'pip',
    workshopId: 'practice-pier',
    tasks,
    reward: { materials },
    narration: 'req.help',
    vars: {},
  } satisfies PlannedRequest;
}

const task = (t: ItemTemplate, seed: number): PlannedTask => ({
  skillId: t.skillId,
  templateId: t.id,
  seed,
  context: 'practice',
  mode: 'item',
});

const template = (id: string): ItemTemplate => {
  const t = graph().templates[id];
  if (!t) throw new Error(`no template ${id}`);
  return t;
};

async function start(
  tasks: PlannedTask[],
  over: {
    materials?: PlannedRequest['reward']['materials'];
    queue?: QueuedRemediation[];
    misconceptions?: MisconceptionSpec[];
  } = {},
) {
  const store: DataStore = await testEnv().open();
  await store.putProfile(kid);
  const items: GeneratedItem[] = [];
  const decisions: AdaptDecision[] = [];
  const spied: RunnerEngine = {
    ...engine,
    generateItem: (...args) => {
      const item = engine.generateItem(...args);
      items.push(item);
      return item;
    },
    adaptNext: (input) => {
      const decision = engine.adaptNext(input);
      decisions.push(decision);
      return decision;
    },
  };
  const runner = await createTaskRunner({
    engine: spied,
    store,
    graph: graph(),
    child,
    session,
    request: request(tasks, over.materials),
    hosts: pierPlayable,
    misconceptions: over.misconceptions,
    queueRemediation: (r) => over.queue?.push(r),
  });
  const last = () => items.at(-1) as GeneratedItem;
  const events = async <T extends keyof EventPayloads>(type: T) =>
    ((await store.events()) as AnyEventEnvelope[])
      .filter((e) => e.type === type)
      .map((e) => e.payload as EventPayloads[T]);
  return {
    runner,
    store,
    last,
    decisions,
    events,
    right: () => runner.submit(engine.itemExampleCorrect(last()), meta),
    /** Both tries wrong: the item ends with its worked solution. */
    async miss() {
      await runner.submit(wrong, meta);
      runner.next();
      return runner.submit(wrong, meta);
    },
  };
}

const ladder = (item: GeneratedItem) =>
  item.hints.map((h) => h.level).filter((level) => level >= 2 && level <= 4);

/** A shipped "how many?" item (tap-count, concrete). */
const COUNT = 'CNT.02.t1';

describe('the hint ladder', () => {
  it('a wrong first try shows the first rung, and a right second try is half credit', async () => {
    const play = await start([task(template(COUNT), 3)]);
    const fb = await play.runner.submit(wrong, meta);
    expect(fb).toMatchObject({ correct: false, retry: true, solution: null });
    expect(fb.hint).toMatchObject({ level: 2, kind: 'nudge' });
    expect(fb.hint?.say).toBe(template(COUNT).narration.hints[0]);
    expect(await play.events('hint.used')).toEqual([
      {
        sessionId: 'session-1',
        skillId: 'CNT.02',
        templateId: COUNT,
        seed: play.last().seed,
        level: 2,
      },
    ]);
    expect(play.runner.next()).toMatchObject({ kind: 'item', attemptNo: 2, hintLevel: 2 });

    const second = await play.right();
    expect(second).toMatchObject({ correct: true, partialCredit: 0.5, retry: false, hint: null });
    const attempts = (await play.events('attempt')) as AttemptPayload[];
    expect(attempts.map((a) => [a.attemptNo, a.hintsUsed, a.partialCredit])).toEqual([
      [1, 0, 0],
      [2, 1, 0.5],
    ]);
  });

  it('the lightbulb climbs the rungs in order, each used once, and a hinted right answer is half credit', async () => {
    // A template with all three hint keys: rungs 2, 3 and 4.
    const full = Object.values(graph().templates).find(
      (t) => t.narration.hints.length === 3 && pierPlayable(t),
    );
    if (!full) throw new Error('no template with three hints');
    const play = await start([task(full, 5)]);
    const rungs = ladder(play.last());
    expect(rungs).toEqual([2, 3, 4]);
    const asked = [play.runner.hint(), play.runner.hint(), play.runner.hint()];
    expect(asked.map((h) => h?.level)).toEqual([2, 3, 4]);
    expect(asked.map((h) => h?.say)).toEqual(full.narration.hints);
    expect(play.runner.current()).toMatchObject({ hintLevel: 4 });
    // The ladder is used up: the top rung again, and nothing more is logged.
    expect(play.runner.hint()?.level).toBe(4);

    const fb = await play.right();
    expect(fb).toMatchObject({ correct: true, partialCredit: 0.5 });
    expect((await play.events('hint.used')).map((h) => h.level)).toEqual([2, 3, 4]);
    const [attempt] = (await play.events('attempt')) as AttemptPayload[];
    expect(attempt).toMatchObject({ attemptNo: 1, hintsUsed: 3, partialCredit: 0.5 });
    // The item is resolved: no hint without an item waiting for an answer.
    expect(play.runner.hint()).toBeNull();
  });

  it('a retry after a hint the child asked for shows the next rung, not the same one', async () => {
    const two = Object.values(graph().templates).find(
      (t) => t.narration.hints.length >= 2 && pierPlayable(t),
    );
    if (!two) throw new Error('no template with two hints');
    const play = await start([task(two, 5)]);
    expect(play.runner.hint()?.level).toBe(2);
    const fb = await play.runner.submit(wrong, meta);
    expect(fb.hint?.level).toBe(3);
    expect((await play.events('hint.used')).map((h) => h.level)).toEqual([2, 3]);
    const [attempt] = (await play.events('attempt')) as AttemptPayload[];
    expect(attempt).toMatchObject({ attemptNo: 1, hintsUsed: 1, partialCredit: 0 });
  });

  it('a second wrong answer brings the worked solution, logged as level 5, and the item is over', async () => {
    const play = await start([task(template(COUNT), 3), task(template(COUNT), 4)]);
    const fb = await play.miss();
    expect(fb).toMatchObject({ correct: false, retry: false, hint: null });
    expect(fb.say.key).toBe('fb.reveal');
    expect(fb.solution).toEqual(engine.itemSolution(play.last()));
    expect(fb.solution?.length).toBeGreaterThan(0);
    expect((await play.events('hint.used')).map((h) => h.level)).toEqual([2, 5]);
    expect(play.runner.progress()).toMatchObject({ done: 1, materialEarned: 0 });
    // "next" moves on to the next item, with a ladder of its own.
    expect(play.runner.next()).toMatchObject({ kind: 'item', attemptNo: 1, hintLevel: 0 });
  });
});

describe('misconceptions and the line that is spoken', () => {
  const misconceptions = () => {
    const compiled = compileContent(readContentFiles()).content;
    if (!compiled) throw new Error('the content does not compile');
    return compiled.misconceptions;
  };

  it('a wrong answer that matches a misconception is answered with its line, then the hint', async () => {
    const play = await start(
      [1, 2, 3, 4, 5, 6].map((seed) => task(template(COUNT), seed)),
      { misconceptions: misconceptions() },
    );
    let count = 0;
    for (;;) {
      const right = engine.itemExampleCorrect(play.last());
      count = right.kind === 'number' ? right.value : 0;
      if (count >= 4) break;
      await play.right();
      if (!play.runner.next()) throw new Error('no item with four objects');
    }
    const fb = await play.runner.submit({ kind: 'number', value: count - 1 }, meta);
    expect(fb.misconceptionIds).toEqual(['MC.off-by-one-counting']);
    expect(fb.say.key).toBe('fb.mc.off-by-one-counting');
    expect(fb.hint?.level).toBe(2);
  });

  it('a misconception seen in how the child worked chooses the line on the first try only', async () => {
    const t = template('CNT.03.t1');
    const play = await start([task(t, 3)], { misconceptions: misconceptions() });
    const right = engine.itemExampleCorrect(play.last());
    const n = right.kind === 'number' ? right.value : 0;
    expect(n).toBeGreaterThanOrEqual(2);
    const pass = (from: number) =>
      Array.from({ length: n }, (_, i) => ({
        t: 'tap' as const,
        target: `obj-${i}`,
        ms: from + i,
      }));
    // Counted twice from the start, and the answer is wrong.
    const twice = [...pass(0), ...pass(100)];
    const first = await play.runner.submit(
      { kind: 'number', value: n + 2 },
      { latencyMs: 5000, trace: twice },
    );
    expect(first.misconceptionIds).toEqual(['MC.recount-from-one']);
    expect(first.say.key).toBe('fb.mc.recount-from-one');
    expect(first.feedback).toBe('fb.mc.recount-from-one');
    play.runner.next();
    // The second try is not judged for it again: the worked solution's own line.
    const second = await play.runner.submit(
      { kind: 'number', value: n + 2 },
      { latencyMs: 5000, trace: [...twice, ...pass(200)] },
    );
    expect(second.misconceptionIds).toEqual([]);
    expect(second.say.key).toBe('fb.reveal');
  });
});

describe('in-request adaptation', () => {
  it('two first-try wrongs in a row on a skill step it one tier down for the rest of the request', async () => {
    const below: Record<Tier, Tier | null> = {
      abstract: 'pictorial',
      pictorial: 'concrete',
      concrete: null,
    };
    // A constructed-answer template whose skill has a playable template one tier below it.
    let from: ItemTemplate | undefined;
    for (const t of Object.values(graph().templates)) {
      const lower = below[t.tier];
      const siblings = (graph().skills[t.skillId]?.templates ?? []).map((id) => template(id));
      if (
        t.format === 'number-pad' &&
        lower &&
        siblings.some((s) => s.tier === lower && pierPlayable(s))
      ) {
        from = t;
        break;
      }
    }
    if (!from) throw new Error('no skill with a tier to step down to');
    const play = await start([task(from, 1), task(from, 2), task(from, 3)]);
    await play.miss();
    expect(play.runner.next()).toMatchObject({ tier: from.tier });
    await play.miss();
    const third = play.runner.next();
    expect(third).toMatchObject({ kind: 'item', tier: below[from.tier] });
    expect(third?.kind === 'item' && third.item.templateId).not.toBe(from.id);
    expect(third?.kind === 'item' && third.item.skillId).toBe(from.skillId);
  });

  it('three first-try wrongs on a skill insert a probe of a prerequisite; failing it ends the request', async () => {
    // A skill with a prerequisite that has a template in the same format.
    let from: ItemTemplate | undefined;
    for (const t of Object.values(graph().templates)) {
      const prereqs = graph().prereqs[t.skillId] ?? [];
      const hosted = prereqs.some((p) =>
        (graph().skills[p]?.templates ?? []).some((id) => template(id).format === t.format),
      );
      if (t.format === 'number-pad' && t.tier === 'concrete' && hosted) {
        from = t;
        break;
      }
    }
    from ??= Object.values(graph().templates).find(
      (t) =>
        t.format === 'number-pad' &&
        (graph().prereqs[t.skillId] ?? []).some((p) =>
          (graph().skills[p]?.templates ?? []).some((id) => template(id).format === t.format),
        ),
    );
    if (!from) throw new Error('no skill with a probe-able prerequisite');
    const play = await start([1, 2, 3, 4, 5, 6, 7].map((seed) => task(from as ItemTemplate, seed)));
    // Wrong, wrong, right, right, wrong: three first-try wrongs, never three of the last four.
    for (const step of ['miss', 'miss', 'right', 'right', 'miss'] as const) {
      await play[step]();
      play.runner.next();
    }
    const inserted = play.decisions.find((d) => d.action === 'continue' && d.insert?.length);
    expect(inserted).toBeDefined();
    const probe = play.runner.current();
    const prerequisite: SkillId | false = probe?.kind === 'item' && probe.item.skillId;
    expect(graph().prereqs[from.skillId]).toContain(prerequisite);
    expect(play.runner.progress().total).toBe(8);

    await play.miss();
    expect(play.decisions.at(-1)).toMatchObject({ action: 'end-request', reason: 'complete' });
    expect(play.runner.next()).toBeNull();
    expect(play.runner.endReason()).toBe('complete');
  });
});

describe('frustration', () => {
  /** Two skills in turn, so a confidence item can go in without a fourth item in a row. */
  const mixed = () => {
    const a = template(COUNT);
    const b = Object.values(graph().templates).find(
      (t) => t.skillId !== a.skillId && t.format === a.format && pierPlayable(t),
    );
    if (!b) throw new Error('no second tap-count skill');
    return [task(a, 1), task(b, 2), task(a, 3), task(b, 4), task(a, 5), task(b, 6)];
  };

  /** Three wrong items in a row: the frustration signal. */
  async function frustrated() {
    const play = await start(mixed());
    for (let i = 0; i < 3; i += 1) {
      if (i > 0) play.runner.next();
      await play.miss();
    }
    return play;
  }

  it('three wrong of the last four give an easy item, then the break offer; a break ends the request with its summary', async () => {
    const play = await frustrated();
    expect(play.decisions.at(-1)?.action).toBe('confidence-then-offer-break');
    expect(play.runner.progress().total).toBe(7);
    expect(play.runner.breakOffered()).toBe(false);
    const easy = play.runner.next();
    expect(easy?.kind === 'item' && easy.task.context).toBe('warmup');

    await play.right();
    expect(play.runner.breakOffered()).toBe(true);
    play.runner.answerBreak(true);
    expect(play.runner.breakOffered()).toBe(false);
    expect(play.runner.next()).toBeNull();
    expect(play.runner.endReason()).toBe('frustration');
    const summary = await play.runner.finish();
    expect(summary).toMatchObject({ reason: 'frustration', items: 4, firstTryCorrect: 1 });
    const [completed] = await play.events('request.completed');
    expect(completed).toMatchObject({ items: 4, endedEarly: true });
  });

  it('keeping on after the offer plays the rest of the request', async () => {
    const play = await frustrated();
    play.runner.next();
    await play.right();
    expect(play.runner.breakOffered()).toBe(true);
    play.runner.answerBreak(false);
    expect(play.runner.breakOffered()).toBe(false);
    expect(play.runner.next()).toMatchObject({ kind: 'item', attemptNo: 1 });
    expect(play.runner.endReason()).toBeNull();
  });

  it('two long idle periods are a frustration signal too', async () => {
    const play = await start(mixed());
    play.runner.idle();
    await play.right();
    expect(play.decisions.at(-1)?.action).toBe('continue');
    play.runner.next();
    play.runner.idle();
    await play.right();
    expect(play.decisions.at(-1)?.action).toBe('confidence-then-offer-break');
    // An idle period only counts while an item waits for an answer.
    play.runner.idle();
    play.runner.next();
    await play.right();
    expect(play.runner.breakOffered()).toBe(true);
  });
});

describe('what a request leaves behind', () => {
  it('writes material.produced once: one unit per item answered right, from the reward', async () => {
    const material = Object.keys(fixtureContent().gameData.materials)[0] as string;
    const t = template(COUNT);
    const play = await start([task(t, 1), task(t, 2), task(t, 3)], {
      materials: { [material]: 3 },
    });
    await play.right();
    play.runner.next();
    await play.miss();
    play.runner.next();
    // Right on the second try still makes one.
    await play.runner.submit(wrong, meta);
    play.runner.next();
    await play.right();
    expect(play.runner.progress()).toMatchObject({ done: 3, materialEarned: 2 });
    expect(play.runner.next()).toBeNull();

    const summary = await play.runner.finish();
    expect(summary.materials).toEqual({ [material]: 2 });
    await play.runner.finish();
    expect(await play.events('material.produced')).toEqual([
      {
        sessionId: 'session-1',
        requestId: 'request-1',
        workshopId: 'practice-pier',
        materials: { [material]: 2 },
      },
    ]);
  });

  it('writes no material.produced when nothing was answered right', async () => {
    const material = Object.keys(fixtureContent().gameData.materials)[0] as string;
    const play = await start([task(template(COUNT), 1)], { materials: { [material]: 1 } });
    await play.miss();
    await play.runner.finish();
    expect(await play.events('material.produced')).toEqual([]);
  });

  it('a misconception met twice on a skill queues its remediation for the next plan', async () => {
    const queue: QueuedRemediation[] = [];
    const t = template(COUNT);
    const play = await start(
      Array.from({ length: 12 }, (_, i) => task(t, i + 1)),
      { queue },
    );
    // One too few on every item with at least four objects (a miscount, not a guess).
    let slips = 0;
    while (slips < 2 && play.runner.current()) {
      const right = engine.itemExampleCorrect(play.last());
      const count = right.kind === 'number' ? right.value : 0;
      if (count >= 4) {
        const fb = await play.runner.submit({ kind: 'number', value: count - 1 }, meta);
        expect(fb.misconceptionIds).toEqual(['MC.off-by-one-counting']);
        slips += 1;
        play.runner.next();
      }
      await play.right();
      play.runner.next();
    }
    expect(slips).toBe(2);
    expect(queue.length).toBeGreaterThan(0);
    expect(new Set(queue.map((r) => r.misconceptionId))).toEqual(
      new Set(['MC.off-by-one-counting']),
    );

    // The app's queue keeps one per (skill, misconception) and hands it to the next plan.
    const kept = createRemediationQueue();
    for (const r of queue) kept.add(CHILD_K, r);
    for (const r of queue) kept.add(CHILD_K, r);
    const remediation = kept.take(CHILD_K);
    expect(remediation).toEqual(queue[0]);
    expect(kept.take(CHILD_K)).toBeUndefined();
    const state = await play.store.skillStates(CHILD_K);
    if (!state || !remediation) throw new Error('no learner state');
    const planned = planPierRequest(engine, {
      child,
      state,
      graph: graph(),
      island: await play.store.island(),
      now: play.store.now(),
      minutes: 10,
      remediation,
    });
    expect(planned?.narration).toBe('req.idea');
    expect(planned?.tasks.some((p) => p.skillId === remediation.skillId)).toBe(true);
  });
});
