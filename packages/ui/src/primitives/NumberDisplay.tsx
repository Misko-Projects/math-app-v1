import type { NarrationKey } from '@number-island/shared';
import { useNarrationText, useSpeech, useUiPreferences } from '../preferences/UiProvider';

export interface NumberDisplayProps {
  /** The number shown, or null/'' for an empty blank. Strings are shown as typed (e.g. "07"). */
  value: number | string | null;
  /** Empty slots drawn when there is no value (for a number pad blank with maxDigits). */
  digits?: number;
  /** 48 / 72 / 96 px numerals: always ≥ 32 px (05 §11). */
  size?: 'md' | 'lg' | 'xl';
  /** `active`: the blank being typed into (caret). `celebrate`: a correct answer pops. */
  state?: 'idle' | 'active' | 'celebrate';
  /** Narration key for the display's accessible name (e.g. "Your answer"). */
  label?: NarrationKey;
  /** Speak the number when tapped (06 §5). Defaults to the provider's speakOnTap. */
  speakOnTap?: boolean;
  className?: string;
}

/**
 * A big numeral slate: the entered number on the number pad (06 §4 "show the entered number
 * large"), counts and totals. Tapping it speaks the number.
 */
export function NumberDisplay({
  value,
  digits = 1,
  size = 'md',
  state = 'idle',
  label,
  speakOnTap,
  className,
}: NumberDisplayProps) {
  const prefs = useUiPreferences();
  const narrationText = useNarrationText();
  const { sayNumber } = useSpeech();
  const shown = value === null ? '' : String(value);
  const empty = shown === '';
  const numeric = typeof value === 'number' ? value : empty ? null : Number(shown);
  const speaks = (speakOnTap ?? prefs.speakOnTap) && numeric !== null && Number.isFinite(numeric);
  const name = label ? narrationText(label) : undefined;
  const body = empty ? (
    <>
      {Array.from({ length: Math.max(1, digits) }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative slots
        <span key={i} className="ni-number__slot" />
      ))}
      {state === 'active' ? <span className="ni-number__caret" /> : null}
    </>
  ) : (
    <>
      <span>{shown}</span>
      {state === 'active' ? <span className="ni-number__caret" /> : null}
    </>
  );
  const common = {
    className: ['ni-number', className].filter(Boolean).join(' '),
    'data-size': size,
    'data-state': state,
    'data-empty': empty ? 'true' : undefined,
  } as const;

  if (speaks && numeric !== null) {
    return (
      <button
        type="button"
        {...common}
        aria-label={name ? `${name}: ${shown}` : shown}
        onClick={() => sayNumber(numeric)}
      >
        {body}
      </button>
    );
  }
  return (
    <output {...common} aria-label={name ? `${name}: ${empty ? '' : shown}`.trim() : undefined}>
      {body}
    </output>
  );
}
