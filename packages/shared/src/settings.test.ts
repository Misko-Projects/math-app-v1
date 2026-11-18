import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Grade } from './basics';
import { GRADES } from './basics';
import { newId } from './ids';
import type { ChildSettings, FamilySettings } from './settings';
import {
  childSettingsSchema,
  familySettingsSchema,
  parseSettingsKey,
  settingsDocumentSchema,
  settingsKey,
  settingsKeySchema,
  settingsSchemas,
  withSettingDefaults,
} from './settings';

describe('withSettingDefaults (child)', () => {
  it.each<[Grade, number, boolean, number]>([
    ['K', 10, false, 5],
    ['1', 15, true, 6],
    ['2', 15, true, 6],
    ['3', 20, true, 6],
    ['5', 20, true, 6],
  ])(
    'grade %s: sessionMinutes %d, captions %s, weeklyGoal %d',
    (grade, minutes, captions, goal) => {
      const s = withSettingDefaults({ kind: 'child', grade });
      expect(s).toEqual({
        sessionMinutes: minutes,
        dailyCapMinutes: null,
        quietHours: null,
        timedChallenges: false,
        captions,
        tapOnly: false,
        snapRadiusPx: 48,
        speakOnTap: true,
        weeklyGoal: goal,
      });
      expect(childSettingsSchema.parse(s)).toEqual(s);
    },
  );

  it('merges a partial document, keeping explicit nulls and ignoring undefined', () => {
    const s = withSettingDefaults({
      kind: 'child',
      grade: '1',
      value: { tapOnly: true, quietHours: { start: '19:30', end: '07:00' }, captions: undefined },
    });
    expect(s.tapOnly).toBe(true);
    expect(s.quietHours).toEqual({ start: '19:30', end: '07:00' });
    expect(s.captions).toBe(true);
    expect(s.sessionMinutes).toBe(15);

    const capped = withSettingDefaults({
      kind: 'child',
      grade: '1',
      value: { dailyCapMinutes: 30 },
    });
    expect(
      withSettingDefaults({
        kind: 'child',
        grade: '1',
        value: { ...capped, dailyCapMinutes: null },
      }).dailyCapMinutes,
    ).toBeNull();
  });
});

describe('withSettingDefaults (family)', () => {
  it('defaults every AI flag to false and feedbackMode to phrases (07 §8.6)', () => {
    const s = withSettingDefaults({ kind: 'family' });
    expect(s['ai.feedback']).toBe(false);
    expect(s['ai.avatarPhoto']).toBe(false);
    expect(s['ai.parentSummary']).toBe(false);
    expect(s['ai.feedbackMode']).toBe('phrases');
    expect(s.timezone).toBe('UTC');
    expect(familySettingsSchema.parse(s)).toEqual(s);
  });

  it('takes the timezone parameter and merges partial volumes', () => {
    const s = withSettingDefaults({
      kind: 'family',
      timezone: 'America/Chicago',
      value: { music: false, volumes: { music: 0.2 } },
    });
    expect(s.timezone).toBe('America/Chicago');
    expect(s.music).toBe(false);
    expect(s.volumes).toEqual({ voice: 1, sfx: 0.8, music: 0.2 });
  });
});

describe('settings schemas and keys', () => {
  it('exposes settingsSchemas keyed family / child', () => {
    expect(Object.keys(settingsSchemas)).toEqual(['family', 'child']);
  });

  it('rejects out-of-range values', () => {
    const child = withSettingDefaults({ kind: 'child', grade: 'K' });
    expect(childSettingsSchema.safeParse({ ...child, sessionMinutes: 45 }).success).toBe(false);
    expect(
      childSettingsSchema.safeParse({ ...child, quietHours: { start: '25:00', end: '07:00' } })
        .success,
    ).toBe(false);
    const family = withSettingDefaults({ kind: 'family' });
    expect(familySettingsSchema.safeParse({ ...family, voiceRate: 2 }).success).toBe(false);
    expect(familySettingsSchema.safeParse({ ...family, timezone: 'Mars/Olympus' }).success).toBe(
      false,
    );
  });

  it('builds and parses settings keys', () => {
    const childId = newId();
    expect(settingsKey()).toBe('family');
    expect(settingsKey(null)).toBe('family');
    expect(settingsKey(childId)).toBe(`child:${childId}`);
    expect(parseSettingsKey(settingsKey(childId))).toEqual({ kind: 'child', childId });
    expect(parseSettingsKey('family')).toEqual({ kind: 'family' });
    expect(parseSettingsKey('child:nope')).toBeNull();
    expect(settingsKeySchema.safeParse('child:nope').success).toBe(false);
  });

  it('validates documents by key', () => {
    const childId = newId();
    const childDoc = {
      key: settingsKey(childId),
      value: withSettingDefaults({ kind: 'child', grade: '2' }),
      updatedAt: 1,
    };
    const familyDoc = {
      key: 'family',
      value: withSettingDefaults({ kind: 'family' }),
      updatedAt: 2,
    };
    expect(settingsDocumentSchema.parse(childDoc)).toEqual(childDoc);
    expect(settingsDocumentSchema.parse(familyDoc)).toEqual(familyDoc);
    expect(settingsDocumentSchema.safeParse({ ...childDoc, value: familyDoc.value }).success).toBe(
      false,
    );
  });
});

