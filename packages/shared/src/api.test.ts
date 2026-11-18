import { describe, expect, it } from 'vitest';
import type { AiFeedbackRequest, HealthResponse, SyncRequest, SyncResponse } from './api';
import {
  aiFeedbackRequestSchema,
  aiFeedbackResponseSchema,
  apiErrorBodySchema,
  apiRoutes,
  avatarFromPhotoRequestSchema,
  healthResponseSchema,
  parentSummarySchema,
  syncRequestSchema,
  syncResponseSchema,
} from './api';
import type { EventEnvelope } from './events';
import { utf8ByteLength } from './events';
import { newId } from './ids';
import type { ChildProfile } from './profiles';
import { settingsKey, withSettingDefaults } from './settings';

const familyId = newId();
const childId = newId();
const deviceId = newId();

const profile: ChildProfile = {
  id: childId,
  familyId,
  name: 'Ada',
  birthYear: 2020,
  grade: 'K',
  advanced: false,
  avatar: {
    skinTone: 's03',
    faceShape: 'oval',
    hairStyle: 'braids',
    hairColor: 'h01',
    eyeShape: 'round',
    eyeColor: 'e05',
    eyebrows: 'e-soft',
    glasses: 'round',
    freckles: false,
    beautyMark: false,
    top: 'hoodie',
    topColor: 'c02',
    bottom: 'leggings',
    bottomColor: 'c03',
    shoes: 'boots',
    shoesColor: 'c07',
    hat: null,
    accessory: null,
    buddy: 'shelly',
  },
  picturePasswordHash: null,
  createdAt: 1_763_000_000_000,
  updatedAt: 1_763_400_000_000,
};

const event: EventEnvelope<'request.completed'> = {
  id: newId(),
  familyId,
  childId,
  deviceId,
  ts: 1_763_452_800_000,
  type: 'request.completed',
  v: 1,
  payload: {
    sessionId: newId(),
    requestId: newId(),
    workshopId: 'boat-yard',
    items: 6,
    firstTryCorrect: 4,
    endedEarly: false,
  },
  contentVersion: 'c0ffee12',
};

const futureEvent = { ...event, id: newId(), type: 'boat.launched', payload: { boatId: 'b-1' } };

