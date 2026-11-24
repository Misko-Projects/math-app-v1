// The domain the story-problem widget draws (U04, #13): one test per bound of the schema, the
// counters board's limit and undo, the answer box's range and the one source of the answer
// (`answerIssues`). The model's ops and responses are in story-problem.test.ts.

import type { AnswerSpec, WidgetAction, WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  STORY_BAR_PARTS_MAX,
  STORY_COUNTERS_MAX,
  STORY_DIGITS_MAX,
  STORY_LINES_MAX,
  STORY_SCENE_GROUPS_MAX,
  STORY_SCENE_ROWS_MAX,
  STORY_SCENE_TOTAL_MAX,
  storyAnswerIssues,
  storyEntryMax,
  storyProblem,
  storySceneRows,
} from './story-problem';

type Config = WidgetConfigOf<'story-problem'>;

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };
const issues = (c: Config) => {
  const r = storyProblem.configSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};
const play = (c: Config, ops: WidgetAction[]) =>
  ops.reduce((s, a) => storyProblem.apply(s, a), storyProblem.initialState(c));

const line = { key: 'p.story.has', vars: { who: '@resident', item: 'shell', many: 2, a: 9 } };
const scene = (...counts: number[]): Config['scene'] => ({
  kind: 'scene',
  context: 'beach-shells',
  sprites: counts.map((count) => ({ sprite: 'shell', count })),
});
const base: Config = {
  format: 'story-problem',
  context: 'beach-shells',
  scene: scene(9),
  lines: [line, { key: 'p.story.q.left', vars: line.vars }],
  situation: 'take-from/result',
  steps: 1,
  workspace: 'counters',
  blanks: [{ id: 'x', maxDigits: 2 }],
  showText: true,
};
const both: Config = {
  ...base,
  situation: 'put-together/both',
  blanks: [
    { id: 'x', maxDigits: 2 },
    { id: 'y', maxDigits: 2 },
  ],
};

describe('story-problem: the bounds of what the widget draws', () => {
  it('accepts the shapes story.addsub builds', () => {
    for (const c of [base, both, { ...base, scene: scene(9, 2, 3), workspace: 'ten-frame' }]) {
      expect(issues(c as Config)).toEqual([]);
    }
    expect(issues({ ...base, scene: { kind: 'none' }, workspace: 'none' })).toEqual([]);
  });

  it(`a story has 1 to ${STORY_LINES_MAX} lines`, () => {
    const lines = (n: number): Config => ({
      ...base,
      lines: Array.from({ length: n }, () => line),
    });
    expect(issues(lines(STORY_LINES_MAX))).toEqual([]);
    expect(issues(lines(STORY_LINES_MAX + 1)).join()).toContain('at most');
    expect(issues(lines(0)).join()).toContain('narrated lines');
  });

  it(`a scene has at most ${STORY_SCENE_GROUPS_MAX} groups of at least one`, () => {
    expect(issues({ ...base, scene: scene(1, 1, 1, 1) }).join()).toContain('a scene shows');
    expect(issues({ ...base, scene: scene(3, 0) }).join()).toContain('a scene shows');
  });

  it(`a scene has at most ${STORY_SCENE_TOTAL_MAX} things in all`, () => {
    expect(issues({ ...base, scene: scene(11, 9) })).toEqual([]);
    expect(issues({ ...base, scene: scene(11, 10) }).join()).toContain('a scene shows');
    expect(issues({ ...base, scene: scene(21) }).join()).toContain('a scene shows');
  });

  it(`a scene takes at most ${STORY_SCENE_ROWS_MAX} rows of ten`, () => {
    expect(storySceneRows([9, 2, 3])).toBe(3);
    expect(storySceneRows([1, 19])).toBe(3);
    expect(storySceneRows([1, 1, 11])).toBe(4);
    expect(issues({ ...base, scene: scene(1, 19) })).toEqual([]);
    expect(issues({ ...base, scene: scene(1, 1, 11) }).join()).toContain('rows of ten');
  });

  it('a scene is a scene of sprites, or none', () => {
    const line10: Config['scene'] = {
      kind: 'number-line',
      min: 0,
      max: 10,
      ticksEvery: 1,
      labelsEvery: 1,
    };
    expect(issues({ ...base, scene: line10 }).join()).toContain('the scene is a scene or none');
  });

  it(`an answer box takes 1 to ${STORY_DIGITS_MAX} digits`, () => {
    const digits = (maxDigits: number): Config => ({ ...base, blanks: [{ id: 'x', maxDigits }] });
    expect(issues(digits(STORY_DIGITS_MAX))).toEqual([]);
    expect(issues(digits(STORY_DIGITS_MAX + 1)).join()).toContain('digits');
  });

  it('a story has one answer box, or the two parts of put-together/both', () => {
    expect(issues({ ...base, blanks: both.blanks }).join()).toContain('one answer box');
    expect(issues({ ...both, blanks: [...both.blanks, { id: 'z', maxDigits: 1 }] })).not.toEqual(
      [],
    );
  });

  it('the workspaces that are drawn: none, counters, ten-frame, bar-model', () => {
    for (const workspace of ['none', 'counters', 'ten-frame', 'bar-model'] as const) {
      expect(issues({ ...base, workspace })).toEqual([]);
    }
    for (const workspace of ['number-line', 'base-ten'] as const) {
      expect(issues({ ...base, workspace }).join()).toContain('the workspace is one of');
    }
  });

  it('a unit beside the box is refused: it is not drawn', () => {
    expect(issues({ ...base, unit: { text: 'cm' } } as unknown as Config).join()).toContain('unit');
  });
});

