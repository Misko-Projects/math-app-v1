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
import { HandPointerIcon } from '../../primitives/icons';
import { useWidgetDemo } from '../demo';
import {
  ChartView,
  CheckButton,
  ObjectSprite,
  type SlotGeometry,
  useAlive,
  useDemoPause,
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
 * or the keyboard (Enter on the supply, Enter on a row, arrows between rows). "Take one back"
 * removes the last mark. Every mark goes through the engine model, and Check sends its response
 * `{ values }` (chart.values): what the chart shows is exactly what is answered.
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

/** Pip's hand on a target (one helper, so it is easy to swap for the kit's useInviteHand later). */
function InviteHand({ className }: { className: string }) {
  return (
    <span className={`ni-hand ${className}`}>
      <HandPointerIcon />
    </span>
  );
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

/** A measurement as written: whole number plus ½, ¼ or ¾. */
export function formatLength(v: number): string {
  const whole = Math.floor(v);
  const frac = Math.round((v - whole) * 4);
  const glyph = ['', '¼', '½', '¾'][frac] ?? '';
  return whole === 0 && glyph ? glyph : `${whole}${glyph}`;
}

/** Deterministic scatter cells for the objects to count (no Math.random: same item, same picture). */
export function objectCells(values: readonly number[], ids: readonly string[]) {
  const all = values.flatMap((n, c) => Array.from({ length: n }, () => ids[c] ?? 'pebble'));
  const rand = seededRandom(hashSeed(...values, all.length));
  const order = all.map((sprite, i) => ({ sprite, i, k: rand() }));
  order.sort((a, b) => a.k - b.k);
  const cols = Math.max(3, Math.ceil(Math.sqrt(all.length * 1.6)));
  return order.map((o, j) => ({
    sprite: o.sprite,
    col: j % cols,
    row: Math.floor(j / cols),
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
  const cols = Math.max(1, ...cells.map((c) => c.col + 1));
  const rows = Math.max(1, ...cells.map((c) => c.row + 1));
  const cell = Math.max(28, Math.min(64, (width - 24) / cols, (height - 24) / rows));
  return (
    <div
      className="ni-bgb__objects"
      role="img"
      aria-label={label}
      data-count={cells.length}
      style={{ width: cols * cell + 24, height: rows * cell + 24 }}
    >
      {cells.map((c, k) => (
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
      ))}
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
  const [chartRef, chartArea] = useMeasuredBox<HTMLDivElement>();
  const [dataRef, dataArea] = useMeasuredBox<HTMLDivElement>();
  const [state, setState] = useState<BarGraphBuildState>(() => model.initialState(config));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [history, setHistory] = useState<{ i: number; count: number }[]>([]);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
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
      if (item && speakOnTap)
        say(item === 'half' ? 'ui.widget.chart.half-picture' : MARK_KEY[config.mode]);
    },
    onPlace: ({ item, target: id, via }) => {
      const i = slots.findIndex((s) => s.id === id);
      if (i < 0) return;
      const count = item === 'half' ? 0.5 : 1;
      setInvite(null);
      if (addMarks(i, count)) setHistory((h) => [...h, { i, count }]);
      // The supply stays picked up after a tap or key placement, so each tap on a row adds one.
      if (via !== 'drag') place.select(item);
    },
  });

  const takeBack = () => {
    if (!interactive) return;
    const last = history.at(-1);
    trace('undo', 'take-back');
    if (!last) return;
    apply(addOp(config, stateRef.current, last.i, -last.count));
    setHistory((h) => h.slice(0, -1));
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
          v = stateRef.current.values[i] ?? goal;
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
  const pad = 8;

  const renderOverlay = (g: { slots: SlotGeometry[] }) =>
    g.slots.map((s) => {
      const i = s.index;
      const props = place.targetProps(s.id, {
        label: t('ui.widget.chart.slot', { name: slotName(i), n: formatLength(s.value) }),
      });
      const invited = invitedSlot === i;
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
          {invited ? <InviteHand className="ni-bgb__hand" /> : null}
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
          axisMax: Math.max(config.chart.axisMax, ...config.data.values),
        }
      : null;

  return (
    <div
      className="ni-bgb"
      data-tier={tier}
      data-mode={config.mode}
      data-disabled={disabled ? 'true' : undefined}
    >
      <div className="ni-bgb__layout">
        <div className="ni-bgb__data" ref={dataRef}>
          {dataArea ? (
            <div className="ni-bgb__board" data-kind={config.data.kind}>
              {config.data.kind === 'objects' ? (
                <DataObjects
                  config={config}
                  width={dataArea.width - 22}
                  height={dataArea.height - 22}
                  label={dataLabel}
                />
              ) : dataChart ? (
                <ChartView
                  chart={dataChart}
                  maxWidth={dataArea.width - 22}
                  maxHeight={dataArea.height - 22}
                  target={48}
                  label={dataLabel}
                />
              ) : (
                <div className="ni-bgb__lengths" role="img" aria-label={dataLabel}>
                  {config.data.values.map((v, k) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: measurements keep their order
                    <span key={k} className="ni-bgb__length">
                      {formatLength(v)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="ni-bgb__chart" ref={chartRef}>
          {chartArea ? (
            <div className="ni-bgb__board" style={{ padding: pad }}>
              <ChartView
                chart={config.chart}
                values={state.values}
                maxWidth={chartArea.width - 2 * pad - 6}
                maxHeight={chartArea.height - 2 * pad - 6}
                target={target}
                label={t('ui.widget.chart.graph')}
                renderOverlay={renderOverlay}
                pointed={flash}
              />
            </div>
          ) : null}
        </div>
        <div className="ni-bgb__tools">
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
                  className={`${p.className} ni-bgb__chip`}
                  data-item={item}
                >
                  <MarkIcon config={config} half={item === 'half'} />
                </button>
              );
            })}
          </span>
          <button
            type="button"
            className="ni-pad__key ni-bgb__back"
            aria-label={t('ui.widget.chart.take-back')}
            disabled={!interactive || history.length === 0}
            onClick={takeBack}
          >
            <span className="ni-pad__icon">
              <TakeBackIcon />
            </span>
          </button>
          <CheckButton onPress={submit} disabled={!interactive || !ready} />
        </div>
      </div>
    </div>
  );
}

/** The lane box a slot's drop target covers, in the chart's px. */
function laneStyle(s: SlotGeometry): CSSProperties {
  return { left: s.lane.x, top: s.lane.y, width: s.lane.w, height: s.lane.h };
}

export default BarGraphBuildWidget;
