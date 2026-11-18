import { describe, expect, it } from 'vitest';
import { endVariantKey, expandSlot, parseSlotToken, SlotError } from './slots';

const expand = (token: string, vars: Record<string, string | number>) => {
  const t = parseSlotToken(token);
  if (!t) throw new Error(`bad token ${token}`);
  return expandSlot(t, vars);
};

describe('parseSlotToken (03 §8.4 token shape)', () => {
  it.each([
    ['$a', { name: 'a' }],
    ['$n|num', { name: 'n', type: 'num' }],
    ['$item|noun:n', { name: 'item', type: 'noun', suffix: 'n' }],
    ['$h|dec:1', { name: 'h', type: 'dec', suffix: '1' }],
    ['$k|dec:2', { name: 'k', type: 'dec', suffix: '2' }],
  ])('parses %s', (token, expected) => {
    expect(parseSlotToken(token)).toEqual(expected);
  });

  it.each([
    'a',
    '$',
    '$1a',
    '$a|nope',
    '$a|noun', // counted types need a count var
    '$a|dec', // dec needs its places
    '$a|dec:3',
    '$a|num:n', // num takes no suffix
  ])('rejects %s', (token) => {
    expect(parseSlotToken(token)).toBeNull();
  });
});

describe('expandSlot (03 §8.3 typed slots)', () => {
  it('composes numbers through the shared numberClips, full range', () => {
    expect(expand('$n', { n: 23 })).toEqual(['num.23']);
    expect(expand('$n', { n: 12_345 })).toEqual([
      'num.12',
      'num.thousand',
      'num.3',
      'num.hundred',
      'num.45',
    ]);
    expect(expand('$n|num', { n: -4 })).toEqual(['num.negative', 'num.4']);
    expect(expand('$n', { n: 1_000_000 })).toEqual(['num.1', 'num.million']);
    expect(expand('$n', { n: '305' })).toEqual(['num.3', 'num.hundred', 'num.5']);
  });

  it('refuses free text and out-of-range numbers', () => {
    expect(() => expand('$n', { n: 'banana' })).toThrow(SlotError);
    expect(() => expand('$n', { n: 1_000_001 })).toThrow(SlotError);
    expect(() => expand('$n', { n: 2.5 })).toThrow(SlotError);
    expect(() => expand('$n', {})).toThrow(/no value/);
  });

  it('digits, ordinals and cents', () => {
    expect(expand('$v|digits', { v: 345 })).toEqual(['num.3', 'num.4', 'num.5']);
    expect(expand('$v|ord', { v: 21 })).toEqual(['ord.21']);
    expect(() => expand('$v|ord', { v: 32 })).toThrow(SlotError);
    expect(expand('$v|cents', { v: 1 })).toEqual(['num.1', 'money.cent.one']);
    expect(expand('$v|cents', { v: 25 })).toEqual(['num.25', 'money.cent.many']);
  });

  it('dollars', () => {
    expect(expand('$v|dollars', { v: 125 })).toEqual([
      'num.1',
      'money.dollar.one',
      'word.and',
      'num.25',
      'money.cent.many',
    ]);
    expect(expand('$v|dollars', { v: 300 })).toEqual(['num.3', 'money.dollar.many']);
    expect(expand('$v|dollars', { v: 201 })).toEqual([
      'num.2',
      'money.dollar.many',
      'word.and',
      'num.1',
      'money.cent.one',
    ]);
    // Under a dollar, the cents are read alone.
    expect(expand('$v|dollars', { v: 25 })).toEqual(['num.25', 'money.cent.many']);
    expect(expand('$v|dollars', { v: 0 })).toEqual(['num.0', 'money.dollar.many']);
  });

  it('time', () => {
    expect(expand('$t|time', { t: '7:00' })).toEqual(['num.7', 'time.oclock']);
    expect(expand('$t|time', { t: '7:05' })).toEqual(['num.7', 'time.oh', 'num.5']);
    expect(expand('$t|time', { t: '7:45' })).toEqual(['num.7', 'num.45']);
    expect(expand('$t|time', { t: '12:30 pm' })).toEqual(['num.12', 'num.30', 'time.pm']);
    expect(() => expand('$t|time', { t: '7:5' })).toThrow(SlotError);
    expect(() => expand('$t|time', { t: '7:60' })).toThrow(SlotError);
  });

  it('fractions', () => {
    expect(expand('$f|frac', { f: '1/2' })).toEqual(['num.1', 'den.2.one']);
    expect(expand('$f|frac', { f: '3/4' })).toEqual(['num.3', 'den.4.many']);
    expect(expand('$f|frac', { f: '3/1' })).toEqual(['num.3', 'den.1.many']);
    expect(() => expand('$f|frac', { f: '3/0' })).toThrow(SlotError);
  });

  it('decimals read as fractions, places from the suffix', () => {
    expect(expand('$v|dec:1', { v: 30 })).toEqual(['num.3', 'den.10.many']);
    expect(expand('$v|dec:2', { v: 47 })).toEqual(['num.47', 'den.100.many']);
    expect(expand('$v|dec:2', { v: 250 })).toEqual(['num.2', 'word.and', 'num.50', 'den.100.many']);
    expect(expand('$v|dec:2', { v: 1 })).toEqual(['num.1', 'den.100.one']);
    expect(expand('$v|dec:1', { v: 200 })).toEqual(['num.2']);
    expect(() => expand('$v|dec:1', { v: 35 })).toThrow(/whole tenth/);
  });

  it('counted nouns, units and shapes pick .one or .many from the count var', () => {
    expect(expand('$item|noun:n', { item: 'plank', n: 1 })).toEqual(['noun.plank.one']);
    expect(expand('$item|noun:n', { item: 'plank', n: 4 })).toEqual(['noun.plank.many']);
    expect(expand('$u|unit:n', { u: 'cm', n: 0 })).toEqual(['unit.cm.many']);
    expect(expand('$s|shape:n', { s: 'triangle', n: '1' })).toEqual(['shape.triangle.one']);
    expect(() => expand('$item|noun:n', { item: 'plank' })).toThrow(/count variable/);
    expect(() => expand('$item|noun:n', { item: 'two words', n: 1 })).toThrow(SlotError);
  });

  it('resident names and closed words', () => {
    expect(expand('$who|name', { who: 'shelly' })).toEqual(['res.shelly']);
    expect(expand('$w|word', { w: 'even' })).toEqual(['word.even']);
    expect(() => expand('$who|name', { who: '@resident' })).toThrow(SlotError);
  });
});

describe('endVariantKey', () => {
  it('applies to number words only', () => {
    expect(endVariantKey('num.23')).toBe('num.23.end');
    expect(endVariantKey('num.hundred')).toBe('num.hundred.end');
    expect(endVariantKey('money.cent.many')).toBeNull();
    expect(endVariantKey('num.negative')).toBeNull();
  });
});
