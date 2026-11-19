import type { PieceKind } from '@number-island/engine';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Drawn base-ten pieces (03 §5.5 base-ten-build), in the kit's `BaseTenView` style: grid-lined
 * flats and rods, unit squares and a thousands cube with a top and a side face. The size comes
 * from the `--u` (unit edge) and `--d` (cube depth) custom properties of an ancestor, or `u`.
 */
export function PieceArt({ kind, u }: { kind: PieceKind; u?: number }) {
  const style =
    u === undefined ? undefined : ({ '--u': `${u}px`, '--d': `${u * 3}px` } as CSSProperties);
  return <span className={`ni-btb__art ni-btb__art--${kind}`} style={style} aria-hidden="true" />;
}

/** What a tray pile shows: a few pieces of its kind (a supply picture, not a count). */
export function PileArt({ kind }: { kind: PieceKind }) {
  switch (kind) {
    case 'ones':
      return (
        <span className="ni-btb__pileart ni-btb__pileart--ones" aria-hidden="true">
          <PieceArt kind="ones" u={18} />
          <PieceArt kind="ones" u={18} />
          <PieceArt kind="ones" u={18} />
        </span>
      );
    case 'tens':
      return (
        <span className="ni-btb__pileart ni-btb__pileart--tens" aria-hidden="true">
          <PieceArt kind="tens" u={6} />
          <PieceArt kind="tens" u={6} />
          <PieceArt kind="tens" u={6} />
        </span>
      );
    case 'hundreds':
      return (
        <span className="ni-btb__pileart ni-btb__pileart--hundreds" aria-hidden="true">
          <PieceArt kind="hundreds" u={5.2} />
          <PieceArt kind="hundreds" u={5.2} />
        </span>
      );
    default:
      return (
        <span className="ni-btb__pileart ni-btb__pileart--thousands" aria-hidden="true">
          <PieceArt kind="thousands" u={4.4} />
        </span>
      );
  }
}

const SEA = 'var(--color-shallows)';
const LINE = 'var(--color-sea-dark)';
const INK = 'var(--color-ink)';

/** A small glyph of one piece or of ten pieces, for the trade icons (48 × 48 viewBox units). */
function Glyph({ kind, many, x }: { kind: PieceKind; many: boolean; x: number }) {
  const parts: ReactNode[] = [];
  if (kind === 'ones' && many) {
    // Ten small squares in two columns of five.
    for (let i = 0; i < 10; i++) {
      const cx = x + (i < 5 ? 1 : 7.5);
      const cy = 9 + (i % 5) * 6;
      parts.push(
        <rect
          key={i}
          x={cx}
          y={cy}
          width="5"
          height="5"
          rx="0.8"
          fill={SEA}
          stroke={LINE}
          strokeWidth="1.4"
        />,
      );
    }
  } else if (kind === 'ones') {
    parts.push(
      <rect
        key="u"
        x={x + 4}
        y={20}
        width="7"
        height="7"
        rx="1"
        fill={SEA}
        stroke={LINE}
        strokeWidth="1.6"
      />,
    );
  } else if (kind === 'tens' && many) {
    for (let i = 0; i < 5; i++) {
      parts.push(
        <rect
          key={i}
          x={x + i * 3.2}
          y={8}
          width="2.6"
          height="32"
          rx="0.6"
          fill={SEA}
          stroke={LINE}
          strokeWidth="1.1"
        />,
      );
    }
  } else if (kind === 'tens') {
    parts.push(
      <rect
        key="r"
        x={x + 5}
        y={6}
        width="5.5"
        height="36"
        rx="1"
        fill={SEA}
        stroke={LINE}
        strokeWidth="1.6"
      />,
      <path
        key="l"
        d={`M${x + 5} 15h5.5M${x + 5} 24h5.5M${x + 5} 33h5.5`}
        stroke={LINE}
        strokeWidth="1"
      />,
    );
  } else if (kind === 'hundreds' && many) {
    for (let i = 2; i >= 0; i--) {
      parts.push(
        <rect
          key={i}
          x={x + i * 2.5}
          y={14 - i * 2.5}
          width="12"
          height="12"
          rx="1"
          fill={SEA}
          stroke={LINE}
          strokeWidth="1.4"
        />,
      );
    }
    parts.push(
      <rect
        key="b"
        x={x}
        y={22}
        width="12"
        height="12"
        rx="1"
        fill={SEA}
        stroke={LINE}
        strokeWidth="1.4"
      />,
    );
  } else if (kind === 'hundreds') {
    parts.push(
      <rect
        key="f"
        x={x}
        y={10}
        width="16"
        height="16"
        rx="1"
        fill={SEA}
        stroke={LINE}
        strokeWidth="1.6"
      />,
      <path
        key="l"
        d={`M${x + 5.3} 10v16M${x + 10.7} 10v16M${x} 15.3h16M${x} 20.7h16`}
        stroke={LINE}
        strokeWidth="0.9"
      />,
    );
  } else {
    // A cube: front, top and side faces.
    parts.push(
      <path
        key="t"
        d={`M${x} 16l5-5h12l-5 5z`}
        fill={SEA}
        stroke={LINE}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />,
      <path
        key="s"
        d={`M${x + 12} 16l5-5v12l-5 5z`}
        fill="var(--color-sea)"
        stroke={LINE}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />,
      <rect
        key="f"
        x={x}
        y={16}
        width="12"
        height="12"
        fill={SEA}
        stroke={LINE}
        strokeWidth="1.4"
      />,
    );
  }
  return <g>{parts}</g>;
}

/**
 * The trade icons: ten pieces → one larger piece ("make a ten"), and one piece → ten smaller
 * pieces ("split a ten"), with a bold arrow between.
 */
export function TradeIcon({ from, to, fuse }: { from: PieceKind; to: PieceKind; fuse: boolean }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <Glyph kind={from} many={fuse} x={1} />
      <path
        d="M21 24h7m-3-4 4 4-4 4"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Glyph kind={to} many={!fuse} x={31} />
    </svg>
  );
}
