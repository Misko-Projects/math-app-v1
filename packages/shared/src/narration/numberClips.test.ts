import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { numberClips } from './numberClips';

const NUMBER_CLIPS_MAX = 1_000_000;

// Spoken form of each clip, for checking compositions read naturally.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function word(clip: string): string {
  const id = clip.slice('num.'.length);
  if (id === 'hundred' || id === 'thousand' || id === 'million' || id === 'negative') return id;
  const n = Number(id);
  if (n < 10) return ONES[n] as string;
  if (n < 20) return TEENS[n - 10] as string;
  const tens = TENS[Math.floor(n / 10)] as string;
  return n % 10 === 0 ? tens : `${tens}-${ONES[n % 10]}`;
}
const spoken = (n: number) => numberClips(n).map(word).join(' ');

describe('numberClips (03 §8.3 table)', () => {
  it.each([
    [0, ['num.0'], 'zero'],
    [23, ['num.23'], 'twenty-three'],
    [100, ['num.1', 'num.hundred'], 'one hundred'],
    [305, ['num.3', 'num.hundred', 'num.5'], 'three hundred five'],
    [999, ['num.9', 'num.hundred', 'num.99'], 'nine hundred ninety-nine'],
    [1000, ['num.1', 'num.thousand'], 'one thousand'],
    [
      12345,
      ['num.12', 'num.thousand', 'num.3', 'num.hundred', 'num.45'],
      'twelve thousand three hundred forty-five',
    ],
    [-4, ['num.negative', 'num.4'], 'negative four'],
  ])('%i → %j', (n, clips, words) => {
    expect(numberClips(n)).toEqual(clips);
    expect(spoken(n)).toBe(words);
  });

  it.each([
    [99, ['num.99']],
    [110, ['num.1', 'num.hundred', 'num.10']],
    [1001, ['num.1', 'num.thousand', 'num.1']],
    [1010, ['num.1', 'num.thousand', 'num.10']],
    [2100, ['num.2', 'num.thousand', 'num.1', 'num.hundred']],
    [100000, ['num.1', 'num.hundred', 'num.thousand']],
    [999999, ['num.9', 'num.hundred', 'num.99', 'num.thousand', 'num.9', 'num.hundred', 'num.99']],
    [1000000, ['num.1', 'num.million']],
    [-1000000, ['num.negative', 'num.1', 'num.million']],
    [-305, ['num.negative', 'num.3', 'num.hundred', 'num.5']],
  ])('edge %i → %j', (n, clips) => {
    expect(numberClips(n)).toEqual(clips);
  });

  it('treats -0 as zero', () => {
    expect(numberClips(-0)).toEqual(['num.0']);
  });

  it.each([1000001, -1000001, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    'rejects %s',
    (n) => {
      expect(() => numberClips(n)).toThrow(RangeError);
    },
  );

  it('only uses clips from the 03 §8.3 inventory, and the clips add back up to n', () => {
    const value = (clips: string[]): number => {
      // Reconstruct n from the clip sequence: proves the composition is unambiguous.
      let sign = 1;
      let total = 0;
      let group = 0;
      for (const c of clips) {
        const id = c.slice(4);
        if (id === 'negative') sign = -1;
        else if (id === 'hundred') group *= 100;
        else if (id === 'thousand') {
          total += group * 1000;
          group = 0;
        } else if (id === 'million') {
          total += group * 1_000_000;
          group = 0;
        } else group += Number(id);
      }
      return sign * (total + group);
    };
    fc.assert(
      fc.property(fc.integer({ min: -NUMBER_CLIPS_MAX, max: NUMBER_CLIPS_MAX }), (n) => {
        const clips = numberClips(n);
        for (const c of clips) {
          expect(c).toMatch(/^num\.(\d|[1-9]\d|hundred|thousand|million|negative)$/);
        }
        expect(value(clips)).toBe(n === 0 ? 0 : n);
      }),
      { numRuns: 2000 },
    );
  });
});
