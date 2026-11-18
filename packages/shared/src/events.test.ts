import { describe, expect, it } from 'vitest';
import type { AvatarSpec } from './avatar';
import type { EventEnvelope, EventPayloads, EventType } from './events';
import {
  anyEventEnvelopeSchema,
  EVENT_TYPES,
  eventEnvelopeSchema,
  eventSchemas,
  isKnownEventType,
  opaqueEventEnvelopeSchema,
  parseEventEnvelope,
  safeParseEventEnvelope,
} from './events';
import { newId } from './ids';

const familyId = newId();
const childId = newId();
const deviceId = newId();
const sessionId = newId();
const requestId = newId();

const avatar: AvatarSpec = {
  skinTone: 's07',
  faceShape: 'round',
  hairStyle: 'curly-short',
  hairColor: 'h03',
  eyeShape: 'almond',
  eyeColor: 'e02',
  eyebrows: 'e-soft',
  glasses: null,
  freckles: true,
  beautyMark: false,
  top: 'tee',
  topColor: 'c04',
  bottom: 'shorts',
  bottomColor: 'c01',
  shoes: 'sneakers',
  shoesColor: 'c09',
  hat: null,
  accessory: null,
  buddy: 'pebbling-one',
};

/** One realistic payload per EventType (02 §5.8). */
const samples: { [T in EventType]: EventPayloads[T] } = {
  'session.started': { sessionId, budgetMinutes: 15, trigger: 'child' },
  'session.ended': {
    sessionId,
    reason: 'wind-down',
    activeMs: 900_000,
    mathMs: 690_000,
    items: 24,
  },
  attempt: {
    sessionId,
    skillId: 'CPS.03',
    templateId: 'CPS.03.t2',
    seed: 123456,
    params: { a: 7, layout: 'row', showCount: false },
    format: 'tenframe-fill',
    tier: 'pictorial',
    representation: 'ten-frame',
    response: { kind: 'number', value: 4 },
    correct: false,
    partialCredit: 0,
    latencyMs: 5320,
    hintsUsed: 0,
    attemptNo: 1,
    misconceptionIds: ['MC.off-by-one-counting'],
    context: 'practice',
    workshopId: 'boat-yard',
  },
  'hint.used': { sessionId, skillId: 'CPS.03', templateId: 'CPS.03.t2', seed: 123456, level: 2 },
  'lesson.step': {
    sessionId,
    skillId: 'ADD.08',
    templateId: 'ADD.08.t1',
    phase: 'faded',
    example: 1,
    step: 2,
    actor: 'child',
    outcome: 'done',
  },
  'placement.probe': {
    placementId: 'pl-1',
    strand: 'CNT',
    skillId: 'CNT.04',
    templateId: 'CNT.04.t1',
    seed: 42,
    correct: true,
    skipped: false,
    latencyMs: 3100,
    posterior: 0.82,
  },
  'placement.completed': {
    placementId: 'pl-1',
    strand: null,
    posterior: { 'CNT.04': 0.82, 'CNT.05': 0.4 },
    assumed: ['CNT.01', 'CNT.02'],
    items: 12,
    reason: 'converged',
  },
  'skill.override': { skillId: 'CPS.03', to: 'mastered' },
  'request.accepted': {
    sessionId,
    requestId,
    residentId: 'shelly',
    workshopId: 'boat-yard',
    taskCount: 6,
  },
  'request.completed': {
    sessionId,
    requestId,
    workshopId: 'boat-yard',
    items: 6,
    firstTryCorrect: 5,
    endedEarly: false,
  },
  'material.produced': {
    sessionId,
    requestId,
    workshopId: 'boat-yard',
    materials: { plank: 6 },
  },
  'material.spent': {
    materials: { plank: 4, brick: 2 },
    purpose: { kind: 'build', ref: 'bakery' },
  },
  'building.placed': { instanceId: 'b-1', buildingId: 'bakery', plot: [3, 4] },
  'building.upgraded': { instanceId: 'b-1', level: 2 },
  'decor.placed': { instanceId: 'd-1', decorId: 'shell-lamp', pos: [5, 2] },
  'decor.moved': { instanceId: 'd-1', pos: [6, 2] },
  'decor.removed': { instanceId: 'd-1' },
  'island.named': { name: 'Pebble Point' },
  'road.extended': { to: 37 },
  'resident.arrived': { residentId: 'shelly', homeInstanceId: 'b-1', via: 'home' },
  'collection.unlocked': { kind: 'decor', id: 'shell-lamp' },
  'festival.started': { festivalId: 'lantern-night', kind: 'festival' },
  'festival.completed': { festivalId: 'lantern-night', rewardDecor: ['lantern-post'] },
  'gift.left': {
    giftId: 'g-1',
    toChildId: childId,
    decorId: 'shell-lamp',
    message: 'For your bakery!',
  },
  'gift.opened': { giftId: 'g-1' },
  'milestone.defined': {
    milestoneId: 'm-1',
    label: 'Ten-frame champion',
    trigger: { all: [{ skill: 'CPS.03', atLeast: 'mastered' }, { roadLength: 20 }] },
  },
  'milestone.reached': { milestoneId: 'm-1' },
  'goal.progress': { weekStart: '2026-11-16', delta: 1, requestId },
  'avatar.updated': { avatar, source: 'creator' },
  'ai.feedback.shown': {
    attemptEventId: newId(),
    mode: 'phrases',
    textHash: 'sha256:9f2c1d',
    aiMisconceptionId: 'MC.off-by-one-counting',
    confidence: 0.78,
  },
  'child.deleted': { childId },
};

