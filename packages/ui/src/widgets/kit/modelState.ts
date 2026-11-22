import type { WidgetAction } from '@number-island/shared';
import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import type { PadKey } from './controls';
import { nextPadKey } from './NumberEntry';
import type { AskPlan } from './twoStep';

/**
 * Promises that wait for a render to be drawn. `flush` settles them after a commit; `settle`
 * settles them when the widget goes away, so a demo that awaits one never hangs (the hook's
 * unmount calls it; a demo then sees its `alive` flag false and stops).
 */
export function commitWaiters() {
  let waiting: (() => void)[] = [];
  const run = () => {
    const now = waiting;
    waiting = [];
    for (const w of now) w();
  };
  return {
    push: (w: () => void) => {
      waiting.push(w);
    },
    flush: run,
    settle: run,
    get size() {
      return waiting.length;
    },
  };
}

/**
 * A widget's state held through its engine model, for widgets whose demo awaits what it shows:
 * `applyOp` resolves once the DOM shows the new state (false when the model changed nothing),
 * `committed` once the pending render is drawn; both also resolve when the widget unmounts. `stateRef` is always the latest state, for
 * handlers that run before the next render.
 */
export function useModelState<S>(initial: () => S, apply: (s: S, a: WidgetAction) => S) {
  const [state, setState] = useState<S>(initial);
  const stateRef = useRef(state);
  const waiters = useRef(commitWaiters()).current;
  useLayoutEffect(() => {
    waiters.flush();
  });
  // A widget that goes away mid-demo (WidgetHost remounts per item) settles every pending wait.
  useLayoutEffect(() => () => waiters.settle(), [waiters]);
  const [, setTick] = useState(0);
  const commit = (next: S) => {
    stateRef.current = next;
    setState(next);
  };
  /** Applies a child's action now; whether the model changed anything. */
  const act = (action: WidgetAction): boolean => {
    const prev = stateRef.current;
    const next = apply(prev, action);
    if (next === prev) return false;
    commit(next);
    return true;
  };
  const applyOp = (action: WidgetAction): Promise<boolean> => {
    const prev = stateRef.current;
    const next = apply(prev, action);
    if (next === prev) return Promise.resolve(false);
    return new Promise((resolve) => {
      waiters.push(() => resolve(true));
      commit(next);
    });
  };
  const committed = () =>
    new Promise<void>((resolve) => {
      waiters.push(resolve);
      setTick((n) => n + 1);
    });
  return { state, stateRef, commit, act, applyOp, committed };
}

/** How long a demo shows the numeral card it picks, and each pad key it presses. */
export const DEMO_PICK_MS = 500;
export const DEMO_KEY_MS = 340;

/**
 * A demo enters `v` the way the planned answer control does: the numeral card (or the stepper),
 * or the pad's keys one by one. `set` stores the value; `highlight` lights the card or key.
 */
export async function demoEnterAnswer(
  v: number,
  o: {
    plan: AskPlan;
    valueRef: RefObject<number | null>;
    set: (value: number | null) => void;
    highlight: (key: number | PadKey | null) => void;
    pause: (ms: number) => Promise<void>;
    alive: RefObject<boolean>;
  },
): Promise<void> {
  const want = Math.max(0, Math.trunc(v));
  if (o.plan.stepper || o.plan.entry?.kind === 'tray') {
    o.highlight(want);
    await o.pause(DEMO_PICK_MS);
    if (!o.alive.current) return;
    o.set(want);
    return;
  }
  o.set(null);
  for (let guard = 0; guard < 8; guard += 1) {
    const key = nextPadKey(want, o.valueRef.current);
    if (key === null || key === 'back' || key === '.') break;
    o.highlight(key);
    await o.pause(DEMO_KEY_MS);
    if (!o.alive.current) return;
    o.set(Number(`${o.valueRef.current ?? ''}${key}`));
  }
  o.highlight(null);
  await o.pause(DEMO_KEY_MS);
}
