import { z } from 'zod';
import type { Grade } from './basics';
import type { ChildId } from './ids';
import { UUID_V7_PATTERN } from './ids';
import { assertType, type Equals } from './internal/type-assert';

// 02 §5.8 settings; documents are LWW per whole document by updatedAt (02 §4.4, 08 §4).

export interface FamilySettings {
  'ai.feedback': boolean;
  'ai.feedbackMode': 'phrases' | 'text';
  'ai.avatarPhoto': boolean;
  'ai.parentSummary': boolean; // all AI flags default false (07 §8.6)
  music: boolean;
  volumes: { voice: number; sfx: number; music: number }; // 0..1
  voiceRate: number; // 0.8..1.2, applies to Web Speech + playbackRate
  freeBuildAfterSession: boolean; // 05 §8
  timezone: string; // IANA, for weekly goals and quiet hours
}

export interface ChildSettings {
  sessionMinutes: number; // 5..30; default K 10, G1–2 15, G3 20 (04 §6.1)
  dailyCapMinutes: number | null;
  quietHours: { start: string; end: string } | null; // "HH:MM" local
  timedChallenges: boolean; // ignored (always off) when isK
  captions: boolean; // default: K false, G1+ true
  tapOnly: boolean;
  snapRadiusPx: number; // 06 §7 motor settings (default false, 48)
  speakOnTap: boolean; // tapping numbers/coins speaks names (default true)
  weeklyGoal: number; // requests per week (default K 5, G1+ 6)
}

const unitIntervalSchema = z.number().min(0).max(1);

