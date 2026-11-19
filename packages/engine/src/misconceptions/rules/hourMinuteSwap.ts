// MC.hour-minute-swap (03 §7.2): reads 3:00 as 12:15, the hands swapped. The long hand is read
// as the hour (the number it points at: 12 at :00, m ÷ 5 otherwise) and the short hand as the
// minutes (5 · (h mod 12)). Answer: r = [that hour, those minutes] on a clock-read pad; state: the
// hands set swapped on a clock-set; on the TIM.09 hour pick, the option of the number the long
// hand points at.

import type { GeneratedItem } from '@number-island/shared';
import { minuteHandNumber, nextHour } from '../../generators/time/face';
import type { MisconceptionRule } from '../rules';
import { clockItem, clockResponse, matchesPrediction } from './clock';

function predict(item: GeneratedItem) {
  const c = clockItem(item);
  if (!c) return null;
  const h = minuteHandNumber(c.m);
  if (h === null) return null;
  // On the hour pick, 5:30 read by the long hand (6) is also the next hour (MC.hour-hand-next):
  // the option cannot tell the two apart, so this rule does not claim it.
  if (c.kind === 'hour-pick' && c.m >= 30 && h === nextHour(c.h)) return null;
  return clockResponse(item, c, { h, m: 5 * (c.h % 12) });
}

export const hourMinuteSwap: MisconceptionRule = {
  id: 'hourMinuteSwap',
  kind: 'answer',
  predict,
  match: (item, r) => matchesPrediction(predict(item), r),
};
