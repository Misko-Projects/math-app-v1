// Diagnostics (08 §8): recent local errors, with a "copy" button. Nothing is sent anywhere.

import { Panel } from '@number-island/ui';
import { useRef, useState, useSyncExternalStore } from 'react';
import { useAppServices } from '@/app/AppServices';
import {
  clearDiagnostics,
  DIAGNOSTICS_STORAGE_KEY,
  type DiagnosticEntry,
  diagnosticsReport,
  readDiagnostics,
  subscribeDiagnostics,
} from '@/app/diagnostics';
import { useDeviceRecord, useOnline, useSyncState } from '@/app/hooks';
import { Button } from './kit';
import { formatWhen } from './ParentHome';

let cache: { raw: string | null; entries: DiagnosticEntry[] } = { raw: null, entries: [] };
function snapshot(): DiagnosticEntry[] {
  let raw: string | null = null;
  try {
    raw = globalThis.localStorage?.getItem(DIAGNOSTICS_STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, entries: readDiagnostics() };
  return cache.entries;
}

export function DiagnosticsPage() {
  const { content } = useAppServices();
  const device = useDeviceRecord();
  const syncState = useSyncState();
  const online = useOnline();
  const entries = useSyncExternalStore(subscribeDiagnostics, snapshot, snapshot);
  const [copied, setCopied] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const reportRef = useRef<HTMLTextAreaElement>(null);

  const info: Record<string, string> = {
    'Content version': content.contentVersion,
    'This device': device?.deviceToken ? 'paired with the family' : 'not signed in to a family',
    'Last sync': formatWhen(syncState?.lastSyncAt ?? null),
    'Last sync problem': syncState?.lastError ?? 'none',
    Connection: online ? 'online' : 'offline',
    Browser: globalThis.navigator?.userAgent ?? 'unknown',
  };

  const report = diagnosticsReport(entries, info);
  const copy = async () => {
    const done = 'Copied. Paste it into a GitHub issue or a message.';
    try {
      // Needs a secure context (HTTPS or localhost); `pnpm dev:lan` serves plain HTTP.
      await navigator.clipboard.writeText(report);
      setCopied(done);
      return;
    } catch {
      // Fall back to selecting the report text below.
    }
    setShowReport(true);
    await new Promise((r) => requestAnimationFrame(r));
    const area = reportRef.current;
    area?.focus();
    area?.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    setCopied(
      ok
        ? done
        : 'This browser didn’t allow copying. The report below is selected: copy it with your device’s Copy command.',
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-4xl font-extrabold">Diagnostics</h1>
      <Panel as="section" title="About this device">
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-lg sm:grid-cols-[max-content_1fr]">
          {Object.entries(info).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-bold">{k}</dt>
              <dd className="min-w-0 break-words text-ink-soft">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel as="section" title={`Recent errors (${entries.length})`}>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button onClick={() => void copy()}>Copy report</Button>
          <Button
            variant="secondary"
            onClick={() => clearDiagnostics()}
            disabled={entries.length === 0}
          >
            Clear
          </Button>
        </div>
        {copied ? (
          <p className="mt-3 text-base text-ink-soft" role="status">
            {copied}
          </p>
        ) : null}
        <details
          className="mt-3"
          open={showReport}
          onToggle={(e) => setShowReport(e.currentTarget.open)}
        >
          <summary className="cursor-pointer font-bold">Report text</summary>
          <textarea
            ref={reportRef}
            readOnly
            aria-label="Diagnostics report"
            value={report}
            rows={10}
            className="mt-2 w-full rounded-2xl border-2 border-sand-deep bg-cloud p-3 font-mono text-sm text-ink"
          />
        </details>
        {entries.length === 0 ? (
          <p className="mt-4 text-lg">No errors recorded on this device. That’s good news.</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-3">
            {[...entries].reverse().map((e, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: the log has no ids; order is stable
                key={`${e.ts}-${i}`}
                className="rounded-2xl bg-cloud p-4 ring-2 ring-sand-deep"
              >
                <p className="text-base text-ink-soft">
                  {new Date(e.ts).toLocaleString()} · {e.source}
                </p>
                <p className="mt-1 break-words font-mono text-base">{e.message}</p>
                {e.stack ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-bold">Stack trace</summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm">
                      {e.stack}
                    </pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
