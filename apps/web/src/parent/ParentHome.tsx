// The parent area's home. The dashboard, skill map, settings and backups arrive with P01; this
// page holds what the app shell owns: picture passwords, this device (sync, pairing another device,
// sign-out) and the diagnostics page.

import { Panel } from '@number-island/ui';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAppServices } from '@/app/AppServices';
import { recordDiagnostic } from '@/app/diagnostics';
import { useDeviceRecord, useSyncState } from '@/app/hooks';
import { useProfiles } from '@/data/hooks';
import { ApiError } from './api';
import { Button, Notice } from './kit';
import { useParentApi, useParentGate } from './ParentContext';
import { ParentGuides } from './ParentGuides';
import { PicturePasswords } from './PicturePasswords';

export function formatWhen(ts: number | null, now = Date.now()): string {
  if (ts === null) return 'never';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleString();
}

/** "Mia", "Mia and Leo", "Mia, Leo and Ana". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export function ParentHome() {
  const { sync } = useAppServices();
  const gate = useParentGate();
  const api = useParentApi();
  const device = useDeviceRecord();
  const syncState = useSyncState();
  const profiles = useProfiles();
  const navigate = useNavigate();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const paired = Boolean(device?.deviceToken);

  const syncNow = async () => {
    setSyncNote('Syncing…');
    const out = await sync.syncNow('manual');
    setSyncNote(
      out.kind === 'synced'
        ? 'Up to date.'
        : out.kind === 'offline' || out.kind === 'failed'
          ? 'Couldn’t reach the island server. Progress is saved here and will sync later.'
          : out.kind === 'revoked'
            ? 'This device was removed from the family. Pair it again with a code.'
            : null,
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-4xl font-extrabold">Parent area</h1>

      <Panel as="section" title="Your family">
        <p className="mt-2 text-lg">
          {profiles === undefined
            ? 'Loading…'
            : profiles.length === 0
              ? 'No children on this island yet.'
              : `${listNames(
                  [...profiles].sort((a, b) => a.createdAt - b.createdAt).map((p) => p.name),
                )} ${profiles.length === 1 ? 'plays' : 'play'} on this island.`}
        </p>
        {profiles !== undefined && profiles.length === 0 && paired ? (
          // No children stored on this device. Most often the family's children just haven't
          // arrived yet (the first sync after pairing failed or is slow), so the only hint is the
          // safe one: sync. This device can't tell an empty family from a missing download, so it
          // never suggests anything that erases data.
          <p className="mt-2 text-base text-ink-soft">
            Just paired this device? Tap <strong>Sync now</strong> to fetch your family.
          </p>
        ) : null}
      </Panel>

      <PicturePasswords />

      <ParentGuides />

      <Panel as="section" title="This device">
        {paired ? (
          <div className="mt-2 flex flex-col gap-4">
            <p className="text-lg">
              Paired with your family. Last synced{' '}
              <strong>{formatWhen(syncState?.lastSyncAt ?? null)}</strong>.
            </p>
            {syncState?.lastError ? (
              <Notice tone="info">
                The last sync didn’t finish:{' '}
                <span className="break-words">{syncState.lastError}</span>. It retries on its own.
              </Notice>
            ) : null}
            {syncNote ? (
              <p className="text-base text-ink-soft" role="status">
                {syncNote}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => navigate('/parent/devices/pair')}>Pair a new device</Button>
              <Button variant="secondary" onClick={() => void syncNow()}>
                Sync now
              </Button>
              <Button variant="secondary" onClick={() => setConfirmSignOut(true)}>
                Sign this device out
              </Button>
            </div>
            {confirmSignOut ? (
              <div className="rounded-2xl bg-sand/60 p-4 ring-2 ring-sand-deep">
                <p className="text-lg font-bold">Sign this device out?</p>
                <p className="mt-1 text-base">
                  It stops syncing with the family. Everything already on this device stays, and you
                  can join again with a code from another device or with the parent passphrase.
                </p>
                {signOutError ? (
                  <div className="mt-3">
                    <Notice tone="error">{signOutError}</Notice>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button
                    variant="danger"
                    disabled={signingOut}
                    onClick={async () => {
                      // First end the parent session on the server (its cookie would otherwise
                      // stay valid); only then forget the device token and close the area.
                      // Without the server, nothing changes. Signed out, the device no longer
                      // syncs, so it lands on the join page, which says so and offers rejoining
                      // (its island stays on it; Back returns to the child home).
                      setSigningOut(true);
                      setSignOutError(null);
                      try {
                        await api.logout();
                      } catch (e) {
                        // An already-ended session is fine; anything else keeps the device as is.
                        if (!(e instanceof ApiError && e.code === 'unauthorized')) {
                          setSignOutError(
                            'Couldn’t reach the island server to sign out. Connect to the same Wi-Fi as the server and try again.',
                          );
                          setSigningOut(false);
                          return;
                        }
                      }
                      try {
                        await sync.signOut();
                      } catch (e) {
                        // The server session has ended already; only this device's token could not
                        // be removed. Say so and keep Sign out available for a retry.
                        recordDiagnostic('sign-out', e);
                        setSignOutError(
                          'This device couldn’t finish signing out. Try again; if it keeps failing, see the diagnostics page.',
                        );
                        setSigningOut(false);
                        return;
                      }
                      gate.lock();
                      navigate('/join', { replace: true });
                    }}
                  >
                    {signingOut ? 'Signing out…' : 'Sign out'}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmSignOut(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-4">
            <p className="text-lg">This device isn’t signed in to a family, so it doesn’t sync.</p>
            <div>
              <Button onClick={() => navigate('/join')}>Join with a code</Button>
            </div>
          </div>
        )}
      </Panel>

      <Panel as="section" title="Help">
        <p className="mt-2 text-lg">
          Something not working? The{' '}
          <Link
            to="/parent/diagnostics"
            className="font-bold underline decoration-2 underline-offset-4"
          >
            diagnostics page
          </Link>{' '}
          lists recent errors on this device, with a button to copy them.
        </p>
      </Panel>
    </div>
  );
}
