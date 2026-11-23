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
  opts: { child?: ChildContext; session?: Partial<RunnerSession>; lessonOnly?: boolean } = {},
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
  const request = browseRequest(graph(), { skillId: SKILL, templateId: null, lesson: true }, 4242);
  const runner = await createTaskRunner({
    engine: spied,
    store,
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
