import { describe, expect, it } from 'vitest';
import type { ConfigFor } from '../types';
import {
  blanks,
  capacityOf,
  entryMax,
  fillResponse,
  homes,
  missingSlot,
  movesToSplit,
  poolColumns,
  splitResponse,
} from './bond';

const bond = (over: Partial<ConfigFor<'number-bond'>>): ConfigFor<'number-bond'> => ({
  format: 'number-bond',
  whole: 5,
  parts: [4, null],
  mode: 'missing-part',
  counters: false,
  nonZero: false,
  ...over,
});

describe('number-bond logic', () => {
  it('finds the blanks and the asked slot', () => {
    expect(blanks(bond({}))).toEqual(['part-1']);
    expect(missingSlot(bond({}))).toBe('part-1');
    const mw = bond({ whole: null, parts: [3, 1], mode: 'missing-whole' });
    expect(blanks(mw)).toEqual(['whole']);
    expect(missingSlot(mw)).toBe('whole');
    expect(blanks(bond({ parts: [null, null], mode: 'split' }))).toEqual(['part-0', 'part-1']);
  });

  it('puts counters in the parts for missing-whole, else in the whole', () => {
    const mw = bond({ whole: null, parts: [3, 1], mode: 'missing-whole', counters: true });
    expect(homes(mw)).toEqual(['part-0', 'part-0', 'part-0', 'part-1']);
    expect(capacityOf(mw, 'whole')).toBe(4);
    expect(capacityOf(mw, 'part-1')).toBe(1);
    expect(homes(bond({ whole: 7, parts: [null, null], mode: 'split' }))).toHaveLength(7);
    expect(capacityOf(bond({ whole: 7, parts: [null, null], mode: 'split' }), 'part-0')).toBe(7);
    expect([1, 3, 4, 6, 7, 10].map(poolColumns)).toEqual([1, 3, 4, 5, 5, 5]);
  });

  it('offers 0 … whole, or 0–10 / 0–20 when the whole is asked', () => {
    expect(entryMax(bond({}))).toBe(5);
    expect(entryMax(bond({ whole: null, parts: [3, 1], mode: 'missing-whole' }))).toBe(10);
    expect(entryMax(bond({ whole: null, parts: [8, 5], mode: 'missing-whole' }))).toBe(20);
  });

  it('answers through the model', () => {
    expect(fillResponse(bond({}), { 'part-1': 1 })).toEqual({ kind: 'number', value: 1 });
    expect(fillResponse(bond({}), {})).toBeNull();
    const split = bond({ whole: 7, parts: [null, null], mode: 'split' });
    expect(fillResponse(split, { 'part-0': 3, 'part-1': 4 })).toEqual({
      kind: 'state',
      value: { parts: [3, 4] },
    });
    expect(fillResponse(split, { 'part-0': 3 })).toBeNull();
    expect(splitResponse(split, ['part-0', 'whole', 'part-1', 'part-1'])).toEqual({
      kind: 'state',
      value: { parts: [1, 2] },
    });
  });

  it('plans the moves that split the counters', () => {
    expect(movesToSplit(['whole', 'whole', 'whole'], { 'part-0': 1, 'part-1': 2 })).toEqual([
      { id: 0, to: 'part-0' },
      { id: 1, to: 'part-1' },
      { id: 2, to: 'part-1' },
    ]);
    expect(movesToSplit(['part-0', 'part-0', 'whole'], { 'part-0': 1 })).toEqual([
      { id: 1, to: 'whole' },
    ]);
  });
});
