import {
  type ClockSetState,
  clockText,
  formatModel,
  onFace,
  snapTime,
  timeOf,
} from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useTapToPlace } from '../../interaction/useTapToPlace';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  CheckButton,
  ClockFace,
  clockHandAt,
  DigitalClock,
  faceTime,
  useAlive,
  useDemoPause,
  useInviteHand,
  useRoomy,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './clock-set.css';

/**
 * `clock-set` (03 §5.5, concrete): turn the clock's hands to a time. The hands are geared (U05):
 * one time drives both, so turning the long hand past 12 carries the short hand on to the next
 * hour (or back), and turning the short hand winds the long one round with it; at 3:30 the short
 * hand is exactly halfway between 3 and 4. The long hand snaps to `precision` minutes.
 *
 * - Drag: press a hand, anywhere along it, and turn it. A press off the hands turns the short hand
 *   near the middle and the long hand out by the numbers. The hands follow the finger smoothly and
 *   settle on the snapped time. Turning a hand back undoes a turn: the hand is its own undo.
 * - Tap-to-place: tap "the long hand" or "the short hand" (it lights up and is named), then tap the
 *   face where it should point (`useTapToPlace`: items `hand-minute`, `hand-hour`, target `face`).
 *   Tapping the face with no hand chosen says the nearest number.
 * - Keyboard: the hand buttons turn their hand with the arrow keys (a `precision` step, or an
 *   hour); Enter chooses the hand for a tap.
 *
 * Every move is applied to the engine model as `drag-minute {to: m}` then `drag-hour {to: h}`,
 * which sets h:m from any start (formats/clock-set.ts); "check" sends the model's `{ h, m }`.
 * Demo ops: `drag-minute`, `drag-hour` (the hands sweep there, geared), `count-fives`,
 * `highlight-hand`.
 */

const OPS = ['drag-minute', 'drag-hour', 'count-fives', 'highlight-hand'] as const;
/** The face's diameter: 288 px, and larger where the area is roomy (kit `useRoomy`). */
const FACE_PX = 288;
const FACE_ROOMY_PX = 392;

type Config = ConfigFor<'clock-set'>;
type Hand = 'hour' | 'minute';
type Item = 'hand-minute' | 'hand-hour';

/** Degrees clockwise from 12 of a point relative to the face's centre. */
const angleOf = (dx: number, dy: number) => ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;

/** The shortest signed difference a → b on a circle of `n`. */
const shortest = (a: number, b: number, n: number) => {
  const d = (((b - a) % n) + n) % n;
  return d > n / 2 ? d - n : d;
};

