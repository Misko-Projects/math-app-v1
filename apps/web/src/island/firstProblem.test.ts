// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createFirstProblemTimer } from './firstProblem';

describe('tap → first problem (05 §2)', () => {
  it('measures from the tap to the first task, once per tap, on the clock it is given', () => {
    let t = 1000;
    const timer = createFirstProblemTimer(() => t);
    expect(timer.lastMs()).toBeNull();
    // A task shown with no tap before it (the content browser) measures nothing.
    timer.shown();
    expect(timer.lastMs()).toBeNull();
    timer.tapped();
    t += 730;
    timer.shown();
    expect(timer.lastMs()).toBe(730);
    // The request's later tasks do not count again.
    t += 5000;
    timer.shown();
    expect(timer.lastMs()).toBe(730);
    timer.tapped();
    t += 90;
    timer.shown();
    expect(timer.lastMs()).toBe(90);
  });
});
