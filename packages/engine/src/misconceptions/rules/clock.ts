// Shared reading of clock items for the time misconceptions (03 §7.2 MC.hour-minute-swap,
// MC.hour-hand-next). A buggy clock reading `{h, m}` becomes the response of the item's own kind:
// numbers [h, m] on a clock-read digital pad, the state `{h, m}` on a clock-set (the hands set to
// that time), or the option `opt-<h>` on an hour pick (TIM.09, which asks only the hour). The
// prediction is null when it equals the answer (modulo 12 hours), when the pick has no such option,
// or when the clock-set's minute hand cannot reach the minute.

import type { GeneratedItem, ResponseValue } from '@number-island/shared';
import { faceMinutes } from '../../check/state/clock.time';
import { numberOptionId } from '../../formats/numeral-pick';
import { sameResponse } from '../rules';

export interface ClockItem {
  h: number;
  m: number;
  kind: 'set' | 'pad' | 'hour-pick';
}

/** The time a clock item shows or asks for, and how it is answered; null for other items. */
export function clockItem(item: GeneratedItem): ClockItem | null {
  const w = item.widget;
  if (w.format === 'clock-set' && item.answer.kind === 'state') {
    return { h: w.target.h, m: w.target.m, kind: 'set' };
  }
  if (w.format === 'clock-read' && !w.ampm) {
    if (w.input === 'digital-pad' && item.answer.kind === 'numbers') {
      return { h: w.time.h, m: w.time.m, kind: 'pad' };
    }
    if (w.input === 'pick' && item.answer.kind === 'choice') {
      return { h: w.time.h, m: w.time.m, kind: 'hour-pick' };
    }
  }
  return null;
}

/** The buggy reading `{h, m}` as a response to this item, or null when it cannot discriminate. */
export function clockResponse(
  item: GeneratedItem,
  c: ClockItem,
  buggy: { h: number; m: number },
): ResponseValue | null {
  if (c.kind === 'hour-pick') {
    if (buggy.h % 12 === c.h % 12) return null;
    const id = numberOptionId(buggy.h);
    const w = item.widget;
    const has = w.format === 'clock-read' && (w.options ?? []).some((o) => o.id === id);
    return has ? { kind: 'choice', id } : null;
  }
  if (faceMinutes(buggy.h, buggy.m) === faceMinutes(c.h, c.m)) return null;
  if (c.kind === 'pad') return { kind: 'numbers', values: [buggy.h, buggy.m] };
  const w = item.widget;
  if (w.format !== 'clock-set' || buggy.m % w.precision !== 0) return null;
  return { kind: 'state', value: { h: buggy.h, m: buggy.m } };
}

/** Whether `r` is the predicted buggy response (the same face time for numbers and states). */
export function matchesPrediction(predicted: ResponseValue | null, r: ResponseValue): boolean {
  if (!predicted) return false;
  if (predicted.kind === 'choice') return r.kind === 'choice' && r.id === predicted.id;
  const pair = (v: ResponseValue): [number, number] | null => {
    if (v.kind === 'numbers' && v.values.length === 2) return v.values as [number, number];
    if (v.kind === 'state' && typeof v.value.h === 'number' && typeof v.value.m === 'number')
      return [v.value.h, v.value.m];
    return null;
  };
  const a = pair(predicted);
  const b = pair(r);
  if (!a || !b || predicted.kind !== r.kind) return sameResponse(predicted, r);
  const fa = faceMinutes(a[0], a[1]);
  return fa !== null && fa === faceMinutes(b[0], b[1]);
}
