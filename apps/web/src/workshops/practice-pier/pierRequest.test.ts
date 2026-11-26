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

  it('leaves out a format without a widget and says why; every shipped format has one (#13)', () => {
    expect(pierMisfit({ id: 'X.01.t1', format: 'no-such-format' as never })).toBe('no widget yet');
    const registered = new Set(registeredFormats());
    for (const t of Object.values(graph.templates)) {
      expect(registered.has(t.format), `${t.id} (${t.format})`).toBe(true);
      expect(pierMisfit(t), t.id).toBeNull();
    }
  });

  it('plays every puzzle-grid template (#13: the format has its widget)', () => {
    const templates = Object.values(graph.templates).filter((t) => t.format === 'puzzle-grid');
    expect(templates.map((t) => t.id).sort()).toEqual([
      'CPS.06.t3',
      'PUZ.01.t1',
      'PUZ.02.t1',
      'PUZ.02.t3',
      'PUZ.03.t2',
    ]);
    for (const t of templates) {
      expect(pierPlayable(t), t.id).toBe(true);
      const skill = browseRequest(graph, { skillId: t.skillId, templateId: null }, 1);
      expect(skill.tasks.map((x) => x.templateId)).toContain(t.id);
      const one = browseRequest(graph, { skillId: t.skillId, templateId: t.id }, 1);
      expect(one.tasks.map((x) => x.templateId)).toEqual([t.id]);
    }
  });

  it('plays every balance and story-problem template (#13: both have their widget)', () => {
    const templates = Object.values(graph.templates).filter(
      (t) => t.format === 'balance' || t.format === 'story-problem',
    );
    expect(templates.map((t) => t.id).sort()).toEqual([
      'ADD.05.t2',
      'ADD.10.t1',
      'ADD.10.t3',
      'ADD.11.t1',
      'ADD.12.t1',
      'ADD.20.t3',
      'ADD.21.t2',
      'ADD.25.t2',
      'ALG.05.t1',
      'ALG.05.t3',
      'ALG.05.t4',
      'CMP.08.t1',
      'MDA.15.t3',
      'MDA.22.t2',
      'MEA.16.t1',
    ]);
    for (const t of templates) {
      expect(pierMisfit(t), t.id).toBeNull();
      expect(pierPlayable(t), t.id).toBe(true);
    }
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
