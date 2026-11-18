import { useCallback, useEffect, useRef, useState } from 'react';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from './AppServices';
import { BootFailure, BootSplash } from './BootScreens';
import { type AppServices, type BootError, bootApp } from './boot/boot';
import { router as defaultRouter } from './router';

type BootState =
  | { kind: 'loading' }
  | { kind: 'ready'; services: AppServices }
  | { kind: 'error'; error: BootError | Error };

export interface AppProps {
  /** Tests inject a boot with fake storage and fetch. */
  boot?: () => Promise<AppServices>;
  router?: typeof defaultRouter;
}

export function App({ boot = bootApp, router = defaultRouter }: AppProps) {
  const [state, setState] = useState<BootState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // One boot per attempt, even when StrictMode runs the effect twice: two stores on one database
  // would race each other's projection rebuilds.
  const started = useRef<{
    attempt: number;
    promise: Promise<AppServices>;
    dispose: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  useEffect(() => {
    if (started.current?.attempt !== attempt) {
      started.current = { attempt, promise: boot(), dispose: null };
    }
    const run = started.current;
    // StrictMode's simulated unmount is followed at once by a remount: keep the services then.
    if (run.dispose !== null) clearTimeout(run.dispose);
    run.dispose = null;
    let active = true;
    run.promise.then(
      (services) => {
        if (active) setState({ kind: 'ready', services });
      },
      (error: unknown) => {
        if (active) {
          setState({
            kind: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },
    );
    return () => {
      active = false;
      // A real unmount: stop syncing and close the database (now, or when a pending boot lands).
      run.dispose = setTimeout(() => {
        if (started.current === run) started.current = null;
        run.promise.then(
          (services) => services.dispose(),
          () => {},
        );
      }, 0);
    };
  }, [boot, attempt]);

  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  if (state.kind === 'loading') return <BootSplash />;
  if (state.kind === 'error') return <BootFailure error={state.error} onRetry={retry} />;
  return (
    <AppProviders services={state.services}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
