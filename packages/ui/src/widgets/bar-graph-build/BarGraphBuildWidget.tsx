import {
  type BarGraphBuildState,
  chartSlots,
  type FormatModel,
  formatModel,
  positionId,
} from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, useMemo, useRef, useState } from 'react';
import { hashSeed, seededRandom } from '../../art/core/paint';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  ChartView,
  CheckButton,
  formatLength,
  ObjectSprite,
  type SlotGeometry,
  useAlive,
  useDemoPause,
  useInviteHand,
  useMeasuredBox,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './bar-graph-build.css';

/**
 * `bar-graph-build` (03 §5.5): build a chart from data. The data shows on the left (objects to
 * count, tally marks, a table of counts, or measurements); the chart starts empty (its categories
 * carry 0, so it never shows what it asks). The child adds marks one at a time: drag the mark
 * from the supply onto a row or column (bars grow by one, a picture, a tally mark or an X is
 * added), or tap the supply, then tap rows (the supply stays picked up, so each tap adds one),
 * or the keyboard (Enter on the supply, Enter on a row, arrows between rows).
 *
 * Undo where the mark sits: with no mark picked up, a tap on a row or column that holds marks
 * takes its last one back (Enter or Space then, Backspace or Delete at any time); the new count is
 * spoken and the undo traced. With a mark picked up the same tap adds, so an undo never takes a
 * tap meant to add. "Take one back" removes the last mark wherever it went. A tap on an empty row
 * with nothing picked up points at the supply.
 *
 * A full row (its count at the axis top) is a state the child can read and leave: the graph's
 * caption says how many a row holds ("5 is the most here.", spoken too) and the one cue is on
 * "Take one back".
 *
 * Every mark goes through the engine model, and Check sends its response `{ values }`
 * (chart.values): what the chart shows is exactly what is answered.
 *
 * An invite (`invite(op)`) puts its one cue on the first thing to touch: the supply while nothing
 * is picked up, then the invited row.
 *
 * Demo ops: `raise-bar {id, to}`, `add-picture {id, count?}`, `add-x {at, count?}`,
 * `tally {id, count?}` (marks appear one by one, counted aloud), plus `answer {values}`.
 */

const OPS = ['raise-bar', 'add-picture', 'add-x', 'tally', 'answer'] as const;

type Config = ConfigFor<'bar-graph-build'>;
type ItemId = 'mark' | 'half';

function useModel(): FormatModel<'bar-graph-build', BarGraphBuildState> {
  const model = formatModel('bar-graph-build');
  if (!model) throw new Error('bar-graph-build has no engine model');
  // The registry stores models type-erased; this one's state is BarGraphBuildState.
  return model as unknown as FormatModel<'bar-graph-build', BarGraphBuildState>;
}

/** The op that adds `count` marks to slot `i` in this mode. */
function addOp(config: Config, state: BarGraphBuildState, i: number, count: number): WidgetAction {
  const slot = chartSlots(config.chart)[i];
  const id = slot?.id ?? '';
  switch (config.mode) {
    case 'bars':
      return { op: 'raise-bar', args: { id, to: (state.values[i] ?? 0) + count } };
    case 'pictures':
      return { op: 'add-picture', args: { id, count } };
    case 'xs':
      return { op: 'add-x', args: { at: slot?.at ?? 0, count } };
    default:
      return { op: 'tally', args: { id, count } };
  }
}

/**
 * The objects to count in a deterministic shuffled order with a small jitter each (no
 * Math.random: same item, same picture); the board lays them on the grid that fits it best.
 */
export function objectCells(values: readonly number[], ids: readonly string[]) {
  const all = values.flatMap((n, c) => Array.from({ length: n }, () => ids[c] ?? 'pebble'));
  const rand = seededRandom(hashSeed(...values, all.length));
  const order = all.map((sprite, i) => ({ sprite, i, k: rand() }));
  order.sort((a, b) => a.k - b.k);
  return order.map((o) => ({
    sprite: o.sprite,
    dx: (rand() - 0.5) * 0.3,
    dy: (rand() - 0.5) * 0.3,
    tilt: Math.round((rand() - 0.5) * 24),
  }));
}

