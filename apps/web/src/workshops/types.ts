// The app's side of the workshop module contract (02 §5.6). The runner a workshop gets is the
// app's own TaskRunner, which carries the feedback flow and the lesson player on top of the shared
// contract; what a workshop reports on exit is the request's summary. A workshop that lays a
// road stone itself (Road Crew) hands the host that write, and the island shows its result.

import type { ChildId, WorkshopDefinition, WorkshopProps } from '@number-island/shared';
import type { ComponentType } from 'react';
import type { PierTaskRunner } from '@/runner/TaskRunner';

export interface AppWorkshopProps extends WorkshopProps {
  runner: PierTaskRunner;
  /** Who is playing: what the workshop writes besides the runner's events is theirs. */
  childId: ChildId;
  /**
   * The request is laying a road stone (`road.extended`): the write, resolving to the stone's
   * number, or null when none was laid. The host waits for it however the child leaves.
   */
  onRoadStone(laying: Promise<number | null>): void;
}

export type AppWorkshop = WorkshopDefinition<ComponentType<AppWorkshopProps>>;
