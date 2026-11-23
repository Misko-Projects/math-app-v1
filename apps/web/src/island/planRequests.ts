// The island's requests (05 §2, 04 §6.3): the session planner with the workshops the island has
// (`workshopCapabilities`), each request without the tasks its screen cannot show, and only the
// requests that still hold something to play. The first one is the recommended one. Called when
// the island opens and again after every request, with the learner state as it is then, so the
// next requests reflect what was just played (02 §5.4 re-planning). Framework-free.
//
// The plan's warmup (04 §6.1, "easy win first") comes with it: the island puts it before the
// request the child picks (`withWarmup`), so the planner's run rule, which counts the warmup in a
// request's first run, holds whichever request that is. A request with challenge items carries a
// decor of the Puzzle Tower's (`reward.decor`, 04 §6.3): the planner is given the game's.

import type * as EngineModule from '@number-island/engine';
import type {
  ChildContext,
  GameData,
  InventoryState,
  IslandState,
  LearnerState,
  MisconceptionId,
  PlannedRequest,
  PlannedTask,
  SkillGraph,
  SkillId,
} from '@number-island/shared';
import { playableTasks } from '@/workshops/practice-pier/pierRequest';
import { workshopCapabilities } from '@/workshops/registry';

export interface IslandPlan {
  requests: PlannedRequest[];
  /** The plan's warmup task, or null when the pier cannot show it. */
  warmup: PlannedTask | null;
}

export function planIslandRequests(
  engine: Pick<typeof EngineModule, 'planSession'>,
  input: {
    child: ChildContext;
    state: LearnerState;
    graph: SkillGraph;
    gameData: Pick<GameData, 'buildings' | 'residents' | 'decor'>;
    island: IslandState;
    /** The Storehouse (which of a workshop's products is scarcer). */
    inventory?: Pick<InventoryState, 'materials'>;
    now: number;
    minutes: number;
    /** A remediation queued in an earlier request (04 §6.4 rule 5): the plan starts with it. */
    remediation?: { skillId: SkillId; misconceptionId: MisconceptionId };
  },
): IslandPlan {
  const { remediation, gameData, inventory, ...rest } = input;
  const plan = engine.planSession(
    { ...rest, workshopsAvailable: workshopCapabilities(gameData, input.island, inventory) },
    {
      puzzleDecor: gameData.decor.filter((d) => d.source === 'puzzle').map((d) => d.id),
      ...(remediation ? { remediation } : {}),
    },
  );
  const requests = plan.requests
    .map((request) => playableTasks(request, input.graph))
    .filter((request) => request.tasks.length > 0);
  const [first] = requests;
  const warmup =
    first && playableTasks({ ...first, tasks: [plan.warmup] }, input.graph).tasks.length > 0
      ? plan.warmup
      : null;
  return { requests, warmup };
}

/**
 * Whether a session's next request starts with the plan's warmup: the first request of the
 * session does, and so does every request while the warmup is a lesson. A lesson is the warmup
 * only while the child has attempted nothing (04 §6.1 (e)), and the requests of that plan leave
 * the lesson out because the warmup plays it: left before it was played, it is still owed.
 */
export const warmupDue = (warmup: PlannedTask | null, warmedUp: boolean): warmup is PlannedTask =>
  warmup !== null && (!warmedUp || warmup.mode === 'lesson');

/** The request as it is played: the warmup first. */
export const withWarmup = (request: PlannedRequest, warmup: PlannedTask): PlannedRequest => ({
  ...request,
  tasks: [warmup, ...request.tasks],
});

/** A request the planner made for a queued remediation ("Pebbling has an idea!", 04 §6.4 rule 5). */
export const isRemediation = (request: PlannedRequest) => request.narration === 'req.idea';
