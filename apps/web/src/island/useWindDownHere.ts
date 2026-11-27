// The wind-down on a screen of the child's route where no item is ever in progress (the island,
// the guide chooser): when the session's budget, the daily cap or quiet hours end the session
// (04 §6.4), end it now and hand over to the sunset.

import { useEffect, useRef } from 'react';
import { recordDiagnostic } from '@/app/diagnostics';
import type { WindDownReason } from '@/app/session/SessionController';
import { useSession } from '@/app/session/SessionProvider';

export function useWindDownHere(onWindDown: (reason: WindDownReason) => void): void {
  const { session, controller, windDown } = useSession();
  const sessionId = session?.sessionId ?? '';
  useEffect(
    () =>
      controller.onWindDown((reason, s) => {
        if (s.sessionId !== sessionId) return;
        onWindDown(reason);
        void controller.end(reason).catch((e) => recordDiagnostic('session.end', e));
      }),
    [controller, sessionId, onWindDown],
  );
  // The signal fires once. When it came while the child was elsewhere (a workshop lets the current
  // item finish, 04 §6.4), the session is already winding down when this screen opens.
  const pendingWindDown = useRef(windDown);
  useEffect(() => {
    const reason = pendingWindDown.current;
    if (reason === null || sessionId === '') return;
    pendingWindDown.current = null;
    onWindDown(reason);
    void controller.end(reason).catch((e) => recordDiagnostic('session.end', e));
  }, [controller, sessionId, onWindDown]);
}
