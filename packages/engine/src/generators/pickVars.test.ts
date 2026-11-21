// Review (PR #94, round 2) F7: `pickVars` keeps only the values a template's lines use, and reads
// the bound narration table as it is at each binding.
import type { ItemTemplate, NarrationJson } from '@number-island/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../content/binding';
import { pickVars } from './common';

const template = { narration: { prompt: 'test.prompt', hints: [] } } as unknown as ItemTemplate;
const pool = { n: 3, answer: 7 };
const bind = (narration: NarrationJson) =>
  initContent({ templates: [], narration, misconceptions: [] });

describe('pickVars', () => {
  afterEach(() => resetContent());

  it('keeps every value while no narration is bound', () => {
    bind({});
    expect(pickVars(template, pool)).toEqual(pool);
  });

  it('filters by the prompt once the same table object is filled and bound again', () => {
    const narration: NarrationJson = {};
    bind(narration);
    expect(pickVars(template, pool)).toEqual(pool);
    (narration as Record<string, unknown>)['test.prompt'] = { text: 'Count {n}', level: 'K' };
    bind(narration);
    expect(pickVars(template, pool)).toEqual({ n: 3 });
  });
});
