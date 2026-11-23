import { z } from 'zod';
import type { Grade, Plot, Recipe } from './basics';
import { gradeSchema, plotSchema, recipeSchema } from './basics';
import type { Skill } from './content';
import { skillKindSchema } from './content';
import type { BuildingId, DecorId, MaterialId, ResidentId, SkillId, WorkshopId } from './ids';
import {
  buildingIdSchema,
  decorIdSchema,
  materialIdSchema,
  residentIdSchema,
  skillIdSchema,
  workshopIdSchema,
} from './ids';
import { assertType, type Equals } from './internal/type-assert';
import type { NarrationKey } from './items';
import { narrationKeySchema } from './items';

// 02 §5.8 game data (authored in packages/content/game/*.yaml → dist/game.json).

/** Unlocks are FAMILY-WIDE: once satisfied, the building/workshop is available to every child. */
export type UnlockRule =
  | { start: true }
  | { all: UnlockRule[] }
  | { any: UnlockRule[] }
  | { skill: SkillId; atLeast: 'ready' | 'practiced' | 'mastered' } // satisfied when ANY child reaches it
  | { skillKind: Skill['kind']; atLeast: 'practiced' | 'mastered' } // any skill of that kind, any child
  | { minGrade: Grade } // any child's profile grade ≥
  | { masteredCount: number } // any single child
  | { building: BuildingId; level?: 1 | 2 | 3 }
  | { roadLength: number }
  | { residentCount: number };

const countSchema = z.number().int().nonnegative();
const levelSchema = z.literal([1, 2, 3]);

// Recursive: the exported schema is annotated and lazy; `unlockRuleUnionSchema` carries the
// structural inference so the Equals check below is real, not trivially true.
export const unlockRuleSchema: z.ZodType<UnlockRule> = z.lazy(() => unlockRuleUnionSchema);
const unlockRuleUnionSchema = z.union([
  z.object({ start: z.literal(true) }),
  z.object({ all: z.array(unlockRuleSchema) }),
  z.object({ any: z.array(unlockRuleSchema) }),
  z.object({ skill: skillIdSchema, atLeast: z.enum(['ready', 'practiced', 'mastered']) }),
  z.object({ skillKind: skillKindSchema, atLeast: z.enum(['practiced', 'mastered']) }),
  z.object({ minGrade: gradeSchema }),
  z.object({ masteredCount: countSchema }),
  z.object({ building: buildingIdSchema, level: levelSchema.optional() }),
  z.object({ roadLength: countSchema }),
  z.object({ residentCount: countSchema }),
]);
assertType<Equals<z.infer<typeof unlockRuleUnionSchema>, UnlockRule>>(true);

const footprintSchema = z.tuple([z.number().int().positive(), z.number().int().positive()]);

export interface BuildingDef {
  id: BuildingId;
  kind: 'workshop' | 'home' | 'storehouse' | 'landmark' | 'project';
  workshopId?: WorkshopId; // kind 'workshop'
  art: string;
  footprint: [number, number];
  unlock: UnlockRule;
  levels: { level: 1 | 2 | 3; recipe: Recipe; unlocks: string[] }[]; // level 1 recipe = build cost
  shared?: boolean; // co-op project needing both children's materials (05 §6)
}

export const buildingDefSchema = z.object({
  id: buildingIdSchema,
  kind: z.enum(['workshop', 'home', 'storehouse', 'landmark', 'project']),
  workshopId: workshopIdSchema.optional(),
  art: z.string().min(1),
  footprint: footprintSchema,
  unlock: unlockRuleSchema,
  levels: z.array(
    z.object({ level: levelSchema, recipe: recipeSchema, unlocks: z.array(z.string().min(1)) }),
  ),
  shared: z.boolean().optional(),
});
assertType<Equals<z.infer<typeof buildingDefSchema>, BuildingDef>>(true);

