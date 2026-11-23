// The app's TaskRunner for one request on screen (02 §5.6: the app owns the runner, a workshop
// only renders). One runner per mounted request: the request is accepted (and its event written)
// once, and it is finished however the child leaves (Home, the browser's back button, or before
// the runner was ready).

import type { ChildProfile, PlannedRequest } from '@number-island/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppServices } from '@/app/AppServices';
import { recordDiagnostic } from '@/app/diagnostics';
import type { ActiveSession } from '@/app/session/SessionController';
import { useSession } from '@/app/session/SessionProvider';
import { pierPlayable } from '@/workshops/practice-pier/pierRequest';
import { childContext } from './childContext';
import { remediationQueue } from './remediationQueue';
import type { PierTaskRunner, RequestSummary } from './TaskRunner';

/** The runner's code loads on demand (02 §6); the island fetches it ahead with its requests. */
export const loadRunner = () => import('./TaskRunner');

/** Throws `error` from render, so the route's error screen shows it (never a silent stall). */
export function useRaise(): (error: unknown) => void {
  const [, set] = useState<null>(null);
  return useCallback((error: unknown) => {
    set(() => {
      throw error;
    });
  }, []);
}

/**
 * The runner of `request`, or null until it is ready. The request of the first render is played.
 * `onFinished` is called once the screen is gone and the request is over: with its summary, or
 * with null when it could not be written (the error is in the diagnostics).
 */
export function useRequestRunner(
  child: ChildProfile,
  session: ActiveSession,
  request: PlannedRequest,
  onFinished?: (summary: RequestSummary | null) => void,
): PierTaskRunner | null {
  const { store, content } = useAppServices();
  const { controller } = useSession();
  const raise = useRaise();
  const [runner, setRunner] = useState<PierTaskRunner | null>(null);
  // The ref outlives StrictMode's simulated remount, so the request is accepted once.
  const starting = useRef<Promise<PierTaskRunner> | null>(null);
  useEffect(() => {
    let alive = true;
    starting.current ??= (async () => {
      const [engine, { createTaskRunner }] = await Promise.all([
        import('@number-island/engine'),
        loadRunner(),
      ]);
      const ctx = childContext(child, await store.childSettings(child.id));
      const budgetMs = session.budgetMinutes * 60_000;
      return createTaskRunner({
        engine,
        store,
        graph: content.store.graph,
        child: ctx,
        request,
        hosts: pierPlayable,
        misconceptions: content.misconceptions,
        queueRemediation: (r) => remediationQueue.add(child.id, r),
        session: {
          sessionId: session.sessionId,
          budgetMs,
          elapsedMs: () => controller.activeMs(),
          windingDown: () => {
            const snap = controller.getSnapshot();
            return snap.status === 'active' && snap.windDown !== null;
          },
          recordMath: (ms) => controller.recordMath(ms),
          recordItem: () => controller.recordItem(),
        },
      });
    })();
    starting.current.then((r) => alive && setRunner(r), raise);
    return () => {
      alive = false;
    };
  }, [child, session, request, store, content, controller, raise]);

  // StrictMode's simulated unmount is followed at once by a remount; a real one is not.
  const mounted = useRef(false);
  const finished = useRef(onFinished);
  finished.current = onFinished;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (mounted.current) return;
        void starting.current
          ?.then((r) => r.finish())
          .then(
            (summary) => finished.current?.(summary),
            (e) => {
              recordDiagnostic('pier.finish', e);
              finished.current?.(null);
            },
          );
      }, 0);
    };
  }, []);
  return runner;
}
