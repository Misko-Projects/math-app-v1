// trade.result (03 §5.5 base-ten-trade), mat state `{ hundreds, tens, ones, value? }`:
// - `{ regroupTarget, value? }`: the mat shows exactly those column counts (`regroup-to`), and the
//   typed `value` matches when the target names one. A `compute` item that must show its carries
//   and borrows (mda.addsub: 3 tens 12 ones is not 42 until ten ones are bundled) gives the
//   canonical result as `regroupTarget` with its `result` and `value`;
// - `{ result, value? }` (`compute`): the mat is worth `result` (any trades), and the typed `value`
//   matches when the item asks for one (`thenAsk`).
import { COLUMNS, type Hto } from '../../formats/place-value';
import { askedValueOk, num, type StateChecker } from './types';

function columns(v: unknown): Hto | undefined {
  if (v === null || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const out: Hto = { hundreds: 0, tens: 0, ones: 0 };
  for (const k of COLUMNS) {
    const x = num(r[k]);
    if (x === undefined || !Number.isInteger(x) || x < 0) return undefined;
    out[k] = x;
  }
  return out;
}

export const tradeResult: StateChecker = {
  id: 'trade.result',
  check(target, value) {
    const mat = columns(value);
    if (!mat) return false;
    if (target.regroupTarget !== undefined) {
      const want = columns(target.regroupTarget);
      if (want === undefined || !COLUMNS.every((k) => mat[k] === want[k])) return false;
      return askedValueOk(target, value);
    }
    const result = num(target.result);
    if (result === undefined) return false;
    if (mat.hundreds * 100 + mat.tens * 10 + mat.ones !== result) return false;
    return askedValueOk(target, value);
  },
};
