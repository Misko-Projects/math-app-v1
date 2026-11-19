// Regression tests for the U04 (#13) format models from cross-model review round 1 of PR #72.

import type { ItemFormat, WidgetAction, WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import { areaTiles } from './area-tiles';
import { baseTenBuild, exactReachable } from './base-ten-build';
import { baseTenTrade } from './base-ten-trade';
import { equalGroups } from './equal-groups';
import { equalShare } from './equal-share';
import { cardsReach, expandedForm } from './expanded-form';
import type { FormatModel, FormatState } from './types';

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };

// biome-ignore lint/suspicious/noExplicitAny: the helpers serve models of different formats.
type AnyModel = FormatModel<any, any>;

const issuePaths = (m: AnyModel, c: unknown): string[] => {
  const r = m.configSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

function play<F extends ItemFormat, S extends FormatState<F>>(
  m: FormatModel<F, S>,
  c: WidgetConfigOf<F>,
  ops: WidgetAction[],
): S {
  return ops.reduce((s, a) => m.apply(s, a), m.initialState(c));
}

const pass = (
  id: Parameters<typeof stateChecker>[0],
  target: Record<string, unknown>,
  r: unknown,
) => {
  const res = r as { kind: string; value: Record<string, unknown> } | null;
  return res?.kind === 'state' && stateChecker(id)?.check(target, res.value) === true;
};

const build34: WidgetConfigOf<'base-ten-build'> = {
  format: 'base-ten-build',
  target: 34,
  mode: 'build-exact',
  pieces: { thousands: false, hundreds: false, tens: true, ones: true },
  exact: { tens: 2 },
  wholeIs: 'unit',
};

describe('base-ten-build config feasibility', () => {
  it('rejects exact counts that no mat can complete (34 with exactly 3 ones)', () => {
    expect(issuePaths(baseTenBuild, { ...build34, exact: { ones: 3 } })).toEqual(['exact']);
    expect(exactReachable({ ...build34, exact: { ones: 3 } })).toBe(false);
    expect(issuePaths(baseTenBuild, build34)).toEqual([]);
    // 34 with exactly 4 ones: 3 tens complete it.
    expect(issuePaths(baseTenBuild, { ...build34, exact: { ones: 4 } })).toEqual([]);
    // Both kinds named: they must add up exactly.
    expect(issuePaths(baseTenBuild, { ...build34, exact: { tens: 2, ones: 13 } })).toEqual([
      'exact',
    ]);
    expect(issuePaths(baseTenBuild, { ...build34, exact: { tens: 2, ones: 14 } })).toEqual([]);
  });

  it('rejects a target of 0, which no mat could submit', () => {
    expect(issuePaths(baseTenBuild, { ...build34, mode: 'build', target: 0 })).toEqual(['target']);
  });
});

describe('base-ten-trade', () => {
  const add: WidgetConfigOf<'base-ten-trade'> = {
    format: 'base-ten-trade',
    start: { hundreds: 9, tens: 9, ones: 0 },
    operation: { op: '+', operand: { hundreds: 0, tens: 1, ones: 0 } },
    goal: 'compute',
    showAlgorithm: false,
    thenAsk: false,
  };

  it('accepts 990 + 10 = 1,000 as ten hundreds on the mat', () => {
    expect(issuePaths(baseTenTrade, add)).toEqual([]);
    const r = baseTenTrade.toResponse(
      play(baseTenTrade, add, [act('combine'), act('trade', { from: 'tens', to: 'hundreds' })]),
    );
    expect(r).toEqual({ kind: 'state', value: { hundreds: 10, tens: 0, ones: 0 } });
    expect(pass('trade.result', { result: 1000 }, r)).toBe(true);
    expect(
      issuePaths(baseTenTrade, {
        ...add,
        operation: { op: '+', operand: { hundreds: 0, tens: 1, ones: 1 } },
      }),
    ).toEqual(['operation']);
  });

  it('leaves an unasked typed value out of the answer', () => {
    const r = baseTenTrade.toResponse(
      play(baseTenTrade, add, [act('combine'), act('answer', { value: 1000 })]),
    );
    expect(r).toEqual({ kind: 'state', value: { hundreds: 9, tens: 10, ones: 0 } });
    const asked = baseTenTrade.toResponse(
      play(baseTenTrade, { ...add, thenAsk: true }, [
        act('combine'),
        act('answer', { value: 1000 }),
      ]),
    );
    expect(asked).toMatchObject({ value: { value: 1000 } });
  });
});

describe('equal-groups', () => {
  it('builds MUL.11 groups of 30 (4 × 30)', () => {
    const c: WidgetConfigOf<'equal-groups'> = {
      format: 'equal-groups',
      groups: 4,
      perGroup: 30,
      unknown: 'total',
      mode: 'build',
      container: 'basket',
      sprite: 'shell',
      maxGroups: 6,
    };
    expect(issuePaths(equalGroups, c)).toEqual([]);
    const r = equalGroups.toResponse(
      play(equalGroups, c, [
        ...[0, 1, 2, 3].map((i) => act('fill-group', { index: i, count: 30 })),
        act('answer', { value: 120 }),
      ]),
    );
    expect(pass('groups.equal', { groups: 4, perGroup: 30, value: 120 }, r)).toBe(true);
  });
});

describe('equal-share', () => {
  const seven: WidgetConfigOf<'equal-share'> = {
    format: 'equal-share',
    items: 7,
    recipients: 3,
    sprite: 'shell',
    recipientsKind: 'pebbling',
    allowLeftover: true,
    ask: 'each',
  };

  it('setting aside too early does nothing, so the share can still be finished', () => {
    const s = play(equalShare, seven, [
      act('deal-round'),
      act('set-aside-leftover'),
      act('deal-round'),
      act('set-aside-leftover'),
      act('answer', { value: 2 }),
    ]);
    expect(s.shares).toEqual([2, 2, 2]);
    expect(s.seagull).toBe(1);
    expect(
      pass(
        'share.fair',
        { items: 7, recipients: 3, allowLeftover: true, value: 2 },
        equalShare.toResponse(s),
      ),
    ).toBe(true);
  });
});

describe('area-tiles', () => {
  it('rejects a one-cell partition, which has no line to draw', () => {
    expect(
      issuePaths(areaTiles, {
        format: 'area-tiles',
        region: { w: 1, h: 1, mask: '1' },
        mode: 'partition',
        gridShown: true,
        sideLabels: false,
        unit: 'sq-units',
        decimalGrid: false,
      }),
    ).toEqual(['region']);
  });
});

describe('expanded-form', () => {
  it('checks a large card set promptly', () => {
    const started = performance.now();
    expect(cardsReach(new Array<number>(40).fill(2), 79)).toBe(false);
    expect(cardsReach([...new Array<number>(40).fill(2), 1], 79)).toBe(true);
    expect(performance.now() - started).toBeLessThan(200);
    expect(
      issuePaths(expandedForm, {
        format: 'expanded-form',
        target: 79,
        mode: 'build',
        cards: new Array<number>(40).fill(2),
        unusualOrder: false,
      }),
    ).toEqual(['cards']);
  });

  it('fill: place-card with remove empties one blank', () => {
    const fill: WidgetConfigOf<'expanded-form'> = {
      format: 'expanded-form',
      target: 345,
      mode: 'fill',
      expression: {
        tokens: [
          { t: 'blank', id: 'h' },
          { t: 'op', v: '+' },
          { t: 'blank', id: 't' },
          { t: 'op', v: '+' },
          { t: 'num', v: 5 },
        ],
      },
      cards: [300, 40],
      unusualOrder: false,
    };
    const s = play(expandedForm, fill, [
      act('place-card', { value: 300 }),
      act('place-card', { value: 40 }),
      act('place-card', { remove: true, blank: 'h' }),
    ]);
    expect(s.entries).toEqual([null, 40]);
    expect(expandedForm.toResponse(s)).toBeNull();
    // The next card fills the emptied blank.
    expect(expandedForm.apply(s, act('place-card', { value: 300 })).entries).toEqual([300, 40]);
  });
});
