import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, useMemo, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { HandPointerIcon } from '../../primitives/icons';
import { useWidgetDemo } from '../demo';
import {
  CheckButton,
  NumberEntry,
  ObjectSprite,
  spriteNameKey,
  useAlive,
  useDemoPause,
  useFlight,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import {
  applyOp,
  type Board,
  type Cell,
  COLOR_B,
  capacity,
  cellId,
  counterId,
  EMPTY,
  firstEmpty,
  initialBoard,
  type Move,
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
import './tenframe-fill.css';

/**
 * `tenframe-fill` (03 §5.5): one or two five- or ten-frames (or a Pebbling shell, 05 §5).
 *
 * - **Concrete:** drag counters from the tray into the cells (tap-to-place and keyboard through
 *   `useDragToTarget`). Any empty cell takes a counter; with `requireStandardFill` it lands in the
 *   next cell of the standard order. Tapping a placed counter takes it back. Prefilled counters are
 *   locked (the given addend), unless the goal is to take counters away.
 * - **Pictorial:** tap a cell to shade it, tap again to clear it.
 * - **`thenAsk`:** a numeral answer (tray 0–10 or the number pad) is needed before "check".
 *
 * Counter colours a and b differ in lightness and by a mark (colour b has an ink ring, 06 §7).
 * The response comes from the engine model: `{ cells, value? }` (engine README).
 *
 * Demo ops (03 §5.5): `show-addends`, `place`, `remove`, `move-counters`, `highlight`,
 * `count-total`, plus `answer`.
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

/** Tray counters shown at once (the rest wait underneath, so the tray never gets crowded). */
const TRAY_VISIBLE = 10;

type Config = ConfigFor<'tenframe-fill'>;
type ItemId = `counter-${number}`;
type TargetId = `cell-${number}-${number}`;

const counterIndex = (s: string) => Number(s.slice('counter-'.length));

function Counter({ color }: { color: number }) {
  return <ObjectSprite sprite="counter" tone={color === COLOR_B ? 'b' : 'a'} />;
}

export function TenframeFillWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { speakOnTap } = useUiPreferences();
  const { say, sayNumber } = useSpeech();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { fly, layer } = useFlight(rootRef);

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
  const [demoBusy, setDemoBusy] = useState(false);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [counting, setCounting] = useState<number | null>(null);
  const [flying, setFlying] = useState<number | null>(null);
  const [entryHighlight, setEntryHighlight] = useState<number | null>(null);

  const interactive = !disabled && !demoBusy;
  const asks = config.thenAsk !== null;
  const ready = !asks || value !== null;
  const frameKey =
    config.skin === 'shell' ? 'ui.widget.tenframe.shell' : 'ui.widget.tenframe.frame';
  const counterName = t(spriteNameKey('counter'));

  /** Counters not on the frames, in order: the tray (plus prefilled ones taken off, subtract). */
  const trayIdsOf = (b: Board) => {
    const on = new Set(b.ids.flat().filter((x): x is number => x !== null));
    const all = Array.from({ length: pre + supply }, (_, i) => i);
    return all.filter((id) => !on.has(id) && (id >= pre || !locked));
  };
  const trayIds = trayIdsOf(board);
  const isLocked = (id: number) => locked && id < pre;

  /** 06 §5: the running count, unless the widget asks for the count next (then the object name). */
  const speakAfter = (cells: number[][]) => {
    if (!speakOnTap) return;
    if (asks) say(spriteNameKey('counter'));
    else sayNumber(total(cells));
  };

  const dnd = useDragToTarget<ItemId, TargetId>({
    disabled: !interactive || !concrete,
    trace,
    canPlace: (_item, target) => {
      const cell = parseCell(target);
      return cell !== null && boardRef.current.cells[cell.frame]?.[cell.index] === EMPTY;
    },
    onSelect: (item) => {
      if (item && speakOnTap) say(spriteNameKey('counter'));
    },
    onPlace: ({ item, target }) => {
      const cell = parseCell(target);
      if (!cell) return;
      const id = counterIndex(item);
      const next = placeCounter(boardRef.current, cell, id, colorOf(id), standard);
      if (next === boardRef.current) return;
      setInvite(null);
      setBoard(next);
      speakAfter(next.cells);
    },
  });

  const takeBack = (id: number) => {
    if (!interactive || isLocked(id)) return;
    trace('undo', counterId(id));
    const next = removeCounter(boardRef.current, id);
    setBoard(next);
    speakAfter(next.cells);
  };

  /** Pictorial: tap a cell to shade it (the next standard cell when that order is required). */
  const tapCell = (cell: Cell) => {
    if (!interactive) return;
    const b = boardRef.current;
    const id = b.ids[cell.frame]?.[cell.index] ?? null;
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
    setInvite(null);
    setBoard(next);
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

  // ---------- demo mode (03 §6.3) ----------

  const query = (selector: string) =>
    rootRef.current?.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
  const rectOf = (where: Cell | 'tray', id: number) =>
    where === 'tray'
      ? (query(`.ni-tf__tray [data-counter="${id}"]`) ?? query('.ni-tf__tray'))
      : query(`[data-cell="${cellId(where)}"]`);

  const animateMove = async (move: Move, next: Board) => {
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
      const step = { ...action, args: { ...action.args, count: 1 } };
      const { board: next, moves } = applyOp(
        config,
        boardRef.current,
        step,
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
            await playMoves(action);
            break;
          case 'show-addends':
            await pulse('group-a', 900);
            if (alive.current) await pulse('group-b', 900);
            break;
          case 'highlight':
            await pulse(String(action.args?.target ?? 'board'));
            break;
          case 'count-total': {
            const b = boardRef.current;
            const order = b.ids.flat().filter((x): x is number => x !== null);
            for (const [i, id] of order.entries()) {
              setCounting(id);
              sayNumber(i + 1);
              await pause(600);
              if (!alive.current) return;
            }
            setCounting(null);
            // The model's count-total enters the total as the asked number.
            if (asks) setEntryHighlight(order.length);
            await pause(asks ? 400 : 0);
            setValue(order.length);
            setEntryHighlight(null);
            break;
          }
          case 'answer': {
            const v = Number(action.args?.value);
            if (!Number.isFinite(v)) break;
            setEntryHighlight(v);
            await pause(600);
            if (!alive.current) return;
            setValue(v);
            setEntryHighlight(null);
            break;
          }
        }
      } finally {
        setCounting(null);
        setFlying(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => setInvite(action),
  });

  // Where the demo hand points for an invited child step.
  const inviteTarget = (() => {
    if (!invite) return null;
    const frame = Number(invite.args?.frame ?? invite.args?.fromFrame ?? 0);
    switch (invite.op) {
      case 'place': {
        if (concrete && trayIds.length > 0) return 'tray';
        const f = board.cells[frame]?.indexOf(EMPTY) ?? -1;
        const cell = f >= 0 ? { frame, index: f } : firstEmpty(board.cells);
        return cell ? cellId(cell) : null;
      }
      case 'remove':
      case 'move-counters': {
        const ids = board.ids[frame] ?? [];
        const last = ids.reduce<number>((at, id, i) => (id !== null ? i : at), -1);
        return last >= 0 ? cellId({ frame, index: last }) : `frame-${frame}`;
      }
      case 'answer':
      case 'count-total':
        return asks ? 'entry' : 'check';
      case 'highlight':
        return String(invite.args?.target ?? 'board');
      default:
        return 'board';
    }
  })();
  const hand = (where: string) =>
    inviteTarget === where ? (
      <span className="ni-hand ni-tf__hand" aria-hidden="true">
        <HandPointerIcon />
      </span>
    ) : null;

  const counterHighlighted = (id: number) =>
    highlight === counterId(id) ||
    (highlight === 'group-a' && id < pre) ||
    (highlight === 'group-b' && id >= pre);

  // ---------- render ----------

  const rows = config.size / 5;
  const cellNumber = (c: Cell) => c.frame * config.size + c.index + 1;

  const renderFrame = (frame: number) => {
    const cells = board.cells[frame] ?? [];
    const frameName = t(frameKey, { n: frame + 1 });
    return (
      <fieldset
        key={frame}
        aria-label={frameName}
        className={[
          'ni-tf__frame',
          highlight === `frame-${frame}` || highlight === 'board' ? 'ni-invite' : '',
          inviteTarget === `frame-${frame}` ? 'ni-invite' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-skin={config.skin}
        data-frame={frame}
        style={{ '--tf-rows': rows } as CSSProperties}
      >
        {config.skin === 'shell' ? <ShellArt rows={rows} /> : null}
        <div className="ni-tf__cells">
          {cells.map((c, index) => {
            const cell = { frame, index };
            const id = cellId(cell) as TargetId;
            const counter = board.ids[frame]?.[index] ?? null;
            const label = t('ui.widget.tenframe.box', { n: cellNumber(cell) });
            const invited = inviteTarget === id || highlight === id;
            return (
              <div
                key={id}
                className={['ni-tf__cell', invited ? 'ni-invite' : ''].filter(Boolean).join(' ')}
                data-cell={id}
                data-filled={c !== EMPTY ? 'true' : undefined}
              >
                {concrete ? (
                  (() => {
                    const props = dnd.targetProps(id, { label, disabled: c !== EMPTY });
                    return <div {...props} className={`${props.className} ni-tf__pad`} />;
                  })()
                ) : (
                  <button
                    type="button"
                    className="ni-tf__shade"
                    aria-label={label}
                    aria-pressed={c !== EMPTY}
                    disabled={!interactive || (counter !== null && isLocked(counter))}
                    data-locked={counter !== null && isLocked(counter) ? 'true' : undefined}
                    data-counting={counter !== null && counting === counter ? 'true' : undefined}
                    data-highlight={
                      counter !== null && counterHighlighted(counter) ? 'true' : undefined
                    }
                    onClick={() => tapCell(cell)}
                  >
                    {c !== EMPTY && counter !== flying ? <Counter color={c} /> : null}
                  </button>
                )}
                {hand(id)}
              </div>
            );
          })}
        </div>
        {concrete ? (
          // Placed counters sit in a layer over the cell pads (targets never contain items).
          <div className="ni-tf__counters">
            {cells.map((c, index) => {
              const counter = board.ids[frame]?.[index] ?? null;
              const style = {
                gridRow: Math.floor(index / 5) + 1,
                gridColumn: (index % 5) + 1,
              } as CSSProperties;
              if (c === EMPTY || counter === null) return null;
              const common = {
                className: 'ni-tf__placed',
                style,
                'data-counter': counter,
                'data-counting': counting === counter ? 'true' : undefined,
                'data-highlight': counterHighlighted(counter) ? 'true' : undefined,
                'data-flying': flying === counter ? 'true' : undefined,
              } as const;
              if (isLocked(counter)) {
                return (
                  <span key={counter} {...common} data-locked="true" aria-hidden="true">
                    <Counter color={c} />
                  </span>
                );
              }
              return (
                <button
                  key={counter}
                  type="button"
                  {...common}
                  aria-label={`${counterName} ${counter + 1}`}
                  disabled={!interactive}
                  onClick={() => takeBack(counter)}
                >
                  <Counter color={c} />
                </button>
              );
            })}
          </div>
        ) : null}
        {hand(`frame-${frame}`)}
      </fieldset>
    );
  };

  const visibleTray = trayIds.slice(0, TRAY_VISIBLE);
  // The tray keeps its size as counters leave: a 5-wide dish under one frame, a 2-wide column
  // beside two frames (a ten-frame on its side).
  const traySlots = Math.min(TRAY_VISIBLE, Math.max(supply, locked ? 0 : pre));
  const trayCols = config.frames === 2 ? Math.min(2, traySlots) : Math.min(5, traySlots);
  const trayRows = trayCols > 0 ? Math.ceil(traySlots / trayCols) : 0;

  const check = (
    <div className="ni-tf__check">
      <CheckButton
        onPress={submit}
        disabled={!interactive || !ready}
        invited={inviteTarget === 'check'}
      />
      {hand('check')}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="ni-tf"
      data-tier={tier}
      data-frames={config.frames}
      data-asks={asks ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
    >
      <div className="ni-tf__frames">
        {Array.from({ length: config.frames }, (_, f) => renderFrame(f))}
      </div>

      {concrete && traySlots > 0 ? (
        <div className="ni-tf__tray-wrap">
          <fieldset
            className={[
              'ni-tf__tray',
              inviteTarget === 'tray' || highlight === 'tray' ? 'ni-invite' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={t('ui.widget.tenframe.tray')}
            style={{ '--tf-tray-cols': trayCols, '--tf-tray-rows': trayRows } as CSSProperties}
          >
            {visibleTray.map((id) => {
              const props = dnd.itemProps(counterId(id) as ItemId, {
                label: `${counterName} ${id + 1}`,
              });
              return (
                <div
                  key={id}
                  {...props}
                  className={`${props.className} ni-tf__counter`}
                  data-counter={id}
                  data-flying={flying === id ? 'true' : undefined}
                  data-highlight={counterHighlighted(id) ? 'true' : undefined}
                >
                  <Counter color={colorOf(id)} />
                </div>
              );
            })}
          </fieldset>
          {hand('tray')}
        </div>
      ) : null}

      <div className="ni-tf__controls">
        {asks ? (
          <div
            className={['ni-tf__entry', inviteTarget === 'entry' ? 'ni-invite' : '']
              .filter(Boolean)
              .join(' ')}
          >
            <NumberEntry
              max={capacity(config)}
              value={value}
              onChange={(v) => {
                setInvite(null);
                setValue(v);
              }}
              disabled={!interactive}
              highlighted={entryHighlight}
              trace={trace}
              columns={capacity(config) <= 5 ? 3 : 4}
              onEnter={() => {
                // Enter on a focused counter or cell is that control's own key.
                if (!document.activeElement?.closest('[role="button"]')) submit();
              }}
              check={check}
            />
            {hand('entry')}
          </div>
        ) : (
          check
        )}
      </div>
      {layer}
    </div>
  );
}

/**
 * The Pebbling shell skin (05 §5): a scallop shell (original art) whose wavy rim and fanned ribs
 * frame the pockets, with the hinge below. Drawn in px-like units matching the frame's padding.
 */
const SHELL_W = 560;
const SCALLOPS = 7;

function ShellArt({ rows }: { rows: number }) {
  const h = rows === 2 ? 270 : 170;
  const bottom = h - 34;
  const left = 34;
  const step = (SHELL_W - 2 * left) / SCALLOPS;
  const rim = Array.from({ length: SCALLOPS }, (_, i) => {
    const x = left + i * step;
    return `Q${(x + step / 2).toFixed(1)} -12 ${(x + step).toFixed(1)} 26`;
  }).join(' ');
  const body = `M40 ${bottom} Q14 ${bottom - 2} 12 ${bottom - 34} L12 52 Q12 30 ${left} 26 ${rim} Q548 30 548 52 L548 ${bottom - 34} Q546 ${bottom - 2} 520 ${bottom} Z`;
  const hinge = `M226 ${bottom - 6} L334 ${bottom - 6} L318 ${h - 6} Q280 ${h + 2} 242 ${h - 6} Z`;
  const ribs = Array.from({ length: SCALLOPS - 1 }, (_, i) => {
    const x = left + (i + 1) * step;
    return `M280 ${bottom + 6} L${x.toFixed(1)} 28`;
  }).join(' ');
  return (
    <svg
      className="ni-tf__shell"
      viewBox={`0 0 ${SHELL_W} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={hinge}
        fill="var(--color-sun)"
        stroke="var(--color-sun-deep)"
        strokeWidth="4"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={`M262 ${bottom + 4} L258 ${h - 10} M298 ${bottom + 4} L302 ${h - 10}`}
        stroke="var(--color-sun-deep)"
        strokeWidth="3"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={body}
        fill="var(--color-sun)"
        stroke="var(--color-sun-deep)"
        strokeWidth="4"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={ribs}
        stroke="var(--color-sun-deep)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={`M36 44 Q60 20 ${left + step} 22`}
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default TenframeFillWidget;
