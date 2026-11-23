// A request's decor (`reward.decor`, 04 §6.3) is earned when the request is played to its end.
// The grant is written with the request's end: `finish()` of the runner a workshop's screen is
// given writes `request.completed` and then, for a request that ended `complete`, one grant per
// piece, before the screen shows its summary. So closing or reloading the app on the summary
// loses nothing. `finish()` is asked more than once (the summary, Home, the screen going away):
// the grants are written once. Framework-free.

import type { DecorId } from '@number-island/shared';

interface Finishes<S> {
  finish(): Promise<S>;
}

export interface DecorGrant<R> {
  /** The runner to give the screen: its `finish()` also writes the grants. */
  runner: R;
  /** The pieces granted so far. */
  earned(): DecorId[];
}

export function withDecorGrant<S extends { reason: string }, R extends Finishes<S>>(
  runner: R,
  decor: readonly DecorId[],
  grant: (id: DecorId) => Promise<unknown>,
): DecorGrant<R> {
  const earned: DecorId[] = [];
  let finished: Promise<S> | null = null;
  const finish = () => {
    finished ??= runner.finish().then(async (summary) => {
      if (summary.reason !== 'complete') return summary;
      for (const id of decor) {
        await grant(id);
        earned.push(id);
      }
      return summary;
    });
    return finished;
  };
  return { runner: { ...runner, finish }, earned: () => [...earned] };
}
