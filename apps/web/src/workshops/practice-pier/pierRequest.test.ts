// @vitest-environment node
import { registeredFormats } from '@number-island/ui';
import { describe, expect, it } from 'vitest';
import { fixtureContent } from '@/data/store.test-support';
import {
  browseRequest,
  browseSkills,
  PIER_EXCLUDED,
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
    // PV.09 has an excluded template (t3): the skill's request skips it, and picking it alone
    // gives an empty request.
    const all = browseRequest(graph, { skillId: 'PV.09', templateId: null }, 1);
    expect(all.tasks.map((t) => t.templateId)).toEqual([
      'PV.09.t1',
      'PV.09.t2',
      'PV.09.t4',
      'PV.09.t5',
    ]);
    expect(new Set(all.tasks.map((t) => t.seed)).size).toBe(4);
    expect(browseRequest(graph, { skillId: 'PV.09', templateId: 'PV.09.t3' }, 1).tasks).toEqual([]);
    const one = browseRequest(graph, { skillId: 'PV.09', templateId: 'PV.09.t4' }, 1);
    expect(one.tasks.map((t) => t.templateId)).toEqual(['PV.09.t4']);
    // The numeral-pick templates with wide cards under a picture fit now (#12) and are played.
    for (const id of ['ADD.23.t3', 'CMP.09.t4', 'CMP.13.t4']) {
      const template = graph.templates[id];
      expect(template && pierPlayable(template), id).toBe(true);
    }
  });
});
