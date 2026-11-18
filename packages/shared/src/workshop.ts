import type { AudioManager } from './audio';
import type { AvatarSpec } from './avatar';
import type { BuildingId, MaterialId, WorkshopId } from './ids';
import type { ItemFormat } from './items';
import type { PlannedRequest } from './planner';
import type { TaskRunner } from './runner';
import type { StrandId } from './strands';

// 02 §5.6 workshop module contract (`apps/web/src/workshops/<id>/index.ts`). Types only.

/**
 * `shared` must not import React (02 §2), so the lazily loaded component type is a parameter.
 * apps/web uses `WorkshopDefinition<React.ComponentType<WorkshopProps>>`.
 */
export interface WorkshopDefinition<TComponent = unknown> {
  id: WorkshopId;
  name: string;
  formats: ItemFormat[]; // which item formats this workshop can host
  strands: StrandId[]; // for planner affinity and island layout
  building: BuildingId; // art, footprint, levels and unlock rule come from GameData (§5.8)
  produces: MaterialId[]; // [] for Puzzle Tower (decor rewards); Practice Pier produces whatever the request asks for
  load: () => Promise<{ default: TComponent }>; // lazy
}

export type WorkshopExitReason = 'completed' | 'child-exit' | 'wind-down';

export interface WorkshopProps {
  request: PlannedRequest;
  runner: TaskRunner; // provided by the app; wraps engine + logging + AI feedback
  avatar: AvatarSpec;
  audio: AudioManager;
  onExit(reason: 'completed' | 'child-exit' | 'wind-down'): void;
}
