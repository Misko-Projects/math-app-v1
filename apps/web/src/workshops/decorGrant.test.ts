// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decorGrantFor, withDecorGrant } from './decorGrant';

/** A runner whose `finish()` records the order of what is written. */
function runnerThatEnds(reason: string, log: string[]) {
  return {
    progress: () => ({ done: 2, total: 2 }),
    finish: async () => {
      if (!log.includes('request.completed')) log.push('request.completed');
      return { reason, items: 2 };
    },
  };
}

describe('the decor a request earns (04 §6.3)', () => {
  it('is granted when the request is finished, before the summary shows, and only once', async () => {
    const log: string[] = [];
    const base = runnerThatEnds('complete', log);
    const { runner, earned } = withDecorGrant(base, ['star-statue', 'telescope'], async (id) => {
      log.push(`grant:${id}`);
    });
    expect(earned()).toEqual([]);
    // The screen asks for the summary: by the time it has it, the grants are in the log. A
    // reload on the summary therefore loses nothing.
    const summary = await runner.finish();
    expect(summary).toEqual({ reason: 'complete', items: 2 });
    expect(log).toEqual(['request.completed', 'grant:star-statue', 'grant:telescope']);
    expect(earned()).toEqual(['star-statue', 'telescope']);
    // "Okay", Home and the screen going away each finish again: nothing is granted twice.
    await Promise.all([runner.finish(), runner.finish()]);
    expect(log).toEqual(['request.completed', 'grant:star-statue', 'grant:telescope']);
    // The rest of the runner is as it was.
    expect(runner.progress()).toEqual({ done: 2, total: 2 });
  });

  it('a write that fails once is made good by the next finish: nothing is lost or written twice', async () => {
    // The request's own end fails the first time (the runner forgets its failed write).
    const log: string[] = [];
    let baseFails = 1;
    const base = {
      finish: async () => {
        if (baseFails > 0) {
          baseFails -= 1;
          throw new Error('the request could not be written');
        }
        if (!log.includes('request.completed')) log.push('request.completed');
        return { reason: 'complete' };
      },
    };
    // And the second piece's grant fails the first time it is tried.
    let grantFails = 1;
    const { runner, earned } = withDecorGrant(base, ['star-statue', 'telescope'], async (id) => {
      if (id === 'telescope' && grantFails > 0) {
        grantFails -= 1;
        throw new Error('the grant could not be written');
      }
      log.push(`grant:${id}`);
    });
    await expect(runner.finish()).rejects.toThrow('the request could not be written');
    expect(log).toEqual([]);
    await expect(runner.finish()).rejects.toThrow('the grant could not be written');
    expect(log).toEqual(['request.completed', 'grant:star-statue']);
    expect(earned()).toEqual(['star-statue']);
    // The clean-up after the screen's error finishes again: the piece still owed is granted.
    await expect(runner.finish()).resolves.toEqual({ reason: 'complete' });
    expect(log).toEqual(['request.completed', 'grant:star-statue', 'grant:telescope']);
    await runner.finish();
    expect(log).toEqual(['request.completed', 'grant:star-statue', 'grant:telescope']);
    expect(earned()).toEqual(['star-statue', 'telescope']);
  });

  it('one grant per runner: asked for twice (a second render), the same one finishes', async () => {
    const log: string[] = [];
    const base = runnerThatEnds('complete', log);
    const grant = async (id: string) => {
      log.push(`grant:${id}`);
    };
    const first = decorGrantFor(base, ['telescope'], grant);
    const second = decorGrantFor(base, ['telescope'], grant);
    expect(second).toBe(first);
    await Promise.all([first.runner.finish(), second.runner.finish()]);
    expect(log).toEqual(['request.completed', 'grant:telescope']);
    // Another request's runner has its own.
    expect(decorGrantFor(runnerThatEnds('complete', []), ['telescope'], grant)).not.toBe(first);
  });

  it('a request the child left, or one that ended for another reason, earns no decor', async () => {
    for (const reason of ['child-exit', 'wind-down', 'frustration']) {
      const log: string[] = [];
      const { runner, earned } = withDecorGrant(
        runnerThatEnds(reason, log),
        ['telescope'],
        async (id) => {
          log.push(`grant:${id}`);
        },
      );
      await runner.finish();
      expect(log, reason).toEqual(['request.completed']);
      expect(earned(), reason).toEqual([]);
    }
  });
});
