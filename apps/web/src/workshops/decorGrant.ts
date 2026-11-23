// A request's decor (`reward.decor`, 04 §6.3) is earned when the request is played to its end.
// The grant is written with the request's end: `finish()` of the runner a workshop's screen is
// given writes `request.completed` and then, for a request that ended `complete`, one grant per
// piece, before the screen shows its summary. So closing or reloading the app on the summary
// loses nothing. `finish()` is asked more than once (the summary, Home, the screen going away):
// each piece is granted once. A write that fails is not kept: the next `finish()` asks the
// runner again and grants the pieces that are still owed. Framework-free.

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
  let finishing: Promise<S> | null = null;
  const finish = () => {
    finishing ??= (async () => {
      const summary = await runner.finish();
      if (summary.reason !== 'complete') return summary;
      // In order, from the first piece not granted yet.
      while (earned.length < decor.length) {
        const id = decor[earned.length] as DecorId;
        await grant(id);
        earned.push(id);
      }
      return summary;
    })().catch((error) => {
      finishing = null;
      throw error;
    });
    return finishing;
  };
  return { runner: { ...runner, finish }, earned: () => [...earned] };
}

/** One grant per runner: the screen and the clean-up after it finish through the same one. */
const grants = new WeakMap<object, DecorGrant<unknown>>();

/** `withDecorGrant`, made once for a runner however often it is asked for. */
export function decorGrantFor<S extends { reason: string }, R extends Finishes<S> & object>(
  runner: R,
  decor: readonly DecorId[],
  grant: (id: DecorId) => Promise<unknown>,
): DecorGrant<R> {
  let made = grants.get(runner) as DecorGrant<R> | undefined;
  if (!made) {
    made = withDecorGrant<S, R>(runner, decor, grant);
    grants.set(runner, made as DecorGrant<unknown>);
  }
  return made;
}
