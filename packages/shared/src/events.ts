import { z } from 'zod';
import type { AvatarSpec } from './avatar';
import { avatarSpecSchema } from './avatar';
import type { LessonPhase, Plot, Recipe } from './basics';
import { lessonPhaseSchema, plotSchema, recipeSchema } from './basics';
import type { UnlockRule } from './gamedata';
import { unlockRuleSchema } from './gamedata';
import type {
  BuildingId,
  ChildId,
  DecorId,
  DeviceId,
  EventId,
  FamilyId,
  MisconceptionId,
  ResidentId,
  SkillId,
  TemplateId,
  WorkshopId,
} from './ids';
import {
  buildingIdSchema,
  childIdSchema,
  decorIdSchema,
  deviceIdSchema,
  eventIdSchema,
  familyIdSchema,
  misconceptionIdSchema,
  residentIdSchema,
  skillIdSchema,
  templateIdSchema,
  workshopIdSchema,
} from './ids';
import { assertType, type Equals, type MutuallyAssignable } from './internal/type-assert';
import type { ItemFormat, Representation, ResponseValue } from './items';
import {
  itemFormatSchema,
  paramValuesSchema,
  representationSchema,
  responseValueSchema,
  tierSchema,
} from './items';
import type { StrandId } from './strands';
import { strandIdSchema } from './strands';

// 02 §4.2 event envelope and §5.8 event payloads.

export type EventType =
  | 'session.started'
  | 'session.ended'
  | 'attempt' // one response to one item (see AttemptPayload)
  | 'hint.used'
  | 'lesson.step' // worked/faded example progress
  | 'placement.probe' // placement answers (also emit 'attempt')
  | 'placement.completed' // initial or per-strand placement finished (posterior persisted)
  | 'skill.override' // parent marks mastered / reset (audited)
  | 'request.accepted'
  | 'request.completed'
  | 'material.produced'
  | 'material.spent'
  | 'building.placed'
  | 'building.upgraded'
  | 'decor.placed'
  | 'decor.moved'
  | 'decor.removed'
  | 'island.named'
  | 'road.extended'
  | 'resident.arrived'
  | 'collection.unlocked'
  | 'festival.started'
  | 'festival.completed'
  | 'gift.left'
  | 'gift.opened'
  | 'milestone.defined'
  | 'milestone.reached'
  | 'goal.progress'
  | 'avatar.updated'
  | 'ai.feedback.shown' // the AI line text itself stays in the local aiLog
  | 'child.deleted'; // tombstone (08 §4)

/** Every EventType, in spec order. */
export const EVENT_TYPES = [
  'session.started',
  'session.ended',
  'attempt',
  'hint.used',
  'lesson.step',
  'placement.probe',
  'placement.completed',
  'skill.override',
  'request.accepted',
  'request.completed',
  'material.produced',
  'material.spent',
  'building.placed',
  'building.upgraded',
  'decor.placed',
  'decor.moved',
  'decor.removed',
  'island.named',
  'road.extended',
  'resident.arrived',
  'collection.unlocked',
  'festival.started',
  'festival.completed',
  'gift.left',
  'gift.opened',
  'milestone.defined',
  'milestone.reached',
  'goal.progress',
  'avatar.updated',
  'ai.feedback.shown',
  'child.deleted',
] as const;
export const eventTypeSchema = z.enum(EVENT_TYPES);
assertType<Equals<z.infer<typeof eventTypeSchema>, EventType>>(true);

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set(EVENT_TYPES);
export function isKnownEventType(type: string): type is EventType {
  return KNOWN_EVENT_TYPES.has(type);
}

/** Server-side cap per event payload (08 §4); not enforced by the schemas. */
export const MAX_EVENT_PAYLOAD_BYTES = 8192;

// ---------- attempt ----------

