// React bindings for the SessionController. The controller itself is one of the booted services
// (`AppServices.session`, disposed with them), so StrictMode's double effects can't make two.
// On mount the provider closes sessions this device left open (a closed tab, a flat battery),
// and again every two minutes while one is left whose checkpoint may still be live.

import type { ChildId } from '@number-island/shared';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { recordDiagnostic } from '../diagnostics';
import {
  type ActiveSession,
  LIVE_CHECKPOINT_MS,
  type SessionController,
  type SessionSnapshot,
  type WindDownReason,
} from './SessionController';

/** How long after a sweep the next one runs: just past the time a checkpoint takes to go quiet. */
export const FOLLOW_UP_SWEEP_MS = LIVE_CHECKPOINT_MS + 1_000;

const SessionContext = createContext<SessionController | null>(null);

export function SessionProvider({
  controller,
  children,
}: {
  controller: SessionController;
  children: ReactNode;
}) {
  useEffect(() => {
    // A session that died just before this boot still has a fresh checkpoint, so the first sweep
    // leaves it open to watch. While a sweep leaves any such session, another follows, timed
    // from the moment that sweep finished (however long its read took), with no visit needed.
    // The same goes for a sweep that was skipped because another tab is playing: that tab may
    // die without an end, and this one may stay on the picker.
    let again: number | undefined;
    let unmounted = false;
    const sweep = () => {
      controller.sweep().then(
        ({ watching, skipped }) => {
          if (unmounted || (watching === 0 && !skipped)) return;
          again = window.setTimeout(sweep, FOLLOW_UP_SWEEP_MS);
        },
        (e) => {
          recordDiagnostic('session.abandoned', e);
          // A sweep that failed (the log couldn't be read) decided nothing either.
          if (!unmounted) again = window.setTimeout(sweep, FOLLOW_UP_SWEEP_MS);
        },
      );
    };
    sweep();
    return () => {
      unmounted = true;
      window.clearTimeout(again);
    };
  }, [controller]);
  return <SessionContext.Provider value={controller}>{children}</SessionContext.Provider>;
}

export function useSessionController(): SessionController {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession must be used inside <SessionProvider>');
  return c;
}

export interface UseSession {
  /** The running session, or null. */
  session: ActiveSession | null;
  /** Set once the session should wind down (04 §6.4), with why. */
  windDown: WindDownReason | null;
  controller: SessionController;
  start: SessionController['start'];
  end: SessionController['end'];
  canStart: SessionController['canStart'];
  recordMath: (ms: number) => void;
  recordItem: () => void;
  /** The wind-down hook: the later TaskRunner finishes the current item, then calls `end`. */
  onWindDown: SessionController['onWindDown'];
}

export function useSession(): UseSession {
  const c = useSessionController();
  const snap: SessionSnapshot = useSyncExternalStore(c.subscribe, c.getSnapshot, c.getSnapshot);
  return useMemo(
    () => ({
      session: snap.status === 'active' ? snap.session : null,
      windDown: snap.status === 'active' ? snap.windDown : null,
      controller: c,
      start: (childId: ChildId, trigger, opts) => c.start(childId, trigger, opts),
      end: (reason) => c.end(reason),
      canStart: (childId: ChildId) => c.canStart(childId),
      recordMath: (ms: number) => c.recordMath(ms),
      recordItem: () => c.recordItem(),
      onWindDown: (listener) => c.onWindDown(listener),
    }),
    [c, snap],
  );
}
