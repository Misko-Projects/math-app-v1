// What the Practice Pier plays (05 §4: the plain pier that hosts every format). Framework-free.
//
// - `pierPlayable(template)`: what the pier can show today. A format without a registered widget
//   would only show the placeholder, whose "next" answers a skip that would count against the
//   child, so its tasks are left out. `PIER_EXCLUDED` lists the templates whose widget puts a
//   control the child needs below the workshop area on the 1280 × 800 tablet, each with the
//   reason (#20 part 1, "Does not fit yet": measured per template in the pier; the fix belongs to
//   the widget, and the entry goes when it lands). It is empty since #13.
// - `planPierRequest`: the session planner with no themed workshop built, so every request falls
//   back to the pier (04 §6.3); the first request with a playable item is taken. The island
//   plans its own requests (`island/planRequests.ts`); this one is the runner tests' request.
// - `browseRequest`: the dev content browser's request, one item per playable template of a skill,
//   or the skill's lesson followed by one practice item.
// - A lesson task stays in a request when the pier can show an example of that lesson (03 §6).

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
import { lessonPlayable } from '@/runner/lesson';

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

/** Whether the pier can open a skill's lesson: it has an example on a template the pier shows. */
export function pierLesson(graph: SkillGraph, skillId: SkillId): boolean {
  const skill = graph.skills[skillId];
  return skill !== undefined && lessonPlayable(graph, skill, pierPlayable);
}

/** The request without the tasks the pier cannot show: unplayable formats, and lessons with no example it shows. */
export function playableTasks(request: PlannedRequest, graph: SkillGraph): PlannedRequest {
  return {
    ...request,
    tasks: request.tasks.filter((t) => {
      if (t.mode === 'lesson') return pierLesson(graph, t.skillId);
      const template = graph.templates[t.templateId];
      return template !== undefined && pierPlayable(template);
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
  /** The skill's lesson, then one practice item. */
  lesson?: boolean;
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
  const items: PlannedRequest['tasks'] = templates.map((templateId, i) => ({
    skillId,
    templateId,
    seed: (nonce + i * 7919) % 0x7fffffff,
    context: 'practice',
    mode: 'item',
  }));
  const lessonTemplate = graph.skills[skillId]?.lesson.templateId;
  return {
    id: `browse:${skillId}:${nonce}`,
    residentId: 'pip',
    workshopId: 'practice-pier',
    tasks:
      pick.lesson && lessonTemplate !== undefined
        ? [
            { skillId, templateId: lessonTemplate, seed: nonce, context: 'lesson', mode: 'lesson' },
            ...items.slice(0, 1),
          ]
        : items,
    reward: { materials: {} },
    narration: 'req.help',
    vars: {},
  };
}
