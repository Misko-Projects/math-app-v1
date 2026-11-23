// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { withDecorGrant } from './decorGrant';

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
