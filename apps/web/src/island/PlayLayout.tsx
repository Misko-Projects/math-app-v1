// The play area's layout route (`/play/:childId/*`): the island and the workshops render inside
// it, so moving between them keeps the session and the hub's state, and leaving the play area
// ends the session.

import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { recordDiagnostic } from '@/app/diagnostics';
import type { SessionController } from '@/app/session/SessionController';
import { useSession } from '@/app/session/SessionProvider';
import { HubProvider } from './hub';

export function PlayLayout() {
  const { session, controller } = useSession();
  useEndOnLeave(controller, session?.sessionId ?? '');
  return (
    <HubProvider>
      <Outlet />
    </HubProvider>
  );
}

/** Ends the running session when the page goes away mid-session (the browser's back button). */
export function useEndOnLeave(controller: SessionController, sessionId: string) {
  useEffect(() => {
    mountedIds.add(sessionId);
    return () => {
      mountedIds.delete(sessionId);
      // StrictMode's simulated unmount is followed at once by a remount; a real one is not.
      setTimeout(() => {
        if (mountedIds.has(sessionId)) return;
        const snap = controller.getSnapshot();
        if (snap.status === 'active' && snap.session.sessionId === sessionId) {
          void controller.end('child-exit').catch((e) => recordDiagnostic('session.end', e));
        }
      }, 0);
    };
  }, [controller, sessionId]);
}

/** Sessions whose home is mounted right now (StrictMode remounts re-add theirs). */
const mountedIds = new Set<string>();
