import { describe, expect, it } from 'vitest';
import { misconceptionIdSchema, STRATEGY_IDS, strategyIdSchema } from './ids';

describe('StrategyId (02 §4.1, 03 §5.7)', () => {
  it.each(['strategy.made-ten', 'strategy.counted-on', 'strategy.used-doubles', 'strategy.ten2'])(
    'accepts %s',
    (id) => {
      expect(strategyIdSchema.safeParse(id).success).toBe(true);
    },
  );

  it.each([
    'MC.count-all-instead',
    'strategy.',
    'strategy.Made-ten',
    'strategy.made_ten',
    'strategy.made--ten',
    'strategy.-made',
    'strategy.made-',
    'strategy.made.ten',
    'strategies.made-ten',
    'made-ten',
    ' strategy.made-ten',
  ])('rejects %j', (id) => {
    expect(strategyIdSchema.safeParse(id).success).toBe(false);
  });

  it('STRATEGY_IDS are the three 03 §5.7 strategies, sorted, valid, and never misconception ids', () => {
    expect([...STRATEGY_IDS]).toEqual([
      'strategy.counted-on',
      'strategy.made-ten',
      'strategy.used-doubles',
    ]);
    expect([...STRATEGY_IDS].sort()).toEqual([...STRATEGY_IDS]);
    for (const id of STRATEGY_IDS) {
      expect(strategyIdSchema.safeParse(id).success, id).toBe(true);
      expect(misconceptionIdSchema.safeParse(id).success, id).toBe(false);
    }
  });
});
