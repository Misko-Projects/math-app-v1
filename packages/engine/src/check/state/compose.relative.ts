// compose.relative `{ word, box: { x, y, w, h }, scene?: { w, h } }` (03 §5.5 shape-compose,
// place-relative, GEO.05). Response `{ at: [x, y], layer?: 'front' | 'back' }`: the placed item's
// centre in scene units (x right, y down) and whether it is drawn in front of or behind the anchor
// (default front). Correct when the centre lies in the region the word defines around the anchor's
// box (centre x, y; size w, h):
// - above / below: higher than the top (lower than the bottom), within a band one box-width wider
//   than the box on each side;
// - left-of / right-of: past the left (right) edge, within a band half a box-height beyond the top
//   and bottom;
// - beside / next-to: left-of or right-of, and no more than one box-width away;
// - in-front-of / behind: the centre is on the box, drawn in front (behind).
// Any point in the region is correct (state equivalence).
import { num, type StateChecker } from './types';

const point = (v: unknown): [number, number] | undefined =>
  Array.isArray(v) && v.length === 2 && num(v[0]) !== undefined && num(v[1]) !== undefined
    ? [v[0] as number, v[1] as number]
    : undefined;

export function inRelation(
  word: string,
  box: { x: number; y: number; w: number; h: number },
  at: [number, number],
  layer: 'front' | 'back',
): boolean {
  const [px, py] = at;
  const l = box.x - box.w / 2;
  const r = box.x + box.w / 2;
  const t = box.y - box.h / 2;
  const b = box.y + box.h / 2;
  const inColumn = px >= l - box.w / 2 && px <= r + box.w / 2;
  const inRow = py >= t - box.h / 2 && py <= b + box.h / 2;
  const left = px < l && inRow;
  const right = px > r && inRow;
  const onBox = px >= l && px <= r && py >= t && py <= b;
  switch (word) {
    case 'above':
      return py < t && inColumn;
    case 'below':
      return py > b && inColumn;
    case 'left-of':
      return left;
    case 'right-of':
      return right;
    case 'beside':
    case 'next-to':
      return (left && l - px <= box.w) || (right && px - r <= box.w);
    case 'in-front-of':
      return onBox && layer === 'front';
    case 'behind':
      return onBox && layer === 'back';
    default:
      return false;
  }
}

export const composeRelative: StateChecker = {
  id: 'compose.relative',
  check(target, value) {
    const box = target.box as Record<string, unknown> | undefined;
    if (typeof target.word !== 'string' || !box || typeof box !== 'object') return false;
    const x = num(box.x);
    const y = num(box.y);
    const w = num(box.w);
    const h = num(box.h);
    if (x === undefined || y === undefined || w === undefined || h === undefined) return false;
    const at = point(value.at);
    if (!at) return false;
    const layer = value.layer === undefined ? 'front' : value.layer;
    if (layer !== 'front' && layer !== 'back') return false;
    const scene = target.scene as Record<string, unknown> | undefined;
    if (scene && typeof scene === 'object') {
      const sw = num(scene.w);
      const sh = num(scene.h);
      if (
        sw !== undefined &&
        sh !== undefined &&
        (at[0] < 0 || at[1] < 0 || at[0] > sw || at[1] > sh)
      ) {
        return false;
      }
    }
    return inRelation(target.word, { x, y, w, h }, at, layer);
  },
};
