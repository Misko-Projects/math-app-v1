// MC.write-as-spoken (03 §7.2), answer: writes each place value as it is said, one after the
// other: "forty-seven" → 407, "one hundred five" → 1005, 300 + 40 + 5 → 300405. It matches when
// the asked number v has two or more non-zero place values and r is their concatenation, largest
// first. Teens are said ones first ("four-teen"), which is MC.teen-reversal's slip, so they never
// match here.
//
// The rule has no `predict` (K01): the written-as-spoken number has more digits than any number a
// template asks for, so it is never one of a pick's options (an option must be a possible answer),
// and a prediction would leave every pick and card item non-discriminating (V25). Typed answers
// (the expanded form to the number, hear the name and type it) are where it shows, and `match`
// tags them.

import type { MisconceptionRule } from '../rules';
import { askedNumbers, givenNumbers } from './asked';

/** The place values of v written one after the other (47 → 407), or null when nothing changes. */
export function spokenConcat(v: number): number | null {
  if (!Number.isInteger(v) || v < 20) return null;
  const s = String(v);
  const terms = s
    .split('')
    .map((d, i) => Number(d) * 10 ** (s.length - 1 - i))
    .filter((x) => x > 0);
  if (terms.length < 2) return null;
  return Number(terms.join(''));
}

export const writeAsSpoken: MisconceptionRule = {
  id: 'writeAsSpoken',
  kind: 'answer',
  match(item, r) {
    const want = askedNumbers(item);
    const got = givenNumbers(item, r);
    if (want?.length !== 1 || got?.length !== 1) return false;
    const spoken = spokenConcat(want[0] as number);
    return spoken !== null && got[0] === spoken;
  },
};