export type AttemptContext = AttemptPayload['context'];
export const ATTEMPT_CONTEXTS = [
  'lesson',
  'practice',
  'review',
  'warmup',
  'placement',
  'challenge',
  'transfer-probe',
] as const;
export const attemptContextSchema = z.enum(ATTEMPT_CONTEXTS);
assertType<Equals<z.infer<typeof attemptContextSchema>, AttemptContext>>(true);

export interface AttemptPayload {
  sessionId: string;
  skillId: SkillId;
  templateId: TemplateId;
  seed: number;
  params: Record<string, number | string | boolean>;
  format: ItemFormat;
  tier: 'concrete' | 'pictorial' | 'abstract';
  representation: Representation; // template's representation (explicit or the format default); 04 §3 counts these
  response: ResponseValue; // see §5.2
  correct: boolean;
  partialCredit: number; // 0..1, written by the TaskRunner: 1 correct, 0.5 correct with hints, 0 wrong
  latencyMs: number; // from item ready (prompt narration finished) to submit (same definition as 03 §3.1)
  hintsUsed: number;
  attemptNo: number; // 1 = first try on this item
  misconceptionIds: MisconceptionId[]; // checkResponse matches ∪ detectProcessMisconceptions
  context:
    | 'lesson'
    | 'practice'
    | 'review'
    | 'warmup'
    | 'placement'
    | 'challenge'
    | 'transfer-probe';
  workshopId: WorkshopId | null;
}

const idStringSchema = z.string().min(1); // opaque ids typed `string` in §5.8 (sessionId, requestId…)
const seedSchema = z.number().int();
const countSchema = z.number().int().nonnegative();
const msSchema = z.number().nonnegative();
const unitIntervalSchema = z.number().min(0).max(1);

export const attemptPayloadSchema = z.object({
  sessionId: idStringSchema,
  skillId: skillIdSchema,
  templateId: templateIdSchema,
  seed: seedSchema,
  params: paramValuesSchema,
  format: itemFormatSchema,
  tier: tierSchema,
  representation: representationSchema,
  response: responseValueSchema,
  correct: z.boolean(),
  partialCredit: unitIntervalSchema,
  latencyMs: msSchema,
  hintsUsed: countSchema,
  attemptNo: z.number().int().positive(),
  misconceptionIds: z.array(misconceptionIdSchema),
  context: attemptContextSchema,
  workshopId: workshopIdSchema.nullable(),
});
assertType<Equals<z.infer<typeof attemptPayloadSchema>, AttemptPayload>>(true);

// ---------- payloads ----------

