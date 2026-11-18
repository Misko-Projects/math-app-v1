import type { InteractionEvent } from '@number-island/shared';
import { useCallback, useRef } from 'react';

export type TraceKind = InteractionEvent['t'];

/** Records one interaction-trace event (03 §5.1): what happened and to which element id. */
export type TraceRecorder = (t: TraceKind, target: string) => void;

/**
 * Turns (kind, target) pairs into stamped `InteractionEvent`s for a widget's `onInteract`. `ms` is
 * the time since the widget first rendered (one widget instance shows one item). The trace stays in
 * memory only (03 §5.1).
 */
export function useInteractionTrace(
  onInteract?: (e: InteractionEvent) => void,
  now: () => number = () => performance.now(),
): TraceRecorder {
  const start = useRef<number | null>(null);
  if (start.current === null) start.current = now();
  const latest = useRef({ onInteract, now });
  latest.current = { onInteract, now };
  return useCallback((t, target) => {
    const { onInteract: emit, now: clock } = latest.current;
    if (!emit) return;
    const ms = Math.max(0, Math.round(clock() - (start.current ?? clock())));
    emit({ t, target, ms });
  }, []);
}
