import { describe, expect, it } from 'vitest';

// Zod builds schemas at module load, so a bad derivation (e.g. `.omit()` on a refined schema)
// throws on import even though `tsc` passes. Import the public barrel at runtime to catch that.
describe('@number-island/shared public entry', () => {
  it('loads without throwing and exposes the headline schemas', async () => {
    const shared = await import('./index');
    for (const name of [
      'eventEnvelopeSchema',
      'eventSchemas',
      'settingsSchemas',
      'gameDataSchema',
      'avatarSpecSchema',
      'widgetConfigSchema',
      'generatedItemSchema',
      'presentedItemSchema',
      'healthResponseSchema',
      'withSettingDefaults',
      'newId',
      'strategyIdSchema',
      'STRATEGY_IDS',
    ]) {
      expect(shared, name).toHaveProperty(name);
    }
  });

  it('presentedItemSchema drops the answer and keeps the widget/format rule', async () => {
    const { presentedItemSchema } = await import('./index');
    const item = {
      templateId: 'CNT.01.t1',
      skillId: 'CNT.01',
      seed: 1,
      format: 'number-pad',
      tier: 'abstract',
      params: {},
      prompt: { narration: 'p.count.how-many', vars: {}, text: 'How many?' },
      widget: {
        format: 'number-pad',
        stimulus: { kind: 'none' },
        blanks: [{ id: 'a', maxDigits: 2 }],
      },
      answer: { kind: 'number', value: 3 },
      hints: [],
      difficulty: 0,
    };
    const parsed = presentedItemSchema.safeParse(item);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data).not.toHaveProperty('answer');
    const mismatched = presentedItemSchema.safeParse({
      ...item,
      widget: { ...item.widget, format: 'tap-count' },
    });
    expect(mismatched.success).toBe(false);
  });
});
