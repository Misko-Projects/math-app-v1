// The hub's state for one stay in the play area (`PlayLayout`), which outlives moving between
// the island and a workshop: the request the child picked, and what the last request produced
// (shown on the island as it arrives in the Storehouse).

import type { PlannedRequest, Recipe } from '@number-island/shared';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

export interface RequestResult {
  requestId: string;
  /** What the request produced: already in the Storehouse (`material.produced`). */
  materials: Recipe;
}

export interface Hub {
  /** The request being played, from the tap until its result is in. */
  picked: PlannedRequest | null;
  pick(request: PlannedRequest): void;
  /** The last finished request, until the island has shown it. */
  result: RequestResult | null;
  /** The picked request is over (however the child left it). */
  complete(result: RequestResult): void;
  dismissResult(): void;
}

const HubContext = createContext<Hub | null>(null);

export function HubProvider({ children }: { children?: ReactNode }) {
  const [picked, setPicked] = useState<PlannedRequest | null>(null);
  const [result, setResult] = useState<RequestResult | null>(null);
  const hub = useMemo<Hub>(
    () => ({
      picked,
      result,
      pick(request) {
        setResult(null);
        setPicked(request);
      },
      complete(done) {
        setPicked((now) => (now?.id === done.requestId ? null : now));
        setResult(done);
      },
      dismissResult: () => setResult(null),
    }),
    [picked, result],
  );
  return <HubContext.Provider value={hub}>{children}</HubContext.Provider>;
}

export function useHub(): Hub {
  const hub = useContext(HubContext);
  if (!hub) throw new Error('useHub: no HubProvider (the play layout provides it)');
  return hub;
}
