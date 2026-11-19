// Pair this device with a family (08 §2: `POST /devices/pair/complete` with the 6-digit code from
// a parent device), then pull the family's profiles and progress (08 §4).
//
// Without a paired device at hand (the only device was signed out, or the first setup's answer
// was lost after the server created the family), the parent passphrase does the same: it signs in
// (`POST /auth/login`), makes a code and joins with it (`joinWithPassphrase`), then signs out. If
// that sign-out fails, the page keeps the device (no way out) until the sign-in is closed.
//
// A device that already belonged to a family (signed out, or removed by a parent) rejoins that
// same family the same way. A code for another family is refused before anything moves
// (`joinFamily`). Starting such a device over is a grown-up action outside the app: clearing the
// site's data in the browser's settings.

import { Panel } from '@number-island/ui';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useLocation, useNavigate } from 'react-router';
import { ApiError, describeApiError } from '@/parent/api';
import { Button, Field, Notice, TextInput } from '@/parent/kit';
import { useParentApi } from '@/parent/ParentContext';
import {
  closeParentSession,
  guessDeviceName,
  JoinRefusedError,
  joinFamily,
  joinWithPassphrase,
  SessionStillOpenError,
} from '@/parent/setup/family';
import { useAppServices } from './AppServices';
import { useDeviceRecord } from './hooks';

type Mode = 'code' | 'passphrase';

