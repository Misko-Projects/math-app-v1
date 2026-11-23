// @vitest-environment node
// The lesson player in the TaskRunner (#20 part 3, 03 §6): a lesson task plays its steps in the
// lesson's order, writes `lesson.step`, hands the faded examples' last steps to the child, plays
// the scaffolded items as real items in context `lesson`, and then the request goes on.

import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import * as engine from '@number-island/engine';
import {
  type AttemptPayload,
  type ChildContext,
  defaultChildSettings,
  type EventPayloads,
  type GeneratedItem,
  type ResponseValue,
  type RunnerTask,
} from '@number-island/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DataStore } from '@/data/store';
import { CHILD_K, fixtureContent, profile, testEnv } from '@/data/store.test-support';
import { browseRequest, pierPlayable } from '@/workshops/practice-pier/pierRequest';
import { childContext } from './childContext';
import { buildLesson } from './lesson';
import {
  createTaskRunner,
  type PierItemTask,
  type PierLessonStep,
  type RunnerEngine,
  type RunnerSession,
} from './TaskRunner';

const SKILL = 'CNT.03';
const kid = profile(CHILD_K, 'K');
const childK = childContext(kid, defaultChildSettings('K'));
const childG1: ChildContext = { ...childK, grade: '1', isK: false };
const wrong: ResponseValue = { kind: 'skip' };
const SLOW = 600_000;

beforeAll(() => {
  const compiled = compileContent(readContentFiles()).content;
  if (!compiled) throw new Error('the fixture content does not compile');
  engine.initContent({
    templates: compiled.templates,
    narration: compiled.narration,
    misconceptions: compiled.misconceptions,
  });
});

const graph = () => fixtureContent().graph;

function script() {
  const skill = graph().skills[SKILL];
  if (!skill) throw new Error(`${SKILL} is not in the content`);
  const built = buildLesson(engine, graph(), skill, pierPlayable);
  if (!built) throw new Error(`${SKILL} has no lesson to play`);
  return built;
}

async function start(
  opts: {
    child?: ChildContext;
    session?: Partial<RunnerSession>;
    lessonOnly?: boolean;
    /** The request's reward. */
    materials?: Record<string, number>;
    /** The first write of a scaffolded item's `lesson.step` fails. */
    failScaffoldedStepOnce?: boolean;
    /** That many first writes of a scaffolded item's `lesson.step` fail. */
    failScaffoldedSteps?: number;
  } = {},
) {
  const store: DataStore = await testEnv().open();
  await store.putProfile(kid);
  const items: GeneratedItem[] = [];
  const spied: RunnerEngine = {
    ...engine,
    generateItem: (...args) => {
      const item = engine.generateItem(...args);
      items.push(item);
      return item;
    },
  };
  const math = { ms: 0, items: 0 };
  const browse = browseRequest(graph(), { skillId: SKILL, templateId: null, lesson: true }, 4242);
  const request = { ...browse, reward: { materials: opts.materials ?? {} } };
  let failures = opts.failScaffoldedSteps ?? (opts.failScaffoldedStepOnce ? 1 : 0);
  const flaky: Pick<DataStore, 'append' | 'skillStates' | 'now'> = {
    now: () => store.now(),
    skillStates: (id) => store.skillStates(id),
    append: ((type: string, payload: { phase?: string }, meta: unknown) => {
      if (type === 'lesson.step' && payload.phase === 'scaffolded' && failures > 0) {
        failures -= 1;
        return Promise.reject(new Error('the write failed'));
      }
      return (store.append as (...args: unknown[]) => Promise<unknown>)(type, payload, meta);
    }) as DataStore['append'],
  };
  const runner = await createTaskRunner({
    engine: spied,
    store: flaky,
    graph: graph(),
    child: opts.child ?? childK,
    request: opts.lessonOnly ? { ...request, tasks: request.tasks.slice(0, 1) } : request,
    hosts: pierPlayable,
    session: {
      sessionId: 'session-1',
      elapsedMs: () => 0,
      budgetMs: 10 * 60_000,
      windingDown: () => false,
      recordMath: (ms) => {
        math.ms += ms;
      },
      recordItem: () => {
        math.items += 1;
      },
      ...opts.session,
    },
  });
  const steps = async () =>
    (await store.events())
      .filter((e) => e.type === 'lesson.step')
      .map((e) => e.payload as EventPayloads['lesson.step']);
  const attempts = async () =>
    (await store.events())
      .filter((e) => e.type === 'attempt')
      .map((e) => e.payload as AttemptPayload);
  return {
    store,
    runner,
    request,
    steps,
    attempts,
    math,
    lastItem: () => items.at(-1) as GeneratedItem,
  };
}

