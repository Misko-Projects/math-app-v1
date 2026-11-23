// The app's side of the workshop module contract (02 §5.6). The runner a workshop gets is the
// app's own TaskRunner, which carries the feedback flow and the lesson player on top of the shared
// contract; what a workshop reports on exit is the request's summary.

import type { WorkshopDefinition, WorkshopProps } from '@number-island/shared';
import type { ComponentType } from 'react';
import type { PierTaskRunner } from '@/runner/TaskRunner';

export interface AppWorkshopProps extends WorkshopProps {
  runner: PierTaskRunner;
}

export type AppWorkshop = WorkshopDefinition<ComponentType<AppWorkshopProps>>;
