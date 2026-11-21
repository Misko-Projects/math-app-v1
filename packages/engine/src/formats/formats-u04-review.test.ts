// Regression tests for the U04 (#13) format models from cross-model review round 1 of PR #72.

import type { ItemFormat, WidgetAction, WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import { areaTiles } from './area-tiles';
import { arrayBuild } from './array-build';
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

  it('checks 990 + 10 = 1,000 as ten hundreds on the mat', () => {
    // PR #74: the config schema now states the supported domain (domain-u04.test.ts), so an item
    // may not ask for this sum. The model and the checker still take the state as it is.
    expect(issuePaths(baseTenTrade, add)).toEqual(['operation', 'start.hundreds']);
    const r = baseTenTrade.toResponse(
      play(baseTenTrade, add, [act('combine'), act('trade', { from: 'tens', to: 'hundreds' })]),
    );
    expect(r).toEqual({ kind: 'state', value: { hundreds: 10, tens: 0, ones: 0 } });
    expect(pass('trade.result', { result: 1000 }, r)).toBe(true);
    // Round 2: the model and the checker have no 1,000 cap; extra hundreds just pile up. Items
    // that large (MDA.23, stretch) need the mat's layout reworked first: the schema rejects them.
    const big = {
      ...add,
      start: { hundreds: 12, tens: 0, ones: 0 },
      operation: { op: '+' as const, operand: { hundreds: 3, tens: 0, ones: 0 } },
    };
    expect(issuePaths(baseTenTrade, big)).toEqual(['start.hundreds', 'operation.operand.hundreds']);
    expect(
      pass(
        'trade.result',
        { result: 1500 },
        baseTenTrade.toResponse(play(baseTenTrade, big, [act('combine')])),
      ),
    ).toBe(true);
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

describe('review round 2 (s_837d2818b4af)', () => {
  it('base-ten-build: a tray of one ten builds 7 by splitting and putting ones back', () => {
    const c: WidgetConfigOf<'base-ten-build'> = {
      format: 'base-ten-build',
      target: 7,
      mode: 'build',
      pieces: { thousands: false, hundreds: false, tens: true, ones: false },
      limits: { tens: 1 },
      wholeIs: 'unit',
    };
    expect(issuePaths(baseTenBuild, c)).toEqual([]);
    const r = baseTenBuild.toResponse(
      play(baseTenBuild, c, [
        act('add-piece', { kind: 'tens' }),
        act('split', { kind: 'tens' }),
        act('add-piece', { kind: 'ones', count: -3 }),
      ]),
    );
    expect(pass('baseten.value', { value: 7 }, r)).toBe(true);
    // Exactly 7 ones, though the tray offers no ones: splitting makes them.
    expect(issuePaths(baseTenBuild, { ...c, mode: 'build-exact', exact: { ones: 7 } })).toEqual([]);
    // More than the tray and the prebuilt pieces hold together is still refused.
    expect(issuePaths(baseTenBuild, { ...c, target: 11 })).toEqual(['pieces']);
  });

  it('equal-share: nothing goes to the seagull while the shares are unequal', () => {
    const seven: WidgetConfigOf<'equal-share'> = {
      format: 'equal-share',
      items: 7,
      recipients: 3,
      sprite: 'shell',
      recipientsKind: 'pebbling',
      allowLeftover: true,
      ask: 'each',
    };
    const s = play(equalShare, seven, [
      act('deal-round'),
      act('deal', { to: 0 }),
      act('deal', { to: 1 }),
      act('set-aside-leftover'),
    ]);
    expect(s.shares).toEqual([2, 2, 1]);
    expect(s.pile).toBe(2);
    expect(s.seagull).toBe(0);
    const done = play(equalShare, seven, [
      act('deal-round'),
      act('deal', { to: 0 }),
      act('deal', { to: 1 }),
      act('set-aside-leftover'),
      act('deal', { to: 2 }),
      act('set-aside-leftover'),
      act('answer', { value: 2 }),
    ]);
    expect(
      pass(
        'share.fair',
        { items: 7, recipients: 3, allowLeftover: true, value: 2 },
        equalShare.toResponse(done),
      ),
    ).toBe(true);
  });

  it('array-build: build-dims fits turned when orientation is free', () => {
    const c: WidgetConfigOf<'array-build'> = {
      format: 'array-build',
      maxRows: 4,
      maxCols: 3,
      mode: 'build-dims',
      rows: 3,
      cols: 4,
      orientationMatters: false,
      sprite: 'shell',
      gridShown: true,
    };
    expect(issuePaths(arrayBuild, c)).toEqual([]);
    expect(issuePaths(arrayBuild, { ...c, orientationMatters: true })).toEqual(['rows']);
    const r = arrayBuild.toResponse(play(arrayBuild, c, [act('drag-rect', { rows: 4, cols: 3 })]));
    expect(pass('array.dims', { rows: 3, cols: 4, orientationMatters: false }, r)).toBe(true);
  });

  it('area-tiles: decompose needs two region cells, not just a wide box', () => {
    const one = {
      format: 'area-tiles',
      region: { w: 2, h: 1, mask: '10' },
      mode: 'decompose',
      gridShown: true,
      sideLabels: false,
      unit: 'sq-units',
      decimalGrid: false,
    };
    expect(issuePaths(areaTiles, one)).toEqual(['region']);
    expect(issuePaths(areaTiles, { ...one, region: { w: 2, h: 1, mask: '11' } })).toEqual([]);
  });
});

describe('review round 3 (s_7e4096989e85)', () => {
  it('base-ten-build: prebuilt pieces alone may be enough, with no tray', () => {
    const c: WidgetConfigOf<'base-ten-build'> = {
      format: 'base-ten-build',
      target: 10,
      mode: 'build-exact',
      pieces: { thousands: false, hundreds: false, tens: false, ones: false },
      exact: { ones: 10 },
      prebuilt: { hundreds: 0, tens: 1, ones: 0 },
      wholeIs: 'unit',
    };
    expect(issuePaths(baseTenBuild, c)).toEqual([]);
    const r = baseTenBuild.toResponse(play(baseTenBuild, c, [act('split', { kind: 'tens' })]));
    expect(pass('baseten.exact', { value: 10, exact: { ones: 10 } }, r)).toBe(true);
    // Nothing on the mat and nothing in the tray: refused.
    expect(issuePaths(baseTenBuild, { ...c, prebuilt: undefined })).toEqual(['pieces']);
  });

  it('tiles.cover exempts a split taken away only while the rest still decomposes', () => {
    const exempt = stateChecker('tiles.cover')?.exempt;
    if (!exempt) throw new Error('tiles.cover has no exemption');
    const target = { mask: '111111', w: 3, h: 2, decompose: true, value: 6 };
    const two = {
      splits: [
        { dir: 'v', at: 1 },
        { dir: 'v', at: 2 },
      ],
      value: 6,
    };
    expect(exempt(target, two, { splits: [{ dir: 'v', at: 1 }], value: 6 })).toBe(true);
    const one = { splits: [{ dir: 'v', at: 1 }], value: 6 };
    expect(exempt(target, one, { splits: [], value: 6 })).toBe(false);
    expect(exempt({ mask: '111111', value: 6 }, one, { splits: [], value: 6 })).toBe(false);
  });
});