export interface EventPayloads {
  'session.started': { sessionId: string; budgetMinutes: number; trigger: 'child' | 'parent' };
  'session.ended': {
    sessionId: string;
    reason: 'wind-down' | 'child-exit' | 'abandoned' | 'daily-cap' | 'quiet-hours';
    activeMs: number;
    mathMs: number;
    items: number;
  };
  attempt: AttemptPayload;
  'hint.used': {
    sessionId: string;
    skillId: SkillId;
    templateId: TemplateId;
    seed: number;
    level: 1 | 2 | 3 | 4 | 5; // the HintStep.level used (03 §5.8; 5 = show-me, 02 §5.9 E2)
  };
  'lesson.step': {
    sessionId: string;
    skillId: SkillId;
    templateId: TemplateId;
    phase: LessonPhase;
    example: number;
    step: number;
    actor: 'demo' | 'child';
    outcome: 'done' | 'demo-corrected' | 'skipped';
  };
  'placement.probe': {
    placementId: string;
    strand: StrandId | null;
    skillId: SkillId;
    templateId: TemplateId;
    seed: number;
    correct: boolean;
    skipped: boolean;
    latencyMs: number;
    posterior: number;
  };
  'placement.completed': {
    placementId: string;
    strand: StrandId | null /* null = initial */;
    posterior: Record<SkillId, number>;
    assumed: SkillId[];
    items: number;
    reason: 'converged' | 'budget' | 'frustration';
  };
  'skill.override': { skillId: SkillId; to: 'mastered' | 'reset' };
  'request.accepted': {
    sessionId: string;
    requestId: string;
    residentId: ResidentId;
    workshopId: WorkshopId;
    taskCount: number;
  };
  'request.completed': {
    sessionId: string;
    requestId: string;
    workshopId: WorkshopId;
    items: number;
    firstTryCorrect: number;
    endedEarly: boolean;
  };
  'material.produced': {
    sessionId: string | null;
    requestId: string | null;
    workshopId: WorkshopId | null;
    materials: Recipe;
  };
  'material.spent': {
    materials: Recipe;
    purpose: { kind: 'build' | 'upgrade' | 'project' | 'decor'; ref: string };
  };
  'building.placed': { instanceId: string; buildingId: BuildingId; plot: Plot };
  'building.upgraded': { instanceId: string; level: 2 | 3 };
  'decor.placed': { instanceId: string; decorId: DecorId; pos: Plot };
  'decor.moved': { instanceId: string; pos: Plot };
  'decor.removed': { instanceId: string };
  'island.named': { name: string }; // first child names it (05 §10); later events win (LWW)
  'road.extended': { to: number }; // Road Crew; projection keeps the max
  'resident.arrived': {
    residentId: ResidentId;
    homeInstanceId: string | null;
    via: 'start' | 'home' | 'ferry';
  };
  'collection.unlocked': { kind: 'resident' | 'decor' | 'outfit' | 'badge'; id: string };
  'festival.started': { festivalId: string; kind: 'festival' | 'storm-watch' };
  'festival.completed': { festivalId: string; rewardDecor: DecorId[] };
  'gift.left': {
    giftId: string;
    toChildId: ChildId | null;
    decorId: DecorId | null;
    message: string | null /* ≤ 140 chars, spoken via sayText */;
  };
  'gift.opened': { giftId: string };
  'milestone.defined': { milestoneId: string; label: string; trigger: UnlockRule };
  'milestone.reached': { milestoneId: string };
  'goal.progress': { weekStart: string; delta: 1; requestId: string };
  'avatar.updated': { avatar: AvatarSpec; source: 'creator' | 'photo-suggestion' };
  'ai.feedback.shown': {
    attemptEventId: EventId;
    mode: 'phrases' | 'text';
    textHash: string;
    aiMisconceptionId: MisconceptionId | null;
    confidence: number;
  };
  'child.deleted': { childId: ChildId }; // envelope childId = null
}

