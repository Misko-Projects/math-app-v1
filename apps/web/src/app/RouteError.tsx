// What shows when a route can't open: most often a page loaded on demand (the parent area, the
// first-run screens) whose file couldn't be fetched because the device went offline. A child may
// see it too, so the words are calm and blame no one, and both buttons are safe: Try again reloads
// this page, Back to the island goes home inside the running app (the picker is already loaded,
// so it opens offline too). Nothing is deleted or reset. Like the boot failure screen, its copy is
// inline plain text (02 §7): it must work when nothing else could load.
//
// One place has no way back: the welcome screen. Home sends a device with no family straight to
// it, so when its own file is what failed, Back to the island would only lead here again. There
// the screen offers Try again alone.

import { Panel } from '@number-island/ui';
import { useLocation, useNavigate, useRouteError } from 'react-router';

export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canGoHome = !/^\/welcome\/?$/.test(pathname);
  const detail = error instanceof Error ? error.message : String(error ?? '');
  return (
    <main
      className="flex min-h-dvh w-full items-center justify-center bg-sand p-6 font-body text-ink"
      data-testid="route-error"
    >
      <Panel as="section" title="This part of the island didn’t open" className="w-full max-w-xl">
        <p className="mt-3 text-lg leading-relaxed">
          Let’s try that again. If it still won’t open, ask a grown-up to check that this device is
          connected to the internet.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <button
            type="button"
            className="ni-btn ni-tone-sea px-8 text-xl"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
          {canGoHome ? (
            <button
              type="button"
              className="ni-btn ni-tone-cloud px-8 text-xl"
              onClick={() => navigate('/', { replace: true })}
            >
              Back to the island
            </button>
          ) : null}
        </div>
        {detail ? (
          <details className="mt-6 text-base text-ink-soft">
            <summary className="cursor-pointer font-bold">Details for grown-ups</summary>
            <p className="mt-2 font-mono text-sm [overflow-wrap:anywhere]">{detail}</p>
          </details>
        ) : null}
      </Panel>
    </main>
  );
}
