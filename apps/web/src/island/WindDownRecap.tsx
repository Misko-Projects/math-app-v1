// The wind-down recap's pictures (06 §2 "Wind-down"; #22 part 4), loaded with the sunset: what the
// child made in this session as the Storehouse's countable piles, and what the child built as
// the buildings' pictures and the road stones laid. The sunset says it (`recapPhrases`).

import type { GameData } from '@number-island/shared';
import {
  BuildingArtView,
  buildingArtFor,
  materialArtFor,
  useNarrationText,
} from '@number-island/ui';
import { ROAD_MATERIAL } from './building/rules';
import { buildingNameKey, type Recap } from './recap';
import { type PileMode, Storehouse } from './Storehouse';

export default function WindDownRecap({
  recap,
  gameData,
  mode,
}: {
  recap: Recap;
  gameData: Pick<GameData, 'buildings' | 'materials'>;
  mode: PileMode;
}) {
  const text = useNarrationText();
  const buildings = recap.built.flatMap((id) => {
    const def = gameData.buildings.find((b) => b.id === id);
    return def && buildingArtFor(def.art) ? [def] : [];
  });
  const stone = gameData.materials.find((m) => m.id === ROAD_MATERIAL);
  const Stone = stone ? materialArtFor(stone.art) : undefined;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="recap">
      {Object.keys(recap.made).length > 0 ? (
        <section
          className="flex max-w-[44rem] justify-center"
          aria-label={text('ui.winddown.made')}
          data-testid="recap-made"
        >
          <Storehouse
            gameData={gameData}
            inventory={{ materials: recap.made }}
            mode={mode}
            empty={null}
          />
        </section>
      ) : null}
      {buildings.length > 0 || recap.stones > 0 ? (
        <section aria-label={text('ui.winddown.built')} data-testid="recap-built">
          <ul className="flex flex-wrap items-end justify-center gap-3 rounded-[20px] bg-paper/95 px-4 py-2 ring-4 ring-sand-deep">
            {buildings.map((def) => (
              <li
                key={def.id}
                role="img"
                aria-label={text(buildingNameKey(def.id))}
                data-built={def.id}
              >
                <BuildingArtView
                  id={
                    def.art.replace(/^building\//, '') as Parameters<
                      typeof BuildingArtView
                    >[0]['id']
                  }
                  stage={1}
                  size={120}
                />
              </li>
            ))}
            {stone && Stone && recap.stones > 0 ? (
              <li
                className="flex items-center gap-1"
                role="img"
                aria-label={`${text(stone.name)}: ${recap.stones}`}
                data-built="road"
                data-stones={recap.stones}
              >
                {Array.from({ length: Math.min(recap.stones, 10) }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: stones in a row
                  <Stone key={i} size={40} />
                ))}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
