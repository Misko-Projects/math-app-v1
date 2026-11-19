import { useCallback, useRef, useState } from 'react';
import { HandPointerIcon } from '../../primitives/icons';
import { applyPadKey, type PadKey } from './controls';
import './pad-entry.css';

/**
 * Typed boxes for the U05 widgets that read a quantity on the number pad (06 §4): the coin-count
 * `$ _ . _ _` pad and the clock-read `_ _ : _ _` digital pad. A box with `exactDigits` (cents,
 * minutes) keeps leading zeros and only counts as filled with all its digits, so "05" never reads
 * as 50. A full box moves typing on to the next empty one.
 */

export interface PadBox {
  id: string;
  maxDigits: number;
  /** Every digit must be typed (cents, minutes): leading zeros stay. */
  exactDigits?: boolean;
}

export function padBoxValue(text: string, box: PadBox): number | null {
  if (text === '') return null;
  if (box.exactDigits && text.length < box.maxDigits) return null;
  const v = Number(text);
  return Number.isFinite(v) ? v : null;
}

/** One key into one box's text. */
export function applyBoxKey(text: string, key: PadKey, box: PadBox): string {
  if (key === '.') return text;
  if (key === 'back') return text.slice(0, -1);
  if (box.exactDigits) return text.length >= box.maxDigits ? text : text + key;
  return applyPadKey(text, key, box.maxDigits);
}

export function usePadEntry(boxes: readonly PadBox[]) {
  const [texts, setTextsState] = useState<string[]>(() => boxes.map(() => ''));
  const [active, setActive] = useState(0);
  const ref = useRef(texts);
  const setTexts = useCallback((next: string[]) => {
    ref.current = next;
    setTextsState(next);
  }, []);
  const type = useCallback(
    (key: PadKey, at?: number) => {
      const i = Math.min(at ?? active, boxes.length - 1);
      const box = boxes[i];
      if (!box) return;
      const nextText = applyBoxKey(ref.current[i] ?? '', key, box);
      const next = [...ref.current];
      next[i] = nextText;
      setTexts(next);
      if (key !== 'back' && nextText.length >= box.maxDigits) {
        const after = next.findIndex((t, j) => j > i && t === '');
        if (after >= 0) setActive(after);
      }
    },
    [active, boxes, setTexts],
  );
  const values = texts.map((t, i) => padBoxValue(t, boxes[i] as PadBox));
  return {
    texts,
    textsRef: ref,
    setTexts,
    active,
    setActive,
    type,
    values,
    complete: values.every((v) => v !== null),
  };
}

export interface PadBoxViewProps {
  box: PadBox;
  text: string;
  label: string;
  active: boolean;
  invited?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/** One typed box: big numerals (≥ 32 px), an empty slot per missing digit, the caret when active. */
export function PadBoxView({
  box,
  text,
  label,
  active,
  invited,
  disabled,
  onPress,
}: PadBoxViewProps) {
  const missing = box.exactDigits ? Math.max(0, box.maxDigits - text.length) : text === '' ? 1 : 0;
  return (
    <span className="ni-padbox__wrap">
      <button
        type="button"
        className={['ni-number', 'ni-padbox', invited ? 'ni-invite' : ''].filter(Boolean).join(' ')}
        style={{ minWidth: `${box.maxDigits * 0.62 + 0.8}em` }}
        data-box={box.id}
        data-state={active && !disabled ? 'active' : 'idle'}
        data-empty={text === '' ? 'true' : undefined}
        aria-label={`${label}: ${text}`.trim()}
        aria-current={active && !disabled ? 'true' : undefined}
        disabled={disabled}
        onClick={onPress}
      >
        {text === '' ? null : <span>{text}</span>}
        {Array.from({ length: missing }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: empty digit slots are positional
          <span key={i} className="ni-number__slot" />
        ))}
        {active && !disabled ? <span className="ni-number__caret" /> : null}
      </button>
      {invited ? (
        <span className="ni-hand ni-padbox__hand">
          <HandPointerIcon />
        </span>
      ) : null}
    </span>
  );
}
