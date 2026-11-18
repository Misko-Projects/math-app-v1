import type { CSSProperties, ReactNode } from 'react';
import type { TraceRecorder } from '../../interaction/trace';
import { NumberDisplay } from '../../primitives/NumberDisplay';
import { applyPadKey, NumberPadKeys, NumeralTray, type PadKey } from './controls';
import './kit.css';

/**
 * A numeral answer for widgets whose manipulative comes first (tenframe-fill and rekenrek
 * `thenAsk`, number-bond blanks): a NumeralTray 0…max when max ≤ 10 (K-friendly: pick a number),
 * otherwise the 3 × 4 NumberPadKeys with the entered number shown large (06 §4). Controlled: the
 * widget owns `value` and enters it through its format model's `answer`/`fill` op.
 *
 * Trace targets: `opt-<n>` for a tray pick (numeric pick ids, engine README), `key-<k>` for a pad
 * key, as the number-pad and numeral-pick widgets record them.
 */

/** The largest answer a NumeralTray is used for; above this the number pad is shown. */
export const TRAY_MAX = 10;

export interface NumberEntryProps {
  /** Largest number the child may need (0 … max). Chooses the tray (≤ 10) or the pad. */
  max: number;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  /** Demo highlight: the numeral (tray) or the digit key (pad) being pressed. */
  highlighted?: number | null;
  /** Desktop Enter on the pad (usually the widget's check). */
  onEnter?: () => void;
  trace?: TraceRecorder;
  /** Tray columns (default 4: 0–10 sits in a 4 × 3 block beside the picture). */
  columns?: number;
  /** Listen for desktop digit keys (pad only; default on). */
  captureKeyboard?: boolean;
  className?: string;
  /** The widget's check button: beside the entered number (pad) or under the tray. */
  check?: ReactNode;
}

export function NumberEntry({
  max,
  value,
  onChange,
  disabled,
  highlighted = null,
  onEnter,
  trace,
  columns = 4,
  captureKeyboard = true,
  className,
  check,
}: NumberEntryProps) {
  const top = Math.max(0, Math.floor(max));
  if (top <= TRAY_MAX) {
    const values = Array.from({ length: top + 1 }, (_, i) => i);
    return (
      <div
        className={['ni-entry', className].filter(Boolean).join(' ')}
        data-kind="tray"
        style={{ '--entry-cols': Math.min(columns, values.length) } as CSSProperties}
      >
        <NumeralTray
          values={values}
          selected={value}
          disabled={disabled}
          highlighted={highlighted}
          onPick={(v) => {
            trace?.('tap', `opt-${v}`);
            onChange(v);
          }}
        />
        {check}
      </div>
    );
  }
  const digits = String(top).length;
  const text = value === null ? '' : String(value);
  const onKey = (key: PadKey) => {
    if (disabled || key === '.') return;
    trace?.('tap', `key-${key}`);
    const next = applyPadKey(text, key, digits);
    onChange(next === '' ? null : Number(next));
  };
  const keyHighlight =
    highlighted === null ? null : (String(highlighted).slice(-1) as PadKey | undefined);
  return (
    <div className={['ni-entry', className].filter(Boolean).join(' ')} data-kind="pad">
      <div className="ni-entry__row">
        <NumberDisplay
          value={value}
          digits={digits}
          size="lg"
          state={disabled ? 'idle' : 'active'}
          label="ui.widget.answer"
          className="ni-entry__display"
        />
        {check}
      </div>
      <NumberPadKeys
        onKey={onKey}
        onEnter={onEnter}
        disabled={disabled}
        captureKeyboard={captureKeyboard}
        highlighted={keyHighlight ?? null}
      />
    </div>
  );
}
