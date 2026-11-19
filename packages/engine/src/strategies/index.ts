// Strategy praise (03 §5.7, 02 §5.2): `detectStrategies(item, r, meta)` reports the desirable
// strategies a CORRECT response shows, so the TaskRunner may play `fb.praise.<name>` instead of
// `fb.correct.*`. Strategies are not misconceptions: `detectProcessMisconceptions` never returns
// them, and they are never logged as `misconceptionIds`.
//
// Every detector is conservative (a false praise is worse than a missed one): it fires only on a
// signal the child chose, never on one the widget forces, and reports nothing when the signal is
// absent (no trace, a pick or typed answer). All three apply to `addsub.facts` addition items with
// the result unknown (`a + b = _`); the generator is resolved through the bound template (02 §5.9
// E3), so an unbound item gets no praise.
//
// - `strategy.counted-on`: the trace's counter taps (`tap` on `counter-<i>`, README conventions:
//   `0 … a − 1` the first addend, `a … a + b − 1` the second) touch every second-addend counter and
//   no first-addend counter: the child started at `a` and counted on through `b`. The mirror of
//   MC.count-all-instead. Placements (`drag`, `drop`, `move`) are not counting and are ignored.
//   `number-line-jump` never reports it: the widget starts the hops at `a`, so every path counts on.
// - `strategy.made-ten`: a single-digit fact that bridges ten (1 ≤ a, b ≤ 9, a + b > 10), where
//   the child completed a ten first.
//   · `tenframe-fill` (two ten-frames), only when the item STARTS with both addends shown
//     (`prefilled`: exactly `a` colour-a counters in frame 0 and `b` colour-b in frame 1, the
//     show-addends / move-counters design of ADD.08): the end state has frame 0 full, holding the
//     `a` counters and `10 − a` of the `b` counters, and the other `a + b − 10` counters in frame 1.
//     From that start the state can only come from moving counters into frame 0. An item that
//     starts with fewer counters shown (the child places them, and a drop on frame 0 may overflow
//     into frame 1 by itself, like the model's `place`) never reports it.
//   · `number-line-jump`: the first jump lands exactly on 10 (`10 − a`), and the path is not all
//     ±1 hops (hopping by ones passes 10 on every path, so it shows no choice).
// - `strategy.used-doubles`: a near double (|a − b| = 1, both ≥ 2) on `number-line-jump` answered
//   in exactly two jumps, `a` and then `b − a` (6 + 7 as 6 + 6 + 1, 7 + 6 as 7 + 7 − 1). No other
//   format has a signal: a ten-frame end state for 6 + 7 looks the same however it was built, and
//   the trace has no placement-order convention, so `tenframe-fill` never reports it.
//
// A response whose trace shows MC.count-all-instead (every counter tapped, starting with the first
// addend) gets no praise at all, even when its end state would qualify.

import type {
  GeneratedItem,
  InteractionEvent,
  ResponseValue,
  StrategyId,
} from '@number-island/shared';
import { cellGrid, nums } from '../check/state/types';
import { matches } from '../items/check';
import { itemGenerator } from '../misconceptions';
import type { ProcessMeta } from '../misconceptions/rules';
import { countAllInstead } from '../misconceptions/rules/countAllInstead';

/** The generators whose items the detectors understand. */
const GENERATORS: readonly string[] = ['addsub.facts'];

const COUNTER = /^counter-(\d+)$/;

interface AddFact {
  a: number;
  b: number;
}

type Detector = (
  fact: AddFact,
  item: GeneratedItem,
  r: ResponseValue,
  meta: ProcessMeta,
) => boolean;

/** Indexes of the counters the child tapped, in trace order. */
function counterTaps(trace: readonly InteractionEvent[] | undefined): number[] {
  return (trace ?? [])
    .filter((e) => e.t === 'tap')
    .flatMap((e) => {
      const m = e.target.match(COUNTER);
      return m ? [Number(m[1])] : [];
    });
}

