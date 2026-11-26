// array.dims `{ rows, cols, orientationMatters?, requireSplit? }` (03 §5.5 array-build, and
// area-tiles `partition`): the array is rows × cols (cols × rows too unless orientation matters).
// With `requireSplit` (MUL.07) a split line sits after any column 1 … cols − 1 and the typed
// `value` is the total rows × cols; with `splitAt` (doubling, MUL.14) the line must sit after
// exactly that column (the middle).
import { num, type StateChecker } from './types';

const dim = (v: unknown): number | undefined => {
  const x = num(v);
  return x !== undefined && Number.isInteger(x) && x >= 1 ? x : undefined;
};

export const arrayDims: StateChecker = {
  id: 'array.dims',
  check(target, value) {
    const r = dim(target.rows);
    const c = dim(target.cols);
    const vr = dim(value.rows);
    const vc = dim(value.cols);
    if (!r || !c || !vr || !vc) return false;
    const same = vr === r && vc === c;
    const turned = target.orientationMatters !== true && vr === c && vc === r;
    if (!same && !turned) return false;
    if (target.requireSplit !== true) return true;
    const split = dim(value.split);
    if (split === undefined || split >= vc || num(value.value) !== r * c) return false;
    return target.splitAt === undefined || split === num(target.splitAt);
  },
  // Moving the split line to another column is another valid split.
  exempt: (target, original, mutated) =>
    target.requireSplit === true &&
    num(original.value) === num(mutated.value) &&
    num(original.rows) === num(mutated.rows) &&
    num(original.cols) === num(mutated.cols) &&
    arrayDims.check(target, mutated),
};
