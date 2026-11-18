import type { NarrationKey } from '@number-island/shared';
import type { ReactNode } from 'react';
import { useNarrationText, useUiPreferences } from '../preferences/UiProvider';
import { type SpeakLabel, usePress } from './usePress';

export type ButtonTone = 'sea' | 'sun' | 'leaf' | 'cloud';

export interface BigButtonProps {
  /** Narration key: the accessible name, the spoken label and (in text mode) the visible text. */
  label: NarrationKey;
  labelVars?: Record<string, string | number>;
  /** Required in spirit for K mode (06 §5: no required reading); decorative. */
  icon?: ReactNode;
  tone?: ButtonTone;
  onPress?: () => void;
  disabled?: boolean;
  /** A toggle's state (aria-pressed). */
  pressed?: boolean;
  /** Show the label text: defaults to the provider's text mode, or always when there is no icon. */
  showLabel?: boolean;
  speak?: SpeakLabel;
  /** Ignore repeat presses within this window (use 400 for "check", 06 §4). */
  debounceMs?: number;
  className?: string;
  type?: 'button' | 'submit';
}

/**
 * The big chunky action button (06 §4): ≥ 96 px tall in K mode, ≥ 76 px from G1, with a solid
 * ledge that presses down on tap. In K mode it shows only its icon and speaks its label.
 */
export function BigButton({
  label,
  labelVars,
  icon,
  tone = 'sea',
  onPress,
  disabled = false,
  pressed,
  showLabel,
  speak,
  debounceMs,
  className,
  type = 'button',
}: BigButtonProps) {
  const { textLabels } = useUiPreferences();
  const text = useNarrationText()(label, labelVars);
  const handlePress = usePress({ label, onPress, speak, debounceMs });
  const visibleLabel = showLabel ?? (textLabels || !icon);
  return (
    <button
      type={type}
      className={['ni-btn', `ni-tone-${tone}`, className].filter(Boolean).join(' ')}
      aria-label={visibleLabel ? undefined : text}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={handlePress}
    >
      {icon ? <span className="ni-btn__icon">{icon}</span> : null}
      {visibleLabel ? <span className="ni-btn__label">{text}</span> : null}
    </button>
  );
}
