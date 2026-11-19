// The parent area's frame (06 §3): behind the gate, normal-density UI, a calm offline cloud in
// the header only (06 §8), and Lock / Back to the island.

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import type { ParentApi } from './api';
import { Button, GateIcon, OfflineCloud } from './kit';
import { useParentApi, useParentGate, useParentUnlocked } from './ParentContext';
import { ParentGateScreen } from './ParentGateScreen';

const SERVER_CHECK_MS = 30_000;

/**
 * Whether the island server answers `/api/health`: checked on entry, every 30 s and when the
 * browser's connection changes. `null` until the first answer. (`navigator.onLine` alone misses a
 * stopped server on a working Wi-Fi.)
 */
function useServerReachable(api: ParentApi, enabled: boolean): boolean | null {
  const [reachable, setReachable] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let ctl: AbortController | null = null;
    const check = () => {
      ctl?.abort();
      const current = new AbortController();
      ctl = current;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        current.abort();
      }, 5000);
      api.health(current.signal).then(
        (h) => {
          clearTimeout(timeout);
          if (active) setReachable(h.ok);
        },
        () => {
          clearTimeout(timeout);
          // A check replaced by a newer one says nothing; a timeout or failure means unreachable.
          if (active && (timedOut || !current.signal.aborted)) setReachable(false);
        },
      );
    };
    const offline = () => setReachable(false);
    check();
    const interval = setInterval(check, SERVER_CHECK_MS);
    window.addEventListener('online', check);
    window.addEventListener('offline', offline);
    return () => {
      active = false;
      ctl?.abort();
      clearInterval(interval);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', offline);
    };
  }, [api, enabled]);
  return reachable;
}

export function ParentLayout() {
  const unlocked = useParentUnlocked();
  const gate = useParentGate();
  const api = useParentApi();
  const reachable = useServerReachable(api, unlocked);
  const navigate = useNavigate();

  // Parent activity keeps the 10-minute gate session alive.
  useEffect(() => {
    if (!unlocked) return;
    const touch = () => gate.touch();
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, [gate, unlocked]);

  if (!unlocked) return <ParentGateScreen />;

  const lock = () => {
    gate.lock();
    void api.logout().catch(() => {});
    navigate('/');
  };

  return (
    <div className="min-h-dvh w-full bg-sand font-body text-ink">
      <header className="sticky top-0 z-10 border-b-2 border-sand-deep bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <NavLink
            to="/parent"
            end
            className="flex items-center gap-3 rounded-xl focus-visible:outline-4 focus-visible:outline-ink"
          >
            <GateIcon className="size-9" />
            <span className="font-display text-2xl font-extrabold">Grown-ups</span>
          </NavLink>
          {reachable === false ? (
            <OfflineCloud label="Can’t reach the island server: changes sync when it’s back" />
          ) : null}
          <div className="ml-auto flex items-center gap-3">
            <Button variant="secondary" onClick={() => navigate('/')}>
              Back to the island
            </Button>
            <Button variant="primary" onClick={lock}>
              Lock
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
