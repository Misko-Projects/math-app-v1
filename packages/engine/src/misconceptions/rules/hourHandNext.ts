// MC.hour-hand-next (03 §7.2): reads 2:50 as 3:50. From half past on, the short hand is closer to
// the next number, and the child reads that one: m ≥ 30 and r = [h mod 12 + 1, m] on a clock-read
// pad; state: the clock set an hour on (3:30 for 2:30); on the TIM.09 hour pick, the next hour.

import type { GeneratedItem } from '@number-island/shared';
import { nextHour } from '../../generators/time/face';
import type { MisconceptionRule } from '../rules';
import { clockItem, clockResponse, matchesPrediction } from './clock';

function predict(item: GeneratedItem) {
  const c = clockItem(item);
  if (!c || c.m < 30) return null;
  return clockResponse(item, c, { h: nextHour(c.h), m: c.m });
}

export const hourHandNext: MisconceptionRule = {
  id: 'hourHandNext',
  kind: 'answer',
  predict,
  match: (item, r) => matchesPrediction(predict(item), r),
};
