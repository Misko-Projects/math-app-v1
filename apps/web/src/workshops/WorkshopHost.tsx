// The workshop host at `/play/:childId/workshop/:workshopId` (02 §5.6): the request the child
// picked on the island, played by its workshop's module with the app's TaskRunner. The module's
// screen loads on demand (it is fetched ahead, when the app is idle and again when the island
// shows its requests). However the child leaves, the request is finished first and what it
// produced goes back to the island with it.

import type { ChildProfile, PlannedRequest, WorkshopExitReason } from '@number-island/shared';
import {
  type ComponentType,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { ChildUi, useAppServices } from '@/app/AppServices';
import { recordDiagnostic } from '@/app/diagnostics';
import type { ActiveSession } from '@/app/session/SessionController';
import { useSession } from '@/app/session/SessionProvider';
import { useProfiles } from '@/data/hooks';
import { useHub } from '@/island/hub';
import type { PierTaskRunner, RequestSummary } from '@/runner/TaskRunner';
import { useRequestRunner } from '@/runner/useRequestRunner';
import { type DecorGrant, decorGrantFor } from './decorGrant';
import { workshopFor } from './registry';
import type { AppWorkshop, AppWorkshopProps } from './types';

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** One lazy component per workshop module, so its screen keeps its state across renders. */
const screens = new Map<AppWorkshop, ComponentType<AppWorkshopProps>>();
function screenOf(workshop: AppWorkshop): ComponentType<AppWorkshopProps> {
  let screen = screens.get(workshop);
  if (!screen) {
    screen = lazy(workshop.load);
    screens.set(workshop, screen);
  }
  return screen;
}

export function WorkshopHost() {
  const { childId = '', workshopId = '' } = useParams();
  const profiles = useProfiles();
  const { session } = useSession();
  const { picked } = useHub();
  if (profiles === undefined) return null;
  const child = profiles.find((p) => sameId(p.id, childId));
  // Only a started session plays here, like the island.
  if (!child || session === null || !sameId(session.childId, childId)) {
    return <Navigate to="/" replace />;
  }
  // A request is picked on the island: a typed URL or a reload has none.
  if (picked === null || picked.workshopId !== workshopId) {
    return <Navigate to={`/play/${child.id}`} replace />;
  }
  return (
    <ChildUi ageMode={child.grade === 'K' ? 'k' : 'g1-up'}>
      <HostedRequest key={picked.id} child={child} session={session} request={picked} />
    </ChildUi>
  );
}

interface HostedProps {
  child: ChildProfile;
  session: ActiveSession;
  request: PlannedRequest;
}

/**
 * One screen plays a picked request. The browser's Forward into a request the child has left,
 * while it is still being written, is not a second start: that visit goes back to the island.
 */
function HostedRequest(props: HostedProps) {
  const { claim } = useHub();
  // The ref outlives StrictMode's simulated remount: the same screen claims the same request.
  const me = useRef({});
  const [mine, setMine] = useState<boolean | null>(null);
  const requestId = props.request.id;
  useEffect(() => setMine(claim(requestId, me.current)), [claim, requestId]);
  if (mine === null) return null;
  if (!mine) return <Navigate to={`/play/${props.child.id}`} replace />;
  return <OwnedRequest {...props} />;
}

function OwnedRequest({ child, session, request }: HostedProps) {
  const { audio, store } = useAppServices();
  const navigate = useNavigate();
  const { complete } = useHub();
  // The runner the screen plays with: its `finish()` also writes the decor a request played to
  // its end earns (`decorGrant.ts`), so the family owns it as soon as the request is over.
  const granting = useRef<DecorGrant<PierTaskRunner> | null>(null);
  // Called once the screen is gone and the request is over, whichever way the child left. A
  // request that could not be written made nothing.
  const finished = useCallback(
    (summary: RequestSummary | null) => {
      void (async () => {
        // The grants of a request that ended complete are in before the island shows them.
        await granting.current?.runner.finish().catch((e) => recordDiagnostic('decor.earned', e));
        complete({
          requestId: request.id,
          materials: summary?.materials ?? {},
          decor: granting.current?.earned() ?? [],
        });
      })();
    },
    [complete, request.id],
  );
  const base = useRequestRunner(child, session, request, finished);
  const runner = useMemo(() => {
    if (!base) return null;
    // One per runner (`decorGrantFor`), so a second render gets the same one.
    granting.current = decorGrantFor<RequestSummary, PierTaskRunner>(
      base,
      request.reward.decor ?? [],
      (id) => store.append('collection.unlocked', { kind: 'decor', id }, { childId: child.id }),
    );
    return granting.current.runner;
  }, [base, request, store, child.id]);
  const Screen = screenOf(workshopFor(request.workshopId));
  const exit = useCallback(
    (_reason: WorkshopExitReason) => navigate(`/play/${child.id}`, { replace: true }),
    [navigate, child.id],
  );
  return (
    <Suspense fallback={null}>
      {runner && (
        <Screen
          request={request}
          runner={runner}
          avatar={child.avatar}
          audio={audio}
          onExit={exit}
        />
      )}
    </Suspense>
  );
}
