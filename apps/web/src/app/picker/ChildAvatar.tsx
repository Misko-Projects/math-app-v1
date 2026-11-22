// A warm placeholder avatar until the CH1 avatar renderer lands: a round, smiling face in the
// child's skin tone (AvatarSpec.skinTone, 05 §9: 12 tones), ringed in a per-child accent colour,
// with the first letter of the name large on a badge. Children are told apart by the letter and
// the name under the card, not by colour alone (06 §7).

import type { AvatarSpec } from '@number-island/shared';

/** s01 (lightest) … s12 (deepest). */
const SKIN: Record<string, { fill: string; shade: string }> = {
  s01: { fill: '#fde7d6', shade: '#e9c2a6' },
  s02: { fill: '#f8d8bf', shade: '#e0b393' },
  s03: { fill: '#f1c6a2', shade: '#d6a37b' },
  s04: { fill: '#e8b48a', shade: '#c98f64' },
  s05: { fill: '#dca274', shade: '#bb7e52' },
  s06: { fill: '#cd8f60', shade: '#a96d43' },
  s07: { fill: '#b97a4d', shade: '#935a33' },
  s08: { fill: '#a2663f', shade: '#7c4a2a' },
  s09: { fill: '#8a5334', shade: '#663a22' },
  s10: { fill: '#73442b', shade: '#53301d' },
  s11: { fill: '#5e3723', shade: '#432616' },
  s12: { fill: '#4a2b1c', shade: '#331d12' },
};

/** Hair colours by option id (the CH1 creator owns the real list); unknown ids draw brown. */
const HAIR: Record<string, string> = {
  black: '#2b2220',
  brown: '#5b3a29',
  'dark-brown': '#3f2a20',
  'light-brown': '#8a5a3a',
  blonde: '#d9a94e',
  red: '#a8462a',
  auburn: '#7d3522',
  gray: '#9a9a9a',
  white: '#e8e4dc',
};

/** Accent rings, in created order (they repeat after six; the letter and name still differ). */
export const ACCENTS = [
  { ring: '#2a9d8f', deep: '#17606e' }, // sea
  { ring: '#e9c46a', deep: '#a8822a' }, // sunshine
  { ring: '#e76f51', deep: '#a5452f' }, // coral
  { ring: '#5c9e4f', deep: '#2f5a29' }, // leaf
  { ring: '#8fb8e8', deep: '#3f6ea8' }, // sky
  { ring: '#c7a0ea', deep: '#6e4a99' }, // flower
] as const;

export function accentFor(index: number) {
  return ACCENTS[index % ACCENTS.length] as (typeof ACCENTS)[number];
}

/** The first letter of the name (a whole grapheme, so "Émile" gives "É"), upper-cased. */
export function initialOf(name: string): string {
  const trimmed = name.trim();
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  const first = Seg
    ? (new Seg(undefined, { granularity: 'grapheme' }).segment(trimmed)[Symbol.iterator]().next()
        .value?.segment ?? '')
    : (Array.from(trimmed)[0] ?? '');
  return first.toLocaleUpperCase();
}

export function ChildAvatar({
  name,
  avatar,
  index,
  className,
}: {
  name: string;
  avatar: Pick<AvatarSpec, 'skinTone' | 'hairColor'>;
  index: number;
  className?: string;
}) {
  const skin = SKIN[avatar.skinTone] ?? (SKIN.s06 as { fill: string; shade: string });
  const accent = accentFor(index);
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true" focusable="false">
      {/* accent ring and a soft contact shadow */}
      <ellipse cx={100} cy={188} rx={62} ry={9} fill="rgb(38 70 83 / 0.14)" />
      <circle cx={100} cy={96} r={90} fill={accent.ring} stroke={accent.deep} strokeWidth={5} />
      <circle cx={100} cy={96} r={74} fill="#fffaf0" />
      {/* face */}
      <circle cx={100} cy={100} r={62} fill={skin.fill} stroke={skin.shade} strokeWidth={4} />
      <path
        d="M58 80c8-28 30-40 52-38 22 2 36 18 36 34-14-10-30-14-44-12-14 1-28 6-44 16Z"
        fill={HAIR[avatar.hairColor] ?? HAIR.brown}
      />
      <ellipse cx={80} cy={100} rx={9} ry={10} fill="#fff" />
      <ellipse cx={120} cy={100} rx={9} ry={10} fill="#fff" />
      <circle cx={81} cy={102} r={5.5} fill="#1f2a30" />
      <circle cx={121} cy={102} r={5.5} fill="#1f2a30" />
      <circle cx={83} cy={99} r={1.8} fill="#fff" />
      <circle cx={123} cy={99} r={1.8} fill="#fff" />
      <circle cx={70} cy={120} r={8} fill="#f08a76" opacity={0.45} />
      <circle cx={130} cy={120} r={8} fill="#f08a76" opacity={0.45} />
      <path
        d="M84 122c9 10 23 10 32 0-2 12-9 18-16 18s-14-6-16-18Z"
        fill="#b9503a"
        stroke="#7a2f20"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      {/* the letter badge */}
      <circle cx={158} cy={154} r={34} fill="#fffaf0" stroke={accent.deep} strokeWidth={5} />
      <text
        x={158}
        y={155}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Baloo 2', ui-rounded, system-ui, sans-serif"
        fontWeight={800}
        fontSize={44}
        fill="#264653"
      >
        {initialOf(name) || '?'}
      </text>
    </svg>
  );
}
