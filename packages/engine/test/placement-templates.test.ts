// 04 §5 step 2 on real templates: a probe prefers a constructed response by the template's own
// answer kind, not its format's capabilities (tap-count answers with a choice in ordinal mode).

import type { ItemTemplate, Skill, SkillGraph } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { buildSkillGraph } from '../src/learner/graph';
import { probeTemplates } from '../src/placement';
import { fixtureGraph, fixtureTemplate, loadFixture } from './fixture';

/** One skill X with copies of real templates as X.t1, X.t2, … (in the given order). */
function graphWith(templates: ItemTemplate[]): SkillGraph {
  const base = fixtureGraph().skills['CNT.02'] as Skill;
  const copies = templates.map((t, i) => ({ ...t, id: `CNT.90.t${i + 1}`, skillId: 'CNT.90' }));
  const skill: Skill = {
    ...base,
    id: 'CNT.90',
    prerequisites: [],
    templates: copies.map((t) => t.id),
    lesson: { ...base.lesson, templateId: 'CNT.90.t1' },
  };
  return buildSkillGraph({
    contentVersion: 'test',
    skills: [skill],
    templates: copies,
    graph: {
      nodes: ['CNT.90'],
      roots: ['CNT.90'],
      gateways: [],
      depth: { 'CNT.90': 0 },
      descendants2: { 'CNT.90': 0 },
    },
  });
}

describe('probe templates by answer kind', () => {
  loadFixture();

  it('an ordinal tap-count template (choice answer) yields to a constructed pictorial one', () => {
    const ordinal = fixtureTemplate('CNT.15.t2'); // count.ordinal, tap-count, pictorial: a choice
    const counting = fixtureTemplate('CNT.02.t3'); // count.set, tap-count, pictorial: a number
    expect(ordinal.format).toBe(counting.format);
    const g = graphWith([ordinal, counting]);
    expect(probeTemplates(g, 'CNT.90')).toEqual(['CNT.90.t2']);
  });

  it('with only choice templates, the tiered pool is used', () => {
    const g = graphWith([fixtureTemplate('CNT.15.t2'), fixtureTemplate('CNT.15.t3')]);
    expect(probeTemplates(g, 'CNT.90')).toEqual(['CNT.90.t1', 'CNT.90.t2']);
  });
});