const asStep = (t: RunnerTask | null): PierLessonStep => {
  if (t?.kind !== 'lesson-step') throw new Error(`expected a lesson step, got ${t?.kind}`);
  return t as PierLessonStep;
};
const asItem = (t: RunnerTask | null): PierItemTask => {
  if (t?.kind !== 'item') throw new Error(`expected an item, got ${t?.kind}`);
  return t as PierItemTask;
};
const brief = (s: EventPayloads['lesson.step']) =>
  `${s.phase}:${s.example}:${s.step}:${s.actor}:${s.outcome}`;

/** Plays demo steps until the child's turn, an item, or the end; returns what is then shown. */
function watch(runner: Awaited<ReturnType<typeof start>>['runner']): RunnerTask | null {
  let task = runner.current();
  while (task?.kind === 'lesson-step' && !task.childStep) task = runner.next();
  return task;
}

describe('TaskRunner: lessons', () => {
  it('plays the lesson in its order, then the practice item: steps, child turns, scaffolded items', async () => {
    const lesson = script();
    const { runner, steps, attempts, request, math, lastItem } = await start();
    const order: string[] = [];
    const first = asStep(runner.current());
    expect(first).toMatchObject({
      phase: 'intro',
      narration: lesson.intro,
      demo: null,
      childStep: false,
      skillId: SKILL,
    });
    // The intro stands on the first example's widget, so that widget is not remounted after it.
    expect(first.widget).toEqual(lesson.examples[0]?.item.widget);
    let task: RunnerTask | null = first;
    let scaffolded = 0;
    while (task) {
      if (task.kind === 'lesson-step') {
        const step = task as PierLessonStep;
        order.push(`${step.phase}:${step.example}:${step.step}${step.childStep ? ':child' : ''}`);
        // K has no "I can try".
        expect(step._canSkip).toBe(false);
        if (step.childStep) {
          const example = lesson.examples.find(
            (e) => e.phase === step.phase && e.example === step.example,
          );
          if (!example) throw new Error('the turn belongs to no example');
          expect(step.step).toBe(example.childFrom);
          expect(step._turn).toEqual(example.steps.slice(example.childFrom));
          // A generator's solution has no line for the child: the example's instruction invites.
          expect(step._turnLines).toEqual([
            { say: example.item.prompt.narration, vars: example.item.prompt.vars },
          ]);
          expect(step.narration).toBe(example.item.prompt.narration);
          expect(
            runner.lessonAnswer(engine.itemExampleCorrect(example.item), { latencyMs: SLOW }),
          ).toBe('done');
        }
        task = runner.next();
        continue;
      }
      const item = asItem(task);
      if (item.task.context === 'lesson') {
        scaffolded += 1;
        // The ladder is opened at `hintStart`: the nudge is there to play, and it is no hint used.
        expect(item._nudge?.level).toBe(lesson.scaffolded.hintStart);
        // A wrong first try keeps the lesson from shortening.
        const fb = await runner.submit(wrong, { latencyMs: 4000 });
        expect(fb.retry).toBe(true);
        // The retry's rung is above the one the item opened with.
        expect(fb.hint === null || fb.hint.level > lesson.scaffolded.hintStart).toBe(true);
        runner.next();
        await runner.submit(engine.itemExampleCorrect(lastItem()), { latencyMs: 4000 });
      } else {
        await runner.submit(engine.itemExampleCorrect(lastItem()), { latencyMs: 4000 });
      }
      task = runner.next();
    }
    expect(runner.endReason()).toBe('complete');
    await runner.finish();

    const expected = ['intro:0:0'];
    for (const e of lesson.examples) {
      for (let i = 0; i < e.childFrom; i += 1) expected.push(`${e.phase}:${e.example}:${i}`);
      if (e.childFrom < e.steps.length)
        expected.push(`${e.phase}:${e.example}:${e.childFrom}:child`);
    }
    if (lesson.outro) expected.push('outro:0:0');
    expect(order).toEqual(expected);
    expect(scaffolded).toBe(lesson.scaffolded.count);

    const logged = (await steps()).map(brief);
    const want = ['intro:0:0:demo:done'];
    for (const e of lesson.examples) {
      e.steps.forEach((_, i) => {
        want.push(`${e.phase}:${e.example}:${i}:${i < e.childFrom ? 'demo' : 'child'}:done`);
      });
    }
    for (let i = 0; i < lesson.scaffolded.count; i += 1) want.push(`scaffolded:${i}:0:child:done`);
    if (lesson.outro) want.push('outro:0:0:demo:done');
    expect(logged).toEqual(want);

    const tries = await attempts();
    const inLesson = tries.filter((a) => a.context === 'lesson');
    expect(inLesson).toHaveLength(lesson.scaffolded.count * 2);
    expect(inLesson.every((a) => a.templateId === lesson.templateId && a.skillId === SKILL)).toBe(
      true,
    );
    // The nudge that opened the item is not a hint the child used: the first try has none.
    expect(inLesson.filter((a) => a.attemptNo === 1).every((a) => a.hintsUsed === 0)).toBe(true);
    // The practice item planned after the lesson is played, in its own context.
    expect(tries.at(-1)).toMatchObject({ context: 'practice', correct: true });
    expect(request.tasks.at(-1)?.mode).toBe('item');
    // The child's turns count as math time; only real items count as items.
    expect(math.items).toBe(lesson.scaffolded.count + 1);
    expect(math.ms).toBeGreaterThanOrEqual(SLOW);
  });

  it('shortens the lesson for a child who shows they have it (03 §6.2)', async () => {
    const lesson = script();
    const faded = lesson.examples.filter((e) => e.phase === 'faded');
    expect(faded.length).toBe(2);
    expect(lesson.scaffolded.count).toBeGreaterThan(1);
    const { runner, steps, lastItem } = await start();
    const turn = asStep(watch(runner));
    expect(turn).toMatchObject({ phase: 'faded', example: 0, childStep: true });
    // Right on the first try, in time: faded example 2 is skipped.
    const example = faded[0] as (typeof faded)[number];
    expect(runner.lessonAnswer(engine.itemExampleCorrect(example.item), { latencyMs: 1000 })).toBe(
      'done',
    );
    const item = asItem(runner.next());
    expect(item.task.context).toBe('lesson');
    // Scaffolded item 1 right with no hint: the rest are skipped.
    const fb = await runner.submit(engine.itemExampleCorrect(lastItem()), { latencyMs: 3000 });
    expect(fb).toMatchObject({ correct: true, partialCredit: 1 });
    const after = runner.next();
    if (lesson.outro) expect(asStep(after).phase).toBe('outro');
    await runner.finish();
    const logged = (await steps()).map(brief);
    expect(logged).toContain('faded:1:0:demo:skipped');
    expect(logged.filter((l) => l.startsWith('faded:1:') && !l.endsWith('skipped'))).toEqual([]);
    expect(logged).toContain('scaffolded:0:0:child:done');
    for (let i = 1; i < lesson.scaffolded.count; i += 1) {
      expect(logged).toContain(`scaffolded:${i}:0:child:skipped`);
    }
  });

  it('after two unsuccessful tries the demo does the step, and nothing is logged as an attempt', async () => {
    const { runner, steps, attempts } = await start();
    const turn = asStep(watch(runner));
    expect(runner.lessonAnswer(wrong, { latencyMs: 2000 })).toBe('again');
    // Still the child's turn, the same step.
    expect(asStep(runner.next())).toMatchObject({ childStep: true, step: turn.step });
    expect(runner.lessonAnswer(wrong, { latencyMs: 2000 })).toBe('demo');
    // The turn is resolved: another answer has nothing to answer.
    expect(() => runner.lessonAnswer(wrong, { latencyMs: 1 })).toThrow(/no lesson step/);
    // A child who leaves before the demo has played was not corrected by it: nothing is written.
    await runner.finish();
    expect((await steps()).filter((s) => s.actor === 'child')).toEqual([]);
    expect(await attempts()).toEqual([]);
  });

  it('writes demo-corrected for each of the child steps once the demo has played', async () => {
    const lesson = script();
    const example = lesson.examples.find((e) => e.phase === 'faded' && e.example === 0);
    if (!example) throw new Error('no faded example');
    const { runner, steps, attempts } = await start();
    watch(runner);
    runner.lessonAnswer(wrong, { latencyMs: 2000 });
    runner.lessonAnswer(wrong, { latencyMs: 2000 });
    const next = asStep(runner.next());
    // The second faded example follows: no shortening after a corrected turn.
    expect(next).toMatchObject({ phase: 'faded', example: 1, step: 0, childStep: false });
    await runner.finish();
    const logged = (await steps()).map(brief);
    for (let i = example.childFrom; i < example.steps.length; i += 1) {
      expect(logged).toContain(`faded:0:${i}:child:demo-corrected`);
    }
    expect(logged.some((l) => l.endsWith(':child:done'))).toBe(false);
    expect(await attempts()).toEqual([]);
  });

  it('"I can try" jumps to the first faded example from grade 1, after the first worked step', async () => {
    const lesson = script();
    const worked = lesson.examples.filter((e) => e.phase === 'worked');
    const { runner, steps } = await start({ child: childG1 });
    expect(asStep(runner.current())._canSkip).toBe(false); // intro
    expect(runner.skipWorked()).toBeNull();
    const step0 = asStep(runner.next());
    expect(step0).toMatchObject({ phase: 'worked', step: 0, _canSkip: false });
    expect(runner.skipWorked()).toBeNull();
    const step1 = asStep(runner.next());
    expect(step1).toMatchObject({ phase: 'worked', step: 1, _canSkip: true });
    const jumped = asStep(runner.skipWorked());
    expect(jumped).toMatchObject({ phase: 'faded', example: 0, step: 0, _canSkip: false });
    await runner.finish();
    const logged = (await steps()).map(brief);
    const skipped = worked.flatMap((e) =>
      e.steps.map((_, i) => `worked:${e.example}:${i}:demo:skipped`),
    );
    expect(logged).toEqual(['intro:0:0:demo:done', 'worked:0:0:demo:done', ...skipped.slice(1)]);
  });

  it('leaving in the middle of a lesson completes the request as ended early, and records nothing after', async () => {
    const { runner, steps, store } = await start();
    runner.next(); // the intro is done
    const summary = await runner.finish();
    expect(summary).toMatchObject({ items: 0, reason: 'child-exit' });
    // A screen on its way out still calls next(): nothing more is written.
    runner.next();
    await runner.finish();
    expect((await steps()).map(brief)).toEqual(['intro:0:0:demo:done']);
    const completed = (await store.events()).filter((e) => e.type === 'request.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]?.payload).toMatchObject({ items: 0, endedEarly: true });
    expect((await store.events()).at(-1)?.type).toBe('request.completed');
  });

  it('a lesson that is the last task ends the request as complete, after every scaffolded item', async () => {
    const lesson = script();
    const { runner, attempts, lastItem } = await start({ lessonOnly: true });
    let task = watch(runner);
    while (task) {
      if (task.kind === 'lesson-step') {
        const step = task as PierLessonStep;
        if (step.childStep) {
          const example = lesson.examples.find(
            (e) => e.phase === step.phase && e.example === step.example,
          ) as (typeof lesson.examples)[number];
          runner.lessonAnswer(engine.itemExampleCorrect(example.item), { latencyMs: SLOW });
        }
      } else {
        // Wrong, then right: never the shortening.
        await runner.submit(wrong, { latencyMs: 4000 });
        runner.next();
        await runner.submit(engine.itemExampleCorrect(lastItem()), { latencyMs: 4000 });
      }
      task = runner.next();
    }
    expect(runner.endReason()).toBe('complete');
    expect((await attempts()).filter((a) => a.attemptNo === 1)).toHaveLength(
      lesson.scaffolded.count,
    );
    expect(runner.progress()).toMatchObject({
      done: lesson.scaffolded.count,
      total: lesson.scaffolded.count,
    });
    expect(await runner.finish()).toMatchObject({ reason: 'complete' });
  });

  it('steps authored for the child hand over with their own lines (CNT.14)', async () => {
    const skill = graph().skills['CNT.14'];
    if (!skill) throw new Error('CNT.14 is not in the content');
    const lesson = buildLesson(engine, graph(), skill, pierPlayable);
    const faded = lesson?.examples.filter((e) => e.phase === 'faded') ?? [];
    expect(faded.length).toBe(2);
    for (const e of faded) {
      const mine = e.steps.slice(e.childFrom);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((s) => s.actor === 'child')).toBe(true);
    }
    const store: DataStore = await testEnv().open();
    await store.putProfile(kid);
    const runner = await createTaskRunner({
      engine,
      store,
      graph: graph(),
      child: childK,
      request: browseRequest(graph(), { skillId: 'CNT.14', templateId: null, lesson: true }, 7),
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
    const turn = asStep(watch(runner));
    const first = faded[0] as (typeof faded)[number];
    const mine = first.steps.slice(first.childFrom);
    expect(turn._turnLines.map((l) => l.say)).toEqual(mine.map((s) => s.say));
    expect(turn.narration).toBe(mine[0]?.say);
    // The invited action is the child step's own.
    expect(turn.demo).toEqual(mine[0]?.action ?? null);
    // What the demo did before the turn, to rebuild the widget if the demo has to take over.
    expect(turn._prior).toEqual(
      first.steps.slice(0, first.childFrom).flatMap((s) => (s.action ? [s.action] : [])),
    );
  });

  describe("after the skill's test-out items (03 §6.5, 04 §3)", () => {
    /** A request of one test-out item and the lesson, over a store whose projection the test controls. */
    async function afterDraw(passed: boolean) {
      const store: DataStore = await testEnv().open();
      await store.putProfile(kid);
      const items: GeneratedItem[] = [];
      const request = browseRequest(
        graph(),
        { skillId: SKILL, templateId: null, lesson: true },
        11,
      );
      const [lessonTask, item] = request.tasks;
      if (!lessonTask || !item) throw new Error('the lesson request has two tasks');
      const runner = await createTaskRunner({
        engine: {
          ...engine,
          generateItem: (...args) => {
            const made = engine.generateItem(...args);
            items.push(made);
            return made;
          },
        },
        store: {
          append: (...args) => store.append(...args),
          now: () => store.now(),
          // The learner's verdict on the draw (the model decides it; here the test does).
          skillStates: async (id) => {
            const state = await store.skillStates(id);
            const st = state?.skills[SKILL];
            if (!state || !st || !passed) return state;
            return { ...state, skills: { ...state.skills, [SKILL]: { ...st, practicedAt: 1 } } };
          },
        },
        graph: graph(),
        child: childK,
        request: { ...request, tasks: [item, lessonTask] },
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
      await runner.submit(engine.itemExampleCorrect(items.at(-1) as GeneratedItem), {
        latencyMs: 3000,
      });
      return { runner, store };
    }

    it('a passed test-out skips the lesson', async () => {
      const { runner, store } = await afterDraw(true);
      expect(runner.next()).toBeNull();
      expect(runner.endReason()).toBe('complete');
      await runner.finish();
      expect((await store.events()).filter((e) => e.type === 'lesson.step')).toEqual([]);
    });

    it('otherwise the full lesson follows, opened by the transition line', async () => {
      const { runner } = await afterDraw(false);
      const intro = asStep(runner.next());
      expect(intro).toMatchObject({ phase: 'intro', _lead: 'fb.testout.to-lesson' });
      expect(asStep(runner.next())).toMatchObject({ phase: 'worked', step: 0, _lead: null });
    });
  });

  it('a lesson that opens a request has no transition line', async () => {
    const { runner } = await start();
    expect(asStep(runner.current())._lead).toBeNull();
  });

  /** Plays CNT.03 the short way (both shortening rules) up to its first scaffolded item. */
  async function toScaffolded(play: Awaited<ReturnType<typeof start>>) {
    const first = script().examples.find((e) => e.phase === 'faded');
    if (!first) throw new Error('no faded example');
    asStep(watch(play.runner));
    play.runner.lessonAnswer(engine.itemExampleCorrect(first.item), { latencyMs: 1000 });
    return asItem(play.runner.next());
  }

  it('no practice item starts after a wind-down that came during the outro', async () => {
    let winding = false;
    const play = await start({ session: { windingDown: () => winding } });
    expect(script().outro).not.toBeNull();
    await toScaffolded(play);
    await play.runner.submit(engine.itemExampleCorrect(play.lastItem()), { latencyMs: 3000 });
    expect(asStep(play.runner.next()).phase).toBe('outro');
    const made = play.lastItem();
    winding = true;
    expect(play.runner.next()).toBeNull();
    expect(play.runner.endReason()).toBe('wind-down');
    // The practice item planned after the lesson was never generated.
    expect(play.lastItem()).toBe(made);
    expect((await play.attempts()).every((a) => a.context === 'lesson')).toBe(true);
  });

  it('a resolved scaffolded item keeps its lesson step when the child leaves from the feedback', async () => {
    const play = await start();
    await toScaffolded(play);
    await play.runner.submit(engine.itemExampleCorrect(play.lastItem()), { latencyMs: 3000 });
    // Home, without "next".
    await play.runner.finish();
    const events = await play.store.events();
    const types = events.map((e) => e.type);
    expect((await play.steps()).map(brief).filter((l) => l.startsWith('scaffolded'))).toEqual([
      'scaffolded:0:0:child:done',
    ]);
    expect(await play.attempts()).toHaveLength(1);
    expect(types.lastIndexOf('lesson.step')).toBeLessThan(types.indexOf('request.completed'));
    expect(types.indexOf('attempt')).toBeLessThan(types.lastIndexOf('lesson.step'));
  });

  it('a resolved scaffolded item keeps its lesson step when the wind-down comes before "next"', async () => {
    let winding = false;
    const play = await start({ session: { windingDown: () => winding } });
    await toScaffolded(play);
    // Wrong, then right: no shortening, so a second scaffolded item would follow.
    await play.runner.submit(wrong, { latencyMs: 4000 });
    play.runner.next();
    await play.runner.submit(engine.itemExampleCorrect(play.lastItem()), { latencyMs: 4000 });
    winding = true;
    expect(play.runner.next()).toBeNull();
    expect(play.runner.endReason()).toBe('wind-down');
    await play.runner.finish();
    expect((await play.steps()).map(brief).filter((l) => l.startsWith('scaffolded'))).toEqual([
      'scaffolded:0:0:child:done',
    ]);
    expect(await play.attempts()).toHaveLength(2);
  });

  it('frustration in a scaffolded item: the easy item and the break offer come next, not more lesson', async () => {
    const lesson = script();
    expect(lesson.scaffolded.count).toBeGreaterThan(1);
    const play = await start();
    await toScaffolded(play);
    // Two long idle periods, a wrong answer, then right on the retry (04 §6.4 rule 4).
    play.runner.idle();
    play.runner.idle();
    await play.runner.submit(wrong, { latencyMs: 4000 });
    play.runner.next();
    await play.runner.submit(engine.itemExampleCorrect(play.lastItem()), { latencyMs: 4000 });
    // The first thing after the feedback is the easy item, not the second scaffolded item.
    const easy = asItem(play.runner.next());
    expect(easy.task.context).not.toBe('lesson');
    expect(play.runner.breakOffered()).toBe(false);
    await play.runner.submit(engine.itemExampleCorrect(play.lastItem()), { latencyMs: 4000 });
    expect(play.runner.breakOffered()).toBe(true);
    await play.runner.finish();
    const logged = (await play.steps()).map(brief);
    expect(logged.filter((l) => l.startsWith('scaffolded'))).toEqual([
      'scaffolded:0:0:child:done',
      ...Array.from(
        { length: lesson.scaffolded.count - 1 },
        (_, i) => `scaffolded:${i + 1}:0:child:skipped`,
      ),
    ]);
    expect(logged.some((l) => l.startsWith('outro'))).toBe(false);
  });

  it("a failed write of a scaffolded item's lesson step costs neither the reward nor the step", async () => {
    const material = Object.keys(fixtureContent().gameData.materials)[0] as string;
    const play = await start({ materials: { [material]: 3 }, failScaffoldedStepOnce: true });
    await toScaffolded(play);
    // The attempt is committed; the write of its lesson step fails once.
    const fb = await play.runner.submit(engine.itemExampleCorrect(play.lastItem()), {
      latencyMs: 3000,
    });
    expect(fb.correct).toBe(true);
    expect(play.runner.progress().materialEarned).toBe(1);
    expect((await play.steps()).filter((s) => s.phase === 'scaffolded')).toEqual([]);
    const summary = await play.runner.finish();
    expect(summary.materials).toEqual({ [material]: 1 });
    // The attempt is there once, credited once, and its lesson step was written after all.
    expect(await play.attempts()).toHaveLength(1);
    const events = await play.store.events();
    expect(
      events.filter((e) => e.type === 'material.produced').map((e) => e.payload),
    ).toMatchObject([{ materials: { [material]: 1 } }]);
    expect((await play.steps()).map(brief).filter((l) => l.startsWith('scaffolded:0'))).toEqual([
      'scaffolded:0:0:child:done',
    ]);
    const types = events.map((e) => e.type);
    expect(types.lastIndexOf('lesson.step')).toBeLessThan(types.indexOf('request.completed'));
  });

  it('a lesson step that fails again when the child leaves does not hold back the reward', async () => {
    const material = Object.keys(fixtureContent().gameData.materials)[0] as string;
    const play = await start({ materials: { [material]: 3 }, failScaffoldedSteps: 2 });
    await toScaffolded(play);
    await play.runner.submit(engine.itemExampleCorrect(play.lastItem()), { latencyMs: 3000 });
    // Leaving (the browser's Back calls finish once): the owed step fails a second time.
    await expect(play.runner.finish()).rejects.toThrow('the write failed');
    const produced = async () =>
      (await play.store.events()).filter((e) => e.type === 'material.produced');
    // The committed answer and what it earned are in, once.
    expect(await play.attempts()).toHaveLength(1);
    expect((await produced()).map((e) => e.payload)).toMatchObject([
      { materials: { [material]: 1 } },
    ]);
    expect((await play.steps()).filter((s) => s.phase === 'scaffolded')).toEqual([]);
    // A later finish writes the step and the completion, and no second reward.
    const summary = await play.runner.finish();
    expect(summary.materials).toEqual({ [material]: 1 });
    expect(await produced()).toHaveLength(1);
    expect(await play.attempts()).toHaveLength(1);
    expect((await play.steps()).map(brief).filter((l) => l.startsWith('scaffolded:0'))).toEqual([
      'scaffolded:0:0:child:done',
    ]);
    const types = (await play.store.events()).map((e) => e.type);
    expect(types.filter((t) => t === 'request.completed')).toHaveLength(1);
    expect(types.lastIndexOf('lesson.step')).toBeLessThan(types.indexOf('request.completed'));
  });

  it('no new part of a lesson starts after the wind-down', async () => {
    let winding = false;
    const { runner } = await start({ session: { windingDown: () => winding } });
    runner.next(); // into the first worked example
    winding = true;
    // The example on screen is finished; the next one does not start.
    expect(watch(runner)).toBeNull();
    expect(runner.endReason()).toBe('wind-down');
  });
});
