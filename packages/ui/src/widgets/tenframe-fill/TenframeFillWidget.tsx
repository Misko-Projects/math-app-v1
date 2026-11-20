import type { WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { BigButton } from '../../primitives/BigButton';
import { ArrowIcon, BackIcon } from '../../primitives/icons';
import { MIN_TARGET_PX, TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import {
  CheckButton,
  type EntryLayout,
  NumberEntry,
  nextPadKey,
  ObjectSprite,
  type PadKey,
  type Size,
  spriteNameKey,
  useAlive,
  useCommitBarrier,
  useDemoPause,
  useFlight,
  useInviteHand,
  useOncePerKeyPress,
  useSubmitGuard,
  useWidgetRoom,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import {
  applyOp,
  type Board,
  type Cell,
  COLOR_B,
  capacity,
  cellId,
  cellOf,
  counterId,
  EMPTY,
  firstEmpty,
  initialBoard,
  type Move,
  movesCounters,
  parseCell,
  placeCounter,
  prefilledCount,
  prefilledLocked,
  removeCounter,
  responseFor,
  supplySize,
  total,
  trayColor,
} from './board';
import { FRAME_GAP, MINI_PIECE, type Plan, planFor, SUPPLY_EDGE } from './plan';
import './tenframe-fill.css';

/**
 * `tenframe-fill` (03 §5.5): one or two five- or ten-frames (or a Pebbling shell, 05 §5).
 *
 * - **Concrete:** drag counters from the tray into the cells (tap-to-place and keyboard through
 *   `useDragToTarget`). Any empty cell takes a counter; with `requireStandardFill` it lands in the
 *   next cell of the standard order. Tapping a placed counter takes it back. Prefilled counters are
 *   locked (the given addend), unless the goal is to take counters away.
 * - **Pictorial:** tap a cell to shade it, tap again to clear it.
 * - **`thenAsk`:** a numeral answer (a 0 … capacity tray, or the pad) is needed before Check.
 *
 * Layout follows the measured room (plan.ts): everything at once where it fits; else first build,
 * then answer (`steps`: Next and Back); two frames that don't fit at full size show one at a time
 * with the other as a small frame button (`paged`). Targets never shrink. Counter colours a and b
 * differ in lightness and by a mark (colour b has an ink ring, 06 §7). The response comes from the
 * engine model: `{ cells, value? }` (engine README).
 *
 * Demo ops (03 §5.5): `show-addends`, `place`, `remove`, `move-counters`, `highlight`,
 * `count-total`, plus `answer`. One invite at a time: the ring and Pip's hand on the one control
 * the child uses next, only while the child can act.
 */

const OPS = [
  'show-addends',
  'place',
  'remove',
  'move-counters',
  'highlight',
  'count-total',
  'answer',
] as const;

type Config = ConfigFor<'tenframe-fill'>;
type ItemId = `counter-${number}`;
/** A cell, or (paged) the small frame: a counter put there goes in that frame's first empty cell. */
type TargetId = `cell-${number}-${number}` | `mini-${number}`;
type Step = 'build' | 'ask';

const counterIndex = (s: string) => Number(s.slice('counter-'.length));
const miniTarget = (frame: number): TargetId => `mini-${frame}`;
const parseMini = (target: string): number | null => {
  const m = /^mini-(\d+)$/.exec(target);
  return m ? Number(m[1]) : null;
};

function Counter({ color }: { color: number }) {
  return <ObjectSprite sprite="counter" tone={color === COLOR_B ? 'b' : 'a'} />;
}

/** What the demo invites: one control (03 §6.3). `cue` is the control's `data-cue`. */
type Cue = { at: 'cue'; cue: string } | { at: 'card'; value: number } | { at: 'key'; key: PadKey };

export function TenframeFillWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { speakOnTap, ageMode } = useUiPreferences();
  const { say, sayNumber } = useSpeech();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const committed = useCommitBarrier();
  const oncePerPress = useOncePerKeyPress();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { fly, layer } = useFlight(rootRef);
  const room = useWidgetRoom(rootRef);

  const concrete = tier === 'concrete';
  const standard = config.requireStandardFill;
  const locked = prefilledLocked(config);
  const pre = useMemo(() => prefilledCount(config), [config]);
  const supply = concrete ? supplySize(config) : 0;
  const trayTone = trayColor(config);
  const start = useMemo(() => initialBoard(config), [config]);
  /** Each counter's colour (prefilled ones keep theirs; tray counters use the tray colour). */
  const colorOf = useMemo(() => {
    const map = new Map<number, number>();
    start.cells.forEach((f, frame) => {
      f.forEach((c, index) => {
        const id = start.ids[frame]?.[index];
        if (id !== null && id !== undefined) map.set(id, c);
      });
    });
    return (id: number) => map.get(id) ?? trayTone;
  }, [start, trayTone]);

  const [board, setBoardState] = useState<Board>(start);
  const boardRef = useRef(board);
  const setBoard = (b: Board) => {
    boardRef.current = b;
    setBoardState(b);
  };
  const [value, setValueState] = useState<number | null>(null);
  const valueRef = useRef(value);
  const setValue = (v: number | null) => {
    valueRef.current = v;
    setValueState(v);
  };
  const [step, setStep] = useState<Step>('build');
  const [page, setPage] = useState(() => {
    const at = firstEmpty(start.cells);
    return at ? at.frame : 0;
  });
  const [demoBusy, setDemoBusy] = useState(false);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [counting, setCounting] = useState<number | null>(null);
  const [flying, setFlying] = useState<number | null>(null);
  const [entryHighlight, setEntryHighlight] = useState<number | PadKey | null>(null);

  const interactive = !disabled && !demoBusy;
  const asks = config.thenAsk !== null;
  const ready = !asks || value !== null;
  const frameKey =
    config.skin === 'shell' ? 'ui.widget.tenframe.shell' : 'ui.widget.tenframe.frame';
  const counterName = t(spriteNameKey('counter'));
  const target = MIN_TARGET_PX[ageMode];
  const askMax = asks ? capacity(config) : null;

  // ---------- layout (plan.ts): measured room and the actions' button size ----------

  const actRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const [button, setButton] = useState<Size>(() => ({
    w: TARGET_PX[ageMode].big * 1.5,
    h: TARGET_PX[ageMode].big,
  }));
  useLayoutEffect(() => {
    const btn = actRef.current?.querySelector<HTMLElement>('.ni-btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    // The ledge (6 px) hangs below the button's box; the actions row keeps room for it.
    // Measured as drawn: undo the zoom the parts are drawn at (the plan works in design px).
    const z = zoomRef.current;
    const next = { w: Math.ceil(r.width / z), h: Math.ceil(r.height / z) + 6 };
    setButton((b) => (b.w === next.w && b.h === next.h ? b : next));
  });
  const trayCount = supply > 0 ? supply : locked ? 0 : pre;
  const plan: Plan = useMemo(
    () =>
      planFor(
        {
          ageMode,
          frames: config.frames,
          size: config.size,
          supply: concrete ? trayCount : 0,
          askMax,
          button,
        },
        {
          w: room?.width ?? Number.POSITIVE_INFINITY,
          h: room?.height ?? Number.POSITIVE_INFINITY,
        },
      ),
    [ageMode, config.frames, config.size, concrete, trayCount, askMax, button, room],
  );
  const steps = plan.steps;
  const shownStep: Step = steps ? step : 'build';
  const paged = plan.paged;
  const layout = shownStep === 'ask' && plan.ask ? plan.ask.arrangement : plan.build.arrangement;
  /**
   * Every part drawn this much larger where the area has room (targets only ever grow). The frames,
   * the small frame and the counter tray, where counters are dragged, are drawn at real lengths
   * (`--tf-cell`, `--tf-s`): CSS `zoom` there would make a drag's viewport pointer delta move a
   * counter `zoom` times as far (useDragToTarget writes it as a local translate). The answer step's
   * picture, the numeral answer and the buttons (taps only) use CSS `zoom` (`--tf-zoom`).
   */
  const zoom = shownStep === 'ask' ? plan.askZoom : plan.buildZoom;
  zoomRef.current = zoom;
  const entryLayout: EntryLayout | null =
    shownStep === 'ask' ? (plan.ask?.entry ?? null) : plan.build.entry;

  /** Counters not on the frames, in order: the tray (plus prefilled ones taken off, subtract). */
  const trayIdsOf = (b: Board) => {
    const on = new Set(b.ids.flat().filter((x): x is number => x !== null));
    const all = Array.from({ length: pre + supply }, (_, i) => i);
    return all.filter((id) => !on.has(id) && (id >= pre || !locked));
  };
  const trayIds = trayIdsOf(board);
  // Make ten on two frames: the counters given in frame 2 move between the frames.
  const moving = movesCounters(config);
  const preFrame0 = start.ids[0]?.filter((x) => x !== null).length ?? 0;
  const isLocked = (id: number) => locked && id < pre && !(moving && id >= preFrame0);
  const shape = plan.build.supply;
  const visibleTray = shape ? trayIds.slice(0, shape[0] * shape[1]) : [];

  /** 06 §5: the running count, unless the widget asks for the count next (then the object name). */
  const speakAfter = (cells: number[][]) => {
    if (!speakOnTap) return;
    if (asks) say(spriteNameKey('counter'));
    else sayNumber(total(cells));
  };

  /** Paged: the frame a change happened in comes to the front. */
  const showFrame = (frame: number) => {
    if (paged) setPage(frame);
  };

  const dnd = useDragToTarget<ItemId, TargetId>({
    disabled: !interactive || !concrete,
    trace,
    canPlace: (_item, target) => {
      const mini = parseMini(target);
      if (mini !== null) return (boardRef.current.cells[mini] ?? []).includes(EMPTY);
      const cell = parseCell(target);
      return cell !== null && boardRef.current.cells[cell.frame]?.[cell.index] === EMPTY;
    },
    onSelect: (item) => {
      if (item && speakOnTap) say(spriteNameKey('counter'));
    },
    onPlace: ({ item, target }) => {
      const mini = parseMini(target);
      const cell: Cell | null =
        mini !== null
          ? { frame: mini, index: (boardRef.current.cells[mini] ?? []).indexOf(EMPTY) }
          : parseCell(target);
      if (!cell || cell.index < 0) return;
      const id = counterIndex(item);
      // A counter already on the frames (make ten) leaves its cell for the new one.
      const next = placeCounter(
        removeCounter(boardRef.current, id),
        cell,
        id,
        colorOf(id),
        standard,
      );
      if (next === boardRef.current) return;
      setInvite(null);
      setBoard(next);
      // Put on the small frame: the frame in front stays (the next counter is picked up there).
      const at = cellOf(next, id);
      if (at && mini === null) showFrame(at.frame);
      speakAfter(next.cells);
    },
  });

  const takeBack = (id: number) => {
    if (!interactive || isLocked(id)) return;
    trace('undo', counterId(id));
    const next = removeCounter(boardRef.current, id);
    setInvite(null);
    setBoard(next);
    speakAfter(next.cells);
  };

  /** Pictorial: tap a cell to shade it (the next standard cell when that order is required). */
  const tapCell = (cell: Cell) => {
    if (!interactive) return;
    const b = boardRef.current;
    const id = b.ids[cell.frame]?.[cell.index] ?? null;
    setInvite(null);
    if (id !== null) {
      if (isLocked(id)) return;
      trace('undo', cellId(cell));
      const next = removeCounter(b, id);
      setBoard(next);
      speakAfter(next.cells);
      return;
    }
    trace('tap', cellId(cell));
    const fresh = Math.max(pre + supply - 1, ...b.ids.flat().map((x) => x ?? -1)) + 1;
    const next = placeCounter(b, cell, fresh, trayTone, standard);
    setBoard(next);
    const at = cellOf(next, fresh);
    if (at) showFrame(at.frame);
    speakAfter(next.cells);
  };

  // One debounce for every way to submit (Check button, desktop Enter): 06 §4.
  const submit = useSubmitGuard(() => {
    if (!interactive || !ready) return false;
    const r = responseFor(config, boardRef.current.cells, valueRef.current);
    if (!r) return false;
    onResponse(r);
    return true;
  });

  // ---------- steps: Next and Back hand focus to each other ----------

  const refocus = useRef<'next' | 'back' | null>(null);
  const goTo = (s: Step) => {
    // One step per key press: a held Enter repeats onto the button that has the focus by then.
    if (!interactive || !oncePerPress()) return;
    trace('tap', s === 'ask' ? 'next' : 'back');
    // The invite stays: Next or Back is the step towards it (the cue then moves on).
    const focused = document.activeElement?.closest('[data-cue]');
    refocus.current = focused ? (s === 'ask' ? 'back' : 'next') : null;
    setStep(s);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the step's button is replaced
  useLayoutEffect(() => {
    const want = refocus.current;
    refocus.current = null;
    if (!want) return;
    const el = [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-cue]') ?? [])].find(
      (e) => e.dataset.cue === want,
    );
    el?.querySelector<HTMLElement>('button')?.focus();
  }, [shownStep]);

  // The small frame (paged) brings its frame to the front; the new small frame takes the focus.
  const miniFocus = useRef(false);
  /** Enter or Space went down on the small frame and has not been released yet. */
  const miniKeyDown = useRef(false);
  const swapPage = (to: number) => {
    if (!interactive) return;
    trace('tap', `frame-${to}`);
    miniFocus.current = document.activeElement?.closest('.ni-tf__mini') !== null;
    setPage(to);
    if (speakOnTap) sayNumber((boardRef.current.cells[to] ?? []).filter((c) => c !== EMPTY).length);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the small frame is replaced
  useLayoutEffect(() => {
    if (!miniFocus.current) return;
    miniFocus.current = false;
    rootRef.current?.querySelector<HTMLElement>('.ni-tf__mini')?.focus();
  }, [page]);

  // ---------- demo mode (03 §6.3) ----------

  const query = (selector: string) =>
    rootRef.current?.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
  const counterRect = (id: number) => {
    const el = [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-counter]') ?? [])].find(
      (e) => e.dataset.counter === String(id),
    );
    return el?.getBoundingClientRect() ?? null;
  };
  const cellRect = (cell: Cell) => {
    const want = cellId(cell);
    const el = [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-cell]') ?? [])].find(
      (e) => e.dataset.cell === want,
    );
    return el?.getBoundingClientRect() ?? null;
  };
  const rectOf = (where: Cell | 'tray', id: number) =>
    where === 'tray'
      ? (counterRect(id) ?? query('.ni-tf__supply') ?? null)
      : (cellRect(where) ?? query('.ni-tf__mini'));

  const animateMove = async (move: Move, next: Board) => {
    // Paged: the frame the counter goes to (or leaves) comes to the front first.
    const frame = move.to !== 'tray' ? move.to.frame : move.from !== 'tray' ? move.from.frame : 0;
    if (paged) {
      setPage(frame);
      await committed();
    }
    const from = rectOf(move.from, move.id);
    const to = rectOf(move.to, move.id);
    setFlying(move.id);
    await fly(from, to, <Counter color={move.color || colorOf(move.id)} />);
    setFlying(null);
    setBoard(next);
  };

  /** Plays place/remove/move-counters one counter at a time, so each one is seen moving. */
  const playMoves = async (action: WidgetAction) => {
    const n = Math.max(0, Math.trunc(Number(action.args?.count ?? 1)));
    for (let i = 0; i < n; i++) {
      const one = { ...action, args: { ...action.args, count: 1 } };
      const { board: next, moves } = applyOp(
        config,
        boardRef.current,
        one,
        trayIdsOf(boardRef.current),
      );
      if (moves.length === 0) break;
      for (const m of moves) await animateMove(m, next);
      if (!alive.current) return;
      await pause(120);
    }
  };

  const pulse = async (target: string, ms = 1200) => {
    setHighlight(target);
    await pause(ms);
    if (alive.current) setHighlight(null);
  };

  /** Shows the answer step (steps layout) before the answer is entered. */
  const toAsk = async () => {
    if (steps && asks) {
      setStep('ask');
      await committed();
    }
  };
  const toBuild = async () => {
    if (steps) {
      setStep('build');
      await committed();
    }
  };

  /** Enters `v` the way the answer control does: the card, or the pad keys one by one. */
  const enterValue = async (v: number) => {
    await toAsk();
    if (entryLayout?.kind === 'pad' || (plan.ask?.entry.kind === 'pad' && steps)) {
      let typed = valueRef.current;
      for (let guard = 0; guard < 6; guard++) {
        const key = nextPadKey(v, typed);
        if (!key) break;
        setEntryHighlight(key);
        await pause(400);
        if (!alive.current) return;
        const text = typed === null ? '' : String(typed);
        const nextText = key === 'back' ? text.slice(0, -1) : text + key;
        typed = nextText === '' ? null : Number(nextText);
        setValue(typed);
      }
    } else {
      setEntryHighlight(v);
      await pause(600);
      if (!alive.current) return;
      setValue(v);
    }
    setEntryHighlight(null);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        switch (action.op) {
          case 'place':
          case 'remove':
          case 'move-counters':
            await toBuild();
            await playMoves(action);
            break;
          case 'show-addends':
            await toBuild();
            await pulse('group-a', 900);
            if (alive.current) await pulse('group-b', 900);
            break;
          case 'highlight':
            await toBuild();
            await pulse(String(action.args?.target ?? 'board'));
            break;
          case 'count-total': {
            await toBuild();
            const b = boardRef.current;
            const order = b.cells.flatMap((f, frame) =>
              f.flatMap((_, index) => {
                const id = b.ids[frame]?.[index];
                return id === null || id === undefined ? [] : [{ id, frame }];
              }),
            );
            for (const [i, c] of order.entries()) {
              if (paged) setPage(c.frame);
              setCounting(c.id);
              sayNumber(i + 1);
              await pause(600);
              if (!alive.current) return;
            }
            setCounting(null);
            // The model's count-total enters the total as the asked number.
            if (asks) await enterValue(order.length);
            else setValue(order.length);
            break;
          }
          case 'answer': {
            const v = Number(action.args?.value);
            if (!Number.isFinite(v) || !asks) break;
            await enterValue(v);
            break;
          }
        }
      } finally {
        if (alive.current) {
          setCounting(null);
          setFlying(null);
          setEntryHighlight(null);
          setDemoBusy(false);
        }
        await committed();
      }
    },
    invite: (action) => setInvite(action),
  });

  // ---------- the one invited control ----------

  const lastCounterIn = (frame: number | null): { id: number; cell: Cell } | null => {
    let found: { id: number; cell: Cell } | null = null;
    board.ids.forEach((ids, f) => {
      if (frame !== null && f !== frame) return;
      ids.forEach((id, index) => {
        if (id !== null && !isLocked(id)) found = { id, cell: { frame: f, index } };
      });
    });
    return found;
  };
  /** A cell's control is drawn only on the frame in front (paged): else the small frame. */
  const onShownFrame = (frame: number) => !paged || frame === page;

  const cue: Cue | null = (() => {
    if (!invite || !interactive) return null;
    const frameArg = Number(invite.args?.frame ?? invite.args?.fromFrame ?? Number.NaN);
    const askValue = (v: number): Cue | null => {
      if (steps && shownStep === 'build') return { at: 'cue', cue: 'next' };
      const kind = entryLayout?.kind;
      if (value === v) return ready ? { at: 'cue', cue: 'check' } : null;
      if (kind === 'pad') {
        const key = nextPadKey(v, value);
        return key ? { at: 'key', key } : null;
      }
      return { at: 'card', value: v };
    };
    switch (invite.op) {
      case 'place': {
        if (shownStep === 'ask') return { at: 'cue', cue: 'back' };
        if (concrete) {
          const last = visibleTray.at(-1);
          return last === undefined ? null : { at: 'cue', cue: `counter:${last}` };
        }
        const inFrame = Number.isFinite(frameArg)
          ? (board.cells[frameArg] ?? []).indexOf(EMPTY)
          : -1;
        const cell: Cell | null =
          inFrame >= 0 ? { frame: frameArg, index: inFrame } : firstEmpty(board.cells);
        if (!cell) return null;
        if (!onShownFrame(cell.frame)) return { at: 'cue', cue: 'mini' };
        return { at: 'cue', cue: `cell:${cellId(cell)}` };
      }
      case 'remove':
      case 'move-counters': {
        if (shownStep === 'ask') return { at: 'cue', cue: 'back' };
        const last =
          lastCounterIn(Number.isFinite(frameArg) ? frameArg : null) ?? lastCounterIn(null);
        if (!last) return null;
        if (!onShownFrame(last.cell.frame)) return { at: 'cue', cue: 'mini' };
        return concrete
          ? { at: 'cue', cue: `counter:${last.id}` }
          : { at: 'cue', cue: `cell:${cellId(last.cell)}` };
      }
      case 'count-total':
        return asks ? askValue(total(board.cells)) : { at: 'cue', cue: 'check' };
      case 'answer': {
        const v = Number(invite.args?.value);
        if (!asks) return { at: 'cue', cue: 'check' };
        return Number.isFinite(v) ? askValue(v) : null;
      }
      default:
        return null;
    }
  })();
  const cueOf = (c: string) => (cue?.at === 'cue' && cue.cue === c ? 'ni-invite' : '');
  const cueKey = cue
    ? `${cue.at}:${cue.at === 'cue' ? cue.cue : cue.at === 'card' ? cue.value : cue.key}|${shownStep}|${layout}|${page}`
    : '';
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) => {
      if (!cue) return null;
      if (cue.at === 'card') {
        const v = `opt-${cue.value}`;
        return (
          [...root.querySelectorAll<HTMLElement>('.ni-pick')].find((e) => e.dataset.id === v) ??
          null
        );
      }
      if (cue.at === 'key') {
        return (
          [...root.querySelectorAll<HTMLElement>('.ni-pad__key')].find(
            (e) => e.dataset.key === cue.key,
          ) ?? null
        );
      }
      const el = [...root.querySelectorAll<HTMLElement>('[data-cue]')].find(
        (e) => e.dataset.cue === cue.cue,
      );
      // Buttons wrap a kit BigButton: the hand points at the button itself.
      return el?.querySelector<HTMLElement>('.ni-btn') ?? el ?? null;
    },
    cueKey,
  );

  /**
   * `show-addends` pulses the two addends in turn. Usually the first is what the frames start with
   * and the second is the tray. Where both are given (make ten on two frames: 8 and 5, nothing in a
   * tray), the first addend is the given counters in the first one's colour and the second is the
   * rest.
   */
  const firstTone = colorOf(0);
  const bothGiven = Array.from({ length: pre }, (_, id) => colorOf(id)).some(
    (c) => c !== firstTone,
  );
  const inFirstAddend = (id: number) => id < pre && (!bothGiven || colorOf(id) === firstTone);
  const counterHighlighted = (id: number) =>
    highlight === counterId(id) ||
    (highlight === 'group-a' && inFirstAddend(id)) ||
    (highlight === 'group-b' && !inFirstAddend(id));

  // ---------- render ----------

  const rows = config.size / 5;
  const chrome = plan.build.chrome;
  const cellNumber = (c: Cell) => c.frame * config.size + c.index + 1;

  const renderCell = (frame: number, index: number) => {
    const cell = { frame, index };
    const id = cellId(cell) as TargetId;
    const c = board.cells[frame]?.[index] ?? EMPTY;
    const counter = board.ids[frame]?.[index] ?? null;
    const label = t('ui.widget.tenframe.box', { n: cellNumber(cell) });
    const counterProps = (n: number) => ({
      'data-counter': n,
      'data-counting': counting === n ? 'true' : undefined,
      'data-highlight': counterHighlighted(n) ? 'true' : undefined,
      'data-flying': flying === n ? 'true' : undefined,
    });
    let inner: ReactNode;
    if (!concrete) {
      const lockedHere = counter !== null && isLocked(counter);
      inner = (
        <button
          type="button"
          className={['ni-tf__shade', cueOf(`cell:${id}`)].filter(Boolean).join(' ')}
          data-cue={`cell:${id}`}
          aria-label={label}
          aria-pressed={c !== EMPTY}
          disabled={!interactive || lockedHere}
          data-locked={lockedHere ? 'true' : undefined}
          {...(counter !== null ? counterProps(counter) : {})}
          onClick={() => tapCell(cell)}
        >
          {c !== EMPTY && counter !== flying ? <Counter color={c} /> : null}
        </button>
      );
    } else if (c === EMPTY || counter === null) {
      const props = dnd.targetProps(id, { label });
      inner = <div {...props} className={`${props.className} ni-tf__pad`} />;
    } else if (moving && !isLocked(counter)) {
      // Make ten: a given counter in frame 2 is picked up (drag, tap-to-place, keyboard) and put
      // in an empty cell of either frame.
      const props = dnd.itemProps(counterId(counter) as ItemId, {
        label: `${counterName} ${counter + 1}`,
      });
      inner = (
        <div
          {...props}
          className={[props.className, 'ni-tf__placed', cueOf(`counter:${counter}`)]
            .filter(Boolean)
            .join(' ')}
          data-cue={`counter:${counter}`}
          {...counterProps(counter)}
        >
          <Counter color={c} />
        </div>
      );
    } else if (isLocked(counter)) {
      inner = (
        <span
          className="ni-tf__placed"
          data-locked="true"
          aria-hidden="true"
          {...counterProps(counter)}
        >
          <Counter color={c} />
        </span>
      );
    } else {
      inner = (
        <button
          type="button"
          className={['ni-tf__placed', cueOf(`counter:${counter}`)].filter(Boolean).join(' ')}
          data-cue={`counter:${counter}`}
          aria-label={`${counterName} ${counter + 1}`}
          disabled={!interactive}
          {...counterProps(counter)}
          onClick={() => takeBack(counter)}
        >
          <Counter color={c} />
        </button>
      );
    }
    return (
      <div
        key={id}
        className="ni-tf__cell"
        data-cell={id}
        data-filled={c !== EMPTY ? 'true' : undefined}
        data-lit={highlight === 'empty-cells' && c === EMPTY ? 'true' : undefined}
      >
        {inner}
      </div>
    );
  };

  const renderFrame = (frame: number) => (
    <fieldset
      key={`frame-${frame}`}
      aria-label={t(frameKey, { n: frame + 1 })}
      className={[
        'ni-tf__frame',
        highlight === `frame-${frame}` || highlight === 'board' ? 'ni-tf__lit' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-skin={config.skin}
      data-frame={frame}
      style={{ '--tf-rows': rows } as CSSProperties}
    >
      {config.skin === 'shell' ? <ShellArt /> : null}
      <div className="ni-tf__cells">
        {Array.from({ length: config.size }, (_, index) => renderCell(frame, index))}
      </div>
    </fieldset>
  );

  /**
   * Paged: the other frame, small, as a button that brings it to the front. Concrete, it is also a
   * drop target: a counter picked up (tap, keyboard) or dragged onto it goes in that frame's first
   * empty cell and the frame in front stays, so counters move between the frames (make ten) with
   * no page switch dropping the one picked up. With nothing picked up, a tap switches the frames.
   */
  const renderMini = (frame: number) => {
    const cells = board.cells[frame] ?? [];
    const n = cells.filter((c) => c !== EMPTY).length;
    const label = `${t(frameKey, { n: frame + 1 })}: ${n}`;
    const drop = concrete ? dnd.targetProps(miniTarget(frame), { label }) : null;
    const takes = drop?.['data-armed'] === 'true';
    return (
      <button
        key={`mini-${frame}`}
        ref={drop?.ref}
        type="button"
        className={['ni-tf__mini', drop?.className, cueOf('mini')].filter(Boolean).join(' ')}
        data-cue="mini"
        data-frame={frame}
        data-place-target={drop?.['data-place-target']}
        data-armed={drop?.['data-armed']}
        aria-label={label}
        disabled={!interactive}
        onClick={(e) => {
          // A key press acts on keydown (below): no second action from a key's own click.
          if (e.detail === 0 && miniKeyDown.current) return;
          if (takes && drop) drop.onClick(e);
          else swapPage(frame);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') {
            // Arrows move between the drop targets.
            drop?.onKeyDown(e);
            return;
          }
          // One action per press: a held key's repeats (and its own clicks) do nothing until the
          // key is released, so placing a counter is never followed by a page switch.
          e.preventDefault();
          if (e.repeat || miniKeyDown.current) return;
          miniKeyDown.current = true;
          if (takes && drop) drop.onKeyDown(e);
          else swapPage(frame);
        }}
        onKeyUp={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          miniKeyDown.current = false;
        }}
        onBlur={() => {
          miniKeyDown.current = false;
        }}
        style={
          { '--tf-rows': rows, '--tf-mini': `${MINI_PIECE[ageMode] * zoom}px` } as CSSProperties
        }
      >
        {cells.map((c, i) => {
          const lit = highlight === 'empty-cells' && c === EMPTY ? 'true' : undefined;
          const id = board.ids[frame]?.[i];
          // An addend's pulse reaches its counters in the small frame too.
          const pulsed = id !== null && id !== undefined && counterHighlighted(id);
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: the small frame's cells are positional
              key={i}
              className="ni-tf__mini-cell"
              data-lit={lit}
              data-highlight={pulsed ? 'true' : undefined}
            >
              {c !== EMPTY ? <Counter color={c} /> : null}
            </span>
          );
        })}
      </button>
    );
  };

  const framesBlock = (
    <div className="ni-tf__frames" data-chrome={chrome} style={{ gap: FRAME_GAP[chrome] * zoom }}>
      {paged
        ? Array.from({ length: config.frames }, (_, f) =>
            f === page ? renderFrame(f) : renderMini(f),
          )
        : Array.from({ length: config.frames }, (_, f) => renderFrame(f))}
    </div>
  );

  /** The answer step's picture: the frames as built, small and static. */
  const viewBlock = (
    <div
      className="ni-tf__view"
      role="img"
      aria-label={t('ui.widget.picture')}
      style={{ '--tf-view': `${plan.ask?.view ?? 40}px`, '--tf-rows': rows } as CSSProperties}
    >
      {board.cells.map((f, frame) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: frames are positional
        <span key={frame} className="ni-tf__vframe" data-skin={config.skin}>
          {f.map((c, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
            <span key={i} className="ni-tf__vcell">
              {c !== EMPTY ? <Counter color={c} /> : null}
            </span>
          ))}
        </span>
      ))}
    </div>
  );

  const supplyBlock =
    concrete && shape && shownStep === 'build' ? (
      <fieldset
        className={['ni-tf__supply', highlight === 'tray' ? 'ni-tf__lit' : '']
          .filter(Boolean)
          .join(' ')}
        aria-label={t('ui.widget.tenframe.tray')}
        style={
          {
            '--tf-supply-cols': shape[0],
            '--tf-supply-rows': shape[1],
            width: (shape[0] * target + (shape[0] - 1) * 12 + 2 * SUPPLY_EDGE) * zoom,
            height: (shape[1] * target + (shape[1] - 1) * 12 + 2 * SUPPLY_EDGE) * zoom,
          } as CSSProperties
        }
      >
        {visibleTray.map((id) => {
          const props = dnd.itemProps(counterId(id) as ItemId, {
            label: `${counterName} ${id + 1}`,
          });
          return (
            <div
              key={id}
              {...props}
              className={[props.className, 'ni-tf__counter', cueOf(`counter:${id}`)]
                .filter(Boolean)
                .join(' ')}
              data-cue={`counter:${id}`}
              data-counter={id}
              data-flying={flying === id ? 'true' : undefined}
              data-highlight={counterHighlighted(id) ? 'true' : undefined}
            >
              <Counter color={colorOf(id)} />
            </div>
          );
        })}
      </fieldset>
    ) : null;

  const entryBlock =
    asks && entryLayout && askMax !== null ? (
      <NumberEntry
        {...entryLayout}
        max={askMax}
        value={value}
        onChange={(v) => {
          setInvite(null);
          setValue(v);
        }}
        disabled={!interactive}
        highlighted={
          entryHighlight ?? (cue?.at === 'card' ? cue.value : cue?.at === 'key' ? cue.key : null)
        }
        trace={trace}
        captureKeyboard={entryLayout.kind === 'pad'}
        onEnter={() => {
          // Enter on a focused counter or cell is that control's own key.
          if (!document.activeElement?.closest('[role="button"], button')) submit();
        }}
      />
    ) : null;

  const actions = (
    <div
      className="ni-tf__act"
      ref={actRef}
      data-dir={shownStep === 'ask' && plan.ask ? plan.ask.act : 'row'}
    >
      {steps && shownStep === 'build' ? (
        <span className="ni-tf__btn" data-cue="next">
          <BigButton
            label="ui.btn.next"
            icon={<ArrowIcon />}
            tone="cloud"
            disabled={!interactive}
            onPress={() => goTo('ask')}
            className={cueOf('next') || undefined}
          />
        </span>
      ) : null}
      {steps && shownStep === 'ask' ? (
        <span className="ni-tf__btn" data-cue="back">
          <BigButton
            label="ui.btn.close"
            icon={<BackIcon />}
            tone="cloud"
            disabled={!interactive}
            onPress={() => goTo('build')}
            className={cueOf('back') || undefined}
          />
        </span>
      ) : null}
      {!steps || shownStep === 'ask' ? (
        <span className="ni-tf__btn" data-cue="check">
          <CheckButton
            onPress={submit}
            disabled={!interactive || !ready}
            invited={cueOf('check') !== ''}
          />
        </span>
      ) : null}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="ni-tf"
      data-tier={tier}
      data-frames={config.frames}
      data-layout={layout}
      data-step={steps ? shownStep : undefined}
      data-paged={paged ? 'true' : undefined}
      data-asks={asks ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      style={
        {
          '--tf-cell': `${target * zoom}px`,
          '--tf-s': zoom,
          '--tf-zoom': zoom,
          ...handRootStyle,
        } as CSSProperties
      }
    >
      {shownStep === 'ask' ? (
        plan.ask && plan.ask.view > 0 ? (
          <div className="ni-tf__main">{viewBlock}</div>
        ) : null
      ) : (
        <div className="ni-tf__main">{framesBlock}</div>
      )}
      <div className="ni-tf__items">
        {supplyBlock}
        {entryBlock}
        {actions}
      </div>
      {layer}
      {inviteHand}
    </div>
  );
}

