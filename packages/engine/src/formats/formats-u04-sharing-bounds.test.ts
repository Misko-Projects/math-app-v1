// The supported domain of equal-share and equal-groups (U04 #13): one test per bound, the one
// source of each answer (FormatModel.answerIssues), and the undo of every op a child can do.

import type { AnswerSpec, ItemFormat, WidgetAction, WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import {
  equalGroups,
  GROUP_CAPACITY,
  GROUPS_MAX,
  GROUPS_PILE_MAX,
  GROUPS_PILE_MAX_MANY,
  GROUPS_PILE_WIDE,
  groupsAnswerIssues,
  groupsAnswerMax,
  groupsPileMax,
  groupsPlaces,
  groupsSupply,
} from './equal-groups';
import {
  equalShare,
  SHARE_ITEMS_MAX,
  SHARE_RECIPIENTS_MAX,
  SHARE_ZONE_MAX,
  SHARE_ZONE_MAX_MANY,
  shareAnswerIssues,
  shareCapacity,
  shareZoneMax,
} from './equal-share';
import type { FormatModel, FormatState } from './types';

type Share = WidgetConfigOf<'equal-share'>;
type Groups = WidgetConfigOf<'equal-groups'>;

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };

// biome-ignore lint/suspicious/noExplicitAny: the helpers serve models of different formats.
type AnyModel = FormatModel<any, any>;

