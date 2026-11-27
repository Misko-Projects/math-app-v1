// 03 §8.4 display formatting (`render`, `lineSlots`) and the 03 §5.2 constraint grammar
// (`constraintHolds`, `ExprError`).

import type { NarrationJson } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from './binding';
import { constraintHolds, ExprError } from './expr';
import { lineSlots, render } from './render';

const line = (text: string, say?: string) => (say ? { text, say, clips: [] } : { text, clips: [] });

const NARRATION: NarrationJson = {
  'l.num': line('You have {n} shells.'),
  'l.typed-num': line('{n|num} and {k|ord}'),
  'l.digits': line('Code {n|digits}'),
  'l.cents': line('It costs {c|cents}.'),
  'l.dollars': line('It costs {c|dollars}.'),
  'l.time': line('It is {t|time}.'),
  'l.frac': line('Shade {f|frac}.'),
  'l.fracw': line('Put {f|fracw} here.'),
  'num.1': line('one'),
  'num.7': line('seven'),
  'den.2.one': line('half'),
  'den.4.many': line('fourths'),
  'l.dec1': line('{v|dec:1}'),
  'l.dec2': line('{v|dec:2}'),
  'l.noun': line('{n} {item|noun:n}'),
  'l.unit': line('{n} {u|unit:n}'),
  'l.shape': line('{n} {s|shape:n}'),
  'l.name': line('{who|name} found it.'),
  'l.word': line('Is it {w|word}?'),
  'l.brace': line('Use {{braces}} and {n}.'),
  'l.say': line('{a} plus {b}', 'What is {a} plus {b}? Count {item|noun:n}.'),
  'noun.shell.one': line('shell'),
  'noun.shell.many': line('shells'),
  'unit.cm.one': line('centimeter'),
  'unit.cm.many': line('centimeters'),
  'shape.triangle.one': line('triangle'),
  'shape.triangle.many': line('triangles'),
  'res.nib': line('Nib'),
  'word.more': line('more'),
  'ord.2': line('second'),
};

const r = (key: string, vars: Record<string, string | number>) => render(key, vars, NARRATION);

beforeEach(() => resetContent());

describe('render: numbers', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1000, '1,000'],
    [12345, '12,345'],
    [1234567, '1,234,567'],
    [-1500, '-1,500'],
    [1234.5, '1,234.5'],
  ])('%s → %s (a thousands comma from 1,000)', (n, want) => {
    expect(r('l.num', { n })).toBe(`You have ${want} shells.`);
  });

  it('num slots group digits; digits never does', () => {
    expect(r('l.typed-num', { n: 2500, k: 3 })).toBe('2,500 and 3');
    expect(r('l.digits', { n: 12345 })).toBe('Code 12345');
  });

  it('an ord slot shows the position word of its ord.<n> clip, else the numeral', () => {
    expect(r('l.typed-num', { n: 1, k: 2 })).toBe('1 and second');
    expect(r('l.typed-num', { n: 1, k: 3 })).toBe('1 and 3');
  });

  it('a string var in an untyped slot is shown as is', () => {
    expect(r('l.num', { n: 'many' })).toBe('You have many shells.');
  });
});

describe('render: money, time, fractions, decimals', () => {
  it.each([
    [25, '25¢'],
    [5, '5¢'],
    [1500, '1,500¢'],
  ])('cents %s → %s', (c, want) => {
    expect(r('l.cents', { c })).toBe(`It costs ${want}.`);
  });

  it.each([
    [125, '$1.25'],
    [5, '$0.05'],
    [100, '$1.00'],
    [100000, '$1,000.00'],
  ])('dollars %s → %s', (c, want) => {
    expect(r('l.dollars', { c })).toBe(`It costs ${want}.`);
  });

  it('time and frac are shown as given', () => {
    expect(r('l.time', { t: '7:05' })).toBe('It is 7:05.');
    expect(r('l.frac', { f: '3/4' })).toBe('Shade 3/4.');
  });

  it('fracw shows the fraction in words, never a slash (#17 slice 5b)', () => {
    expect(r('l.fracw', { f: '7/4' })).toBe('Put seven fourths here.');
    expect(r('l.fracw', { f: '1/2' })).toBe('Put one half here.');
  });

  it.each([
    ['l.dec1', 30, '0.3'],
    ['l.dec1', 5, '0.1'], // 0.05 shown to one place
    ['l.dec1', 120, '1.2'],
    ['l.dec2', 47, '0.47'],
    ['l.dec2', 5, '0.05'],
    ['l.dec2', 250, '2.50'],
  ])('%s with %s hundredths → %s', (key, v, want) => {
    expect(r(key, { v })).toBe(want);
  });
});

describe('render: looked-up words', () => {
  it.each([
    [1, '1 shell'],
    [3, '3 shells'],
    [0, '0 shells'],
  ])('noun .one / .many by the count var (%s)', (n, want) => {
    expect(r('l.noun', { n, item: 'shell' })).toBe(want);
  });

  it('unit and shape use the same lookup', () => {
    expect(r('l.unit', { n: 1, u: 'cm' })).toBe('1 centimeter');
    expect(r('l.unit', { n: 4, u: 'cm' })).toBe('4 centimeters');
    expect(r('l.shape', { n: 1, s: 'triangle' })).toBe('1 triangle');
    expect(r('l.shape', { n: 2, s: 'triangle' })).toBe('2 triangles');
  });

  it('a string count var is read as a number', () => {
    expect(r('l.noun', { n: '1', item: 'shell' })).toBe('1 shell');
  });

  it('a missing lookup falls back to the raw value', () => {
    expect(r('l.noun', { n: 2, item: 'crab' })).toBe('2 crab');
    expect(r('l.name', { who: 'glim' })).toBe('glim found it.');
  });

  it('name → res.<id>, word → word.<id>', () => {
    expect(r('l.name', { who: 'nib' })).toBe('Nib found it.');
    expect(r('l.word', { w: 'more' })).toBe('Is it more?');
  });
});

