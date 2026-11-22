// How the tray of the money board lays out its piles (U05 #14, MoneyBoard). Pure, so the bound is
// a unit test: with `TRAY_PIECES_MAX` pieces in up to five piles, the piles take at most two rows
// of the tray, and every piece of a pile still shows at least `MIN_PILE_STEP_PX` of itself.

/** The least a piece is offset from the one under it in a pile, in px: each one is seen. */
export const MIN_PILE_STEP_PX = 16;
/** The gap between piles, both ways (money.css `.ni-money__piles`). */
export const PILE_GAP_PX = 20;
/** The most rows of piles a tray shows. */
export const MAX_PILE_ROWS = 2;
/** The widest a pile of coins, and of bills, grows when there is room. */
export const MAX_PILE_PX = 300;
export const MAX_BILL_PILE_PX = 360;

export interface PileSpec {
  /** Pieces in the pile (≥ 1). */
  n: number;
  /** The width of one piece's box in px. */
  w: number;
  /** A pile of bills (wider than a pile of coins). */
  bill?: boolean;
}

/** The step of a pile when there is all the room it wants: 42% of a piece, within its widest. */
function roomyStep(p: PileSpec): number {
  if (p.n <= 1) return 0;
  const most = Math.max(p.w, p.bill ? MAX_BILL_PILE_PX : MAX_PILE_PX);
  return Math.max(MIN_PILE_STEP_PX, Math.min(p.w * 0.42, (most - p.w) / (p.n - 1)));
}

/** A pile's width at a step. */
export const pileWidth = (p: PileSpec, step: number): number => p.w + step * (p.n - 1);

/** The rows the piles wrap into, in order, in a tray `avail` px wide (as flex-wrap does). */
export function pileRows(widths: readonly number[], avail: number): number {
  let rows = 1;
  let x = 0;
  for (const w of widths) {
    const next = x === 0 ? w : x + PILE_GAP_PX + w;
    if (x > 0 && next > avail + 0.5) {
      rows += 1;
      x = w;
    } else x = next;
  }
  return rows;
}

/**
 * The step of each pile, in px, for a tray `avail` px wide: as roomy as fits in `MAX_PILE_ROWS`
 * rows, squeezed evenly towards `MIN_PILE_STEP_PX` when the tray is crowded, never under it.
 * `avail` ≤ 0 (not measured yet) gives the roomy steps.
 */
export function pileSteps(piles: readonly PileSpec[], avail: number): number[] {
  const roomy = piles.map(roomyStep);
  if (avail <= 0) return roomy;
  for (let f = 1; f > 0; f -= 0.05) {
    const steps = piles.map((p, i) =>
      p.n <= 1 ? 0 : Math.max(MIN_PILE_STEP_PX, (roomy[i] as number) * f),
    );
    const widths = piles.map((p, i) => pileWidth(p, steps[i] as number));
    if (pileRows(widths, avail) <= MAX_PILE_ROWS) return steps;
  }
  return piles.map((p) => (p.n <= 1 ? 0 : MIN_PILE_STEP_PX));
}
