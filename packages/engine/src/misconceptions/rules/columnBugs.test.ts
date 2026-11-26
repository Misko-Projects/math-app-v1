// The column bugs over several addends (MDA.04, PR #125 review): forgot-to-regroup-add drops every
// ten the ones make, not just one.

import type { GeneratedItem } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { columnBug, forgotToRegroupAdd } from './columnBugs';

const item = (params: GeneratedItem['params']): GeneratedItem =>
  ({ params, answer: { kind: 'number', value: 0 } }) as unknown as GeneratedItem;

describe('MC.forgot-to-regroup-add over several addends', () => {
  it('drops two tens for 19 + 18 + 26 and three for 19 + 18 + 26 + 17', () => {
    expect(
      columnBug('forgotToRegroupAdd', item({ a: 19, b: 18, c: 26, addends: 3, op: '+' })),
    ).toEqual({
      v: 63,
      r: 43,
    });
    expect(
      columnBug('forgotToRegroupAdd', item({ a: 19, b: 18, c: 26, d: 17, addends: 4, op: '+' })),
    ).toEqual({ v: 80, r: 50 });
  });

  it('ignores c and d unless addends asks for them, and needs a carry', () => {
    expect(columnBug('forgotToRegroupAdd', item({ a: 47, b: 38, c: 99, op: '+' }))).toEqual({
      v: 85,
      r: 75,
    });
    expect(columnBug('forgotToRegroupAdd', item({ a: 34, b: 25, op: '+' }))).toBeNull();
    expect(forgotToRegroupAdd.id).toBe('forgotToRegroupAdd');
  });

  it('subtraction bugs: smaller from larger and a borrow that never reduces the tens', () => {
    expect(columnBug('smallerFromLarger', item({ a: 52, b: 27, op: '-' }))).toEqual({
      v: 25,
      r: 35,
    });
    expect(columnBug('borrowNoDecrement', item({ a: 53, b: 27, op: '-' }))).toEqual({
      v: 26,
      r: 36,
    });
    expect(columnBug('smallerFromLarger', item({ a: 57, b: 22, op: '-' }))).toBeNull();
    expect(
      columnBug('smallerFromLarger', item({ a: 80, b: 44, op: '-', unknown: 'change' })),
    ).toBeNull();
  });
});
