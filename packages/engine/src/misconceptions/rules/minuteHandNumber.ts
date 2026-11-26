// MC.minute-hand-number (03 §7.2): reads the number the long hand points at as the minutes (2:20
// read as 2:04: the hand is on the 4). m mod 5 = 0, m ≥ 10 and r = [h, m ÷ 5] on a clock-read pad;
// state: the long hand set to minute m ÷ 5 (it cannot snap there at precision 5, so no clock-set
// item discriminates); on the TIM.11 match pick, the time h:0(m ÷ 5) when it is an option (it never
// is: the options are multiples of five), so only the pad discriminates.

import type { GeneratedItem } from '@number-island/shared';
import type { MisconceptionRule } from '../rules';
import { clockItem, clockResponse, matchesPrediction } from './clock';

function predict(item: GeneratedItem) {
  const c = clockItem(item);
  if (!c || c.m < 10 || c.m % 5 !== 0) return null;
  return clockResponse(item, c, { h: c.h, m: c.m / 5 });
}

export const minuteHandAsMinutes: MisconceptionRule = {
  id: 'minuteHandNumber',
  kind: 'answer',
  predict,
  match: (item, r) => matchesPrediction(predict(item), r),
};
