import { formatModel } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useReducedMotion, useSpeech } from '../../preferences/UiProvider';
import { BigButton } from '../../primitives/BigButton';
import { HandPointerIcon } from '../../primitives/icons';
import { NumberDisplay } from '../../primitives/NumberDisplay';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  NumberPadKeys,
  NumeralTray,
  type PadKey,
  padValue,
  StimulusView,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './dot-flash.css';

/**
 * `dot-flash` (03 §5.5, pictorial): a quick look, then "how many did you see?".
 *
 * The picture (`stimulus`, any StimulusView kind: dots, fingers, frames, groups, objects…) shows
 * once by itself when the widget first becomes usable, for `flashMs`, then hides under a soft
 * cover. "Look again" re-shows it for `flashMs`, `reflashes` times; a re-flash counts as the
 * level-1 hint, so it is traced as `tap reflash`. The answer controls stay usable while the
 * picture is hidden: the number pad with a big answer slot (`input: 'pad'`), or a numeral tray of
 * `pickOptions` (`'pick'`); `estimate` items use the same controls (the engine applies the
 * tolerance). With reduced motion the cover appears and goes without any fade (06 §7).
 *
 * Demo ops (03 §5.5): `flash` (show for flashMs, then hide), `show` (show and keep showing),
 * `circle-groups {groups}` (rings around the groups, in reading order), plus `answer {value}`.
 *
 * Invites (03 §6.3) ring and point at the ONE control the child should press next, and only while
 * that control is enabled: `flash` → "look again"; `answer {value}` → the next pad key (or
 * backspace after a wrong digit) or the right card, then "check" once the answer is in. The cue
 * follows the child's taps. `show` and `circle-groups` ring the board (nothing to press there).
 */

const OPS = ['flash', 'show', 'circle-groups', 'answer'] as const;
const KEY_MS = 340;

type Config = ConfigFor<'dot-flash'>;

/** Where an invite points: one pressable control, or a ring-only area (board, slot, tray). */
type Cue =
  | { at: 'again' | 'check' | 'board' | 'slot' | 'tray' }
  | { at: 'key'; key: PadKey }
  | { at: 'card'; value: number };

/** The hand's fingertip (≈ 42 % across, 8 px down the 56 px hand) rests inside its target. */
const HAND_TIP_X = 23.5;
const HAND_TIP_Y = 8;
const HAND_SIZE = 56;
const HAND_EDGE = 10;

interface Ring {
  left: number;
  top: number;
  width: number;
  height: number;
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <path
        d="M4 24C9 15 16 11 24 11s15 4 20 13c-5 9-12 13-20 13S9 33 4 24Z"
        fill="var(--color-cloud)"
        stroke="var(--color-ink)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle
        cx="24"
        cy="24"
        r="8"
        fill="var(--color-sea-deep)"
        stroke="var(--color-ink)"
        strokeWidth="3"
      />
      <circle cx="24" cy="24" r="3" fill="var(--color-ink)" />
      <circle cx="27" cy="21" r="2" fill="#fff" />
    </svg>
  );
}

