// Shared by the counting answer rules that rewrite the asked numbers (decadeTransition,
// teenReversal): read the numbers an item asks for and a response gives, in the same shape, and
// turn rewritten numbers back into a response of the item's answer kind.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { piecesOf, piecesValue } from '../../check/state/baseten.value';
import { numberOptionId, responseNumber } from '../../formats/numeral-pick';

/**
 * The numbers an item asks the child to give: a number answer, an `opt-<n>` pick, a typed list
 * (missing numbers on a number pad or hundred chart, in answer order), or the typed landing of a
 * one-hop jump (`goal: next`). A land-on target is given in the prompt, not asked, so it is null,
 * like every other answer shape. K01 (pv.number, CPS.04, CPS.07): the typed total after filling
 * frames or sliding beads (thenAsk), the value of a base-ten build, and the number place-value
 * cards make (expanded-form build) are asked too; a build with no typed value (show 14 on the
 * frames) gives the number in the prompt, so it stays null.
 */
export function askedNumbers(item: GeneratedItem): number[] | null {
  const a = item.answer;
  switch (a.kind) {
    case 'number':
      return [a.value];
    case 'numbers':
      // Place-value cards (expanded-form build) ask for the number they make (10 and 4 make 14).
      if (item.widget.format === 'expanded-form' && item.widget.mode === 'build') {
        return [item.widget.target];
      }
      // Typed lists only: an `order` answer rearranges given numbers, so none can be rewritten.
      return item.widget.format === 'number-pad' || item.widget.format === 'hundred-chart'
        ? [...a.values]
        : null;
    case 'choice': {
      const n = responseNumber({ kind: 'choice', id: a.id });
      return n === null ? null : [n];
    }
    case 'state':
      // A typed value after building (thenAsk), or the number a base-ten build makes.
      return VALUE_STATE_FORMATS.has(item.widget.format) && typeof a.target.value === 'number'
        ? [a.target.value]
        : null;
    default:
      return null;
  }
}

/**
 * State answers that carry the asked number as `target.value`: the typed landing of a jump, the
 * typed total after filling frames or sliding beads (thenAsk), and a base-ten build's value.
 */
const VALUE_STATE_FORMATS = new Set<string>([
  'number-line-jump',
  'tenframe-fill',
  'rekenrek',
  'base-ten-build',
]);

/** The non-zero place values of n, largest first (41 → 40, 1). */
function placeTerms(n: number): number[] {
  const out: number[] = [];
  for (let k = String(n).length - 1; k >= 0; k -= 1) {
    const d = Math.floor(n / 10 ** k) % 10;
    if (d > 0) out.push(d * 10 ** k);
  }
  return out;
}

/** The numbers a response gives, in the shape `askedNumbers` reads. */
export function givenNumbers(item: GeneratedItem, r: ResponseValue): number[] | null {
  if (r.kind === 'numbers') {
    if (item.widget.format === 'expanded-form' && item.widget.mode === 'build') {
      return [r.values.reduce((s, v) => s + v, 0)];
    }
    return [...r.values];
  }
  if (r.kind === 'state') {
    if (item.widget.format === 'base-ten-build') {
      const pieces = piecesOf(r.value);
      return pieces ? [piecesValue(pieces)] : null;
    }
    return VALUE_STATE_FORMATS.has(item.widget.format) && typeof r.value.value === 'number'
      ? [r.value.value]
      : null;
  }
  const n = responseNumber(r);
  return n === null ? null : [n];
}

/**
 * A response of the item's answer kind that gives `values` instead of the asked numbers. Null when
 * nothing changed (the item cannot discriminate) or a pick does not show the rewritten number.
 */
export function responseWith(item: GeneratedItem, values: number[]): ResponseValue | null {
  const want = askedNumbers(item);
  if (!want || want.length !== values.length || values.every((v, i) => v === want[i])) return null;
  const a = item.answer;
  switch (a.kind) {
    case 'number':
      return { kind: 'number', value: values[0] as number };
    case 'numbers':
      if (item.widget.format === 'expanded-form' && item.widget.mode === 'build') {
        return { kind: 'numbers', values: placeTerms(values[0] as number) };
      }
      return { kind: 'numbers', values: [...values] };
    case 'choice': {
      if (item.widget.format !== 'numeral-pick') return null;
      const id = numberOptionId(values[0] as number);
      return item.widget.options.some((o) => o.id === id) ? { kind: 'choice', id } : null;
    }
    case 'state': {
      const w = item.widget;
      const v = values[0] as number;
      if (w.format === 'base-ten-build') {
        // The pieces of the rewritten number (14 built as 4 tens 1 one).
        const d = (k: number) => Math.floor(v / 10 ** k) % 10;
        return {
          kind: 'state',
          value: {
            ...(v >= 1000 ? { thousands: Math.floor(v / 1000) } : {}),
            ...(v >= 100 ? { hundreds: d(2) } : {}),
            tens: d(1),
            ones: d(0),
          },
        };
      }
      // Built right, then the rewritten number typed (thenAsk).
      const shown = Number(a.target.n ?? a.target.total);
      if (w.format === 'tenframe-fill' && Number.isInteger(shown)) {
        const cells = Array.from({ length: w.frames }, (_, f) =>
          Array.from({ length: w.size }, (_, i) => (f * w.size + i < shown ? 1 : 0)),
        );
        return { kind: 'state', value: { cells, value: v } };
      }
      if (w.format === 'rekenrek' && Number.isInteger(shown)) {
        return {
          kind: 'state',
          value: { rows: [Math.min(10, shown), Math.max(0, shown - 10)], value: v },
        };
      }
      if (item.widget.format !== 'number-line-jump') return null;
      const t = a.target as { start: number; target: number; allowedJumps: number[] };
      const jump = t.allowedJumps[0] as number;
      const hops = Math.round((t.target - t.start) / jump);
      return {
        kind: 'state',
        value: { jumps: new Array<number>(hops).fill(jump), value: values[0] as number },
      };
    }
    default:
      return null;
  }
}

/**
 * Whether a response gives the asked numbers with at least one rewritten as `isSlip(asked, given)`
 * allows, and every other number right.
 */
export function rewritesAsked(
  item: GeneratedItem,
  r: ResponseValue,
  isSlip: (asked: number, given: number) => boolean,
): boolean {
  const want = askedNumbers(item);
  const got = givenNumbers(item, r);
  if (!want || !got || want.length !== got.length) return false;
  let slipped = 0;
  for (const [i, v] of want.entries()) {
    const g = got[i] as number;
    if (g === v) continue;
    if (!isSlip(v, g)) return false;
    slipped += 1;
  }
  return slipped > 0;
}
