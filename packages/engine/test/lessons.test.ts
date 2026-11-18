// K01 (#11) review round 1 of PR #53: in an authored faded example, the demo must stop before the
// move the child is invited to make. For the CNT.14 one-more lesson that move is putting in the
// one extra, so the widget must still show only the start when the child's turn begins, and the
// child's own steps must then reach a correct response (03 §6.2).

import type { LessonExample, LessonStep, ResponseValue } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { formatModel } from '../src/formats';
import { checkResponse } from '../src/items/check';
import { generateItemFromParams } from '../src/items/generate';
import { compileFixture, fixtureTemplate, loadFixture } from './fixture';

/** Apply steps through the format's state model; returns the state after them. */
function play(templateId: string, ex: LessonExample, steps: LessonStep[]) {
  const t = fixtureTemplate(templateId);
  const item = generateItemFromParams(t, ex.params ?? {});
  const model = formatModel(t.format);
  if (!model) throw new Error(`no model for ${t.format}`);
  let s = model.initialState(item.widget as never);
  for (const st of steps) if (st.action) s = model.apply(s, st.action);
  return { item, state: s as unknown as Record<string, unknown>, response: model.toResponse(s) };
}

describe('CNT.14 faded examples leave the one-more move to the child', () => {
  loadFixture();
  const lesson = compileFixture().skills.find((s) => s.id === 'CNT.14')?.lesson;

  it('the lesson is authored, with two faded examples that have authored steps', () => {
    expect(lesson?.mode).toBe('authored');
    expect(lesson?.faded).toHaveLength(2);
    for (const ex of lesson?.faded ?? []) expect(ex.steps?.length).toBeGreaterThan(0);
  });

  it.each([
    ['the boat (make-set)', 0],
    ['the ten-frame (tenframe-fill)', 1],
  ])('%s: the start only before the child acts; the child steps finish it', (_label, k) => {
    const ex = lesson?.faded[k] as LessonExample;
    const templateId = ex.templateId ?? (lesson?.templateId as string);
    const steps = ex.steps ?? [];
    const childSteps = ex.childSteps ?? 1;
    const demo = steps.slice(0, steps.length - childSteps);
    const child = steps.slice(steps.length - childSteps);
    expect(demo.every((s) => s.actor === 'demo')).toBe(true);
    expect(child.every((s) => s.actor === 'child')).toBe(true);
    const start = Number(ex.params?.start);

    const before = play(templateId, ex, demo);
    const shown =
      typeof before.state.count === 'number'
        ? before.state.count
        : (before.state.cells as number[][]).flat().filter((c) => c !== 0).length;
    expect(shown).toBe(start);
    expect(checkResponse(before.item, before.response as ResponseValue).correct).toBe(false);

    const after = play(templateId, ex, steps);
    expect(checkResponse(after.item, after.response as ResponseValue).correct).toBe(true);
  });
});