function DataObjects({
  config,
  width,
  height,
  label,
}: {
  config: Config;
  width: number;
  height: number;
  label: string;
}) {
  const cells = useMemo(
    () =>
      objectCells(
        config.data.values,
        config.chart.categories.map((c) => c.id),
      ),
    [config],
  );
  // The scatter takes the grid (three columns or more) that draws the objects largest in the box.
  const fit = (n: number) =>
    Math.min(64, (width - 24) / n, (height - 24) / Math.ceil(cells.length / n));
  let cols = 3;
  for (let n = 4; n <= Math.max(3, cells.length); n += 1) if (fit(n) > fit(cols)) cols = n;
  const rows = Math.max(1, Math.ceil(cells.length / cols));
  const cell = Math.max(28, fit(cols));
  return (
    <div
      className="ni-bgb__objects"
      role="img"
      aria-label={label}
      data-count={cells.length}
      style={{ width: cols * cell + 24, height: rows * cell + 24 }}
    >
      {cells.map((o, k) => {
        const c = { ...o, col: k % cols, row: Math.floor(k / cols) };
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the scatter is fixed for the item
            key={k}
            className="ni-bgb__object"
            data-sprite={c.sprite}
            style={
              {
                left: 12 + (c.col + 0.1 + c.dx) * cell,
                top: 12 + (c.row + 0.1 + c.dy) * cell,
                width: cell * 0.8,
                height: cell * 0.8,
                '--tilt': `${c.tilt}deg`,
              } as CSSProperties
            }
          >
            <ObjectSprite sprite={c.sprite} />
          </span>
        );
      })}
    </div>
  );
}

function TakeBackIcon() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false">
      <path
        d="M14 18h16a9 9 0 0 1 0 18H18M20 10l-8 8 8 8"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The supply chip's picture: what one mark looks like in this mode. */
