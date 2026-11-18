// Shared by the counting answer rules that rewrite the asked numbers (decadeTransition,
// teenReversal): read the numbers an item asks for and a response gives, in the same shape, and
// turn rewritten numbers back into a response of the item's answer kind.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { numberOptionId, responseNumber } from '../../formats/numeral-pick';

/**
 * The numbers an item asks the child to give: a number answer, an `opt-<n>` pick, a typed list
 * (missing numbers on a number pad or hundred chart, in answer order), or the typed landing of a
 * one-hop jump (`goal: next`). A land-on target is given in the prompt, not asked, so it is null,
 * like every other answer shape.
 */
export function askedNumbers(item: GeneratedItem): number[] | null {
  const a = item.answer;
  switch (a.kind) {
    case 'number':
      return [a.value];
    case 'numbers':
      // Typed lists only: an `order` answer rearranges given numbers, so none can be rewritten.
      return item.widget.format === 'number-pad' || item.widget.format === 'hundred-chart'
        ? [...a.values]
        : null;
    case 'choice': {
      const n = responseNumber({ kind: 'choice', id: a.id });
      return n === null ? null : [n];
    }
    case 'state':
      return item.widget.format === 'number-line-jump' && typeof a.target.value === 'number'
        ? [a.target.value]
        : null;
    default:
      return null;
  }
}

/** The numbers a response gives, in the shape `askedNumbers` reads. */
export function givenNumbers(item: GeneratedItem, r: ResponseValue): number[] | null {
  if (r.kind === 'numbers') return [...r.values];
  if (r.kind === 'state') {
    return item.widget.format === 'number-line-jump' && typeof r.value.value === 'number'
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
      return { kind: 'numbers', values: [...values] };
    case 'choice': {
      if (item.widget.format !== 'numeral-pick') return null;
      const id = numberOptionId(values[0] as number);
      return item.widget.options.some((o) => o.id === id) ? { kind: 'choice', id } : null;
    }
    case 'state': {
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
