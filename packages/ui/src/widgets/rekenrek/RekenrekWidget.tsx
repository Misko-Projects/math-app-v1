import type { WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { BigButton } from '../../primitives/BigButton';
import { ArrowIcon, BackIcon } from '../../primitives/icons';
import { DRAG_START_PX, TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import {
  CheckButton,
  NumberEntry,
  nextPadKey,
  type PadKey,
  type Size,
  useAlive,
  useCommitBarrier,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
  useWidgetRoom,
} from '../kit';
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
import { planRack, rowHeight } from './plan';
import './rekenrek.css';

/**
 * `rekenrek` (03 §5.5, concrete): one or two wires of ten beads in two groups of five (coral, then
 * white with an ink dot: they differ in lightness and by a mark, not by colour alone). Beads pushed
 * to the LEFT count.
 *
 * Each wire is one large slider target (its tap zone spans the whole wire, ≥ --target-min tall),
 * so beads sit close together the way real beads do while targets stay big and 16 px apart:
 * - **Tap** a bead: a bead on the right slides left with every bead before it; a bead on the left
 *   goes back right with every bead after it.
 * - **Drag** a bead left or right along the wire for the same move.
 * - **Keyboard:** focus a wire; ← / ↑ slide one more bead left, → / ↓ push one back, Home clears
 *   the wire, End fills it.
 *
 * `rowRule: fill-top-first` never blocks a move: the checker judges it. `read` shows the preset
 * (static) and asks for the number; `thenAsk: total` adds the number after the beads. Layout
 * follows the measured room (plan.ts): the widest beads that fit beside the answer, else the rack
 * with Next and then the answer step (Back, Check). Responses come from the engine model:
 * `{ rows, value? }` or a number.
 *
 * Demo ops (03 §5.5): `slide {row, count}`, `highlight {row, upTo}`, `count-total`, plus `answer`.
 */

const OPS = ['slide', 'highlight', 'count-total', 'answer'] as const;
const STEP_MS = 260;

type Config = ConfigFor<'rekenrek'>;
type Rows = [number, number];
type Step = 'rack' | 'ask';
type Cue = { at: 'cue'; cue: string } | { at: 'card'; value: number } | { at: 'key'; key: PadKey };

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
  const { speakOnTap, ageMode, tapOnly } = useUiPreferences();
  const { say, sayNumber } = useSpeech();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const committed = useCommitBarrier();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const room = useWidgetRoom(rootRef);
  // Beads glide only once the layout is measured (the first plan sizes them for an unbounded
  // room; that re-size must not animate).
  const measured = room !== null;
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    if (!measured) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [measured]);

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
  const [step, setStep] = useState<Step>('rack');
  const [demoBusy, setDemoBusy] = useState(false);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [highlight, setHighlight] = useState<{ row: number; upTo: number } | null>(null);
  const [counting, setCounting] = useState<{ row: number; bead: number } | null>(null);
  const [entryHighlight, setEntryHighlight] = useState<number | PadKey | null>(null);
  const press = useRef<Press | null>(null);

  const interactive = !disabled && !demoBusy;
  const canSlide = interactive && !reading;
  const ready = !asks || value !== null;
  const rowName = (r: number) =>
    t(r === 0 ? 'ui.widget.rekenrek.top' : 'ui.widget.rekenrek.bottom');
  const max = rowCount * BEADS;

  // ---------- layout (plan.ts) ----------

  const actRef = useRef<HTMLDivElement | null>(null);
  const [button, setButton] = useState<Size>(() => ({
    w: TARGET_PX[ageMode].big * 1.5,
    h: TARGET_PX[ageMode].big,
  }));
  useLayoutEffect(() => {
    const btn = actRef.current?.querySelector<HTMLElement>('.ni-btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const next = { w: Math.ceil(r.width), h: Math.ceil(r.height) + 6 };
    setButton((b) => (b.w === next.w && b.h === next.h ? b : next));
  });
  const input = useMemo(
    () => ({ ageMode, rows: rowCount, still: reading, askMax: asks ? max : null, button }),
    [ageMode, rowCount, reading, asks, max, button],
  );
  const plan = useMemo(
    () =>
      planRack(input, {
        w: room?.width ?? Number.POSITIVE_INFINITY,
        h: room?.height ?? Number.POSITIVE_INFINITY,
      }),
    [input, room],
  );
  const steps = plan.steps;
  const shownStep: Step = steps ? step : 'rack';
  const layout = shownStep === 'ask' && plan.ask ? plan.ask.arrangement : plan.arrangement;
  const entryLayout = shownStep === 'ask' ? (plan.ask?.entry ?? null) : plan.entry;

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
      // Tap-only (06 §7): a press never becomes a drag; it is a tap when it lifts.
      if (tapOnly || Math.abs(dx) < DRAG_START_PX) return;
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

  // Input goes away (disabled, or Pip starts a demo) mid-gesture: the gesture is cancelled and the
  // wire goes back to where it was, as useDragToTarget does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when input goes away
  useEffect(() => {
    if (canSlide) return;
    const p = press.current;
    if (!p) return;
    press.current = null;
    setRow(p.row, p.start);
  }, [canSlide]);

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

  // ---------- steps: Next and Back hand focus to each other ----------

  const refocus = useRef<string | null>(null);
  const goTo = (s: Step) => {
    if (!interactive) return;
    trace('tap', s === 'ask' ? 'next' : 'back');
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

  // ---------- demo mode (03 §6.3) ----------

  const toStep = async (s: Step) => {
    if (steps && step !== s) {
      setStep(s);
      await committed();
    }
  };

  const enterValue = async (v: number) => {
    if (asks) await toStep('ask');
    const kind = shownStep === 'ask' || !steps ? entryLayout?.kind : plan.ask?.entry.kind;
    if (kind === 'pad') {
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
          case 'slide': {
            const row = Number(action.args?.row ?? 0);
            const by = Math.trunc(Number(action.args?.count ?? 0));
            if ((row !== 0 && row !== 1) || row >= rowCount || !Number.isFinite(by)) break;
            await toStep('rack');
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
            await toStep('rack');
            const row = Number(action.args?.row ?? 0);
            const upTo = Number(action.args?.upTo ?? 0);
            setHighlight({ row, upTo });
            await pause(1200);
            if (alive.current) setHighlight(null);
            break;
          }
          case 'count-total': {
            await toStep('rack');
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
            if (asks) await enterValue(n);
            else setValue(n);
            break;
          }
          case 'answer': {
            const v = Number(action.args?.value);
            if (!Number.isFinite(v)) break;
            await enterValue(v);
            break;
          }
        }
      } finally {
        if (alive.current) {
          setCounting(null);
          setEntryHighlight(null);
          setDemoBusy(false);
        }
        await committed();
      }
    },
    invite: (action) => setInvite(action),
  });

  // ---------- the one invited control ----------

  const cue: Cue | null = (() => {
    if (!invite || !interactive) return null;
    const askValue = (v: number): Cue | null => {
      if (!asks) return { at: 'cue', cue: 'check' };
      if (steps && shownStep === 'rack') return { at: 'cue', cue: 'next' };
      if (value === v) return ready ? { at: 'cue', cue: 'check' } : null;
      if (entryLayout?.kind === 'pad') {
        const key = nextPadKey(v, value);
        return key ? { at: 'key', key } : null;
      }
      return { at: 'card', value: v };
    };
    switch (invite.op) {
      case 'slide': {
        if (reading) return null;
        if (shownStep === 'ask') return { at: 'cue', cue: 'back' };
        const row = Number(invite.args?.row ?? 0);
        return row === 0 || (row === 1 && rowCount === 2) ? { at: 'cue', cue: `row:${row}` } : null;
      }
      case 'count-total':
        return askValue(rows[0] + rows[1]);
      case 'answer': {
        const v = Number(invite.args?.value);
        return Number.isFinite(v) ? askValue(v) : null;
      }
      default:
        return null;
    }
  })();
  const cueOf = (c: string) => (cue?.at === 'cue' && cue.cue === c ? 'ni-invite' : '');
  const cueKey = cue
    ? `${cue.at}:${cue.at === 'cue' ? cue.cue : cue.at === 'card' ? cue.value : cue.key}|${shownStep}|${layout}`
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
      return el?.querySelector<HTMLElement>('.ni-btn') ?? el ?? null;
    },
    cueKey,
  );

  // ---------- render ----------

  const renderRow = (row: number, still: boolean) => {
    const count = rows[row] ?? 0;
    const beads = Array.from({ length: BEADS }, (_, i) => {
      const lit = highlight && highlight.row === row && i < highlight.upTo;
      const isCounting = counting && counting.row === row && counting.bead === i;
      return (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: beads are positional on the wire
          key={i}
          className="ni-rk__bead"
          data-tone={i < 5 ? 'a' : 'b'}
          data-pushed={i < count ? 'true' : undefined}
          data-lit={lit ? 'true' : undefined}
          data-counting={isCounting ? 'true' : undefined}
          style={{ '--x': beadSlot(i, count) } as CSSProperties}
        />
      );
    });
    const name = rowName(row);
    if (still) {
      return (
        <div
          key={row}
          className="ni-rk__row"
          data-row={row}
          role="img"
          aria-label={`${name}: ${count}`}
        >
          {beads}
        </div>
      );
    }
    return (
      <div
        key={row}
        className={['ni-rk__row', cueOf(`row:${row}`)].filter(Boolean).join(' ')}
        data-row={row}
        data-cue={`row:${row}`}
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
      </div>
    );
  };

  const rack = (bead: number, rowH: number, still: boolean, small: boolean) => (
    <div
      className="ni-rk__frame"
      data-small={small ? 'true' : undefined}
      style={{ '--rk-bead': `${bead}px`, '--rk-row': `${rowH}px` } as CSSProperties}
      {...(small ? { role: 'img', 'aria-label': t('ui.widget.picture') } : {})}
    >
      <div className="ni-rk__rows">
        {Array.from({ length: rowCount }, (_, r) => renderRow(r, still || small))}
      </div>
    </div>
  );

  const main =
    shownStep === 'ask' && plan.ask
      ? plan.ask.bead > 0
        ? rack(plan.ask.bead, Math.round(plan.ask.bead * 1.3), true, true)
        : null
      : rack(plan.bead, rowHeight(plan.bead, ageMode, reading), reading, false);

  const entryBlock =
    asks && entryLayout ? (
      <NumberEntry
        {...entryLayout}
        max={max}
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
          if (!document.activeElement?.closest('[role="slider"], [role="button"], button'))
            submit();
        }}
      />
    ) : null;

  const actions = (
    <div
      className="ni-rk__act"
      ref={actRef}
      data-dir={shownStep === 'ask' && plan.ask ? plan.ask.act : 'row'}
    >
      {steps && shownStep === 'rack' ? (
        <span className="ni-rk__btn" data-cue="next">
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
        <span className="ni-rk__btn" data-cue="back">
          <BigButton
            label="ui.btn.close"
            icon={<BackIcon />}
            tone="cloud"
            disabled={!interactive}
            onPress={() => goTo('rack')}
            className={cueOf('back') || undefined}
          />
        </span>
      ) : null}
      {!steps || shownStep === 'ask' ? (
        <span className="ni-rk__btn" data-cue="check">
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
      className="ni-rk"
      data-tier={tier}
      data-rows={rowCount}
      data-layout={layout}
      data-animate={animate ? 'true' : undefined}
      data-step={steps ? shownStep : undefined}
      data-disabled={disabled ? 'true' : undefined}
      style={handRootStyle}
    >
      {main ? <div className="ni-rk__main">{main}</div> : null}
      <div className="ni-rk__items">
        {shownStep === 'ask' || !steps ? entryBlock : null}
        {actions}
      </div>
      {inviteHand}
    </div>
  );
}

export default RekenrekWidget;
