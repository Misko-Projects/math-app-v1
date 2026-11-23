// The Storehouse (05 §3): each material the family has as countable piles, never a bare number
// for K. Kindergarten sees ten-frames: one frame per ten, the last one part-filled. From grade 1
// the piles are base-ten: a bundle for every ten, the ones loose, and the numeral beside them.
// The family shares one Storehouse (`foldInventory`), so both children see the same piles.

import type { GameData, InventoryState, MaterialId } from '@number-island/shared';
import { type ItemArt, materialArtFor, useNarrationText } from '@number-island/ui';
import type { ReactNode } from 'react';

export type PileMode = 'ten-frames' | 'base-ten';

/** How a count is laid out: full tens and the ones left over. */
export function pileOf(count: number): { tens: number; ones: number } {
  const n = Math.max(0, Math.floor(count));
  return { tens: Math.floor(n / 10), ones: n % 10 };
}

/** The materials the family has, in GameData order, with their counts. */
export function storedMaterials(
  gameData: Pick<GameData, 'materials'>,
  inventory: Pick<InventoryState, 'materials'>,
): { id: MaterialId; name: GameData['materials'][number]['name']; art: string; count: number }[] {
  return gameData.materials
    .map((m) => ({ ...m, count: inventory.materials[m.id] ?? 0 }))
    .filter((m) => m.count > 0);
}

const CELL = 44;

/** One ten-frame (5 × 2) with `filled` of the material in it, filled row by row. */
function TenFrame({ filled, Icon }: { filled: number; Icon: ItemArt }) {
  return (
    <span
      className="grid grid-cols-5 gap-[2px] rounded-[8px] bg-ink/70 p-[3px]"
      data-pile="ten-frame"
      data-filled={filled}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: ten fixed cells
          key={i}
          className="flex items-center justify-center rounded-[4px] bg-paper"
          style={{ width: CELL, height: CELL }}
        >
          {i < filled ? <Icon size={CELL - 4} /> : null}
        </span>
      ))}
    </span>
  );
}

/** A bundle of ten: the material stacked ten high with a band round it. */
function Bundle({ Icon }: { Icon: ItemArt }) {
  return (
    <span
      className="relative flex flex-col-reverse rounded-[8px] bg-sand-deep/60 px-[3px] py-[2px] ring-2 ring-ink/60"
      data-pile="ten"
    >
      {Array.from({ length: 10 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: ten fixed units
        <span key={i} className="-my-[3px] flex" style={{ width: 22, height: 14 }}>
          <Icon size={22} style={{ marginTop: -4 }} />
        </span>
      ))}
      <span className="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 bg-coral" />
    </span>
  );
}

function Pile({ count, mode, Icon }: { count: number; mode: PileMode; Icon: ItemArt }) {
  const { tens, ones } = pileOf(count);
  if (mode === 'ten-frames') {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {Array.from({ length: tens }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: identical full frames
          <TenFrame key={i} filled={10} Icon={Icon} />
        ))}
        {ones > 0 ? <TenFrame filled={ones} Icon={Icon} /> : null}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-end gap-2">
      {Array.from({ length: tens }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical bundles
        <Bundle key={i} Icon={Icon} />
      ))}
      <span className="grid grid-cols-5 gap-[2px]" data-pile="ones" data-count={ones}>
        {Array.from({ length: ones }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: identical loose units
          <Icon key={i} size={CELL} />
        ))}
      </span>
    </span>
  );
}

export function Storehouse({
  gameData,
  inventory,
  mode,
  empty,
}: {
  gameData: Pick<GameData, 'materials'>;
  inventory: Pick<InventoryState, 'materials'>;
  mode: PileMode;
  /** Shown when the family has nothing yet. */
  empty: ReactNode;
}) {
  const text = useNarrationText();
  const stored = storedMaterials(gameData, inventory);
  if (stored.length === 0) return <>{empty}</>;
  return (
    <ul className="flex flex-wrap content-start gap-4" data-testid="storehouse-piles">
      {stored.map((m) => {
        const Icon = materialArtFor(m.art);
        if (!Icon) throw new Error(`Storehouse: no art for ${m.art}`);
        const name = text(m.name);
        return (
          <li
            key={m.id}
            className="flex items-center gap-4 rounded-[20px] bg-paper px-4 py-3 ring-4 ring-sand-deep"
            data-material={m.id}
            data-count={m.count}
            // The picture says how many; the name and the count are the words for it.
            role="img"
            aria-label={`${name}: ${m.count}`}
          >
            <Icon size={56} />
            <Pile count={m.count} mode={mode} Icon={Icon} />
            {mode === 'base-ten' ? (
              <span className="font-display text-[2.25rem] font-bold leading-none text-ink">
                {m.count}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