/** Payload schemas, one per EventType. `z.object` everywhere: unknown payload fields are stripped (02 §4.2). */
export const eventSchemas = {
  'session.started': z.object({
    sessionId: idStringSchema,
    budgetMinutes: z.number().positive(),
    trigger: z.enum(['child', 'parent']),
  }),
  'session.ended': z.object({
    sessionId: idStringSchema,
    reason: z.enum(['wind-down', 'child-exit', 'abandoned', 'daily-cap', 'quiet-hours']),
    activeMs: msSchema,
    mathMs: msSchema,
    items: countSchema,
  }),
  attempt: attemptPayloadSchema,
  'hint.used': z.object({
    sessionId: idStringSchema,
    skillId: skillIdSchema,
    templateId: templateIdSchema,
    seed: seedSchema,
    level: z.literal([1, 2, 3, 4, 5]),
  }),
  'lesson.step': z.object({
    sessionId: idStringSchema,
    skillId: skillIdSchema,
    templateId: templateIdSchema,
    phase: lessonPhaseSchema,
    example: countSchema,
    step: countSchema,
    actor: z.enum(['demo', 'child']),
    outcome: z.enum(['done', 'demo-corrected', 'skipped']),
  }),
  'placement.probe': z.object({
    placementId: idStringSchema,
    strand: strandIdSchema.nullable(),
    skillId: skillIdSchema,
    templateId: templateIdSchema,
    seed: seedSchema,
    correct: z.boolean(),
    skipped: z.boolean(),
    latencyMs: msSchema,
    posterior: unitIntervalSchema,
  }),
  'placement.completed': z.object({
    placementId: idStringSchema,
    strand: strandIdSchema.nullable(),
    posterior: z.record(skillIdSchema, unitIntervalSchema),
    assumed: z.array(skillIdSchema),
    items: countSchema,
    reason: z.enum(['converged', 'budget', 'frustration']),
  }),
  'skill.override': z.object({ skillId: skillIdSchema, to: z.enum(['mastered', 'reset']) }),
  'request.accepted': z.object({
    sessionId: idStringSchema,
    requestId: idStringSchema,
    residentId: residentIdSchema,
    workshopId: workshopIdSchema,
    taskCount: countSchema,
  }),
  'request.completed': z.object({
    sessionId: idStringSchema,
    requestId: idStringSchema,
    workshopId: workshopIdSchema,
    items: countSchema,
    firstTryCorrect: countSchema,
    endedEarly: z.boolean(),
  }),
  'material.produced': z.object({
    sessionId: idStringSchema.nullable(),
    requestId: idStringSchema.nullable(),
    workshopId: workshopIdSchema.nullable(),
    materials: recipeSchema,
  }),
  'material.spent': z.object({
    materials: recipeSchema,
    purpose: z.object({
      kind: z.enum(['build', 'upgrade', 'project', 'decor']),
      ref: idStringSchema,
    }),
  }),
  'building.placed': z.object({
    instanceId: idStringSchema,
    buildingId: buildingIdSchema,
    plot: plotSchema,
  }),
  'building.upgraded': z.object({ instanceId: idStringSchema, level: z.literal([2, 3]) }),
  'decor.placed': z.object({ instanceId: idStringSchema, decorId: decorIdSchema, pos: plotSchema }),
  'decor.moved': z.object({ instanceId: idStringSchema, pos: plotSchema }),
  'decor.removed': z.object({ instanceId: idStringSchema }),
  'island.named': z.object({ name: z.string().min(1) }),
  'road.extended': z.object({ to: countSchema }),
  'resident.arrived': z.object({
    residentId: residentIdSchema,
    homeInstanceId: idStringSchema.nullable(),
    via: z.enum(['start', 'home', 'ferry']),
  }),
  'collection.unlocked': z.object({
    kind: z.enum(['resident', 'decor', 'outfit', 'badge']),
    id: idStringSchema,
  }),
  'festival.started': z.object({
    festivalId: idStringSchema,
    kind: z.enum(['festival', 'storm-watch']),
  }),
  'festival.completed': z.object({
    festivalId: idStringSchema,
    rewardDecor: z.array(decorIdSchema),
  }),
  'gift.left': z.object({
    giftId: idStringSchema,
    toChildId: childIdSchema.nullable(),
    decorId: decorIdSchema.nullable(),
    message: z.string().max(140).nullable(),
  }),
  'gift.opened': z.object({ giftId: idStringSchema }),
  'milestone.defined': z.object({
    milestoneId: idStringSchema,
    label: z.string().min(1),
    trigger: unlockRuleSchema,
  }),
  'milestone.reached': z.object({ milestoneId: idStringSchema }),
  'goal.progress': z.object({
    weekStart: z.iso.date(),
    delta: z.literal(1),
    requestId: idStringSchema,
  }),
  'avatar.updated': z.object({
    avatar: avatarSpecSchema,
    source: z.enum(['creator', 'photo-suggestion']),
  }),
  'ai.feedback.shown': z.object({
    attemptEventId: eventIdSchema,
    mode: z.enum(['phrases', 'text']),
    textHash: z.string().min(1),
    aiMisconceptionId: misconceptionIdSchema.nullable(),
    confidence: unitIntervalSchema,
  }),
  'child.deleted': z.object({ childId: childIdSchema }),
} as const satisfies { readonly [T in EventType]: z.ZodType<EventPayloads[T]> };

