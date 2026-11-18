import { z } from 'zod';
import type { ItemTemplate, Skill } from './content';
import { itemTemplateSchema, skillSchema } from './content';
import type { AttemptPayload } from './events';
import { attemptContextSchema } from './events';
import type {
  ChildId,
  MaterialId,
  MisconceptionId,
  ResidentId,
  SkillId,
  TemplateId,
  WorkshopId,
} from './ids';
import {
  childIdSchema,
  materialIdSchema,
  misconceptionIdSchema,
  residentIdSchema,
  skillIdSchema,
  templateIdSchema,
  workshopIdSchema,
} from './ids';
import { assertType, type Equals } from './internal/type-assert';
import type { ItemFormat, Representation, Tier } from './items';
import { itemFormatSchema, representationSchema, tierSchema } from './items';
import type { StrandId } from './strands';
import { strandIdSchema } from './strands';

// 02 §5.3 learner model interface and §5.8 learner types (04).

export type SkillStatus =
  | 'locked'
  | 'ready'
  | 'learning'
  | 'practiced'
  | 'fluent'
  | 'mastered'
  | 'needs-review';
export const SKILL_STATUSES = [
  'locked',
  'ready',
  'learning',
  'practiced',
  'fluent',
  'mastered',
  'needs-review',
] as const;
export const skillStatusSchema = z.enum(SKILL_STATUSES);
assertType<Equals<z.infer<typeof skillStatusSchema>, SkillStatus>>(true);

const tsSchema = z.number().int().nonnegative();
const countSchema = z.number().int().nonnegative();
const unitIntervalSchema = z.number().min(0).max(1);

export interface SkillGraph {
  contentVersion: string;
  skills: Record<SkillId, Skill>;
  templates: Record<TemplateId, ItemTemplate>;
  nodes: SkillId[]; // topological order
  prereqs: Record<SkillId, SkillId[]>;
  dependents: Record<SkillId, SkillId[]>;
  encompasses: Record<SkillId, Record<SkillId, number>>;
  depth: Record<SkillId, number>;
  descendants2: Record<SkillId, number>;
  roots: SkillId[];
  gateways: SkillId[];
  templateStats: Record<
    TemplateId,
    { min: number; p10: number; median: number; p90: number; max: number; distinct: number }
  >;
}

export const skillGraphSchema = z.object({
  contentVersion: z.string().min(1),
  skills: z.record(skillIdSchema, skillSchema),
  templates: z.record(templateIdSchema, itemTemplateSchema),
  nodes: z.array(skillIdSchema),
  prereqs: z.record(skillIdSchema, z.array(skillIdSchema)),
  dependents: z.record(skillIdSchema, z.array(skillIdSchema)),
  encompasses: z.record(skillIdSchema, z.record(skillIdSchema, unitIntervalSchema)),
  depth: z.record(skillIdSchema, countSchema),
  descendants2: z.record(skillIdSchema, countSchema),
  roots: z.array(skillIdSchema),
  gateways: z.array(skillIdSchema),
  templateStats: z.record(
    templateIdSchema,
    z.object({
      min: z.number(),
      p10: z.number(),
      median: z.number(),
      p90: z.number(),
      max: z.number(),
      distinct: countSchema,
    }),
  ),
});
assertType<Equals<z.infer<typeof skillGraphSchema>, SkillGraph>>(true);

export interface RatedAttempt {
  ts: number;
  sessionId: string;
  correct: boolean;
  hinted: boolean;
  format: ItemFormat;
  tier: Tier;
  representation: Representation;
  latencyMs: number;
  context: AttemptPayload['context'];
}

export const ratedAttemptSchema = z.object({
  ts: tsSchema,
  sessionId: z.string().min(1),
  correct: z.boolean(),
  hinted: z.boolean(),
  format: itemFormatSchema,
  tier: tierSchema,
  representation: representationSchema,
  latencyMs: z.number().nonnegative(),
  context: attemptContextSchema,
});
assertType<Equals<z.infer<typeof ratedAttemptSchema>, RatedAttempt>>(true);

export interface SkillState {
  theta: number;
  n: number; // 04 §2.1
  recent: RatedAttempt[]; // last 10 first attempts counted as evidence
  assumed: boolean;
  override: 'mastered' | 'reset' | null;
  practicedAt: number | null;
  fluentAt: number | null;
  masteredAt: number | null;
  memory: {
    intervalDays: number;
    lastReviewTs: number;
    dueTs: number;
    reps: number;
    reviewsPassed: number[] /*ts*/;
    consecutiveFails: number;
  } | null; // null until practiced
  atRiskDueTs: number | null; // failure propagation (04 §4)
  misconceptionHits: { id: MisconceptionId; ts: number }[]; // within the last 10 attempts
}

