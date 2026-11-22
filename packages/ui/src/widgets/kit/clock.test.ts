import { clockText, hourAngle, minuteAngle, timeOf } from '@number-island/engine';
import { describe, expect, it } from 'vitest';
import { CLOCK, clockHandAt, faceTime, HAND_GRAB, polarPoint } from './ClockView';

describe('clock picture, digital reading and time agree (U05 #14)', () => {
  it('every time of day draws one face time, and the readout says what the hands show', () => {
    for (let h = 0; h <= 23; h++) {
      for (let m = 0; m <= 59; m++) {
        const t = faceTime(h, m);
        // The long hand points at the minute; the short hand is geared: 30° an hour, 0.5° a minute.
        expect(minuteAngle(t)).toBe(m * 6);
        expect(hourAngle(t)).toBe((h % 12) * 30 + m * 0.5);
        // The readout beside a face (ClockView, clock-set's cards) prints the hour the short hand
        // has reached, 1–12, never 0 or 13–23.
        const shown = timeOf(t);
        expect(shown).toEqual({ h: h % 12 === 0 ? 12 : h % 12, m });
        expect(clockText(shown.h, shown.m)).toBe(
          `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`,
        );
      }
    }
  });

  it('noon and midnight are 12:00 with both hands straight up', () => {
    for (const h of [0, 12]) {
      const t = faceTime(h, 0);
      expect(hourAngle(t)).toBe(0);
      expect(minuteAngle(t)).toBe(0);
      expect(clockText(timeOf(t).h, timeOf(t).m)).toBe('12:00');
    }
  });

  it('half past and quarter to: the short hand sits between its numbers', () => {
    // Half past 3: exactly halfway from 3 (90°) to 4 (120°).
    expect(hourAngle(faceTime(3, 30))).toBe(105);
    // Quarter to 3 (2:45): three quarters of the way from 2 (60°) to 3 (90°), and it reads 2:45.
    expect(hourAngle(faceTime(2, 45))).toBe(82.5);
    expect(timeOf(faceTime(2, 45))).toEqual({ h: 2, m: 45 });
    // A minute before the hour the short hand is not yet on the next number.
    expect(hourAngle(faceTime(2, 59))).toBeLessThan(90);
    expect(timeOf(faceTime(2, 59)).h).toBe(2);
  });
});

describe('clockHandAt: a press takes hold of the hand under it', () => {
  const at = (r: number, deg: number, t: number) => {
    const p = polarPoint(r, deg);
    return clockHandAt(p.x, p.y, t);
  };
  // 3:00: the long hand points up (0°), the short hand at 90°.
  const three = faceTime(3, 0);

  it('holds the long hand anywhere along it, even near the middle', () => {
    for (const r of [20, 30, 44, 60, CLOCK.minuteLen]) expect(at(r, 0, three)).toBe('minute');
  });

  it('holds the short hand anywhere along it, to its tip', () => {
    for (const r of [20, 30, CLOCK.hourLen]) expect(at(r, 90, three)).toBe('hour');
    // Just past its tip, out of the middle zone, is the long hand's ring again.
    expect(at(CLOCK.hourLen * 1.15 + HAND_GRAB + 1, 90, three)).toBe('minute');
  });

  it('off the hands, the middle is the short hand and the ring the long one', () => {
    expect(at(30, 200, three)).toBe('hour');
    expect(at(70, 200, three)).toBe('minute');
  });

  it('where the hands lie together, the place decides (never a coin toss)', () => {
    // By the hub both hands are under the finger.
    expect(at(3, 45, three)).toBe('hour');
    // 12:00: one hand over the other. Near the middle the short hand, further out the long one.
    const noon = faceTime(12, 0);
    expect(at(30, 0, noon)).toBe('hour');
    expect(at(70, 0, noon)).toBe('minute');
  });

  it('is decided at every point of the face for every hour and half hour', () => {
    for (let t = 0; t < 720; t += 30) {
      for (let r = 0; r <= CLOCK.r; r += 6) {
        for (let deg = 0; deg < 360; deg += 15) {
          expect(['hour', 'minute']).toContain(at(r, deg, t));
          // Out by the numbers, beyond the short hand's reach, it is always the long hand.
          if (r > CLOCK.hourLen + HAND_GRAB && r >= CLOCK.hourLen * 1.15) {
            expect(at(r, deg, t)).toBe('minute');
          }
        }
      }
    }
  });
});
