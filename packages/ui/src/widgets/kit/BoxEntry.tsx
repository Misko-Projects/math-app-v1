import type { ReactNode } from 'react';
import { useNarrationText } from '../../preferences/UiProvider';
import { applyPadKey, NumberPadKeys, type PadKey, padValue } from './controls';
import './box-entry.css';

/**
 * Typed answers for manipulative widgets (U05: how many units, how much longer, the perimeter):
 * one or more answer boxes (numerals ≥ 32 px) and the 3 × 4 number pad (06 §4). Tapping a box
 * makes it the one being typed into. `compact` puts the boxes beside a 6 × 2 pad at the age
 * mode's target size, for the smallest landscape widget area (06 §1).
 *
 * The widget keeps the typed texts (`texts`) and turns them into the engine model's `answer` op
 * with `padValue`; the response itself always comes from the model.
 */
export interface BoxEntryProps {
  texts: readonly string[];
  active: number;
  onActive: (index: number) => void;
  onTexts: (texts: string[]) => void;
  /** Accessible name of each box (e.g. "Your answer", "Shells"). */
  labels: readonly string[];
  /** Drawn inside each box after the number (a unit picture or symbol). */
  adornments?: readonly ReactNode[];
  maxDigits?: number;
  allowDecimal?: boolean;
  disabled?: boolean;
  compact?: boolean;
  /** With `compact`: `wide` puts the boxes beside a 6 × 2 pad, `tall` beside a 3 × 4 pad. */
  shape?: 'wide' | 'tall';
  /** Demo: the key being pressed, and a box under Pip's hand. */
  highlightedKey?: PadKey | null;
  invitedBox?: number | null;
  /** Physical Enter (desktop). */
  onEnter?: () => void;
  /** Typing records a `tap` on `key-<k>` (the trace). */
  onKeyTrace?: (key: PadKey) => void;
  /** Shown under the boxes (e.g. a sign and the Check button, in a tall layout). */
  aside?: ReactNode;
}

export function BoxEntry({
  texts,
  active,
  onActive,
  onTexts,
  labels,
  adornments = [],
  maxDigits = 2,
  allowDecimal = false,
  disabled = false,
  compact = false,
  shape = 'wide',
  highlightedKey = null,
  invitedBox = null,
  onEnter,
  onKeyTrace,
  aside,
}: BoxEntryProps) {
  const t = useNarrationText();
  return (
    <div
      className="ni-boxentry"
      data-compact={compact ? 'true' : undefined}
      data-shape={compact ? shape : undefined}
    >
      <div className="ni-boxentry__boxes">
        {texts.map((text, i) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: one box per answer slot, fixed
            key={i}
            type="button"
            className={[
              'ni-boxentry__box',
              i === active && texts.length > 1 ? 'ni-boxentry__box--active' : '',
              invitedBox === i ? 'ni-invite' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-box={i}
            aria-label={`${labels[i] ?? t('ui.widget.answer')}: ${text === '' ? '?' : text}`}
            aria-pressed={texts.length > 1 ? i === active : undefined}
            disabled={disabled}
            onClick={() => onActive(i)}
          >
            <span className="ni-boxentry__text" data-empty={text === '' ? 'true' : undefined}>
              {text === '' ? '?' : text}
            </span>
            {adornments[i] ? <span className="ni-boxentry__unit">{adornments[i]}</span> : null}
          </button>
        ))}
        {aside}
      </div>
      <NumberPadKeys
        allowDecimal={allowDecimal}
        disabled={disabled}
        highlighted={highlightedKey}
        onEnter={onEnter}
        onKey={(key) => {
          onKeyTrace?.(key);
          const next = [...texts];
          next[active] = applyPadKey(texts[active] ?? '', key, maxDigits);
          onTexts(next);
        }}
      />
    </div>
  );
}

/** The typed numbers, or null while a box is empty. */
export function enteredValues(texts: readonly string[]): number[] | null {
  const values = texts.map(padValue);
  return values.every((v): v is number => v !== null) ? values : null;
}
