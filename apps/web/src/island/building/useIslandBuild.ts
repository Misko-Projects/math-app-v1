// Building on the island (05 §6; #22 part 2): the state of the build sheet, of choosing a plot,
// of the construction step and of the counting walk along the road, and the actions that write.
//
// - Buy a card: an upgrade is written at once; a new building first asks for a plot.
// - A build or an upgrade is in the log before the construction step starts, so leaving during it
//   loses nothing; the step ends on the build clock or when the child skips it.
// - A road stone: written, then the walk counts on along the last stones to the new one, aloud.
// - Unlock rules are family-wide: the island's facts as they are now, and every child's learner
//   state as it was when the island opened.

import { islandFacts, type UnlockFacts } from '@number-island/engine/shell';
import type { ChildProfile, Plot } from '@number-island/shared';
import { useSpeech } from '@number-island/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppServices } from '@/app/AppServices';
import { useInventory, useIsland } from '@/data/hooks';
import { useRaise } from '@/runner/useRequestRunner';
import { layNextStone, placeBuilding, settleResidents, upgradeBuilding } from './actions';
import { buildClock, CONSTRUCTION_MS, COUNT_STEP_MS } from './clock';
import { familyFacts } from './familyFacts';
import {
  type BuildCard,
  buildCards,
  countingWalk,
  nextStone,
  ROAD_MATERIAL,
  ROAD_STONE_COST,
} from './rules';

export interface Construction {
  instanceId: string;
  plot: Plot;
  footprint: readonly [number, number];
}

export function useIslandBuild(child: ChildProfile, onBuilt: () => void) {
  const { store, content, audio } = useAppServices();
  const { say } = useSpeech();
  const raise = useRaise();
  const island = useIsland();
  const inventory = useInventory();
  const { gameData, graph } = content.store;
  const [learners, setLearners] = useState<UnlockFacts | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetUsed, setSheetUsed] = useState(false);
  const [placing, setPlacing] = useState<BuildCard | null>(null);
  const [construction, setConstruction] = useState<Construction | null>(null);
  const [counting, setCounting] = useState<number | null>(null);
  const writing = useRef(false);
  const cancelConstruction = useRef<(() => void) | null>(null);
  const cancelWalk = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cancelConstruction.current?.();
      cancelWalk.current?.();
    },
    [],
  );

  // Every child's learner facts, once per visit to the island.
  useEffect(() => {
    let alive = true;
    (async () => {
      const engine = await import('@number-island/engine');
      const profiles = (await store.allProfiles()).filter((p) => p.deletedAt === undefined);
      const found = await Promise.all(
        profiles.map(async (profile) => ({ profile, state: await store.skillStates(profile.id) })),
      );
      const facts = familyFacts(
        engine,
        graph,
        await store.island(),
        found.flatMap((l) => (l.state ? [{ profile: l.profile, state: l.state }] : [])),
        store.now(),
      );
      if (alive) setLearners(facts);
    })().catch(raise);
    return () => {
      alive = false;
    };
  }, [store, graph, raise]);

  // Residents whose arrival rule holds move in when the island opens, and again once the
  // family's learner facts are read (a skill rule). It also makes good a build that was
  // interrupted before its resident arrived.
  useEffect(() => {
    settleResidents(store, child.id, gameData, learners ?? {}).catch(raise);
  }, [store, child.id, gameData, learners, raise]);

  const cards = useMemo(
    () =>
      island && inventory
        ? buildCards(gameData, island, inventory, { ...learners, ...islandFacts(island) })
        : [],
    [gameData, island, inventory, learners],
  );
  const next = useMemo(() => (island ? nextStone(gameData, island) : null), [gameData, island]);

  const write = useCallback(
    (fn: () => Promise<void>) => {
      if (writing.current) return;
      writing.current = true;
      fn()
        .catch(raise)
        .finally(() => {
          writing.current = false;
        });
    },
    [raise],
  );

  const endConstruction = useCallback(() => {
    cancelConstruction.current?.();
    cancelConstruction.current = null;
    setConstruction(null);
    say('ui.build.done');
  }, [say]);

  const startConstruction = useCallback(
    (c: Construction) => {
      setConstruction(c);
      say('ui.build.working');
      cancelConstruction.current?.();
      cancelConstruction.current = buildClock.current.after(CONSTRUCTION_MS, endConstruction);
      onBuilt();
    },
    [say, endConstruction, onBuilt],
  );

  const buy = useCallback(
    (card: BuildCard) => {
      if (card.state !== 'ready') return;
      setSheetOpen(false);
      if (card.instanceId === null) {
        setPlacing(card);
        say('ui.build.place');
        return;
      }
      write(async () => {
        const r = await upgradeBuilding(store, child.id, gameData, card);
        if (r.ok) startConstruction({ ...r, footprint: card.building.footprint });
        else say('ui.build.short');
      });
    },
    [store, child.id, gameData, say, write, startConstruction],
  );

  const place = useCallback(
    (plot: Plot) => {
      const card = placing;
      if (!card) return;
      write(async () => {
        const r = await placeBuilding(store, child.id, gameData, card, plot);
        setPlacing(null);
        if (r.ok) startConstruction({ ...r, footprint: card.building.footprint });
        else say(r.reason === 'short' ? 'ui.build.short' : 'ui.build.noroom');
      });
    },
    [placing, store, child.id, gameData, say, write, startConstruction],
  );

  const walk = useCallback(
    (stones: readonly number[]) => {
      cancelWalk.current?.();
      // The walk starts now: it replaces whatever is being said (an earlier walk included).
      audio.cancelSpeech();
      let alive = true;
      let cancelStep = () => {};
      cancelWalk.current = () => {
        alive = false;
        cancelStep();
      };
      const step = (i: number) => {
        const n = stones[i];
        if (n === undefined) {
          cancelWalk.current = null;
          setCounting(null);
          return;
        }
        setCounting(n);
        // A stone is the counted one until its step has passed and its number is said in full:
        // a long number ("one hundred ten") is never cut off by the next stone.
        let waiting = 2;
        const next = () => {
          waiting -= 1;
          if (waiting === 0 && alive) step(i + 1);
        };
        audio
          .sayPhrases([{ number: n }])
          .catch(() => {})
          .then(next);
        cancelStep = buildClock.current.after(COUNT_STEP_MS, next);
      };
      step(0);
    },
    [audio],
  );

  const layStone = useCallback(() => {
    write(async () => {
      const r = await layNextStone(store, child.id, gameData);
      if (r.ok) walk(countingWalk(gameData, r.to));
      else if (r.reason === 'short') say('ui.road.short');
    });
  }, [store, child.id, gameData, say, write, walk]);

  return {
    /** The island and the Storehouse are read: the cards say what can be built. */
    ready: island !== undefined && inventory !== undefined,
    cards,
    sheetOpen,
    /** True once the sheet was opened: its code is loaded then. */
    sheetUsed,
    openSheet: () => {
      setSheetUsed(true);
      setSheetOpen(true);
    },
    closeSheet: () => setSheetOpen(false),
    buy,
    placing,
    place,
    cancelPlacing: () => setPlacing(null),
    construction,
    skipConstruction: endConstruction,
    counting,
    /** The road's next stone, when one can be laid, and whether the family has a stone for it. */
    next,
    hasStone: (inventory?.materials[ROAD_MATERIAL] ?? 0) >= ROAD_STONE_COST,
    layStone,
  };
}
