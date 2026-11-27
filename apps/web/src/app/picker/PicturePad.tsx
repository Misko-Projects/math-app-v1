// The child's picture-password pad (06 §2): tap three of the nine pictures in order. Three slots
// fill as pictures are tapped; "take one back" undoes the last; the check button appears once all
// three are in. A wrong try is gentle (06 §6: no red X, no buzzer): "Let's try again!" and the
// slots clear. After three wrong tries a calm "Ask a grown-up to help you." stays up, and the pad
// keeps working (no lockout timer, 05 §7).

import type { ChildProfile } from '@number-island/shared';
import {
  BigButton,
  IconButton,
  icons,
  ReplayButton,
  SpeechBubble,
  useNarrationText,
  useSpeech,
} from '@number-island/ui';
import { useEffect, useRef, useState } from 'react';
import { ChildAvatar } from './ChildAvatar';
import { checkPicturePassword, PICTURE_PASSWORD_LENGTH } from './picturePassword';
import { PICTURE_IDS, PICTURES, PictureArt, type PictureId } from './pictures';

export const TRIES_BEFORE_HELP = 3;

export type PadMessage = 'try-again' | 'ask-help' | null;

export function PicturePad({
  child,
  index,
  onUnlock,
  onClose,
  check = checkPicturePassword,
}: {
  child: ChildProfile;
  /** The child's position in the picker (their accent colour). */
  index: number;
  onUnlock: () => void;
  onClose: () => void;
  /** Tests may inject the check. */
  check?: typeof checkPicturePassword;
}) {
  const { say } = useSpeech();
  const text = useNarrationText();
  const [picked, setPicked] = useState<PictureId[]>([]);
  const [wrong, setWrong] = useState(0);
  const [message, setMessage] = useState<PadMessage>(null);
  const [checking, setChecking] = useState(false);
  const [shake, setShake] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    say('ui.picture.prompt');
    return () => {
      mounted.current = false;
    };
  }, [say]);

  const full = picked.length === PICTURE_PASSWORD_LENGTH;

  const tap = (id: PictureId) => {
    say(PICTURES[id].key);
    if (checking || full || picked.includes(id)) return;
    setPicked((p) => [...p, id]);
    if (message === 'try-again') setMessage(null);
  };

  const submit = async () => {
    if (!full || checking || !child.picturePasswordHash) return;
    setChecking(true);
    const ok = await check(child.id, picked, child.picturePasswordHash).catch(() => false);
    if (!mounted.current) return;
    setChecking(false);
    if (ok) {
      onUnlock();
      return;
    }
    const tries = wrong + 1;
    setWrong(tries);
    setPicked([]);
    setShake((n) => n + 1);
    const next: PadMessage = tries >= TRIES_BEFORE_HELP ? 'ask-help' : 'try-again';
    setMessage(next);
    say(next === 'ask-help' ? 'ui.picture.ask-help' : 'ui.picture.try-again');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={child.name}
      data-testid="picture-pad"
      className="absolute inset-0 z-10 overflow-y-auto bg-[linear-gradient(to_bottom,var(--color-sky-light),var(--color-horizon))]"
    >
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))]">
        <IconButton label="ui.btn.close" icon={<icons.BackIcon />} onPress={onClose} />
      </div>
      <div className="mx-auto flex min-h-full max-w-[72rem] flex-wrap items-center justify-center gap-x-16 gap-y-8 px-8 py-10">
        {/* Left: who, the prompt, the slots and the controls. */}
        <div className="flex w-[24rem] max-w-full flex-col items-center gap-5">
          <div className="flex items-center gap-4">
            <ChildAvatar
              name={child.name}
              avatar={child.avatar}
              index={index}
              className="size-[120px] flex-none"
            />
            <p className="line-clamp-2 max-w-[13rem] font-body text-[2rem] leading-tight font-bold break-words text-ink">
              {child.name}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ReplayButton onPress={() => say('ui.picture.prompt')} />
            <p className="max-w-[16rem] font-body text-[1.5rem] leading-snug font-bold text-ink">
              {text('ui.picture.prompt')}
            </p>
          </div>
          <ol
            key={shake}
            aria-hidden="true"
            data-testid="password-slots"
            data-filled={picked.length}
            className={[
              'flex gap-4',
              shake > 0 ? 'motion-entrance animate-[ni-wiggle_420ms_ease-in-out]' : '',
            ].join(' ')}
          >
            {Array.from({ length: PICTURE_PASSWORD_LENGTH }, (_, i) => {
              const id = picked[i];
              return (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: the slots are positions
                  key={i}
                  data-filled={id ? 'true' : 'false'}
                  className={[
                    'grid size-[5.75rem] place-items-center rounded-[1.5rem]',
                    id
                      ? 'bg-paper ring-4 ring-sea-deep shadow-ledge'
                      : 'border-4 border-dashed border-[#9c8a66] bg-paper/60',
                  ].join(' ')}
                >
                  {id ? (
                    <PictureArt id={id} className="size-[4.5rem]" />
                  ) : (
                    <span className="size-4 rounded-full bg-[#9c8a66]/70" />
                  )}
                </li>
              );
            })}
          </ol>
          <div className="flex min-h-[7rem] items-center gap-6">
            <IconButton
              label="ui.picture.undo"
              icon={<UndoIcon />}
              disabled={picked.length === 0 || checking}
              onPress={() => setPicked((p) => p.slice(0, -1))}
            />
            {full ? (
              <BigButton
                label="ui.btn.check"
                icon={<icons.CheckIcon tone="light" />}
                tone="leaf"
                debounceMs={400}
                disabled={checking}
                onPress={() => void submit()}
              />
            ) : null}
          </div>
          <div className="flex min-h-[7.5rem] items-center" aria-live="polite">
            {message ? (
              <SpeechBubble
                say={message === 'ask-help' ? 'ui.picture.ask-help' : 'ui.picture.try-again'}
                showText
                tail="none"
                tone={message === 'ask-help' ? 'sky' : 'sun'}
              >
                {message === 'ask-help' ? <GrownUpIcon /> : null}
              </SpeechBubble>
            ) : null}
          </div>
        </div>
        {/* Right: the nine pictures. */}
        <ul className="grid grid-cols-3 gap-5" aria-label={text('ui.picture.prompt')}>
          {PICTURE_IDS.map((id) => {
            const used = picked.includes(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-label={text(PICTURES[id].key)}
                  aria-pressed={used}
                  data-picture={id}
                  onClick={() => tap(id)}
                  className={[
                    'grid size-[clamp(6.5rem,17vh,8.5rem)] place-items-center rounded-[1.75rem] bg-paper ring-4 transition-transform',
                    'focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ink',
                    used
                      ? 'opacity-45 ring-sand-deep shadow-ledge-pressed grayscale-[60%]'
                      : 'ring-sand-deep shadow-ledge active:shadow-ledge-pressed active:brightness-95',
                  ].join(' ')}
                >
                  <PictureArt id={id} className="size-[78%]" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** "Take one back": a curved arrow turning back (not the straight "go back" arrow). */
function UndoIcon() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false">
      <path
        d="M14 20h17a9 9 0 0 1 0 18H22"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 12l-8 8 8 8"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A grown-up beside a child: the "ask a grown-up" picture. */
function GrownUpIcon() {
  return (
    <svg viewBox="0 0 64 64" className="size-14" aria-hidden="true" focusable="false">
      <circle cx={24} cy={16} r={9} fill="#e8b48a" stroke="#264653" strokeWidth={3} />
      <path
        d="M10 58c0-16 6-28 14-28s14 12 14 28Z"
        fill="#2a9d8f"
        stroke="#264653"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <circle cx={46} cy={32} r={7} fill="#cd8f60" stroke="#264653" strokeWidth={3} />
      <path
        d="M36 58c0-11 4-18 10-18s10 7 10 18Z"
        fill="#e9c46a"
        stroke="#264653"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path d="M34 42l6-4" stroke="#264653" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}
