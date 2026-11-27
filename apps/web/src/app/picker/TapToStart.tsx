// 06 §5: "Audio unlocks on the first tap of the Profile Picker. Show a big 'Tap to start' if the
// context is locked." The whole screen is the button, so any tap anywhere unlocks the audio.

import { icons, useNarrationText } from '@number-island/ui';

export function TapToStart({ onStart }: { onStart: () => void }) {
  const text = useNarrationText();
  return (
    <button
      type="button"
      data-testid="tap-to-start"
      aria-label={text('ui.start.tap')}
      onClick={onStart}
      className="absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center gap-8 bg-[rgb(23_96_110/0.78)] backdrop-blur-[3px] focus-visible:outline-none"
    >
      <span className="motion-entrance animate-pop-in relative grid size-[min(16rem,38vh)] place-items-center rounded-full border-[6px] border-sunshine-deep bg-sunshine shadow-lift">
        <svg viewBox="0 0 100 100" className="size-[48%] translate-x-[6%]" aria-hidden="true">
          <path
            d="M30 18c0-6 6-9 11-6l44 31c5 3 5 11 0 14L41 88c-5 3-11 0-11-6Z"
            fill="#fffaf0"
            stroke="#264653"
            strokeWidth={6}
            strokeLinejoin="round"
          />
        </svg>
        <span className="motion-loop animate-hand pointer-events-none absolute -right-[8%] -bottom-[10%] size-[42%]">
          <icons.HandPointerIcon />
        </span>
      </span>
      <span
        aria-hidden="true"
        className="rounded-pill bg-paper px-10 pt-3 pb-2 font-display text-[clamp(2.75rem,6vw,4.25rem)] leading-tight font-extrabold text-ink shadow-ledge ring-4 ring-sand-deep"
      >
        {text('ui.start.tap')}
      </span>
    </button>
  );
}
