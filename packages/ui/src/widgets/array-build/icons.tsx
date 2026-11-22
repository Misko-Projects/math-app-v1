/**
 * The split pad's icon: the split line with an arrow showing which way it moves. It never looks
 * like the step's Next arrow. Decorative (aria-hidden): the button carries the name.
 */
export function LineMoveIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <g transform={dir === 'left' ? 'translate(48 0) scale(-1 1)' : undefined}>
        <path d="M11 6v36" stroke="var(--color-ink)" strokeWidth="7" />
        <path d="M22 24h18M33 15l9 9-9 9" stroke="var(--color-ink)" strokeWidth="5" />
      </g>
    </svg>
  );
}