describe('story-problem: the counters board', () => {
  it(`holds at most ${STORY_COUNTERS_MAX} counters in all; a call past it changes nothing`, () => {
    const s = play(base, [
      act('act-out', { sprite: 'shell', count: 9 }),
      act('act-out', { sprite: 'counter', count: 11 }),
    ]);
    expect(s.actedOut.reduce((n, x) => n + x.count, 0)).toBe(STORY_COUNTERS_MAX);
    expect(storyProblem.apply(s, act('act-out', { sprite: 'counter', count: 12 }))).toBe(s);
    expect(storyProblem.apply(s, act('act-out', { sprite: 'pebble', count: 1 }))).toBe(s);
  });

  it('one more and one less are the same op with the next count; none removes the group', () => {
    const one = play(base, [act('act-out', { sprite: 'counter', count: 1 })]);
    const two = storyProblem.apply(one, act('act-out', { sprite: 'counter', count: 2 }));
    expect(two.actedOut).toEqual([{ sprite: 'counter', count: 2 }]);
    const none = play(base, [
      act('act-out', { sprite: 'counter', count: 1 }),
      act('act-out', { sprite: 'counter', count: 0 }),
    ]);
    expect(none.actedOut).toEqual([]);
    // The board is never part of the answer.
    expect(storyProblem.toResponse(two)).toBeNull();
  });

  it(`a drawn bar has 1 to ${STORY_BAR_PARTS_MAX} whole parts above zero`, () => {
    const s0 = storyProblem.initialState(base);
    expect(storyProblem.apply(s0, act('draw-bar', { parts: [15, 5] })).bar).toEqual([15, 5]);
    for (const parts of [[], [1, 2, 3, 4], [5, 0], [2.5, 1], [-1, 3]]) {
      expect(storyProblem.apply(s0, act('draw-bar', { parts }))).toBe(s0);
    }
  });

  it('a highlighted line is one of the story’s lines', () => {
    const s0 = storyProblem.initialState(base);
    expect(storyProblem.apply(s0, act('highlight-line', { index: 1 })).highlightedLine).toBe(1);
    expect(storyProblem.apply(s0, act('highlight-line', { index: 2 })).highlightedLine).toBeNull();
    expect(storyProblem.apply(s0, act('highlight-line', { index: -1 })).highlightedLine).toBeNull();
  });
});

describe('story-problem: the answer box and the one source of the answer', () => {
  it('the box takes what its digits can hold', () => {
    expect(storyEntryMax(base)).toBe(99);
    expect(storyEntryMax({ blanks: [{ id: 'x', maxDigits: 1 }] })).toBe(9);
    expect(storyEntryMax({ blanks: [{ id: 'x', maxDigits: 3 }] })).toBe(999);
  });

  it('one box answers a whole number its digits can hold', () => {
    expect(storyAnswerIssues(base, { kind: 'number', value: 2 })).toEqual([]);
    expect(storyAnswerIssues(base, { kind: 'number', value: 99 })).toEqual([]);
    for (const value of [100, -1, 2.5]) {
      expect(storyAnswerIssues(base, { kind: 'number', value })).not.toEqual([]);
    }
    expect(storyAnswerIssues(base, { kind: 'choice', id: 'a' })).not.toEqual([]);
  });

  it('put-together/both is checked by bond.split with a whole its boxes can hold', () => {
    const split = (whole: number): AnswerSpec => ({
      kind: 'state',
      checker: 'bond.split',
      target: { whole, nonZero: true },
    });
    expect(storyAnswerIssues(both, split(7))).toEqual([]);
    expect(storyAnswerIssues(both, split(100))).not.toEqual([]);
    expect(storyAnswerIssues(both, { kind: 'number', value: 7 })).not.toEqual([]);
    // Every split of the whole can be typed into the two boxes and is sent as its parts.
    const s = play(both, [act('answer', { values: [3, 4] })]);
    expect(storyProblem.toResponse(s)).toEqual({ kind: 'state', value: { parts: [3, 4] } });
  });
});
