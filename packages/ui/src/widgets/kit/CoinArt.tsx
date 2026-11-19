import type { CoinKind, NarrationKey } from '@number-island/shared';
import { useId, useMemo } from 'react';
import { Shine } from '../../art/characters/parts';
import { COIN_LOOK } from '../../art/characters/pebbling';
import { paint } from '../../art/core/paint';
import { useSpeech } from '../../preferences/UiProvider';
import type { PaletteColor } from '../../tokens/tokens';
import './money.css';

/**
 * US money for the money widgets (U05 #14): original vector coins and dollar bills, no portraits,
 * mint designs or words. Each coin is recognisable by size, metal and rim, as the real ones are
 * (and as the art kit's Coin Clam coin is: same radii, rims and face pictures, `COIN_LOOK`):
 *
 * | Coin | Size (real ⌀) | Metal | Rim | Face |
 * |---|---|---|---|---|
 * | penny, 1¢ | second smallest (19.05 mm) | copper (`wood`) | smooth | a shell |
 * | nickel, 5¢ | second biggest (21.21 mm) | silver (`pebble`) | smooth | a wave |
 * | dime, 10¢ | smallest (17.91 mm) | silver | reeded | a star |
 * | quarter, 25¢ | biggest (24.26 mm) | silver | reeded | a sun |
 *
 * Every coin is drawn at one scale (`quarterPx` is the quarter's diameter), so the sizes compare
 * truly. The penny is painted `wood`, not the Coin Clam's `sun`: next to the silver coins `sun`
 * reads as orange or gold, `wood` as copper. Silver coins are outlined in `ink-soft` (not their
 * fill's `pebble-deep` shade) so the coin's edge stays ≥ 3:1 on the paper and sand the widgets
 * draw them on (06 §7). Values are never printed on a coin: tapping speaks them.
 */

export type MoneyPiece = CoinKind | 'dollar';

export const COIN_CENTS: Readonly<Record<CoinKind, number>> = {
  penny: 1,
  nickel: 5,
  dime: 10,
  quarter: 25,
};

const VALUE_OF: Readonly<Record<CoinKind, 1 | 5 | 10 | 25>> = {
  penny: 1,
  nickel: 5,
  dime: 10,
  quarter: 25,
};

interface CoinPaint {
  face: PaletteColor;
  edge: PaletteColor;
  mark: PaletteColor;
}

/** Face, outline and mark colours (contrast rows in `COIN_CONTRAST_PAIRS`). */
export const COIN_PAINT: Readonly<Record<CoinKind, CoinPaint>> = {
  penny: { face: 'wood', edge: 'wood-deep', mark: 'ink' },
  nickel: { face: 'pebble', edge: 'ink-soft', mark: 'ink-soft' },
  dime: { face: 'pebble', edge: 'ink-soft', mark: 'ink-soft' },
  quarter: { face: 'pebble', edge: 'ink-soft', mark: 'ink-soft' },
};

/** The radius of each coin in art units (`COIN_LOOK`: the quarter is 44). */
export const coinRadius = (kind: CoinKind): number => COIN_LOOK[VALUE_OF[kind]].r;

const QUARTER_R = 44;

/** A coin's drawn diameter in CSS px when the quarter is `quarterPx` across. */
export const coinPx = (kind: CoinKind, quarterPx: number): number =>
  (quarterPx * coinRadius(kind)) / QUARTER_R;

/** Narration key a piece speaks when tapped ("A quarter, 25 cents"; vars `{ cents }`). */
export function moneyNameKey(piece: MoneyPiece): NarrationKey {
  return piece === 'dollar' ? 'ui.money.bill' : `ui.money.${piece}`;
}

