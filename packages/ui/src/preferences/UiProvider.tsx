import type { AudioManager, NarrationKey } from '@number-island/shared';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { type AgeMode, DEFAULT_SNAP_RADIUS_PX } from '../tokens/tokens';

/** Resolves a narration key to its display text (`narration.json` → `text`). */
export type NarrationTextResolver = (
  key: NarrationKey,
  vars?: Record<string, string | number>,
) => string | undefined;

export interface UiPreferences {
  /** 06 §4 target sizes and 06 §5 reading rules. */
  ageMode: AgeMode;
  /** Show text next to icons (06 §5: off for K, on from G1/G2). Defaults from `ageMode`. */
  textLabels: boolean;
  /** 06 §7 reduced motion: the OS preference, or forced on by the `reducedMotion` prop. */
  reducedMotion: boolean;
  /** 06 §7 motor setting: every drag becomes tap-to-select → tap-to-place. */
  tapOnly: boolean;
  /** 06 §4/§7 snap distance for drag targets, in CSS px. */
  snapRadiusPx: number;
  /** 06 §5: tapping a number, coin or shape speaks its name. */
  speakOnTap: boolean;
}

interface UiContextValue extends UiPreferences {
  audio: AudioManager | null;
  narrationText: NarrationTextResolver;
}

export interface UiProviderProps {
  children: ReactNode;
  ageMode?: AgeMode;
  textLabels?: boolean;
  /** `true` forces reduced motion on; omit to follow `prefers-reduced-motion`. */
  reducedMotion?: boolean;
  tapOnly?: boolean;
  snapRadiusPx?: number;
  speakOnTap?: boolean;
  /** The app's AudioManager (02 §5.5). Without one, spoken labels are silent. */
  audio?: AudioManager | null;
  /** Resolves narration keys to display text (captions, aria labels, G1+ button text). */
  narrationText?: NarrationTextResolver;
  /** Extra class names for the provider's root element. */
  className?: string;
}

const warned = new Set<string>();

/** Development fallback: a readable name from the key's last segment, plus a one-time warning. */
const fallbackNarrationText: NarrationTextResolver = (key) => {
  if (import.meta.env?.DEV && !warned.has(key)) {
    warned.add(key);
    console.warn(`[ui] no narration text for "${key}"; pass narrationText to UiProvider`);
  }
  const last = key.split('.').pop() ?? key;
  return last.replace(/-/g, ' ');
};

const defaultValue: UiContextValue = {
  ageMode: 'g1-up',
  textLabels: true,
  reducedMotion: false,
  tapOnly: false,
  snapRadiusPx: DEFAULT_SNAP_RADIUS_PX,
  speakOnTap: true,
  audio: null,
  narrationText: fallbackNarrationText,
};

const UiContext = createContext<UiContextValue>(defaultValue);

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** The OS `prefers-reduced-motion` setting, live. */
export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
}

/**
 * Child-facing UI preferences for everything below it: age mode (target sizes), text labels,
 * reduced motion, tap-only mode, snap radius, plus the AudioManager and narration text used for
 * spoken labels. Renders a `display: contents` root that carries the CSS hooks
 * (`data-age-mode`, `data-reduced-motion`) the tokens key off.
 */
export function UiProvider({
  children,
  ageMode = 'g1-up',
  textLabels,
  reducedMotion,
  tapOnly = false,
  snapRadiusPx = DEFAULT_SNAP_RADIUS_PX,
  speakOnTap = true,
  audio = null,
  narrationText = fallbackNarrationText,
  className,
}: UiProviderProps) {
  const systemReduced = useSystemReducedMotion();
  const effectiveReduced = reducedMotion === true || systemReduced;
  const value = useMemo<UiContextValue>(
    () => ({
      ageMode,
      textLabels: textLabels ?? ageMode !== 'k',
      reducedMotion: effectiveReduced,
      tapOnly,
      snapRadiusPx,
      speakOnTap,
      audio,
      narrationText,
    }),
    [
      ageMode,
      textLabels,
      effectiveReduced,
      tapOnly,
      snapRadiusPx,
      speakOnTap,
      audio,
      narrationText,
    ],
  );
  return (
    <UiContext.Provider value={value}>
      <div
        className={className ? `ni-root ${className}` : 'ni-root'}
        data-age-mode={ageMode}
        data-reduced-motion={reducedMotion === true ? 'true' : undefined}
        data-tap-only={tapOnly ? 'true' : undefined}
      >
        {children}
      </div>
    </UiContext.Provider>
  );
}

/** The current UI preferences. */
export function useUiPreferences(): UiPreferences {
  return useContext(UiContext);
}

/** True when animations should collapse to short fades or instant changes (06 §7). */
export function useReducedMotion(): boolean {
  // The provider already folds in the OS preference; the live OS check also covers components
  // used without a UiProvider (whose default context can't know the OS setting).
  const system = useSystemReducedMotion();
  return useContext(UiContext).reducedMotion || system;
}

/** Narration text lookup, falling back to a readable form of the key in development. */
export function useNarrationText(): (
  key: NarrationKey,
  vars?: Record<string, string | number>,
) => string {
  const { narrationText } = useContext(UiContext);
  return useCallback(
    (key, vars) => narrationText(key, vars) ?? fallbackNarrationText(key, vars) ?? key,
    [narrationText],
  );
}

/** Speaking helpers bound to the provider's AudioManager. Without one they do nothing. */
export function useSpeech(): {
  say: (key: NarrationKey, vars?: Record<string, string | number>) => void;
  sayNumber: (n: number) => void;
  sfx: (id: string) => void;
  audio: AudioManager | null;
} {
  const { audio } = useContext(UiContext);
  return useMemo(
    () => ({
      audio,
      say: (key, vars) => {
        void audio?.say(key, vars).catch(() => {});
      },
      sayNumber: (n) => {
        void audio?.sayPhrases([{ number: n }]).catch(() => {});
      },
      sfx: (id) => audio?.sfx(id),
    }),
    [audio],
  );
}