export const skillStateSchema = z.object({
  theta: z.number(),
  n: countSchema,
  recent: z.array(ratedAttemptSchema),
  assumed: z.boolean(),
  override: z.enum(['mastered', 'reset']).nullable(),
  practicedAt: tsSchema.nullable(),
  fluentAt: tsSchema.nullable(),
  masteredAt: tsSchema.nullable(),
  memory: z
    .object({
      intervalDays: z.number().nonnegative(),
      lastReviewTs: tsSchema,
      dueTs: tsSchema,
      reps: countSchema,
      reviewsPassed: z.array(tsSchema),
      consecutiveFails: countSchema,
    })
    .nullable(),
  atRiskDueTs: tsSchema.nullable(),
  misconceptionHits: z.array(z.object({ id: misconceptionIdSchema, ts: tsSchema })),
});
assertType<Equals<z.infer<typeof skillStateSchema>, SkillState>>(true);

export interface PlacementPrior {
  p: Record<SkillId, number>;
  assumed: SkillId[];
}

export const placementPriorSchema = z.object({
  p: z.record(skillIdSchema, unitIntervalSchema),
  assumed: z.array(skillIdSchema),
});
assertType<Equals<z.infer<typeof placementPriorSchema>, PlacementPrior>>(true);

export interface LearnerState {
  modelId: string;
  childId: ChildId;
  thetaG: number;
  nTotal: number;
  skills: Record<SkillId, SkillState>; // absent = never touched (status from graph)
  successOffset: number;
  recentFirstTry: boolean[]; // rolling controller, last 20 (04 §2.4)
  placement: { prior: PlacementPrior | null; strandsPlaced: StrandId[]; inProgress: string | null };
  sessionsSeen: number;
}

export const learnerStateSchema = z.object({
  modelId: z.string().min(1),
  childId: childIdSchema,
  thetaG: z.number(),
  nTotal: countSchema,
  skills: z.record(skillIdSchema, skillStateSchema),
  successOffset: z.number(),
  recentFirstTry: z.array(z.boolean()).max(20),
  placement: z.object({
    prior: placementPriorSchema.nullable(),
    strandsPlaced: z.array(strandIdSchema),
    inProgress: z.string().min(1).nullable(),
  }),
  sessionsSeen: countSchema,
});
assertType<Equals<z.infer<typeof learnerStateSchema>, LearnerState>>(true);

export interface DueReview {
  skillId: SkillId;
  dueTs: number;
  retrievability: number;
  depth: number;
  atRisk: boolean;
}

export const dueReviewSchema = z.object({
  skillId: skillIdSchema,
  dueTs: tsSchema,
  retrievability: unitIntervalSchema,
  depth: countSchema,
  atRisk: z.boolean(),
});
assertType<Equals<z.infer<typeof dueReviewSchema>, DueReview>>(true);

export interface WorkshopCapability {
  workshopId: WorkshopId;
  formats: ItemFormat[];
  strands: StrandId[];
  available: boolean; // built (family-wide)
  residents: ResidentId[];
  produces: MaterialId[];
}

export const workshopCapabilitySchema = z.object({
  workshopId: workshopIdSchema,
  formats: z.array(itemFormatSchema),
  strands: z.array(strandIdSchema),
  available: z.boolean(),
  residents: z.array(residentIdSchema),
  produces: z.array(materialIdSchema),
});
assertType<Equals<z.infer<typeof workshopCapabilitySchema>, WorkshopCapability>>(true);

/** 02 §5.3. Implemented in packages/engine/src/learner; every method is pure. */
export interface LearnerModel {
  // `'elo-fire-v1' | string` as written in 02 §5.3 (documents the v1 id; widens to string).
  readonly id: 'elo-fire-v1' | string;
  init(graph: SkillGraph, prior: PlacementPrior | null): LearnerState;
  apply(state: LearnerState, attempt: AttemptPayload, ts: number): LearnerState; // pure
  predict(state: LearnerState, skill: SkillId, itemDifficulty: number): number; // P(correct)
  status(state: LearnerState, skill: SkillId, now: number): SkillStatus;
  dueReviews(state: LearnerState, now: number): DueReview[];
  frontier(state: LearnerState): SkillId[];
}
