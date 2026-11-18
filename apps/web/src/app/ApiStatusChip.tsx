import { type ApiStatus, useApiHealth } from '@/data/apiHealth';

// Scaffold diagnostics (not child copy): later issues move this indicator into the parent area
// (06 §8) and child-facing strings into narration YAML.
const LABELS: Record<ApiStatus, string> = {
  checking: 'Checking…',
  connected: 'Connected',
  offline: 'Offline',
};

function StatusIcon({ status }: { status: ApiStatus }) {
  if (status === 'connected') {
    return (
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
        <circle cx="8" cy="8" r="7" className="fill-leaf stroke-leaf-deep" strokeWidth="1.5" />
        <path
          d="M4.8 8.2 7 10.3l4.2-4.6"
          className="fill-none stroke-cloud"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === 'offline') {
    // A calm cloud, not an alarm: playing offline is a normal state.
    return (
      <svg viewBox="0 0 20 16" className="h-4 w-5" aria-hidden="true">
        <path
          d="M5.5 13.5h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 5.3 6a3.8 3.8 0 0 0 .2 7.5Z"
          className="fill-sky-light stroke-ink-soft"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="5.5"
        className="motion-loop animate-shimmer fill-sunshine stroke-sunshine-deep"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** Small, unobtrusive API reachability chip for the scaffold home page. */
export function ApiStatusChip() {
  const status = useApiHealth();
  return (
    <p
      role="status"
      data-status={status}
      className="inline-flex items-center gap-2 rounded-full bg-cloud/85 px-3.5 py-1.5 text-sm font-bold text-ink shadow-[0_2px_0_rgb(38_70_83/0.18)] ring-2 ring-sand-deep/60 backdrop-blur-sm"
    >
      <StatusIcon status={status} />
      <span className="sr-only">Island server: </span>
      <span>{LABELS[status]}</span>
    </p>
  );
}
