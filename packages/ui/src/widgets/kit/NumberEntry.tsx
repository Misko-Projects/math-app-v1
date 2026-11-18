import type { TraceRecorder } from '../../interaction/trace';
import { NumberDisplay } from '../../primitives/NumberDisplay';
import { type AgeMode, MIN_TARGET_PX, TARGET_GAP_PX, TARGET_PX } from '../../tokens/tokens';
import { numeralTraySize, type Size } from './arrange';
import { applyPadKey, NumberPadKeys, NumeralTray, type PadKey } from './controls';
import './kit.css';

/**
 * The numeral answer that follows a manipulative (tenframe-fill and rekenrek `thenAsk` or `read`,
 * number-bond blanks), built on main's kit controls:
 *
 * - **tray**: a `NumeralTray` of 0 … max (max ≤ TRAY_MAX), in the even grid `trayGrid` gives for
 *   the `columns` the widget's layout chose (06 §4 sizes; the tray's own CSS untouched).
 * - **pad**: the 3 × 4 `NumberPadKeys` with the entered number shown large; `compact` keys are the
 *   age mode's minimum target (--target-min) instead of --target-big, for short areas; the number
 *   sits above the keys or beside them (`padLayout`).
 *
 * Controlled: the widget owns `value` and enters it through its format model's `answer`/`fill` op.
 * Trace targets: `opt-<n>` for a tray pick (numeric pick ids, engine README), `key-<k>` for a pad
 * key, as numeral-pick and number-pad record them. The widget renders its Check button itself.
 */

/** The largest answer shown as a tray (0–20, as tap-count's); above it the number pad is used. */
export const TRAY_MAX = 20;

export type EntryKind = 'tray' | 'pad';

/** The answer control a widget offers for answers 0 … max. */
export const entryKind = (max: number): EntryKind => (max <= TRAY_MAX ? 'tray' : 'pad');

export const entryValues = (max: number) =>
  Array.from({ length: Math.max(0, Math.floor(max)) + 1 }, (_, i) => i);

const digitsOf = (max: number) => String(Math.max(0, Math.floor(max))).length;

/** Space between the entered number and the keys (`.ni-entry[data-kind="pad"]` gap, kit.css). */
const PAD_GAP = 16;

/** The large entered number's box (NumberDisplay `lg`: Baloo 2 at 72 px, ≥ --target-big tall). */
function displaySize(max: number, ageMode: AgeMode): Size {
  const t = TARGET_PX[ageMode];
  return { w: Math.max(t.min * 1.6, digitsOf(max) * 42 + 62), h: Math.max(t.big, 92) };
}

/**
 * The keys' box: 3 × 4 keys of --target-big (or --target-min when compact), 12 px apart. A big
 * key is its row less its 4 px ledge margin; a compact key's row is the target plus that margin.
 */
function keysSize(ageMode: AgeMode, compact: boolean): Size {
  const k = compact ? MIN_TARGET_PX[ageMode] : TARGET_PX[ageMode].big;
  const row = compact ? k + 4 : k;
  return { w: 3 * k + 2 * TARGET_GAP_PX, h: 4 * row + 3 * TARGET_GAP_PX };
}

export interface EntryLayout {
  kind: EntryKind;
  /** Tray: the cards a row (NumeralTray `columns`). */
  columns: number;
  /** Pad: --target-min keys. */
  compact: boolean;
  /** Pad: the entered number above the keys or beside them. */
  padLayout: 'above' | 'beside';
}

/** The entry's box for answers 0 … max in `layout` (matches kit.css). */
export function entrySize(max: number, layout: EntryLayout, ageMode: AgeMode): Size {
  if (layout.kind === 'tray') {
    return numeralTraySize(
      entryValues(max).length,
      digitsOf(max),
      layout.columns,
      MIN_TARGET_PX[ageMode],
      TARGET_GAP_PX,
    );
  }
  const d = displaySize(max, ageMode);
  const k = keysSize(ageMode, layout.compact);
  return layout.padLayout === 'above'
    ? { w: Math.max(d.w, k.w), h: d.h + PAD_GAP + k.h }
    : { w: d.w + PAD_GAP + k.w, h: Math.max(d.h, k.h) };
}

/** The pad key a demo presses next to enter `value`, given what is typed (null: nothing to do). */
export function nextPadKey(value: number, typed: number | null): PadKey | null {
  const want = String(value);
  const have = typed === null ? '' : String(typed);
  if (have === want) return null;
  if (!want.startsWith(have)) return 'back';
  return (want[have.length] as PadKey | undefined) ?? null;
}

export interface NumberEntryProps extends EntryLayout {
  /** Largest number the child may need (0 … max). */
  max: number;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  /** Demo highlight (the one ring): the numeral card (tray) or the key (pad). */
  highlighted?: number | PadKey | null;
  /** Desktop Enter on the pad (usually the widget's check). */
  onEnter?: () => void;
  trace?: TraceRecorder;
  /** Listen for desktop digit keys (pad only; default on). */
  captureKeyboard?: boolean;
  className?: string;
}

export function NumberEntry({
  max,
  value,
  onChange,
  disabled,
  highlighted = null,
  onEnter,
  trace,
  kind,
  columns,
  compact,
  padLayout,
  captureKeyboard = true,
  className,
}: NumberEntryProps) {
  const cls = ['ni-entry', className].filter(Boolean).join(' ');
  if (kind === 'tray') {
    return (
      <div className={cls} data-kind="tray">
        <NumeralTray
          values={entryValues(max)}
          selected={value}
          disabled={disabled}
          highlighted={typeof highlighted === 'number' ? highlighted : null}
          columns={columns}
          onPick={(v) => {
            trace?.('tap', `opt-${v}`);
            onChange(v);
          }}
        />
      </div>
    );
  }
  const digits = digitsOf(max);
  const text = value === null ? '' : String(value);
  const onKey = (key: PadKey) => {
    if (disabled || key === '.') return;
    trace?.('tap', `key-${key}`);
    const next = applyPadKey(text, key, digits);
    onChange(next === '' ? null : Number(next));
  };
  return (
    <div
      className={cls}
      data-kind="pad"
      data-pad={padLayout}
      data-compact={compact ? 'true' : undefined}
    >
      <NumberDisplay
        value={value}
        digits={digits}
        size="lg"
        state={disabled ? 'idle' : 'active'}
        label="ui.widget.answer"
        className="ni-entry__display"
      />
      <NumberPadKeys
        onKey={onKey}
        onEnter={onEnter}
        disabled={disabled}
        captureKeyboard={captureKeyboard}
        highlighted={typeof highlighted === 'string' ? highlighted : null}
      />
    </div>
  );
}
