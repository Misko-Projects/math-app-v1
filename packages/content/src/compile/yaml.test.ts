import { describe, expect, it, vi } from 'vitest';
import { Diagnostics } from '../diagnostics';
import { parseYaml } from './yaml';

// parseYaml caches clean parses by text (#11 CI timeouts): the cache must never change a result.

// Counts the real YAML parses, so the tests also fail if the cache is removed (PR #87 review).
const parses = vi.hoisted(() => ({ n: 0 }));
vi.mock('yaml', async (importOriginal) => {
  const real = await importOriginal<typeof import('yaml')>();
  return {
    ...real,
    parseDocument: (...args: Parameters<typeof real.parseDocument>) => {
      parses.n += 1;
      return real.parseDocument(...args);
    },
  };
});

type Doc = { skills: { id: string; tags: string[] }[] };
const ORIGINAL = { skills: [{ id: 'CNT.01', tags: ['a', 'b'] }] };

describe('parseYaml cache', () => {
  it('parses a text once, and every caller, on a miss or a hit, gets its own copy', () => {
    const text = 'skills:\n  - id: CNT.01\n    tags: [a, b]\n';
    const before = parses.n;
    // The miss: its caller edits what it got.
    const first = parseYaml('a.yaml', text, new Diagnostics()) as Doc;
    first.skills[0]?.tags.push('edited');
    // A hit: its caller edits nested data too.
    const second = parseYaml('b.yaml', text, new Diagnostics()) as Doc;
    expect(second).toEqual(ORIGINAL);
    second.skills[0]?.tags.push('also edited');
    (second.skills[0] as { id: string }).id = 'changed';
    // A later hit still sees the original value.
    expect(parseYaml('c.yaml', text, new Diagnostics())).toEqual(ORIGINAL);
    expect(parses.n - before).toBe(1);
  });

  it('reports a failing parse every time, never from a cache', () => {
    const bad = 'a: &x 1\nb: *x\n';
    const before = parses.n;
    for (const file of ['one.yaml', 'two.yaml']) {
      const d = new Diagnostics();
      expect(parseYaml(file, bad, d)).toBeUndefined();
      expect(d.items.map((x) => [x.check, x.file])).toContainEqual(['V01', file]);
    }
    expect(parses.n - before).toBe(2);
  });
});
