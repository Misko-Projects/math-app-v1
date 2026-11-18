import type { HealthResponse } from '@number-island/shared';
import { useEffect, useState } from 'react';

export type ApiStatus = 'checking' | 'connected' | 'offline';

const HEALTH_TIMEOUT_MS = 5000;

/**
 * Pings `GET /api/health`. Resolves `true` only for a 2xx JSON body with `ok: true`.
 * Never throws: the app is offline-first (02 §3), so an unreachable API is a normal state.
 */
export async function checkApiHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch('/api/health', {
      signal,
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as Partial<HealthResponse> | null;
    return body?.ok === true;
  } catch {
    return false;
  }
}

/** Current API reachability; re-checks when the browser comes back online. */
export function useApiHealth(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;

    const run = () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const timer = setTimeout(() => current.abort(), HEALTH_TIMEOUT_MS);
      void checkApiHealth(current.signal).then((ok) => {
        clearTimeout(timer);
        if (active && controller === current) setStatus(ok ? 'connected' : 'offline');
      });
    };
    const goOffline = () => setStatus('offline');

    run();
    window.addEventListener('online', run);
    window.addEventListener('offline', goOffline);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener('online', run);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return status;
}
