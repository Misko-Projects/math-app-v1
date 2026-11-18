import { z } from 'zod';
import type { PhrasePart } from './audio';
import { phrasePartSchema } from './audio';
import type { AvatarSuggestion } from './avatar';
import { avatarSuggestionSchema } from './avatar';
import type { AgeBand, Grade } from './basics';
import { ageBandSchema, gradeSchema } from './basics';
import type { AnyEventEnvelope } from './events';
import { anyEventEnvelopeSchema, inboundEventEnvelopeSchema } from './events';
import type { ChildId, DeviceId, EventId, FamilyId, MisconceptionId, SkillId } from './ids';
import {
  childIdSchema,
  deviceIdSchema,
  eventIdSchema,
  familyIdSchema,
  misconceptionIdSchema,
  skillIdSchema,
} from './ids';
import { assertType, type Equals } from './internal/type-assert';
import type { ItemFormat, NarrationKey, Tier } from './items';
import { itemFormatSchema, narrationKeySchema, tierSchema } from './items';
import type { ChildProfile } from './profiles';
import { childProfileSchema } from './profiles';
import type { SettingsDocument } from './settings';
import { settingsDocumentSchema } from './settings';

// 02 §5.7 / 08 §2 API DTOs: every request and response body. Shapes only; behaviour lives in apps/api.

const tsSchema = z.number().int().nonnegative();
const unitIntervalSchema = z.number().min(0).max(1);

// ---------- common ----------

/** Stable error codes (08 §2: `{ error: { code, message } }`, never a stack trace). */
export type ApiErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'unsupported_media_type' // mutating routes require application/json (08 §3)
  | 'payload_too_large'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'setup_closed'
  | 'invalid_credentials'
  | 'invalid_pin'
  | 'pair_code_invalid'
  | 'pair_code_expired'
  | 'device_revoked'
  | 'unknown_family'
  | 'internal';
export const API_ERROR_CODES = [
  'bad_request',
  'validation_failed',
  'unsupported_media_type',
  'payload_too_large',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'setup_closed',
  'invalid_credentials',
  'invalid_pin',
  'pair_code_invalid',
  'pair_code_expired',
  'device_revoked',
  'unknown_family',
  'internal',
] as const;
export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
assertType<Equals<z.infer<typeof apiErrorCodeSchema>, ApiErrorCode>>(true);

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}
export const apiErrorBodySchema = z.object({
  error: z.object({ code: apiErrorCodeSchema, message: z.string() }),
});
assertType<Equals<z.infer<typeof apiErrorBodySchema>, ApiErrorBody>>(true);

/** Body of routes whose only result is success. */
export interface OkResponse {
  ok: true;
}
export const okResponseSchema = z.object({ ok: z.literal(true) });
assertType<Equals<z.infer<typeof okResponseSchema>, OkResponse>>(true);

/** 32 random bytes, base64url without padding (08 §3). */
export const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const deviceTokenSchema = z.string().regex(DEVICE_TOKEN_PATTERN, 'expected a device token');
export const passphraseSchema = z.string().min(10).max(256); // 08 §3: ≥ 10 chars
export const pinSchema = z.string().regex(/^\d{4,6}$/, 'expected a 4–6 digit PIN');
export const pairCodeSchema = z.string().regex(/^\d{6}$/, 'expected a 6-digit code');
const deviceNameSchema = z.string().min(1).max(60);

// ---------- GET /health ----------

export interface HealthResponse {
  ok: boolean;
  version: string;
  contentVersion: string;
  ai: { feedback: boolean; vision: boolean; summary: boolean }; // which features have keys configured
}
export const healthResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  contentVersion: z.string(),
  ai: z.object({ feedback: z.boolean(), vision: z.boolean(), summary: z.boolean() }),
});
assertType<Equals<z.infer<typeof healthResponseSchema>, HealthResponse>>(true);

// ---------- POST /setup ----------

export interface SetupRequest {
  familyName: string;
  passphrase: string;
  pin: string;
  deviceName: string; // the first device, paired by setup
}
export const setupRequestSchema = z.object({
  familyName: z.string().min(1).max(60),
  passphrase: passphraseSchema,
  pin: pinSchema,
  deviceName: deviceNameSchema,
});
assertType<Equals<z.infer<typeof setupRequestSchema>, SetupRequest>>(true);