function MarkIcon({ config, half }: { config: Config; half?: boolean }) {
  switch (config.mode) {
    case 'tally':
      return (
        <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false">
          <path d="M24 8v32" stroke="var(--color-ink)" strokeWidth="6" strokeLinecap="round" />
        </svg>
      );
    case 'xs':
      return (
        <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false">
          <path
            d="M13 13l22 22M35 13 13 35"
            stroke="var(--color-ink)"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'bars':
      return (
        <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false">
          <rect
            x="10"
            y="14"
            width="28"
            height="22"
            rx="3"
            fill="var(--color-sea-deep)"
            stroke="var(--color-sea-dark)"
            strokeWidth="3"
          />
          <path d="M10 25h28" stroke="var(--color-sea-dark)" strokeWidth="2" opacity="0.6" />
        </svg>
      );
    default: {
      const first = config.chart.categories[0]?.id ?? 'pebble';
      return (
        <span className="ni-bgb__stamp" data-half={half ? 'true' : undefined}>
          <span className="ni-bgb__stampart">
            <ObjectSprite sprite={first} />
          </span>
        </span>
      );
    }
  }
}

const MARK_KEY: Record<Config['mode'], string> = {
  tally: 'ui.widget.chart.mark.tally',
  pictures: 'ui.widget.chart.mark.picture',
  bars: 'ui.widget.chart.mark.block',
  xs: 'ui.widget.chart.mark.x',
};

export function BarGraphBuildWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const model = useModel();
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const { speakOnTap, ageMode } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  // The data and the chart share the room the tools leave; all three then sit together, centred
  // in the widget area (equal margins either side).
  const [layoutRef, layout] = useMeasuredBox<HTMLDivElement>();
  const [toolsRef, tools] = useMeasuredBox<HTMLDivElement>();
  const [state, setState] = useState<BarGraphBuildState>(() => model.initialState(config));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [history, setHistory] = useState<{ i: number; count: number }[]>([]);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  /** The slot the child tried to fill past the axis top (cleared by the next change). */
  const [full, setFull] = useState<string | null>(null);
  /** A tap on an empty row with nothing picked up: the cue goes to the supply. */
  const [nudge, setNudge] = useState(false);
  const interactive = !disabled && !demoBusy;
  const target = ageMode === 'k' ? 80 : 64;
  const slots = chartSlots(config.chart);
  const halves = config.mode === 'pictures' && config.chart.scale % 2 === 0;

  const apply = (action: WidgetAction) => {
    const next = model.apply(stateRef.current, action);
    stateRef.current = next;
    setState(next);
    return next;
  };

  const slotName = (i: number) => {
    const s = slots[i];
    if (!s) return '';
    return s.label ? t(s.label) : t('ui.widget.chart.at', { n: formatLength(s.at ?? 0) });
  };

  /** Adds `count` marks (symbols for pictures) to slot i, speaking the new count (06 §5). */
  const addMarks = (i: number, count: number, speak = speakOnTap) => {
    const before = stateRef.current.values[i] ?? 0;
    const next = apply(addOp(config, stateRef.current, i, count));
    const after = next.values[i] ?? 0;
    if (after === before) return false;
    if (speak) sayNumber(after);
    return true;
  };

  const place = useDragToTarget<ItemId, string>({
    disabled: !interactive,
    trace,
    onSelect: (item) => {
      if (item) setNudge(false);
      if (item && speakOnTap)
        say(item === 'half' ? 'ui.widget.chart.half-picture' : MARK_KEY[config.mode]);
    },
    onPlace: ({ item, target: id, via }) => {
      const i = slots.findIndex((s) => s.id === id);
      if (i < 0) return;
      const count = item === 'half' ? 0.5 : 1;
      setInvite(null);
      setNudge(false);
      if (addMarks(i, count)) {
        setFull(null);
        setHistory((h) => [...h, { i, count }]);
      } else {
        // The row is at the axis top: say so, show it, and point at the way out.
        trace('tap', `full-${id}`);
        setFull(id);
        say('ui.widget.chart.full', { n: formatLength(config.chart.axisMax) });
      }
      // The supply stays picked up after a tap or key placement, so each tap on a row adds one.
      if (via !== 'drag') place.select(item);
    },
  });

  const takeBack = () => {
    if (!interactive) return;
    const last = history.at(-1);
    trace('undo', 'take-back');
    if (!last) return;
    setFull(null);
    apply(addOp(config, stateRef.current, last.i, -last.count));
    setHistory((h) => h.slice(0, -1));
  };

  /**
   * Takes the last mark of slot i back, where it sits: the mark the child put there last (a half
   * picture if that was a half), or one mark of a chart the demonstration built.
   */
  const takeFrom = (i: number) => {
    const id = slots[i]?.id ?? '';
    const value = stateRef.current.values[i] ?? 0;
    if (!interactive || value <= 0) return false;
    const at = history.findLastIndex((h) => h.i === i);
    const symbols = value / (config.mode === 'pictures' ? config.chart.scale : 1);
    const count = at >= 0 ? (history[at]?.count ?? 1) : Number.isInteger(symbols) ? 1 : 0.5;
    trace('undo', `slot-${id}`);
    setFull(null);
    setInvite(null);
    const next = apply(addOp(config, stateRef.current, i, -count));
    if (speakOnTap) sayNumber(next.values[i] ?? 0);
    if (at >= 0) setHistory((h) => h.filter((_, k) => k !== at));
    return true;
  };

  /** A tap or key on a row with nothing picked up: its last mark comes back, or the supply is cued. */
  const touchLane = (i: number) => {
    if (!interactive || place.selected !== null) return false;
    if (takeFrom(i)) return true;
    trace('tap', `slot-${slots[i]?.id ?? ''}`);
    setNudge(true);
    return true;
  };

  const ready = model.toResponse(state) !== null;
  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    const response = model.toResponse(stateRef.current);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const slotOfAction = (action: WidgetAction | null): number => {
    if (!action) return -1;
    if (action.op === 'add-x') {
      const at = action.args?.at;
      return typeof at === 'number' ? slots.findIndex((s) => s.id === positionId(at)) : -1;
    }
    const id = action.args?.id;
    return typeof id === 'string' ? slots.findIndex((s) => s.id === id) : -1;
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      setFull(null);
      setNudge(false);
      place.select(null);
      try {
        if (action.op === 'answer') {
          apply(action);
          await pause(400);
          return;
        }
        const i = slotOfAction(action);
        if (i < 0) {
          apply(action); // malformed: the model ignores it
          return;
        }
        const id = slots[i]?.id ?? '';
        setFlash(id);
        // The marks this op adds, one at a time (pictures: whole symbols, then a half).
        const before = stateRef.current.values[i] ?? 0;
        const goal = model.apply(stateRef.current, action).values[i] ?? before;
        if (reduced || goal === before) {
          apply(action);
          if (goal !== before) sayNumber(goal);
          return;
        }
        const unit = config.mode === 'pictures' ? config.chart.scale : 1;
        const dir = goal > before ? 1 : -1;
        let v = before;
        while (v !== goal && alive.current) {
          const step = Math.min(Math.abs(goal - v), unit);
          const symbols = config.mode === 'pictures' ? step / unit : step;
          addMarks(i, dir * symbols, true);
          const now = stateRef.current.values[i] ?? goal;
          // A step the model refuses ends the playback (never a loop that cannot finish).
          if (now === v) break;
          v = now;
          await pause(420);
        }
        await pause(300);
      } finally {
        if (alive.current && !reduced) setFlash(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => {
      setFlash(null);
      setInvite(action);
    },
  });

  // ---------- render ----------

  const invitedSlot = invite && invite.op !== 'answer' ? slotOfAction(invite) : -1;
  const invitedId = slots[invitedSlot]?.id ?? null;
  // The cue is on the first thing to touch: the supply while nothing is picked up (an invited row
  // or a tap on an empty one), then the invited row once the mark is in hand.
  const inviteOnSupply = invitedId !== null && place.selected === null;
  const cueOnSupply = inviteOnSupply || nudge;
  // The demonstration hand hangs below the invited control (kit `useInviteHand`).
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) =>
      invitedId === null
        ? null
        : inviteOnSupply
          ? root.querySelector<HTMLElement>('.ni-bgb__chip[data-item="mark"]')
          : root.querySelector<HTMLElement>(`.ni-bgb__lane[data-slot="${CSS.escape(invitedId)}"]`),
    invitedId === null ? '' : inviteOnSupply ? 'supply' : `slot-${invitedId}`,
  );
  const pad = 6;
  const GAP = 16;
  /** A board's caption line ("Count them", "Your graph"). */
  const CAPTION = 28;
  /**
   * The data board's share of the room beside the tools; the child's graph takes the rest. A list
   * of measurements needs more (ten of them in three rows).
   */
  const DATA_SHARE = config.data.kind === 'measurements' ? 0.38 : 0.3;
  const stacked = (layout?.width ?? 1000) <= 760;
  let dataArea: { width: number; height: number } | null = null;
  let chartArea: { width: number; height: number } | null = null;
  if (layout && tools) {
    if (stacked) {
      const h = layout.height - tools.height - 2 * GAP;
      dataArea = { width: layout.width, height: Math.round(h * 0.4) };
      chartArea = { width: layout.width, height: h - dataArea.height };
    } else {
      const w = layout.width - tools.width - 2 * GAP;
      dataArea = { width: Math.round(w * DATA_SHARE), height: layout.height };
      chartArea = { width: w - dataArea.width, height: layout.height };
    }
  }
  /** The room inside a board, under its caption. */
  const inner = (a: { width: number; height: number }) => ({
    width: a.width - 2 * pad - 6,
    height: a.height - 2 * pad - 6 - CAPTION,
  });

  const renderOverlay = (g: { slots: SlotGeometry[] }) =>
    g.slots.map((s) => {
      const i = s.index;
      const base = place.targetProps(s.id, {
        label: t('ui.widget.chart.slot', { name: slotName(i), n: formatLength(s.value) }),
      });
      // With nothing picked up the row is the undo target of its own marks.
      const canUndo = interactive && place.selected === null && s.value > 0;
      const props = {
        ...base,
        'aria-disabled': canUndo ? undefined : base['aria-disabled'],
        onClick: (e: Parameters<typeof base.onClick>[0]) => {
          const idle = place.selected === null;
          base.onClick(e);
          if (idle) touchLane(i);
        },
        onKeyDown: (e: Parameters<typeof base.onKeyDown>[0]) => {
          if (e.repeat) return base.onKeyDown(e);
          const erase = e.key === 'Backspace' || e.key === 'Delete';
          const activate = e.key === 'Enter' || e.key === ' ';
          if (erase ? takeFrom(i) : activate && touchLane(i)) {
            e.preventDefault();
            return;
          }
          base.onKeyDown(e);
        },
      };
      const invited = invitedSlot === i && !inviteOnSupply;
      return (
        <span key={s.id} className="ni-bgb__laneslot" style={laneStyle(s)}>
          <span
            {...props}
            className={[props.className, 'ni-bgb__lane', invited ? 'ni-invite' : '']
              .filter(Boolean)
              .join(' ')}
            data-slot={s.id}
            data-flash={flash === s.id ? 'true' : undefined}
          />
        </span>
      );
    });

  const dataLabel = t('ui.widget.picture');
  const dataChart =
    config.data.kind === 'tally' || config.data.kind === 'table'
      ? {
          ...config.chart,
          kind: config.data.kind,
          scale: 1 as const,
          orientation: 'horizontal' as const,
          categories: config.chart.categories.map((c, i) => ({
            ...c,
            value: config.data.values[i] ?? 0,
          })),
          // The data's own top, so its marks are drawn as large as its board allows.
          axisMax: Math.max(1, ...config.data.values),
        }
      : null;

  return (
    <div
      ref={rootRef}
      className="ni-bgb"
      style={handRootStyle}
      data-tier={tier}
      data-mode={config.mode}
      data-disabled={disabled ? 'true' : undefined}
    >
      <div className="ni-bgb__layout" ref={layoutRef}>
        <div className="ni-bgb__data">
          {dataArea ? (
            <div className="ni-bgb__board" data-kind={config.data.kind} style={{ padding: pad }}>
              {/* What to count (the target) and the child's graph are labelled boards. */}
              <span className="ni-bgb__title" data-board="data">
                {t('ui.widget.chart.data-title')}
              </span>
              {config.data.kind === 'objects' ? (
                <DataObjects
                  config={config}
                  width={inner(dataArea).width}
                  height={inner(dataArea).height}
                  label={dataLabel}
                />
              ) : dataChart ? (
                <ChartView
                  chart={dataChart}
                  maxWidth={inner(dataArea).width}
                  maxHeight={inner(dataArea).height}
                  target={48}
                  padY={2}
                  names={false}
                  widgetLabels
                  label={dataLabel}
                />
              ) : (
                // One list item per measurement (DAT.03): a screen reader steps through them in
                // reading order, as a sighted child reads the cards.
                <ul
                  className="ni-bgb__lengths"
                  aria-label={t('ui.widget.chart.lengths')}
                  style={{ maxWidth: inner(dataArea).width }}
                >
                  {config.data.values.map((v, k) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: measurements keep their order
                    <li key={k} className="ni-bgb__length">
                      {formatLength(v)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
        <div className="ni-bgb__chart">
          {chartArea ? (
            <div className="ni-bgb__board" data-board="build" style={{ padding: pad }}>
              {/* The caption line also carries the full-row note (role="status": read out). */}
              <span
                className="ni-bgb__title"
                data-board="build"
                data-full={full === null ? undefined : 'true'}
                role="status"
              >
                {full === null
                  ? t('ui.widget.chart.build-title')
                  : t('ui.widget.chart.full', { n: formatLength(config.chart.axisMax) })}
              </span>
              <ChartView
                chart={config.chart}
                values={state.values}
                maxWidth={inner(chartArea).width}
                maxHeight={inner(chartArea).height}
                padY={2}
                target={target}
                label={t('ui.widget.chart.graph')}
                widgetLabels
                renderOverlay={renderOverlay}
                pointed={flash}
              />
            </div>
          ) : null}
        </div>
        <div className="ni-bgb__tools" ref={toolsRef}>
          <span className="ni-bgb__supply">
            {(halves ? (['mark', 'half'] as const) : (['mark'] as const)).map((item) => {
              const p = place.itemProps(item, {
                label: t(item === 'half' ? 'ui.widget.chart.half-picture' : MARK_KEY[config.mode]),
              });
              return (
                <button
                  key={item}
                  type="button"
                  {...p}
                  className={[
                    p.className,
                    'ni-bgb__chip',
                    cueOnSupply && item === 'mark' ? 'ni-invite' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-item={item}
                >
                  <MarkIcon config={config} half={item === 'half'} />
                </button>
              );
            })}
          </span>
          <button
            type="button"
            className={['ni-pad__key', 'ni-bgb__back', full === null ? '' : 'ni-invite']
              .filter(Boolean)
              .join(' ')}
            aria-label={t('ui.widget.chart.take-back')}
            disabled={!interactive || history.length === 0}
            onClick={takeBack}
          >
            <span className="ni-pad__icon">
              <TakeBackIcon />
            </span>
          </button>
          {/* Icon-only where the area is narrow, so the boards keep the room. */}
          <CheckButton
            onPress={submit}
            disabled={!interactive || !ready}
            compact={(layout?.width ?? 1200) < 1000}
          />
        </div>
      </div>
      {inviteHand}
    </div>
  );
}

/** The lane box a slot's drop target covers, in the chart's px. */
function laneStyle(s: SlotGeometry): CSSProperties {
  return { left: s.lane.x, top: s.lane.y, width: s.lane.w, height: s.lane.h };
}

export default BarGraphBuildWidget;
