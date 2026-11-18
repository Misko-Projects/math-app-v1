import type { NarrationKey } from '@number-island/shared';
import { useCallback, useRef } from 'react';
import { useSpeech, useUiPreferences } from '../preferences/UiProvider';

/**
 * When a control speaks its label on press (06 §5: in K mode every button is an icon with a spoken
 * label). `auto` speaks in K mode only.
 */
export type SpeakLabel = 'auto' | 'always' | 'never';

export interface PressOptions {
  label: NarrationKey;
  onPress?: () => void;
  speak?: SpeakLabel;
  /** Ignore presses closer together than this (06 §4: ≥ 400 ms on "check"). */
  debounceMs?: number;
  /** Injected clock for tests; defaults to performance.now(). */
  now?: () => number;
}

/** A press handler that speaks the label when the age mode asks for it and debounces repeats. */
export function usePress({ label, onPress, speak = 'auto', debounceMs = 0, now }: PressOptions) {
  const { ageMode } = useUiPreferences();
  const { say } = useSpeech();
  const last = useRef(Number.NEGATIVE_INFINITY);
  const shouldSpeak = speak === 'always' || (speak === 'auto' && ageMode === 'k');
  return useCallback(() => {
    const t = (now ?? (() => performance.now()))();
    if (debounceMs > 0 && t - last.current < debounceMs) return;
    last.current = t;
    if (shouldSpeak) say(label);
    onPress?.();
  }, [debounceMs, label, now, onPress, say, shouldSpeak]);
}
