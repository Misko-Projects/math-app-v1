// The workshop host at `/play/:childId/workshop/:workshopId` (02 §5.6): the request the child
// picked on the island, played by its workshop's module with the app's TaskRunner. The module's
// screen loads on demand (it is fetched ahead, when the app is idle and again when the island
// shows its requests). However the child leaves, the request is finished first and what it
// produced goes back to the island with it.

import type { ChildProfile, PlannedRequest, WorkshopExitReason } from '@number-island/shared';
import { type ComponentType, lazy, Suspense, useCallback } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { ChildUi, useAppServices } from '@/app/AppServices';
import type { ActiveSession } from '@/app/session/SessionController';
import { useSession } from '@/app/session/SessionProvider';
import { useProfiles } from '@/data/hooks';
import { useHub } from '@/island/hub';
import type { RequestSummary } from '@/runner/TaskRunner';
import { useRequestRunner } from '@/runner/useRequestRunner';
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

function HostedRequest({
  child,
  session,
  request,
}: {
  child: ChildProfile;
  session: ActiveSession;
  request: PlannedRequest;
}) {
  const { audio } = useAppServices();
  const navigate = useNavigate();
  const { complete } = useHub();
  // Called once the screen is gone and the request is written, whichever way the child left.
  const finished = useCallback(
    (summary: RequestSummary) => complete({ requestId: request.id, materials: summary.materials }),
    [complete, request.id],
  );
  const runner = useRequestRunner(child, session, request, finished);
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
