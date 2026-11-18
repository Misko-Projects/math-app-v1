import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { assertType, type Equals } from './internal/type-assert';

// 02 §4.1. Ids are plain strings at the type level (no brands) so fixtures and YAML stay ergonomic;
// the Zod schemas enforce their grammar at every trust boundary (content compiler, API, Dexie import).

export const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SKILL_ID_PATTERN = /^[A-Z]{2,4}\.\d{2}$/;
export const TEMPLATE_ID_PATTERN = /^[A-Z]{2,4}\.\d{2}\.t\d+$/;
export const MISCONCEPTION_ID_PATTERN = /^MC\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type EventId = string;
export type ChildId = string;
export type DeviceId = string;
export type FamilyId = string;
/** `^[A-Z]{2,4}\.\d{2}$`, e.g. `CPS.03`. Never reused. */
export type SkillId = string;
/** `${SkillId}.t${n}`, e.g. `CPS.03.t2`. */
export type TemplateId = string;
/** `MC.kebab-case`. */
export type MisconceptionId = string;
export type WorkshopId = string;
export type MaterialId = string;
export type BuildingId = string;
export type ResidentId = string;
export type DecorId = string;

export const uuidV7Schema = z.string().regex(UUID_V7_PATTERN, 'expected a UUIDv7');
export const eventIdSchema = uuidV7Schema;
export const childIdSchema = uuidV7Schema;
export const deviceIdSchema = uuidV7Schema;
export const familyIdSchema = uuidV7Schema;
export const skillIdSchema = z.string().regex(SKILL_ID_PATTERN, 'expected a SkillId like CPS.03');
export const templateIdSchema = z
  .string()
  .regex(TEMPLATE_ID_PATTERN, 'expected a TemplateId like CPS.03.t2');
export const misconceptionIdSchema = z
  .string()
  .regex(MISCONCEPTION_ID_PATTERN, 'expected a MisconceptionId like MC.count-all');
const kebabIdSchema = z.string().regex(KEBAB_ID_PATTERN, 'expected a kebab-case id');
export const workshopIdSchema = kebabIdSchema;
export const materialIdSchema = kebabIdSchema;
export const buildingIdSchema = kebabIdSchema;
export const residentIdSchema = kebabIdSchema;
export const decorIdSchema = kebabIdSchema;

assertType<Equals<z.infer<typeof eventIdSchema>, EventId>>(true);
assertType<Equals<z.infer<typeof skillIdSchema>, SkillId>>(true);

/** A new time-ordered UUIDv7 for events, children, devices and families. */
export function newId(): string {
  return uuidv7();
}
