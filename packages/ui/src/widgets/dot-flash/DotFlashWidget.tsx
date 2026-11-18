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
 */

const OPS = ['flash', 'show', 'circle-groups', 'answer'] as const;
const KEY_MS = 340;

type Config = ConfigFor<'dot-flash'>;

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

/** Rings around consecutive groups of the drawn picture, in reading order (`circle-groups`). */
function measureRings(board: HTMLElement, sizes: readonly number[]): Ring[] {
  const base = board.getBoundingClientRect();
  const union = (els: Element[]): Ring | null => {
    if (els.length === 0) return null;
    const rs = els.map((e) => e.getBoundingClientRect());
    const left = Math.min(...rs.map((r) => r.left));
    const top = Math.min(...rs.map((r) => r.top));
    const right = Math.max(...rs.map((r) => r.right));
    const bottom = Math.max(...rs.map((r) => r.bottom));
    const p = 10;
    return {
      left: left - base.left - p,
      top: top - base.top - p,
      width: right - left + 2 * p,
      height: bottom - top + 2 * p,
    };
  };
  const hands = [...board.querySelectorAll('.ni-hand-art')];
  const items = [...board.querySelectorAll('.ni-objects__item')];
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
  const boardRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstLook = useRef(false);
  const interactive = !disabled && !demoBusy;

  const pendingFlash = useRef<(() => void) | null>(null);
  /** Cancels a timed hide; whoever awaits that flash is released (never left hanging). */
  const clearTimer = () => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    pendingFlash.current?.();
    pendingFlash.current = null;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: cleanup on unmount only
  useEffect(() => clearTimer, []);

  /** Shows the picture for `flashMs`, then hides it. Resolves when it is hidden again. */
  const flash = () =>
    new Promise<void>((resolve) => {
      clearTimer();
      setCircled(null);
      setShown(true);
      pendingFlash.current = resolve;
      hideTimer.current = setTimeout(() => {
        hideTimer.current = null;
        pendingFlash.current = null;
        if (alive.current) setShown(false);
        resolve();
      }, flashMs);
    });

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
    setInvite(null);
    setPadText((s) => applyPadKey(s, key, maxDigits));
  };
  const pick = (v: number) => {
    if (!interactive) return;
    trace('tap', `opt-${v}`);
    setInvite(null);
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

  const invitedReflash = invite?.op === 'flash';
  const invitedBoard = invite?.op === 'show' || invite?.op === 'circle-groups';
  const invitedAnswer = invite?.op === 'answer';

  // ---------- render ----------

  return (
    <div className="ni-flash" data-tier={tier} data-disabled={disabled ? 'true' : undefined}>
      <div className="ni-flash__look">
        <div
          ref={boardRef}
          className={['ni-flash__board', invitedBoard ? 'ni-invite' : ''].filter(Boolean).join(' ')}
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
        <span
          className={['ni-flash__again', invitedReflash ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <BigButton
            label="ui.flash.again"
            icon={<EyeIcon />}
            tone="cloud"
            disabled={!interactive || shown || reflashesLeft <= 0}
            onPress={reflash}
          />
          {invitedReflash ? (
            <span className="ni-hand ni-flash__hand">
              <HandPointerIcon />
            </span>
          ) : null}
        </span>
      </div>

      <div className="ni-flash__answer" data-input={config.input}>
        {config.input === 'pad' ? (
          <div className="ni-flash__pad">
            <span className={invitedAnswer ? 'ni-flash__slot ni-invite' : 'ni-flash__slot'}>
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
              highlighted={pressedKey}
            />
          </div>
        ) : (
          <div className={invitedAnswer ? 'ni-flash__tray ni-invite' : 'ni-flash__tray'}>
            <NumeralTray
              values={config.pickOptions ?? []}
              selected={picked}
              onPick={pick}
              disabled={!interactive}
            />
          </div>
        )}
        <span className="ni-flash__check">
          <CheckButton onPress={submit} disabled={!interactive || value === null} />
          {invitedAnswer ? (
            <span className="ni-hand ni-flash__hand">
              <HandPointerIcon />
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export default DotFlashWidget;
