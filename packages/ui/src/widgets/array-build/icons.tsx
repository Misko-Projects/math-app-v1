import type { ReactNode } from 'react';

/**
 * Icons for the array-build widget, in the island style (05 §11): flat fills, a 3 px darker
 * outline. Decorative (aria-hidden): the control or chip around each icon carries its name.
 */

const INK = 'var(--color-ink)';

function Svg({ children }: { children: ReactNode }) {
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
      {children}
    </svg>
  );
}

/** The corner handle: a chunky diagonal arrow pointing out from the corner. */
export function CornerIcon() {
  return (
    <Svg>
      <path d="M12 12h14M12 12v14" stroke={INK} strokeWidth="5" />
      <path d="M15 15l20 20" stroke={INK} strokeWidth="5" />
      <path d="M36 22v14H22" stroke={INK} strokeWidth="5" />
    </Svg>
  );
}

/** "Add a row": one row of counters with a plus beside it. */
export function AddRowIcon() {
  return (
    <Svg>
      <rect
        x="3"
        y="27"
        width="30"
        height="13"
        rx="6.5"
        fill="var(--color-cloud)"
        stroke={INK}
        strokeWidth="3"
      />
      <circle cx="10" cy="33.5" r="3" fill="var(--color-coral)" />
      <circle cx="18" cy="33.5" r="3" fill="var(--color-coral)" />
      <circle cx="26" cy="33.5" r="3" fill="var(--color-coral)" />
      <path d="M38 10v16M30 18h16" stroke="var(--color-cloud)" strokeWidth="5" />
    </Svg>
  );
}

/** "Rows": rows stacked down the page, with an arrow going down. */
export function RowsIcon() {
  return (
    <Svg>
      {[7, 19, 31].map((y) => (
        <rect
          key={y}
          x="14"
          y={y}
          width="30"
          height="9"
          rx="4.5"
          fill="var(--color-shallows)"
          stroke="var(--color-sea-dark)"
          strokeWidth="3"
        />
      ))}
      <path d="M6 7v32M2 34l4 5 4-5" stroke={INK} strokeWidth="3.5" />
    </Svg>
  );
}

/** "In each row": one row of counters, with an arrow going across. */
export function PerRowIcon() {
  return (
    <Svg>
      {[8, 20, 32].map((x) => (
        <circle
          key={x}
          cx={x}
          cy="19"
          r="5.5"
          fill="var(--color-coral)"
          stroke="var(--color-coral-deep)"
          strokeWidth="3"
        />
      ))}
      <path d="M4 36h38M37 32l5 4-5 4" stroke={INK} strokeWidth="3.5" />
    </Svg>
  );
}

/** The board / array region: a small 2 × 3 array of counters on a card. */
export function GridIcon() {
  return (
    <Svg>
      <rect
        x="3"
        y="8"
        width="42"
        height="32"
        rx="7"
        fill="var(--color-paper)"
        stroke={INK}
        strokeWidth="3"
      />
      {[12, 24, 36].flatMap((cx) =>
        [18, 30].map((cy) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4.5" fill="var(--color-coral)" />
        )),
      )}
    </Svg>
  );
}

/** A gap marker above the array: a wedge pointing down at the gap. */
export function NotchIcon() {
  return (
    <Svg>
      <path
        d="M12 12h24L24 34Z"
        fill="var(--color-wood)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
    </Svg>
  );
}