export interface ResidentDef {
  id: ResidentId;
  name: string;
  species: string;
  number: number | null; // quantity shown in the shell (05 §5)
  family?: 'tens' | 'hundreds' | 'fraction' | 'clock' | 'coin';
  palette: string;
  lines: NarrationKey[];
  affinity: WorkshopId[];
  arrival: { via: 'start' | 'home' | 'ferry'; home?: BuildingId; unlock: UnlockRule };
  starterBuddy: boolean;
}

export const residentDefSchema = z.object({
  id: residentIdSchema,
  name: z.string().min(1),
  species: z.string().min(1),
  number: z.number().nullable(),
  family: z.enum(['tens', 'hundreds', 'fraction', 'clock', 'coin']).optional(),
  palette: z.string().min(1),
  lines: z.array(narrationKeySchema),
  affinity: z.array(workshopIdSchema),
  arrival: z.object({
    via: z.enum(['start', 'home', 'ferry']),
    home: buildingIdSchema.optional(),
    unlock: unlockRuleSchema,
  }),
  starterBuddy: z.boolean(),
});
assertType<Equals<z.infer<typeof residentDefSchema>, ResidentDef>>(true);

export interface GameData {
  materials: { id: MaterialId; name: NarrationKey; art: string }[];
  buildings: BuildingDef[];
  residents: ResidentDef[];
  decor: {
    id: DecorId;
    art: string;
    footprint: [number, number];
    source: 'starter' | 'project' | 'festival' | 'gift' | 'puzzle';
  }[];
  outfits: { option: string; unlock: UnlockRule }[]; // avatar options that start locked
  island: {
    grid: [12, 8];
    rings: { plots: Plot[]; unlock: UnlockRule }[];
    road: { n: number; plot: Plot }[]; // stone n → plot (n up to 1000)
    /**
     * The names a child may give the island (05 §10 step 3): `name` is what `island.named`
     * records, `say` the name as spoken and shown ("Shell Island"), `welcome` the greeting.
     */
    names?: { name: string; say: NarrationKey; welcome: NarrationKey }[];
  };
  festivals: {
    id: string;
    kind: 'festival' | 'storm-watch';
    everyDaysOfPlay: number;
    rewardDecor: DecorId[];
  }[];
}

export type MaterialDef = GameData['materials'][number];
export type DecorDef = GameData['decor'][number];
export type OutfitDef = GameData['outfits'][number];
export type IslandDef = GameData['island'];
export type FestivalDef = GameData['festivals'][number];

export const materialDefSchema = z.object({
  id: materialIdSchema,
  name: narrationKeySchema,
  art: z.string().min(1),
});
export const decorDefSchema = z.object({
  id: decorIdSchema,
  art: z.string().min(1),
  footprint: footprintSchema,
  source: z.enum(['starter', 'project', 'festival', 'gift', 'puzzle']),
});
export const outfitDefSchema = z.object({ option: z.string().min(1), unlock: unlockRuleSchema });
export const islandDefSchema = z.object({
  grid: z.tuple([z.literal(12), z.literal(8)]),
  rings: z.array(z.object({ plots: z.array(plotSchema), unlock: unlockRuleSchema })),
  road: z.array(z.object({ n: z.number().int().positive(), plot: plotSchema })),
  names: z
    .array(
      z.object({ name: z.string().min(1), say: narrationKeySchema, welcome: narrationKeySchema }),
    )
    .optional(),
});
export const festivalDefSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['festival', 'storm-watch']),
  everyDaysOfPlay: z.number().int().positive(),
  rewardDecor: z.array(decorIdSchema),
});

export const gameDataSchema = z.object({
  materials: z.array(materialDefSchema),
  buildings: z.array(buildingDefSchema),
  residents: z.array(residentDefSchema),
  decor: z.array(decorDefSchema),
  outfits: z.array(outfitDefSchema),
  island: islandDefSchema,
  festivals: z.array(festivalDefSchema),
});
assertType<Equals<z.infer<typeof gameDataSchema>, GameData>>(true);
