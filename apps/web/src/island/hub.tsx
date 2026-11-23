// The hub's state for one stay in the play area (`PlayLayout`), which outlives moving between
// the island and a workshop: the request the child picked, what the last request produced
// (shown on the island as it arrives in the Storehouse), whether the session's warmup was played,
// and how long the child has been on the island (the non-math time, 05 §8).

import type { DecorId, PlannedRequest, Recipe } from '@number-island/shared';
import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from 'react';

export interface RequestResult {
  requestId: string;
  /** What the request produced: already in the Storehouse (`material.produced`). */
  materials: Recipe;
  /** The decor a completed request earned (`reward.decor`): already in the collection. */
  decor: DecorId[];
}

/**
 * The session's time outside workshops, on the session's clock (its active milliseconds): the
 * island tells it when the child arrives and leaves.
 */
export interface NonMathTime {
  arrive(activeMs: number): void;
  leave(activeMs: number): void;
  /** Milliseconds on the island so far, the present stay included. */
  ms(activeMs: number): number;
}

export function createNonMathTime(): NonMathTime {
  let banked = 0;
  let since: number | null = null;
  const stay = (activeMs: number) => (since === null ? 0 : Math.max(0, activeMs - since));
  return {
    arrive(activeMs) {
      since ??= activeMs;
    },
    leave(activeMs) {
      banked += stay(activeMs);
      since = null;
    },
    ms: (activeMs) => banked + stay(activeMs),
  };
}

export interface Hub {
  /** The request being played, from the tap until its result is in. */
  picked: PlannedRequest | null;
  pick(request: PlannedRequest): void;
  /**
   * One screen plays a picked request: the first `owner` to claim it. A later one (the browser's
   * Forward into a request that is still being written) is refused, so it never starts again.
   */
  claim(requestId: string, owner: object): boolean;
  /** The last finished request, until the island has shown it. */
  result: RequestResult | null;
  /** The picked request is over (however the child left it). */
  complete(result: RequestResult): void;
  dismissResult(): void;
  /** A request of this stay started with the plan's warmup (04 §6.1). */
  warmedUp: boolean;
  markWarmedUp(): void;
  nonMath: NonMathTime;
}

const HubContext = createContext<Hub | null>(null);

export function HubProvider({ children }: { children?: ReactNode }) {
  const [picked, setPicked] = useState<PlannedRequest | null>(null);
  const [result, setResult] = useState<RequestResult | null>(null);
  const [warmedUp, setWarmedUp] = useState(false);
  const owner = useRef<{ requestId: string; by: object } | null>(null);
  const nonMath = useRef<NonMathTime | null>(null);
  nonMath.current ??= createNonMathTime();
  const time = nonMath.current;
  const hub = useMemo<Hub>(
    () => ({
      picked,
      result,
      pick(request) {
        owner.current = null;
        setResult(null);
        setPicked(request);
      },
      claim(requestId, by) {
        if (picked?.id !== requestId) return false;
        owner.current ??= { requestId, by };
        return owner.current.requestId === requestId && owner.current.by === by;
      },
      complete(done) {
        setPicked((now) => (now?.id === done.requestId ? null : now));
        setResult(done);
      },
      dismissResult: () => setResult(null),
      warmedUp,
      markWarmedUp: () => setWarmedUp(true),
      nonMath: time,
    }),
    [picked, result, warmedUp, time],
  );
  return <HubContext.Provider value={hub}>{children}</HubContext.Provider>;
}

export function useHub(): Hub {
  const hub = useContext(HubContext);
  if (!hub) throw new Error('useHub: no HubProvider (the play layout provides it)');
  return hub;
}