const issues = (m: AnyModel, c: unknown): string[] => {
  const r = m.configSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

function play<F extends ItemFormat, S extends FormatState<F>>(
  m: FormatModel<F, S>,
  c: WidgetConfigOf<F>,
  ops: WidgetAction[],
): S {
  return ops.reduce((s, a) => m.apply(s, a), m.initialState(c));
}

const share: Share = {
  format: 'equal-share',
  items: 12,
  recipients: 3,
  sprite: 'shell',
  recipientsKind: 'pebbling',
  allowLeftover: false,
  ask: 'each',
};
const fairTarget = (c: Share, value: number): AnswerSpec => ({
  kind: 'state',
  checker: 'share.fair',
  target: { items: c.items, recipients: c.recipients, allowLeftover: c.allowLeftover, value },
});

const groups: Groups = {
  format: 'equal-groups',
  groups: 3,
  perGroup: 4,
  unknown: 'size',
  mode: 'build',
  container: 'raft',
  sprite: 'shell',
  maxGroups: 3,
};
const equalTarget = (c: Groups, value: number): AnswerSpec => ({
  kind: 'state',
  checker: 'groups.equal',
  target: { groups: c.groups, perGroup: c.perGroup, value },
});

describe('equal-share: the supported domain', () => {
  it('the typed answer always fits the answer control (0 … items)', () => {
    for (let items = 1; items <= SHARE_ITEMS_MAX; items += 1) {
      for (let recipients = 2; recipients <= SHARE_RECIPIENTS_MAX; recipients += 1) {
        expect(Math.floor(items / recipients)).toBeLessThanOrEqual(items);
        expect(items % recipients).toBeLessThanOrEqual(items);
      }
    }
  });

  it('shares 1 to SHARE_ITEMS_MAX things', () => {
    expect(SHARE_ITEMS_MAX).toBe(24);
    expect(issues(equalShare, { ...share, items: 24 })).toEqual([]);
    expect(issues(equalShare, { ...share, items: 25, allowLeftover: true })).toEqual([
      'items: 1 to 24 things are shared',
    ]);
    expect(issues(equalShare, { ...share, items: 0 })).toEqual([
      'items: 1 to 24 things are shared',
    ]);
  });

  it('shares among 2 to SHARE_RECIPIENTS_MAX', () => {
    expect(SHARE_RECIPIENTS_MAX).toBe(4);
    expect(issues(equalShare, { ...share, recipients: 4 })).toEqual([]);
    expect(issues(equalShare, { ...share, items: 10, recipients: 5 })).toEqual([
      'recipients: sharing is among 2 to 4',
    ]);
    expect(issues(equalShare, { ...share, recipients: 1 })).toEqual([
      'recipients: sharing is among 2 to 4',
    ]);
  });

  it('pre-deals at most SHARE_ZONE_MAX to one recipient', () => {
    expect(SHARE_ZONE_MAX).toBe(15);
    const two: Share = { ...share, items: 24, recipients: 2, recipientsKind: 'plate' };
    expect(issues(equalShare, { ...two, predealt: [15, 9] })).toEqual([]);
    expect(issues(equalShare, { ...two, predealt: [16, 8] })).toEqual([
      'predealt.0: one of 2 recipients holds at most 15',
    ]);
  });

  it('pre-deals at most SHARE_ZONE_MAX_MANY to one of three or four recipients', () => {
    expect(SHARE_ZONE_MAX_MANY).toBe(10);
    expect([shareZoneMax(2), shareZoneMax(3), shareZoneMax(4)]).toEqual([15, 10, 10]);
    const four: Share = { ...share, items: 24, recipients: 4, recipientsKind: 'plate' };
    expect(issues(equalShare, { ...four, predealt: [10, 4, 5, 5] })).toEqual([]);
    expect(issues(equalShare, { ...four, predealt: [15, 3, 3, 3] })).toEqual([
      'predealt.0: one of 4 recipients holds at most 10',
    ]);
    expect(issues(equalShare, { ...four, recipients: 3, predealt: [11, 6, 7] })).toEqual([
      'predealt.0: one of 3 recipients holds at most 10',
    ]);
  });

  it('a recipient holds shareCapacity at most, for every config of the domain', () => {
    for (let items = 1; items <= SHARE_ITEMS_MAX; items += 1) {
      for (let recipients = 2; recipients <= SHARE_RECIPIENTS_MAX; recipients += 1) {
        const cap = shareCapacity({ items, recipients });
        // More than a fair share (a full recipient is never the answer), within the bound.
        expect(cap).toBeGreaterThan(Math.floor(items / recipients));
        expect(cap).toBeLessThanOrEqual(shareZoneMax(recipients));
        expect(cap).toBeLessThanOrEqual(items);
      }
    }
    expect(shareCapacity({ items: 12, recipients: 2 })).toBe(10);
    // A fair share of exactly ten still leaves room above it.
    expect(shareCapacity({ items: 20, recipients: 2 })).toBe(15);
    expect(shareCapacity({ items: 24, recipients: 2 })).toBe(15);
    expect(shareCapacity({ items: 6, recipients: 2 })).toBe(6);
    expect(shareCapacity({ items: 8, recipients: 2, predealt: [7, 1] })).toBe(8);
  });

  it('dealing stops at the capacity, and a round needs room at every recipient', () => {
    const c: Share = { ...share, items: 12, recipients: 2 };
    const full = play(equalShare, c, [act('deal', { to: 0, count: 11 })]);
    expect(full.shares).toEqual([10, 0]);
    expect(full.pile).toBe(2);
    // One more is refused; a round would leave the full one out, so it does nothing.
    expect(equalShare.apply(full, act('deal', { to: 0 }))).toBe(full);
    expect(equalShare.apply(full, act('deal-round'))).toBe(full);
    expect(equalShare.apply(full, act('deal', { to: 1 })).shares).toEqual([10, 1]);
  });
});

describe('equal-share: every op can be undone', () => {
  const seven: Share = { ...share, items: 7, allowLeftover: true };

  it('a dealt item goes back to the pile', () => {
    const s = play(equalShare, seven, [act('deal', { to: 1 }), act('deal', { to: 1, count: -1 })]);
    expect(s.shares).toEqual([0, 0, 0]);
    expect(s.pile).toBe(7);
  });

  it('the seagull gives back what it was given', () => {
    const given = play(equalShare, seven, [
      act('deal-round'),
      act('deal-round'),
      act('set-aside-leftover'),
    ]);
    expect([given.pile, given.seagull]).toEqual([0, 1]);
    const back = equalShare.apply(given, act('set-aside-leftover', { back: true }));
    expect([back.pile, back.seagull]).toEqual([1, 0]);
    // Nothing to give back: no change.
    expect(equalShare.apply(back, act('set-aside-leftover', { back: true }))).toBe(back);
  });
});

describe('equal-share: one source for the answer', () => {
  it('each: the target is this share and its value the fair share', () => {
    expect(shareAnswerIssues(share, fairTarget(share, 4))).toEqual([]);
    expect(shareAnswerIssues(share, fairTarget(share, 3))).toEqual([
      'a fair share types 4, the target expects 3',
    ]);
    expect(shareAnswerIssues(share, fairTarget({ ...share, items: 9 }, 4))).toContain(
      'the target shares 9, the widget 12',
    );
    expect(shareAnswerIssues(share, fairTarget({ ...share, recipients: 4 }, 4))).toContain(
      'the target shares among 4, the widget 3',
    );
    expect(shareAnswerIssues(share, fairTarget({ ...share, allowLeftover: true }, 4))).toEqual([
      'the target and the widget disagree on whether a leftover is allowed',
    ]);
    expect(shareAnswerIssues(share, { kind: 'number', value: 4 })).toEqual([
      'each answers share.fair',
    ]);
  });

  it('leftover: the typed value is what is left over', () => {
    const c: Share = { ...share, items: 7, allowLeftover: true, ask: 'leftover' };
    expect(shareAnswerIssues(c, fairTarget(c, 1))).toEqual([]);
    expect(shareAnswerIssues(c, fairTarget(c, 2))).toEqual([
      'a fair share types 1, the target expects 2',
    ]);
  });

  it('the answer the model sends for a fair share passes the checker with that target', () => {
    const c: Share = { ...share, items: 7, allowLeftover: true };
    const r = equalShare.toResponse(
      play(equalShare, c, [
        act('deal-round'),
        act('deal-round'),
        act('set-aside-leftover'),
        act('answer', { value: 2 }),
      ]),
    );
    const target = fairTarget(c, 2);
    expect(shareAnswerIssues(c, target)).toEqual([]);
    expect(r?.kind).toBe('state');
    if (r?.kind === 'state' && target.kind === 'state') {
      expect(stateChecker('share.fair')?.check(target.target, r.value)).toBe(true);
    }
  });

  it('fair-or-not: the choice is what the pre-dealt picture shows', () => {
    const unfair: Share = {
      ...share,
      recipientsKind: 'plate',
      ask: 'fair-or-not',
      predealt: [5, 3, 4],
    };
    expect(shareAnswerIssues(unfair, { kind: 'choice', id: 'no' })).toEqual([]);
    expect(shareAnswerIssues(unfair, { kind: 'choice', id: 'yes' })).toEqual([
      'the picture shows "no", the answer says "yes"',
    ]);
    const fair: Share = { ...unfair, predealt: [4, 4, 4] };
    expect(shareAnswerIssues(fair, { kind: 'choice', id: 'yes' })).toEqual([]);
    expect(shareAnswerIssues(fair, { kind: 'number', value: 4 })).toEqual([
      'fair-or-not answers a choice',
    ]);
  });

  it('even-odd: the choice is the parity of the items', () => {
    const c: Share = { ...share, items: 7, recipients: 2, allowLeftover: true, ask: 'even-odd' };
    expect(shareAnswerIssues(c, { kind: 'choice', id: 'odd' })).toEqual([]);
    expect(shareAnswerIssues(c, { kind: 'choice', id: 'even' })).toEqual([
      'the picture shows "odd", the answer says "even"',
    ]);
  });
});

describe('equal-groups: the supported domain', () => {
  it('has 1 to GROUPS_MAX groups', () => {
    expect(GROUPS_MAX).toBe(6);
    expect(issues(equalGroups, { ...groups, groups: 6, maxGroups: 6, perGroup: 3 })).toEqual([]);
    expect(issues(equalGroups, { ...groups, groups: 7, maxGroups: 7, perGroup: 2 })).toEqual([
      'groups: there are 1 to 6 groups',
      'maxGroups: at most 6 containers',
    ]);
    expect(issues(equalGroups, { ...groups, groups: 0 })).toEqual([
      'groups: there are 1 to 6 groups',
    ]);
  });

  it('offers at most GROUPS_MAX containers', () => {
    const c: Groups = { ...groups, unknown: 'groups' };
    expect(issues(equalGroups, { ...c, maxGroups: 6 })).toEqual([]);
    expect(issues(equalGroups, { ...c, maxGroups: 7 })).toEqual([
      'maxGroups: at most 6 containers',
    ]);
    expect(issues(equalGroups, { ...c, maxGroups: 2 })).toEqual([
      'maxGroups: groups exceed maxGroups',
    ]);
  });

  it('holds 1 to GROUP_CAPACITY in a group (no groups of tens yet)', () => {
    expect(GROUP_CAPACITY).toBe(10);
    expect(issues(equalGroups, { ...groups, perGroup: 10 })).toEqual([]);
    expect(issues(equalGroups, { ...groups, perGroup: 11, unknown: 'total' })).toEqual([
      'perGroup: a container holds 1 to 10',
    ]);
    expect(issues(equalGroups, { ...groups, perGroup: 0 })).toEqual([
      'perGroup: a container holds 1 to 10',
    ]);
  });

  it('builds from a pile of at most 40 beside up to 4 containers, 20 beside 5 or 6', () => {
    expect([GROUPS_PILE_MAX, GROUPS_PILE_WIDE, GROUPS_PILE_MAX_MANY]).toEqual([40, 4, 20]);
    expect(groupsPileMax(4)).toBe(40);
    expect(groupsPileMax(5)).toBe(20);
    const six: Groups = { ...groups, groups: 6, maxGroups: 6 };
    expect(issues(equalGroups, { ...groups, groups: 4, maxGroups: 4, perGroup: 10 })).toEqual([]);
    expect(issues(equalGroups, { ...groups, groups: 5, maxGroups: 5, perGroup: 9 })).toEqual(
      ['perGroup: a pile to build from holds at most 40 beside 4 containers'].map((m) =>
        m.replace('40 beside 4', '20 beside 5'),
      ),
    );
    expect(issues(equalGroups, { ...six, perGroup: 3 })).toEqual([]);
    expect(issues(equalGroups, { ...six, perGroup: 4 })).toEqual([
      'perGroup: a pile to build from holds at most 20 beside 6 containers',
    ]);
    // Where containers are added, the places are the most it may add.
    const asked: Groups = { ...groups, groups: 4, perGroup: 6, unknown: 'groups' };
    expect(groupsPlaces({ ...asked, maxGroups: 6 })).toBe(6);
    expect(issues(equalGroups, { ...asked, maxGroups: 4 })).toEqual([]);
    expect(issues(equalGroups, { ...asked, maxGroups: 6 })).toEqual([
      'perGroup: a pile to build from holds at most 20 beside 6 containers',
    ]);
    expect(issues(equalGroups, { ...six, perGroup: 10, unknown: 'total' })).toEqual([]);
    expect(issues(equalGroups, { ...six, perGroup: 10, unknown: 'size', mode: 'read' })).toEqual(
      [],
    );
  });

  it('a container never takes more than its capacity, or more than the pile has', () => {
    const bucket: Groups = { ...groups, unknown: 'total' };
    expect(groupsSupply(bucket)).toBeNull();
    expect(play(equalGroups, bucket, [act('fill-group', { index: 0, count: 50 })]).groups).toEqual([
      10, 0, 0,
    ]);
    // 12 in all: with 10 in the first raft only 2 are left for the next.
    expect(groupsSupply(groups)).toBe(12);
    const s = play(equalGroups, groups, [
      act('fill-group', { index: 0, count: 10 }),
      act('fill-group', { index: 1, count: 5 }),
    ]);
    expect(s.groups).toEqual([10, 2, 0]);
    expect(equalGroups.apply(s, act('fill-group', { index: 2, count: 1 }))).toBe(s);
  });

  it('offers an answer range too coarse to hint at the answer', () => {
    expect(groupsAnswerMax(groups)).toBe(10);
    expect(groupsAnswerMax({ ...groups, unknown: 'groups' })).toBe(10);
    expect(groupsAnswerMax({ ...groups, unknown: 'total' })).toBe(20);
    expect(groupsAnswerMax({ ...groups, unknown: 'total', groups: 5, perGroup: 4 })).toBe(20);
    expect(groupsAnswerMax({ ...groups, unknown: 'total', groups: 3, perGroup: 7 })).toBe(60);
    for (let g = 1; g <= GROUPS_MAX; g += 1) {
      for (let n = 1; n <= GROUP_CAPACITY; n += 1) {
        const c: Groups = { ...groups, groups: g, perGroup: n, maxGroups: 6, unknown: 'total' };
        expect(groupsAnswerMax(c)).toBeGreaterThanOrEqual(g * n);
      }
    }
  });
});

describe('equal-groups: every op can be undone', () => {
  const asked: Groups = { ...groups, unknown: 'groups', maxGroups: 5 };

  it('an added container is taken away again while it is empty', () => {
    const two = play(equalGroups, asked, [act('add-group'), act('add-group')]);
    expect(two.groups).toEqual([0, 0]);
    expect(equalGroups.apply(two, act('add-group', { remove: 1 })).groups).toEqual([0]);
    const filled = equalGroups.apply(two, act('fill-group', { index: 0, count: 2 }));
    // A filled container stays, and so does one that is not there.
    expect(equalGroups.apply(filled, act('add-group', { remove: 0 }))).toBe(filled);
    expect(equalGroups.apply(filled, act('add-group', { remove: 4 }))).toBe(filled);
    expect(equalGroups.apply(filled, act('add-group', { remove: 1 })).groups).toEqual([2]);
  });

  it('containers are added only where the number of groups is asked', () => {
    const s = equalGroups.initialState(groups);
    expect(equalGroups.apply(s, act('add-group'))).toBe(s);
    expect(equalGroups.apply(s, act('add-group', { remove: 0 }))).toBe(s);
  });

  it('a sprite goes back to the supply', () => {
    const s = play(equalGroups, groups, [
      act('fill-group', { index: 0, count: 3 }),
      act('fill-group', { index: 0, count: 2 }),
    ]);
    expect(s.groups).toEqual([2, 0, 0]);
  });
});

describe('equal-groups: one source for the answer', () => {
  it('build: the target is these groups and its value the unknown', () => {
    expect(groupsAnswerIssues(groups, equalTarget(groups, 4))).toEqual([]);
    expect(groupsAnswerIssues(groups, equalTarget(groups, 12))).toEqual([
      'the unknown is 4, the target expects 12',
    ]);
    expect(groupsAnswerIssues(groups, equalTarget({ ...groups, groups: 4 }, 4))).toEqual([
      'the target has 4 groups, the widget 3',
    ]);
    expect(groupsAnswerIssues(groups, equalTarget({ ...groups, perGroup: 5 }, 4))).toEqual([
      'the target has 5 in a group, the widget 4',
    ]);
    expect(groupsAnswerIssues(groups, { kind: 'number', value: 4 })).toEqual([
      'build answers groups.equal',
    ]);
    const totalAsked: Groups = { ...groups, unknown: 'total' };
    expect(groupsAnswerIssues(totalAsked, equalTarget(totalAsked, 12))).toEqual([]);
  });

  it('read: the number is the unknown the picture shows', () => {
    const c: Groups = { ...groups, mode: 'read', unknown: 'total' };
    expect(groupsAnswerIssues(c, { kind: 'number', value: 12 })).toEqual([]);
    expect(groupsAnswerIssues(c, { kind: 'number', value: 7 })).toEqual([
      'the picture shows 12, the answer is 7',
    ]);
    expect(groupsAnswerIssues(c, equalTarget(c, 12))).toEqual(['read answers a number']);
  });

  it('the answer always fits the answer control', () => {
    for (const unknown of ['total', 'size', 'groups'] as const) {
      for (let g = 1; g <= GROUPS_MAX; g += 1) {
        for (let n = 1; n <= GROUP_CAPACITY; n += 1) {
          const c: Groups = { ...groups, groups: g, perGroup: n, maxGroups: 6, unknown };
          const want = unknown === 'total' ? g * n : unknown === 'size' ? n : g;
          expect(want).toBeLessThanOrEqual(groupsAnswerMax(c));
        }
      }
    }
  });
});
