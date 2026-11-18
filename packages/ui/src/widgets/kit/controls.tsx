import type { NarrationKey } from '@number-island/shared';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { BigButton } from '../../primitives/BigButton';
import { CheckIcon } from '../../primitives/icons';
import { CHECK_DEBOUNCE_MS } from '../../tokens/tokens';
import { wait } from '../demo';
import './kit.css';

/**
 * Answer controls shared by the number-sense widgets (06 §4): the number pad, numeral tray and
 * pick cards, and the "check" button. Sizes come from the age-mode tokens (`--target-min`: 80 px
 * K, 64 px G1+, `--target-gap` 12 px); numerals are ≥ 32 px (05 §11). Selection is never shown by
 * colour alone: a picked card gets a thick ink ring and a check badge (06 §7).
 */

// ---------- check ----------

export interface CheckButtonProps {
  onPress: () => void;
  disabled?: boolean;
  /** Pulse under the demo hand (03 §6.3 invite). */
  invited?: boolean;
  /**
   * Icon only, whatever the text mode (its label is still its accessible name and is spoken on
   * tap): for a short room where the word would cost a widget's controls their full size.
   */
  compact?: boolean;
}

/** The widget's "check" button: debounced ≥ 400 ms (06 §4), icon-only with a spoken label in K. */
export function CheckButton({ onPress, disabled, invited, compact }: CheckButtonProps) {
  return (
    <BigButton
      label="ui.btn.check"
      icon={<CheckIcon />}
      tone="sun"
      debounceMs={CHECK_DEBOUNCE_MS}
      disabled={disabled}
      onPress={onPress}
      showLabel={compact ? false : undefined}
      className={invited ? 'ni-invite' : undefined}
    />
  );
}

// ---------- pick cards ----------

export interface PickCardProps {
  /** Accessible name (and, for numerals, what the card shows). */
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Demo highlight (03 §6.3): a pulsing ring, distinct from the selection ring. */
  highlighted?: boolean;
  children: ReactNode;
  /** `numeral` cards are compact; `picture` cards hold a small stimulus. */
  variant?: 'numeral' | 'word' | 'picture';
  className?: string;
  'data-id'?: string;
}

