// tiles.cover (03 §5.5 area-tiles), over the region `{ mask, w?, h? }`:
// - `tile`: state `{ tiles, value? }`; `tiles` (row-major '1'/'0') covers exactly the mask's cells
//   (every region cell once, nothing outside), and the typed area matches `value`.
// - `{ decompose: true, w, h }` (MEA.13, MUL.19): state `{ splits, value }`; the split lines cut
//   the region into two or more pieces, every piece is a rectangle, and the typed total matches
//   `value`.
import { isRectPiece, regionPieces, type Split } from '../../formats/area-tiles';
import { askedValueOk, num, type StateChecker } from './types';

function splitsOf(v: unknown, w: number, h: number): Split[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Split[] = [];
  for (const x of v) {
    if (x === null || typeof x !== 'object') return undefined;
    const { dir, at } = x as Record<string, unknown>;
    const n = num(at);
    if ((dir !== 'v' && dir !== 'h') || n === undefined || !Number.isInteger(n)) return undefined;
    if (n < 1 || n >= (dir === 'v' ? w : h)) return undefined;
    out.push({ dir, at: n });
  }
  return out;
}

export const tilesCover: StateChecker = {
  id: 'tiles.cover',
  check(target, value) {
    const mask = target.mask;
    if (typeof mask !== 'string' || !/^[01]+$/.test(mask)) return false;
    if (target.decompose === true) {
      const w = num(target.w);
      const h = num(target.h);
      if (w === undefined || h === undefined || w * h !== mask.length) return false;
      const splits = splitsOf(value.splits, w, h);
      if (!splits) return false;
      const pieces = regionPieces(w, h, mask, splits);
      if (pieces.length < 2 || !pieces.every(isRectPiece)) return false;
      return askedValueOk(target, value);
    }
    if (value.tiles !== mask) return false;
    return askedValueOk(target, value);
  },
};
