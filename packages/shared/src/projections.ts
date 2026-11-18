import { z } from 'zod';
import type { Plot, Recipe } from './basics';
import { plotSchema, recipeSchema } from './basics';
import type { UnlockRule } from './gamedata';
import { unlockRuleSchema } from './gamedata';
import type { BuildingId, ChildId, DecorId, MaterialId, ResidentId, SkillId } from './ids';
import {
  buildingIdSchema,
  childIdSchema,
  decorIdSchema,
  materialIdSchema,
  residentIdSchema,
  skillIdSchema,
} from './ids';
import { assertType, type Equals } from './internal/type-assert';

// 02 §5.8 projections (folds live in packages/engine, 02 §4.3).

const tsSchema = z.number().int().nonnegative();
const countSchema = z.number().int().nonnegative();
const instanceIdSchema = z.string().min(1);

export interface IslandState {
  name: string | null;
  ringsUnlocked: number;
  roadLength: number;
  buildings: Record<
    string /*instanceId*/,
    { buildingId: BuildingId; plot: Plot; level: 1 | 2 | 3; placedBy: ChildId | null; ts: number }
  >;
  decor: Record<
    string /*instanceId*/,
    { decorId: DecorId; pos: Plot; placedBy: ChildId | null; ts: number }
  >;
  residents: Record<ResidentId, { arrivedTs: number; homeInstanceId: string | null }>;
  projects: Record<BuildingId, { contributed: Recipe; byChild: Record<ChildId, number> }>; // badges only, never shown as scores
  festival: {
    active: { festivalId: string; startedTs: number } | null;
    completed: number;
    daysOfPlaySinceLast: number;
  };
  giftsPending: string[]; // gift ids not yet opened (per child filtering in UI)
  milestones: Record<string, { label: string; trigger: UnlockRule; reachedTs: number | null }>;
}

export const islandStateSchema = z.object({
  name: z.string().nullable(),
  ringsUnlocked: countSchema,
  roadLength: countSchema,
  buildings: z.record(
    instanceIdSchema,
    z.object({
      buildingId: buildingIdSchema,
      plot: plotSchema,
      level: z.literal([1, 2, 3]),
      placedBy: childIdSchema.nullable(),
      ts: tsSchema,
    }),
  ),
  decor: z.record(
    instanceIdSchema,
    z.object({
      decorId: decorIdSchema,
      pos: plotSchema,
      placedBy: childIdSchema.nullable(),
      ts: tsSchema,
    }),
  ),
  residents: z.record(
    residentIdSchema,
    z.object({ arrivedTs: tsSchema, homeInstanceId: instanceIdSchema.nullable() }),
  ),
  projects: z.record(
    buildingIdSchema,
    z.object({ contributed: recipeSchema, byChild: z.record(childIdSchema, countSchema) }),
  ),
  festival: z.object({
    active: z.object({ festivalId: z.string().min(1), startedTs: tsSchema }).nullable(),
    completed: countSchema,
    daysOfPlaySinceLast: countSchema,
  }),
  giftsPending: z.array(z.string().min(1)),
  milestones: z.record(
    z.string().min(1),
    z.object({ label: z.string(), trigger: unlockRuleSchema, reachedTs: tsSchema.nullable() }),
  ),
});
assertType<Equals<z.infer<typeof islandStateSchema>, IslandState>>(true);

export interface InventoryState {
  materials: Record<MaterialId, number>;
  producedByChild: Record<ChildId, Recipe>;
}

export const inventoryStateSchema = z.object({
  materials: z.record(materialIdSchema, countSchema), // clamped at 0 (02 §4.3)
  producedByChild: z.record(childIdSchema, recipeSchema),
});
assertType<Equals<z.infer<typeof inventoryStateSchema>, InventoryState>>(true);

export interface CollectionState {
  residents: ResidentId[]; // collected = arrived
  decorOwned: Record<DecorId, number>;
  outfitsUnlocked: string[]; // family-wide avatar options
  badges: Record<ChildId, { skillId: SkillId; ts: number }[]>; // mastery moments
}

export const collectionStateSchema = z.object({
  residents: z.array(residentIdSchema),
  decorOwned: z.record(decorIdSchema, countSchema),
  outfitsUnlocked: z.array(z.string().min(1)),
  badges: z.record(childIdSchema, z.array(z.object({ skillId: skillIdSchema, ts: tsSchema }))),
});
assertType<Equals<z.infer<typeof collectionStateSchema>, CollectionState>>(true);

/** Accumulate-only within a week: progress never decreases. */
export interface WeeklyGoalState {
  byChild: Record<
    ChildId,
    {
      weekStart: string /*ISO date, Monday, family tz*/;
      target: number;
      progress: number;
      weeksCompleted: number;
    }
  >;
}

export const weeklyGoalStateSchema = z.object({
  byChild: z.record(
    childIdSchema,
    z.object({
      weekStart: z.iso.date(),
      target: countSchema,
      progress: countSchema,
      weeksCompleted: countSchema,
    }),
  ),
});
assertType<Equals<z.infer<typeof weeklyGoalStateSchema>, WeeklyGoalState>>(true);
