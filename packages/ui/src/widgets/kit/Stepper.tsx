import type { NarrationKey } from '@number-island/shared';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import './stepper.css';

/**
 * A one-more / one-less counter (U05 #14): the number shows large between a minus and a plus key.
 * The K answer control where a 3 × 4 pad cannot fit the widget area (06 §1: 960 × 600), and the
 * tile builder of growing patterns. Each tap counts aloud (num.* clips, 06 §5). Keyboard: the keys
 * are buttons (Tab, Enter or Space).
 */
export interface StepperProps {
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  disabled?: boolean;
  /** Accessible name of the display (default "Your answer"). */
  label?: NarrationKey;
  labelVars?: Record<string, string | number>;
  /** Demo highlight of a key. */
  highlighted?: 'more' | 'less' | null;
  /** Speak the new number (06 §5). Defaults to the child's speakOnTap. */
  speak?: boolean;
  /** Called for every press (trace): `more` or `less`. */
  onPress?: (key: 'more' | 'less') => void;
  className?: string;
}

function PlusMinus({ plus }: { plus: boolean }) {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false">
      <path
        d={plus ? 'M12 24h24M24 12v24' : 'M12 24h24'}
        stroke="var(--color-ink)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  disabled,
  label = 'ui.widget.answer',
  labelVars,
  highlighted = null,
  speak,
  onPress,
  className,
}: StepperProps) {
  const t = useNarrationText();
  const prefs = useUiPreferences();
  const { sayNumber } = useSpeech();
  const speaks = speak ?? prefs.speakOnTap;
  const step = (key: 'more' | 'less') => {
    if (disabled) return;
    // Counting starts at one: the first "one more" from an empty display shows 1 (or min).
    const first = Math.min(max, min === 0 ? 1 : min);
    const next =
      value === null
        ? key === 'more'
          ? first
          : min - 1
        : key === 'more'
          ? Math.min(max, value + 1)
          : value - 1;
    onPress?.(key);
    if (next < min || next === value) return;
    if (speaks) sayNumber(next);
    onChange(next);
  };
  return (
    <div
      className={['ni-stepper', className].filter(Boolean).join(' ')}
      data-disabled={disabled ? 'true' : undefined}
    >
      <output
        className="ni-number ni-stepper__value"
        data-size="lg"
        data-empty={value === null ? 'true' : undefined}
        aria-label={`${t(label, labelVars)}: ${value ?? ''}`.trim()}
      >
        {value === null ? <span className="ni-number__slot" /> : <span>{value}</span>}
      </output>
      <div className="ni-stepper__keys">
        <button
          type="button"
          className={['ni-pad__key', 'ni-stepper__key', highlighted === 'less' ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data-key="less"
          aria-label={t('ui.widget.stepper.less')}
          disabled={disabled || value === null || value <= min}
          onClick={() => step('less')}
        >
          <span className="ni-pad__icon">
            <PlusMinus plus={false} />
          </span>
        </button>
        <button
          type="button"
          className={['ni-pad__key', 'ni-stepper__key', highlighted === 'more' ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data-key="more"
          aria-label={t('ui.widget.stepper.more')}
          disabled={disabled || (value !== null && value >= max)}
          onClick={() => step('more')}
        >
          <span className="ni-pad__icon">
            <PlusMinus plus />
          </span>
        </button>
      </div>
    </div>
  );
}
