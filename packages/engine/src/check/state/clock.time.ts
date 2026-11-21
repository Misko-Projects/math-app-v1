// clock.time `{ h, m }` (03 §5.5 clock-set): the time the child set equals the target modulo 12
// hours. Response `{ h, m }`, the time the geared hands show: `h` the hour the short hand has
// reached (1–12; 0 reads as 12), `m` the minute the long hand points at (0–59). K01 convention
// (engine README): any `h` that is the same hour on the face counts (12 and 0, 3 and 15), and a
// minute outside 0–59 is not a clock reading.
import { num, type StateChecker } from './types';

/** The minutes after 12:00 a clock face shows for `{h, m}` (0–719), or null when not a time. */
export function faceMinutes(h: number, m: number): number | null {
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return null;
  return (h % 12) * 60 + m;
}

export const clockTime: StateChecker = {
  id: 'clock.time',
  check(target, value) {
    const th = num(target.h);
    const tm = num(target.m);
    const h = num(value.h);
    const m = num(value.m);
    if (th === undefined || tm === undefined || h === undefined || m === undefined) return false;
    const want = faceMinutes(th, tm);
    const got = faceMinutes(h, m);
    return want !== null && got !== null && want === got;
  },
};
