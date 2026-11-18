import { z } from 'zod';
import type { Recipe } from './basics';
import { recipeSchema } from './basics';
import type { AttemptPayload } from './events';
import { attemptContextSchema } from './events';
import type { DecorId, MisconceptionId, ResidentId, SkillId, TemplateId, WorkshopId } from './ids';
import {
  decorIdSchema,
  misconceptionIdSchema,
  residentIdSchema,
  skillIdSchema,
  templateIdSchema,
  workshopIdSchema,
} from './ids';
import { assertType, type Equals } from './internal/type-assert';
import type { CheckResult, NarrationKey, Tier } from './items';
import { checkResultSchema, narrationKeySchema, tierSchema } from './items';
import type { LearnerState, SkillGraph, WorkshopCapability } from './learner';
import { learnerStateSchema, skillGraphSchema, workshopCapabilitySchema } from './learner';
import type { ChildContext } from './profiles';
import { childContextSchema } from './profiles';
import type { IslandState } from './projections';
import { islandStateSchema } from './projections';

// 02 §5.4 session planner and §5.8 in-session adaptation (04 §6). Types only; engine implements.

export interface PlannedTask {
  skillId: SkillId;
  templateId: TemplateId;
  seed: number;
  context: AttemptPayload['context'];
  mode: 'lesson' | 'item';
}

export const plannedTaskSchema = z.object({
  skillId: skillIdSchema,
  templateId: templateIdSchema,
  seed: z.number().int(),
  context: attemptContextSchema,
  mode: z.enum(['lesson', 'item']),
});
assertType<Equals<z.infer<typeof plannedTaskSchema>, PlannedTask>>(true);

export interface PlannedRequest {
  id: string;
  residentId: ResidentId;
  workshopId: WorkshopId;
  tasks: PlannedTask[]; // the item sequence (new skill + interleaved review), 2–4 min
  reward: { materials: Recipe; decor?: DecorId[]; unlocks?: string[] }; // materials = direct product, ≈ 1 per item
  narration: NarrationKey;
  vars: Record<string, string | number>;
}

const narrationVarsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export const plannedRequestSchema = z.object({
  id: z.string().min(1),
  residentId: residentIdSchema,
  workshopId: workshopIdSchema,
  tasks: z.array(plannedTaskSchema),
  reward: z.object({
    materials: recipeSchema,
    decor: z.array(decorIdSchema).optional(),
    unlocks: z.array(z.string().min(1)).optional(),
  }),
  narration: narrationKeySchema,
  vars: narrationVarsSchema,
});
assertType<Equals<z.infer<typeof plannedRequestSchema>, PlannedRequest>>(true);

export interface SessionPlan {
  requests: PlannedRequest[]; // 2–3 offered at a time; the child picks (autonomy)
  warmup: PlannedTask; // easy win first
  windDownAtMs: number;
}

export const sessionPlanSchema = z.object({
  requests: z.array(plannedRequestSchema),
  warmup: plannedTaskSchema,
  windDownAtMs: z.number().nonnegative(),
});
assertType<Equals<z.infer<typeof sessionPlanSchema>, SessionPlan>>(true);

/** The `planSession` argument (02 §5.4). */
export interface PlanSessionInput {
  child: ChildContext;
  state: LearnerState;
  graph: SkillGraph;
  now: number;
  minutes: number;
  workshopsAvailable: WorkshopCapability[];
  island: IslandState;
}

export const planSessionInputSchema = z.object({
  child: childContextSchema,
  state: learnerStateSchema,
  graph: skillGraphSchema,
  now: z.number(),
  minutes: z.number().positive(),
  workshopsAvailable: z.array(workshopCapabilitySchema),
  island: islandStateSchema,
});
assertType<Equals<z.infer<typeof planSessionInputSchema>, PlanSessionInput>>(true);

// ---------- in-session adaptation (04 §6.4) ----------

