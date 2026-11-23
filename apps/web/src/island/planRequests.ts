// The island's requests (05 §2, 04 §6.3): the session planner with the workshops the island has
// (`workshopCapabilities`), each request without the tasks its screen cannot show, and only the
// requests that still hold something to play. The first one is the recommended one. Called when
// the island opens and again after every request, with the learner state as it is then, so the
// next requests reflect what was just played (02 §5.4 re-planning). Framework-free.

import type * as EngineModule from '@number-island/engine';
import type {
  ChildContext,
  GameData,
  IslandState,
  LearnerState,
  MisconceptionId,
  PlannedRequest,
  SkillGraph,
  SkillId,
} from '@number-island/shared';
import { playableTasks } from '@/workshops/practice-pier/pierRequest';
import { workshopCapabilities } from '@/workshops/registry';

export function planIslandRequests(
  engine: Pick<typeof EngineModule, 'planSession'>,
  input: {
    child: ChildContext;
    state: LearnerState;
    graph: SkillGraph;
    gameData: Pick<GameData, 'buildings' | 'residents'>;
    island: IslandState;
    now: number;
    minutes: number;
    /** A remediation queued in an earlier request (04 §6.4 rule 5): the plan starts with it. */
    remediation?: { skillId: SkillId; misconceptionId: MisconceptionId };
  },
): PlannedRequest[] {
  const { remediation, gameData, ...rest } = input;
  const plan = engine.planSession(
    { ...rest, workshopsAvailable: workshopCapabilities(gameData, input.island) },
    remediation ? { remediation } : {},
  );
  return plan.requests
    .map((request) => playableTasks(request, input.graph))
    .filter((request) => request.tasks.length > 0);
}

/** A request the planner made for a queued remediation ("Pebbling has an idea!", 04 §6.4 rule 5). */
export const isRemediation = (request: PlannedRequest) => request.narration === 'req.idea';