describe('render: braces, missing keys and vars', () => {
  it('{{ and }} are literal braces', () => {
    expect(r('l.brace', { n: 2 })).toBe('Use {braces} and 2.');
  });

  it('a missing key returns the key', () => {
    expect(r('no.such.key', { n: 1 })).toBe('no.such.key');
  });

  it('a missing var leaves the slot as written', () => {
    expect(r('l.num', {})).toBe('You have {n} shells.');
    expect(r('l.cents', {})).toBe('It costs {c|cents}.');
    expect(r('l.noun', { n: 2 })).toBe('2 {item|noun:n}');
  });

  it('uses the bound narration by default', () => {
    expect(render('l.num', { n: 1000 })).toBe('l.num');
    initContent({ templates: [], narration: NARRATION, misconceptions: [] });
    expect(render('l.num', { n: 1000 })).toBe('You have 1,000 shells.');
    expect(render('l.brace')).toBe('Use {braces} and {n}.');
  });

  it('renders the display text, not the spoken form', () => {
    expect(r('l.say', { a: 2, b: 3, item: 'shell', n: 2 })).toBe('2 plus 3');
  });
});

describe('lineSlots', () => {
  it('lists slots from the text and from say, plus count vars', () => {
    expect(lineSlots('l.say', NARRATION).sort()).toEqual(['a', 'b', 'item', 'n']);
    expect(lineSlots('l.noun', NARRATION).sort()).toEqual(['item', 'n']);
    expect(lineSlots('l.dec2', NARRATION)).toEqual(['v']);
  });

  it('ignores literal braces and missing keys', () => {
    expect(lineSlots('l.brace', NARRATION)).toEqual(['n']);
    expect(lineSlots('no.such.key', NARRATION)).toEqual([]);
  });

  it('uses the bound narration by default', () => {
    expect(lineSlots('l.say')).toEqual([]);
    initContent({ templates: [], narration: NARRATION, misconceptions: [] });
    expect(lineSlots('l.say').sort()).toEqual(['a', 'b', 'item', 'n']);
  });
});

describe('constraintHolds (03 §5.2)', () => {
  it.each<[string, Record<string, number | string | boolean>, boolean]>([
    ['a + b <= 10', { a: 3, b: 7 }, true],
    ['a + b <= 10', { a: 4, b: 7 }, false],
    ['start < n', { start: 2, n: 5 }, true],
    // Derived names (count.sequence `last`, addsub.facts `result`) are just identifiers in the env.
    ['last <= 20', { start: 19, last: 20 }, true],
    ['result >= 0 && result <= 10', { a: 3, b: 5, result: -2 }, false],
    // `//` is floor division, `%` is a non-negative modulo.
    ['n // 2 == 3', { n: 7 }, true],
    ['n // 2 == -4', { n: -7 }, true],
    ['n % 3 == 2', { n: -1 }, true],
    ['digit(n, 0) == 5 && digit(n, 1) == 4', { n: 345 }, true],
    ['digit(n, 3) == 0', { n: 345 }, true],
    ['ndigits(n) == 3', { n: 345 }, true],
    ['carries(a, b) == 1', { a: 47, b: 38 }, true],
    ['borrows(a, b) == 1', { a: 52, b: 27 }, true],
    ['max(a, b) >= 4 && min(a, b) <= 4', { a: 9, b: 3 }, true],
    ['abs(a - b) == 1', { a: 4, b: 5 }, true],
    ['gcd(a, b) == 1', { a: 4, b: 9 }, true],
    ['iszero(a) || b > 1', { a: 0, b: 0 }, true],
    ['!(a > b)', { a: 2, b: 3 }, true],
    ['-a + 5 == 2', { a: 3 }, true],
    ['op == "+"', { op: '+' }, true],
    ['op == "+"', { op: '-' }, false],
    ['op != "-"', { op: '+' }, true],
    ['tensOnly', { tensOnly: true }, true],
    ['tensOnly', { tensOnly: false }, false],
    ['a * (b + 1) == 12', { a: 3, b: 3 }, true],
  ])('%s with %j → %s', (src, env, want) => {
    expect(constraintHolds(src, env)).toBe(want);
  });

  it.each([
    ['a +', {}],
    ['a / 2', { a: 4 }],
    ['(a + 1', { a: 1 }],
    ['a == "x', { a: 1 }],
    ['foo(a)', { a: 1 }],
    ['min(a)', { a: 1 }],
    ['a b', { a: 1, b: 2 }],
    ['a @ b', { a: 1, b: 2 }],
  ])('a syntax error throws ExprError (%s)', (src, env) => {
    expect(() => constraintHolds(src, env)).toThrow(ExprError);
  });

  it.each([
    ['unknown identifier', 'missing > 0', {}],
    ['division by zero', 'a // b == 0', { a: 1, b: 0 }],
    ['modulo by zero', 'a % b == 0', { a: 1, b: 0 }],
    ['arithmetic on a string', 'op + 1 == 2', { op: '+' }],
  ])('an evaluation error throws ExprError (%s)', (_label, src, env) => {
    expect(() => constraintHolds(src, env)).toThrow(ExprError);
  });
});
