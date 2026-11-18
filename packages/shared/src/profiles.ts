import { z } from 'zod';
import type { AvatarSpec } from './avatar';
import { avatarSpecSchema } from './avatar';
import type { AgeBand, Grade } from './basics';
import { ageBandSchema, gradeSchema } from './basics';
import type { ChildId, FamilyId } from './ids';
import { childIdSchema, familyIdSchema } from './ids';
import { assertType, type Equals } from './internal/type-assert';
import type { ChildSettings } from './settings';
import { childSettingsSchema } from './settings';

// 02 §5.8 children and profiles.

export interface ChildProfile {
  id: ChildId;
  familyId: FamilyId;
  name: string; // first name or nickname; never sent to AI providers
  birthYear: number;
  grade: Grade;
  advanced: boolean; // "working above grade": shifts placement priors (04 §5)
  avatar: AvatarSpec;
  picturePasswordHash: string | null; // salted local hash (08 §3)
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

const msEpochSchema = z.number().int().nonnegative();

export const childProfileSchema = z.object({
  id: childIdSchema,
  familyId: familyIdSchema,
  name: z.string().min(1),
  birthYear: z.number().int().min(1900).max(9999),
  grade: gradeSchema,
  advanced: z.boolean(),
  avatar: avatarSpecSchema,
  picturePasswordHash: z.string().min(1).nullable(),
  createdAt: msEpochSchema,
  updatedAt: msEpochSchema,
  deletedAt: msEpochSchema.optional(),
});
assertType<Equals<z.infer<typeof childProfileSchema>, ChildProfile>>(true);

/** What pure engine functions need about a child. */
export interface ChildContext {
  childId: ChildId;
  grade: Grade;
  ageBand: AgeBand;
  advanced: boolean;
  isK: boolean; // grade === 'K' → K columns of 04 tables
  settings: ChildSettings;
}

export const childContextSchema = z
  .object({
    childId: childIdSchema,
    grade: gradeSchema,
    ageBand: ageBandSchema,
    advanced: z.boolean(),
    isK: z.boolean(),
    settings: childSettingsSchema,
  })
  .refine((c) => c.isK === (c.grade === 'K'), {
    message: "isK must equal grade === 'K'",
    path: ['isK'],
  });
assertType<Equals<z.infer<typeof childContextSchema>, ChildContext>>(true);
