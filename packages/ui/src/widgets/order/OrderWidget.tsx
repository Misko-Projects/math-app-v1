import { formatModel } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { HandPointerIcon } from '../../primitives/icons';
import { useWidgetDemo, wait } from '../demo';
import { CheckButton, StimulusView, useAlive, useDemoPause, useSubmitGuard } from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './order.css';

/**
 * `order` (03 §5.5): numeral cards (or small pictures) start in a tray in the item's shuffled
 * order; the child puts each into the row of slots, left to right. Growing (or shrinking) pebbles
 * above the slots show the direction without words: small → big for `asc`, big → small for
 * `desc`. Drag, tap-to-place and keyboard all come from `useDragToTarget`; tapping a placed card
 * sends it back to the tray (trace `undo`). `fixed` slots hold a pinned card that cannot move.
 * "Check" waits until every slot is full, then answers `{ kind: 'numbers', values }` (values in
 * slot order) through the format model.
 *
 * Demo ops (03 §5.5): `drag {id, slot}`, `highlight {id}`, plus `answer {values}`.
 */

const OPS = ['drag', 'highlight', 'answer'] as const;
const FLY_MS = 480;

type Config = ConfigFor<'order'>;
type Item = Config['items'][number];
type SlotId = `slot-${number}`;

const slotId = (k: number): SlotId => `slot-${k}`;
const slotIndex = (id: SlotId) => Number(id.slice(5));
const isNumeral = (label: string | undefined) => label !== undefined && /^-?\d+$/.test(label);

