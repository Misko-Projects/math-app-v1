// What the Practice Pier plays (05 §4: the plain pier that hosts every format). Framework-free.
//
// - `pierPlayable(template)`: what the pier can show today. A format without a registered widget
//   would only show the placeholder, whose "next" answers a skip that would count against the
//   child, so its tasks are left out. `PIER_EXCLUDED` lists the templates whose widget puts a
//   control the child needs below the workshop area on the 1280 × 800 tablet, each with the
//   reason (#20 part 1, "Does not fit yet": measured per template in the pier; the fix belongs to
//   the widget, and the entry goes when it lands). It is empty since #13.
// - `planPierRequest`: the session planner with no themed workshop built, so every request falls
//   back to the pier (04 §6.3); the first request with a playable item is taken. The request
//   picker and the warmup arrive with the island hub (I01).
// - `browseRequest`: the dev content browser's request, one item per playable template of a skill.

import type * as EngineModule from '@number-island/engine';
import type {
  ChildContext,
  IslandState,
  ItemFormat,
  ItemTemplate,
  LearnerState,
  MisconceptionId,
  PlannedRequest,
  SkillGraph,
  SkillId,
  TemplateId,
} from '@number-island/shared';
import { registeredFormats } from '@number-island/ui';

/** Templates with a widget that the pier does not play yet, and why. */
export const PIER_EXCLUDED: Readonly<Record<TemplateId, string>> = {};

const registered = new Set<ItemFormat>(registeredFormats());

/** Why the pier cannot play a template, or null when it can. */
export function pierMisfit(t: Pick<ItemTemplate, 'id' | 'format'>): string | null {
  if (!registered.has(t.format)) return 'no widget yet';
  return PIER_EXCLUDED[t.id] ?? null;
}

export function pierPlayable(t: Pick<ItemTemplate, 'id' | 'format'>): boolean {
  return pierMisfit(t) === null;
}

/** The request without lesson tasks (the lesson player is #20 part 3) and unplayable formats. */
function playableTasks(request: PlannedRequest, graph: SkillGraph): PlannedRequest {
  return {
    ...request,
    tasks: request.tasks.filter((t) => {
      const template = graph.templates[t.templateId];
      return t.mode === 'item' && template !== undefined && pierPlayable(template);
    }),
  };
}

export function planPierRequest(
  engine: Pick<typeof EngineModule, 'planSession'>,
  input: {
    child: ChildContext;
    state: LearnerState;
    graph: SkillGraph;
    island: IslandState;
    now: number;
    minutes: number;
    /** A remediation queued in an earlier request (04 §6.4 rule 5): the plan starts with it. */
    remediation?: { skillId: SkillId; misconceptionId: MisconceptionId };
  },
): PlannedRequest | null {
  const { remediation, ...rest } = input;
  const plan = engine.planSession(
    { ...rest, workshopsAvailable: [] },
    remediation ? { remediation } : {},
  );
  for (const request of plan.requests) {
    const playable = playableTasks(request, input.graph);
    if (playable.tasks.length > 0) return playable;
  }
  return null;
}

/** The skills the content browser lists: every skill with at least one template. */
export function browseSkills(graph: SkillGraph): { skillId: SkillId; templates: ItemTemplate[] }[] {
  return graph.nodes
    .map((skillId) => ({
      skillId,
      templates: (graph.skills[skillId]?.templates ?? [])
        .map((id) => graph.templates[id])
        .filter((t): t is ItemTemplate => t !== undefined),
    }))
    .filter((s) => s.templates.length > 0);
}

/** What the content browser plays: a skill, or one of its templates alone. */
export interface BrowsePick {
  skillId: SkillId;
  templateId: TemplateId | null;
}

/**
 * One practice item per playable template of the skill (or the one picked template); `nonce`
 * varies the seeds and the id.
 */
export function browseRequest(graph: SkillGraph, pick: BrowsePick, nonce: number): PlannedRequest {
  const { skillId } = pick;
  const templates = (graph.skills[skillId]?.templates ?? []).filter((id) => {
    const template = graph.templates[id];
    return (
      template !== undefined &&
      pierPlayable(template) &&
      (pick.templateId === null || pick.templateId === id)
    );
  });
  return {
    id: `browse:${skillId}:${nonce}`,
    residentId: 'pip',
    workshopId: 'practice-pier',
    tasks: templates.map((templateId, i) => ({
      skillId,
      templateId,
      seed: (nonce + i * 7919) % 0x7fffffff,
      context: 'practice',
      mode: 'item',
    })),
    reward: { materials: {} },
    narration: 'req.help',
    vars: {},
  };
}
