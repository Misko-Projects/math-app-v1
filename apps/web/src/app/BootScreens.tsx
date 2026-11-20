// What shows before the app is ready. Neither screen can use narration: narration.json is part of
// the content being loaded. The splash has no words to read but the title (06 §8: no skeleton
// loaders); the failure screen is for the parent, so its plain-text copy is inline (02 §7).

import { Panel } from '@number-island/ui';
import { BootError, type BootErrorCode } from './boot/boot';

/** A calm sand screen with the title; it fades in only if boot takes longer than a moment. */
export function BootSplash() {
  return (
    <div
      className="flex min-h-dvh w-full items-center justify-center bg-sand font-body text-ink"
      data-testid="boot-splash"
    >
      <p className="motion-entrance animate-rise font-display text-[clamp(3rem,7vw,6rem)] font-extrabold leading-none tracking-tight text-ink opacity-0 [animation-delay:400ms] [animation-fill-mode:forwards] [text-shadow:0_3px_0_#fff,0_7px_0_rgb(38_70_83/0.16)]">
        Number Island
      </p>
    </div>
  );
}

const COPY: Record<BootErrorCode | 'unknown', { title: string; body: string }> = {
  content_unreachable: {
    title: 'The game files didn’t load',
    body: 'This device needs to reach your Number Island server once to download the game. Connect to the same Wi-Fi as the computer running it, then try again.',
  },
  content_invalid: {
    title: 'The game files look damaged',
    body: 'Rebuild the content on the server computer (pnpm content:build), then try again.',
  },
  storage: {
    title: 'This browser can’t save progress',
    body: 'Number Island keeps everyone’s progress on this device. Turn off private browsing or allow this site to store data, then try again.',
  },
  unknown: {
    title: 'Number Island couldn’t open',
    body: 'Something unexpected went wrong while starting. Try again; if it keeps happening, the details below help to find the cause.',
  },
};

export function BootFailure({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const copy = COPY[error instanceof BootError ? error.code : 'unknown'];
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-sand p-6 font-body text-ink">
      <Panel as="section" title={copy.title} className="w-full max-w-xl">
        <p className="mt-3 text-lg leading-relaxed">{copy.body}</p>
        <div className="mt-6 flex justify-center">
          <button type="button" className="ni-btn ni-tone-sea px-8 text-xl" onClick={onRetry}>
            Try again
          </button>
        </div>
        <details className="mt-6 text-base text-ink-soft">
          <summary className="cursor-pointer font-bold">Details for grown-ups</summary>
          <p className="mt-2 font-mono text-sm [overflow-wrap:anywhere]">{error.message}</p>
        </details>
      </Panel>
    </main>
  );
}