function envelope<T extends EventType>(type: T, payload: EventPayloads[T]): EventEnvelope<T> {
  return {
    id: newId(),
    familyId,
    childId: type === 'child.deleted' ? null : childId,
    deviceId,
    ts: 1_763_452_800_000,
    type,
    v: 1,
    payload,
    contentVersion: 'c0ffee12',
  };
}

describe('event contracts', () => {
  it('has one payload schema per EventType, in EVENT_TYPES order', () => {
    expect(Object.keys(eventSchemas)).toEqual([...EVENT_TYPES]);
    expect(Object.keys(samples).sort()).toEqual([...EVENT_TYPES].sort());
  });

  it.each(EVENT_TYPES)('round-trips a sample %s event through eventEnvelopeSchema', (type) => {
    const event = envelope(type, samples[type]);
    expect(eventEnvelopeSchema.parse(event)).toEqual(event);
    expect(eventSchemas[type].parse(samples[type])).toEqual(samples[type]);
    expect(parseEventEnvelope(event)).toEqual({ known: true, event });
    expect(anyEventEnvelopeSchema.parse(event)).toEqual(event);
  });

  it('keeps the optional server-set clientTs', () => {
    const event = {
      ...envelope('island.named', { name: 'Shell Cove' }),
      clientTs: 1_900_000_000_000,
    };
    expect(eventEnvelopeSchema.parse(event)).toEqual(event);
  });

  it('strips unknown payload fields of a known type', () => {
    const event = envelope('road.extended', { to: 12 });
    const parsed = parseEventEnvelope({ ...event, payload: { to: 12, paintedBy: 'future-field' } });
    expect(parsed).toEqual({ known: true, event });
  });

  it('accepts an unknown event type opaquely and unchanged', () => {
    const future = {
      ...envelope('road.extended', { to: 1 }),
      type: 'boat.launched',
      payload: { boatId: 'b-9', crew: [1, 2], nested: { keep: true } },
    };
    expect(isKnownEventType(future.type)).toBe(false);
    expect(parseEventEnvelope(future)).toEqual({ known: false, event: future });
    expect(anyEventEnvelopeSchema.parse(future)).toEqual(future);
    expect(opaqueEventEnvelopeSchema.parse(future)).toEqual(future);
    expect(eventEnvelopeSchema.safeParse(future).success).toBe(false);
  });

  it('rejects a known type whose payload is invalid, even via the forward-compat paths', () => {
    const bad = { ...envelope('road.extended', { to: 1 }), payload: { to: 'far' } };
    expect(safeParseEventEnvelope(bad).success).toBe(false);
    expect(anyEventEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid envelopes', () => {
    const good = envelope('gift.opened', { giftId: 'g-1' });
    const { contentVersion: _omitted, ...missingField } = good;
    const cases: unknown[] = [
      { ...good, id: 'not-a-uuid' },
      { ...good, id: '0190f1c2-1111-4111-8111-111111111111' }, // UUIDv4, not v7
      { ...good, v: 2 },
      missingField,
      { ...good, extra: 'unknown envelope key' },
      { ...good, ts: -1 },
      { ...good, childId: undefined },
      null,
      'gift.opened',
    ];
    for (const raw of cases) {
      expect(eventEnvelopeSchema.safeParse(raw).success).toBe(false);
      expect(safeParseEventEnvelope(raw).success).toBe(false);
      expect(anyEventEnvelopeSchema.safeParse(raw).success).toBe(false);
    }
    const unknownTypeBadEnvelope = { ...good, type: 'boat.launched', v: 2 };
    expect(safeParseEventEnvelope(unknownTypeBadEnvelope).success).toBe(false);
  });
});
