// 03 §5.5 make-set. The container starts with `start` objects (`take-away`, `add-more`) or empty.
// The `hands` container tracks each hand (five fingers each), so a two-hand split is visible.
// Response: state `{ count, removed, parts?, bundles? }`:
// - `parts` is `[left hand, right hand]` for `hands`, and `[kept, removed]` for `take-away`;
// - `bundles` is the number of bundled tens (groupsOf 10, CNT.19).

import { makeSetConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import { argNumber, type FormatModel, type FormatState, UnsupportedOpError } from './types';

type Config = WidgetConfigOf<'make-set'>;

export interface MakeSetState extends FormatState<'make-set'> {
  count: number;
  removed: number;
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
        // Objects in the container beyond `start` came from the supply; removed ones go back.
        const supplyLeft = c.source.supply - Math.max(0, s.count - (c.start ?? 0));
        const add = Math.min(want, c.capacity - s.count, Math.max(0, supplyLeft));
        if (s.hands) {
          const h: [number, number] = [...s.hands];
          if (hand === 0 || hand === 1) {
            h[hand] += Math.min(add, 5 - h[hand]);
          } else {
            const left = Math.min(add, 5 - h[0]);
            h[0] += left;
            h[1] += Math.min(add - left, 5 - h[1]);
          }
          return { ...s, hands: h, count: h[0] + h[1] };
        }
        return { ...s, count: s.count + add };
      }
      case 'remove': {
        const want = Math.max(0, Math.trunc(argNumber(a, 'count') ?? 1));
        if (s.hands) {
          const h: [number, number] = [...s.hands];
          if (hand === 0 || hand === 1) {
            const r = Math.min(want, h[hand]);
            h[hand] -= r;
            return { ...s, hands: h, count: h[0] + h[1], removed: s.removed + r };
          }
          const fromRight = Math.min(want, h[1]);
          h[1] -= fromRight;
          const fromLeft = Math.min(want - fromRight, h[0]);
          h[0] -= fromLeft;
          return { ...s, hands: h, count: h[0] + h[1], removed: s.removed + fromRight + fromLeft };
        }
        const r = Math.min(want, s.count);
        return { ...s, count: s.count - r, removed: s.removed + r };
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
