// Pair this device with a family (08 §2: `POST /devices/pair/complete` with the 6-digit code from
// a parent device), then pull the family's profiles and progress (08 §4).
//
// A device that already belonged to a family (signed out, or removed by a parent) rejoins that
// same family the same way. A code for another family is refused before anything moves
// (`joinFamily`); erasing the device first makes it a brand-new device.

import { Panel } from '@number-island/ui';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError, describeApiError } from '@/parent/api';
import { Button, Field, Notice, TextInput } from '@/parent/kit';
import { useParentApi } from '@/parent/ParentContext';
import {
  eraseThisDevice,
  guessDeviceName,
  JoinRefusedError,
  joinFamily,
} from '@/parent/setup/family';
import { useAppServices } from './AppServices';
import { useDeviceRecord } from './hooks';

export function JoinPage() {
  const services = useAppServices();
  const api = useParentApi();
  const navigate = useNavigate();
  const device = useDeviceRecord();
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState(() => guessDeviceName());
  const [codeError, setCodeError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [otherFamily, setOtherFamily] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [eraseError, setEraseError] = useState<string | null>(null);
  const [erasing, setErasing] = useState(false);
  const [busy, setBusy] = useState(false);
  const hadFamily = device !== undefined && device.pairedAt !== null;
  const paired = Boolean(device?.deviceToken);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.replace(/\D/g, '');
    const cErr = c.length === 6 ? null : 'Enter all 6 digits of the code.';
    const nErr = deviceName.trim() ? null : 'Give this device a name, like “Kitchen tablet”.';
    setCodeError(cErr);
    setNameError(nErr);
    if (cErr || nErr) return;
    setBusy(true);
    setError(null);
    setOtherFamily(false);
    try {
      await joinFamily({ services, api }, { code: c, deviceName });
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof JoinRefusedError) {
        setOtherFamily(true);
        setError(
          'That code is for a different family’s island. This device still holds its own family’s island, so it can only rejoin that one. To join this other family, erase this device first, then use a new code.',
        );
      } else {
        setError(describeApiError(err));
      }
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-sand p-6 font-body text-ink">
      <Panel as="section" className="w-full max-w-xl" aria-label="Join your family’s island">
        <h1 className="font-display text-4xl font-extrabold">Join your family’s island</h1>
        <form className="mt-4 flex flex-col gap-5" onSubmit={submit} noValidate>
          <p className="text-lg">
            On a device that’s already set up, open the parent area and choose{' '}
            <strong>Pair a new device</strong>. Type the code it shows here.
          </p>
          {hadFamily ? (
            <Notice tone="info">
              {paired
                ? 'This device is paired with a family. Joining with a new code from that family replaces its pairing.'
                : 'This device was part of a family. Join again with a code from that same family; everything on this device stays.'}
            </Notice>
          ) : null}
          <Field
            label="Pairing code"
            error={codeError}
            hint="6 digits. Each code works once, for 10 minutes."
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
                className="min-h-16 font-display text-3xl! font-bold tracking-[0.3em] tabular-nums"
                placeholder="123456"
              />
            )}
          </Field>
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
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={busy}>
              {busy ? 'Joining…' : 'Join'}
            </Button>
            <Link
              to={hadFamily ? '/' : '/welcome'}
              className="text-lg font-bold underline decoration-2 underline-offset-4"
            >
              Back
            </Link>
          </div>
        </form>

        {hadFamily ? (
          <section aria-label="Erase this device" className="mt-8 border-t-2 border-sand-deep pt-5">
            {otherFamily || confirmErase ? (
              <div className="flex flex-col gap-3">
                <p className="text-lg font-bold">Erase everything on this device?</p>
                <p className="text-base">
                  This removes this device’s copy of the island: the children’s profiles and any
                  progress that hasn’t synced. The family’s island on the server and on its other
                  devices stays as it is. A grown-up confirms with the island server’s parent
                  passphrase.
                </p>
                <Field label="Parent passphrase" error={eraseError}>
                  {({ id, describedBy }) => (
                    <TextInput
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={eraseError ? true : undefined}
                      type="password"
                      autoComplete="current-password"
                      value={passphrase}
                      onChange={(e) => {
                        setPassphrase(e.target.value);
                        setEraseError(null);
                      }}
                    />
                  )}
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="danger"
                    disabled={erasing}
                    onClick={async () => {
                      // Erasing is a grown-up action (06 §3): the server checks the passphrase
                      // (08 §2, rate-limited), since a signed-out device has no PIN check.
                      setErasing(true);
                      setEraseError(null);
                      try {
                        await api.login(passphrase);
                      } catch (err) {
                        setEraseError(
                          err instanceof ApiError && err.code === 'invalid_credentials'
                            ? 'That passphrase isn’t right.'
                            : describeApiError(err),
                        );
                        setErasing(false);
                        return;
                      }
                      await api.logout().catch(() => {});
                      await eraseThisDevice(services);
                    }}
                  >
                    {erasing ? 'Erasing…' : 'Erase this device'}
                  </Button>
                  {otherFamily ? null : (
                    <Button variant="secondary" onClick={() => setConfirmErase(false)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <Button variant="quiet" onClick={() => setConfirmErase(true)}>
                Start over with an empty device
              </Button>
            )}
          </section>
        ) : null}
      </Panel>
    </main>
  );
}
