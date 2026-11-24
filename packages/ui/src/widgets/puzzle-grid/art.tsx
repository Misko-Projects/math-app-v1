// The puzzle grid's own drawings: the card that empties a box, the mark on a box to look at
// again, and the two pieces of a shape puzzle. Ink strokes on light cards (≥ 3:1), never colour
// alone (06 §7). Every drawing is decoration to assistive tech: its control carries the name.

const INK = 'var(--color-ink)';

/** Take the number out of the box: a box with a cross in it, its left side a point. */
export function ClearArt() {
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
      data-art="clear"
    >
      <path
        d="M17 10h23a3 3 0 0 1 3 3v22a3 3 0 0 1-3 3H17L5 24Z"
        fill="var(--color-cloud)"
        stroke={INK}
        strokeWidth="3.5"
      />
      <path d="M22 18l12 12M34 18 22 30" stroke={INK} strokeWidth="4" />
    </svg>
  );
}

/** "Look here again": an ink-ringed coral disc with a white exclamation mark. */
export function LookArt() {
  return (
    <svg
      viewBox="0 0 28 28"
      width="100%"
      height="100%"
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      data-art="look"
    >
      <circle cx="14" cy="14" r="12" fill="var(--color-coral-deep)" stroke={INK} strokeWidth="2" />
      <path d="M14 7v8" stroke="var(--color-cloud)" strokeWidth="4" />
      <circle cx="14" cy="20.5" r="2.2" fill="var(--color-cloud)" />
    </svg>
  );
}

/** A piece on its tray card: a square, or a rectangle two squares long with its middle marked. */
export function PieceArt({ kind }: { kind: string }) {
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
      data-art={kind}
    >
      {kind === 'rectangle' ? (
        <>
          <rect
            x="4"
            y="14"
            width="40"
            height="20"
            rx="4"
            fill="var(--color-sunshine)"
            stroke={INK}
            strokeWidth="3"
          />
          <path d="M24 17v14" stroke={INK} strokeWidth="2" strokeDasharray="3 4" />
        </>
      ) : (
        <rect
          x="13"
          y="13"
          width="22"
          height="22"
          rx="4"
          fill="var(--color-shallows)"
          stroke={INK}
          strokeWidth="3"
        />
      )}
    </svg>
  );
}
