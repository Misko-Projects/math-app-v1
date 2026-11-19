// React bindings for the data store: a provider and live hooks over the projection cache, the
// profiles and the settings documents. Each hook re-renders when Dexie sees a write to what it
// read (`useLiveQuery`), and returns `undefined` while its first read is in flight.

import type {
  ChildId,
  ChildProfile,
  CollectionState,
  InventoryState,
  IslandState,
  LearnerState,
  WeeklyGoalState,
} from '@number-island/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, createElement, type ReactNode, useContext } from 'react';
import type { DataStore, SettingsView } from './store';

const DataContext = createContext<DataStore | null>(null);

export function DataProvider({ store, children }: { store: DataStore; children?: ReactNode }) {
  return createElement(DataContext.Provider, { value: store }, children);
}

export function useDataStore(): DataStore {
  const store = useContext(DataContext);
  if (!store) throw new Error('useDataStore needs a <DataProvider>');
  return store;
}

/** The child's cached learner state (`skills:<childId>`); null for an unknown or deleted child. */
export function useSkillStates(childId: ChildId | null): LearnerState | null | undefined {
  const store = useDataStore();
  return useLiveQuery(
    () => (childId === null ? null : store.skillStates(childId)),
    [store, childId],
  );
}

export function useIsland(): IslandState | undefined {
  const store = useDataStore();
  return useLiveQuery(() => store.island(), [store]);
}

export function useInventory(): InventoryState | undefined {
  const store = useDataStore();
  return useLiveQuery(() => store.inventory(), [store]);
}

export function useCollection(): CollectionState | undefined {
  const store = useDataStore();
  return useLiveQuery(() => store.collection(), [store]);
}

export function useGoals(): WeeklyGoalState | undefined {
  const store = useDataStore();
  return useLiveQuery(() => store.goals(), [store]);
}

export function useProfiles(): ChildProfile[] | undefined {
  const store = useDataStore();
  return useLiveQuery(() => store.allProfiles(), [store]);
}

/** Family settings and every live child's settings, with defaults filled (02 §5.9 F4). */
export function useSettings(): SettingsView | undefined {
  const store = useDataStore();
  return useLiveQuery(() => store.settingsView(), [store]);
}
