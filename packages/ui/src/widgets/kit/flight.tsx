import { type ReactNode, type RefObject, useCallback, useState } from 'react';
import { useReducedMotion } from '../../preferences/UiProvider';
import { wait } from '../demo';
import './kit.css';

/**
 * Demo-mode flights (03 §6.3): one object glides from where it is drawn to where it lands, as in
 * the sample widget. The flying copy is positioned inside the widget root (which must be
 * `position: relative`), so a transformed ancestor never throws it off. With reduced motion
 * `fly` resolves at once and the widget just commits the new state.
 */

export const FLY_MS = 480;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Flight {
  node: ReactNode;
  from: Box;
  to: Box;
  moving: boolean;
  ms: number;
}

export function useFlight(rootRef: RefObject<HTMLElement | null>) {
  const reduced = useReducedMotion();
  const [flight, setFlight] = useState<Flight | null>(null);

  const fly = useCallback(
    async (from: DOMRect | null, to: DOMRect | null, node: ReactNode, ms = FLY_MS) => {
      const root = rootRef.current?.getBoundingClientRect();
      if (reduced || !root || !from || !to) return;
      const rel = (r: DOMRect): Box => ({
        left: r.left - root.left,
        top: r.top - root.top,
        width: r.width,
        height: r.height,
      });
      setFlight({ node, from: rel(from), to: rel(to), moving: false, ms });
      await wait(30);
      setFlight((f) => (f ? { ...f, moving: true } : f));
      await wait(ms);
      setFlight(null);
    },
    [reduced, rootRef],
  );

  const box = flight ? (flight.moving ? flight.to : flight.from) : null;
  const layer =
    flight && box ? (
      <div
        className="ni-flight"
        aria-hidden="true"
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          transitionDuration: `${flight.ms}ms`,
        }}
      >
        {flight.node}
      </div>
    ) : null;

  return { fly, layer, flying: flight !== null };
}
