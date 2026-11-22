import type { ReactNode } from 'react';

/**
 * Icons for the area-tiles widget, in the island style (05 §11): flat fills, a 3 px darker
 * outline. Decorative (aria-hidden): the control or caption around each icon carries its name.
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

const tile = (x: number, y: number, s: number, key?: string) => (
  <rect
    key={key}
    x={x}
    y={y}
    width={s}
    height={s}
    rx={s * 0.2}
    fill="var(--color-sun)"
    stroke={INK}
    strokeWidth="3"
  />
);

/** Tile mode's caption: a plot with two tiles laid in its corner. */
export function TilesIcon() {
  return (
    <Svg>
      <rect
        x="4"
        y="6"
        width="40"
        height="36"
        rx="5"
        fill="var(--color-sand)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
      {tile(9, 11, 13)}
      {tile(25, 11, 13)}
    </Svg>
  );
}

/** A picture caption (count, multiply): a gridded plot. */
export function PlotIcon() {
  return (
    <Svg>
      <rect
        x="4"
        y="6"
        width="40"
        height="36"
        rx="5"
        fill="var(--color-sand)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
      <path d="M17 6v36M31 6v36M4 18h40M4 30h40" stroke="var(--color-wood-deep)" strokeWidth="2" />
    </Svg>
  );
}

/** Split captions (decompose, partition): a plot cut in two by a bold line. */
export function SplitIcon() {
  return (
    <Svg>
      <rect
        x="4"
        y="6"
        width="40"
        height="36"
        rx="5"
        fill="var(--color-sand)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
      <path d="M4 6h17v36H4z" fill="var(--color-leaf-light)" opacity="0.75" />
      <path d="M21 3v42" stroke={INK} strokeWidth="5" />
    </Svg>
  );
}

/** "Fill this row": three tiles in a row and an arrow along them. */
export function FillRowIcon() {
  return (
    <Svg>
      {tile(3, 22, 12)}
      {tile(18, 22, 12)}
      {tile(33, 22, 12)}
      <path d="M6 12h33" stroke={INK} strokeWidth="4" />
      <path d="M33 6l7 6-7 6" stroke={INK} strokeWidth="4" />
    </Svg>
  );
}

/** A gap marker for an up-and-down line: a dashed cut with a notch arrow at each end. */
export function LineDownIcon() {
  return (
    <Svg>
      <path d="M24 9v30" stroke={INK} strokeWidth="5" strokeDasharray="7 5" />
      <path d="M17 8l7-5 7 5M17 40l7 5 7-5" stroke={INK} strokeWidth="3.5" />
    </Svg>
  );
}

/** A gap marker for a side-to-side line. */
export function LineAcrossIcon() {
  return (
    <Svg>
      <path d="M9 24h30" stroke={INK} strokeWidth="5" strokeDasharray="7 5" />
      <path d="M8 17l-5 7 5 7M40 17l5 7-5 7" stroke={INK} strokeWidth="3.5" />
    </Svg>
  );
}

/** The decimal grid's caption: one whole square. */
export function WholeIcon() {
  return (
    <Svg>
      <rect
        x="6"
        y="6"
        width="36"
        height="36"
        rx="4"
        fill="var(--color-cloud)"
        stroke={INK}
        strokeWidth="3"
      />
      <path
        d="M15 6v36M24 6v36M33 6v36M6 15h36M6 24h36M6 33h36"
        stroke="var(--color-pebble-deep)"
        strokeWidth="1.5"
      />
      <path d="M6 24h18v18H10a4 4 0 0 1-4-4z" fill="var(--color-sun)" opacity="0.85" />
    </Svg>
  );
}