/** An amount as the widgets print it (03 §8.4 display): `40¢` under a dollar, else `$1.35`. */
export function moneyText(cents: number): string {
  if (cents < 100) return `${cents}¢`;
  return `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/**
 * Spoken money (06 §5): a tapped piece says its name and value, composed from the money and number
 * clips ("a quarter, twenty-five cents"); a total says "that makes forty cents" (or dollars and
 * cents from a dollar up); counting up says just the number.
 */
export function useMoneySpeech() {
  const { say, sayNumber } = useSpeech();
  return useMemo(
    () => ({
      piece: (piece: MoneyPiece, cents: number) => say(moneyNameKey(piece), { cents }),
      total: (cents: number) =>
        say(cents >= 100 ? 'ui.money.total-dollars' : 'ui.money.total', { cents }),
      count: (cents: number) => sayNumber(cents),
    }),
    [say, sayNumber],
  );
}

function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [
    Math.round(r * Math.cos(a) * 100) / 100,
    Math.round(r * Math.sin(a) * 100) / 100,
  ] as const;
}

export interface CoinArtProps {
  kind: CoinKind;
  /** The quarter's diameter in CSS px; every coin is drawn at the same scale. */
  quarterPx: number;
  className?: string;
}

/** One coin, drawn to scale. Decorative (`aria-hidden`): the control around it names it. */
export function CoinArt({ kind, quarterPx, className }: CoinArtProps) {
  const r = coinRadius(kind);
  const look = COIN_LOOK[VALUE_OF[kind]];
  const p = COIN_PAINT[kind];
  const unit = quarterPx / (2 * QUARTER_R);
  // 2 units round the rim for its stroke, 7 below it for the contact shadow.
  const box = r + 2;
  const ridgeCount = Math.round(r * 1.25);
  const ridges =
    look.rim === 'reeded'
      ? Array.from({ length: ridgeCount }, (_, i) => {
          const deg = (i / ridgeCount) * 360;
          const [x0, y0] = polar(r - 1.8, deg);
          const [x1, y1] = polar(r - 6.5, deg);
          return `M${x0} ${y0}L${x1} ${y1}`;
        }).join('')
      : null;
  return (
    <svg
      className={['ni-coin-art', className].filter(Boolean).join(' ')}
      viewBox={`${-box} ${-box} ${2 * box} ${2 * box + 5}`}
      width={2 * box * unit}
      height={(2 * box + 5) * unit}
      aria-hidden="true"
      focusable="false"
      data-coin={kind}
      data-rim={look.rim}
      data-diameter={(2 * r * unit).toFixed(2)}
    >
      <ellipse cx={1.5} cy={r + 3} rx={r * 0.86} ry={3.5} fill={paint('ink')} opacity={0.16} />
      <circle r={r} fill={paint(p.face)} stroke={paint(p.edge)} strokeWidth={3} />
      {ridges ? (
        <path d={ridges} stroke={paint(p.mark)} strokeWidth={1.7} strokeLinecap="round" />
      ) : (
        <circle r={r - 4.5} fill="none" stroke={paint(p.mark)} strokeWidth={2.2} />
      )}
      <circle
        r={r - 9}
        fill="none"
        stroke={paint(p.mark)}
        strokeWidth={1.4}
        strokeDasharray={kind === 'penny' ? undefined : '1.5 3'}
        opacity={0.75}
      />
      <CoinFace kind={kind} r={r} mark={p.mark} />
      <Shine x={0} y={0} rx={r} opacity={0.45} />
    </svg>
  );
}

/** The picture on a coin's face (no words, no portraits): shell, wave, star or sun. */
function CoinFace({ kind, r, mark }: { kind: CoinKind; r: number; mark: PaletteColor }) {
  const k = r / 34;
  const stroke = {
    fill: 'none',
    stroke: paint(mark),
    strokeWidth: 2.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'penny':
      // A scallop shell: a fan with a scalloped edge, ribs from the hinge, and the hinge's ears.
      return (
        <g {...stroke} data-face="shell">
          <path
            d={`M0 ${8 * k}L${-13 * k} ${-3 * k}Q${-14 * k} ${-9 * k} ${-9.5 * k} ${-10.5 * k}Q${-7 * k} ${-14 * k} ${-3.2 * k} ${-12.6 * k}Q0 ${-15 * k} ${3.2 * k} ${-12.6 * k}Q${7 * k} ${-14 * k} ${9.5 * k} ${-10.5 * k}Q${14 * k} ${-9 * k} ${13 * k} ${-3 * k}Z`}
          />
          <path
            d={`M0 ${8 * k}L${-8.5 * k} ${-9 * k}M0 ${8 * k}L${-2.8 * k} ${-11.5 * k}M0 ${8 * k}L${2.8 * k} ${-11.5 * k}M0 ${8 * k}L${8.5 * k} ${-9 * k}`}
          />
          <path d={`M${-6 * k} ${8 * k}H${6 * k}L${4 * k} ${12 * k}H${-4 * k}Z`} />
        </g>
      );
    case 'nickel':
      // Two waves.
      return (
        <g {...stroke} data-face="wave">
          <path
            d={`M${-14 * k} ${-3 * k}q${3.5 * k} ${-6 * k} ${7 * k} 0t${7 * k} 0t${7 * k} 0t${7 * k} 0`}
          />
          <path
            d={`M${-14 * k} ${6 * k}q${3.5 * k} ${-6 * k} ${7 * k} 0t${7 * k} 0t${7 * k} 0t${7 * k} 0`}
          />
        </g>
      );
    case 'dime':
      return (
        <path
          {...stroke}
          data-face="star"
          d={`M0 ${-12 * k}L${3.4 * k} ${-3.6 * k}L${12 * k} ${-3.6 * k}L${5 * k} ${2 * k}L${7.6 * k} ${11 * k}L0 ${5.6 * k}L${-7.6 * k} ${11 * k}L${-5 * k} ${2 * k}L${-12 * k} ${-3.6 * k}L${-3.4 * k} ${-3.6 * k}Z`}
        />
      );
    case 'quarter':
      return (
        <g {...stroke} data-face="sun">
          <circle r={7 * k} />
          <path
            d={Array.from({ length: 8 }, (_, i) => {
              const [x0, y0] = polar(11 * k, i * 45);
              const [x1, y1] = polar(15 * k, i * 45);
              return `M${x0} ${y0}L${x1} ${y1}`;
            }).join('')}
          />
        </g>
      );
  }
}

export interface BillArtProps {
  /** The bill's value in dollars (printed once, large, in the middle). */
  dollars: number;
  /** Height in CSS px (the width is 2.35 times it, as a real bill). Numeral ≥ 32 px from 74 px. */
  height: number;
  /** No numeral (a thumbnail too small for a ≥ 32 px numeral, e.g. a list of ways found). */
  plain?: boolean;
  className?: string;
}

/** A dollar bill: green paper, a lace border, a shell and a star seal and the value. Decorative. */
export function BillArt({ dollars, height, plain = false, className }: BillArtProps) {
  const clip = `ni-bill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      className={['ni-bill-art', className].filter(Boolean).join(' ')}
      viewBox="0 0 235 104"
      width={(height * 235) / 104}
      height={height}
      aria-hidden="true"
      focusable="false"
      data-bill={dollars}
    >
      <defs>
        <clipPath id={clip}>
          <rect x="2" y="2" width="231" height="96" rx="9" />
        </clipPath>
      </defs>
      <rect x="5" y="7" width="231" height="96" rx="9" fill={paint('ink')} opacity={0.16} />
      <rect x="2" y="2" width="231" height="96" rx="9" fill={paint('leaf-light')} />
      <g clipPath={`url(#${clip})`} opacity={0.35}>
        {Array.from({ length: 9 }, (_, i) => (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: background lace lines are positional
            key={i}
            d={`M${-20 + i * 32} 100Q${-4 + i * 32} 50 ${-20 + i * 32} 0`}
            fill="none"
            stroke={paint('leaf-deep')}
            strokeWidth={1.4}
          />
        ))}
      </g>
      <rect
        x="2"
        y="2"
        width="231"
        height="96"
        rx="9"
        fill="none"
        stroke={paint('leaf-deep')}
        strokeWidth={3}
      />
      <rect
        x="11"
        y="11"
        width="213"
        height="78"
        rx="6"
        fill="none"
        stroke={paint('leaf-deep')}
        strokeWidth={2}
        strokeDasharray="2 3.5"
      />
      {/* Seals: a shell on the left, a star on the right. */}
      <g transform="translate(46 50)">
        <circle r="19" fill={paint('leaf')} stroke={paint('leaf-deep')} strokeWidth={2.5} />
        <path
          d="M-9 4Q-9 -9 0 -10Q9 -9 9 4ZM0 4V-9M-4.5 4V-7M4.5 4V-7"
          fill="none"
          stroke={paint('paper')}
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </g>
      <g transform="translate(189 50)">
        <circle r="19" fill={paint('leaf')} stroke={paint('leaf-deep')} strokeWidth={2.5} />
        <path
          d="M0 -10L2.8 -3L10 -3L4.2 1.6L6.4 9L0 4.6L-6.4 9L-4.2 1.6L-10 -3L-2.8 -3Z"
          fill="none"
          stroke={paint('paper')}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
      </g>
      <ellipse
        cx="117.5"
        cy="50"
        rx="44"
        ry="37"
        fill={paint('paper')}
        stroke={paint('leaf-deep')}
        strokeWidth={2.5}
      />
      {plain ? null : (
        <text
          x="117.5"
          y="66"
          textAnchor="middle"
          fontSize="46"
          fontWeight={800}
          fill={paint('ink')}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {dollars}
        </text>
      )}
    </svg>
  );
}