/** Plus the parent session cookie (Set-Cookie). */
export interface SetupResponse {
  familyId: FamilyId;
  deviceId: DeviceId;
  deviceToken: string;
}
export const setupResponseSchema = z.object({
  familyId: familyIdSchema,
  deviceId: deviceIdSchema,
  deviceToken: deviceTokenSchema,
});
assertType<Equals<z.infer<typeof setupResponseSchema>, SetupResponse>>(true);

// ---------- POST /auth/login, POST /auth/logout, POST /auth/pin ----------

export interface LoginRequest {
  passphrase: string;
}
export const loginRequestSchema = z.object({ passphrase: passphraseSchema });
assertType<Equals<z.infer<typeof loginRequestSchema>, LoginRequest>>(true);

/** A parent session (cookie set by the response). `expiresAt` in ms epoch. */
export interface ParentSessionResponse {
  expiresAt: number;
}
export const parentSessionResponseSchema = z.object({ expiresAt: tsSchema });
assertType<Equals<z.infer<typeof parentSessionResponseSchema>, ParentSessionResponse>>(true);

export interface PinRequest {
  pin: string;
}
export const pinRequestSchema = z.object({ pin: pinSchema });
assertType<Equals<z.infer<typeof pinRequestSchema>, PinRequest>>(true);

// ---------- devices ----------

export interface PairStartResponse {
  code: string; // 6 digits
  expiresAt: number; // +10 min
}
export const pairStartResponseSchema = z.object({ code: pairCodeSchema, expiresAt: tsSchema });
assertType<Equals<z.infer<typeof pairStartResponseSchema>, PairStartResponse>>(true);

export interface PairCompleteRequest {
  code: string;
  deviceName: string;
}
export const pairCompleteRequestSchema = z.object({
  code: pairCodeSchema,
  deviceName: deviceNameSchema,
});
assertType<Equals<z.infer<typeof pairCompleteRequestSchema>, PairCompleteRequest>>(true);

export interface PairCompleteResponse {
  deviceId: DeviceId;
  deviceToken: string;
  familyId: FamilyId;
}
export const pairCompleteResponseSchema = z.object({
  deviceId: deviceIdSchema,
  deviceToken: deviceTokenSchema,
  familyId: familyIdSchema,
});
assertType<Equals<z.infer<typeof pairCompleteResponseSchema>, PairCompleteResponse>>(true);

export interface DeviceInfo {
  id: DeviceId;
  name: string;
  createdAt: number;
  lastSeenAt: number | null;
  revokedAt: number | null;
}
export const deviceInfoSchema = z.object({
  id: deviceIdSchema,
  name: z.string(),
  createdAt: tsSchema,
  lastSeenAt: tsSchema.nullable(),
  revokedAt: tsSchema.nullable(),
});
assertType<Equals<z.infer<typeof deviceInfoSchema>, DeviceInfo>>(true);

export interface DevicesListResponse {
  devices: DeviceInfo[];
}
export const devicesListResponseSchema = z.object({ devices: z.array(deviceInfoSchema) });
assertType<Equals<z.infer<typeof devicesListResponseSchema>, DevicesListResponse>>(true);

export interface DeviceIdParams {
  id: DeviceId;
}
export const deviceIdParamsSchema = z.object({ id: deviceIdSchema });
assertType<Equals<z.infer<typeof deviceIdParamsSchema>, DeviceIdParams>>(true);

// ---------- POST /sync (08 §4) ----------

export const SYNC_MAX_PUSH_EVENTS = 500;
export const SYNC_MAX_PULL_EVENTS = 1000;

export interface SyncRequest {
  cursor: string | null;
  events: AnyEventEnvelope[]; // ≤ 500 per call; client loops
  settings: SettingsDocument[];
  profiles: ChildProfile[]; // with updatedAt
}
/**
 * What a correct client sends. The server parses `events` one by one (02 §5.9 S1): an event that
 * fails this schema is reported in `SyncResponse.rejected`, and the rest of the call succeeds.
 */
export const syncRequestSchema = z.object({
  cursor: z.string().min(1).nullable(),
  // 08 §4: each pushed event's payload is capped at 8 KB, measured before fields are stripped.
  events: z.array(inboundEventEnvelopeSchema).max(SYNC_MAX_PUSH_EVENTS),
  settings: z.array(settingsDocumentSchema),
  profiles: z.array(childProfileSchema),
});
assertType<Equals<z.infer<typeof syncRequestSchema>, SyncRequest>>(true);

/**
 * One pushed event the server refused (02 §5.9 S1). The server validates each pushed event on its
 * own, so one bad event never fails the whole call. A rejection is permanent: the client stops
 * re-pushing that event (it marks it as not syncable) rather than retrying it forever.
 */