/** One choice: a chunky card with a ledge. Picked → ink ring plus check badge. */
export function PickCard({
  label,
  selected,
  onPress,
  disabled,
  highlighted,
  children,
  variant = 'numeral',
  className,
  ...rest
}: PickCardProps) {
  return (
    <button
      type="button"
      className={['ni-pick', highlighted ? 'ni-invite' : '', className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-selected={selected ? 'true' : undefined}
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      data-id={rest['data-id']}
    >
      <span className="ni-pick__face">{children}</span>
      {selected ? (
        <span className="ni-pick__badge" aria-hidden="true">
          <CheckIcon tone="light" />
        </span>
      ) : null}
    </button>
  );
}

export interface NumeralTrayProps {
  values: readonly number[];
  selected: number | null;
  onPick: (value: number) => void;
  disabled?: boolean;
  /** Demo highlight. */
  highlighted?: number | null;
  /** Narration key naming the group (default "Numbers"). */
  label?: NarrationKey;
  /** Speak the number on tap (06 §5). Defaults to the child's speakOnTap. */
  speak?: boolean;
  /**
   * At most this many cards a row: the panel is then exactly that wide (or its container's width,
   * if narrower). Without it the panel fills its container.
   */
  columns?: number;
}

/**
 * A numeral card's width in px for `digits`-digit numbers at a `targetMin` px minimum target,
 * matching NumeralTray's CSS (Baloo 2 at 48 px ≈ 30 px a digit), for widgets that plan their
 * layout around a tray.
 */
export function numeralCardPx(digits: number, targetMin: number, scale = 1.15): number {
  return Math.max(targetMin * scale, Math.max(1, digits) * 30 + 40);
}

/** The tray panel's horizontal padding plus border, in px (kit.css `.ni-tray-numerals`). */
export const TRAY_PANEL_EDGES_PX = 2 * (20 + 3);

/**
 * The tray's grid for n cards when at most `cap` fit a row: even columns (`cols` cards in every
 * full row, so the columns line up) in the fewest rows whose last row is at least half full, so no
 * lone card hangs under a long row. 0–20 (21 cards): 11 a row → 0–10 over 11–20; 7–10 a row →
 * 7 × 3; 5 a row → 3 × 7. 0–10 at 9 a row → 6 over 5 (the short last row is centred).
 */
export function trayGrid(n: number, cap: number): { cols: number; rows: number } {
  if (n <= 0) return { cols: 1, rows: 0 };
  const most = Math.max(1, Math.min(n, Math.floor(cap)));
  for (let rows = Math.ceil(n / most); rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    const last = n - (rows - 1) * cols;
    if (last >= Math.ceil(cols / 2)) return { cols, rows };
  }
  return { cols: 1, rows: n };
}

/**
 * An element's layout widths from its computed style: fractional, and before any transform
 * (unlike clientWidth/offsetWidth, which round, and getBoundingClientRect, which is transformed).
 */
export function layoutBox(style: CSSStyleDeclaration): { content: number; border: number } {
  const px = (v: string) => Number.parseFloat(v) || 0;
  const width = px(style.width);
  const edges =
    px(style.paddingLeft) +
    px(style.paddingRight) +
    px(style.borderLeftWidth) +
    px(style.borderRightWidth);
  return style.boxSizing === 'border-box'
    ? { content: width - edges, border: width }
    : { content: width, border: width + edges };
}

/**
 * How many cards of `card` px fit in `avail` px with `gap` px between them, as flex wrapping
 * decides it. Layout runs in 1/64 px units, so a real overflow is at least 1/64 px; computed
 * styles serialize to 4 decimals (73.59375 → "73.5938"), adding up to ~0.0001 px a value. Half
 * a layout unit of tolerance absorbs that rounding and still wraps one unit past the boundary.
 */
export function cardsPerRow(avail: number, card: number, gap: number): number {
  const HALF_LAYOUT_UNIT = 1 / 128;
  return Math.max(1, Math.floor((avail + gap + HALF_LAYOUT_UNIT) / (card + gap)));
}

/** A row of numeral cards (0–10, 0–20, or pick options). Tapping speaks the number. */
export function NumeralTray({
  values,
  selected,
  onPick,
  disabled,
  highlighted = null,
  label = 'ui.widget.numbers',
  speak,
  columns,
}: NumeralTrayProps) {
  const t = useNarrationText();
  const prefs = useUiPreferences();
  const { sayNumber } = useSpeech();
  const speaks = speak ?? prefs.speakOnTap;
  // Every card as wide as the widest numeral (Baloo 2 at 48 px ≈ 30 px a digit), so "10" is
  // not a bigger target than "9". A host can enlarge the cards with --tray-card-scale.
  const digits = Math.max(1, ...values.map((v) => String(v).length));
  const cardWidth = `max(calc(var(--target-min) * var(--tray-card-scale, 1.15)), ${digits * 30 + 40}px)`;
  // An even grid (trayGrid) sized from the tray's own (fractional) content width, inside a visible
  // tray panel. The cards stay ONE flat, stably keyed list (a reflow never remounts a card, so
  // keyboard focus survives) in a centred box exactly `cols` cards wide, so every full row lines
  // up and a short last row is centred.
  const ref = useRef<HTMLFieldSetElement | null>(null);
  const [cols, setCols] = useState(values.length);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const card = el.querySelector<HTMLElement>('.ni-pick');
      if (!card) return;
      const style = getComputedStyle(el);
      // The same geometry flex wraps with: fractional layout widths from the computed style
      // (clientWidth/offsetWidth round, so a rounded-up width plans one card too many a row) and
      // untransformed (getBoundingClientRect includes the demo pulse's scale, which flex ignores).
      const avail = layoutBox(style).content;
      if (avail <= 0) return;
      const grid = card.parentElement ?? el;
      const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 12;
      const cardStyle = getComputedStyle(card);
      const cardWidth =
        layoutBox(cardStyle).border +
        (Number.parseFloat(cardStyle.marginLeft) || 0) +
        (Number.parseFloat(cardStyle.marginRight) || 0);
      setCols(trayGrid(values.length, cardsPerRow(avail, cardWidth, gap)).cols);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [values.length]);
  return (
    <fieldset
      ref={ref}
      className="ni-tray-numerals"
      aria-label={t(label)}
      disabled={disabled}
      data-columns={columns ? 'fixed' : undefined}
      style={
        {
          '--card-w': cardWidth,
          '--cols': cols,
          ...(columns ? { '--max-cols': Math.max(1, Math.floor(columns)) } : {}),
        } as CSSProperties
      }
    >
      <div className="ni-tray-numerals__grid">
        {values.map((v) => (
          <PickCard
            key={v}
            label={String(v)}
            selected={selected === v}
            highlighted={highlighted === v}
            data-id={`opt-${v}`}
            onPress={() => {
              if (speaks) sayNumber(v);
              onPick(v);
            }}
          >
            <span className="ni-pick__numeral">{v}</span>
          </PickCard>
        ))}
      </div>
    </fieldset>
  );
}

// ---------- number pad ----------

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back';

export interface NumberPadKeysProps {
  onKey: (key: PadKey) => void;
  /** Physical Enter (desktop): usually the widget's check. */
  onEnter?: () => void;
  allowDecimal?: boolean;
  disabled?: boolean;
  /** Listen for keyboard digits on the page (06 §1: keyboard input for the number pad). */
  captureKeyboard?: boolean;
  /** Demo highlight of one key (03 §6.3). */
  highlighted?: PadKey | null;
  /** Speak a digit when its key is tapped (06 §5). Defaults to the child's speakOnTap. */
  speak?: boolean;
  /**
   * `'3x4'` (default): the phone-style 3 columns × 4 rows. `'4x3'`: 4 columns × 3 rows (1–4, 5–8,
   * 9 0 ⌫), still twelve large keys, for a room too short for four rows of full-size keys. The
   * key size is `--pad-key` (default `--target-big`); a short room may set it down to
   * `--target-min`, never below.
   */
  shape?: '3x4' | '4x3';
}

const ROWS: (PadKey | null)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'back'],
];

