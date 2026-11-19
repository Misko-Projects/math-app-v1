// 03 §5.5 equal-share. `items` sprites wait in a pile; the child deals them to `recipients`
// Pebblings or plates. What cannot be shared fairly goes to the seagull (05 §4, W7).
// - `deal {to, count?}` gives `count` (default 1) from the pile to recipient `to`; a negative count
//   takes items back. A recipient holds `shareCapacity` at most: dealing stops there.
//   `deal-round` gives one to each recipient in turn while the pile lasts (nothing while one of
//   them is full).
//   `set-aside-leftover` gives what is left in the pile to the seagull once the shares are equal and
//   the pile is too small to go round again (fewer than the recipients); before that it does
//   nothing, so the seagull only ever gets the true leftover. `set-aside-leftover {back: true}`
//   returns what the seagull holds to the pile.
// - `each`, `leftover`: answer state `{ shares, leftover, value }` (`share.fair`), where `leftover`
//   is everything not dealt (the pile plus the seagull's) and `value` the typed answer.
// - `fair-or-not` (a pre-dealt share): answer `choice` `yes` | `no`.
// - `even-odd` (MUL.01): share between two, then answer `choice` `even` | `odd`.

import {
  type AnswerSpec,
  equalShareConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
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

/**
 * The supported domain (what the widget draws in the smallest widget area, 906 × 373): at most
 * `SHARE_ITEMS_MAX` things shared among 2 … `SHARE_RECIPIENTS_MAX`, and at most `shareZoneMax`
 * on one recipient (15 of two, 10 of three or four).
 */
export const SHARE_ITEMS_MAX = 24;
export const SHARE_RECIPIENTS_MAX = 4;
export const SHARE_ZONE_MAX = 15;
/** Beside three or four recipients one of them holds this many at most. */
export const SHARE_ZONE_MAX_MANY = 10;
/** The most one of `recipients` recipients can hold (pre-dealt, or while dealing). */
export const shareZoneMax = (recipients: number): number =>
  recipients <= 2 ? SHARE_ZONE_MAX : SHARE_ZONE_MAX_MANY;

/**
 * How many things one recipient can hold: the next whole five above a fair share, never fewer
 * than ten (so the room never shows the share) or than a pre-dealt count, never more than there
 * are. It is always more than a fair share, so a full recipient is never part of the answer.
 * Dealing stops there (`deal`, `deal-round`); the widget draws exactly this many places.
 */
export function shareCapacity(c: Pick<Config, 'items' | 'recipients' | 'predealt'>): number {
  const fair = Math.floor(c.items / Math.max(1, c.recipients));
  const above = (Math.floor(fair / 5) + 1) * 5;
  const room = Math.min(c.items, Math.max(10, above));
  return Math.max(1, room, ...(c.predealt ?? []));
}

/** Whether every recipient holds the same. */
export const sharesEqual = (shares: readonly number[]) => shares.every((x) => x === shares[0]);

/**
 * Why an item's answer is not the one this config asks for (FormatModel.answerIssues). The typed
 * asks are checked by `share.fair`, whose target must describe this share; the choices must be
 * what the picture shows.
 */
export function shareAnswerIssues(c: Config, answer: AnswerSpec): string[] {
  const out: string[] = [];
  if (c.ask === 'fair-or-not' || c.ask === 'even-odd') {
    if (answer.kind !== 'choice') return [`${c.ask} answers a choice`];
    const want =
      c.ask === 'fair-or-not'
        ? sharesEqual(c.predealt ?? [])
          ? 'yes'
          : 'no'
        : c.items % 2 === 0
          ? 'even'
          : 'odd';
    if (answer.id !== want) out.push(`the picture shows "${want}", the answer says "${answer.id}"`);
    return out;
  }
  if (answer.kind !== 'state' || answer.checker !== 'share.fair') {
    return [`${c.ask} answers share.fair`];
  }
  const t = answer.target as Record<string, unknown>;
  if (t.items !== c.items) out.push(`the target shares ${String(t.items)}, the widget ${c.items}`);
  if (t.recipients !== c.recipients) {
    out.push(`the target shares among ${String(t.recipients)}, the widget ${c.recipients}`);
  }
  if ((t.allowLeftover === true) !== c.allowLeftover) {
    out.push('the target and the widget disagree on whether a leftover is allowed');
  }
  const rest = c.items % c.recipients;
  if (rest > 0 && !c.allowLeftover) out.push('the items do not share evenly');
  const typed = c.ask === 'each' ? Math.floor(c.items / c.recipients) : rest;
  if (t.value !== typed) {
    out.push(`a fair share types ${typed}, the target expects ${String(t.value)}`);
  }
  return out;
}

const configSchema = equalShareConfigSchema.superRefine((c, ctx) => {
  if (c.items < 1 || c.items > SHARE_ITEMS_MAX) {
    ctx.addIssue({
      code: 'custom',
      path: ['items'],
      message: `1 to ${SHARE_ITEMS_MAX} things are shared`,
    });
  }
  if (c.recipients < 2 || c.recipients > SHARE_RECIPIENTS_MAX) {
    ctx.addIssue({
      code: 'custom',
      path: ['recipients'],
      message: `sharing is among 2 to ${SHARE_RECIPIENTS_MAX}`,
    });
  }
  c.predealt?.forEach((n, i) => {
    if (n > shareZoneMax(c.recipients)) {
      ctx.addIssue({
        code: 'custom',
        path: ['predealt', i],
        message: `one of ${c.recipients} recipients holds at most ${shareZoneMax(c.recipients)}`,
      });
    }
  });
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
  answerIssues: shareAnswerIssues,
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
        // A recipient holds `shareCapacity` at most; dealing stops there.
        const room = Math.max(0, shareCapacity(s.config) - have);
        const n = want >= 0 ? Math.min(want, s.pile, room) : -Math.min(-want, have);
        if (n === 0) return s;
        shares[to] = have + n;
        return { ...s, shares, pile: s.pile - n };
      }
      case 'deal-round': {
        // One to each, or nothing: a full recipient cannot take part in the round.
        if (s.shares.some((x) => x >= shareCapacity(s.config))) return s;
        const shares = [...s.shares];
        let pile = s.pile;
        for (let i = 0; i < shares.length && pile > 0; i += 1) {
          shares[i] = (shares[i] as number) + 1;
          pile -= 1;
        }
        return { ...s, shares, pile };
      }
      case 'set-aside-leftover':
        // `{ back: true }` undoes it: what the seagull holds returns to the pile.
        if (a.args?.back === true) {
          return s.seagull === 0 ? s : { ...s, pile: s.pile + s.seagull, seagull: 0 };
        }
        // Only the true leftover goes to the seagull: the shares are equal and the pile cannot go
        // round again. Otherwise nothing happens.
        if (s.pile === 0 || s.pile >= s.shares.length) return s;
        if (!sharesEqual(s.shares)) return s;
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