type PayloadSchemaChecks = {
  [T in EventType]: Equals<z.infer<(typeof eventSchemas)[T]>, EventPayloads[T]>;
};
assertType<Equals<PayloadSchemaChecks[EventType], true>>(true);

// ---------- envelope ----------

export interface EventEnvelope<T extends EventType = EventType> {
  id: EventId; // uuidv7
  familyId: FamilyId;
  childId: ChildId | null; // null for family-level events (island shared actions by parent, settings)
  deviceId: DeviceId;
  ts: number; // ms epoch, device clock (server may clamp, 08 §4)
  clientTs?: number; // set by the server only when it clamped ts; original device time
  type: T;
  v: 1; // payload schema version
  payload: EventPayloads[T];
  contentVersion: string; // packages/content build hash
}

/** The correlated union: `type` narrows `payload`. What parsers return for known types. */
export type KnownEventEnvelope = { [T in EventType]: EventEnvelope<T> }[EventType];

/** An envelope whose type this build does not know; stored and relayed unchanged (08 §4). */
export interface OpaqueEventEnvelope {
  id: EventId;
  familyId: FamilyId;
  childId: ChildId | null;
  deviceId: DeviceId;
  ts: number;
  clientTs?: number;
  type: string;
  v: 1;
  payload: Record<string, unknown>;
  contentVersion: string;
}

/** Anything a reader may legitimately hold: a known event, or an opaque unknown-type one. */
export type AnyEventEnvelope = KnownEventEnvelope | OpaqueEventEnvelope;

/** Lower-case dotted event type grammar (all known types satisfy it). */
export const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/;

const tsSchema = z.number().int().nonnegative();
const envelopeShape = {
  id: eventIdSchema,
  familyId: familyIdSchema,
  childId: childIdSchema.nullable(),
  deviceId: deviceIdSchema,
  ts: tsSchema,
  clientTs: tsSchema.optional(),
  v: z.literal(1),
  contentVersion: z.string().min(1),
};

/** Envelope schema for one known type. Strict: unknown envelope keys are rejected. */
export function eventEnvelopeSchemaFor<T extends EventType>(type: T) {
  return z.strictObject({
    ...envelopeShape,
    type: z.literal(type),
    // The indexed schema loses its per-T inference under a generic T; the mapped check above proves it.
    payload: eventSchemas[type] as unknown as z.ZodType<EventPayloads[T]>,
  });
}
assertType<
  Equals<z.infer<ReturnType<typeof eventEnvelopeSchemaFor<'attempt'>>>, EventEnvelope<'attempt'>>
>(true);
assertType<
  Equals<
    z.infer<ReturnType<typeof eventEnvelopeSchemaFor<'child.deleted'>>>,
    EventEnvelope<'child.deleted'>
  >
>(true);

type EnvelopeOption = ReturnType<typeof eventEnvelopeSchemaFor<EventType>>;
const envelopeOptions = EVENT_TYPES.map((type) => eventEnvelopeSchemaFor(type)) as unknown as [
  EnvelopeOption,
  ...EnvelopeOption[],
];

/**
 * Strict schema for known events: envelope keys strict, `v: 1`, payload validated by
 * `eventSchemas[type]` (unknown payload fields stripped). Unknown types are rejected; use
 * `parseEventEnvelope` / `anyEventEnvelopeSchema` where forward compatibility applies.
 */
// A 31-option discriminated union built from EVENT_TYPES cannot be inferred from `.map`; the
// per-type envelope and payload checks above carry the compile-time guarantee.
export const eventEnvelopeSchema = z.discriminatedUnion(
  'type',
  envelopeOptions,
) as unknown as z.ZodType<KnownEventEnvelope>;

