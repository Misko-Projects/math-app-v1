// "The island is resting": shown on the picker when a child may not start now (quiet hours, or
// today's play time is used up). Calm and guilt-free (05 §7): a sleepy moon, one spoken line, a
// replay button and an "okay" that goes back to the picker. No session starts.

import type { NarrationKey } from '@number-island/shared';
import { BigButton, icons, ReplayButton, useNarrationText, useSpeech } from '@number-island/ui';
import { useEffect, useRef } from 'react';
import type { BlockedReason } from '../session/SessionController';

export const RESTING_LINES: Record<BlockedReason, NarrationKey> = {
  'quiet-hours': 'ui.rest.quiet-hours',
  'daily-cap': 'ui.rest.daily-cap',
};

export function SleepyMoon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 160" className={className} aria-hidden="true" focusable="false">
      <g fill="#f6d58a" stroke="#c9a245" strokeWidth={3} strokeLinejoin="round">
        <path d="M30 34l4 9 9 4-9 4-4 9-4-9-9-4 9-4Z" />
        <path d="M186 22l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        <path d="M176 104l3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" />
      </g>
      <path
        d="M128 18a62 62 0 1 0 52 92A52 52 0 1 1 128 18Z"
        fill="#f6d58a"
        stroke="#c9a245"
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path
        d="M86 74q7 7 14 0"
        fill="none"
        stroke="#264653"
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <path
        d="M100 110q10 6 20 0"
        fill="none"
        stroke="#264653"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <circle cx={86} cy={96} r={7} fill="#f4a261" opacity={0.5} />
      <g
        className="motion-loop animate-bob"
        fill="#c9d6ee"
        fontFamily="'Baloo 2', sans-serif"
        fontWeight={800}
      >
        <text x={146} y={70} fontSize={26}>
          z
        </text>
        <text x={160} y={50} fontSize={20}>
          z
        </text>
      </g>
    </svg>
  );
}

export function RestingOverlay({ reason, onDone }: { reason: BlockedReason; onDone: () => void }) {
  const { say } = useSpeech();
  const text = useNarrationText();
  const line = RESTING_LINES[reason];
  const okay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    say(line);
    okay.current?.querySelector('button')?.focus();
  }, [say, line]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resting-line"
      data-testid="resting-overlay"
      data-reason={reason}
      className="absolute inset-0 z-20 grid place-items-center bg-[rgb(23_45_72/0.72)] p-6 backdrop-blur-[3px]"
    >
      <div className="motion-entrance animate-pop-in flex w-full max-w-[40rem] flex-col items-center gap-6 rounded-[2.5rem] bg-[#22385a] px-8 pt-8 pb-10 text-center shadow-[0_12px_0_#152640,0_30px_60px_-20px_rgb(0_0_0/0.6)] ring-4 ring-[#3b5683]">
        <SleepyMoon className="h-[min(11rem,24vh)] w-auto" />
        <div className="flex items-center gap-5">
          <ReplayButton onPress={() => say(line)} />
          <p
            id="resting-line"
            className="max-w-[24rem] text-left font-body text-[1.75rem] leading-snug font-bold text-cloud"
          >
            {text(line)}
          </p>
        </div>
        <div ref={okay}>
          <BigButton
            label="ui.btn.okay"
            icon={<icons.CheckIcon tone="light" />}
            tone="leaf"
            onPress={onDone}
            showLabel
          />
        </div>
      </div>
    </div>
  );
}
