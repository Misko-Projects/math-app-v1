// The decor that stands on the island, drawn inside the island scene (the kit's `DecorPiece`).
// Loaded when the island has decor to show, so the decor art is not in the island's first chunk.

import { DECOR, type DecorId, DecorPiece, decorAnchor } from '@number-island/ui';
import type { DecorItem } from './rules';

const drawn = (id: string): id is DecorId => Object.hasOwn(DECOR, id);

export default function DecorLayer({
  items,
  selected,
}: {
  items: readonly DecorItem[];
  /** The piece in hand, drawn a little see-through while it waits for its new plot. */
  selected: string | null;
}) {
  return (
    <g data-layer="decor">
      {items
        .filter((item) => item.pos !== null)
        .sort(
          (a, b) =>
            (a.pos as [number, number])[1] - (b.pos as [number, number])[1] ||
            (a.pos as [number, number])[0] - (b.pos as [number, number])[0],
        )
        .map((item) => {
          const id = item.def.art.replace(/^decor\//, '');
          if (!drawn(id) || item.pos === null) return null;
          return (
            <g
              key={item.instanceId}
              data-decor-instance={item.instanceId}
              data-plot={`${item.pos[0]},${item.pos[1]}`}
              opacity={selected === item.instanceId ? 0.55 : undefined}
            >
              <DecorPiece id={id} {...decorAnchor(id, item.pos)} />
            </g>
          );
        })}
    </g>
  );
}
