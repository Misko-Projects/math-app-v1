// Pair another device (08 §2: `POST /devices/pair/start` → a 6-digit code valid 10 minutes, single
// use). The full device list and revoking live in P01's Devices screen.

import type { PairStartResponse } from '@number-island/shared';
import { Panel } from '@number-island/ui';
import { useCallback, useEffect, useState } from 'react';
import { describeApiError } from './api';
import { Button, Notice } from './kit';
import { useParentApi } from './ParentContext';

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function PairDevicePage() {
  const api = useParentApi();
  const [code, setCode] = useState<PairStartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow();

  const make = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setCode(await api.pairStart());
    } catch (e) {
      setCode(null);
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  }, [api]);

  useEffect(() => {
    void make();
  }, [make]);

  const left = code ? Math.max(0, code.expiresAt - now) : 0;
  const expired = code !== null && left === 0;
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000)
    .toString()
    .padStart(2, '0');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-4xl font-extrabold">Pair a new device</h1>
      <Panel as="section" title="On the new device">
        <ol className="mt-3 list-decimal space-y-2 pl-6 text-lg">
          <li>Open Number Island in Chrome (same Wi-Fi as the server).</li>
          <li>
            Choose <strong>Join with a code</strong>.
          </li>
          <li>Type the code below.</li>
        </ol>
      </Panel>
      <Panel as="section" title="Your code">
        <div className="mt-4 flex flex-col items-center gap-4 text-center">
          {code && !expired ? (
            <>
              <p className="font-display text-7xl font-extrabold tracking-[0.18em] tabular-nums">
                <span className="sr-only">Pairing code {code.code.split('').join(' ')}</span>
                <span aria-hidden="true" data-testid="pair-code" data-code={code.code}>
                  {code.code.slice(0, 3)}&thinsp;{code.code.slice(3)}
                </span>
              </p>
              <p className="text-lg text-ink-soft" aria-live="polite">
                Works once, for {mm}:{ss} more.
              </p>
            </>
          ) : null}
          {expired ? <Notice tone="info">This code has expired. Make a new one.</Notice> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            variant={code && !expired ? 'secondary' : 'primary'}
            onClick={() => void make()}
            disabled={busy}
          >
            {busy ? 'Making a code…' : 'Make a new code'}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
