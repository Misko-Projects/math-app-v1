import { describe, expect, it } from 'vitest';
import { isSpoken, planLine, planPhrases, speakSymbols, splitLine } from './narration';
import { narrationFixture as N } from './testing/narrationFixture';

const ids = (plan: ReturnType<typeof planLine>) =>
  plan?.clips?.map((c) => c.candidates.at(-1)) ?? null;

describe('planLine: clip stitching order (03 §8.4)', () => {
  it('interleaves static clips and composed numbers in speaking order', () => {
    const plan = planLine(N, 'tp.ADD.08.t1.prompt', { a: 7, b: 3 });
    expect(ids(plan)).toEqual([
      'tp.ADD.08.t1.prompt#0',
      'num.7#0',
      'tp.ADD.08.t1.prompt#1',
      'num.3#0',
      'tp.ADD.08.t1.prompt#2',
    ]);
    expect(plan?.text).toBe('Fill the shell to make ten. How many is 7 + 3?');
    expect(plan?.spoken).toBe('Fill the shell to make ten. How many is seven plus three?');
    expect(plan?.voice).toBe('narrator');
  });

  it('uses the sentence-final .end variant for a number followed only by punctuation', () => {
    const plan = planLine(N, 'tp.ADD.08.t1.prompt', { a: 7, b: 23 });
    // The second slot is followed by "?" only: try num.23.end first, then the plain clip.
    expect(plan?.clips?.[3]?.candidates).toEqual(['num.23.end#0', 'num.23#0']);
    // The first slot is mid-sentence: plain clip only.
    expect(plan?.clips?.[1]?.candidates).toEqual(['num.7#0']);
    // The trailing "?" segment has no words, so a missing clip for it does not force a fallback.
    expect(plan?.clips?.[4]?.optional).toBe(true);
    expect(plan?.clips?.[0]?.optional).toBe(false);
  });

  it('applies .end only to the last clip of a multi-clip number', () => {
    const plan = planLine(N, 'ls.CNT.03.w1.s3', { n: 345 });
    expect(plan?.clips?.map((c) => c.candidates)).toEqual([
      ['ls.CNT.03.w1.s3#0'],
      ['num.3#0'],
      ['num.hundred#0'],
      ['num.45#0'],
      ['ls.CNT.03.w1.s3#1'],
      ['num.3#0'],
      ['num.hundred#0'],
      ['num.45.end#0', 'num.45#0'],
      ['ls.CNT.03.w1.s3#2'],
    ]);
    expect(plan?.voice).toBe('pip');
    expect(plan?.text).toBe('The last number was 345, so there are 345!');
  });

  it('expands names and counted nouns', () => {
    const plan = planLine(N, 'req.dock.needs-planks', { who: 'shelly', n: 4, item: 'plank' });
    expect(ids(plan)).toEqual([
      'res.shelly#0',
      'req.dock.needs-planks#0',
      'num.4#0',
      'noun.plank.many#0',
      'req.dock.needs-planks#1',
    ]);
    expect(plan?.text).toBe('Shelly needs 4 planks for the boat.');
    expect(plan?.spoken).toBe('Shelly needs four planks for the boat.');
  });

  it('formats money for captions and speech', () => {
    const plan = planLine(N, 'p.money.pay', { price: 125 });
    expect(plan?.text).toBe('Pay $1.25.');
    expect(plan?.spoken).toBe('Pay one dollar and twenty-five cents.');
    expect(ids(plan)).toEqual([
      'p.money.pay#0',
      'num.1#0',
      'money.dollar.one#0',
      'word.and#0',
      'num.25#0',
      'money.cent.many#0',
      'p.money.pay#1',
    ]);
  });

  it('speaks math symbols when the line has no `say`', () => {
    const plan = planLine(N, 'p.add.what-is', { a: 3, b: 4 });
    expect(plan?.text).toBe('3 + 4 = ?');
    expect(plan?.spoken).toBe('three plus four equals what number');
  });

  it('shows a thousands comma in captions', () => {
    expect(planLine(N, 'ls.CNT.03.w1.s3', { n: 12_345 })?.text).toBe(
      'The last number was 12,345, so there are 12,345!',
    );
  });

  it('returns no clips (fallback) when a var is missing or a clip set is unknown', () => {
    const missing = planLine(N, 'tp.ADD.08.t1.prompt', { a: 7 });
    expect(missing?.clips).toBeNull();
    expect(missing?.problems.join()).toMatch(/no value for slot \$b/);

    const unknownNoun = planLine(N, 'req.dock.needs-planks', { who: 'shelly', n: 2, item: 'rope' });
    expect(unknownNoun?.clips).toBeNull();
    expect(unknownNoun?.problems.join()).toMatch(/noun\.rope\.many/);
    // Speech still says something sensible.
    expect(unknownNoun?.spoken).toBe('Shelly needs two rope for the boat.');
  });

  it('returns null for an unknown key', () => {
    expect(planLine(N, 'p.nope', {})).toBeNull();
  });
});

describe('planPhrases (07 §2 phrases mode)', () => {
  it('stitches phrase clips and numbers in Glim’s voice', () => {
    const plan = planPhrases(N, [{ id: 'ph.you-have' }, { number: 7 }]);
    expect(plan.voice).toBe('glim');
    expect(plan.clips?.map((c) => c.candidates)).toEqual([
      ['ph.you-have#0'],
      ['num.7.end#0', 'num.7#0'],
    ]);
    expect(plan.spoken).toBe('You have seven');
  });

  it('drops unknown phrase ids with a problem and keeps the rest', () => {
    const plan = planPhrases(N, [{ id: 'ph.missing' }, { id: 'ph.look-at-the-empty-boxes' }]);
    expect(plan.clips?.map((c) => c.candidates[0])).toEqual(['ph.look-at-the-empty-boxes#0']);
    expect(plan.problems).toEqual(['phrase ph.missing is not in narration.json']);
  });

  it('has no clips when nothing is left to say', () => {
    expect(planPhrases(N, []).clips).toBeNull();
  });
});

describe('isSpoken (which static clips are required)', () => {
  it.each([
    [' + ', true, true],
    [' = ?', true, true],
    [' - ', true, true],
    ['?', false, true], // a line that is only a blank: "what number"
    ['?', true, false], // "{b}?": terminal punctuation
    ['!', true, false],
    ['.', false, false],
    [' plus ', true, true],
  ])('%j (follows content: %s) → %s', (text, follows, expected) => {
    expect(isSpoken(text, follows)).toBe(expected);
  });

  it('marks a lone "?" line required but keeps "{b}?" optional', () => {
    expect(planLine(N, 'p.blank', {})?.clips?.[0]?.optional).toBe(false);
    expect(planLine(N, 'tp.ADD.08.t1.prompt', { a: 1, b: 2 })?.clips?.at(-1)?.optional).toBe(true);
  });
});

describe('text helpers', () => {
  it('splitLine honours escaped braces', () => {
    expect(splitLine('a {{b}} {c} d')).toEqual([
      { kind: 'text', text: 'a {b} ' },
      { kind: 'slot', raw: 'c' },
      { kind: 'text', text: ' d' },
    ]);
  });

  it('speakSymbols reads 03 §8.4 symbols and blanks', () => {
    expect(speakSymbols('8 − 3 = __')).toBe('8 minus 3 equals what number');
    expect(speakSymbols('6 × 7 ÷ 2')).toBe('6 times 7 divided by 2');
    expect(speakSymbols('3 < 5 > 1')).toBe('3 is less than 5 is greater than 1');
    expect(speakSymbols('How many?')).toBe('How many?');
  });
});
