// 03 §6.3 state model and 03 §5.5 config, features and answers for story-problem (U04, #13).

import {
  FORMAT_SUPPORT,
  SITUATION_TYPES,
  type WidgetAction,
  type WidgetConfigOf,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import { formatModel } from './index';
import { SITUATION_PRIOR, storyProblem } from './story-problem';
import { UnsupportedOpError } from './types';

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };

const base: WidgetConfigOf<'story-problem'> = {
  format: 'story-problem',
  context: 'beach',
  scene: { kind: 'none' },
  lines: [{ key: 'tp.ADD.08.t1.line1', vars: { a: 3, b: 2 } }],
  situation: 'add-to/result',
  steps: 1,
  workspace: 'counters',
  blanks: [{ id: 'x', maxDigits: 2 }],
  showText: false,
};

const issuePaths = (c: unknown) => {
  const r = storyProblem.configSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

const play = (c: WidgetConfigOf<'story-problem'>, ops: WidgetAction[]) =>
  ops.reduce((s, a) => storyProblem.apply(s, a), storyProblem.initialState(c));

describe('story-problem', () => {
  it('is registered and the easiest config parses with every feature 0', () => {
    expect(formatModel('story-problem')).toBe(storyProblem);
    expect(issuePaths(base)).toEqual([]);
    const values = storyProblem.featureValues(base, { kind: 'number', value: 5 });
    expect(Object.keys(values).sort()).toEqual(Object.keys(storyProblem.features).sort());
    expect(Object.values(values).every((v) => v === 0)).toBe(true);
  });

  it('has a prior for every situation type', () => {
    for (const s of SITUATION_TYPES) expect(SITUATION_PRIOR[s], s).toBeGreaterThanOrEqual(0);
    expect(SITUATION_PRIOR['take-from/start']).toBe(1.1);
  });

  it('supports every listed op plus answer, and throws on others', () => {
    const s = storyProblem.initialState(base);
    for (const op of [...FORMAT_SUPPORT['story-problem'].ops, 'answer']) {
      expect(() => storyProblem.apply(s, act(op))).not.toThrow();
    }
    expect(() => storyProblem.apply(s, act('teleport'))).toThrow(UnsupportedOpError);
  });

  it('one blank answers a number, never before it is filled', () => {
    expect(storyProblem.toResponse(storyProblem.initialState(base))).toBeNull();
    const s = play(base, [
      act('show-scene'),
      act('act-out', { sprite: 'shell', count: 3 }),
      act('act-out', { sprite: 'shell', count: 5 }),
      act('highlight-line', { index: 0 }),
      act('answer', { value: 5 }),
    ]);
    expect(s.actedOut).toEqual([{ sprite: 'shell', count: 5 }]);
    expect(s.sceneShown).toBe(true);
    expect(storyProblem.toResponse(s)).toEqual({ kind: 'number', value: 5 });
  });

  it('several blanks answer numbers in order', () => {
    const two = {
      ...base,
      blanks: [
        { id: 'a', maxDigits: 2 },
        { id: 'b', maxDigits: 2 },
      ],
    };
    expect(storyProblem.toResponse(play(two, [act('answer', { value: 4 })]))).toBeNull();
    expect(storyProblem.toResponse(play(two, [act('answer', { values: [4, 9] })]))).toEqual({
      kind: 'numbers',
      values: [4, 9],
    });
  });

  it('put-together/both answers a free split that bond.split accepts', () => {
    const both: WidgetConfigOf<'story-problem'> = {
      ...base,
      situation: 'put-together/both',
      blanks: [
        { id: 'p0', maxDigits: 1 },
        { id: 'p1', maxDigits: 1 },
      ],
    };
    expect(issuePaths(both)).toEqual([]);
    const r = storyProblem.toResponse(play(both, [act('answer', { values: [2, 5] })]));
    expect(r).toEqual({ kind: 'state', value: { parts: [2, 5] } });
    const check = stateChecker('bond.split');
    expect(r?.kind === 'state' && check?.check({ whole: 7 }, r.value)).toBe(true);
    expect(issuePaths({ ...both, blanks: [{ id: 'p0', maxDigits: 1 }] })).toEqual(['blanks']);
  });

  it('draws a bar model in the workspace (never graded)', () => {
    const s = play({ ...base, workspace: 'bar-model' }, [act('draw-bar', { parts: [3, 2] })]);
    expect(s.bar).toEqual([3, 2]);
    expect(storyProblem.toResponse(s)).toBeNull();
  });

  it('rejects contradictory configs', () => {
    expect(issuePaths({ ...base, blanks: [] })).toEqual(['blanks']);
    expect(issuePaths({ ...base, lines: [] })).toEqual(['lines']);
    expect(issuePaths({ ...base, situation: 'two-step' })).toEqual(['steps']);
  });

  it('feature values at the extremes (the generator sets extraneous and language)', () => {
    expect(
      storyProblem.featureValues(
        { ...base, situation: 'two-step', steps: 2, workspace: 'none' },
        { kind: 'number', value: 1 },
      ),
    ).toEqual({
      situation: 0,
      'steps.two': 1,
      extraneous: 0,
      inconsistentLanguage: 0,
      'workspace.none': 1,
    });
    expect(
      storyProblem.featureValues(
        { ...base, situation: 'compare/smaller-more' },
        {
          kind: 'number',
          value: 1,
        },
      ).situation,
    ).toBe(1.2);
  });
});