describe('API DTOs', () => {
  it('round-trips a health response', () => {
    const health: HealthResponse = {
      ok: true,
      version: '0.1.0',
      contentVersion: 'c0ffee12',
      ai: { feedback: true, vision: false, summary: true },
    };
    expect(healthResponseSchema.parse(health)).toEqual(health);
    expect(healthResponseSchema.safeParse({ ...health, ai: { feedback: 'yes' } }).success).toBe(
      false,
    );
  });

  it('round-trips a sync request and response, relaying unknown event types', () => {
    const request: SyncRequest = {
      cursor: null,
      events: [event, futureEvent],
      settings: [
        { key: 'family', value: withSettingDefaults({ kind: 'family' }), updatedAt: 10 },
        {
          key: settingsKey(childId),
          value: withSettingDefaults({ kind: 'child', grade: 'K' }),
          updatedAt: 11,
        },
      ],
      profiles: [profile],
    };
    expect(syncRequestSchema.parse(request)).toEqual(request);

    const response: SyncResponse = {
      accepted: [event.id, futureEvent.id],
      events: [{ ...event, id: newId(), deviceId: newId() }],
      cursor: '42',
      more: false,
      settings: request.settings,
      profiles: [{ ...profile, deletedAt: 1_763_500_000_000 }],
    };
    expect(syncResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects a sync push over 500 events or with a broken known event', () => {
    const tooMany = { cursor: null, events: Array(501).fill(event), settings: [], profiles: [] };
    expect(syncRequestSchema.safeParse(tooMany).success).toBe(false);
    const broken = { ...event, payload: { ...event.payload, items: -1 } };
    expect(
      syncRequestSchema.safeParse({ cursor: null, events: [broken], settings: [], profiles: [] })
        .success,
    ).toBe(false);
  });

  it('round-trips the 07 §2 feedback example', () => {
    const req: AiFeedbackRequest = {
      ageBand: '5-6',
      grade: 'K',
      skill: { id: 'CPS.03', name: 'Partners of 10' },
      item: {
        format: 'tenframe-fill',
        tier: 'pictorial',
        promptText: '7 and how many make 10?',
        params: { a: 7 },
      },
      correctAnswer: '3',
      childResponse: '4',
      attemptNo: 1,
      matchedMisconceptions: ['MC.off-by-one-counting'],
      misconceptionLibrary: [{ id: 'MC.off-by-one-counting', description: 'Counts one too many' }],
      recentPattern: { sameSkillWrongInRow: 1 },
      phraseBank: ['ph.lets-count-together', 'ph.look-at-the-empty-boxes'],
    };
    expect(aiFeedbackRequestSchema.parse(req)).toEqual(req);
    const res = {
      feedback: {
        mode: 'phrases',
        phrases: [{ id: 'ph.look-at-the-empty-boxes' }, { number: 3 }],
        text: '',
        likelyMisconception: 'MC.off-by-one-counting',
        confidence: 0.8,
        revealsAnswer: false,
      },
    };
    expect(aiFeedbackResponseSchema.parse(res)).toEqual(res);
    expect(aiFeedbackResponseSchema.parse({ feedback: null })).toEqual({ feedback: null });
  });

  it('accepts a base64 JPEG photo and rejects other media types', () => {
    const photo = { mediaType: 'image/jpeg', data: 'SGVsbG8=' };
    expect(avatarFromPhotoRequestSchema.parse({ photo })).toEqual({ photo });
    expect(
      avatarFromPhotoRequestSchema.safeParse({ photo: { ...photo, mediaType: 'image/png' } })
        .success,
    ).toBe(false);
    expect(
      avatarFromPhotoRequestSchema.safeParse({ photo: { ...photo, data: 'not base64!' } }).success,
    ).toBe(false);
  });

  it('pins the parent summary shape (highlights[3], watchFor ≤ 2, tryAtHome[2])', () => {
    const summary = {
      headline: 'A strong week with partners of 10',
      highlights: ['a', 'b', 'c'],
      watchFor: ['d'],
      tryAtHome: ['e', 'f'],
    };
    expect(parentSummarySchema.parse(summary)).toEqual(summary);
    expect(parentSummarySchema.safeParse({ ...summary, highlights: ['a', 'b'] }).success).toBe(
      false,
    );
    expect(parentSummarySchema.safeParse({ ...summary, watchFor: ['1', '2', '3'] }).success).toBe(
      false,
    );
  });

  it('validates the error body', () => {
    const body = { error: { code: 'rate_limited', message: 'Try again in 15 minutes.' } };
    expect(apiErrorBodySchema.parse(body)).toEqual(body);
    expect(apiErrorBodySchema.safeParse({ error: { code: 'oops', message: '' } }).success).toBe(
      false,
    );
  });

  it('has schemas for every route in 08 §2', () => {
    const routes = Object.values(apiRoutes).map((r) => `${r.method} ${r.path}`);
    expect(routes.sort()).toEqual(
      [
        'GET /api/health',
        'POST /api/setup',
        'POST /api/auth/login',
        'POST /api/auth/logout',
        'POST /api/auth/pin',
        'POST /api/devices/pair/start',
        'POST /api/devices/pair/complete',
        'GET /api/devices',
        'DELETE /api/devices/:id',
        'POST /api/sync',
        'POST /api/ai/feedback',
        'POST /api/ai/avatar-from-photo',
        'POST /api/ai/parent-summary',
        'GET /api/export',
        'POST /api/import',
        'DELETE /api/children/:id',
      ].sort(),
    );
    for (const route of Object.values(apiRoutes)) {
      expect(typeof route.response.safeParse).toBe('function');
      if ('request' in route) expect(typeof route.request.safeParse).toBe('function');
      if (route.path.includes(':id')) expect('params' in route).toBe(true);
      if (route.method === 'GET' || route.method === 'DELETE')
        expect('request' in route).toBe(false);
    }
  });
});

describe('8 KB event payload cap on inbound events (08 §4)', () => {
  const push = (events: unknown[]) =>
    syncRequestSchema.safeParse({ cursor: null, events, settings: [], profiles: [] });

  it('accepts payloads at the limit and rejects larger ones, for unknown types', () => {
    // {"blob":"…"} is 11 bytes of JSON around the string
    const atLimit = { ...futureEvent, id: newId(), payload: { blob: 'x'.repeat(8192 - 11) } };
    const over = { ...futureEvent, id: newId(), payload: { blob: 'x'.repeat(8192 - 10) } };
    expect(push([atLimit]).success).toBe(true);
    expect(push([over]).success).toBe(false);
  });

  it('measures the raw payload before unknown fields are stripped from known types', () => {
    const padded = { ...event, payload: { ...event.payload, junk: 'x'.repeat(9000) } };
    expect(push([padded]).success).toBe(false);
    expect(push([event]).success).toBe(true);
  });

  it('counts UTF-8 bytes, not UTF-16 code units', () => {
    expect(utf8ByteLength('aé€😀')).toBe(1 + 2 + 3 + 4);
    // 2,800 three-byte characters = 8,400 bytes, under 8,192 code units
    const wide = { ...futureEvent, id: newId(), payload: { s: '€'.repeat(2800) } };
    expect(push([wide]).success).toBe(false);
  });
});
