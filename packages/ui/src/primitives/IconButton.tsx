import type { NarrationKey } from '@number-island/shared';
import { type ReactNode, useId } from 'react';
import { useNarrationText, useUiPreferences } from '../preferences/UiProvider';
import type { ButtonTone } from './BigButton';
import { type SpeakLabel, usePress } from './usePress';

export interface IconButtonProps {
  /** Narration key: the accessible name and the spoken label (06 §5). */
  label: NarrationKey;
  labelVars?: Record<string, string | number>;
  icon: ReactNode;
  tone?: ButtonTone;
  onPress?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  /** Show the label as a caption under the button: defaults to the provider's text mode. */
  caption?: boolean;
  /** Speak the label on press. `auto` speaks in K mode (06 §5). */
  speak?: SpeakLabel;
  debounceMs?: number;
  className?: string;
  /** Extra data attributes for presets (glow, playing…). */
  data?: Record<`data-${string}`, string | undefined>;
}

/**
 * A round icon-only button with a spoken label (06 §2, §5): no text-only controls, and in K mode
 * the label is spoken instead of read. 88 px in K mode, 72 px from G1 (06 §4).
 */
export function IconButton({
  label,
  labelVars,
  icon,
  tone = 'cloud',
  onPress,
  disabled = false,
  pressed,
  caption,
  speak,
  debounceMs,
  className,
  data,
}: IconButtonProps) {
  const { textLabels } = useUiPreferences();
  const text = useNarrationText()(label, labelVars);
  const handlePress = usePress({ label, onPress, speak, debounceMs });
  const captionId = useId();
  const showCaption = caption ?? textLabels;
  return (
    <span className="ni-iconbtn-wrap">
      <button
        type="button"
        className={['ni-btn', 'ni-iconbtn', `ni-tone-${tone}`, className].filter(Boolean).join(' ')}
        aria-label={showCaption ? undefined : text}
        aria-labelledby={showCaption ? captionId : undefined}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={handlePress}
        {...data}
      >
        <span className="ni-btn__icon">{icon}</span>
      </button>
      {showCaption ? (
        <span id={captionId} className="ni-caption">
          {text}
        </span>
      ) : null}
    </span>
  );
}
