// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createIdleWatch, LONG_IDLE_MS } from './idleWatch';

/** A clock and a timer the test moves by hand; `visible` stops the clock (a tablet asleep). */
function fakeTime() {
  let wall = 0;
  let now = 0;
  let visible = true;
  let timers: { at: number; fn: () => void }[] = [];
  return {
    now: () => now,
    schedule(fn: () => void, ms: number) {
      const timer = { at: wall + ms, fn };
      timers.push(timer);
      return () => {
        timers = timers.filter((t) => t !== timer);
      };
    },
    setVisible(v: boolean) {
      visible = v;
    },
    advance(ms: number) {
      const end = wall + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        if (visible) now += due.at - wall;
        wall = due.at;
        timers = timers.filter((t) => t !== due);
        due.fn();
      }
      if (visible) now += end - wall;
      wall = end;
    },
  };
}

function watched() {
  const time = fakeTime();
  let idles = 0;
  const watch = createIdleWatch({
    now: time.now,
    schedule: time.schedule,
    onIdle: () => {
      idles += 1;
    },
  });
  return { time, watch, idles: () => idles };
}

describe('the long-idle signal', () => {
  it('reports one idle period when 45 s pass without a touch, and not again until a touch', () => {
    const { time, watch, idles } = watched();
    watch.start();
    time.advance(LONG_IDLE_MS - 1);
    expect(idles()).toBe(0);
    time.advance(1);
    expect(idles()).toBe(1);
    time.advance(10 * LONG_IDLE_MS);
    expect(idles()).toBe(1);
    watch.touch();
    time.advance(LONG_IDLE_MS);
    expect(idles()).toBe(2);
  });

  it('a touch starts the period again', () => {
    const { time, watch, idles } = watched();
    watch.start();
    time.advance(40_000);
    watch.touch();
    time.advance(40_000);
    expect(idles()).toBe(0);
    time.advance(5_000);
    expect(idles()).toBe(1);
  });

  it('does not count while no item waits for an answer', () => {
    const { time, watch, idles } = watched();
    watch.start();
    time.advance(30_000);
    watch.stop();
    time.advance(60_000);
    // A touch during feedback does not start a period.
    watch.touch();
    time.advance(60_000);
    expect(idles()).toBe(0);
  });

  it('counts visible time only: a tablet asleep is not an idle child', () => {
    const { time, watch, idles } = watched();
    watch.start();
    time.advance(20_000);
    time.setVisible(false);
    time.advance(120_000);
    expect(idles()).toBe(0);
    time.setVisible(true);
    time.advance(24_999);
    expect(idles()).toBe(0);
    time.advance(1);
    expect(idles()).toBe(1);
  });
});
