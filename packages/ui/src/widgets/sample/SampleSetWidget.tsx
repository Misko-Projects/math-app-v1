import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { BigButton } from '../../primitives/BigButton';
import { CheckIcon, HandPointerIcon } from '../../primitives/icons';
import { NumberDisplay } from '../../primitives/NumberDisplay';
import { CHECK_DEBOUNCE_MS, DURATION_MS } from '../../tokens/tokens';
import { useWidgetDemo, wait } from '../demo';
import type { ConfigFor, WidgetProps } from '../types';

/**
 * SAMPLE WIDGET: the reference implementation of the registry contract (U01). It renders a small
 * subset of `make-set` (03 §5.5, mode `make`): drag pebbles from the pile into the basket, then
 * tap "check". It is NOT in the production registry; U03 owns the real `make-set` widget and its
 * state model (03 §6.3). Stories and tests register it locally to prove the contract end to end.
 *
 * What it demonstrates:
 * - `useDragToTarget` (drag, tap-to-place, keyboard, tap-only, snap radius) for the pile → basket;
 * - an interaction trace through `useInteractionTrace(onInteract)`;
 * - `onResponse({ kind: 'state', value: { count } })` once per "check" (debounced, 06 §4);
 * - demo mode via `useWidgetDemo`: ops `drag {count}`, `remove {count}` and `count-aloud`, with
 *   `invite` pulsing the basket under a hand pointer; instant with reduced motion (03 §6.3);
 * - `disabled` turning all input off.
 */

type PebbleId = `p${number}`;
type TargetId = 'basket';

const SAMPLE_OPS = ['drag', 'remove', 'count-aloud'] as const;
const PEBBLE_TONES = ['sea', 'sun', 'coral', 'leaf'] as const;
const FLY_MS = 480;

interface Flight {
  id: PebbleId;
  from: DOMRect;
  to: DOMRect;
  moving: boolean;
}

function Pebble({ tone }: { tone: (typeof PEBBLE_TONES)[number] }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" focusable="false">
      <ellipse cx="32" cy="54" rx="20" ry="5" fill="rgb(38 70 83 / 0.18)" />
      <path
        d="M10 34c0-12 9.5-22 23-22 12 0 21 8 21 20 0 11-9 19-22 19S10 45 10 34Z"
        className={`ni-pebble ni-pebble--${tone}`}
        strokeWidth="3"
      />
      <path
        d="M21 25c2.6-3.6 6.6-5.6 11-5.8"
        stroke="#fff"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.75"
        fill="none"
      />
    </svg>
  );
}

function BasketArt() {
  return (
    <svg
      className="ni-sample__basket-art"
      viewBox="0 0 400 120"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 10h388l-26 100a10 10 0 0 1-9.7 7.5H41.7A10 10 0 0 1 32 110L6 10Z"
        fill="var(--color-wood)"
        stroke="var(--color-wood-deep)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M20 44h360M28 76h344"
        stroke="var(--color-wood-deep)"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M80 12l10 104M140 12l5 104M200 12v104M260 12l-5 104M320 12l-10 104"
        stroke="var(--color-wood-deep)"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.45"
      />
      <rect
        x="2"
        y="2"
        width="396"
        height="20"
        rx="10"
        fill="var(--color-sun)"
        stroke="var(--color-wood-deep)"
        strokeWidth="5"
      />
    </svg>
  );
}

