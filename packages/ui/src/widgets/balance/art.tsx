// The balance's own drawings: the stand, the glyphs of its choice cards and of its two pan
// buttons. Ink strokes on light cards (≥ 3:1), never colour alone (06 §7).

const INK = 'var(--color-ink)';

const svg = {
  width: '100%',
  height: '100%',
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

/** The post the beam rests on. */
export function StandArt() {
  return (
    <svg {...svg} viewBox="0 0 40 40" preserveAspectRatio="none" data-art="stand">
      <path
        d="M20 2 37 37H3Z"
        fill="var(--color-pebble)"
        stroke={INK}
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Add one (a plus) and take one off (a minus). */
export function PanButtonIcon({ kind }: { kind: 'add' | 'take' }) {
  return (
    <svg {...svg} viewBox="0 0 48 48" data-glyph={kind}>
      <path d={kind === 'add' ? 'M10 24h28M24 10v28' : 'M10 24h28'} stroke={INK} strokeWidth="7" />
    </svg>
  );
}

export type ChoiceGlyph = 'eq' | 'ne' | 'left' | 'right' | 'same';

/**
 * A choice card's picture: the same (=) or not the same (≠) (`judge`), or a small balance with one pan down
 * or both level (`which-heavier`). The low pan carries a heavy dot, so the tilt is not the only
 * mark.
 */
export function ChoiceArt({ glyph }: { glyph: ChoiceGlyph }) {
  if (glyph === 'eq' || glyph === 'ne') {
    return (
      <svg {...svg} viewBox="0 0 48 48" data-glyph={glyph}>
        <path d="M10 18h28M10 30h28" stroke={INK} strokeWidth="6" />
        {glyph === 'ne' ? <path d="M31 8 17 40" stroke={INK} strokeWidth="5" /> : null}
      </svg>
    );
  }
  // The beam's ends: the heavy side 7 units lower than the light one.
  const dy = glyph === 'same' ? 0 : 7;
  const l = glyph === 'left' ? 20 + dy : 20 - (glyph === 'right' ? dy : 0);
  const r = glyph === 'right' ? 20 + dy : 20 - (glyph === 'left' ? dy : 0);
  const pan = (x: number, y: number, heavy: boolean) => (
    <>
      <path d={`M${x - 9} ${y + 2}h18`} stroke={INK} strokeWidth="5" />
      {heavy ? <circle cx={x} cy={y - 6} r="5.5" fill={INK} /> : null}
    </>
  );
  return (
    <svg {...svg} viewBox="0 0 56 48" data-glyph={glyph}>
      <path d={`M12 ${l + 6} 44 ${r + 6}`} stroke={INK} strokeWidth="4" />
      <path d="M28 26 21 44h14Z" fill="var(--color-pebble)" stroke={INK} strokeWidth="3" />
      {pan(12, l, glyph === 'left')}
      {pan(44, r, glyph === 'right')}
      {glyph === 'same' ? (
        <path d="M22 8h12M22 15h12" stroke={INK} strokeWidth="4" data-mark="equal" />
      ) : null}
    </svg>
  );
}
