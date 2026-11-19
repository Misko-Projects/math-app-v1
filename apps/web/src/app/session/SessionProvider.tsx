// React bindings for the SessionController. The controller itself is one of the booted services
// (`AppServices.session`, disposed with them), so StrictMode's double effects can't make two.
// On mount the provider closes sessions this device left open (a closed tab, a flat battery).

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
import type {
  ActiveSession,
  SessionController,
  SessionSnapshot,
  WindDownReason,
} from './SessionController';

const SessionContext = createContext<SessionController | null>(null);

export function SessionProvider({
  controller,
  children,
}: {
  controller: SessionController;
  children: ReactNode;
}) {
  useEffect(() => {
    void controller.closeAbandoned().catch((e) => recordDiagnostic('session.abandoned', e));
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
