// @vitest-environment node
import { registeredFormats } from '@number-island/ui';
import { describe, expect, it } from 'vitest';
import { fixtureContent } from '@/data/store.test-support';
import {
  browseRequest,
  browseSkills,
  PIER_EXCLUDED,
  pierLesson,
  pierMisfit,
  pierPlayable,
} from './pierRequest';

const graph = fixtureContent().graph;

describe('what the Practice Pier plays', () => {
  it('every excluded template is real content with a registered widget (a stale entry fails here)', () => {
    const registered = new Set(registeredFormats());
    for (const id of Object.keys(PIER_EXCLUDED)) {
      const template = graph.templates[id];
      expect(template, id).toBeDefined();
      expect(template && registered.has(template.format), id).toBe(true);
      expect(template && pierPlayable(template), id).toBe(false);
    }
  });

  it('leaves out formats without a widget and says why', () => {
    const balance = Object.values(graph.templates).find((t) => t.format === 'balance');
    if (!balance) throw new Error('no balance template in the content');
    expect(pierMisfit(balance)).toBe('no widget yet');
    const pad = Object.values(graph.templates).find((t) => t.format === 'number-pad');
    expect(pad && pierMisfit(pad)).toBeNull();
  });

  it('the content browser lists every skill with templates, and plays only what fits', () => {
    const skills = browseSkills(graph);
    expect(skills.length).toBe(
      Object.values(graph.skills).filter((s) => s.templates.length > 0).length,
    );
    // Every PV.09 template is played: the pictorial base-ten-trade one (t3) fits the area now (#13).
    const all = browseRequest(graph, { skillId: 'PV.09', templateId: null }, 1);
    expect(all.tasks.map((t) => t.templateId)).toEqual([
      'PV.09.t1',
      'PV.09.t2',
      'PV.09.t3',
      'PV.09.t4',
      'PV.09.t5',
    ]);
    expect(new Set(all.tasks.map((t) => t.seed)).size).toBe(5);
    // A template the pier cannot play is skipped, and picking it alone gives an empty request.
    const balance = Object.values(graph.templates).find((t) => t.format === 'balance');
    if (!balance) throw new Error('no balance template in the content');
    const skill = browseRequest(graph, { skillId: balance.skillId, templateId: null }, 1);
    expect(skill.tasks.map((t) => t.templateId)).not.toContain(balance.id);
    expect(
      browseRequest(graph, { skillId: balance.skillId, templateId: balance.id }, 1).tasks,
    ).toEqual([]);
    const one = browseRequest(graph, { skillId: 'PV.09', templateId: 'PV.09.t4' }, 1);
    expect(one.tasks.map((t) => t.templateId)).toEqual(['PV.09.t4']);
    // The numeral-pick templates with wide cards under a picture fit now (#12) and are played.
    // So are the two pictorial base-ten-trade templates (#13).
    for (const id of ['ADD.23.t3', 'CMP.09.t4', 'CMP.13.t4', 'PV.01.t4', 'PV.09.t3']) {
      const template = graph.templates[id];
      expect(template && pierPlayable(template), id).toBe(true);
    }
  });

  it('opens a lesson only where its worked examples can be shown', () => {
    // A gateway skill with an authored lesson on a widget the pier has.
    expect(pierLesson(graph, 'CNT.03')).toBe(true);
    // Fact fluency has no lesson to play (03 §6.4: mode none).
    const none = Object.values(graph.skills).find((s) => s.lesson.mode === 'none');
    if (!none) throw new Error('no skill without a lesson in the content');
    expect(pierLesson(graph, none.id)).toBe(false);
    // A worked example on a format without a widget: nothing to demonstrate.
    const unshown = Object.values(graph.skills).filter((s) =>
      s.lesson.worked.some((e) => {
        const t = graph.templates[e.templateId ?? s.lesson.templateId];
        return t !== undefined && !pierPlayable(t);
      }),
    );
    for (const s of unshown) expect(pierLesson(graph, s.id), s.id).toBe(false);
    const playable = Object.values(graph.skills).filter((s) => pierLesson(graph, s.id));
    expect(playable.length).toBeGreaterThan(90);
  });

  it("the content browser's lesson request: the lesson, then one practice item", () => {
    const request = browseRequest(graph, { skillId: 'CNT.03', templateId: null, lesson: true }, 9);
    expect(request.tasks.map((t) => [t.mode, t.context, t.skillId])).toEqual([
      ['lesson', 'lesson', 'CNT.03'],
      ['item', 'practice', 'CNT.03'],
    ]);
    expect(request.tasks[0]?.templateId).toBe(graph.skills['CNT.03']?.lesson.templateId);
  });
});
