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

describe('grade 3 fraction hints (K02 slice 5a)', () => {
  it('the sign hint holds on an equal draw (FRA.06.t3 and FRA.13.t3 allow a/b = a/b): it names = (PR #139 review)', () => {
    const line = common['h.frac.sign-open']?.text ?? '';
    expect(line).toMatch(/^Equal\? Use =\./);
  });
});

describe('fractions on the number line (K02 slice 5b)', () => {
  const fra = parse(
    readFileSync(fileURLToPath(new URL('../../narration/FRA.yaml', import.meta.url)), 'utf8'),
  ) as Record<string, { text: string }>;

  it('read prompts say which parts make the bottom number, so b/b-style equal answers are not invited (PR #140 review)', () => {
    expect(fra['tp.FRA.04.t2.prompt']?.text ?? '').toMatch(/equal parts drawn on the ruler/);
    for (const key of ['tp.FRA.10.t3.prompt', 'tp.FRA.11.t3.prompt', 'tp.FRA.12.t2.prompt'])
      expect(fra[key]?.text ?? '', key).toMatch(/\{den\} equal parts/);
  });

  it('a line and a ruler retry name what is drawn, not a strip (PR #140 review)', () => {
    expect(common['fb.fraction-line.retry-line']?.text ?? '').toMatch(/\bline\b/);
    expect(common['fb.fraction-line.retry-ruler']?.text ?? '').toMatch(/\bruler\b/);
  });

  it('no line of the slice writes a fraction as a/b text: fractions are fracw words', () => {
    const mine = [
      ...Object.entries(fra).filter(([k]) => /^(sk|tp)\.FRA\.(04|10|11|12)\./.test(k)),
      ...Object.entries(common).filter(([k]) =>
        /^(h|gen)\.frac\.line\.|^fb\.mc\.fraction-(line|over|whole)/.test(k),
      ),
    ];
    expect(mine.length).toBeGreaterThan(40);
    for (const [k, v] of mine) {
      expect(v.text, k).not.toMatch(/\d\s*\/\s*\d/);
      expect(v.text, k).not.toMatch(/\{\w+\|frac\}/);
    }
  });
});
