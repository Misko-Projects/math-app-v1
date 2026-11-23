// The app's side of the workshop module contract (02 §5.6). The runner a workshop gets is the
// app's own TaskRunner, which carries the feedback flow and the lesson player on top of the shared
// contract; what a workshop reports on exit is the request's summary. A workshop that built on
// the island itself says so on exit (Road Crew's road stone), and the island shows it.

import type {
  ChildId,
  WorkshopDefinition,
  WorkshopExitReason,
  WorkshopProps,
} from '@number-island/shared';
import type { ComponentType } from 'react';
import type { PierTaskRunner } from '@/runner/TaskRunner';

export interface AppWorkshopProps extends WorkshopProps {
  runner: PierTaskRunner;
  /** Who is playing: what the workshop writes besides the runner's events is theirs. */
  childId: ChildId;
  /** `built.road`: the number of the road stone this request laid (`road.extended`). */
  onExit(reason: WorkshopExitReason, built?: { road: number }): void;
}

export type AppWorkshop = WorkshopDefinition<ComponentType<AppWorkshopProps>>;
