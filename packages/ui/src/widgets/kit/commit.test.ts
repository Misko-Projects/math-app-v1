import { describe, expect, it, vi } from 'vitest';
import { createCommitBarrier } from './commit';

describe('commit barrier (demo play waits for its commit)', () => {
  it('resolves a request once a commit carrying its number lands', async () => {
    const bump = vi.fn();
    const b = createCommitBarrier(bump);
    let done = false;
    const p = b.request().then(() => {
      done = true;
    });
    expect(bump).toHaveBeenCalledWith(1);
    b.committed(0);
    await Promise.resolve();
    expect(done).toBe(false);
    b.committed(1);
    await p;
    expect(done).toBe(true);
  });

  it('after unmount a request resolves at once and sets no state (PR #93 F2)', async () => {
    const bump = vi.fn();
    const b = createCommitBarrier(bump);
    const pending = b.request();
    b.unmount();
    await pending;
    bump.mockClear();
    await expect(b.request()).resolves.toBeUndefined();
    expect(bump).not.toHaveBeenCalled();
  });
});