export interface SyncRejection {
  id: EventId | null; // the event's id when it is a valid EventId, else null
  index: number; // position in the request's `events` array
  code: ApiErrorCode; // validation_failed | payload_too_large | unknown_family | forbidden | conflict
  message: string;
}
export const syncRejectionSchema = z.object({
  id: eventIdSchema.nullable(),
  index: z.number().int().nonnegative(),
  code: apiErrorCodeSchema,
  message: z.string(),
});
assertType<Equals<z.infer<typeof syncRejectionSchema>, SyncRejection>>(true);

export interface SyncResponse {
  accepted: EventId[]; // includes duplicates already present
  rejected: SyncRejection[]; // pushed events refused permanently (02 §5.9 S1); [] when none
  events: AnyEventEnvelope[]; // events since cursor from OTHER devices, ≤ 1000, ordered by server seq
  cursor: string; // opaque (server sequence)
  more: boolean;
  settings: SettingsDocument[]; // server LWW result
  profiles: ChildProfile[]; // server LWW result
}
export const syncResponseSchema = z.object({
  accepted: z.array(eventIdSchema),
  rejected: z.array(syncRejectionSchema).max(SYNC_MAX_PUSH_EVENTS),
  events: z.array(anyEventEnvelopeSchema).max(SYNC_MAX_PULL_EVENTS),
  cursor: z.string().min(1),
  more: z.boolean(),
  settings: z.array(settingsDocumentSchema),
  profiles: z.array(childProfileSchema),
});
assertType<Equals<z.infer<typeof syncResponseSchema>, SyncResponse>>(true);

// ---------- POST /ai/feedback (07 §2) ----------

/** Built by the TaskRunner from whitelisted fields only: no names, ids or birth dates (07 §8). */
export interface AiFeedbackRequest {
  ageBand: AgeBand;
  grade: Grade;
  skill: { id: SkillId; name: string };
  item: {
    format: ItemFormat;
    tier: Tier;
    promptText: string;
    params: Record<string, number | string | boolean>;
  };
  correctAnswer: string;
  childResponse: string;
  attemptNo: number;
  matchedMisconceptions: MisconceptionId[];
  misconceptionLibrary: { id: MisconceptionId; description: string }[];
  recentPattern: { sameSkillWrongInRow: number };
  phraseBank: NarrationKey[];
}
export const aiFeedbackRequestSchema = z.object({
  ageBand: ageBandSchema,
  grade: gradeSchema,
  skill: z.object({ id: skillIdSchema, name: z.string().min(1).max(120) }),
  item: z.object({
    format: itemFormatSchema,
    tier: tierSchema,
    promptText: z.string().max(500),
    params: z
      .record(z.string(), z.union([z.number(), z.string().max(200), z.boolean()]))
      .refine((p) => Object.keys(p).length <= 32, { message: 'at most 32 params' }),
  }),
  correctAnswer: z.string().max(200),
  childResponse: z.string().max(200),
  attemptNo: z.number().int().positive(),
  matchedMisconceptions: z.array(misconceptionIdSchema).max(16),
  misconceptionLibrary: z
    .array(z.object({ id: misconceptionIdSchema, description: z.string().max(300) }))
    .max(32),
  recentPattern: z.object({ sameSkillWrongInRow: z.number().int().nonnegative() }),
  phraseBank: z.array(narrationKeySchema).max(300),
});
assertType<Equals<z.infer<typeof aiFeedbackRequestSchema>, AiFeedbackRequest>>(true);

/**
 * The validated model output (07 §2 "Output schema"). Flat with every key present so it maps to
 * provider structured outputs; the field matching `mode` carries the line.
 */
export interface AiFeedbackOutput {
  mode: 'phrases' | 'text';
  phrases: PhrasePart[];
  text: string;
  likelyMisconception: MisconceptionId | null;
  confidence: number;
  revealsAnswer: boolean;
}
export const aiFeedbackOutputSchema = z.object({
  mode: z.enum(['phrases', 'text']),
  phrases: z.array(phrasePartSchema),
  text: z.string(),
  likelyMisconception: misconceptionIdSchema.nullable(),
  confidence: unitIntervalSchema,
  revealsAnswer: z.boolean(),
});
assertType<Equals<z.infer<typeof aiFeedbackOutputSchema>, AiFeedbackOutput>>(true);

