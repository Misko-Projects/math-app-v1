import { type ReactNode, useEffect, useRef } from 'react';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import type { PadKey } from './controls';
import './fraction.css';

/**
 * Typing a fraction (U05, #14): two boxes stacked as a fraction (top number, bar, bottom number)
 * and a compact pad of large keys, 4 × 3, so it fits beside a picture in the smallest landscape
 * widget area (06 §1: 906 × 373). Tap a box to type into it; the digits (≥ 32 px, here 48 px)
 * show large in their box. With `decimal`, one box and a decimal point (DEC.01 read).
 *
 * Desktop: digits, Backspace and "." type; ArrowUp / ArrowDown move between the boxes; Enter
 * calls `onEnter` (the widget's check). Tapping a key speaks the digit when speakOnTap is on.
 */

export interface FractionEntryProps {
  /** Typed text of the top and bottom box (decimal: only the first). */
  texts: readonly [string, string];
  /** The box being typed into. */
  active: 0 | 1;
  onActivate: (slot: 0 | 1) => void;
  onKey: (key: PadKey) => void;
  onEnter?: () => void;
  disabled?: boolean;
  /** One box with a decimal point instead of a fraction. */
  decimal?: boolean;
  /** Demo: the key being pressed, and the box (or key) Pip points at. */
  pressedKey?: PadKey | null;
  invitedSlot?: 0 | 1 | null;
  captureKeyboard?: boolean;
  /** Drawn under the boxes (the widget's check), so the entry stays one compact row. */
  below?: ReactNode;
}

const KEYS: (PadKey | null)[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', 'back'];

export function FractionEntry({
  texts,
  active,
  onActivate,
  onKey,
  onEnter,
  disabled = false,
  decimal = false,
  pressedKey = null,
  invitedSlot = null,
  captureKeyboard = true,
  below,
}: FractionEntryProps) {
  const t = useNarrationText();
  const { speakOnTap } = useUiPreferences();
  const { sayNumber, say } = useSpeech();
  const latest = useRef({ onKey, onEnter, onActivate, disabled, decimal, active });
  latest.current = { onKey, onEnter, onActivate, disabled, decimal, active };

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
      } else if ((e.key === '.' || e.key === ',') && l.decimal) {
        e.preventDefault();
        l.onKey('.');
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !l.decimal) {
        if (!el?.closest('.ni-fentry')) return;
        e.preventDefault();
        l.onActivate(e.key === 'ArrowUp' ? 0 : 1);
      } else if (e.key === 'Enter' && l.onEnter) {
        if (el?.closest('button')) return;
        e.preventDefault();
        l.onEnter();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [captureKeyboard]);

  const box = (slot: 0 | 1) => {
    const text = texts[slot] ?? '';
    const name = decimal ? t('ui.widget.answer') : t(slot === 0 ? 'ui.frac.top' : 'ui.frac.bottom');
    return (
      <button
        type="button"
        className={['ni-fentry__box', invitedSlot === slot ? 'ni-invite' : '']
          .filter(Boolean)
          .join(' ')}
        data-slot={slot}
        data-empty={text === '' ? 'true' : undefined}
        data-active={active === slot && !disabled ? 'true' : undefined}
        aria-pressed={active === slot}
        aria-label={text === '' ? name : `${name} ${text}`}
        disabled={disabled}
        onClick={() => onActivate(slot)}
      >
        <span className="ni-fentry__digits" aria-hidden="true">
          {text}
        </span>
      </button>
    );
  };

  return (
    <div className="ni-fentry" data-decimal={decimal ? 'true' : undefined}>
      <div className="ni-fentry__column">
        <fieldset className="ni-fentry__fraction" aria-label={t('ui.widget.answer')}>
          {box(0)}
          {decimal ? null : (
            <>
              <span className="ni-fentry__bar" aria-hidden="true" />
              {box(1)}
            </>
          )}
        </fieldset>
        {below}
      </div>
      <fieldset className="ni-fentry__pad" aria-label={t('ui.widget.pad')} disabled={disabled}>
        {KEYS.map((key, i) => {
          if (key === null || (key === '.' && !decimal)) {
            // biome-ignore lint/suspicious/noArrayIndexKey: an empty cell keeps the 4 × 3 grid
            return <span key={`gap${i}`} className="ni-pad__gap" aria-hidden="true" />;
          }
          const label =
            key === 'back' ? t('ui.widget.key.back') : key === '.' ? t('ui.widget.key.point') : key;
          return (
            <button
              key={key}
              type="button"
              className={['ni-fentry__key', pressedKey === key ? 'ni-invite' : '']
                .filter(Boolean)
                .join(' ')}
              data-key={key}
              aria-label={label}
              onClick={() => {
                if (speakOnTap) {
                  if (/^[0-9]$/.test(key)) sayNumber(Number(key));
                  else say(key === 'back' ? 'ui.widget.key.back' : 'ui.widget.key.point');
                }
                onKey(key);
              }}
            >
              {key === 'back' ? (
                <BackKeyIcon />
              ) : (
                <span className="ni-fentry__digit" aria-hidden="true">
                  {key}
                </span>
              )}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}

function BackKeyIcon() {
  return (
    <svg viewBox="0 0 48 48" className="ni-fentry__icon" aria-hidden="true" focusable="false">
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
