import { z } from 'zod';
import type { MaterialId } from './ids';
import { materialIdSchema } from './ids';
import { assertType, type Equals } from './internal/type-assert';

// 02 §5.8 basics.

export type Grade = 'K' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | 'HS';
/** All grades, lowest first (so array index order is grade order, e.g. for `minGrade` rules). */
export const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', 'HS'] as const;
export const gradeSchema = z.enum(GRADES);
assertType<Equals<z.infer<typeof gradeSchema>, Grade>>(true);

export type AgeBand = '5-6' | '7-8' | '9-10' | '11-12' | '13-14';
export const AGE_BANDS = ['5-6', '7-8', '9-10', '11-12', '13-14'] as const;
export const ageBandSchema = z.enum(AGE_BANDS);
assertType<Equals<z.infer<typeof ageBandSchema>, AgeBand>>(true);

/** Material → count. */
export type Recipe = Partial<Record<MaterialId, number>>;
export const recipeSchema = z.partialRecord(materialIdSchema, z.number().int().nonnegative());
assertType<Equals<z.infer<typeof recipeSchema>, Recipe>>(true);

/** Island grid cell (12 × 8 in v1). */
export type Plot = [x: number, y: number];
export const plotSchema = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);
assertType<Equals<z.infer<typeof plotSchema>, Plot>>(true);

/** 03 §6.2. */
export type LessonPhase = 'intro' | 'worked' | 'faded' | 'scaffolded' | 'outro';
export const LESSON_PHASES = ['intro', 'worked', 'faded', 'scaffolded', 'outro'] as const;
export const lessonPhaseSchema = z.enum(LESSON_PHASES);
assertType<Equals<z.infer<typeof lessonPhaseSchema>, LessonPhase>>(true);
