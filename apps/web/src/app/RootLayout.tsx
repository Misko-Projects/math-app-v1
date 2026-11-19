import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ParentProvider, useParentGate } from '@/parent/ParentContext';

/**
 * Routes where an unlocked parent gate may stay unlocked: the parent area itself and the setup
 * wizard (which unlocks it to finish the first run). Anywhere else is a child's screen.
 */
const PARENT_ROUTES = /^\/(parent|setup)(\/|$)/;

export function RootLayout() {
  return (
    <ParentProvider>
      <ParentGateGuard />
      <div className="relative min-h-dvh overflow-hidden bg-sand font-body text-ink">
        <Outlet />
      </div>
    </ParentProvider>
  );
}

/**
 * Leaving the parent area by any route (Back to the island, the browser's Back, a link) locks
 * the gate, so the browser's Forward or Back can't reopen a parent page during a child's play.
 */
function ParentGateGuard() {
  const { pathname } = useLocation();
  const gate = useParentGate();
  useEffect(() => {
    if (!PARENT_ROUTES.test(pathname) && gate.isUnlocked()) gate.lock();
  }, [pathname, gate]);
  return null;
}
