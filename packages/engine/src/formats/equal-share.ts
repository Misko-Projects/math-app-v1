// 03 §5.5 equal-share. `items` sprites wait in a pile; the child deals them to `recipients`
// Pebblings or plates. What cannot be shared fairly goes to the seagull (05 §4, W7).
// - `deal {to, count?}` gives `count` (default 1) from the pile to recipient `to`; a negative count
//   takes items back. `deal-round` gives one to each recipient in turn while the pile lasts.
//   `set-aside-leftover` gives what is left in the pile to the seagull once the shares are equal and
//   the pile is too small to go round again (fewer than the recipients); before that it does
//   nothing, so the seagull only ever gets the true leftover.
// - `each`, `leftover`: answer state `{ shares, leftover, value }` (`share.fair`), where `leftover`
//   is everything not dealt (the pile plus the seagull's) and `value` the typed answer.
// - `fair-or-not` (a pre-dealt share): answer `choice` `yes` | `no`.
// - `even-odd` (MUL.01): share between two, then answer `choice` `even` | `odd`.

import { equalShareConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import {
  argNumber,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'equal-share'>;

export interface EqualShareState extends FormatState<'equal-share'> {
  shares: number[];
  /** Items still in the pile. */
  pile: number;
  /** Items given to the seagull. */
  seagull: number;
  value: number | null;
  choice: string | null;
}

/** The choice ids each ask offers ([] for the typed asks). */
export function shareChoices(c: Config): string[] {
  if (c.ask === 'fair-or-not') return ['yes', 'no'];
  if (c.ask === 'even-odd') return ['even', 'odd'];
  return [];
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

const configSchema = equalShareConfigSchema.superRefine((c, ctx) => {
  if (c.items < 1) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'there is something to share' });
  }
  if (c.recipients < 2) {
    ctx.addIssue({ code: 'custom', path: ['recipients'], message: 'sharing needs two or more' });
  }
  if (c.ask === 'even-odd' && c.recipients !== 2) {
    ctx.addIssue({ code: 'custom', path: ['recipients'], message: 'even-odd shares between two' });
  }
  if (c.ask === 'leftover' && !c.allowLeftover) {
    ctx.addIssue({
      code: 'custom',
      path: ['allowLeftover'],
      message: 'a leftover question allows a leftover',
    });
  }
  if (c.ask === 'each' && !c.allowLeftover && c.items % c.recipients !== 0) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'the items do not share evenly' });
  }
  if (c.ask === 'fair-or-not' && !c.predealt) {
    ctx.addIssue({
      code: 'custom',
      path: ['predealt'],
      message: 'fair-or-not shows a dealt share',
    });
  }
  if (c.predealt && (c.predealt.length !== c.recipients || sum(c.predealt) > c.items)) {
    ctx.addIssue({
      code: 'custom',
      path: ['predealt'],
      message: 'one pre-dealt count per recipient, within the items',
    });
  }
});

export const equalShare: FormatModel<'equal-share', EqualShareState> = {
  format: 'equal-share',
  configSchema,
  features: {
    items: { weight: 0.3, doc: '(items − recipients) / 10: items beyond one each' },
    'recipients.over2': { weight: 0.2, doc: 'recipients − 2' },
    leftover: { weight: 0.4, doc: 'the items do not share evenly' },
    predealt: { weight: -0.2, doc: 'the share is pre-dealt' },
  },
  featureValues(c: Config) {
    return {
      items: Math.max(0, c.items - c.recipients) / 10,
      'recipients.over2': Math.max(0, c.recipients - 2),
      leftover: c.items % c.recipients !== 0 ? 1 : 0,
      predealt: c.predealt ? 1 : 0,
    };
  },
  initialState(config) {
    const shares = config.predealt
      ? [...config.predealt]
      : new Array<number>(config.recipients).fill(0);
    return {
      config,
      shares,
      pile: config.items - sum(shares),
      seagull: 0,
      value: null,
      choice: null,
    };
  },
  apply(s, a) {
    switch (a.op) {
      case 'deal': {
        const to = Math.trunc(argNumber(a, 'to') ?? -1);
        const want = Math.trunc(argNumber(a, 'count') ?? 1);
        if (to < 0 || to >= s.shares.length) return s;
        const shares = [...s.shares];
        const have = shares[to] as number;
        const n = want >= 0 ? Math.min(want, s.pile) : -Math.min(-want, have);
        if (n === 0) return s;
        shares[to] = have + n;
        return { ...s, shares, pile: s.pile - n };
      }
      case 'deal-round': {
        const shares = [...s.shares];
        let pile = s.pile;
        for (let i = 0; i < shares.length && pile > 0; i += 1) {
          shares[i] = (shares[i] as number) + 1;
          pile -= 1;
        }
        return { ...s, shares, pile };
      }
      case 'set-aside-leftover':
        // Only the true leftover goes to the seagull: the shares are equal and the pile cannot go
        // round again. Otherwise nothing happens.
        if (s.pile === 0 || s.pile >= s.shares.length) return s;
        if (!s.shares.every((x) => x === s.shares[0])) return s;
        return { ...s, pile: 0, seagull: s.seagull + s.pile };
      case 'answer': {
        const id = argString(a, 'id');
        const v = argNumber(a, 'value');
        if (id !== undefined) return { ...s, choice: id };
        return v === undefined ? s : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('equal-share', a.op);
    }
  },
  toResponse(s) {
    const c = s.config;
    if (c.ask === 'fair-or-not' || c.ask === 'even-odd') {
      return s.choice === null ? null : { kind: 'choice', id: s.choice };
    }
    if (s.value === null) return null;
    return {
      kind: 'state',
      value: { shares: [...s.shares], leftover: s.pile + s.seagull, value: s.value },
    };
  },
};
