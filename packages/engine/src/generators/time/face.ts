// Clock-face arithmetic shared by time.clock and the time misconception rules (kept free of
// imports, so the rules do not depend on the generator module).

/** The hour after `h` on the face (12 → 1). */
export const nextHour = (h: number): number => (h % 12) + 1;

/** The hour before `h` on the face (1 → 12). */
export const prevHour = (h: number): number => ((h + 10) % 12) + 1;

/** "h:mm", the value of a `time` slot (03 §8.3). */
export const timeText = (h: number, m: number): string => `${h}:${String(m).padStart(2, '0')}`;

/** The number the long hand points at, read as an hour (MC.hour-minute-swap): 12 at :00. */
export const minuteHandNumber = (m: number): number | null =>
  m === 0 ? 12 : m % 5 === 0 ? m / 5 : null;
