// 04 §2.4 difficulty targeting (02 §5.4 `targetDifficulty`): d* = θg + θs − logit(p*) + offset.
// The TaskRunner calls it at presentation time; the planner never fixes a difficulty. Pure.

import type {
  AttemptPayload,
  ChildContext,
  LearnerState,
  SkillGraph,
  SkillId,
} from '@number-island/shared';
import { createEloFireModel } from '../learner/elo-fire';
import { logit } from '../learner/math';
import { type EngineParams, PARAMS } from '../params';

type TargetKey = keyof EngineParams['targets'];

/**
 * The p* row for a context (04 §2.4 table). `transfer-probe` is a review task, so it uses the
 * review target; `lesson` (its scaffolded items) uses practice (E03 readings). `placement` has no
 * target: it asks at the reference difficulty.
 */
const TARGET_ROW: Record<Exclude<AttemptPayload['context'], 'placement'>, TargetKey> = {
  practice: 'practice',
  lesson: 'practice',
  review: 'review',
  'transfer-probe': 'review',
  warmup: 'warmup',
  challenge: 'challenge',
};

/** p* for a context and child: the K column only for a K child (G1 uses G1+ here, 04 §2.4). */
export function targetSuccess(
  context: Exclude<AttemptPayload['context'], 'placement'>,
  child: Pick<ChildContext, 'isK'>,
  params: EngineParams = PARAMS,
): number {
  const [g1, k] = params.targets[TARGET_ROW[context]];
  return child.isK ? k : g1;
}

/**
 * θs without a graph (no transfer, which needs the prerequisites): the skill's own offset once
 * rated (n > 0, or kept by a parent reset), else its placement-prior offset, else the stored
 * offset of an existing skill state, else 0.
 */
function offsetWithoutGraph(state: LearnerState, skill: SkillId, params: EngineParams): number {
  const st = state.skills[skill];
  if (st && (st.n > 0 || st.override === 'reset')) return st.theta;
  const p = state.placement.prior?.p[skill];
  if (p !== undefined) {
    const [lo, hi] = params.rating.priorClamp;
    return logit(Math.min(hi, Math.max(lo, p))) - state.thetaG;
  }
  return st?.theta ?? 0;
}

/**
 * d* for one item of `skill` in `context` (04 §2.4), including the rolling success offset.
 * `placement` returns 0, the reference difficulty (04 §5). With `graph`, θs is the model's
 * `skillOffset` (own offset, placement prior or transfer, 04 §2.1); without one, see
 * `offsetWithoutGraph`. The two optional arguments extend the 02 §5.4 signature.
 */
export function targetDifficulty(
  state: LearnerState,
  skill: SkillId,
  context: AttemptPayload['context'],
  child: ChildContext,
  graph?: SkillGraph,
  params: EngineParams = PARAMS,
): number {
  if (context === 'placement') return 0;
  const thetaS = graph
    ? createEloFireModel(graph, { childId: child.childId, isK: child.isK, params }).skillOffset(
        state,
        skill,
      )
    : offsetWithoutGraph(state, skill, params);
  return state.thetaG + thetaS - logit(targetSuccess(context, child, params)) + state.successOffset;
}
