// The balance's own drawings: the stand, the glyphs of its choice cards and of its two pan
// buttons. Ink strokes on light cards (≥ 3:1), never colour alone (06 §7). Every drawing is
// decoration to assistive tech: its control carries the name.

const INK = 'var(--color-ink)';

/** The post the beam rests on: wood felt in its own deep shade (4.36:1 on paper), as the beam. */
export function StandArt() {
  return (
    <svg
      viewBox="0 0 40 40"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      fill="none"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-art="stand"
    >
      <path
        d="M20 2 37 37H3Z"
        fill="var(--color-wood)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Add one (a plus) and take one off (a minus). */
export function PanButtonIcon({ kind }: { kind: 'add' | 'take' }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      data-glyph={kind}
    >
      <path d={kind === 'add' ? 'M10 24h28M24 10v28' : 'M10 24h28'} stroke={INK} strokeWidth="7" />
    </svg>
  );
}

export type ChoiceGlyph = 'eq' | 'ne' | 'left' | 'right' | 'same';

/**
 * A choice card's picture: the same (=) or not the same (≠) for `judge`; for `which-heavier` a
 * small balance with one pan down, or level under an equals sign. The low pan carries a weight,
 * so the tilt is not the only mark.
 */
export function ChoiceArt({ glyph }: { glyph: ChoiceGlyph }) {
  if (glyph === 'eq' || glyph === 'ne') {
    return (
      <svg
        viewBox="0 0 48 48"
        width="100%"
        height="100%"
        fill="none"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
        data-glyph={glyph}
      >
        <path d="M10 18h28M10 30h28" stroke={INK} strokeWidth="6" />
        {glyph === 'ne' ? <path d="M31 8 17 40" stroke={INK} strokeWidth="5" /> : null}
      </svg>
    );
  }
  // The beam's ends: the heavy side 8 units lower than the light one.
  const l = glyph === 'left' ? 30 : glyph === 'right' ? 14 : 22;
  const r = glyph === 'right' ? 30 : glyph === 'left' ? 14 : 22;
  const pan = (x: number, y: number, heavy: boolean) => (
    <>
      <path d={`M${x - 11} ${y}h22`} stroke={INK} strokeWidth="5" />
      {heavy ? <rect x={x - 8} y={y - 15} width="16" height="12" rx="3" fill={INK} /> : null}
    </>
  );
  return (
    <svg
      viewBox="0 0 64 48"
      width="100%"
      height="100%"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-glyph={glyph}
    >
      <path d={`M13 ${l + 4} 51 ${r + 4}`} stroke={INK} strokeWidth="4" />
      <path d="M32 28 25 45h14Z" fill="var(--color-pebble)" stroke={INK} strokeWidth="3" />
      {pan(13, l, glyph === 'left')}
      {pan(51, r, glyph === 'right')}
      {glyph === 'same' ? (
        <path d="M24 6h16M24 14h16" stroke={INK} strokeWidth="4" data-mark="equal" />
      ) : null}
    </svg>
  );
}
