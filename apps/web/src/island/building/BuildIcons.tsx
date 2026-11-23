// The hammer of the Build button and of the construction step. In the island's own chunk: the
// build sheet is loaded when it opens.

export function HammerIcon({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d="M21 20 8 40" stroke="#8a5a2b" strokeWidth={6} strokeLinecap="round" />
      <path
        d="M14 12 30 6l10 14-8 4-4-6-8 4Z"
        fill="#9aa3ad"
        stroke="#243b53"
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A road stone still to come, with its number as a numeral a child reads (32 px): the next stone
 * on its button, and the road length a locked building waits for.
 */
export function StoneChip({ n }: { n: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full bg-sand font-display font-bold leading-none text-ink"
      style={{
        flex: 'none',
        width: 68,
        height: 68,
        fontSize: n < 1000 ? 32 : 26,
        outline: '3px dashed rgb(36 59 83 / 0.8)',
        outlineOffset: -3,
      }}
      data-stone-chip={n}
    >
      {n}
    </span>
  );
}
