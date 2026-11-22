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
/** The least the stretch still to count (from the count so far to the paid mark) is drawn. */
const MIN_REST_PX = 14;
/**
 * The least the paid mark is drawn from the price mark, in px: their two amounts are printed
 * centred under them (up to "$10.00" in 34 px numerals), so nearer than this they would run into
 * each other.
 */
export const LABEL_SEP_PX = 112;

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
  /** One hop a piece, in the order given: from where the count stood to where it lands. */
  hops: { i: number; p: MoneyPiece; from: number; to: number; x1: number; x2: number }[];
  /** The count after the last piece. */
  reached: number;
}

/**
 * Where everything on the line is drawn. The amounts in order (the price, each landing, the
 * amount paid) are the line's marks; the stretches between them are drawn in proportion to their
 * cents but never under their least width (a hop `MIN_HOP_PX`), and the paid mark is kept
 * `LABEL_SEP_PX` from the price mark, so the two printed amounts stay apart however much too much
 * is given.
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
  // The marks, in order: every landing, and the paid amount where it is not a landing.
  const marks = [...new Set([price, ...raw.map((h) => h.to), paid])].sort((a, b) => a - b);
  const stops = new Set([price, ...raw.map((h) => h.to)]);
  const segs: Segment[] = marks.slice(1).map((m, k) => {
    const lo = marks[k] as number;
    // A whole hop, half of a hop the paid mark cuts in two, or the stretch still to count.
    const whole = stops.has(lo) && stops.has(m);
    const rest = lo >= reached;
    return { v: m - lo, min: rest ? MIN_REST_PX : whole ? MIN_HOP_PX : MIN_HOP_PX / 2 };
  });
  const paidAt = marks.indexOf(paid);
  const before = segs.slice(0, paidAt);
  const after = segs.slice(paidAt);
  const afterMin = after.reduce((a, s) => a + s.min, 0);
  let widths = allot(segs, LINE_PX);
  const beforeW = widths.slice(0, paidAt).reduce((a, x) => a + x, 0);
  const need = Math.min(LABEL_SEP_PX, LINE_PX - afterMin);
  if (before.length > 0 && after.length > 0 && beforeW < need) {
    widths = [...allot(before, need), ...allot(after, LINE_PX - need)];
  }
  const xOf = new Map<number, number>([[price, PAD]]);
  let x = PAD;
  marks.slice(1).forEach((m, k) => {
    x += widths[k] as number;
    xOf.set(m, x);
  });
  const px = (v: number) => xOf.get(v) as number;
  return {
    priceX: PAD,
    paidX: px(paid),
    hops: raw.map((h) => ({ ...h, x1: px(h.from), x2: px(h.to) })),
    reached,
  };
}

export function CountUpLine({ price, paid, given, label, scale = 1 }: CountUpLineProps) {
  const { priceX, paidX, hops, reached } = countUpLayout(price, paid, given);
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
        { v: price, x: priceX, cls: 'price' },
        { v: paid, x: paidX, cls: 'paid' },
      ].map(({ v, x, cls }) => (
        <g key={cls} data-end={cls}>
          <line className="ni-mchange__tick" x1={x} x2={x} y1={LINE_Y - 14} y2={LINE_Y + 14} />
          <text
            className="ni-mchange__numeral"
            x={x}
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
