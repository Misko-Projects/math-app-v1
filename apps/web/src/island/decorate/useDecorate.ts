// Decorate mode's state on the island (05 §6, §8; 06 §2 "Build / Decorate"; #22 part 4): whether
// it is open, the piece in hand, where it may go, and the time cap that closes it.
//
// - Opening asks the time cap first (`nonMathLeft`): with nothing left, the mode stays closed and
//   the guide says that decorating is open after the next request. While it is open a timer on
//   the island's clock (`buildClock`, which tests move) ends it when the cap is reached.
// - A piece is picked in the tray (or by pressing it on the map), then put on one of the offered
//   plots: an event is written and the piece is no longer in hand.

import type { ChildProfile, Plot } from '@number-island/shared';
import { useSpeech } from '@number-island/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppServices } from '@/app/AppServices';
import { useSession } from '@/app/session/SessionProvider';
import { useCollection, useIsland } from '@/data/hooks';
import { useRaise } from '@/runner/useRequestRunner';
import { buildClock } from '../building/clock';
import { useHub } from '../hub';
import { placeDecor, removeDecor } from './actions';
import { type DecorItem, decorAnchors, decorItems, nonMathLeft } from './rules';

export interface Decorate {
  /** The mode is on: the requests step aside and the tray shows. */
  open: boolean;
  /** The tray was opened once: its code is loaded and stays. */
  used: boolean;
  /** The cap closed the mode, or kept it closed: said until the child leaves the island. */
  capped: boolean;
  /** Every owned piece, with where it stands. */
  items: DecorItem[];
  /** The piece in hand. */
  selected: DecorItem | null;
  /** Where the piece in hand may go. */
  anchors: Plot[];
  start(): void;
  done(): void;
  select(instanceId: string | null): void;
  place(plot: Plot): void;
  putAway(): void;
}

const NONE: DecorItem[] = [];

export function useDecorate(child: ChildProfile): Decorate {
  const { store, content, audio } = useAppServices();
  const { controller } = useSession();
  const { say } = useSpeech();
  const raise = useRaise();
  const hub = useHub();
  const island = useIsland();
  const collection = useCollection();
  const { gameData } = content.store;
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const [capped, setCapped] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const writing = useRef(false);

  const left = useCallback(() => {
    const active = controller.activeMs();
    return nonMathLeft(active, hub.nonMath.ms(active));
  }, [controller, hub.nonMath]);

  const close = useCallback(() => {
    setOpen(false);
    setSelectedId(null);
  }, []);

  // The time cap ends the mode: checked when what is left has passed, and again if the session's
  // clock stood still meanwhile (the screen was hidden).
  useEffect(() => {
    if (!open) return;
    let cancel = () => {};
    const arm = () => {
      const ms = left();
      if (ms < 1) {
        close();
        setCapped(true);
        audio.stop();
        say('ui.decor.closed');
        return;
      }
      cancel = buildClock.current.after(ms, arm);
    };
    arm();
    return () => cancel();
  }, [open, left, close, audio, say]);

  const items = useMemo(
    () => (island && collection ? decorItems(gameData, island, collection) : NONE),
    [gameData, island, collection],
  );
  const selected = items.find((i) => i.instanceId === selectedId) ?? null;
  const anchors = useMemo(
    () => (island && selected ? decorAnchors(gameData, island, items, selected) : []),
    [gameData, island, items, selected],
  );

  const write = useCallback(
    (action: () => Promise<unknown>) => {
      if (writing.current) return;
      writing.current = true;
      action()
        .then(() => setSelectedId(null), raise)
        .finally(() => {
          writing.current = false;
        });
    },
    [raise],
  );

  return {
    open,
    used,
    capped,
    items,
    selected,
    anchors,
    start() {
      if (left() < 1) {
        setCapped(true);
        audio.stop();
        say('ui.decor.closed');
        return;
      }
      setUsed(true);
      setOpen(true);
      audio.stop();
      say(items.some((i) => i.pos === null) ? 'ui.decor.pick' : 'ui.decor.all');
    },
    done: close,
    select(instanceId) {
      setSelectedId(instanceId);
      if (instanceId !== null) {
        audio.stop();
        say('ui.decor.place');
      }
    },
    place(plot) {
      if (!selected) return;
      write(() => placeDecor(store, gameData, child.id, selected.instanceId, plot));
    },
    putAway() {
      if (!selected || selected.pos === null) return;
      write(() => removeDecor(store, child.id, selected.instanceId));
    },
  };
}
