import { describe, expect, it } from 'vitest';
import {
  ANSWER_KINDS,
  DISTRACTOR_FORMATS,
  eventSchemas,
  FORMAT_DEFAULT_REPRESENTATION,
  FORMAT_SUPPORT,
  formatRendersRepresentation,
  formatSupportSchema,
  ITEM_FORMATS,
} from './index';

// 02 §5.9 E1: the 03 §5.5 format support table lives in shared, with a schema.
describe('FORMAT_SUPPORT (03 §5.5)', () => {
  it('has a schema-valid entry for every ItemFormat, and nothing else', () => {
    expect(Object.keys(FORMAT_SUPPORT).sort()).toEqual([...ITEM_FORMATS].sort());
    for (const f of ITEM_FORMATS) {
      const r = formatSupportSchema.safeParse(FORMAT_SUPPORT[f]);
      expect(r.success, f).toBe(true);
    }
  });

  it("renders each format's default representation", () => {
    for (const f of ITEM_FORMATS) {
      expect(formatRendersRepresentation(f, FORMAT_DEFAULT_REPRESENTATION[f]), f).toBe(true);
    }
  });

  it("'any' formats render every representation; listed formats only their own", () => {
    expect(formatRendersRepresentation('number-pad', 'clock')).toBe(true);
    expect(formatRendersRepresentation('tap-count', 'objects')).toBe(true);
    expect(formatRendersRepresentation('tap-count', 'clock')).toBe(false);
  });

  it('lists distractor formats that answer with a choice', () => {
    for (const f of DISTRACTOR_FORMATS) expect(FORMAT_SUPPORT[f].answers).toContain('choice');
  });

  it('rejects malformed entries', () => {
    expect(
      formatSupportSchema.safeParse({ ...FORMAT_SUPPORT['tap-count'], tiers: [] }).success,
    ).toBe(false);
    expect(
      formatSupportSchema.safeParse({ ...FORMAT_SUPPORT['tap-count'], answers: ['guess'] }).success,
    ).toBe(false);
    expect(
      formatSupportSchema.safeParse({ ...FORMAT_SUPPORT['tap-count'], representations: ['nope'] })
        .success,
    ).toBe(false);
  });

  it('answer kinds match AnswerSpec', () => {
    expect([...ANSWER_KINDS].sort()).toEqual(['choice', 'number', 'numbers', 'placement', 'state']);
  });
});

// 02 §5.9 E2: hint.used logs every rung of the five-level ladder (03 §5.8).
describe('hint.used level', () => {
  const base = {
    sessionId: 'session-1',
    skillId: 'CPS.03',
    templateId: 'CPS.03.t2',
    seed: 7,
  };
  it.each([1, 2, 3, 4, 5])('accepts level %i', (level) => {
    expect(eventSchemas['hint.used'].safeParse({ ...base, level }).success).toBe(true);
  });
  it.each([0, 6, 2.5])('rejects level %s', (level) => {
    expect(eventSchemas['hint.used'].safeParse({ ...base, level }).success).toBe(false);
  });
});
