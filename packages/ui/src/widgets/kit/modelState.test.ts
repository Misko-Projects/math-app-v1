import { describe, expect, it } from 'vitest';
import { commitWaiters } from './modelState';

describe('modelState: waits for a render', () => {
  it('a commit settles every wait once, in order', () => {
    const w = commitWaiters();
    const seen: number[] = [];
    w.push(() => seen.push(1));
    w.push(() => seen.push(2));
    w.flush();
    w.flush();
    expect(seen).toEqual([1, 2]);
    expect(w.size).toBe(0);
  });

  it('unmounting settles a wait whose render never commits, so a demo cannot hang', async () => {
    const w = commitWaiters();
    const played = new Promise<string>((resolve) => w.push(() => resolve('settled')));
    expect(w.size).toBe(1);
    w.settle();
    await expect(played).resolves.toBe('settled');
  });

  it('a wait asked for after the widget is gone settles at once', async () => {
    const w = commitWaiters();
    w.settle();
    const late = new Promise<string>((resolve) => w.push(() => resolve('settled')));
    expect(w.size).toBe(0);
    await expect(late).resolves.toBe('settled');
    // Mounted again (an effect that React re-runs), waits wait for a commit again.
    w.open();
    let done = false;
    w.push(() => {
      done = true;
    });
    expect(done).toBe(false);
    w.flush();
    expect(done).toBe(true);
  });

  it('a wait queued while settling is kept for the next commit', () => {
    const w = commitWaiters();
    const seen: string[] = [];
    w.push(() => {
      seen.push('first');
      w.push(() => seen.push('second'));
    });
    w.flush();
    expect(seen).toEqual(['first']);
    w.flush();
    expect(seen).toEqual(['first', 'second']);
  });
});
