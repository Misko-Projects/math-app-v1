import type { CoinKind } from '@number-island/shared';
import { CoinArt, type MoneyPiece, moneyText, pieceCents } from '../kit';

/**
 * The open count-up line of make-change (03 §5.5 `countUpLine`): from the price to the amount
 * paid, one hop per piece of change in the order given, each hop exactly as long as the piece is
 * worth (one scale for the whole line), with the piece riding on its hop. Change past the amount
 * paid runs past the paid mark, so a wrong count shows as one. Decorative: the widget speaks it,
 * and a hop is taken back by taking its piece back out of the tray.
 *
 * A piece rides its hop only where the hops leave room for it: a hop at least `RIDE_PX` wide
 * carries its piece; narrower ones (a penny beside a quarter) take turns on two levels down to
 * `RIDE_PX / 2`, and under that the hop is drawn alone, small as it is, with a small stop. So no
 * two pieces on the line ever cover each other, up to the tray's `TRAY_PIECES_MAX` hops.
 */

const W = 360;
const PAD = 52;
const LINE_Y = 72;
const NUMERAL_PX = 34;
/** A riding coin is drawn 24 px wide: the room one needs on its level, with 2 px to spare. */
export const RIDE_PX = 26;

export interface CountUpLineProps {
  price: number;
  paid: number;
  given: readonly MoneyPiece[];
  label: string;
}

export function countUpScale(price: number, paid: number, given: readonly MoneyPiece[]) {
  const end = Math.max(paid, price + given.reduce((a, p) => a + pieceCents(p), 0));
  const span = Math.max(1, end - price);
  return { end, x: (v: number) => PAD + ((v - price) / span) * (W - 2 * PAD) };
}

export function CountUpLine({ price, paid, given, label }: CountUpLineProps) {
  const { x } = countUpScale(price, paid, given);
  let at = price;
  const hops = given.map((p, i) => {
    const from = at;
    at += pieceCents(p);
    return { i, p, from, to: at };
  });
  return (
    <svg
      className="ni-mchange__line"
      role="img"
      aria-label={label}
      width={W}
      height={LINE_Y + 54}
      viewBox={`0 0 ${W} ${LINE_Y + 54}`}
      data-price={price}
      data-paid={paid}
      data-reached={at}
    >
      <line className="ni-mchange__axis" x1={PAD - 22} x2={W - PAD + 22} y1={LINE_Y} y2={LINE_Y} />
      {hops.map((h) => {
        const x1 = x(h.from);
        const x2 = x(h.to);
        // A hop is as tall as it is long (up to 36 px), so a penny's hop is a small bump, not a spike.
        const top = LINE_Y - 12 - Math.min(36, 4 + (x2 - x1) * 0.6);
        const mid = (x1 + x2) / 2;
        const w = x2 - x1;
        // Short hops side by side would stack their coins: every other one rides higher, and a
        // hop too short even for that is drawn without its coin.
        const rides = w >= RIDE_PX / 2;
        const lift = w < RIDE_PX && h.i % 2 === 1 ? 22 : 0;
        // A short hop is drawn finer, so a run of penny hops is a row of small bumps, never a blot.
        const fine = w < 12;
        const stop = Math.max(1.2, Math.min(6, w / 2 - 1));
        return (
          <g
            key={h.i}
            className="ni-mchange__hop"
            data-from={h.from}
            data-to={h.to}
            data-piece={h.p}
            data-rides={rides ? 'true' : 'false'}
          >
            <path
              d={`M${x1} ${LINE_Y - 6}Q${mid} ${2 * top - (LINE_Y - 6)} ${x2} ${LINE_Y - 6}`}
              className="ni-mchange__arc"
              style={fine ? { strokeWidth: Math.max(1.2, w / 3) } : undefined}
            />
            <circle
              cx={x2}
              cy={LINE_Y}
              r={stop}
              className="ni-mchange__stop"
              style={fine ? { strokeWidth: 0.6 } : undefined}
            />
            {!rides ? null : h.p === 'dollar' ? (
              <rect
                x={mid - 14}
                y={top - 14 - lift}
                width={28}
                height={13}
                rx={3}
                className="ni-mchange__bill"
              />
            ) : (
              <g
                className="ni-mchange__rider"
                transform={`translate(${mid - 12} ${top - 22 - lift})`}
              >
                <CoinArt kind={h.p as CoinKind} quarterPx={24} />
              </g>
            )}
          </g>
        );
      })}
      {[
        { v: price, cls: 'price' },
        { v: paid, cls: 'paid' },
      ].map(({ v, cls }) => (
        <g key={cls} data-end={cls}>
          <line
            className="ni-mchange__tick"
            x1={x(v)}
            x2={x(v)}
            y1={LINE_Y - 14}
            y2={LINE_Y + 14}
          />
          <text
            className="ni-mchange__numeral"
            x={x(v)}
            y={LINE_Y + 14 + NUMERAL_PX * 0.85}
            fontSize={NUMERAL_PX}
            textAnchor="middle"
          >
            {moneyText(v)}
          </text>
        </g>
      ))}
    </svg>
  );
}
