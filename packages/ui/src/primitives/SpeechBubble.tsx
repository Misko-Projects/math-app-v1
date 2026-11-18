import type { NarrationKey } from '@number-island/shared';
import type { ReactNode } from 'react';
import { useNarrationText, useSpeech, useUiPreferences } from '../preferences/UiProvider';
import { SpeakerIcon, StarIcon } from './icons';

export type BubbleTail = 'bottom' | 'bottom-left' | 'bottom-right' | 'left' | 'right' | 'none';

export interface SpeechBubbleProps {
  /** The line this bubble says. Its text shows in text mode or with captions; tapping speaks it. */
  say?: NarrationKey;
  vars?: Record<string, string | number>;
  /** Pictures inside the bubble (a request's material icons, a count…); always visible. */
  children?: ReactNode;
  tail?: BubbleTail;
  tone?: 'cloud' | 'sun' | 'sky';
  /** 06 §2: the recommended request pulses (a static glow plus a star with reduced motion). */
  recommended?: boolean;
  /** Makes the bubble a button (a request to pick). Tapping speaks `say` first. */
  onPress?: () => void;
  /** Show the `say` text. Defaults to the provider's text mode (06 §5: no required reading in K). */
  showText?: boolean;
  className?: string;
}

function Tail() {
  return (
    <svg className="ni-bubble__tail" viewBox="0 0 44 34" aria-hidden="true" focusable="false">
      <path d="M3 0c6 9 8 19 3 31 13-3 26-14 35-31" />
    </svg>
  );
}

/**
 * A speech bubble for Pip, residents and requests (06 §2). Audio-first: the words are spoken, and
 * the text is shown only in text mode. With no visible words or pictures, a speaker glyph invites a
 * tap to hear the line.
 */
export function SpeechBubble({
  say,
  vars,
  children,
  tail = 'bottom',
  tone = 'cloud',
  recommended = false,
  onPress,
  showText,
  className,
}: SpeechBubbleProps) {
  const { textLabels } = useUiPreferences();
  const narrationText = useNarrationText();
  const speech = useSpeech();
  const text = say ? narrationText(say, vars) : undefined;
  const textVisible = Boolean(text) && (showText ?? textLabels);
  const showGlyph = !textVisible && children == null;
  const content = (
    <>
      {children}
      {textVisible ? <span className="ni-bubble__text">{text}</span> : null}
      {showGlyph ? (
        <span className="ni-bubble__glyph">
          <SpeakerIcon />
        </span>
      ) : null}
      {recommended ? (
        <span className="ni-bubble__badge">
          <StarIcon />
        </span>
      ) : null}
      {tail === 'none' ? null : <Tail />}
    </>
  );
  const common = {
    className: ['ni-bubble', className].filter(Boolean).join(' '),
    'data-tail': tail,
    'data-tone': tone,
    'data-recommended': recommended ? 'true' : undefined,
  } as const;

  if (onPress || say) {
    const handle = () => {
      if (say) speech.say(say, vars);
      onPress?.();
    };
    return (
      <button
        type="button"
        {...common}
        aria-label={textVisible ? undefined : text}
        onClick={handle}
      >
        {content}
      </button>
    );
  }
  return <div {...common}>{content}</div>;
}
