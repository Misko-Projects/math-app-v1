// The gate in front of the parent area (06 §3): hold the button for 2 s (skipped when the hold
// just happened on the child screen's corner entry), then the parent PIN.

import { Panel } from '@number-island/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useDeviceRecord } from '@/app/hooks';
import type { PinResult } from './gate';
import { HoldToOpen } from './HoldToOpen';
import { Button, GateIcon, Notice } from './kit';
import { useParentGate } from './ParentContext';

/** Router state set by the corner entry after a completed hold. */
export interface GateHeldState {
  gateHeldAt: number;
}
const HELD_VALID_MS = 60_000;

export function heldRecently(state: unknown, now = Date.now()): boolean {
  const at = (state as Partial<GateHeldState> | null)?.gateHeldAt;
  return typeof at === 'number' && now - at >= 0 && now - at < HELD_VALID_MS;
}

const MAX_PIN = 6;
const MIN_PIN = 4;

function failureText(result: Exclude<PinResult, { ok: true }>): string {
  switch (result.reason) {
    case 'wrong':
      return 'That PIN isn’t right. Try again.';
    case 'rate_limited': {
      const mins = result.retryAfterSeconds
        ? Math.max(1, Math.ceil(result.retryAfterSeconds / 60))
        : null;
      return mins
        ? `Too many tries. Wait about ${mins} minute${mins === 1 ? '' : 's'}, then try again.`
        : 'Too many tries. Wait a few minutes, then try again.';
    }
    case 'unavailable':
      return 'The parent area needs your island server to check the PIN. Connect to the same Wi-Fi as the server and try again. (Playing works offline.)';
    case 'not_paired':
      return 'This device is no longer part of your family. Join again with a code from a parent device, or with the parent passphrase.';
  }
}

export function ParentGateScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const gate = useParentGate();
  const device = useDeviceRecord();
  const signedOut = device !== undefined && !device.deviceToken;
  const [held, setHeld] = useState(() => heldRecently(location.state));
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The server no longer knows this device: the way back is pairing again. */
  const [removed, setRemoved] = useState(false);
  const padRef = useRef<HTMLFieldSetElement>(null);

  const submit = useCallback(
    async (value: string) => {
      if (busy) return;
      if (value.length < MIN_PIN) {
        setError(`Enter at least ${MIN_PIN} digits.`);
        return;
      }
      setBusy(true);
      setError(null);
      const result = await gate.verifyPin(value);
      setBusy(false);
      if (!result.ok) {
        setPin('');
        setError(failureText(result));
        setRemoved(result.reason === 'not_paired');
      }
      // On success the gate unlocks and the parent layout renders the area instead of this screen.
    },
    [busy, gate],
  );

  const press = useCallback(
    (key: string) => {
      if (busy) return;
      setError(null);
      if (key === 'back') setPin((p) => p.slice(0, -1));
      else if (key === 'ok') void submit(pin);
      else setPin((p) => (p.length < MAX_PIN ? p + key : p));
    },
    [busy, pin, submit],
  );

  // Desktop keyboards: digits, Backspace, Enter (06 §4).
  useEffect(() => {
    if (!held) return;
    const onKey = (e: KeyboardEvent) => {
      // Space presses the focused key. Enter does too, except on a digit key: there it submits
      // (focus starts on "1", and a typed PIN followed by Enter means "unlock", not another 1).
      const button = e.target instanceof HTMLButtonElement ? e.target : null;
      if (button && e.key === ' ') return;
      if (button && e.key === 'Enter' && button.dataset.digit === undefined) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') press('ok');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [held, press]);

  useEffect(() => {
    if (held) padRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [held]);

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-sand p-6 font-body text-ink">
      <Panel as="section" className="w-full max-w-md" aria-label="Grown-ups only">
        <div className="flex flex-col items-center gap-2 text-center">
          <GateIcon className="size-12" />
          <h1 className="font-display text-3xl font-extrabold">Grown-ups only</h1>
        </div>

        {signedOut ? (
          // The PIN is checked by the server for this device (08 §2): without a family token there
          // is nothing to check it with, so the way back in is pairing again.
          <div className="mt-6 flex flex-col items-center gap-5 text-center">
            <Notice tone="info">
              This device isn’t signed in to a family, so the parent area is closed here. Join again
              with a code from a parent device, or with the parent passphrase.
            </Notice>
            <Button onClick={() => navigate('/join')}>Join with a code</Button>
          </div>
        ) : !held ? (
          <div className="mt-6 flex flex-col items-center gap-5 text-center">
            <p className="text-lg">Press and hold the lock for 2 seconds.</p>
            <HoldToOpen size="large" onOpen={() => setHeld(true)} />
          </div>
        ) : (
          <div className="mt-5 flex flex-col items-center gap-4">
            <p className="text-lg" id="pin-label">
              Enter your parent PIN
            </p>
            <div
              className="flex h-10 items-center gap-3"
              role="img"
              aria-label={`${pin.length} of up to ${MAX_PIN} digits entered`}
            >
              {Array.from(
                { length: Math.max(MIN_PIN, pin.length + (pin.length < MAX_PIN ? 1 : 0)) },
                (_, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions of the PIN display
                    key={i}
                    className={[
                      'size-5 rounded-full border-[3px] border-ink',
                      i < pin.length ? 'bg-ink' : 'bg-transparent',
                    ].join(' ')}
                  />
                ),
              )}
            </div>
            {error ? <Notice tone="error">{error}</Notice> : null}
            {removed ? <Button onClick={() => navigate('/join')}>Join with a code</Button> : null}
            <fieldset
              ref={padRef}
              className="m-0 grid grid-cols-3 gap-3 border-0 p-0"
              aria-labelledby="pin-label"
            >
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <PadKey key={d} label={d} onPress={() => press(d)} disabled={busy} />
              ))}
              <PadKey label="Delete" glyph="⌫" onPress={() => press('back')} disabled={busy} />
              <PadKey label="0" onPress={() => press('0')} disabled={busy} />
              <PadKey
                label="Unlock"
                glyph="OK"
                tone="primary"
                onPress={() => press('ok')}
                disabled={busy}
              />
            </fieldset>
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <Button variant="quiet" onClick={() => navigate('/')}>
            Back to the island
          </Button>
        </div>
      </Panel>
    </main>
  );
}

function PadKey({
  label,
  glyph,
  onPress,
  disabled,
  tone = 'plain',
}: {
  label: string;
  glyph?: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'plain' | 'primary';
}) {
  return (
    <button
      type="button"
      aria-label={glyph ? label : undefined}
      data-digit={/^\d$/.test(label) ? label : undefined}
      onClick={onPress}
      disabled={disabled}
      className={[
        'grid size-[4.5rem] place-items-center rounded-2xl font-display text-3xl font-bold',
        'focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink',
        'active:translate-y-[2px] disabled:opacity-45',
        tone === 'primary'
          ? 'bg-sea-deep text-cloud shadow-[0_4px_0_var(--color-sea-dark)]'
          : 'bg-cloud text-ink ring-2 ring-sand-deep shadow-[0_4px_0_var(--color-sand-deep)]',
      ].join(' ')}
    >
      {glyph ?? label}
    </button>
  );
}