/** A pebble for the direction cue (decorative; the cue row carries the name). */
function CuePebble({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className="ni-ord__pebble"
    >
      <path
        d="M8 36c0-14 11-26 25-26 13 0 23 9 23 22 0 13-10 22-24 22S8 49 8 36Z"
        fill="var(--color-sunshine)"
        stroke="var(--color-ink)"
        strokeWidth="4"
      />
      <path
        d="M20 26c3-4 7-6 12-6"
        stroke="var(--color-cloud)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** A push pin: this card is fixed in its slot. */
function PinIcon() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false">
      <path d="M24 30v14" stroke="var(--color-ink)" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M14 8h20l-3 10 6 8H11l6-8-3-10Z"
        fill="var(--color-coral)"
        stroke="var(--color-ink)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M19 12h10" stroke="var(--color-cloud)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface Flight {
  item: Item;
  from: DOMRect;
  to: DOMRect;
  moving: boolean;
}

function initialSlots(config: Config): (string | null)[] {
  const slots: (string | null)[] = config.items.map(() => null);
  for (const [slot, id] of Object.entries(config.fixed ?? {})) slots[Number(slot)] = id;
  return slots;
}

export function OrderWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { sayNumber } = useSpeech();
  const { speakOnTap } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();

  const [slots, setSlots] = useState<(string | null)[]>(() => initialSlots(config));
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const [highlight, setHighlight] = useState<string | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const interactive = !disabled && !demoBusy;
  const fixed = config.fixed ?? {};
  const fixedSlots = new Set(Object.keys(fixed).map(Number));
  const fixedIds = new Set(Object.values(fixed));
  const itemById = new Map(config.items.map((it) => [it.id, it]));
  const n = config.items.length;
  const complete = slots.every((s) => s !== null);

  const itemName = (it: Item) =>
    it.label ??
    (it.stimulus ? t('ui.order.picture', { n: config.items.indexOf(it) + 1 }) : String(it.value));
  const speakItem = (it: Item) => {
    // Numerals speak their name (06 §5); a picture's quantity is the child's to find.
    if (speakOnTap && (isNumeral(it.label) || (!it.label && !it.stimulus))) sayNumber(it.value);
  };

  /** Puts an item in a slot: its old slot frees up and the slot's occupant goes back to the tray. */
  const placeIn = (id: string, k: number) => {
    if (fixedSlots.has(k) || fixedIds.has(id) || k < 0 || k >= n) return;
    const next = slotsRef.current.map((x, i) => (x === id && !fixedSlots.has(i) ? null : x));
    next[k] = id;
    slotsRef.current = next;
    setSlots(next);
  };

  const dnd = useDragToTarget<string, SlotId>({
    disabled: !interactive,
    trace,
    // One card per slot: a full slot takes no card until its card is tapped back to the tray.
    // Keyboard play therefore jumps straight to the first empty slot.
    canPlace: (_item, target) => slotsRef.current[slotIndex(target)] === null,
    onSelect: (id) => {
      const it = id === null ? undefined : itemById.get(id);
      if (it) speakItem(it);
    },
    onPlace: ({ item, target }) => {
      setInvite(null);
      placeIn(item, slotIndex(target));
    },
  });

  const sendBack = (k: number) => {
    const id = slots[k];
    if (!interactive || id === null || id === undefined || fixedSlots.has(k)) return;
    trace('undo', id);
    const next = [...slotsRef.current];
    next[k] = null;
    slotsRef.current = next;
    setSlots(next);
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || !complete) return false;
    const model = formatModel('order');
    if (!model) return false;
    let state = model.initialState(config);
    slots.forEach((id, slot) => {
      if (id !== null && !fixedSlots.has(slot)) {
        state = model.apply(state, { op: 'drag', args: { id, slot } });
      }
    });
    const response = model.toResponse(state);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const rectOf = (selector: string) =>
    rootRef.current?.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;

  /** Flies an item's card to slot k (instant with reduced motion), then places it. */
  const demoDrag = async (id: string, k: number) => {
    const it = itemById.get(id);
    if (!it || fixedSlots.has(k) || fixedIds.has(id) || k < 0 || k >= n) return;
    setHighlight(id);
    speakItem(it);
    await pause(350);
    if (!alive.current) return;
    const from = rectOf(`[data-card="${CSS.escape(id)}"]`);
    const to = rectOf(`[data-slot-pad="${k}"]`);
    if (!reduced && from && to) {
      setFlight({ item: it, from, to, moving: false });
      await wait(20);
      if (!alive.current) return;
      setFlight({ item: it, from, to, moving: true });
      await wait(FLY_MS);
      if (!alive.current) return;
    }
    placeIn(id, k);
    setFlight(null);
    setHighlight(null);
    await pause(200);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'drag') {
          const id = action.args?.id;
          const k = Number(action.args?.slot);
          if (typeof id === 'string' && Number.isInteger(k)) await demoDrag(id, k);
        } else if (action.op === 'highlight') {
          const id = action.args?.id;
          const it = typeof id === 'string' ? itemById.get(id) : undefined;
          if (!it) return;
          setHighlight(it.id);
          speakItem(it);
          await pause(1200);
          if (alive.current) setHighlight(null);
        } else if (action.op === 'answer') {
          // The model decides which item goes where (equal values may swap, fixed slots stay).
          const model = formatModel('order');
          if (!model) return;
          const state = model.apply(model.initialState(config), action);
          if (model.toResponse(state) === null || !('slots' in state)) return;
          const target = state.slots as (string | null)[];
          for (let k = 0; k < target.length; k++) {
            const id = target[k];
            if (id === null || id === undefined || fixedSlots.has(k)) continue;
            if (slotsRef.current[k] === id) continue;
            await demoDrag(id, k);
            if (!alive.current) return;
          }
        }
      } finally {
        setFlight(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => setInvite(action),
  });

  const invitedCard =
    invite && (invite.op === 'drag' || invite.op === 'highlight')
      ? typeof invite.args?.id === 'string'
        ? invite.args.id
        : null
      : null;
  const invitedSlot = invite?.op === 'drag' ? Number(invite.args?.slot) : null;
  const trayInvited = invite?.op === 'answer';

  // ---------- render ----------

  const face = (it: Item) =>
    it.label !== undefined ? (
      <span className={isNumeral(it.label) ? 'ni-ord__numeral' : 'ni-ord__word'}>{it.label}</span>
    ) : it.stimulus ? (
      <StimulusView spec={it.stimulus} maxWidth={104} maxHeight={84} />
    ) : (
      <span className="ni-ord__numeral">{it.value}</span>
    );

  const asc = config.direction === 'asc';
  const cueSizes = Array.from({ length: n }, (_, k) => {
    const f = n === 1 ? 1 : k / (n - 1);
    return Math.round(26 + 34 * (asc ? f : 1 - f));
  });

  const flightStyle: CSSProperties | undefined = flight
    ? {
        left: flight.moving ? flight.to.left : flight.from.left,
        top: flight.moving ? flight.to.top : flight.from.top,
        width: flight.from.width,
        height: flight.from.height,
        transitionDuration: `${FLY_MS}ms`,
      }
    : undefined;

  const gridStyle = { '--n': n } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className="ni-ord"
      data-tier={tier}
      data-direction={config.direction}
      data-disabled={disabled ? 'true' : undefined}
    >
      <div className="ni-ord__board">
        <div
          className="ni-ord__cue"
          style={gridStyle}
          role="img"
          aria-label={t(asc ? 'ui.order.small-to-big' : 'ui.order.big-to-small')}
        >
          {cueSizes.map((size, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: one cue pebble per slot position
            <span key={k} className="ni-ord__cue-cell">
              <CuePebble size={size} />
            </span>
          ))}
          <svg
            className="ni-ord__arrow"
            viewBox="0 0 100 12"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M2 6h98" />
          </svg>
          <svg
            className="ni-ord__arrowhead"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M4 3l16 9-16 9V3Z" />
          </svg>
        </div>

        <div className="ni-ord__slots" style={gridStyle}>
          {slots.map((id, k) => {
            const isFixed = fixedSlots.has(k);
            const it = id === null ? undefined : itemById.get(id);
            const pad = dnd.targetProps(slotId(k), {
              label: t('ui.widget.blank', { n: k + 1 }),
              disabled: isFixed,
            });
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
              <div key={k} className="ni-ord__slot">
                <div
                  {...pad}
                  className={[pad.className, 'ni-ord__pad', invitedSlot === k ? 'ni-invite' : '']
                    .filter(Boolean)
                    .join(' ')}
                  data-slot-pad={k}
                />
                {it && isFixed ? (
                  <div
                    className="ni-ord__card"
                    data-fixed="true"
                    role="img"
                    aria-label={t('ui.order.fixed', { n: itemName(it) })}
                  >
                    {face(it)}
                    <span className="ni-ord__pin">
                      <PinIcon />
                    </span>
                  </div>
                ) : it ? (
                  <button
                    type="button"
                    className={['ni-ord__card', highlight === it.id ? 'ni-invite' : '']
                      .filter(Boolean)
                      .join(' ')}
                    data-placed={it.id}
                    aria-label={itemName(it)}
                    disabled={!interactive}
                    onClick={() => sendBack(k)}
                  >
                    {face(it)}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ni-ord__bottom">
        <fieldset
          className={['ni-ord__tray', trayInvited ? 'ni-invite' : ''].filter(Boolean).join(' ')}
          aria-label={t('ui.widget.numbers')}
        >
          {config.items
            .filter((it) => !fixedIds.has(it.id))
            .map((it) => {
              const placed = slots.includes(it.id);
              if (placed) {
                return <span key={it.id} className="ni-ord__ghost" aria-hidden="true" />;
              }
              const props = dnd.itemProps(it.id, { label: itemName(it) });
              return (
                <span key={it.id} className="ni-ord__home">
                  <div
                    {...props}
                    className={[
                      props.className,
                      'ni-ord__card',
                      highlight === it.id || invitedCard === it.id ? 'ni-invite' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-card={it.id}
                    data-flying={flight?.item.id === it.id ? 'true' : undefined}
                  >
                    {face(it)}
                  </div>
                  {invitedCard === it.id ? (
                    <span className="ni-hand ni-ord__hand">
                      <HandPointerIcon />
                    </span>
                  ) : null}
                </span>
              );
            })}
        </fieldset>
        <CheckButton onPress={submit} disabled={!interactive || !complete} />
      </div>

      {flight ? (
        <div className="ni-ord__card ni-ord__flight" style={flightStyle} aria-hidden="true">
          {face(flight.item)}
        </div>
      ) : null}
    </div>
  );
}

export default OrderWidget;
