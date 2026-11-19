// The parent area's frame (06 §3): behind the gate, normal-density UI, a calm offline cloud in
// the header only (06 §8), and Lock / Back to the island.

import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useOnline } from '@/app/hooks';
import { Button, GateIcon, OfflineCloud } from './kit';
import { useParentApi, useParentGate, useParentUnlocked } from './ParentContext';
import { ParentGateScreen } from './ParentGateScreen';

export function ParentLayout() {
  const unlocked = useParentUnlocked();
  const gate = useParentGate();
  const api = useParentApi();
  const online = useOnline();
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
          {online ? null : <OfflineCloud />}
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