export function JoinPage() {
  const services = useAppServices();
  const api = useParentApi();
  const navigate = useNavigate();
  const device = useDeviceRecord();
  const [mode, setMode] = useState<Mode>('code');
  const [code, setCode] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [deviceName, setDeviceName] = useState(() => guessDeviceName());
  const [codeError, setCodeError] = useState<string | null>(null);
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [otherFamily, setOtherFamily] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * A passphrase sign-in may be open on the server: from the moment a passphrase join starts until
   * it reports the sign-in closed, and after that while closing it failed. The page keeps the
   * device all that time. Every way out is held (the browser's Back, any route change; the Back
   * link is hidden), and reloading or closing the tab asks first. A navigation held while the
   * join still runs stays; one held while the sign-in is known to be open first closes it.
   * The refs are what the blocker reads, so they change before any navigation of the page's own.
   */
  const [sessionOpen, setSessionOpenState] = useState(false);
  const sessionOpenRef = useRef(false);
  const setSessionOpen = (open: boolean) => {
    sessionOpenRef.current = open;
    setSessionOpenState(open);
  };
  const [passphraseJoining, setPassphraseJoiningState] = useState(false);
  const passphraseJoiningRef = useRef(false);
  const setPassphraseJoining = (on: boolean) => {
    passphraseJoiningRef.current = on;
    setPassphraseJoiningState(on);
  };
  const hadFamily = device !== undefined && device.pairedAt !== null;
  /**
   * Why the navigation now held was held, recorded when it was asked for: the refs may change
   * (the join's logout fails, a close succeeds) before the effect below resolves it.
   */
  const heldFor = useRef<'open' | 'joining' | null>(null);
  const blocker = useBlocker(() => {
    heldFor.current = sessionOpenRef.current
      ? 'open'
      : passphraseJoiningRef.current
        ? 'joining'
        : null;
    return heldFor.current !== null;
  });
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;
  // A navigation that went on (`proceed`) is replayed without asking the blocker again; when it
  // lands on this same page (another /join entry), the page stays mounted. Its reason ends with it.
  const location = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per new location
  useEffect(() => {
    heldFor.current = null;
  }, [location.key]);

  /** One close at a time: the Close button and a held navigation share the same request. */
  const closing = useRef<Promise<boolean> | null>(null);
  const closeSession = (): Promise<boolean> => {
    if (!closing.current) {
      setBusy(true);
      closing.current = closeParentSession(api)
        .then(
          () => {
            setSessionOpen(false);
            return true;
          },
          () => false,
        )
        .finally(() => {
          closing.current = null;
          setBusy(false);
        });
    }
    return closing.current;
  };
  const closeAndContinue = async () => {
    const closed = await closeSession();
    // A navigation held meanwhile goes on by itself (below). Otherwise, joined (the device holds a
    // token now): on to the island; not joined, the form stays.
    if (!closed || heldFor.current !== null) return;
    if ((await services.store.device()).deviceToken) navigate('/', { replace: true });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per held navigation
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (heldFor.current !== 'open') {
      // Asked for while the join was still running: stay, whatever the join did since. It ends
      // on the island, or here with the sign-in open (then leaving is asked for again).
      heldFor.current = null;
      blocker.reset();
      return;
    }
    if (!sessionOpenRef.current) {
      // Asked for while the sign-in was open, and a close finished since: nothing left to close.
      blocker.proceed();
      return;
    }
    void closeSession().then((closed) => {
      const held = blockerRef.current;
      if (held.state !== 'blocked') return;
      if (closed) {
        held.proceed();
      } else {
        heldFor.current = null; // staying: a later Close the sign-in moves on by itself
        held.reset();
      }
    });
  }, [blocker.state]);

  useEffect(() => {
    if (!sessionOpen && !passphraseJoining) return;
    const ask = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [sessionOpen, passphraseJoining]);
  const paired = Boolean(device?.deviceToken);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setCodeError(null);
    setPassphraseError(null);
    setOtherFamily(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.replace(/\D/g, '');
    const cErr = mode === 'code' && c.length !== 6 ? 'Enter all 6 digits of the code.' : null;
    const pErr =
      mode === 'passphrase' && !passphrase ? 'Enter the parent passphrase chosen at setup.' : null;
    const nErr = deviceName.trim() ? null : 'Give this device a name, like “Kitchen tablet”.';
    setCodeError(cErr);
    setPassphraseError(pErr);
    setNameError(nErr);
    if (cErr || pErr || nErr) return;
    setBusy(true);
    setError(null);
    setOtherFamily(false);
    if (mode === 'passphrase') setPassphraseJoining(true);
    try {
      if (mode === 'code') await joinFamily({ services, api }, { code: c, deviceName });
      else await joinWithPassphrase({ services, api }, { passphrase, deviceName });
      setPassphraseJoining(false); // the sign-in is closed: nothing holds the way out now
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof SessionStillOpenError) {
        // The parent sign-in the passphrase opened is still valid on the server: don't hand the
        // device back until it is closed. (Marked open before the join is marked done below, so
        // the way out is never unheld in between.)
        setSessionOpen(true);
      } else if (err instanceof JoinRefusedError) {
        setOtherFamily(true);
        setError(
          mode === 'code'
            ? 'That code is for a different family’s island. This device still holds its own family’s island, so it can only rejoin that one.'
            : 'This server holds a different family’s island. This device still holds its own family’s island, so it can only rejoin that one.',
        );
      } else if (
        err instanceof ApiError &&
        (err.code === 'pair_code_invalid' || err.code === 'pair_code_expired')
      ) {
        // About the code itself: on the code field, which is marked invalid. With the passphrase
        // the code was made here, so there's no field for it: say so, and Join tries again.
        if (mode === 'code') setCodeError(describeApiError(err));
        else setError('Joining didn’t finish this time. Tap Join to try again.');
      } else if (err instanceof ApiError && err.code === 'invalid_credentials') {
        setPassphraseError('That passphrase isn’t right. Check it and try again.');
      } else {
        setError(describeApiError(err));
      }
      setPassphraseJoining(false);
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-sand p-6 font-body text-ink">
      <Panel as="section" className="w-full max-w-xl" aria-label="Join your family’s island">
        <h1 className="font-display text-4xl font-extrabold">Join your family’s island</h1>
        <form className="mt-4 flex flex-col gap-5" onSubmit={submit} noValidate>
          {mode === 'code' ? (
            <p className="text-lg">
              On a device that’s already set up, open the parent area and choose{' '}
              <strong>Pair a new device</strong>. Type the code it shows here.
            </p>
          ) : (
            <p className="text-lg">
              No paired device at hand? Type the parent passphrase chosen when the island was set
              up.
            </p>
          )}
          {hadFamily ? (
            <Notice tone="info">
              {paired
                ? 'This device is paired with a family. Joining that family again replaces its pairing.'
                : 'This device is signed out, so it doesn’t sync. Its island stays on it, and children can keep playing. To sync again, join the same family with a code or the parent passphrase.'}
            </Notice>
          ) : null}
          {mode === 'code' ? (
            <Field
              label="Pairing code"
              error={codeError}
              hint="The 6-digit code from the parent device. Each code works once, for 10 minutes."
            >
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={codeError ? true : undefined}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/[^\d ]/g, ''));
                    setError(null);
                    setCodeError(null);
                  }}
                  // No example digits: an empty field must look empty (a grey sample code reads
                  // as filled in). The hint says what goes here.
                  className="min-h-16 font-display text-3xl! font-bold tracking-[0.3em] tabular-nums"
                />
              )}
            </Field>
          ) : (
            <Field label="Parent passphrase" error={passphraseError}>
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  aria-describedby={describedBy}
                  aria-invalid={passphraseError ? true : undefined}
                  value={passphrase}
                  onChange={(e) => {
                    setPassphrase(e.target.value);
                    setError(null);
                    setPassphraseError(null);
                  }}
                />
              )}
            </Field>
          )}
          <Field
            label="Name for this device"
            error={nameError}
            hint="So you can tell your devices apart."
          >
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                aria-invalid={nameError ? true : undefined}
                maxLength={60}
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
              />
            )}
          </Field>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {sessionOpen ? (
            <div className="flex flex-col items-start gap-3">
              <Notice tone="error">
                The grown-up sign-in couldn’t be closed, so the island server still lets this device
                into the parent area. Check the connection to the server, then close it.
              </Notice>
              <Button onClick={() => void closeAndContinue()} disabled={busy}>
                {busy ? 'Closing…' : 'Close the sign-in'}
              </Button>
            </div>
          ) : null}
          {otherFamily ? (
            <Notice tone="info">
              To use this device with another family, a grown-up first clears its data: in Chrome,
              open <strong>Settings → Privacy and security → Site settings</strong>, find this
              island’s address and choose <strong>Delete data</strong>. That removes this device’s
              copy of the island (not the server’s), and it starts fresh.
            </Notice>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={busy || sessionOpen}>
              {busy ? 'Joining…' : 'Join'}
            </Button>
            {sessionOpen || passphraseJoining ? null : (
              <Link
                to={hadFamily ? '/' : '/welcome'}
                className="text-lg font-bold underline decoration-2 underline-offset-4"
              >
                Back
              </Link>
            )}
          </div>
          <Button
            variant="quiet"
            className="self-start px-0!"
            disabled={busy || sessionOpen}
            onClick={() => switchMode(mode === 'code' ? 'passphrase' : 'code')}
          >
            {mode === 'code' ? 'Use the parent passphrase instead' : 'Use a pairing code instead'}
          </Button>
        </form>
      </Panel>
    </main>
  );
}
