// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createAnswerTime } from './answerTime';

describe('the answering time of a try', () => {
  it('keeps the time spent before a hint the child asked for, and leaves the hint out', () => {
    let now = 1000;
    const time = createAnswerTime(() => now);
    time.start();
    now += 30_000;
    time.pause();
    // The hint plays for eight seconds.
    now += 8_000;
    expect(time.elapsed()).toBe(30_000);
    time.resume();
    now += 2_000;
    expect(time.elapsed()).toBe(32_000);
  });

  it('starts from zero for the next try', () => {
    let now = 0;
    const time = createAnswerTime(() => now);
    time.start();
    now += 5_000;
    time.pause();
    time.start();
    now += 700;
    expect(time.elapsed()).toBe(700);
  });

  it('resuming a running try changes nothing', () => {
    let now = 0;
    const time = createAnswerTime(() => now);
    time.start();
    now += 1_000;
    time.resume();
    now += 1_000;
    expect(time.elapsed()).toBe(2_000);
  });
});
