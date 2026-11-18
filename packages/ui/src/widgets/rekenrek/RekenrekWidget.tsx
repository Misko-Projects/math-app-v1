import type { WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { HandPointerIcon } from '../../primitives/icons';
import { DRAG_START_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import { CheckButton, NumberEntry, TRAY_MAX, useAlive, useDemoPause, useSubmitGuard } from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import {
  asksNumber,
  BEADS,
  beadAt,
  beadSlot,
  clampBeads,
  ROW_SLOTS,
  responseFor,
  tapBead,
} from './beads';
import './rekenrek.css';

/**
 * `rekenrek` (03 §5.5, concrete): one or two rows of ten beads, five coral and five white.
 *
 * Each row is one large slider target (its tap zone spans the whole wire, ≥ --target-min tall), so
 * beads can sit close together the way real beads do while targets stay big and 12 px apart:
 * - **Tap** a bead: a bead on the right slides left with every bead before it; a bead on the left
 *   goes back right with every bead after it.
 * - **Drag** a bead left or right along the wire for the same move.
 * - **Keyboard:** focus a row; ← / ↑ slide one more bead left, → / ↓ push one back, Home clears
 *   the row, End fills it.
 *
 * `rowRule: fill-top-first` never blocks a move: the checker judges it. `read` shows the preset
 * (static) and asks for the number; `thenAsk: total` adds the number after the beads. Responses
 * come from the engine model: `{ rows, value? }` or a number.
 *
 * Demo ops (03 §5.5): `slide {row, count}`, `highlight {row, upTo}`, `count-total`, plus `answer`.
 */

const OPS = ['slide', 'highlight', 'count-total', 'answer'] as const;
const STEP_MS = 260;

type Config = ConfigFor<'rekenrek'>;
type Rows = [number, number];

interface Press {
  row: number;
  bead: number;
  start: number;
  startX: number;
  pointerId: number;
  dragging: boolean;
}

export function RekenrekWidget({
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

  const reading = config.mode === 'read';
  const asks = asksNumber(config);
  const rowCount = config.rows;
  const [rows, setRowsState] = useState<Rows>(() => [
    clampBeads(config.preset[0]),
    rowCount === 2 ? clampBeads(config.preset[1]) : 0,
  ]);
  const rowsRef = useRef(rows);
  const setRows = (r: Rows) => {
    rowsRef.current = r;
    setRowsState(r);
  };
  const [value, setValueState] = useState<number | null>(null);
  const valueRef = useRef(value);
  const setValue = (v: number | null) => {
    valueRef.current = v;
    setValueState(v);
  };
  const [demoBusy, setDemoBusy] = useState(false);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [highlight, setHighlight] = useState<{ row: number; upTo: number } | null>(null);
  const [counting, setCounting] = useState<{ row: number; bead: number } | null>(null);
  const [entryHighlight, setEntryHighlight] = useState<number | null>(null);
  const press = useRef<Press | null>(null);

  const interactive = !disabled && !demoBusy;
  const canSlide = interactive && !reading;
  const ready = !asks || value !== null;
  const rowName = (r: number) =>
    t(r === 0 ? 'ui.widget.rekenrek.top' : 'ui.widget.rekenrek.bottom');

  const speakAfter = (next: Rows) => {
    if (!speakOnTap) return;
    // 06 §5: the running count, unless the number is asked next (then the bead's name).
    if (asks) say('ui.widget.rekenrek.bead');
    else sayNumber(next[0] + next[1]);
  };

  const setRow = (row: number, count: number) => {
    const next: Rows = [...rowsRef.current];
    next[row] = clampBeads(count);
    if (next[row] === rowsRef.current[row]) return false;
    setRows(next);
    setInvite(null);
    return true;
  };

  // ---------- pointer: tap or drag a bead ----------

  const pointToBead = (row: number, el: HTMLElement, clientX: number) => {
    const r = el.getBoundingClientRect();
    const p = ((clientX - r.left) / r.width) * ROW_SLOTS;
    return beadAt(p, rowsRef.current[row] ?? 0);
  };

  const beadWidth = (el: HTMLElement) => el.getBoundingClientRect().width / ROW_SLOTS;

  const onPointerDown = (row: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canSlide || press.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.currentTarget;
    press.current = {
      row,
      bead: pointToBead(row, el, e.clientX),
      start: rowsRef.current[row] ?? 0,
      startX: e.clientX,
      pointerId: e.pointerId,
      dragging: false,
    };
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // Synthetic pointers (tests) have no capturable id.
    }
  };

  const onPointerMove = (row: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.row !== row || p.pointerId !== e.pointerId) return;
    const dx = e.clientX - p.startX;
    if (!p.dragging) {
      if (Math.abs(dx) < DRAG_START_PX) return;
      p.dragging = true;
      trace('drag', `bead-${row}-${p.bead}`);
    }
    const w = beadWidth(e.currentTarget);
    // A right-hand bead dragged left brings the beads before it; a left-hand bead dragged right
    // takes the beads after it. Dragging back undoes it, until the finger lifts.
    if (p.bead >= p.start) setRow(row, dx < -w / 2 ? p.bead + 1 : p.start);
    else setRow(row, dx > w / 2 ? p.bead : p.start);
  };

  const onPointerUp = (row: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.row !== row || p.pointerId !== e.pointerId) return;
    press.current = null;
    if (p.dragging) {
      trace('drop', `row-${row}`);
      if (rowsRef.current[row] !== p.start) speakAfter(rowsRef.current);
      return;
    }
    trace('tap', `bead-${row}-${p.bead}`);
    if (setRow(row, tapBead(p.bead, p.start))) speakAfter(rowsRef.current);
  };

  const onPointerCancel = (row: number) => () => {
    const p = press.current;
    if (!p || p.row !== row) return;
    press.current = null;
    setRow(row, p.start);
  };

  const onKeyDown = (row: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (!canSlide) return;
    const now = rowsRef.current[row] ?? 0;
    const next =
      e.key === 'ArrowLeft' || e.key === 'ArrowUp'
        ? now + 1
        : e.key === 'ArrowRight' || e.key === 'ArrowDown'
          ? now - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? BEADS
              : null;
    if (next === null) return;
    e.preventDefault();
    trace('move', `row-${row}`);
    if (setRow(row, next)) speakAfter(rowsRef.current);
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || !ready) return false;
    const r = responseFor(config, rowsRef.current, valueRef.current);
    if (!r) return false;
    onResponse(r);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        switch (action.op) {
          case 'slide': {
            const row = Number(action.args?.row ?? 0);
            const by = Math.trunc(Number(action.args?.count ?? 0));
            if ((row !== 0 && row !== 1) || row >= rowCount || !Number.isFinite(by)) break;
            // One bead at a time, so each slide is seen.
            const goal = clampBeads((rowsRef.current[row] ?? 0) + by);
            while ((rowsRef.current[row] ?? 0) !== goal) {
              const now = rowsRef.current[row] ?? 0;
              setRow(row, now + (goal > now ? 1 : -1));
              await pause(STEP_MS);
              if (!alive.current) return;
            }
            await pause(200);
            break;
          }
          case 'highlight': {
            const row = Number(action.args?.row ?? 0);
            const upTo = Number(action.args?.upTo ?? 0);
            setHighlight({ row, upTo });
            await pause(1200);
            if (alive.current) setHighlight(null);
            break;
          }
          case 'count-total': {
            let n = 0;
            for (let row = 0; row < rowCount; row++) {
              for (let bead = 0; bead < (rowsRef.current[row] ?? 0); bead++) {
                n += 1;
                setCounting({ row, bead });
                sayNumber(n);
                await pause(550);
                if (!alive.current) return;
              }
            }
            setCounting(null);
            // As the model: the total becomes the entered number.
            if (asks) {
              setEntryHighlight(n);
              await pause(400);
            }
            setValue(n);
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
        setEntryHighlight(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => setInvite(action),
  });

  const inviteTarget = (() => {
    if (!invite) return null;
    if (invite.op === 'answer' || invite.op === 'count-total') return asks ? 'entry' : 'check';
    return `row-${Number(invite.args?.row ?? 0)}`;
  })();
  const hand = (at: string, style?: CSSProperties) =>
    inviteTarget === at ? (
      <span className="ni-hand ni-rk__hand" style={style} aria-hidden="true">
        <HandPointerIcon />
      </span>
    ) : null;

  // ---------- render ----------

  const renderRow = (row: number) => {
    const count = rows[row] ?? 0;
    const beads = Array.from({ length: BEADS }, (_, i) => {
      const lit =
        (highlight && highlight.row === row && i < highlight.upTo) ||
        (counting && counting.row === row && counting.bead === i);
      return (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: beads are positional on the wire
          key={i}
          className="ni-rk__bead"
          data-tone={i < 5 ? 'a' : 'b'}
          data-pushed={i < count ? 'true' : undefined}
          data-lit={lit ? 'true' : undefined}
          data-counting={
            counting && counting.row === row && counting.bead === i ? 'true' : undefined
          }
          style={{ '--x': beadSlot(i, count) } as CSSProperties}
        />
      );
    });
    const name = rowName(row);
    const invited = inviteTarget === `row-${row}`;
    const cls = ['ni-rk__row', invited ? 'ni-invite' : ''].filter(Boolean).join(' ');
    const handAt = { left: `calc(${((count + 4.5) / ROW_SLOTS) * 100}% - 10px)` };
    if (reading) {
      return (
        <div key={row} className={cls} data-row={row} role="img" aria-label={name}>
          {beads}
        </div>
      );
    }
    return (
      <div
        key={row}
        className={cls}
        data-row={row}
        role="slider"
        tabIndex={canSlide ? 0 : -1}
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={BEADS}
        aria-valuenow={count}
        aria-disabled={canSlide ? undefined : true}
        aria-orientation="horizontal"
        onPointerDown={onPointerDown(row)}
        onPointerMove={onPointerMove(row)}
        onPointerUp={onPointerUp(row)}
        onPointerCancel={onPointerCancel(row)}
        onKeyDown={onKeyDown(row)}
      >
        {beads}
        {hand(`row-${row}`, handAt)}
      </div>
    );
  };

  const max = rowCount * BEADS;
  const pad = asks && max > TRAY_MAX;
  const check = (
    <span className="ni-rk__check">
      <CheckButton
        onPress={submit}
        disabled={!interactive || !ready}
        invited={inviteTarget === 'check'}
      />
      {hand('check')}
    </span>
  );

  return (
    <div
      className="ni-rk"
      data-tier={tier}
      data-rows={rowCount}
      data-entry={asks ? (pad ? 'pad' : 'tray') : undefined}
      data-disabled={disabled ? 'true' : undefined}
    >
      <div className="ni-rk__frame">
        <div className="ni-rk__rows">
          {Array.from({ length: rowCount }, (_, r) => renderRow(r))}
        </div>
      </div>
      <div className="ni-rk__controls">
        {asks ? (
          <div
            className={['ni-rk__entry', inviteTarget === 'entry' ? 'ni-invite' : '']
              .filter(Boolean)
              .join(' ')}
          >
            <NumberEntry
              max={max}
              value={value}
              onChange={(v) => {
                setInvite(null);
                setValue(v);
              }}
              disabled={!interactive}
              highlighted={entryHighlight}
              trace={trace}
              columns={6}
              onEnter={() => {
                if (!document.activeElement?.closest('[role="slider"], [role="button"]')) submit();
              }}
              check={pad ? check : undefined}
            />
            {hand('entry')}
          </div>
        ) : null}
        {pad ? null : check}
      </div>
    </div>
  );
}

export default RekenrekWidget;