function BackspaceIcon() {
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
        d="M17 10h22a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H17L4 24 17 10Z"
        fill="var(--color-paper)"
        stroke="var(--color-ink)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M22 18l12 12M34 18 22 30"
        stroke="var(--color-coral-deep)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The 3 × 4 number pad (06 §4): digits, a decimal key only when allowed, and a backspace. Keyboard
 * digits, Backspace, "." and Enter work on desktop while `captureKeyboard` is on.
 */
export function NumberPadKeys({
  onKey,
  onEnter,
  allowDecimal = false,
  disabled = false,
  captureKeyboard = true,
  highlighted = null,
  speak,
  shape = '3x4',
}: NumberPadKeysProps) {
  const t = useNarrationText();
  const prefs = useUiPreferences();
  const { sayNumber, say } = useSpeech();
  const speaks = speak ?? prefs.speakOnTap;
  const latest = useRef({ onKey, onEnter, disabled, allowDecimal });
  latest.current = { onKey, onEnter, disabled, allowDecimal };

  useEffect(() => {
    if (!captureKeyboard) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const l = latest.current;
      if (l.disabled || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        l.onKey(e.key as PadKey);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        l.onKey('back');
      } else if ((e.key === '.' || e.key === ',') && l.allowDecimal) {
        e.preventDefault();
        l.onKey('.');
      } else if (e.key === 'Enter' && l.onEnter) {
        // Enter on a focused button activates that button instead.
        if (el?.closest('button')) return;
        e.preventDefault();
        l.onEnter();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [captureKeyboard]);

  return (
    <fieldset
      className="ni-pad"
      data-shape={shape}
      aria-label={t('ui.widget.pad')}
      disabled={disabled}
    >
      {ROWS.flat().map((key, i) => {
        if (key === '.' && !allowDecimal) {
          // biome-ignore lint/suspicious/noArrayIndexKey: an empty pad cell keeps the 3 × 4 grid
          return <span key={`gap${i}`} className="ni-pad__gap" aria-hidden="true" />;
        }
        if (key === null) return null;
        const label =
          key === 'back' ? t('ui.widget.key.back') : key === '.' ? t('ui.widget.key.point') : key;
        return (
          <button
            key={key}
            type="button"
            className={['ni-pad__key', highlighted === key ? 'ni-invite' : '']
              .filter(Boolean)
              .join(' ')}
            data-key={key}
            aria-label={label}
            onClick={() => {
              if (speaks) {
                if (/^[0-9]$/.test(key)) sayNumber(Number(key));
                else say(key === 'back' ? 'ui.widget.key.back' : 'ui.widget.key.point');
              }
              onKey(key);
            }}
          >
            {key === 'back' ? (
              <span className="ni-pad__icon">
                <BackspaceIcon />
              </span>
            ) : (
              <span className="ni-pad__digit" aria-hidden="true">
                {key}
              </span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}

/** Applies a pad key to a typed string, keeping at most `maxDigits` digits and one decimal point. */
export function applyPadKey(text: string, key: PadKey, maxDigits: number): string {
  if (key === 'back') return text.slice(0, -1);
  if (key === '.') return text.includes('.') ? text : `${text === '' ? '0' : text}.`;
  const digits = text.replace('.', '').length;
  if (digits >= maxDigits) return text;
  // No leading zeros ("07" → "7"), but "0" and "0.5" are fine.
  if (text === '0') return key;
  return text + key;
}

/** The number a typed string stands for, or null while it is empty or ends in a bare point. */
export function padValue(text: string): number | null {
  if (text === '' || text === '.') return null;
  const v = Number(text);
  return Number.isFinite(v) ? v : null;
}

// ---------- submit guard ----------

/**
 * The submit debounce (06 §4), as a pure function for tests. The window is claimed BEFORE
 * `submit` runs, so a nested submit fired from inside `onResponse` is refused, and released again
 * when `submit` reports that it sent nothing (an unfinished answer), so the real answer that
 * follows still goes through.
 */
export function createSubmitGuard(ms: number, now: () => number) {
  let last = Number.NEGATIVE_INFINITY;
  // A submit in progress refuses every nested one, however long the host's onResponse takes.
  let inFlight = false;
  return (submit: () => boolean): boolean => {
    if (inFlight) return false;
    const t = now();
    if (t - last < ms) return false;
    const previous = last;
    last = t;
    inFlight = true;
    let sent: boolean;
    try {
      sent = submit();
    } finally {
      // A throwing submit (e.g. a host's onResponse) keeps the window: the response may already
      // have been delivered, so a quick retry must not send it again.
      inFlight = false;
    }
    if (!sent) last = previous;
    return sent;
  };
}

/**
 * Wraps a widget's submit so every route to it (the Check button, desktop Enter, a test click)
 * shares one ≥ 400 ms debounce (06 §4). `submit` returns true when it actually sent a response.
 * `now` is injectable for tests.
 */
export function useSubmitGuard(
  submit: () => boolean,
  ms: number = CHECK_DEBOUNCE_MS,
  now: () => number = () => performance.now(),
): () => void {
  const latest = useRef({ submit, now });
  latest.current = { submit, now };
  const guard = useMemo(() => createSubmitGuard(ms, () => latest.current.now()), [ms]);
  return useCallback(() => {
    guard(() => latest.current.submit());
  }, [guard]);
}

// ---------- demo helpers ----------

/**
 * Demo playback awaits timers; it must never outlive the widget instance (WidgetHost remounts per
 * item). `alive.current` turns false on unmount.
 */
export function useAlive() {
  const alive = useRef(true);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}

/** A demo pause: `ms` normally, 0 with reduced motion (03 §6.3). */
export function useDemoPause() {
  const reduced = useReducedMotion();
  return (ms: number) => wait(reduced ? 0 : ms);
}
