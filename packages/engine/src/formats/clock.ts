// Clock-face arithmetic for the clock formats (clock-set, clock-read; 03 §5.5, U05 #14).
//
// One time drives both hands: `t` is the minutes after 12:00 the face shows (0–719). The hands
// are geared: the minute hand is at 6° a minute, the hour hand at 30° an hour plus 0.5° a minute
// (03 §5.5 "the hour hand moves with the minute hand"), so at 3:30 it is exactly halfway between
// 3 and 4. A time reads back as `{ h, m }` with `h` the hour the short hand has reached (1–12)
// and `m` the minute the long hand points at (the #84 convention, engine README "Time formats").

import { faceMinutes } from '../check/state/clock.time';

export { faceMinutes };

/** Minutes on a 12-hour face. */
export const FACE_MINUTES = 720;

/** `t` folded onto the face (0–719). */
export const onFace = (t: number): number =>
  ((Math.round(t) % FACE_MINUTES) + FACE_MINUTES) % FACE_MINUTES;

/** The `{ h, m }` a face time reads as: h 1–12 (12:xx, not 0:xx), m 0–59. */
export function timeOf(t: number): { h: number; m: number } {
  const f = onFace(t);
  const h = Math.floor(f / 60);
  return { h: h === 0 ? 12 : h, m: f % 60 };
}

/** The hour hand's angle in degrees clockwise from 12: 30° an hour plus 0.5° a minute. */
export const hourAngle = (t: number): number => (onFace(t) * 0.5) % 360;

/** The minute hand's angle in degrees clockwise from 12: 6° a minute. */
export const minuteAngle = (t: number): number => (onFace(t) % 60) * 6;

/** A minute snapped to the nearest multiple of `precision` (0–59; 60 wraps to 0). */
export function snapMinute(m: number, precision: number): number {
  const p = precision > 0 ? precision : 1;
  return (((Math.round(m / p) * p) % 60) + 60) % 60;
}

/** A face time snapped to `precision` minutes. */
export const snapTime = (t: number, precision: number): number => {
  const p = precision > 0 ? precision : 1;
  return onFace(Math.round(t / p) * p);
};

/**
 * Turns the minute hand from the minute of `t` to `to` (already snapped): clockwise (`cw`),
 * anticlockwise (`ccw`) or, by default, the shorter way (half an hour goes forward). Crossing 12
 * moves the hour hand on to the next hour, or back to the one before, as a geared clock does.
 */
export function turnMinuteHand(t: number, to: number, dir?: 'cw' | 'ccw'): number {
  const m0 = onFace(t) % 60;
  const fwd = (((to - m0) % 60) + 60) % 60;
  const d =
    dir === 'cw' ? fwd : dir === 'ccw' ? (fwd === 0 ? 0 : fwd - 60) : fwd <= 30 ? fwd : fwd - 60;
  return onFace(t + d);
}

/** The 03 §5.5 precision features of a minute: the finest step it needs (as time.clock, #84). */
export function precisionFeatures(m: number): Record<string, number> {
  const f = {
    'precision.half': 0,
    'precision.quarter': 0,
    'precision.five': 0,
    'precision.one': 0,
  };
  if (m === 0) return f;
  if (m === 30) f['precision.half'] = 1;
  else if (m % 15 === 0) f['precision.quarter'] = 1;
  else if (m % 5 === 0) f['precision.five'] = 1;
  else f['precision.one'] = 1;
  return f;
}

/** Whether `{ h, m }` is a time a config can hold: whole h 0–23, whole m 0–59. */
export const isTime = (v: { h: number; m: number }): boolean =>
  Number.isInteger(v.h) && Number.isInteger(v.m) && v.h >= 0 && v.h <= 23 && v.m >= 0 && v.m <= 59;

/** "h:mm", how a time is printed (03 §8.4 `time`). */
export const clockText = (h: number, m: number): string => `${h}:${String(m).padStart(2, '0')}`;