/** Envelope-only validation for any event type; the payload is any JSON object, kept as-is. */
export const opaqueEventEnvelopeSchema = z.strictObject({
  ...envelopeShape,
  type: z.string().regex(EVENT_TYPE_PATTERN, 'expected a dotted lower-case event type'),
  payload: z.record(z.string(), z.unknown()),
});
assertType<MutuallyAssignable<z.infer<typeof opaqueEventEnvelopeSchema>, OpaqueEventEnvelope>>(
  true,
);

/** Forward-compatible wire schema (08 §4): known types strictly, unknown types opaquely. */
export const anyEventEnvelopeSchema: z.ZodType<AnyEventEnvelope> = z.union([
  eventEnvelopeSchema,
  opaqueEventEnvelopeSchema.refine((e) => !isKnownEventType(e.type), {
    message: 'known event type with an invalid envelope or payload',
    path: ['type'],
  }),
]);

/**
 * UTF-8 byte length of an event's payload as received (JSON-serialised), or `null` when there is no
 * payload or it cannot be serialised to JSON. Measured on the raw input, before parsing strips
 * unknown fields.
 */
export function eventPayloadBytes(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null || !('payload' in raw)) return null;
  try {
    const json = JSON.stringify((raw as { payload: unknown }).payload);
    return json === undefined ? null : utf8ByteLength(json);
  } catch {
    return null;
  }
}

/** UTF-8 encoded length of a string (lone surrogates count as U+FFFD, 3 bytes, like TextEncoder). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Inbound wire schema for events a client pushes (sync, import): the 8 KB payload cap (08 §4) is
 * checked on the raw payload, then `anyEventEnvelopeSchema` applies.
 */
export const inboundEventEnvelopeSchema = z
  .unknown()
  .superRefine((raw, ctx) => {
    // No payload key at all: the envelope schema below reports it.
    if (typeof raw !== 'object' || raw === null || !('payload' in raw)) return;
    const bytes = eventPayloadBytes(raw);
    if (bytes === null) {
      // Fail closed: a payload whose size cannot be measured (cycles, BigInt, functions) is not
      // JSON and must never be stored or relayed.
      ctx.addIssue({
        code: 'custom',
        message: 'event payload is not JSON-serialisable',
        path: ['payload'],
      });
    } else if (bytes > MAX_EVENT_PAYLOAD_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: `event payload is ${bytes} bytes; the limit is ${MAX_EVENT_PAYLOAD_BYTES}`,
        path: ['payload'],
      });
    }
  })
  .pipe(anyEventEnvelopeSchema);
assertType<Equals<z.output<typeof inboundEventEnvelopeSchema>, AnyEventEnvelope>>(true);

export type ParsedEventEnvelope =
  | { known: true; event: KnownEventEnvelope }
  | { known: false; event: OpaqueEventEnvelope };

/**
 * 02 §4.2 / 08 §4 reader rule. The envelope is validated strictly for every event; payloads of
 * known types strictly (unknown payload fields stripped); unknown types are returned opaquely.
 */
export function safeParseEventEnvelope(
  raw: unknown,
): { success: true; data: ParsedEventEnvelope } | { success: false; error: z.ZodError } {
  const opaque = opaqueEventEnvelopeSchema.safeParse(raw);
  if (!opaque.success) return { success: false, error: opaque.error };
  if (!isKnownEventType(opaque.data.type)) {
    return { success: true, data: { known: false, event: opaque.data } };
  }
  const known = eventEnvelopeSchema.safeParse(raw);
  if (!known.success) return { success: false, error: known.error };
  return { success: true, data: { known: true, event: known.data } };
}

/** Like `safeParseEventEnvelope` but throws the ZodError. */
export function parseEventEnvelope(raw: unknown): ParsedEventEnvelope {
  const result = safeParseEventEnvelope(raw);
  if (!result.success) throw result.error;
  return result.data;
}