/** `null` = use the deterministic line (flag off, no key, budget, guard rejection, failure; 07 §1). */
export interface AiFeedbackResponse {
  feedback: AiFeedbackOutput | null;
}
export const aiFeedbackResponseSchema = z.object({
  feedback: aiFeedbackOutputSchema.nullable(),
});
assertType<Equals<z.infer<typeof aiFeedbackResponseSchema>, AiFeedbackResponse>>(true);

// ---------- POST /ai/avatar-from-photo (07 §4) ----------

/** 07 §4: ≤ 2 MB body. Base64 keeps the route JSON-only, as 08 §3 CSRF rules require. */
export const AVATAR_PHOTO_MAX_BASE64_CHARS = 2_000_000;

export interface AvatarFromPhotoRequest {
  photo: { mediaType: 'image/jpeg'; data: string }; // base64 JPEG, ≤ 768 px, EXIF stripped by the client
}
export const avatarFromPhotoRequestSchema = z.object({
  photo: z.object({
    mediaType: z.literal('image/jpeg'),
    data: z.base64().max(AVATAR_PHOTO_MAX_BASE64_CHARS),
  }),
});
assertType<Equals<z.infer<typeof avatarFromPhotoRequestSchema>, AvatarFromPhotoRequest>>(true);

/** `null` = no suggestion; the parent uses the manual creator. */
export interface AvatarFromPhotoResponse {
  suggestion: AvatarSuggestion | null;
}
export const avatarFromPhotoResponseSchema = z.object({
  suggestion: avatarSuggestionSchema.nullable(),
});
assertType<Equals<z.infer<typeof avatarFromPhotoResponseSchema>, AvatarFromPhotoResponse>>(true);

// ---------- POST /ai/parent-summary (07 §5) ----------

const skillRefSchema = z.object({ id: skillIdSchema, name: z.string().min(1).max(120) });

/** Aggregated stats only; the child is "your child" (no name or id). */
export interface ParentSummaryRequest {
  ageBand: AgeBand;
  grade: Grade;
  weekStart: string; // ISO date, Monday, family tz
  skillsMastered: { id: SkillId; name: string }[];
  skillsInProgress: { id: SkillId; name: string }[];
  upcomingSkills: { id: SkillId; name: string }[];
  misconceptions: { id: MisconceptionId; description: string; count: number }[];
  minutes: number;
  accuracyBand: 'low' | 'medium' | 'high';
  mathDensity: number; // 0..1 share of session time spent on math (05 §8)
}
export const parentSummaryRequestSchema = z.object({
  ageBand: ageBandSchema,
  grade: gradeSchema,
  weekStart: z.iso.date(),
  skillsMastered: z.array(skillRefSchema).max(100),
  skillsInProgress: z.array(skillRefSchema).max(100),
  upcomingSkills: z.array(skillRefSchema).max(100),
  misconceptions: z
    .array(
      z.object({
        id: misconceptionIdSchema,
        description: z.string().max(300),
        count: z.number().int().positive(),
      }),
    )
    .max(32),
  minutes: z.number().nonnegative(),
  accuracyBand: z.enum(['low', 'medium', 'high']),
  mathDensity: unitIntervalSchema,
});
assertType<Equals<z.infer<typeof parentSummaryRequestSchema>, ParentSummaryRequest>>(true);

/** 07 §5 output (also produced by the deterministic template without AI). */
export interface ParentSummary {
  headline: string;
  highlights: [string, string, string];
  watchFor: string[]; // ≤ 2
  tryAtHome: [string, string]; // short offline activities tied to current skills
}
export const parentSummarySchema = z.object({
  headline: z.string().min(1),
  highlights: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  watchFor: z.array(z.string().min(1)).max(2),
  tryAtHome: z.tuple([z.string().min(1), z.string().min(1)]),
});
assertType<Equals<z.infer<typeof parentSummarySchema>, ParentSummary>>(true);

/** `null` = the client renders the deterministic template from the same stats. */
export interface ParentSummaryResponse {
  summary: ParentSummary | null;
}
export const parentSummaryResponseSchema = z.object({ summary: parentSummarySchema.nullable() });
assertType<Equals<z.infer<typeof parentSummaryResponseSchema>, ParentSummaryResponse>>(true);

// ---------- GET /export, POST /import (02 §4.4: events + settings + profiles) ----------

export const BACKUP_FORMAT = 'number-island-backup';

