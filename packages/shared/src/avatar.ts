import { z } from 'zod';
import type { ResidentId } from './ids';
import { residentIdSchema } from './ids';
import { assertType, type Equals } from './internal/type-assert';

// 02 §5.8 avatar (05 §9, 07 §4).

/** `s01`..`s12` (05 §9: 12 skin tones). */
export const SKIN_TONE_PATTERN = /^s(?:0[1-9]|1[0-2])$/;

export interface AvatarSpec {
  skinTone: `s${string}`; // 's01'..'s12'
  faceShape: string;
  hairStyle: string;
  hairColor: string; // option ids from shared/avatar/options.ts
  eyeShape: string;
  eyeColor: string;
  eyebrows: string;
  glasses: string | null;
  freckles: boolean;
  beautyMark: boolean;
  top: string;
  topColor: string;
  bottom: string;
  bottomColor: string;
  shoes: string;
  shoesColor: string;
  hat: string | null;
  accessory: string | null; // unlockable
  buddy: ResidentId; // starter Pebbling
}

// The template literal keeps the `s${string}` type; the refinement narrows it to s01..s12.
export const skinToneSchema = z
  .templateLiteral(['s', z.string()])
  .refine((v) => SKIN_TONE_PATTERN.test(v), { message: 'expected a skin tone s01..s12' });

const optionIdSchema = z.string().min(1);

export const avatarSpecSchema = z.object({
  skinTone: skinToneSchema,
  faceShape: optionIdSchema,
  hairStyle: optionIdSchema,
  hairColor: optionIdSchema,
  eyeShape: optionIdSchema,
  eyeColor: optionIdSchema,
  eyebrows: optionIdSchema,
  glasses: optionIdSchema.nullable(),
  freckles: z.boolean(),
  beautyMark: z.boolean(),
  top: optionIdSchema,
  topColor: optionIdSchema,
  bottom: optionIdSchema,
  bottomColor: optionIdSchema,
  shoes: optionIdSchema,
  shoesColor: optionIdSchema,
  hat: optionIdSchema.nullable(),
  accessory: optionIdSchema.nullable(),
  buddy: residentIdSchema,
});
assertType<Equals<z.infer<typeof avatarSpecSchema>, AvatarSpec>>(true);

/** 07 §4 output: creator option ids only, never free text or sensitive inferences. */
export type AvatarSuggestion = Pick<
  AvatarSpec,
  'skinTone' | 'hairStyle' | 'hairColor' | 'eyeColor' | 'eyebrows' | 'glasses' | 'freckles'
>;
export const avatarSuggestionSchema = avatarSpecSchema.pick({
  skinTone: true,
  hairStyle: true,
  hairColor: true,
  eyeColor: true,
  eyebrows: true,
  glasses: true,
  freckles: true,
});
assertType<Equals<z.infer<typeof avatarSuggestionSchema>, AvatarSuggestion>>(true);
