// Local error log for the parent area's diagnostics page (08 §8: no crash reporters; errors are
// logged locally, with a "copy" button). Kept in localStorage, newest last, at most 50 entries.
// Nothing here is ever sent anywhere.

export const DIAGNOSTICS_STORAGE_KEY = 'number-island.diagnostics';
export const MAX_DIAGNOSTIC_ENTRIES = 50;
const MAX_TEXT = 2000;

export interface DiagnosticEntry {
  ts: number;
  /** Where it came from: `window.error`, `unhandledrejection`, `boot`, … */
  source: string;
  message: string;
  stack?: string;
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();

export function readDiagnostics(store: Storage | null = storage()): DiagnosticEntry[] {
  try {
    const raw = store?.getItem(DIAGNOSTICS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is DiagnosticEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as DiagnosticEntry).ts === 'number' &&
        typeof (e as DiagnosticEntry).message === 'string' &&
        typeof (e as DiagnosticEntry).source === 'string',
    );
  } catch {
    return [];
  }
}

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s);

/** Records one error. Never throws. */
export function recordDiagnostic(
  source: string,
  error: unknown,
  now: number = Date.now(),
  store: Storage | null = storage(),
): void {
  try {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? 'unknown error');
    const stack = error instanceof Error && error.stack ? clip(error.stack) : undefined;
    const entry: DiagnosticEntry = {
      ts: now,
      source,
      message: clip(message),
      ...(stack ? { stack } : {}),
    };
    const next = [...readDiagnostics(store), entry].slice(-MAX_DIAGNOSTIC_ENTRIES);
    store?.setItem(DIAGNOSTICS_STORAGE_KEY, JSON.stringify(next));
    for (const l of listeners) l();
  } catch {
    // Storage full or blocked: diagnostics must never break the app.
  }
}

export function clearDiagnostics(store: Storage | null = storage()): void {
  try {
    store?.removeItem(DIAGNOSTICS_STORAGE_KEY);
  } catch {
    // ignore
  }
  for (const l of listeners) l();
}

export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Captures uncaught errors and unhandled rejections. Returns the uninstall. */
export function installErrorCapture(target: Window = window): () => void {
  const onError = (e: ErrorEvent) => recordDiagnostic('window.error', e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) =>
    recordDiagnostic('unhandledrejection', e.reason);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}

/** A plain-text report for the "Copy" button. */
export function diagnosticsReport(
  entries: readonly DiagnosticEntry[],
  info: Record<string, string>,
): string {
  const lines = [
    'Number Island diagnostics',
    ...Object.entries(info).map(([k, v]) => `${k}: ${v}`),
    '',
  ];
  if (entries.length === 0) lines.push('No errors recorded.');
  for (const e of [...entries].reverse()) {
    lines.push(`[${new Date(e.ts).toISOString()}] ${e.source}: ${e.message}`);
    if (e.stack) lines.push(e.stack);
  }
  return lines.join('\n');
}
