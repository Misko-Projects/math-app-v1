// Pair this device with a family (08 §2: `POST /devices/pair/complete` with the 6-digit code from
// a parent device), then pull the family's profiles and progress (08 §4).
//
// A device that already belonged to a family (signed out, or removed by a parent) rejoins that
// same family the same way. A code for another family is refused before anything moves
// (`joinFamily`). Starting such a device over is a grown-up action outside the app: clearing the
// site's data in the browser's settings.

import { Panel } from '@number-island/ui';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { describeApiError } from '@/parent/api';
import { Button, Field, Notice, TextInput } from '@/parent/kit';
import { useParentApi } from '@/parent/ParentContext';
import { guessDeviceName, JoinRefusedError, joinFamily } from '@/parent/setup/family';
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
          'That code is for a different family’s island. This device still holds its own family’s island, so it can only rejoin that one.',
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
          {otherFamily ? (
            <Notice tone="info">
              To use this device with another family, a grown-up first clears its data: in Chrome,
              open <strong>Settings → Privacy and security → Site settings</strong>, find this
              island’s address and choose <strong>Delete data</strong>. That removes this device’s
              copy of the island (not the server’s), and it starts fresh.
            </Notice>
          ) : null}
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
      </Panel>
    </main>
  );
}