export function SampleSetWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<ConfigFor<'make-set'>>) {
  const narrationText = useNarrationText();
  const { speakOnTap } = useUiPreferences();
  const reduced = useReducedMotion();
  const { sayNumber } = useSpeech();
  const trace = useInteractionTrace(onInteract);

  const supply = Math.max(0, Math.min(config.source.supply, 20));
  const capacity = Math.max(1, config.capacity);
  const allIds = useMemo(
    () => Array.from({ length: supply }, (_, i) => `p${i}` as PebbleId),
    [supply],
  );
  const [inBasket, setInBasket] = useState<PebbleId[]>(() =>
    allIds.slice(0, Math.min(config.start ?? 0, supply)),
  );
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [counting, setCounting] = useState<number | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const basketRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Demo playback awaits commits; it must never outlive this widget instance (WidgetHost remounts
  // per item). `alive` stops loops, and unmount settles every pending wait.
  const alive = useRef(true);
  const commitWaiters = useRef<{ ready: () => boolean; resolve: () => void }[]>([]);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const waiters = commitWaiters.current;
      commitWaiters.current = [];
      for (const w of waiters) w.resolve();
    };
  }, []);
  /** The basket state of the latest commit. */
  const committedBasket = useRef(inBasket);
  // After each commit, release the waits whose condition the committed DOM now meets.
  useLayoutEffect(() => {
    committedBasket.current = inBasket;
    if (commitWaiters.current.length === 0) return;
    commitWaiters.current = commitWaiters.current.filter((w) => {
      if (!w.ready()) return true;
      w.resolve();
      return false;
    });
  });
  /** Resolves after a commit that satisfies `ready` (or when the widget unmounts). */
  const afterCommitWhere = (ready: () => boolean) =>
    new Promise<void>((resolve) => {
      commitWaiters.current.push({ ready, resolve });
    });
  const inBasketRef = useRef(inBasket);
  inBasketRef.current = inBasket;

  const pile = allIds.filter((id) => !inBasket.includes(id));
  const full = inBasket.length >= capacity;
  const interactive = tier === 'concrete' && !disabled && !demoBusy;
  const pebbleName = narrationText('ui.widget.pebble');

  const addToBasket = useCallback(
    (id: PebbleId) => {
      setInBasket((prev) => {
        if (prev.includes(id) || prev.length >= capacity) return prev;
        const next = [...prev, id];
        if (speakOnTap) sayNumber(next.length);
        return next;
      });
    },
    [capacity, sayNumber, speakOnTap],
  );

  const dnd = useDragToTarget<PebbleId, TargetId>({
    disabled: !interactive,
    trace,
    canPlace: () => inBasketRef.current.length < capacity,
    onPlace: ({ item }) => {
      setInvite(null);
      addToBasket(item);
    },
  });

  const takeOut = (id: PebbleId) => {
    if (!interactive) return;
    trace('undo', id);
    setInBasket((prev) => prev.filter((p) => p !== id));
  };

  // ---------- demo mode (03 §6.3) ----------

  const rect = (selector: string) =>
    rootRef.current?.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
  const slotRect = (index: number) =>
    rootRef.current
      ?.querySelectorAll<HTMLElement>('.ni-sample__slot')
      [index]?.getBoundingClientRect() ?? null;

  /** Flies a pebble between two measured rects; `land` commits the state as the flight ends. */
  const flyBetween = async (id: PebbleId, from: DOMRect, to: DOMRect, land?: () => void) => {
    setFlight({ id, from, to, moving: false });
    await wait(20);
    setFlight({ id, from, to, moving: true });
    await wait(FLY_MS);
    land?.();
    setFlight(null);
  };

  const countFromAction = (action: WidgetAction) => {
    const n = Number(action.args?.count ?? 1);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  };

  useWidgetDemo(demo, {
    ops: SAMPLE_OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'drag') {
          for (let i = 0; i < countFromAction(action); i++) {
            const next = allIds.find((id) => !inBasketRef.current.includes(id));
            if (!next || inBasketRef.current.length >= capacity) break;
            const count = inBasketRef.current.length + 1;
            const land = () => {
              inBasketRef.current = [...inBasketRef.current, next];
              setInBasket(inBasketRef.current);
            };
            // Pile pebble → the next empty ten-frame slot.
            const from = rect(`.ni-sample__pile [data-pebble="${next}"]`);
            const to = slotRect(count - 1);
            trace('drag', next);
            if (!reduced && from && to) await flyBetween(next, from, to, land);
            else land();
            if (!alive.current) return;
            trace('drop', 'basket');
            sayNumber(count);
            await wait(reduced ? 0 : DURATION_MS.gentle);
            if (!alive.current) return;
          }
        } else if (action.op === 'remove') {
          for (let i = 0; i < countFromAction(action); i++) {
            const last = inBasketRef.current.at(-1);
            if (!last) break;
            // Its slot in the basket → its place back in the pile. One batched update (the flying
            // copy covers the slot; the pile copy renders hidden beneath it), then measure the
            // pile copy once React has committed. No flushSync: play may run inside a React
            // effect. With reduced motion it is an instant state change (03 §6.3).
            const from = reduced ? null : rect(`.ni-sample__in[data-pebble="${last}"]`);
            inBasketRef.current = inBasketRef.current.slice(0, -1);
            if (!from) {
              setInBasket(inBasketRef.current);
              continue;
            }
            const pileSelector = `.ni-sample__pile [data-pebble="${last}"]`;
            const committed = afterCommitWhere(() => rect(pileSelector) !== null);
            setInBasket(inBasketRef.current);
            setFlight({ id: last, from, to: from, moving: false });
            await committed;
            if (!alive.current) return;
            const to = rect(pileSelector);
            if (to) await flyBetween(last, from, to);
            else setFlight(null);
            if (!alive.current) return;
          }
        } else if (action.op === 'count-aloud') {
          for (let i = 0; i < inBasketRef.current.length; i++) {
            setCounting(i);
            sayNumber(i + 1);
            await wait(reduced ? 0 : 650);
            if (!alive.current) return;
          }
          setCounting(null);
        }
        // Resolve only once React has committed the op's last basket update. A reduced-motion op
        // is a plain state change, so without this, play could resolve before the screen shows it.
        if ((action.op === 'drag' || action.op === 'remove') && alive.current) {
          const latest = inBasketRef.current;
          const committed = () => committedBasket.current === latest;
          if (!committed()) await afterCommitWhere(committed);
        }
      } finally {
        setDemoBusy(false);
      }
    },
    invite: (action) => setInvite(action),
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

  const basketProps = dnd.targetProps('basket', {
    label: narrationText('ui.widget.basket'),
    disabled: full,
  });

  return (
    <div
      ref={rootRef}
      className="ni-sample"
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
    >
      <fieldset className="ni-sample__pile" aria-label={narrationText('ui.widget.supply')}>
        {pile.map((id) => {
          const index = allIds.indexOf(id);
          const props = dnd.itemProps(id, { label: `${pebbleName} ${index + 1}` });
          return (
            <div
              key={id}
              {...props}
              className={`${props.className} ni-sample__pebble`}
              data-pebble={id}
              data-flying={flight?.id === id ? 'true' : undefined}
            >
              <Pebble tone={PEBBLE_TONES[index % PEBBLE_TONES.length] ?? 'sea'} />
            </div>
          );
        })}
      </fieldset>

      <div className="ni-sample__side">
        <div
          ref={basketRef}
          className={['ni-sample__basket', invite ? 'ni-invite' : ''].join(' ')}
          data-full={full ? 'true' : undefined}
        >
          {/* The drop target is a pad behind the slots, so the pebbles inside stay separate
              buttons (no nested interactive elements). */}
          <div
            {...basketProps}
            className={`${basketProps.className} ni-sample__pad`}
            data-basket-pad=""
          />
          <div className="ni-sample__slots">
            {Array.from({ length: Math.max(10, Math.ceil(capacity / 5) * 5) }, (_, i) => {
              const id = inBasket[i];
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: ten-frame slots are positional
                <div key={i} className="ni-sample__slot">
                  {id ? (
                    <button
                      type="button"
                      className="ni-sample__in"
                      data-counting={counting === i ? 'true' : undefined}
                      data-pebble={id}
                      aria-label={`${pebbleName} ${allIds.indexOf(id) + 1}`}
                      tabIndex={interactive ? 0 : -1}
                      disabled={!interactive}
                      onClick={(e) => {
                        e.stopPropagation();
                        takeOut(id);
                      }}
                    >
                      <Pebble
                        tone={PEBBLE_TONES[allIds.indexOf(id) % PEBBLE_TONES.length] ?? 'sea'}
                      />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <BasketArt />
          {invite ? (
            <span className="ni-hand" style={{ left: 'calc(50% - 28px)', top: -44 }}>
              <HandPointerIcon />
            </span>
          ) : null}
        </div>

        <div className="ni-sample__actions">
          {config.showRunningCount ? <NumberDisplay value={inBasket.length} size="md" /> : null}
          <BigButton
            label="ui.btn.check"
            icon={<CheckIcon />}
            tone="sun"
            debounceMs={CHECK_DEBOUNCE_MS}
            disabled={!interactive}
            onPress={() =>
              onResponse({
                kind: 'state',
                value: config.groupsOf
                  ? { count: inBasket.length, groupsOf: config.groupsOf }
                  : { count: inBasket.length },
              })
            }
          />
        </div>
      </div>

      {flight ? (
        <div className="ni-sample__flight" style={flightStyle} aria-hidden="true">
          <Pebble tone={PEBBLE_TONES[allIds.indexOf(flight.id) % PEBBLE_TONES.length] ?? 'sea'} />
        </div>
      ) : null}
    </div>
  );
}

export default SampleSetWidget;
