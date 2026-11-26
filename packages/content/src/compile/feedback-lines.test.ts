// Misconception feedback lines that must hold for every item their rule matches (K02 slice 2b,
// #17, review round 1 of PR #127).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const common = parse(
  readFileSync(fileURLToPath(new URL('../../narration/common.yaml', import.meta.url)), 'utf8'),
) as Record<string, { text: string }>;

describe('column-bug feedback', () => {
  it('MC.forgot-to-regroup-add counts one for each ten (19 + 18 + 17 + 16 carries three)', () => {
    // MDA.04 adds four numbers: 30 ones make three more tens, so "one more" alone is untrue.
    const line = common['fb.mc.forgot-to-regroup-add']?.text ?? '';
    expect(line).toMatch(/\beach ten\b/i);
    expect(line).not.toMatch(/that is one more/i);
  });

  it('the borrow lines name no single place: a borrow can come from the tens or the hundreds', () => {
    for (const key of ['fb.mc.smaller-from-larger', 'fb.mc.borrow-no-decrement']) {
      expect(common[key]?.text ?? '', key).not.toMatch(/\b(a|one) (ten|hundred)\b/i);
    }
  });
});
