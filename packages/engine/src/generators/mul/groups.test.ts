// K02 slice 3a generators (03 §5.6): mul.groups, parity.evenodd and geo.partition. Over the whole
// range each format allows (a factor of 1, square arrays, both orders): the item builds, its worked
// solution replays to a correct response, and the answer is the one the params ask; the bounds are
// exactly the formats'. Also the two equal-groups misconception rules.

import type {
  GeneratedItem,
  ItemFormat,
  ItemTemplate,
  ParamValues,
  Representation,
  Tier,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../../content/binding';
import { AREA_WORK_H_MAX, AREA_WORK_W_MAX } from '../../formats/area-tiles';
import { ARRAY_SIDE_MAX } from '../../formats/array-build';
import { GROUP_CAPACITY, GROUPS_MAX, groupsPileMax } from '../../formats/equal-groups';
import { checkResponse } from '../../items/check';
import { generateItemFromParams } from '../../items/generate';
import { itemSolution, replaySteps } from '../../items/solution';
import { addInsteadOfMultiply, skipCountSlip } from '../../misconceptions/rules/multiplication';
import { geoPartition } from '../geo/partition';
import { PARITY_N_MAX, parityEvenOdd } from '../parity/evenodd';
import { MUL_LINE_MAX, mulExpression, mulGroups } from './groups';

let nextId = 0;
const tpl = (
  generator: string,
  format: ItemFormat,
  tier: Tier,
  representation: Representation,
): ItemTemplate => {
  nextId += 1;
  return {
    id: `T.${generator}.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier,
    representation,
    generator,
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
  } as ItemTemplate;
};

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

/** Builds the item and checks its worked solution and example are correct. */
function solved(t: ItemTemplate, params: ParamValues): GeneratedItem {
  const item = generateItemFromParams(t, params, { checkConstraints: false });
  const replayed = replaySteps(item, itemSolution(item, t));
  expect(
    replayed && checkResponse(item, replayed).correct,
    `${t.format} ${JSON.stringify(params)}`,
  ).toBe(true);
  return item;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

describe('mul.groups', () => {
  const cases: [ItemFormat, Tier, Representation, string, string][] = [
    ['equal-groups', 'concrete', 'groups', 'total', 'read'],
    ['equal-groups', 'concrete', 'groups', 'total', 'build'],
    ['equal-groups', 'concrete', 'groups', 'size', 'build'],
    ['equal-groups', 'concrete', 'groups', 'groups', 'build'],
    ['array-build', 'concrete', 'array', 'total', 'build'],
    ['array-build', 'pictorial', 'tiles', 'total', 'read'],
    ['dot-flash', 'pictorial', 'groups', 'total', 'read'],
    ['dot-flash', 'pictorial', 'array', 'total', 'read'],
    ['dot-flash', 'pictorial', 'dots', 'total', 'read'],
    ['number-line-jump', 'pictorial', 'number-line', 'total', 'read'],
    ['number-line-jump', 'pictorial', 'number-line', 'groups', 'read'],
    ['number-pad', 'pictorial', 'objects', 'total', 'read'],
    ['number-pad', 'pictorial', 'objects', 'groups', 'read'],
    ['number-pad', 'pictorial', 'array', 'size', 'read'],
    ['number-pad', 'pictorial', 'number-line', 'total', 'read'],
    ['number-pad', 'abstract', 'symbols', 'total', 'read'],
    ['number-pad', 'abstract', 'symbols', 'size', 'read'],
  ];
  it.each(cases)(
    '%s %s %s, %s (%s): every accepted draw solves',
    (format, tier, rep, unknown, mode) => {
      const t = tpl('mul.groups', format, tier, rep);
      let built = 0;
      for (const groups of range(1, 10)) {
        for (const perGroup of range(1, 10)) {
          for (const signs of [false, true]) {
            const p = { groups, perGroup, unknown, mode, signs, result: groups * perGroup };
            if (!mulGroups.accepts?.(p, t)) continue;
            const item = solved(t, { groups, perGroup, unknown, mode, signs });
            const want =
              unknown === 'size' ? perGroup : unknown === 'groups' ? groups : groups * perGroup;
            const a = item.answer;
            if (a.kind === 'number') expect(a.value).toBe(want);
            built += 1;
          }
        }
      }
      expect(built).toBeGreaterThan(0);
    },
  );

  it('bounds: the formats decide the largest group, array, pile and line', () => {
    const eg = tpl('mul.groups', 'equal-groups', 'concrete', 'groups');
    const at = (p: ParamValues) =>
      mulGroups.accepts?.({ ...p, result: Number(p.groups) * Number(p.perGroup) }, eg);
    expect(
      at({ groups: GROUPS_MAX, perGroup: GROUP_CAPACITY, unknown: 'total', mode: 'read' }),
    ).toBe(true);
    expect(at({ groups: GROUPS_MAX + 1, perGroup: 2, unknown: 'total', mode: 'read' })).toBe(false);
    expect(at({ groups: 2, perGroup: GROUP_CAPACITY + 1, unknown: 'total', mode: 'read' })).toBe(
      false,
    );
    // Reading only shows a total; the size or the number of groups is built.
    expect(at({ groups: 3, perGroup: 4, unknown: 'size', mode: 'read' })).toBe(false);
    // A pile to share beside four containers holds up to 40, beside five up to 20.
    expect(groupsPileMax(4)).toBe(40);
    expect(at({ groups: 4, perGroup: 10, unknown: 'size', mode: 'build' })).toBe(true);
    expect(at({ groups: 5, perGroup: 5, unknown: 'size', mode: 'build' })).toBe(false);
    const ab = tpl('mul.groups', 'array-build', 'concrete', 'array');
    const arr = (g: number, q: number) =>
      mulGroups.accepts?.({ groups: g, perGroup: q, unknown: 'total' }, ab);
    expect(arr(ARRAY_SIDE_MAX, ARRAY_SIDE_MAX)).toBe(true);
    expect(arr(ARRAY_SIDE_MAX + 1, 2)).toBe(false);
    const nl = tpl('mul.groups', 'number-line-jump', 'pictorial', 'number-line');
    const line = (g: number, q: number) =>
      mulGroups.accepts?.({ groups: g, perGroup: q, unknown: 'total', result: g * q }, nl);
    expect(line(10, 10)).toBe(true);
    expect(MUL_LINE_MAX).toBe(100);
    expect(line(11, 10)).toBe(false);
    // Sharing has no line: a jump item makes groups or finds a total.
    expect(mulGroups.accepts?.({ groups: 2, perGroup: 3, unknown: 'size', result: 6 }, nl)).toBe(
      false,
    );
  });

  it('writes × and ÷ only with signs, and the total as equal addends without', () => {
    expect(mulExpression(3, 4, 'total', false)?.map((x) => ('v' in x ? x.v : x.t))).toEqual([
      4,
      '+',
      4,
      '+',
      4,
      '=',
      'blank',
    ]);
    expect(mulExpression(3, 4, 'total', true)?.map((x) => ('v' in x ? x.v : x.t))).toEqual([
      3,
      '×',
      4,
      '=',
      'blank',
    ]);
    expect(mulExpression(3, 4, 'size', true)?.map((x) => ('v' in x ? x.v : x.t))).toEqual([
      12,
      '÷',
      3,
      '=',
      'blank',
    ]);
    expect(mulExpression(3, 4, 'groups', true)?.map((x) => ('v' in x ? x.v : x.t))).toEqual([
      12,
      '÷',
      4,
      '=',
      'blank',
    ]);
    expect(mulExpression(3, 4, 'size', false)).toBeNull();
  });

  it('a jump item that asks the total does not label the landing', () => {
    const t = tpl('mul.groups', 'number-line-jump', 'pictorial', 'number-line');
    const item = solved(t, { groups: 4, perGroup: 5, unknown: 'total' });
    expect(item.widget.format === 'number-line-jump' && item.widget.labelsEvery).toBeNull();
  });
});

describe('parity.evenodd', () => {
  it('every n from 1 to 20 solves on each format, and says even or odd rightly', () => {
    const fmts: [ItemFormat, Tier, Representation, ParamValues][] = [
      ['equal-share', 'concrete', 'objects', { ask: 'even-odd' }],
      ['equal-share', 'concrete', 'groups', { ask: 'leftover' }],
      ['number-pad', 'pictorial', 'ten-frame', {}],
      ['shape-sort', 'pictorial', 'symbols', { cards: 4, find: 'even' }],
      ['shape-sort', 'pictorial', 'symbols', { cards: 6, find: 'odd' }],
    ];
    for (const [format, tier, rep, extra] of fmts) {
      const t = tpl('parity.evenodd', format, tier, rep);
      for (const n of range(1, PARITY_N_MAX)) {
        const p = { n, ...extra };
        if (!parityEvenOdd.accepts?.(p, t)) continue;
        const item = solved(t, p);
        const a = item.answer;
        if (a.kind === 'choice') expect(a.id).toBe(n % 2 === 0 ? 'even' : 'odd');
        if (a.kind === 'number') expect(a.value).toBe(n % 2);
      }
    }
    const pad = tpl('parity.evenodd', 'number-pad', 'pictorial', 'ten-frame');
    expect(parityEvenOdd.accepts?.({ n: PARITY_N_MAX + 1 }, pad)).toBe(false);
    const sort = tpl('parity.evenodd', 'shape-sort', 'pictorial', 'symbols');
    expect(parityEvenOdd.accepts?.({ n: 8, cards: 7 }, sort)).toBe(false);
    expect(parityEvenOdd.accepts?.({ n: 3, cards: 4 }, sort)).toBe(false);
  });
});

describe('geo.partition', () => {
  it('every rectangle the formats allow solves, rows × cols squares', () => {
    const fmts: [ItemFormat, Tier, Representation, string, number, number][] = [
      ['area-tiles', 'concrete', 'area-grid', 'partition', AREA_WORK_H_MAX, AREA_WORK_W_MAX],
      ['area-tiles', 'concrete', 'tiles', 'tile', AREA_WORK_H_MAX, AREA_WORK_W_MAX],
      ['array-build', 'pictorial', 'array', 'read', ARRAY_SIDE_MAX, ARRAY_SIDE_MAX],
      ['number-pad', 'abstract', 'symbols', 'read', ARRAY_SIDE_MAX, ARRAY_SIDE_MAX],
    ];
    for (const [format, tier, rep, mode, maxR, maxC] of fmts) {
      const t = tpl('geo.partition', format, tier, rep);
      for (const rows of range(1, maxR + 1)) {
        for (const cols of range(1, maxC + 1)) {
          const p = { rows, cols, mode, result: rows * cols };
          const ok = geoPartition.accepts?.(p, t);
          const inside = rows <= maxR && cols <= maxC && !(mode === 'partition' && rows * cols < 2);
          expect(ok, `${format} ${rows}×${cols}`).toBe(inside);
          if (!ok) continue;
          const item = solved(t, { rows, cols, mode });
          if (item.answer.kind === 'number') expect(item.answer.value).toBe(rows * cols);
        }
      }
    }
  });
});

describe('equal-groups misconception rules', () => {
  const read = tpl('mul.groups', 'equal-groups', 'concrete', 'groups');
  const build = tpl('mul.groups', 'equal-groups', 'concrete', 'groups');
  it('add-instead-of-multiply: 4 groups of 3 → 7; never when the sum is the product', () => {
    const item = generateItemFromParams(build, {
      groups: 4,
      perGroup: 3,
      unknown: 'total',
      mode: 'build',
    });
    expect(addInsteadOfMultiply.predict?.(item)).toEqual({
      kind: 'state',
      value: { groups: [3, 3, 3, 3], value: 7 },
    });
    const square = generateItemFromParams(read, {
      groups: 2,
      perGroup: 2,
      unknown: 'total',
      mode: 'read',
    });
    expect(addInsteadOfMultiply.predict?.(square)).toBeNull();
    expect(addInsteadOfMultiply.match(square, { kind: 'number', value: 4 })).toBe(false);
    const share = generateItemFromParams(build, {
      groups: 3,
      perGroup: 4,
      unknown: 'size',
      mode: 'build',
    });
    expect(addInsteadOfMultiply.applies?.(share)).toBe(false);
  });
  it('skip-count-slip: one group too few or too many, in either order of the factors', () => {
    const item = generateItemFromParams(read, {
      groups: 4,
      perGroup: 5,
      unknown: 'total',
      mode: 'read',
    });
    expect(skipCountSlip.predict?.(item)).toEqual({ kind: 'number', value: 15 });
    for (const v of [15, 25, 16, 24])
      expect(skipCountSlip.match(item, { kind: 'number', value: v })).toBe(true);
    expect(skipCountSlip.match(item, { kind: 'number', value: 9 })).toBe(false);
    const one = generateItemFromParams(read, {
      groups: 1,
      perGroup: 5,
      unknown: 'total',
      mode: 'read',
    });
    expect(skipCountSlip.predict?.(one)).toBeNull();
  });
});
