import type { CoinKind } from '@number-island/shared';
import { CoinArt, type MoneyPiece, moneyText, pieceCents } from '../kit';

/**
 * The open count-up line of make-change (03 §5.5 `countUpLine`): from the price to the amount
 * paid, one hop per piece of change in the order given, with the piece shown over its hop. It is
 * an open number line, not a ruler: the hops are in order and a bigger piece never hops shorter
 * than a smaller one, but every hop is at least `MIN_HOP_PX` wide, so each can be seen and
 * counted, a penny's as well as a dollar's (hops of the same piece are the same width). The last
 * hop of the right change lands on the paid mark; change past the amount paid lands past it, so
 * a wrong count shows as one. Decorative: the widget speaks it, and a hop is taken back by taking
 * its piece back out of the tray.
 */

const W = 360;
const PAD = 52;
const LINE_Y = 70;
const NUMERAL_PX = 34;
/** The line's drawn length between its end marks, in px. */
export const LINE_PX = W - 2 * PAD;
/** The least a hop is drawn wide, in px: its piece (`RIDER_PX`) fits over it beside the next. */
export const MIN_HOP_PX = 32;
/** A piece over its hop is drawn at this quarter size (a quarter is 28 px, a dime 21). */
export const RIDER_PX = 28;
/** How far the paid mark stays from the ends of a hop that passes it, in px. */
const MARK_INSET_PX = 8;
/** The least the stretch still to count (from the count so far to the paid mark) is drawn. */
const MIN_REST_PX = 14;
/** The width a printed amount takes under the line, in px (34 px numerals, about 19 px a glyph). */
const amountWidth = (cents: number): number => moneyText(cents).length * 19;
/**
 * The least the printed paid amount stands from the printed price, centre to centre, in px: half
 * of each and 8 px between, so the two never run into each other ("99¢" and "$1.00": 84 px).
 */
export const labelSepPx = (price: number, paid: number): number =>
  (amountWidth(price) + amountWidth(paid)) / 2 + 8;

export interface CountUpLineProps {
  price: number;
  paid: number;
  given: readonly MoneyPiece[];
  label: string;
  /** Draws the whole line larger (a roomy area): 1 is 360 px wide. */
  scale?: number;
}

interface Segment {
  /** Cents the stretch stands for. */
  v: number;
  /** The least it is drawn wide. */
  min: number;
}

/** Widths for `segs` that fill `length`: in proportion to their cents, never under their least. */
function allot(segs: readonly Segment[], length: number): number[] {
  const total = segs.reduce((a, s) => a + s.v, 0) || 1;
  let w = segs.map((s) => Math.max(s.min, (length * s.v) / total));
  // Raising some to their least makes the row too long: take it back from the others, each in
  // proportion to what it has above its own least (a few passes settle it).
  for (let pass = 0; pass < 8; pass++) {
    const over = w.reduce((a, x) => a + x, 0) - length;
    const give = w.reduce((a, x, i) => a + (x - (segs[i] as Segment).min), 0);
    if (over <= 1e-9 || give <= 1e-9) break;
    const k = Math.min(1, over / give);
    w = w.map((x, i) => x - (x - (segs[i] as Segment).min) * k);
  }
  return w;
}

export interface CountUpLayout {
  /** Where the price and the paid marks are drawn. */
  priceX: number;
  paidX: number;
  /**
   * Where the paid amount is printed: under its mark, or, when too much change has brought the
   * mark close to the price, moved right to stand clear of the printed price (a short leader
   * joins it to its mark).
   */
  paidLabelX: number;
  /** One hop a piece, in the order given: from where the count stood to where it lands. */
  hops: { i: number; p: MoneyPiece; from: number; to: number; x1: number; x2: number }[];
  /** The count after the last piece. */
  reached: number;
}

/**
 * Where everything on the line is drawn. Each hop is one stretch of the line, drawn in proportion
 * to its cents but never under `MIN_HOP_PX`; the paid mark is at the line's end until the count
 * reaches it, and inside the hop that passes it when too much is given (it never splits a hop). The paid amount is printed under
 * its mark, moved clear of the printed price (`labelSepPx`) when too much change brings the mark
 * close to it, so the two printed amounts stay apart however much too much is given.
 */
