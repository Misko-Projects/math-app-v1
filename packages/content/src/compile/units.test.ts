import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJson, fnv1a32, sha256Hex } from './canonical';
import { deriveWi } from './compile';
import { evaluate, identifiers, parseExpr } from './expr';
import { lineClips, parseLine, renderWithPlaceholders, sentenceCount, words } from './narration';

describe('canonicalJson (03 §9.1)', () => {
  it('sorts keys recursively, keeps array order, drops undefined, writes no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });
  it('is independent of key insertion order', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.integer()), (obj) => {
        const reversed = Object.fromEntries(Object.entries(obj).reverse());
        expect(canonicalJson(reversed)).toBe(canonicalJson(obj));
      }),
    );
  });
  it('rejects non-finite numbers', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(/non-finite/);
  });
});

describe('sha256Hex', () => {
  it('matches node:crypto on ASCII, Unicode and block-boundary inputs', () => {
    const samples = [
      '',
      'abc',
      'ten-frame ✓ 5¢ — “quotes”',
      'x'.repeat(55),
      'y'.repeat(56),
      'z'.repeat(64),
      'w'.repeat(1000),
    ];
    for (const s of samples) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });
  it('matches node:crypto on random strings', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (s) => {
        expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
      }),
      { numRuns: 200 },
    );
  });
});

describe('fnv1a32 (auto-lesson seeds, 03 §6.4)', () => {
  it('matches the FNV-1a reference values', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });
});

describe('constraint expressions (03 §5.2)', () => {
  const ev = (src: string, env: Record<string, number | string | boolean> = {}) =>
    evaluate(parseExpr(src), env);
  it.each([
    ['a + b >= 11', { a: 6, b: 5 }, 1],
    ['a + b <= 10 && a >= b', { a: 6, b: 5 }, 0],
    ['!(a == 3) || b', { a: 3, b: 0 }, 0],
    ['17 // 5 + 17 % 5', {}, 5],
    ['-7 // 2', {}, -4],
    ['-a + 2 * 3', { a: 1 }, 5],
    ['digit(345, 1) == 4 && ndigits(345) == 3', {}, 1],
    ['carries(58, 67)', {}, 2],
    ['borrows(305, 128)', {}, 2],
    ['gcd(12, 18) + abs(-3) + min(4, 2, 9) + max(1, 7)', {}, 18],
    ['iszero(a - a)', { a: 4 }, 1],
    ['family == "make-ten"', { family: 'make-ten' }, 1],
    ['flag', { flag: true }, 1],
  ])('%s', (src, env, want) => {
    expect(ev(src, env)).toBe(want);
  });
  it.each(['a / b', 'a +', 'foo(1)', 'abs(1, 2)', '"open', 'a ? b', '(a'])('rejects %s', (src) => {
    expect(() => parseExpr(src)).toThrow();
  });
  it('lists identifiers and reports unknown ones at evaluation', () => {
    expect([...identifiers(parseExpr('a + max(b, result) > 3'))].sort()).toEqual([
      'a',
      'b',
      'result',
    ]);
    expect(() => ev('result > 1', {})).toThrow(/unknown identifier 'result'/);
  });
});

describe('narration slots and clips (03 §8.4)', () => {
  it('splits the spoken line into numbered static clips and slot tokens', () => {
    const { segments, errors } = parseLine('Fill the shell to make ten. How many is {a} plus {b}?');
    expect(errors).toEqual([]);
    expect(lineClips('tp.ADD.08.t1.prompt', segments)).toEqual([
      'tp.ADD.08.t1.prompt#0',
      '$a',
      'tp.ADD.08.t1.prompt#1',
      '$b',
      'tp.ADD.08.t1.prompt#2',
    ]);
  });
  it('keeps types and count variables in slot tokens and skips blank segments', () => {
    const { segments } = parseLine('{who|name} has {n} {item|noun:n}.');
    expect(lineClips('k.x', segments)).toEqual([
      '$who|name',
      'k.x#0',
      '$n',
      '$item|noun:n',
      'k.x#1',
    ]);
  });
  it('treats {{ and }} as literal braces', () => {
    const { segments, errors } = parseLine('Use {{braces}} for {n}');
    expect(errors).toEqual([]);
    expect(renderWithPlaceholders(segments, () => '7')).toBe('Use {braces} for 7');
  });
  it.each([
    ['{n', /unclosed slot/],
    ['oops }', /stray }/],
    ['{9x}', /not a variable name/],
    ['{n|money}', /unknown type 'money'/],
    ['{item|noun}', /needs a count variable/],
    ['{n|num:x}', /takes no count variable/],
  ])('reports %s', (line, re) => {
    expect(parseLine(line).errors.join(' ')).toMatch(re);
  });
  it('counts words without standalone math symbols and sentences by terminal punctuation', () => {
    expect(words('0 + 0 = ?')).toEqual(['0', '0']);
    expect(sentenceCount('Start on 3. Hop 2 more. Where do you land?')).toBe(3);
    expect(sentenceCount('Five and 2 more make 7!')).toBe(1);
    expect(sentenceCount('0 + 0 = ?')).toBe(1);
  });
});

describe('deriveWi (03 §2.2 alias rule)', () => {
  const ex = new Map<string, string | null>([
    ['K.CC.B.5', 'M.K.CC.B.6'],
    ['1.OA.D.8', null],
    ['3.OA.C.7', 'M.3.OA.C.6'],
  ]);
  it('maps exceptions, drops null aliases, prefixes the rest, and sorts', () => {
    expect(deriveWi(['K.CC.B.5', 'K.CC.A.1', '1.OA.D.8', 'K.CC.B.4a'], ex)).toEqual([
      'M.K.CC.A.1',
      'M.K.CC.B.4a',
      'M.K.CC.B.6',
    ]);
  });
  it('maps a sub-part of a renumbered standard to the same sub-part', () => {
    expect(deriveWi(['3.OA.C.7a'], ex)).toEqual(['M.3.OA.C.6a']);
  });
});
