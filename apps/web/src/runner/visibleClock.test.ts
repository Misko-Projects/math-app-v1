// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createVisibleClock } from './visibleClock';

function fakePage() {
  let t = 1000;
  let visible = true;
  const listeners = new Set<() => void>();
  return {
    env: {
      now: () => t,
      visible: () => visible,
      subscribe: (fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
    advance: (ms: number) => {
      t += ms;
    },
    show: (v: boolean) => {
      visible = v;
      for (const fn of listeners) fn();
    },
    listeners,
  };
}

describe('createVisibleClock', () => {
  it('counts only the time the page is visible', () => {
    const page = fakePage();
    const clock = createVisibleClock(page.env);
    page.advance(2000);
    expect(clock.now()).toBe(2000);
    // The tablet sleeps for ten minutes in the middle of an item.
    page.show(false);
    page.advance(600_000);
    expect(clock.now()).toBe(2000);
    page.show(true);
    page.advance(500);
    expect(clock.now()).toBe(2500);
    clock.dispose();
    expect(page.listeners.size).toBe(0);
  });

  it('starts paused on a hidden page', () => {
    const page = fakePage();
    page.show(false);
    const clock = createVisibleClock(page.env);
    page.advance(5000);
    expect(clock.now()).toBe(0);
    page.show(true);
    page.advance(300);
    expect(clock.now()).toBe(300);
  });
});