/** The jumps of a number-line-jump response, or undefined for any other response. */
function jumpsOf(item: GeneratedItem, r: ResponseValue): number[] | undefined {
  if (item.widget.format !== 'number-line-jump' || r.kind !== 'state') return undefined;
  return nums(r.value.jumps);
}

const countedOn: Detector = ({ a, b }, item, _r, meta) => {
  if (a < 1 || b < 1 || item.widget.format === 'number-line-jump') return false;
  const taps = counterTaps(meta.trace);
  if (taps.length === 0) return false;
  // Any first-addend counter (or an index past the counters) means it was not counting on.
  if (taps.some((i) => i < a || i >= a + b)) return false;
  return new Set(taps).size === b;
};

const madeTen: Detector = ({ a, b }, item, r) => {
  if (a < 1 || a > 9 || b < 1 || b > 9 || a + b <= 10) return false;
  const w = item.widget;
  if (w.format === 'tenframe-fill') {
    if (w.frames !== 2 || w.size !== 10 || r.kind !== 'state') return false;
    // Both addends on the frames from the start, and nothing else: a colour-a in frame 0, b
    // colour-b in frame 1. Only then does the end state below prove counters were moved.
    const shown = (frame: number, color: 'a' | 'b') =>
      w.prefilled
        .filter((p) => p.frame === frame && p.color === color)
        .reduce((n, p) => n + p.count, 0);
    const prefilledTotal = w.prefilled.reduce((n, p) => n + p.count, 0);
    if (shown(0, 'a') !== a || shown(1, 'b') !== b || prefilledTotal !== a + b) return false;
    const cells = cellGrid(r.value.cells);
    const [f0, f1] = cells ?? [];
    if (cells?.length !== 2 || !f0 || !f1 || f0.length !== 10 || f1.length !== 10) {
      return false;
    }
    const count = (f: number[], c: number) => f.filter((x) => x === c).length;
    return (
      count(f0, 1) === a &&
      count(f0, 2) === 10 - a &&
      count(f1, 1) === 0 &&
      count(f1, 2) === a + b - 10
    );
  }
  const jumps = jumpsOf(item, r);
  if (!jumps || jumps.length < 2) return false;
  return jumps[0] === 10 - a && jumps.some((j) => Math.abs(j) !== 1);
};

const usedDoubles: Detector = ({ a, b }, item, r) => {
  if (Math.abs(a - b) !== 1 || Math.min(a, b) < 2) return false;
  const jumps = jumpsOf(item, r);
  return jumps?.length === 2 && jumps[0] === a && jumps[1] === b - a;
};

/** In `STRATEGY_IDS` order. */
const DETECTORS: readonly (readonly [StrategyId, Detector])[] = [
  ['strategy.counted-on', countedOn],
  ['strategy.made-ten', madeTen],
  ['strategy.used-doubles', usedDoubles],
];

/** The addition fact an item asks for, or null when no detector applies to it. */
function additionFact(item: GeneratedItem): AddFact | null {
  const generator = itemGenerator(item);
  if (generator === undefined || !GENERATORS.includes(generator)) return null;
  const { a, b, op, unknown } = item.params;
  if (op !== '+' || unknown !== 'result') return null;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  return { a, b };
}

/**
 * Desirable strategies a correct response shows (03 §5.7), in `STRATEGY_IDS` order; [] for an
 * incorrect response or a skip. Pure and deterministic. The TaskRunner may replace
 * `fb.correct.*` with `fb.praise.<name>` for the first one.
 */
export function detectStrategies(
  item: GeneratedItem,
  r: ResponseValue,
  meta: ProcessMeta,
): StrategyId[] {
  if (r.kind === 'skip' || !matches(item.answer, r)) return [];
  const fact = additionFact(item);
  if (!fact) return [];
  if (countAllInstead.match(item, r, meta)) return [];
  return DETECTORS.filter(([, detect]) => detect(fact, item, r, meta)).map(([id]) => id);
}
