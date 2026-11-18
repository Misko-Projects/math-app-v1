// Builds the 02 §5.8 `SkillGraph` the learner model and planner read, from the compiled content
// (`skills.json`, `templates.json`, `graph.json`, `template-stats.json`, 03 §9.1).

import type { CompiledGraph } from '@number-island/content';
import type { ItemTemplate, Skill, SkillGraph, SkillId, TemplateId } from '@number-island/shared';

export interface SkillGraphInput {
  contentVersion: string;
  skills: readonly Skill[];
  templates: readonly ItemTemplate[];
  graph: Pick<CompiledGraph, 'nodes' | 'roots' | 'gateways' | 'depth' | 'descendants2'>;
  templateStats?: SkillGraph['templateStats'];
}

export function buildSkillGraph(input: SkillGraphInput): SkillGraph {
  const skills: Record<SkillId, Skill> = {};
  for (const s of input.skills) skills[s.id] = s;
  const templates: Record<TemplateId, ItemTemplate> = {};
  for (const t of input.templates) templates[t.id] = t;

  const prereqs: Record<SkillId, SkillId[]> = {};
  const dependents: Record<SkillId, SkillId[]> = {};
  const encompasses: Record<SkillId, Record<SkillId, number>> = {};
  const ids = Object.keys(skills).sort();
  for (const id of ids) dependents[id] = [];
  for (const id of ids) {
    const s = skills[id] as Skill;
    prereqs[id] = [...s.prerequisites].filter((p) => p in skills).sort();
    for (const p of prereqs[id]) (dependents[p] as SkillId[]).push(id);
    encompasses[id] = { ...s.encompasses };
  }
  for (const id of ids) (dependents[id] as SkillId[]).sort();

  return {
    contentVersion: input.contentVersion,
    skills,
    templates,
    nodes: [...input.graph.nodes],
    prereqs,
    dependents,
    encompasses,
    depth: { ...input.graph.depth },
    descendants2: { ...input.graph.descendants2 },
    roots: [...input.graph.roots],
    gateways: [...input.graph.gateways],
    templateStats: { ...(input.templateStats ?? {}) },
  };
}

/** Descendants of `skill` within `maxHops` hops, nearest first, each with its hop distance. */
export function descendantsWithin(
  graph: SkillGraph,
  skill: SkillId,
  maxHops: number,
): { id: SkillId; hops: number }[] {
  const out: { id: SkillId; hops: number }[] = [];
  const seen = new Set<SkillId>([skill]);
  let layer: SkillId[] = [skill];
  for (let h = 1; h <= maxHops && layer.length > 0; h++) {
    const next: SkillId[] = [];
    for (const id of layer)
      for (const d of graph.dependents[id] ?? []) {
        if (seen.has(d)) continue;
        seen.add(d);
        next.push(d);
        out.push({ id: d, hops: h });
      }
    layer = next.sort();
  }
  return out;
}

/** Every descendant of `skill` (any distance), sorted by id. */
export function allDescendants(graph: SkillGraph, skill: SkillId): SkillId[] {
  return descendantsWithin(graph, skill, Number.POSITIVE_INFINITY)
    .map((d) => d.id)
    .sort();
}