export function ClockSetWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const { speakOnTap, tapOnly } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const [roomy, areaRef] = useRoomy();
  const facePx = roomy ? FACE_ROOMY_PX : FACE_PX;
  const alive = useAlive();
  const pause = useDemoPause();
  const model = formatModel('clock-set');
  const [state, setState] = useState<ClockSetState>(
    () => model?.initialState(config) as ClockSetState,
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  /** The time the hands show while a finger turns them or a demo sweeps them (unsnapped). */
  const [live, setLive] = useState<number | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [lit, setLit] = useState<Hand | null>(null);
  const [fives, setFives] = useState<{ from: number; to: number } | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const interactive = !disabled && !demoBusy;
  const shown = live ?? state.t;

  const apply = (action: WidgetAction) => {
    const prev = stateRef.current;
    if (!model) return prev;
    const next = model.apply(prev, action) as ClockSetState;
    stateRef.current = next;
    setState(next);
    return next;
  };

  /** Moves the hands to face time `target` (snapped) through the engine model. */
  const setTime = (target: number) => {
    const { h, m } = timeOf(snapTime(target, config.precision));
    apply({ op: 'drag-minute', args: { to: m } });
    apply({ op: 'drag-hour', args: { to: h } });
  };

  const handName = (hand: Hand) =>
    t(hand === 'minute' ? 'ui.clock.long-hand' : 'ui.clock.short-hand');

  // ---------- tap-to-place: choose a hand, tap where it points ----------

  const tapAt = useRef<{ x: number; y: number } | null>(null);
  const faceRef = useRef<HTMLDivElement | null>(null);
  const pointAngle = (clientX: number, clientY: number) => {
    const r = faceRef.current?.getBoundingClientRect();
    if (!r) return null;
    // The rendered face: a circle as wide as its box, at the top of it (its shadow hangs below).
    const cx = r.left + r.width / 2;
    const cy = r.top + r.width / 2;
    return {
      deg: angleOf(clientX - cx, clientY - cy),
      dist: Math.hypot(clientX - cx, clientY - cy),
      /** Distance from the centre in face units (the face is 200 units across). */
      units: Math.hypot(clientX - cx, clientY - cy) / (r.width / 200),
    };
  };

  const place = useTapToPlace<Item, 'face'>({
    disabled: !interactive,
    trace,
    onSelect: (item) => {
      if (item && speakOnTap)
        say(item === 'hand-minute' ? 'ui.clock.long-hand' : 'ui.clock.short-hand');
      setInvite(null);
    },
    onPlace: ({ item }) => {
      const at = tapAt.current;
      tapAt.current = null;
      if (!at) return;
      const p = pointAngle(at.x, at.y);
      if (!p) return;
      const cur = stateRef.current.t;
      if (item === 'hand-minute') {
        // The long hand to the tapped minute, the shorter way round (12 carries the hour).
        const to = snapTime(p.deg / 6, config.precision) % 60;
        setTime(cur + shortest(cur % 60, to, 60));
      } else {
        // The short hand to the tapped point: 2 face minutes a degree; the long hand follows.
        setTime(cur + shortest(cur, p.deg * 2, 720));
      }
    },
  });
  const selectedHand: Hand | null =
    place.selected === 'hand-minute' ? 'minute' : place.selected === 'hand-hour' ? 'hour' : null;

  // ---------- drag: turn a hand anywhere on the face ----------

  const drag = useRef<{
    hand: Hand;
    id: number;
    tCont: number;
    lastRaw: number;
    moved: boolean;
  } | null>(null);
  const dragged = useRef(false);

  const onFacePointerDown = (e: ReactPointerEvent) => {
    if (!interactive || tapOnly || drag.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = pointAngle(e.clientX, e.clientY);
    if (!p) return;
    // The hand under the finger, wherever along it; off the hands, near the middle is the short
    // hand and out by the numbers the long one (kit `clockHandAt`).
    const u = p.units;
    const a = (p.deg * Math.PI) / 180;
    const hand: Hand = clockHandAt(u * Math.sin(a), -u * Math.cos(a), stateRef.current.t);
    const raw = hand === 'minute' ? p.deg / 6 : p.deg * 2;
    drag.current = { hand, id: e.pointerId, tCont: stateRef.current.t, lastRaw: raw, moved: false };
    dragged.current = false;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      // Synthetic pointers (tests) cannot be captured; the element still gets the events.
    }
  };

  const onFacePointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const p = pointAngle(e.clientX, e.clientY);
    if (!p) return;
    const raw = d.hand === 'minute' ? p.deg / 6 : p.deg * 2;
    const step = shortest(d.lastRaw, raw, d.hand === 'minute' ? 60 : 720);
    if (!d.moved && Math.abs(step) < (d.hand === 'minute' ? 0.6 : 3)) return;
    if (!d.moved) {
      d.moved = true;
      dragged.current = true;
      trace('drag', `hand-${d.hand}`);
      setLit(d.hand);
    }
    d.lastRaw = raw;
    d.tCont += step;
    setLive(d.tCont);
  };

  const endDrag = (e: ReactPointerEvent, commit: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.moved) return;
    setLit(null);
    setLive(null);
    if (commit) {
      trace('drop', 'face');
      setTime(d.tCont);
    }
  };

  const facePad = place.targetProps('face', { label: t('ui.clock.face') });

  const onFaceClick = (e: MouseEvent) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (!interactive) return;
    if (place.selected) {
      tapAt.current = { x: e.clientX, y: e.clientY };
      facePad.onClick(e);
      return;
    }
    // No hand chosen: the face says the number nearest the tap (06 §5).
    const p = pointAngle(e.clientX, e.clientY);
    if (p && speakOnTap) {
      const n = Math.round(p.deg / 30) % 12 || 12;
      trace('tap', `numeral-${n}`);
      sayNumber(n);
    }
  };

  // ---------- keyboard: arrows turn the focused hand ----------

  const onHandKey = (hand: Hand, base: (e: KeyboardEvent) => void) => (e: KeyboardEvent) => {
    const dir =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -1
          : 0;
    if (dir === 0) {
      base(e);
      return;
    }
    e.preventDefault();
    if (!interactive) return;
    const step = hand === 'minute' ? config.precision : 60;
    trace('move', `hand-${hand}`);
    setTime(stateRef.current.t + dir * step);
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || !model) return false;
    const r = model.toResponse(stateRef.current);
    if (!r) return false;
    onResponse(r);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const raf = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  /** Sweeps the hands from `from` to `to` (face minutes, signed path), geared all the way. */
  const sweep = (from: number, to: number) =>
    new Promise<void>((resolve) => {
      if (reduced || from === to) {
        resolve();
        return;
      }
      const ms = Math.max(450, Math.min(1600, Math.abs(to - from) * 9));
      const start = performance.now();
      const frame = (now: number) => {
        if (!alive.current) return resolve();
        const k = Math.min(1, (now - start) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        setLive(from + (to - from) * e);
        if (k < 1) raf.current = requestAnimationFrame(frame);
        else resolve();
      };
      raf.current = requestAnimationFrame(frame);
    });

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      if (!model) return;
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'drag-minute' || action.op === 'drag-hour') {
          const hand: Hand = action.op === 'drag-minute' ? 'minute' : 'hour';
          const from = stateRef.current.t;
          const next = model.apply(stateRef.current, action) as ClockSetState;
          // The path the model took: the long hand's turn, or the short hand's shorter way.
          const delta =
            action.op === 'drag-minute'
              ? (() => {
                  const dir = action.args?.dir;
                  const fwd = onFace(next.t - from);
                  if (dir === 'cw') return fwd;
                  if (dir === 'ccw') return fwd === 0 ? 0 : fwd - 720;
                  return shortest(from, next.t, 720);
                })()
              : shortest(from, next.t, 720);
          setLit(hand);
          await sweep(from, from + delta);
          if (!alive.current) return;
          setLive(null);
          apply(action);
          await pause(400);
          setLit(null);
        } else if (action.op === 'count-fives') {
          const next = model.apply(stateRef.current, action) as ClockSetState;
          apply(action);
          const f = next.fives;
          if (!f) return;
          for (let k = Math.floor(f.from / 5) + 1; k * 5 <= f.to; k++) {
            setFives({ from: f.from, to: k * 5 });
            sayNumber(k * 5);
            await pause(450);
            if (!alive.current) return;
          }
          await pause(400);
          setFives(null);
        } else if (action.op === 'highlight-hand') {
          const next = apply(action);
          setLit(next.highlighted);
          await pause(1200);
          setLit(null);
        }
      } finally {
        if (alive.current) {
          setLive(null);
          setDemoBusy(false);
        }
      }
    },
    invite: (action) => setInvite(action),
  });

  // ---------- render ----------

  const invitedHand: Hand | null =
    invite?.op === 'drag-minute'
      ? 'minute'
      : invite?.op === 'drag-hour'
        ? 'hour'
        : invite?.op === 'highlight-hand' &&
            (invite.args?.hand === 'hour' || invite.args?.hand === 'minute')
          ? (invite.args.hand as Hand)
          : null;
  // A hand glows while it is turned, chosen or shown by a demo. An invite does not light it: the
  // one cue of an invite is the ring (and the guide's hand) on the button to touch first.
  const glow = lit ?? selectedHand ?? (invite?.op === 'highlight-hand' ? invitedHand : null);
  // Pip's hand (kit `useInviteHand`) under the button of the hand the child should turn.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handKey = invitedHand !== null && invite?.op !== 'highlight-hand' ? invitedHand : '';
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) =>
      handKey === ''
        ? null
        : root.querySelector<HTMLElement>(`.ni-cset__handbtn[data-hand="${handKey}"]`),
    handKey,
  );
  const now = timeOf(snapTime(shown, 1));

  const handButton = (hand: Hand) => {
    const id: Item = hand === 'minute' ? 'hand-minute' : 'hand-hour';
    const props = place.itemProps(id, { label: handName(hand) });
    return (
      <span key={hand} className="ni-cset__btnwrap">
        <span
          {...{ ...props, onKeyDown: onHandKey(hand, props.onKeyDown) }}
          className={['ni-cset__handbtn', invitedHand === hand ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data-hand={hand}
        >
          <svg
            className="ni-cset__handicon"
            viewBox="0 0 40 40"
            aria-hidden="true"
            focusable="false"
          >
            {hand === 'minute' ? (
              <path d="M6 34L31 9" className="ni-cset__icon-minute" />
            ) : (
              <path d="M10 30L23 17" className="ni-cset__icon-hour" />
            )}
            <circle
              cx={hand === 'minute' ? 6 : 10}
              cy={hand === 'minute' ? 34 : 30}
              r="4"
              className="ni-cset__icon-pin"
            />
          </svg>
          {/* `ni-pick__face`: the kit's invite hand keeps clear of the name (INVITE_GLYPH_SELECTOR). */}
          <span className="ni-pick__face ni-cset__handlabel">{handName(hand)}</span>
        </span>
      </span>
    );
  };

  const elapsed = config.prompt === 'elapsed' ? config.elapsed : undefined;

  return (
    <div
      className="ni-cset"
      ref={(el) => {
        rootRef.current = el;
        areaRef.current = el;
      }}
      data-roomy={roomy ? 'true' : undefined}
      style={handRootStyle}
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
      data-time={`${now.h}:${String(now.m).padStart(2, '0')}`}
    >
      <div className="ni-cset__face" ref={faceRef}>
        <ClockFace t={shown} numerals size={facePx} highlight={glow} fives={fives} />
        <div
          {...{
            ...facePad,
            onClick: onFaceClick,
            onPointerDown: onFacePointerDown,
            onPointerMove: onFacePointerMove,
            onPointerUp: (e: ReactPointerEvent) => endDrag(e, true),
            onPointerCancel: (e: ReactPointerEvent) => endDrag(e, false),
          }}
          className={[
            facePad.className,
            'ni-cset__pad',
            invite?.op === 'count-fives' ? 'ni-invite' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-dragging={live !== null && demoBusy === false ? 'true' : undefined}
        />
      </div>
      <div className="ni-cset__readouts">
        {config.prompt === 'digital' ? (
          <div className="ni-cset__card" data-card="target">
            <span className="ni-cset__cardlabel">{t('ui.clock.target')}</span>
            <DigitalClock
              h={timeOf(faceTime(config.target.h, config.target.m)).h}
              m={config.target.m}
              label={clockText(
                timeOf(faceTime(config.target.h, config.target.m)).h,
                config.target.m,
              )}
            />
          </div>
        ) : null}
        {elapsed ? (
          <div className="ni-cset__card" data-card="elapsed">
            <span className="ni-cset__cardlabel">{t('ui.clock.start')}</span>
            <DigitalClock
              h={timeOf(faceTime(elapsed.from.h, elapsed.from.m)).h}
              m={elapsed.from.m}
              label={clockText(timeOf(faceTime(elapsed.from.h, elapsed.from.m)).h, elapsed.from.m)}
            />
            <span className="ni-cset__cardlabel">
              {t('ui.clock.later', { minutes: elapsed.minutes })}
            </span>
          </div>
        ) : null}
        {config.showDigital ? (
          // A live region: the hands' reading is announced as it changes (a turn by arrow key).
          <div className="ni-cset__card" data-card="yours" aria-live="polite" aria-atomic="true">
            <span className="ni-cset__cardlabel">{t('ui.clock.yours')}</span>
            <DigitalClock h={now.h} m={now.m} label={clockText(now.h, now.m)} />
          </div>
        ) : null}
      </div>
      <div className="ni-cset__controls">
        {handButton('minute')}
        {handButton('hour')}
        <CheckButton onPress={submit} disabled={!interactive || !state.moved} />
      </div>
      {inviteHand}
    </div>
  );
}

export default ClockSetWidget;