export interface BackupFile {
  format: 'number-island-backup';
  formatVersion: 1;
  exportedAt: number;
  familyId: FamilyId;
  events: AnyEventEnvelope[];
  settings: SettingsDocument[];
  profiles: ChildProfile[];
}
export const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(1),
  exportedAt: tsSchema,
  familyId: familyIdSchema,
  events: z.array(inboundEventEnvelopeSchema), // POST /import is inbound too: same 8 KB cap
  settings: z.array(settingsDocumentSchema),
  profiles: z.array(childProfileSchema),
});
assertType<Equals<z.infer<typeof backupFileSchema>, BackupFile>>(true);

export interface ImportResponse {
  imported: { events: number; settings: number; profiles: number };
}
export const importResponseSchema = z.object({
  imported: z.object({
    events: z.number().int().nonnegative(),
    settings: z.number().int().nonnegative(),
    profiles: z.number().int().nonnegative(),
  }),
});
assertType<Equals<z.infer<typeof importResponseSchema>, ImportResponse>>(true);

// ---------- DELETE /children/:id ----------

export interface ChildIdParams {
  id: ChildId;
}
export const childIdParamsSchema = z.object({ id: childIdSchema });
assertType<Equals<z.infer<typeof childIdParamsSchema>, ChildIdParams>>(true);

// ---------- route table (08 §2; contract tests, 08 §9) ----------

export type ApiMethod = 'GET' | 'POST' | 'DELETE';
/** 08 §2 auth column: `setup` = none, only while no family exists; `pair-code` = none + code. */
export type ApiAuth = 'none' | 'setup' | 'pair-code' | 'parent' | 'device';

export interface ApiRouteDef {
  method: ApiMethod;
  path: `/api/${string}`; // Hono path syntax (`:id`)
  auth: ApiAuth;
  params?: z.ZodType;
  request?: z.ZodType;
  response: z.ZodType;
}

export const apiRoutes = {
  health: { method: 'GET', path: '/api/health', auth: 'none', response: healthResponseSchema },
  setup: {
    method: 'POST',
    path: '/api/setup',
    auth: 'setup',
    request: setupRequestSchema,
    response: setupResponseSchema,
  },
  login: {
    method: 'POST',
    path: '/api/auth/login',
    auth: 'none',
    request: loginRequestSchema,
    response: parentSessionResponseSchema,
  },
  logout: { method: 'POST', path: '/api/auth/logout', auth: 'parent', response: okResponseSchema },
  pin: {
    method: 'POST',
    path: '/api/auth/pin',
    auth: 'device',
    request: pinRequestSchema,
    response: parentSessionResponseSchema,
  },
  pairStart: {
    method: 'POST',
    path: '/api/devices/pair/start',
    auth: 'parent',
    response: pairStartResponseSchema,
  },
  pairComplete: {
    method: 'POST',
    path: '/api/devices/pair/complete',
    auth: 'pair-code',
    request: pairCompleteRequestSchema,
    response: pairCompleteResponseSchema,
  },
  listDevices: {
    method: 'GET',
    path: '/api/devices',
    auth: 'parent',
    response: devicesListResponseSchema,
  },
  revokeDevice: {
    method: 'DELETE',
    path: '/api/devices/:id',
    auth: 'parent',
    params: deviceIdParamsSchema,
    response: okResponseSchema,
  },
  sync: {
    method: 'POST',
    path: '/api/sync',
    auth: 'device',
    request: syncRequestSchema,
    response: syncResponseSchema,
  },
  aiFeedback: {
    method: 'POST',
    path: '/api/ai/feedback',
    auth: 'device',
    request: aiFeedbackRequestSchema,
    response: aiFeedbackResponseSchema,
  },
  aiAvatarFromPhoto: {
    method: 'POST',
    path: '/api/ai/avatar-from-photo',
    auth: 'parent',
    request: avatarFromPhotoRequestSchema,
    response: avatarFromPhotoResponseSchema,
  },
  aiParentSummary: {
    method: 'POST',
    path: '/api/ai/parent-summary',
    auth: 'parent',
    request: parentSummaryRequestSchema,
    response: parentSummaryResponseSchema,
  },
  exportBackup: { method: 'GET', path: '/api/export', auth: 'parent', response: backupFileSchema },
  importBackup: {
    method: 'POST',
    path: '/api/import',
    auth: 'parent',
    request: backupFileSchema,
    response: importResponseSchema,
  },
  deleteChild: {
    method: 'DELETE',
    path: '/api/children/:id',
    auth: 'parent',
    params: childIdParamsSchema,
    response: okResponseSchema,
  },
} as const satisfies Record<string, ApiRouteDef>;

export type ApiRouteName = keyof typeof apiRoutes;