// ---------- properties ----------

const gradeArb = fc.constantFrom(...GRADES);
const unitArb = fc.double({ min: 0, max: 1, noNaN: true });
const hhmmArb = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

const childSettingsArb: fc.Arbitrary<ChildSettings> = fc.record({
  sessionMinutes: fc.integer({ min: 5, max: 30 }),
  dailyCapMinutes: fc.option(fc.integer({ min: 1, max: 1440 }), { nil: null }),
  quietHours: fc.option(fc.record({ start: hhmmArb, end: hhmmArb }), { nil: null }),
  timedChallenges: fc.boolean(),
  captions: fc.boolean(),
  tapOnly: fc.boolean(),
  snapRadiusPx: fc.integer({ min: 1, max: 200 }),
  speakOnTap: fc.boolean(),
  weeklyGoal: fc.integer({ min: 1, max: 30 }),
});

const familySettingsArb: fc.Arbitrary<FamilySettings> = fc.record({
  'ai.feedback': fc.boolean(),
  'ai.feedbackMode': fc.constantFrom('phrases' as const, 'text' as const),
  'ai.avatarPhoto': fc.boolean(),
  'ai.parentSummary': fc.boolean(),
  music: fc.boolean(),
  volumes: fc.record({ voice: unitArb, sfx: unitArb, music: unitArb }),
  voiceRate: fc.double({ min: 0.8, max: 1.2, noNaN: true }),
  freeBuildAfterSession: fc.boolean(),
  timezone: fc.constantFrom('UTC', 'America/Chicago', 'Europe/Warsaw', 'Asia/Tokyo'),
});

describe('withSettingDefaults properties', () => {
  it('child: a valid full document is returned unchanged', () => {
    fc.assert(
      fc.property(childSettingsArb, gradeArb, (value, grade) => {
        expect(childSettingsSchema.parse(value)).toEqual(value);
        expect(withSettingDefaults({ kind: 'child', value, grade })).toEqual(value);
      }),
    );
  });

  it('child: any partial document fills to a valid document, idempotently', () => {
    const partialArb = childSettingsArb.chain((full) =>
      fc
        .subarray(Object.keys(full) as (keyof ChildSettings)[])
        .map((keys) => Object.fromEntries(keys.map((k) => [k, full[k]]))),
    );
    fc.assert(
      fc.property(partialArb, gradeArb, (value, grade) => {
        const once = withSettingDefaults({ kind: 'child', value, grade });
        expect(childSettingsSchema.safeParse(once).success).toBe(true);
        expect(once).toMatchObject(value);
        expect(withSettingDefaults({ kind: 'child', value: once, grade })).toEqual(once);
      }),
    );
  });

  it('family: any partial document fills to a valid document, idempotently', () => {
    const partialArb = familySettingsArb.chain((full) =>
      fc
        .subarray(Object.keys(full) as (keyof FamilySettings)[])
        .map((keys) => Object.fromEntries(keys.map((k) => [k, full[k]]))),
    );
    fc.assert(
      fc.property(partialArb, (value) => {
        const once = withSettingDefaults({ kind: 'family', value });
        expect(familySettingsSchema.safeParse(once).success).toBe(true);
        expect(once).toMatchObject(value);
        expect(withSettingDefaults({ kind: 'family', value: once })).toEqual(once);
      }),
    );
  });
});
