import { describe, expect, it } from 'vitest';
import { Diagnostics } from '../diagnostics';
import { parseYaml } from './yaml';

// parseYaml caches clean parses by text (#11 CI timeouts): the cache must never change a result.

describe('parseYaml cache', () => {
  it('gives every caller its own copy of a cached parse', () => {
    const text = 'skills:\n  - id: CNT.01\n    tags: [a, b]\n';
    const first = parseYaml('a.yaml', text, new Diagnostics()) as {
      skills: { id: string; tags: string[] }[];
    };
    first.skills[0]?.tags.push('edited');
    (first.skills[0] as { id: string }).id = 'changed';
    const again = parseYaml('b.yaml', text, new Diagnostics());
    expect(again).toEqual({ skills: [{ id: 'CNT.01', tags: ['a', 'b'] }] });
  });

  it('reports a failing parse every time, never from a cache', () => {
    const bad = 'a: &x 1\nb: *x\n';
    for (const file of ['one.yaml', 'two.yaml']) {
      const d = new Diagnostics();
      expect(parseYaml(file, bad, d)).toBeUndefined();
      expect(d.items.map((x) => [x.check, x.file])).toContainEqual(['V01', file]);
    }
  });
});
