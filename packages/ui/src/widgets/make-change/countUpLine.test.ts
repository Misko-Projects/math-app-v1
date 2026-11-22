import { TRAY_NARROW_PIECES_MAX } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import type { MoneyPiece } from '../kit';
import { countUpLayout, LABEL_SEP_PX, LINE_PX, MIN_HOP_PX } from './CountUpLine';

const KINDS: MoneyPiece[] = ['penny', 'nickel', 'dime', 'quarter', 'dollar'];

/** Every run of up to `n` pieces. */
function* runs(n: number): Generator<MoneyPiece[]> {
  yield [];
  if (n === 0) return;
  for (const rest of runs(n - 1)) for (const k of KINDS) yield [...rest, k];
}

describe('countUpLayout (make-change, U05 #14)', () => {
  it('draws the right count from the price mark to the paid mark, the whole line', () => {
    const l = countUpLayout(65, 100, ['quarter', 'dime']);
    expect(l.paidX - l.priceX).toBeCloseTo(LINE_PX);
    expect(l.hops[1]?.x2).toBeCloseTo(l.paidX);
    expect(l.reached).toBe(100);
    // The quarter hops further than the dime.
    const [q, d] = l.hops as unknown as [{ x1: number; x2: number }, { x1: number; x2: number }];
    expect(q.x2 - q.x1).toBeGreaterThan(d.x2 - d.x1);
  });

  it('every hop can be seen and counted, for every run of pieces the tray holds', () => {
    // About 23,000 layouts: plain checks that collect what fails, and one assertion at the end.
    const failed: string[] = [];
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    for (const [price, paid] of [
      [65, 100],
      [95, 100],
      [99, 100],
      [1, 1000],
      [288, 500],
      [999, 1000],
    ] as const) {
      for (const given of runs(TRAY_NARROW_PIECES_MAX)) {
        const l = countUpLayout(price, paid, given);
        const fail = (why: string) => failed.push(`${price}→${paid} ${given.join(',')}: ${why}`);
        let x = l.priceX;
        for (const h of l.hops) {
          // In order, left to right, each at least MIN_HOP_PX wide.
          if (!near(h.x1, x)) fail('a gap between hops');
          if (h.x2 - h.x1 < MIN_HOP_PX - 1e-6) fail(`a ${h.p} hop under ${MIN_HOP_PX} px`);
          x = h.x2;
        }
        // Nothing leaves the line, and the two printed amounts stay apart.
        const end = l.priceX + LINE_PX + 1e-6;
        if (x > end || l.paidX > end) fail('past the end of the line');
        if (l.paidX - l.priceX < LABEL_SEP_PX - 16 - 1e-6) fail('the paid mark is at the price');
        // The paid mark is where the count says: on the last hop's landing when the change is
        // right, past it when there is more to count, before it when too much was given.
        if (l.reached === paid && given.length > 0 && !near(x, l.paidX))
          fail('misses the paid mark');
        if (l.reached < paid && !(l.paidX > x + 1)) fail('the paid mark is not past the count');
        if (l.reached > paid && !(l.paidX < x - 1)) fail('too much does not land past the mark');
      }
    }
    expect(failed.slice(0, 5)).toEqual([]);
  });

  it('hops of the same piece are the same width, and a bigger piece never hops shorter', () => {
    const failed: string[] = [];
    for (const given of runs(TRAY_NARROW_PIECES_MAX)) {
      const l = countUpLayout(35, 1000, given);
      const byPiece = new Map<string, number>();
      for (const h of l.hops) {
        const w = h.x2 - h.x1;
        const seen = byPiece.get(h.p);
        if (seen === undefined) byPiece.set(h.p, w);
        else if (Math.abs(w - seen) > 1e-6) failed.push(`${given.join(',')}: ${h.p} hops differ`);
      }
      const order = KINDS.filter((k) => byPiece.has(k)).map((k) => byPiece.get(k) as number);
      for (let n = 1; n < order.length; n++) {
        if ((order[n] as number) < (order[n - 1] as number) - 1e-6) {
          failed.push(`${given.join(',')}: a bigger piece hops shorter`);
        }
      }
    }
    expect(failed.slice(0, 5)).toEqual([]);
  });

  it('keeps the price and paid amounts apart when far too much is given (99¢, $1.00, a bill)', () => {
    const l = countUpLayout(99, 100, ['dollar']);
    expect(l.paidX - l.priceX).toBeGreaterThanOrEqual(LABEL_SEP_PX - 1e-6);
    // The bill's hop still lands well past the paid mark.
    expect((l.hops[0]?.x2 as number) - l.paidX).toBeGreaterThanOrEqual(MIN_HOP_PX / 2 - 1e-6);
  });
});
