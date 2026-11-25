// MC.face-value (03 §7.2), answer: every digit is worth its face. In digit-value mode the 4 in 345
// is worth 4 (r = the digit). K01 also reads the slip on the number itself (pv.number, n ≥ 10):
// counting every base-ten piece as one, so 3 tens 4 ones is 7: a typed or picked number equal to
// the digit sum of n, a base-ten build of only ones whose count is that sum (34 built with 7 ones),
// or place-value cards that are the bare digits (3 and 4 for 34). Items that ask for a part of n
// (an expanded-form term) cannot discriminate. K02 (PV.24): a base-ten build of what a digit is
// worth made of that many ones (the 4 in 345 built with 4 ones).

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { matPieces } from '../../check/state/baseten.value';
import { numberOptionId, responseNumber } from '../../formats/numeral-pick';
import type { MisconceptionRule } from '../rules';

const digitsOf = (n: number): number[] =>
  String(Math.trunc(Math.abs(n)))
    .split('')
    .map(Number);

/** The slip an item invites: the face value of the asked digit, or the digit sum of n. */
function faceSlip(item: GeneratedItem): { kind: 'digit' | 'sum'; value: number; n: number } | null {
  const n = item.params.n;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 10) return null;
  const mode = item.params.mode;
  const place = typeof item.params.place === 'number' ? item.params.place : -1;
  const d = digitsOf(n);
  if (mode === 'digit-value') {
    const k = place >= 0 ? place : d.length - 1;
    const digit = d[d.length - 1 - k];
    // The ones digit is worth its face: nothing to discriminate.
    if (digit === undefined || k === 0 || digit === 0) return null;
    return { kind: 'digit', value: digit, n };
  }
  // A blank term of the expanded form asks for a part of n, not n.
  if (mode === 'expanded' && place >= 0) return null;
  return { kind: 'sum', value: d.reduce((s, x) => s + x, 0), n };
}

/** The non-zero digits of n as cards (34 → 3, 4). */
const digitCards = (n: number): number[] => digitsOf(n).filter((x) => x > 0);

const sameMultiset = (x: readonly number[], y: readonly number[]): boolean => {
  if (x.length !== y.length) return false;
  const a = [...x].sort((p, q) => p - q);
  const b = [...y].sort((p, q) => p - q);
  return a.every((v, i) => v === b[i]);
};

export const faceValue: MisconceptionRule = {
  id: 'faceValue',
  kind: 'answer',
  predict(item): ResponseValue | null {
    const slip = faceSlip(item);
    if (!slip) return null;
    const a = item.answer;
    const w = item.widget;
    switch (a.kind) {
      case 'number':
        return a.value === slip.value ? null : { kind: 'number', value: slip.value };
      case 'choice': {
        if (w.format !== 'numeral-pick') return null;
        const id = numberOptionId(slip.value);
        return id !== a.id && w.options.some((o) => o.id === id) ? { kind: 'choice', id } : null;
      }
      case 'numbers': {
        // Place-value cards: the bare digits, when the cards on offer hold them.
        if (w.format !== 'expanded-form' || w.mode !== 'build' || slip.kind !== 'sum') return null;
        const want = digitCards(slip.n);
        const cards = [...(w.cards ?? [])];
        for (const v of want) {
          const i = cards.indexOf(v);
          if (i < 0) return null;
          cards.splice(i, 1);
        }
        return { kind: 'numbers', values: want };
      }
      case 'state':
        // Every piece a one: 34 built with 7 ones, or the 4 in 345 built with 4 ones.
        if (w.format !== 'base-ten-build') return null;
        return {
          kind: 'state',
          value: { thousands: 0, hundreds: 0, tens: 0, ones: slip.value },
        };
      default:
        return null;
    }
  },
  match(item, r) {
    const slip = faceSlip(item);
    if (!slip) return false;
    const w = item.widget;
    if (r.kind === 'numbers') {
      return (
        w.format === 'expanded-form' &&
        w.mode === 'build' &&
        slip.kind === 'sum' &&
        sameMultiset(r.values, digitCards(slip.n))
      );
    }
    if (r.kind === 'state') {
      if (w.format !== 'base-ten-build') return false;
      const mat = matPieces(r.value);
      return (
        mat !== undefined &&
        mat.thousands === 0 &&
        mat.hundreds === 0 &&
        mat.tens === 0 &&
        mat.ones === slip.value
      );
    }
    const got = responseNumber(r);
    return got !== null && got === slip.value && got !== slip.n;
  },
};
