// The parent-gate mark on its own, so the child screens' gate entry (HoldToOpen) doesn't pull
// the whole parent kit into the initial JS (02 §6).

/** The parent-gate mark: a padlock with a little key (grown-ups only). */
export function GateIcon({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M10 14v-3.5a6 6 0 0 1 12 0V14"
        className="fill-none stroke-ink"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <rect
        x="6.5"
        y="13.5"
        width="19"
        height="14"
        rx="4"
        className="fill-sunshine stroke-ink"
        strokeWidth="2"
      />
      <circle cx="16" cy="19.5" r="2.2" className="fill-ink" />
      <path d="M16 21v3" className="stroke-ink" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
