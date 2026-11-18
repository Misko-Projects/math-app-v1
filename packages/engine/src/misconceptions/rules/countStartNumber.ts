// MC.count-start-number (03 §7.2): counts the start number when counting on, so 5 + 3 → "5, 6, 7"
// → 7. Answer: `+` and r = v − 1, or `-` and r = v + 1, on count-on/back items (family plus1,
// plus2, count-up, any with a ≥ 3, or a number-line-jump item). State: landing = target − 1 (or
// target + 1 when counting back).

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { numberOptionId, responseNumber } from '../../formats/numeral-pick';
import type { MisconceptionRule } from '../rules';

const COUNT_ON_FAMILIES = new Set(['plus1', 'plus2', 'count-up']);

function countsOn(item: GeneratedItem): boolean {
  const p = item.params;
  if (p.unknown !== undefined && p.unknown !== 'result') return false;
  if (p.op !== '+' && p.op !== '-') return false;
  if (item.format === 'number-line-jump') return true;
  if (typeof p.family === 'string' && COUNT_ON_FAMILIES.has(p.family)) return true;
  return p.family === 'any' && typeof p.a === 'number' && p.a >= 3;
}

/** A correctly filled ten-frame for an add item: a counters of colour a, then b of colour b. */
function correctCells(item: GeneratedItem): number[][] {
  const w = item.widget;
  if (w.format !== 'tenframe-fill') return [];
  const a = w.a ?? 0;
  const total = typeof item.params.result === 'number' ? item.params.result : a;
  return Array.from({ length: w.frames }, (_, f) =>
    Array.from({ length: w.size }, (_, i) => {
      const k = f * w.size + i;
      return k < a ? 1 : k < total ? 2 : 0;
    }),
  );
}

/** The response a child gives who counts the start number. */
function buggyNumber(item: GeneratedItem): number | null {
  const v = item.params.result;
  if (typeof v !== 'number') return null;
  const r = item.params.op === '+' ? v - 1 : v + 1;
  return r >= 0 && r !== v ? r : null;
}

export const countStartNumber: MisconceptionRule = {
  id: 'countStartNumber',
  kind: 'answer',
  predict(item): ResponseValue | null {
    if (!countsOn(item)) return null;
    const r = buggyNumber(item);
    if (r === null) return null;
    switch (item.answer.kind) {
      case 'number':
        return { kind: 'number', value: r };
      case 'choice': {
        if (item.widget.format !== 'numeral-pick') return null;
        const id = numberOptionId(r);
        return item.widget.options.some((o) => o.id === id) ? { kind: 'choice', id } : null;
      }
      case 'state': {
        // Ten-frame with a typed total: the counters are right, the counted-on total is one short.
        if (
          item.widget.format === 'tenframe-fill' &&
          item.widget.goal === 'add' &&
          item.widget.thenAsk === 'total'
        ) {
          const target = item.answer.target;
          if (typeof target.value !== 'number') return null;
          return { kind: 'state', value: { cells: correctCells(item), value: r } };
        }
        if (item.answer.checker !== 'jumps.reach' || item.widget.format !== 'number-line-jump') {
          return null;
        }
        const start = item.widget.start;
        const step = item.params.op === '+' ? 1 : -1;
        const hops = Math.abs(r - start);
        if (hops === 0 || !item.widget.allowedJumps.includes(step)) return null;
        return {
          kind: 'state',
          value: {
            jumps: new Array<number>(hops).fill(step),
            ...(item.widget.thenAsk ? { value: r } : {}),
          },
        };
      }
      default:
        return null;
    }
  },
  match(item, r) {
    if (!countsOn(item)) return false;
    const buggy = buggyNumber(item);
    if (buggy === null) return false;
    if (r.kind === 'state') {
      // Same scope as predict: an add ten-frame with a typed total (03 §7.1: match ⇔ predict).
      if (item.widget.format === 'tenframe-fill') {
        return (
          item.widget.goal === 'add' && item.widget.thenAsk === 'total' && r.value.value === buggy
        );
      }
      if (item.widget.format !== 'number-line-jump') return false;
      const jumps = r.value.jumps;
      if (!Array.isArray(jumps) || !jumps.every((j) => typeof j === 'number')) return false;
      const landing = item.widget.start + (jumps as number[]).reduce((a, b) => a + b, 0);
      return landing === buggy;
    }
    return responseNumber(r) === buggy;
  },
};