/** True when `tz` is an IANA zone the runtime's Intl knows (Node, browsers and workerd all ship ICU). */
export function isValidTimeZone(tz: string): boolean {
  if (tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const familySettingsSchema = z.object({
  'ai.feedback': z.boolean(),
  'ai.feedbackMode': z.enum(['phrases', 'text']),
  'ai.avatarPhoto': z.boolean(),
  'ai.parentSummary': z.boolean(),
  music: z.boolean(),
  volumes: z.object({
    voice: unitIntervalSchema,
    sfx: unitIntervalSchema,
    music: unitIntervalSchema,
  }),
  voiceRate: z.number().min(0.8).max(1.2),
  freeBuildAfterSession: z.boolean(),
  timezone: z.string().refine(isValidTimeZone, { message: 'expected an IANA time zone' }),
});
assertType<Equals<z.infer<typeof familySettingsSchema>, FamilySettings>>(true);

export const HH_MM_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const hhmmSchema = z.string().regex(HH_MM_PATTERN, 'expected "HH:MM" (24 h)');

export const childSettingsSchema = z.object({
  sessionMinutes: z.number().int().min(5).max(30),
  dailyCapMinutes: z.number().int().min(1).max(1440).nullable(),
  quietHours: z.object({ start: hhmmSchema, end: hhmmSchema }).nullable(),
  timedChallenges: z.boolean(),
  captions: z.boolean(),
  tapOnly: z.boolean(),
  snapRadiusPx: z.number().positive(),
  speakOnTap: z.boolean(),
  weeklyGoal: z.number().int().min(1),
});
assertType<Equals<z.infer<typeof childSettingsSchema>, ChildSettings>>(true);

/** Value schema per settings-document kind. */
export const settingsSchemas = {
  family: familySettingsSchema,
  child: childSettingsSchema,
} as const;

// ---------- settings documents (02 §4.4, 08 §4) ----------

export type ChildSettingsKey = `child:${ChildId}`;
export type SettingsKey = 'family' | ChildSettingsKey;

const CHILD_SETTINGS_KEY_PATTERN = new RegExp(
  `^child:${UUID_V7_PATTERN.source.slice(1, -1)}$`,
  'i',
);

// z.custom keeps the template literal type; the predicate enforces `child:<uuidv7>`.
export const childSettingsKeySchema = z.custom<ChildSettingsKey>(
  (v) => typeof v === 'string' && CHILD_SETTINGS_KEY_PATTERN.test(v),
  { message: 'expected a settings key "child:<uuidv7>"' },
);
export const settingsKeySchema = z.union([z.literal('family'), childSettingsKeySchema]);
assertType<Equals<z.infer<typeof settingsKeySchema>, SettingsKey>>(true);

/** `"family"` with no argument (or null), `"child:<childId>"` otherwise. */
export function settingsKey(): 'family';
export function settingsKey(childId: ChildId): ChildSettingsKey;
export function settingsKey(childId?: ChildId | null): SettingsKey;
export function settingsKey(childId?: ChildId | null): SettingsKey {
  return childId == null ? 'family' : `child:${childId}`;
}

/** Inverse of `settingsKey()`; null when the string is not a valid settings key. */
export function parseSettingsKey(
  key: string,
): { kind: 'family' } | { kind: 'child'; childId: ChildId } | null {
  if (key === 'family') return { kind: 'family' };
  if (CHILD_SETTINGS_KEY_PATTERN.test(key)) return { kind: 'child', childId: key.slice(6) };
  return null;
}

/** One stored/synced settings document; the whole `value` is the LWW unit. */
export type SettingsDocument =
  | { key: 'family'; value: FamilySettings; updatedAt: number }
  | { key: ChildSettingsKey; value: ChildSettings; updatedAt: number };

const updatedAtSchema = z.number().int().nonnegative();
export const settingsDocumentSchema = z.union([
  z.object({ key: z.literal('family'), value: familySettingsSchema, updatedAt: updatedAtSchema }),
  z.object({ key: childSettingsKeySchema, value: childSettingsSchema, updatedAt: updatedAtSchema }),
]);
assertType<Equals<z.infer<typeof settingsDocumentSchema>, SettingsDocument>>(true);

// ---------- defaults ----------

/** A partial family document: any field may be missing, and `volumes` may itself be partial. */
export type FamilySettingsInput = Partial<Omit<FamilySettings, 'volumes'>> & {
  volumes?: Partial<FamilySettings['volumes']>;
};
export type ChildSettingsInput = Partial<ChildSettings>;

export const DEFAULT_TIMEZONE = 'UTC';

/**
 * Family defaults. AI flags off and `ai.feedbackMode` 'phrases' (07 §2, §8.6). Spec-less choices:
 * music on (05 §12: music is a feature, ducked under narration and off during lessons at runtime),
 * volumes voice 1 / sfx 0.8 / music 0.5, voiceRate 1, freeBuildAfterSession false (05 §8: the
 * parent *may* allow it), timezone from the caller (the device's zone at setup) or 'UTC'.
 */
export function defaultFamilySettings(timezone: string = DEFAULT_TIMEZONE): FamilySettings {
  return {
    'ai.feedback': false,
    'ai.feedbackMode': 'phrases',
    'ai.avatarPhoto': false,
    'ai.parentSummary': false,
    music: true,
    volumes: { voice: 1, sfx: 0.8, music: 0.5 },
    voiceRate: 1,
    freeBuildAfterSession: false,
    timezone,
  };
}

/**
 * Child defaults by grade (02 §5.8, 04 §6.1, 06 §7). Grades above 3 reuse the G3 values
 * (the spec states K–3 only).
 */
export function defaultChildSettings(grade: Grade): ChildSettings {
  const isK = grade === 'K';
  return {
    sessionMinutes: isK ? 10 : grade === '1' || grade === '2' ? 15 : 20,
    dailyCapMinutes: null,
    quietHours: null,
    timedChallenges: false,
    captions: !isK,
    tapOnly: false,
    snapRadiusPx: 48,
    speakOnTap: true,
    weeklyGoal: isK ? 5 : 6,
  };
}

/** Copies only the keys whose value is not `undefined` (explicit `null` is a real value). */
function definedEntries<T extends object>(value: T | null | undefined): Partial<T> {
  if (value == null) return {};
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Fills defaults for a partial settings document (pure; does not validate).
 * - `withSettingDefaults({ kind: 'family', value, timezone? })` → FamilySettings
 * - `withSettingDefaults({ kind: 'child', value, grade })` → ChildSettings
 * Keys that are missing or `undefined` take the default; a full document is returned unchanged.
 */
export function withSettingDefaults(input: {
  kind: 'family';
  value?: FamilySettingsInput | null;
  timezone?: string;
}): FamilySettings;
export function withSettingDefaults(input: {
  kind: 'child';
  value?: ChildSettingsInput | null;
  grade: Grade;
}): ChildSettings;
export function withSettingDefaults(
  input:
    | { kind: 'family'; value?: FamilySettingsInput | null; timezone?: string }
    | { kind: 'child'; value?: ChildSettingsInput | null; grade: Grade },
): FamilySettings | ChildSettings {
  if (input.kind === 'child') {
    return { ...defaultChildSettings(input.grade), ...definedEntries(input.value) };
  }
  const defaults = defaultFamilySettings(input.timezone);
  const { volumes, ...rest } = definedEntries(input.value);
  return {
    ...defaults,
    ...rest,
    volumes: { ...defaults.volumes, ...definedEntries(volumes) },
  };
}