/**
 * The Pebbling shell skin (05 §5): a scallop shell (original art) behind the frame's pockets,
 * its wavy rim along the top and fanned ribs, in the frame's padding. Drawn to the frame's box.
 */
function ShellArt() {
  const W = 560;
  const H = 240;
  const scallops = 7;
  const step = (W - 40) / scallops;
  const rim = Array.from({ length: scallops }, (_, i) => {
    const x = 20 + i * step;
    return `Q${(x + step / 2).toFixed(1)} 2 ${(x + step).toFixed(1)} 16`;
  }).join(' ');
  const body = `M20 16 ${rim} Q${W - 4} 24 ${W - 6} 60 L${W - 6} ${H - 40} Q${W - 8} ${H - 4} ${W - 44} ${H - 4} L44 ${H - 4} Q8 ${H - 4} 6 ${H - 40} L6 60 Q4 24 20 16 Z`;
  const ribs = Array.from({ length: scallops - 1 }, (_, i) => {
    const x = 20 + (i + 1) * step;
    // Each rib fans out from the shell's base towards its scallop, ending inside the outline.
    const base = W / 2 + (x - W / 2) * 0.35;
    return `M${base.toFixed(1)} ${H - 22} L${x.toFixed(1)} 24`;
  }).join(' ');
  return (
    <svg
      className="ni-tf__shell"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={body}
        fill="var(--color-sunshine-light)"
        stroke="var(--color-sun-deep)"
        strokeWidth="3"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={ribs}
        stroke="var(--color-sun-deep)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.45"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={`M30 40 Q60 22 ${20 + step} 24`}
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default TenframeFillWidget;
