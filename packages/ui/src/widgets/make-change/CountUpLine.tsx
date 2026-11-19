import type { CoinKind } from '@number-island/shared';
import { CoinArt, type MoneyPiece, moneyText, pieceCents } from '../kit';

/**
 * The open count-up line of make-change (03 §5.5 `countUpLine`): from the price to the amount
 * paid, one hop per piece of change in the order given, each hop exactly as long as the piece is
 * worth (one scale for the whole line), with the piece riding on its hop. Change past the amount
 * paid runs past the paid mark, so a wrong count shows as one. Decorative: the widget speaks it.
 */

const W = 360;
const PAD = 52;
const LINE_Y = 80;
const NUMERAL_PX = 34;

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
      height={LINE_Y + 58}
      viewBox={`0 0 ${W} ${LINE_Y + 58}`}
      data-price={price}
      data-paid={paid}
      data-reached={at}
    >
      <line className="ni-mchange__axis" x1={PAD - 22} x2={W - PAD + 22} y1={LINE_Y} y2={LINE_Y} />
      {hops.map((h) => {
        const x1 = x(h.from);
        const x2 = x(h.to);
        const top = LINE_Y - 12 - Math.min(36, 10 + (x2 - x1) * 0.5);
        const mid = (x1 + x2) / 2;
        // Short hops side by side would stack their coins: every other one rides higher.
        const lift = x2 - x1 < 30 && h.i % 2 === 1 ? 20 : 0;
        return (
          <g
            key={h.i}
            className="ni-mchange__hop"
            data-from={h.from}
            data-to={h.to}
            data-piece={h.p}
          >
            <path
              d={`M${x1} ${LINE_Y - 6}Q${mid} ${2 * top - (LINE_Y - 6)} ${x2} ${LINE_Y - 6}`}
              className="ni-mchange__arc"
            />
            <circle cx={x2} cy={LINE_Y} r={6} className="ni-mchange__stop" />
            {h.p === 'dollar' ? (
              <rect
                x={mid - 14}
                y={top - 14 - lift}
                width={28}
                height={13}
                rx={3}
                className="ni-mchange__bill"
              />
            ) : (
              <g transform={`translate(${mid - 12} ${top - 22 - lift})`}>
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
            y={LINE_Y + 18 + NUMERAL_PX * 0.85}
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