/**
 * Every meaningful mark the money art draws, against what it sits on (06 §7). kit.test.ts checks
 * each by day and at sunset.
 */
export const COIN_CONTRAST_PAIRS = [
  { use: 'Penny face picture and rim (ink on copper)', fg: 'ink', bg: 'wood', min: 3 },
  {
    use: 'Silver coin picture and reeding (ink-soft on silver)',
    fg: 'ink-soft',
    bg: 'pebble',
    min: 3,
  },
  { use: 'Penny edge on the paper board', fg: 'wood-deep', bg: 'paper', min: 3 },
  { use: 'Penny edge on sand', fg: 'wood-deep', bg: 'sand', min: 3 },
  { use: 'Silver coin edge on the paper board', fg: 'ink-soft', bg: 'paper', min: 3 },
  { use: 'Silver coin edge on sand', fg: 'ink-soft', bg: 'sand', min: 3 },
  { use: 'Bill edge on the paper board', fg: 'leaf-deep', bg: 'paper', min: 3 },
  { use: 'Bill value numeral (ink on its paper oval)', fg: 'ink', bg: 'paper', min: 4.5 },
  { use: 'Bill seal picture (paper on leaf)', fg: 'paper', bg: 'leaf', min: 3 },
] as const satisfies readonly {
  use: string;
  fg: PaletteColor;
  bg: PaletteColor;
  min: 3 | 4.5;
}[];
