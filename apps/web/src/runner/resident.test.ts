// @vitest-environment node
// The resident a story is about (03 §4.6): the runner replaces the generators' `@resident`
// before anything is shown or spoken.

import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import * as engine from '@number-island/engine';
import {
  defaultChildSettings,
  type GeneratedItem,
  type NarrationJson,
  type PlannedRequest,
} from '@number-island/shared';
import { planLine } from '@number-island/ui';
import { beforeAll, describe, expect, it } from 'vitest';
import { CHILD_K, fixtureContent, profile, testEnv } from '@/data/store.test-support';
import { browseRequest, pierPlayable } from '@/workshops/practice-pier/pierRequest';
import { childContext } from './childContext';
import { RESIDENT_PLACEHOLDER, requestingResident, residentEngine, withResident } from './resident';
import { createTaskRunner, type PierItemTask, type RunnerSession } from './TaskRunner';

let narration: NarrationJson;

beforeAll(() => {
  const compiled = compileContent(readContentFiles()).content;
  if (!compiled) throw new Error('the fixture content does not compile');
  narration = compiled.narration;
  engine.initContent({
    templates: compiled.templates,
    narration: compiled.narration,
    misconceptions: compiled.misconceptions,
  });
});

const residents = () => fixtureContent().gameData.residents;
const graph = () => fixtureContent().graph;

/** Every line an item shows or says: the prompt, the hints, the story's lines, the solution. */
function linesOf(item: GeneratedItem, solution: { say: string; vars?: unknown }[]) {
  const lines: { key: string; vars?: Record<string, string | number> }[] = [
    { key: item.prompt.narration, vars: item.prompt.vars },
    ...item.hints.map((h) => ({ key: h.say, vars: h.vars })),
    ...solution.map((s) => ({ key: s.say, vars: s.vars as Record<string, string | number> })),
  ];
  if (item.widget.format === 'story-problem') {
    lines.push(...item.widget.lines.map((l) => ({ key: l.key, vars: l.vars })));
  }
  return lines;
}

describe('the resident a story is about', () => {
  it('is the resident who asked, or the first starter buddy when nobody the game knows asked', () => {
    const all = residents();
    const buddy = all.find((r) => r.starterBuddy);
    const other = all.find((r) => !r.starterBuddy);
    if (!buddy || !other) throw new Error('the game data lacks the residents this test uses');
    expect(requestingResident(all, other.id)).toEqual({ id: other.id, name: other.name });
    // The dev content browser asks as nobody the game knows.
    const browse = browseRequest(graph(), { skillId: 'ADD.20', templateId: null }, 1);
    expect(all.some((r) => r.id === browse.residentId)).toBe(false);
    expect(requestingResident(all, browse.residentId)).toEqual({ id: buddy.id, name: buddy.name });
    expect(requestingResident([], 'nobody')).toEqual({ id: 'nobody', name: 'nobody' });
  });

  it('a var becomes the id narration names; a written-out sentence gets the name; nothing else changes', () => {
    const value = {
      who: RESIDENT_PLACEHOLDER,
      text: '@resident has 3 shells. An @ sign stays.',
      nested: [{ vars: { who: RESIDENT_PLACEHOLDER, a: 3 } }, 7, null],
    };
    expect(withResident(value, { id: 'nib', name: 'Nib' })).toEqual({
      who: 'nib',
      text: 'Nib has 3 shells. An @ sign stays.',
      nested: [{ vars: { who: 'nib', a: 3 } }, 7, null],
    });
  });

  it('no line of any shipped template is shown or spoken with a placeholder, and every one is built from clips', () => {
    const { id: who, name } = requestingResident(residents(), 'nobody');
    const about = residentEngine(engine, { id: who, name });
    const carrying: string[] = [];
    const named: string[] = [];
    const unstitched: string[] = [];
    for (const template of Object.values(graph().templates)) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const raw = engine.generateItem(template, seed);
        if (!JSON.stringify(raw).includes(RESIDENT_PLACEHOLDER)) continue;
        if (seed === 1) carrying.push(template.id);
        const item = about.generateItem(template, seed);
        const solution = about.itemSolution(item, template);
        expect(JSON.stringify([item, solution]), template.id).not.toContain('@');
        for (const line of linesOf(item, solution)) {
          const plan = planLine(narration, line.key, line.vars);
          if (!plan) continue;
          const what = `${template.id} ${line.key}`;
          expect(`${plan.text} ${plan.spoken}`, what).not.toContain('@');
          if (line.vars?.who === who && plan.text.includes(name)) named.push(what);
          if (line.vars?.who === who && plan.clips === null) unstitched.push(what);
        }
      }
    }
    // The story templates of ADD (story.addsub), on whatever widget they play.
    expect(carrying.length).toBeGreaterThanOrEqual(15);
    expect(carrying).toEqual(expect.arrayContaining(['ADD.12.t1', 'ADD.20.t3', 'ADD.12.t2']));
    // The name is on screen, and spoken from its own clip: no line needs on-device speech.
    expect(named.length).toBeGreaterThan(carrying.length);
    expect(unstitched).toEqual([]);
  });

  it('the runner presents a story about the resident, from the first item on', async () => {
    const kid = profile(CHILD_K, 'K');
    const env = testEnv();
    const store = await env.open();
    await store.putProfile(kid);
    const request: PlannedRequest = browseRequest(
      graph(),
      { skillId: 'ADD.20', templateId: 'ADD.20.t3' },
      1,
    );
    const session: RunnerSession = {
      sessionId: 'session-1',
      budgetMs: 600_000,
      elapsedMs: () => 0,
      windingDown: () => false,
      recordMath: () => {},
      recordItem: () => {},
    };
    const runner = await createTaskRunner({
      engine,
      residents: residents(),
      store,
      graph: graph(),
      child: childContext(kid, defaultChildSettings('K')),
      session,
      request,
      hosts: pierPlayable,
    });
    const task = runner.current() as PierItemTask;
    const buddy = requestingResident(residents(), request.residentId).id;
    expect(task.item.widget.format).toBe('story-problem');
    expect(JSON.stringify(task.item)).not.toContain(RESIDENT_PLACEHOLDER);
    if (task.item.widget.format === 'story-problem') {
      expect(task.item.widget.lines.every((l) => l.vars.who === buddy)).toBe(true);
    }
  });
});
