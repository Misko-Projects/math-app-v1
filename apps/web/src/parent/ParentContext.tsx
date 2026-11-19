import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useAppServices } from '@/app/AppServices';
import { createParentApi, type ParentApi } from './api';
import { createParentGate, type ParentGate } from './gate';

interface ParentContextValue {
  api: ParentApi;
  gate: ParentGate;
}

const ParentContext = createContext<ParentContextValue | null>(null);

/**
 * One parent gate for the whole app (so the 10-minute session survives navigation) and the
 * parent API client. Tests pass their own `api`.
 */
export function ParentProvider({ children, api }: { children: ReactNode; api?: ParentApi }) {
  const { store, fetch } = useAppServices();
  const value = useMemo(() => {
    const client = api ?? createParentApi(fetch);
    return { api: client, gate: createParentGate({ store, api: client }) };
  }, [api, store, fetch]);
  useEffect(() => () => value.gate.dispose(), [value]);
  return <ParentContext.Provider value={value}>{children}</ParentContext.Provider>;
}

/** Component tests: a parent context with a given API (and gate) and no booted app. */
export function ParentContextForTests({
  api,
  gate,
  children,
}: {
  api: ParentApi;
  gate?: ParentGate;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ api, gate: gate ?? (null as unknown as ParentGate) }),
    [api, gate],
  );
  return <ParentContext.Provider value={value}>{children}</ParentContext.Provider>;
}

function useParentContext(): ParentContextValue {
  const value = useContext(ParentContext);
  if (!value) throw new Error('parent hooks must be used inside <ParentProvider>');
  return value;
}

export const useParentApi = (): ParentApi => useParentContext().api;
export const useParentGate = (): ParentGate => useParentContext().gate;

export function useParentUnlocked(): boolean {
  const gate = useParentGate();
  return useSyncExternalStore(gate.subscribe, gate.isUnlocked, gate.isUnlocked);
}