export interface AdaptInput {
  state: LearnerState;
  graph: SkillGraph;
  child: ChildContext;
  now: number;
  request: PlannedRequest;
  doneTaskIds: number[]; // indexes into request.tasks already presented
  last: {
    task: PlannedTask;
    result: CheckResult;
    attemptNo: number;
    hintsUsed: number;
    latencyMs: number;
  };
  signals: { wrongInLast4: number; rapidWrongTaps: number; longIdles: number };
  tierOverrides: Partial<Record<SkillId, Tier>>;
  elapsedMs: number;
  budgetMs: number;
}

const countSchema = z.number().int().nonnegative();
const tierOverridesSchema = z.partialRecord(skillIdSchema, tierSchema);

export const adaptInputSchema = z.object({
  state: learnerStateSchema,
  graph: skillGraphSchema,
  child: childContextSchema,
  now: z.number(),
  request: plannedRequestSchema,
  doneTaskIds: z.array(countSchema),
  last: z.object({
    task: plannedTaskSchema,
    result: checkResultSchema,
    attemptNo: z.number().int().positive(),
    hintsUsed: countSchema,
    latencyMs: z.number().nonnegative(),
  }),
  signals: z.object({
    wrongInLast4: countSchema,
    rapidWrongTaps: countSchema,
    longIdles: countSchema,
  }),
  tierOverrides: tierOverridesSchema,
  elapsedMs: z.number().nonnegative(),
  budgetMs: z.number().nonnegative(),
});
assertType<Equals<z.infer<typeof adaptInputSchema>, AdaptInput>>(true);

/** The decision proper (02 §5.8 `AdaptDecision` union). */
export type AdaptAction =
  | { action: 'retry'; hintLevel: 1 | 2 | 3 | 4 }
  | { action: 'show-solution' } // second wrong: narrate worked solution, move on
  | { action: 'continue'; tierOverrides?: Partial<Record<SkillId, Tier>>; insert?: PlannedTask[] }
  | { action: 'confidence-then-offer-break'; insert: PlannedTask[] }
  | { action: 'end-request'; reason: 'frustration' | 'wind-down' | 'complete' };

/** Side effects that may accompany any decision (02 §5.8 comment under AdaptDecision). */
export interface AdaptSideEffects {
  /** Next request becomes the remediation lesson. */
  queueRemediation?: { skillId: SkillId; misconceptionId: MisconceptionId };
}

export type AdaptDecision = AdaptAction & AdaptSideEffects;

export const adaptActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('retry'), hintLevel: z.literal([1, 2, 3, 4]) }),
  z.object({ action: z.literal('show-solution') }),
  z.object({
    action: z.literal('continue'),
    tierOverrides: tierOverridesSchema.optional(),
    insert: z.array(plannedTaskSchema).optional(),
  }),
  z.object({
    action: z.literal('confidence-then-offer-break'),
    insert: z.array(plannedTaskSchema),
  }),
  z.object({
    action: z.literal('end-request'),
    reason: z.enum(['frustration', 'wind-down', 'complete']),
  }),
]);
assertType<Equals<z.infer<typeof adaptActionSchema>, AdaptAction>>(true);

export const adaptSideEffectsSchema = z.object({
  queueRemediation: z
    .object({ skillId: skillIdSchema, misconceptionId: misconceptionIdSchema })
    .optional(),
});
assertType<Equals<z.infer<typeof adaptSideEffectsSchema>, AdaptSideEffects>>(true);

export const adaptDecisionSchema = z.intersection(adaptActionSchema, adaptSideEffectsSchema);
assertType<Equals<z.infer<typeof adaptDecisionSchema>, AdaptDecision>>(true);

// ---------- function signatures (implemented in packages/engine/src/planner) ----------

export type PlanSessionFn = (input: PlanSessionInput) => SessionPlan;
/** d* incl. the rolling offset (04 §2.4); difficulty is chosen at presentation time. */
export type TargetDifficultyFn = (
  state: LearnerState,
  skill: SkillId,
  context: AttemptPayload['context'],
  child: ChildContext,
) => number;
export type AdaptNextFn = (input: AdaptInput) => AdaptDecision;
