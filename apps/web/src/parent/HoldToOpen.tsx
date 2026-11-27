// The parent-gate entry (06 §3): press and hold for 2 s. A ring fills while it is held; letting
// go early empties it. Short taps never open it (06 §4: no long-press is ever required of a
// child, and this one keeps children out). Keyboard: hold Enter or Space.

import { useCallback, useEffect, useRef, useState } from 'react';
import { GateIcon } from './GateIcon';
import { PARENT_GATE_HOLD_MS } from './gate';

export interface HoldToOpenProps {
  onOpen: () => void;
  holdMs?: number;
  /** `corner`: the small entry on child screens; `large`: the gate screen's own button. */
  size?: 'corner' | 'large';
  className?: string;
}

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;

export function HoldToOpen({
  onOpen,
  holdMs = PARENT_GATE_HOLD_MS,
  size = 'corner',
  className,
}: HoldToOpenProps) {
  const [progress, setProgress] = useState(0);
  const [hint, setHint] = useState(false);
  const started = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const done = useRef(false);

  const stopFrames = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const tick = useCallback(() => {
    if (started.current === null) return;
    const p = Math.min(1, (performance.now() - started.current) / holdMs);
    setProgress(p);
    if (p >= 1) {
      started.current = null;
      stopFrames();
      done.current = true;
      setHint(false);
      onOpen();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  }, [holdMs, onOpen, stopFrames]);

  const begin = useCallback(() => {
    if (started.current !== null) return;
    done.current = false;
    started.current = performance.now();
    setHint(false);
    stopFrames();
    frame.current = requestAnimationFrame(tick);
  }, [tick, stopFrames]);

  const cancel = useCallback(() => {
    const wasHolding = started.current !== null;
    started.current = null;
    stopFrames();
    setProgress(0);
    if (wasHolding && !done.current) setHint(true);
  }, [stopFrames]);

  useEffect(() => stopFrames, [stopFrames]);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), 4000);
    return () => clearTimeout(t);
  }, [hint]);

  const large = size === 'large';
  return (
    <div
      className={['relative inline-flex flex-col items-center', className]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        aria-label="Grown-ups: press and hold for 2 seconds"
        aria-describedby={hint ? 'parent-gate-hint' : undefined}
        data-progress={progress.toFixed(2)}
        className={[
          'relative grid touch-none select-none place-items-center rounded-full bg-paper ring-2 ring-sand-deep',
          'shadow-ledge focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ink',
          large ? 'size-28' : 'size-16',
        ].join(' ')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          begin();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault();
            begin();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === 'Enter' || e.key === ' ') cancel();
        }}
        onBlur={cancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg
          viewBox="0 0 68 68"
          className="absolute inset-0 size-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="34"
            cy="34"
            r={RING_R}
            className="fill-none stroke-sand-shadow"
            strokeWidth="5"
          />
          <circle
            cx="34"
            cy="34"
            r={RING_R}
            className="fill-none stroke-sea-deep"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - progress)}
            opacity={progress > 0 ? 1 : 0}
          />
        </svg>
        <GateIcon className={large ? 'size-14' : 'size-8'} />
      </button>
      {hint ? (
        <p
          id="parent-gate-hint"
          role="status"
          className={[
            'w-max max-w-[16rem] rounded-2xl bg-ink px-3 py-2 text-center text-base font-bold text-cloud shadow-lg',
            // On the gate screen the hint takes its own space, so it never covers other controls.
            large ? 'mt-4' : 'absolute right-0 bottom-full z-10 mb-3',
          ].join(' ')}
        >
          Grown-ups: keep holding for 2 seconds
        </p>
      ) : null}
    </div>
  );
}