function ClosedEye() {
  return (
    <svg
      viewBox="0 0 96 64"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <path
        d="M10 26c10 14 22 20 38 20s28-6 38-20"
        stroke="var(--color-ink)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M22 38l-7 9M37 44l-3 10M59 44l3 10M74 38l7 9"
        stroke="var(--color-ink)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The next control for an `answer {value}` invite, given what the child has entered so far.
 * Without a usable value it rings the answer area (no hand) until something is entered.
 */
function answerCue(
  config: Config,
  target: number | null,
  padText: string,
  picked: number | null,
): Cue {
  if (config.input === 'pad') {
    if (target === null) return padText === '' ? { at: 'slot' } : { at: 'check' };
    const want = String(target);
    if (padText === want) return { at: 'check' };
    if (want.startsWith(padText)) return { at: 'key', key: want[padText.length] as PadKey };
    return { at: 'key', key: 'back' };
  }
  if (target === null || !(config.pickOptions ?? []).includes(target)) {
    return picked === null ? { at: 'tray' } : { at: 'check' };
  }
  return picked === target ? { at: 'check' } : { at: 'card', value: target };
}

/** The pressable element a cue points at (null: a ring-only cue). */
function cueTarget(root: HTMLElement, cue: Cue): HTMLElement | null {
  switch (cue.at) {
    case 'again':
      return root.querySelector('.ni-flash__again .ni-btn');
    case 'check':
      return root.querySelector('.ni-flash__check .ni-btn');
    case 'key':
      return root.querySelector(`.ni-pad__key[data-key="${cue.key}"]`);
    case 'card':
      return root.querySelector(`.ni-pick[data-id="opt-${cue.value}"]`);
    default:
      return null;
  }
}

/** `el`'s untransformed layout box relative to `root` (the invite pulse scales; offsets don't). */
function offsetBox(el: HTMLElement, root: HTMLElement) {
  let left = 0;
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    left += node.offsetLeft;
    top += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (parent && parent !== root) {
      left += parent.clientLeft;
      top += parent.clientTop;
    }
    node = parent;
  }
  if (node !== root) {
    const r = el.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    return { left: r.left - b.left, top: r.top - b.top, width: r.width, height: r.height };
  }
  return { left, top, width: el.offsetWidth, height: el.offsetHeight };
}

/** Rings around consecutive groups of the drawn picture, in reading order (`circle-groups`). */
function measureRings(board: HTMLElement, sizes: readonly number[]): Ring[] {
  const base = board.getBoundingClientRect();
  // Rings are positioned in the board's padding box (inside its border).
  const originX = base.left + board.clientLeft;
  const originY = base.top + board.clientTop;
  // A rekenrek's rows sit close together: a snugger ring keeps the two rows' rings apart.
  const p = board.querySelector('.ni-rekenrek') ? 6 : 10;
  const union = (els: Element[]): Ring | null => {
    if (els.length === 0) return null;
    const rs = els.map((e) => e.getBoundingClientRect());
    const left = Math.min(...rs.map((r) => r.left));
    const top = Math.min(...rs.map((r) => r.top));
    const right = Math.max(...rs.map((r) => r.right));
    const bottom = Math.max(...rs.map((r) => r.bottom));
    return {
      left: left - originX - p,
      top: top - originY - p,
      width: right - left + 2 * p,
      height: bottom - top + 2 * p,
    };
  };
  const hands = [...board.querySelectorAll('.ni-hand-art')];
  // Objects, or a rekenrek's pushed beads (row by row, so groups matching the rows ring each row's
  // pushed beads alone, clear of the unused beads at the far end of the wire).
  const items = [...board.querySelectorAll('.ni-objects__item, .ni-rekenrek [data-pushed="true"]')];
  const groups: Element[][] = sizes.map(() => []);
  if (hands.length > 0) {
    // Fingers: whole hands, assigned by their raised fingers.
    let g = 0;
    let filled = 0;
    for (const hand of hands) {
      if (g >= sizes.length) break;
      groups[g]?.push(hand);
      filled += Number(hand.getAttribute('data-up') ?? 0);
      if (filled >= (sizes[g] ?? 0)) {
        g += 1;
        filled = 0;
      }
    }
  } else if (items.length > 0) {
    let i = 0;
    sizes.forEach((size, g) => {
      for (let k = 0; k < size && i < items.length; k++) groups[g]?.push(items[i++] as Element);
    });
  } else {
    const whole = board.querySelector('.ni-stimulus');
    if (whole) groups[0]?.push(whole);
  }
  return groups.map(union).filter((r): r is Ring => r !== null);
}

export function DotFlashWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { sayNumber } = useSpeech();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const reduced = useReducedMotion();
  const flashMs = Math.max(200, config.flashMs);

  const [shown, setShown] = useState(false);
  const [reflashesLeft, setReflashesLeft] = useState(Math.max(0, config.reflashes));
  const [circled, setCircled] = useState<number[] | null>(null);
  const [rings, setRings] = useState<Ring[]>([]);
  const [padText, setPadText] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [handAt, setHandAt] = useState<{ left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  // The timed flash now showing (a new number per flash), or null: the hide timer belongs to the
  // effect below, so StrictMode's mount → cleanup → mount re-schedules it instead of losing it.
  const [flashing, setFlashing] = useState<number | null>(null);
  const flashSeq = useRef(0);
  const firstLook = useRef(false);
  const interactive = !disabled && !demoBusy;

  const pendingFlash = useRef<(() => void) | null>(null);
  /** Whoever awaits the current flash is released (never left hanging). */
  const releaseFlash = () => {
    const done = pendingFlash.current;
    pendingFlash.current = null;
    done?.();
  };
  /** Cancels a timed hide (the picture stays as it is) and releases its waiter. */
  const clearTimer = () => {
    setFlashing(null);
    releaseFlash();
  };
  // Unmount releases a waiting flash; it sets no state, so a StrictMode re-mount keeps the flash.
  // biome-ignore lint/correctness/useExhaustiveDependencies: cleanup on unmount only
  useEffect(() => releaseFlash, []);

  /** Shows the picture for `flashMs`, then hides it. Resolves when it is hidden again. */
  const flash = () =>
    new Promise<void>((resolve) => {
      releaseFlash();
      setCircled(null);
      setShown(true);
      pendingFlash.current = resolve;
      flashSeq.current += 1;
      setFlashing(flashSeq.current);
    });

  // While a timed flash shows, its hide is scheduled (again after any effect cleanup).
  // biome-ignore lint/correctness/useExhaustiveDependencies: releaseFlash only reads a ref
  useEffect(() => {
    if (flashing === null) return;
    const timer = setTimeout(() => {
      setFlashing(null);
      setShown(false);
      releaseFlash();
    }, flashMs);
    return () => clearTimeout(timer);
  }, [flashing, flashMs]);

  // The first look happens by itself, once, as soon as the child can answer (not during a demo).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the first enabled render flashes
  useEffect(() => {
    if (disabled || firstLook.current) return;
    firstLook.current = true;
    void flash();
  }, [disabled]);

  const reflash = () => {
    if (!interactive || shown || reflashesLeft <= 0) return;
    trace('tap', 'reflash');
    setInvite(null);
    setReflashesLeft((n) => n - 1);
    void flash();
  };

  // Rings are measured from the drawn picture once it is showing.
  useLayoutEffect(() => {
    const board = boardRef.current;
    setRings(board && circled && shown ? measureRings(board, circled) : []);
  }, [circled, shown]);

  // ---------- answer ----------

  const maxDigits = 3;
  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    trace('tap', `key-${key}`);
    setInvite((inv) => (inv?.op === 'answer' ? inv : null));
    setPadText((s) => applyPadKey(s, key, maxDigits));
  };
  const pick = (v: number) => {
    if (!interactive) return;
    trace('tap', `opt-${v}`);
    setInvite((inv) => (inv?.op === 'answer' ? inv : null));
    setPicked(v);
  };
  const value = config.input === 'pad' ? padValue(padText) : picked;

  const submit = useSubmitGuard(() => {
    if (!interactive || value === null) return false;
    const model = formatModel('dot-flash');
    if (!model) return false;
    const response = model.toResponse(
      model.apply(model.initialState(config), { op: 'answer', args: { value } }),
    );
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      firstLook.current = true; // a demo has shown the picture: no automatic look afterwards
      try {
        if (action.op === 'flash') {
          if (reduced) {
            // Reduced motion: an instant state change (the model's end state: hidden).
            clearTimer();
            setShown(false);
          } else {
            await flash();
          }
        } else if (action.op === 'show') {
          clearTimer();
          setShown(true);
          await pause(600);
        } else if (action.op === 'circle-groups') {
          clearTimer();
          const g = action.args?.groups;
          setShown(true);
          setCircled(Array.isArray(g) ? g.filter((x): x is number => typeof x === 'number') : []);
          await pause(1200);
        } else if (action.op === 'answer') {
          const v = Number(action.args?.value);
          if (!Number.isFinite(v)) return;
          sayNumber(v);
          if (config.input === 'pad') {
            // The answer replaces whatever was typed (as the engine model does).
            let text = '';
            setPadText(text);
            for (const ch of String(v).split('') as PadKey[]) {
              setPressedKey(ch);
              await pause(KEY_MS);
              if (!alive.current) return;
              text = applyPadKey(text, ch, maxDigits);
              setPadText(text);
            }
            setPressedKey(null);
          } else {
            setPicked(v);
          }
          await pause(300);
        }
      } finally {
        if (alive.current) {
          setPressedKey(null);
          setDemoBusy(false);
        }
      }
    },
    invite: (action) => setInvite(action),
  });

  const canReflash = interactive && !shown && reflashesLeft > 0;
  const canCheck = interactive && value !== null;
  // The invite's ONE target, shown only while it can be pressed (a demo never invites a disabled
  // control; a cue held back appears as soon as its control becomes usable).
  const cue: Cue | null = (() => {
    if (!invite) return null;
    if (invite.op === 'show' || invite.op === 'circle-groups') return { at: 'board' };
    if (!interactive) return null;
    if (invite.op === 'flash') return canReflash ? { at: 'again' } : null;
    if (invite.op === 'answer') {
      const v = Number(invite.args?.value);
      const c = answerCue(config, Number.isFinite(v) ? v : null, padText, picked);
      return c.at === 'check' && !canCheck ? null : c;
    }
    return null;
  })();
  const cueKey = cue?.at === 'key' ? cue.key : null;
  const cueCard = cue?.at === 'card' ? cue.value : null;
  const cueId = cue ? `${cue.at}:${cueKey ?? cueCard ?? ''}` : '';

  // Pip's hand sits on the invited control, measured from the laid-out widget.
  // biome-ignore lint/correctness/useExhaustiveDependencies: cueId stands for the cue
  useLayoutEffect(() => {
    const root = rootRef.current;
    const el = root && cue ? cueTarget(root, cue) : null;
    if (!root || !el) {
      setHandAt(null);
      return;
    }
    const place = () => {
      const b = offsetBox(el, root);
      // Fingertip just right of centre, low on the control (its label stays clear).
      const tipX = b.left + b.width / 2 + 6;
      const tipY = b.top + b.height - Math.min(18, b.height * 0.25);
      // The whole hand stays inside the widget, with room for its tap bob (6 px left, 8 px down):
      // near an edge it slides up or across, the fingertip still on the control.
      const clamp = (v: number, max: number) => Math.max(HAND_EDGE, Math.min(v, max));
      setHandAt({
        left: clamp(tipX - HAND_TIP_X, root.clientWidth - HAND_SIZE - HAND_EDGE),
        top: clamp(tipY - HAND_TIP_Y, root.clientHeight - HAND_SIZE - HAND_EDGE),
      });
    };
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(place);
    ro.observe(root);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cueId]);

  // ---------- render ----------

  return (
    <div
      ref={rootRef}
      className="ni-flash"
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
    >
      <div className="ni-flash__look">
        <div
          ref={boardRef}
          className={['ni-flash__board', cue?.at === 'board' ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data-shown={shown ? 'true' : 'false'}
        >
          <div className="ni-flash__picture" aria-hidden={shown ? undefined : true}>
            <StimulusView spec={config.stimulus} maxWidth={500} maxHeight={280} />
          </div>
          {rings.map((r, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: rings follow the groups in order
              key={i}
              className="ni-flash__ring"
              aria-hidden="true"
              style={
                { left: r.left, top: r.top, width: r.width, height: r.height } as CSSProperties
              }
            />
          ))}
          <div
            className="ni-flash__cover"
            {...(shown
              ? { 'aria-hidden': true }
              : { role: 'img', 'aria-label': t('ui.flash.hidden') })}
          >
            <span className="ni-flash__closed-eye">
              <ClosedEye />
            </span>
          </div>
        </div>
        <span className="ni-flash__again">
          <BigButton
            label="ui.flash.again"
            icon={<EyeIcon />}
            tone="cloud"
            disabled={!canReflash}
            onPress={reflash}
            className={cue?.at === 'again' ? 'ni-invite' : undefined}
          />
        </span>
      </div>

      <div className="ni-flash__answer" data-input={config.input}>
        {config.input === 'pad' ? (
          <div className="ni-flash__pad">
            <span className={cue?.at === 'slot' ? 'ni-flash__slot ni-invite' : 'ni-flash__slot'}>
              <NumberDisplay
                value={padText === '' ? null : padText}
                digits={2}
                size="lg"
                state={interactive ? 'active' : 'idle'}
                label="ui.widget.answer"
              />
            </span>
            <NumberPadKeys
              onKey={onKey}
              onEnter={submit}
              disabled={!interactive}
              highlighted={pressedKey ?? cueKey}
            />
          </div>
        ) : (
          <div className={cue?.at === 'tray' ? 'ni-flash__tray ni-invite' : 'ni-flash__tray'}>
            <NumeralTray
              values={config.pickOptions ?? []}
              selected={picked}
              highlighted={cueCard}
              onPick={pick}
              disabled={!interactive}
              columns={3}
            />
          </div>
        )}
        <span className="ni-flash__check">
          <CheckButton onPress={submit} disabled={!canCheck} invited={cue?.at === 'check'} />
        </span>
      </div>
      {handAt ? (
        <span
          className="ni-hand ni-flash__hand"
          aria-hidden="true"
          style={{ left: handAt.left, top: handAt.top }}
        >
          <HandPointerIcon />
        </span>
      ) : null}
    </div>
  );
}

export default DotFlashWidget;
