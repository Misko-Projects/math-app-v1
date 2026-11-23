// Road Crew as a workshop module (02 §5.6; 05 §4 W1). The request is played on the shared
// workshop screen (`../play/RequestPlay`: the runner, the feedback flow and the lessons, in-world),
// with the crew's scene: every right first answer makes a stone, which drops into the row at the
// bottom, and at the end the stones parade.
//
// The road physically extends: the parade of a request that made at least one stone lays the
// road's next stone with one of them (`paradeStone.ts`), and the island counts on to it when the
// child is back. A child who leaves before the end (Home) keeps the stones made; the road waits
// for a request played to its parade.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppServices } from '@/app/AppServices';
import type { RequestSummary } from '@/runner/TaskRunner';
import { useRaise } from '@/runner/useRequestRunner';
import { type PlayScene, RequestPlay } from '../play/RequestPlay';
import type { AppWorkshopProps } from '../types';
import { layParadeStone, stonesMade } from './paradeStone';
import { RoadCrewBottom, StoneParade } from './RoadCrewScene';

export default function RoadCrewWorkshop({ runner, childId, onExit }: AppWorkshopProps) {
  const { store, content } = useAppServices();
  const raise = useRaise();
  const { gameData } = content.store;
  const [laid, setLaid] = useState<number | null | undefined>(undefined);
  // One stone per request, however often the parade renders.
  const laying = useRef<Promise<number | null> | null>(null);
  const lay = useCallback(
    (summary: RequestSummary) => {
      laying.current ??= layParadeStone(store, childId, gameData, summary.materials);
      laying.current.then(setLaid, raise);
    },
    [store, childId, gameData, raise],
  );

  const scene = useMemo<PlayScene>(
    () => ({
      workshop: 'road-crew',
      done: 'ui.roadcrew.done',
      bottom: (p) => <RoadCrewBottom done={p.done} total={p.total} made={p.materialEarned} />,
      parade: (summary) => <Parade summary={summary} laid={laid} onShown={lay} />,
    }),
    [laid, lay],
  );

  return (
    <RequestPlay
      runner={runner}
      scene={scene}
      onLeave={(summary) => {
        const reason =
          summary.reason === 'wind-down'
            ? 'wind-down'
            : summary.reason === 'child-exit'
              ? 'child-exit'
              : 'completed';
        // The stone being laid is written before the island shows the road.
        (laying.current ?? Promise.resolve(null)).then(
          (to) => onExit(reason, to === null ? undefined : { road: to }),
          raise,
        );
      }}
    />
  );
}

/** The parade on screen: the stone is laid when it starts. */
function Parade({
  summary,
  laid,
  onShown,
}: {
  summary: RequestSummary;
  laid: number | null | undefined;
  onShown: (summary: RequestSummary) => void;
}) {
  useEffect(() => onShown(summary), [onShown, summary]);
  return <StoneParade made={stonesMade(summary.materials)} laid={laid} />;
}