export function countUpLayout(
  price: number,
  paid: number,
  given: readonly MoneyPiece[],
): CountUpLayout {
  let at = price;
  const raw = given.map((p, i) => {
    const from = at;
    at += pieceCents(p);
    return { i, p, from, to: at };
  });
  const reached = at;
  // The stretches of the line: one a hop, whole (the paid mark never splits a hop, so a hop it
  // crosses is as wide as every other hop of its piece), and, while there is more to count, the
  // stretch from the count so far to the paid mark.
  const segs: Segment[] = raw.map((h) => ({ v: h.to - h.from, min: MIN_HOP_PX }));
  if (reached < paid) segs.push({ v: paid - reached, min: MIN_REST_PX });
  // One allotment for the whole line, so hops of one piece are one width wherever they fall and a
  // bigger piece never hops shorter than a smaller one, before the paid mark or past it.
  const widths = allot(segs, LINE_PX);
  const xOf = new Map<number, number>([[price, PAD]]);
  let x = PAD;
  raw.forEach((h, k) => {
    x += widths[k] as number;
    xOf.set(h.to, x);
  });
  const px = (v: number) => xOf.get(v) as number;
  // The paid mark: at the end of the line while there is more to count; on a landing when the
  // count has reached it there; else inside the hop that passes it, where the amount falls along
  // that hop, kept `MARK_INSET_PX` clear of both of the hop's ends so it reads as passed.
  const paidX = (() => {
    if (reached < paid) return PAD + LINE_PX;
    const on = xOf.get(paid);
    if (on !== undefined) return on;
    const over = raw.find((h) => h.from < paid && h.to > paid);
    if (!over) return PAD + LINE_PX;
    const x1 = px(over.from);
    const x2 = px(over.to);
    const at = x1 + ((paid - over.from) / (over.to - over.from)) * (x2 - x1);
    return Math.min(Math.max(at, x1 + MARK_INSET_PX), x2 - MARK_INSET_PX);
  })();
  return {
    priceX: PAD,
    paidX,
    paidLabelX: Math.min(
      Math.max(paidX, PAD + labelSepPx(price, paid)),
      Math.max(paidX, W - amountWidth(paid) / 2 - 2),
    ),
    hops: raw.map((h) => ({ ...h, x1: px(h.from), x2: px(h.to) })),
    reached,
  };
}

export function CountUpLine({ price, paid, given, label, scale = 1 }: CountUpLineProps) {
  const { priceX, paidX, paidLabelX, hops, reached } = countUpLayout(price, paid, given);
  const height = LINE_Y + 50;
  return (
    <svg
      className="ni-mchange__line"
      role="img"
      aria-label={label}
      width={W * scale}
      height={height * scale}
      viewBox={`0 0 ${W} ${height}`}
      data-price={price}
      data-paid={paid}
      data-reached={reached}
    >
      <line className="ni-mchange__axis" x1={PAD - 22} x2={W - PAD + 22} y1={LINE_Y} y2={LINE_Y} />
      {hops.map((h) => {
        const mid = (h.x1 + h.x2) / 2;
        const w = h.x2 - h.x1;
        // Every hop is the same height, so a row of hops reads as a row of steps to count.
        const apex = LINE_Y - 6 - 22;
        const rider = Math.min(RIDER_PX, w - 4);
        return (
          <g
            key={h.i}
            className="ni-mchange__hop"
            data-from={h.from}
            data-to={h.to}
            data-piece={h.p}
          >
            <path
              d={`M${h.x1} ${LINE_Y - 6}Q${mid} ${2 * apex - (LINE_Y - 6)} ${h.x2} ${LINE_Y - 6}`}
              className="ni-mchange__arc"
            />
            <circle cx={h.x2} cy={LINE_Y} r={5} className="ni-mchange__stop" />
            {h.p === 'dollar' ? (
              <g className="ni-mchange__rider" transform={`translate(${mid - 14} ${apex - 22})`}>
                <rect x={0} y={0} width={28} height={15} rx={3} className="ni-mchange__bill" />
              </g>
            ) : (
              <g
                className="ni-mchange__rider"
                transform={`translate(${mid - rider / 2} ${apex - 6 - rider})`}
              >
                <CoinArt kind={h.p as CoinKind} quarterPx={rider} />
              </g>
            )}
          </g>
        );
      })}
      {[
        { v: price, x: priceX, at: priceX, cls: 'price' },
        { v: paid, x: paidX, at: paidLabelX, cls: 'paid' },
      ].map(({ v, x, at, cls }) => (
        <g key={cls} data-end={cls}>
          <line className="ni-mchange__tick" x1={x} x2={x} y1={LINE_Y - 14} y2={LINE_Y + 14} />
          {at !== x ? (
            <line className="ni-mchange__leader" x1={x} x2={at} y1={LINE_Y + 14} y2={LINE_Y + 20} />
          ) : null}
          <text
            className="ni-mchange__numeral"
            x={at}
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
