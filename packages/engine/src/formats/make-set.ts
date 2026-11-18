// 03 §5.5 make-set. The container starts with `start` objects (`take-away`, `add-more`) or empty.
// The `hands` container tracks each hand (five fingers each), so a two-hand split is visible.
// Removed objects wait in a pile beside the container, and dragging takes from that pile before
// the supply, so a child can put objects back.
// Response: state `{ count, removed, parts?, bundles? }`, where `removed` is the pile's current size:
// - `parts` is `[left hand, right hand]` for `hands`, and `[in the container, in the pile]` for
//   `take-away`;
// - `bundles` is the number of bundled tens (groupsOf 10, CNT.19).

import { makeSetConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import { argNumber, type FormatModel, type FormatState, UnsupportedOpError } from './types';

type Config = WidgetConfigOf<'make-set'>;

export interface MakeSetState extends FormatState<'make-set'> {
  count: number;
  /** Objects currently in the pile beside the container (taken out and not put back). */
  removed: number;
  /** Objects taken from the supply so far (net). */
  taken: number;
  /** `hands` container only: fingers raised on each hand. */
  hands: [number, number] | null;
  bundles: number;
  closed: boolean;
}

const configSchema = makeSetConfigSchema.superRefine((c, ctx) => {
  const start = c.start ?? 0;
  if (c.target > c.capacity) {
    ctx.addIssue({ code: 'custom', path: ['target'], message: 'target exceeds capacity' });
  }
  if (start > c.capacity) {
    ctx.addIssue({ code: 'custom', path: ['start'], message: 'start exceeds capacity' });
  }
  if (c.mode === 'add-more' && !(c.start !== undefined && c.start < c.target)) {
    ctx.addIssue({ code: 'custom', path: ['start'], message: 'add-more needs start < target' });
  }
  if (c.mode === 'take-away' && c.start === undefined) {
    ctx.addIssue({ code: 'custom', path: ['start'], message: 'take-away needs start' });
  }
  if (c.mode !== 'take-away' && c.source.supply + start < c.target) {
    ctx.addIssue({
      code: 'custom',
      path: ['source', 'supply'],
      message: 'supply cannot reach target',
    });
  }
  if (c.container === 'hands' && c.capacity > 10) {
    ctx.addIssue({
      code: 'custom',
      path: ['capacity'],
      message: 'two hands hold at most 10 fingers',
    });
  }
});

function fillHands(total: number): [number, number] {
  const left = Math.min(5, total);
  return [left, Math.min(5, total - left)];
}

export const makeSet: FormatModel<'make-set', MakeSetState> = {
  format: 'make-set',
  configSchema,
  features: {
    'target.over5': { weight: 0.4, doc: 'max(0, target − 5) / 5' },
    'runningCount.off': { weight: 0.4, doc: 'no running count is shown' },
    'mode.takeAway': { weight: 0.3, doc: 'take-away mode' },
    'mode.addMore': { weight: 0.3, doc: 'add-more mode' },
    'supply.excess': { weight: 0.2, doc: 'supply ≥ 2 × target' },
  },
  featureValues(c: Config) {
    return {
      'target.over5': Math.max(0, c.target - 5) / 5,
      'runningCount.off': c.showRunningCount ? 0 : 1,
      'mode.takeAway': c.mode === 'take-away' ? 1 : 0,
      'mode.addMore': c.mode === 'add-more' ? 1 : 0,
      'supply.excess': c.source.supply >= 2 * Math.max(1, c.target) ? 1 : 0,
    };
  },
  initialState(config) {
    const count = config.start ?? 0;
    return {
      config,
      count,
      removed: 0,
      taken: 0,
      hands: config.container === 'hands' ? fillHands(count) : null,
      bundles: 0,
      closed: false,
    };
  },
  apply(s, a) {
    const c = s.config;
    const hand = argNumber(a, 'hand');
    switch (a.op) {
      case 'drag': {
        const want = Math.max(0, Math.trunc(argNumber(a, 'count') ?? 1));
        // Objects come back from the pile of removed ones first, then from the supply.
        const available = s.removed + Math.max(0, c.source.supply - s.taken);
        let add = Math.min(want, c.capacity - s.count, available);
        let hands = s.hands;
        if (s.hands) {
          const h: [number, number] = [...s.hands];
          if (hand === 0 || hand === 1) {
            h[hand] += Math.min(add, 5 - h[hand]);
          } else {
            const left = Math.min(add, 5 - h[0]);
            h[0] += left;
            h[1] += Math.min(add - left, 5 - h[1]);
          }
          add = h[0] + h[1] - s.count;
          hands = h;
        }
        const fromPile = Math.min(add, s.removed);
        return {
          ...s,
          hands,
          count: s.count + add,
          removed: s.removed - fromPile,
          taken: s.taken + (add - fromPile),
        };
      }
      case 'remove': {
        const want = Math.max(0, Math.trunc(argNumber(a, 'count') ?? 1));
        let r = Math.min(want, s.count);
        let hands = s.hands;
        if (s.hands) {
          const h: [number, number] = [...s.hands];
          if (hand === 0 || hand === 1) {
            r = Math.min(want, h[hand]);
            h[hand] -= r;
          } else {
            const fromRight = Math.min(want, h[1]);
            h[1] -= fromRight;
            const fromLeft = Math.min(want - fromRight, h[0]);
            h[0] -= fromLeft;
            r = fromRight + fromLeft;
          }
          hands = h;
        }
        const count = s.count - r;
        // Removed objects wait in a pile beside the container; bundles never exceed the tens left.
        return {
          ...s,
          hands,
          count,
          removed: s.removed + r,
          bundles: Math.min(s.bundles, Math.floor(count / 10)),
        };
      }
      case 'bundle':
        return { ...s, bundles: Math.floor(s.count / 10) };
      case 'count-aloud':
        return s;
      case 'close-container':
        return { ...s, closed: true };
      default:
        throw new UnsupportedOpError('make-set', a.op);
    }
  },
  toResponse(s) {
    const parts = s.hands
      ? [s.hands[0], s.hands[1]]
      : s.config.mode === 'take-away'
        ? [s.count, s.removed]
        : undefined;
    return {
      kind: 'state',
      value: {
        count: s.count,
        removed: s.removed,
        ...(parts ? { parts } : {}),
        ...(s.config.groupsOf ? { bundles: s.bundles } : {}),
      },
    };
  },
};
