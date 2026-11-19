/// <reference types="node" />
// packages/content/outlines.yaml and the engine outline table (geo.compose, 03 §5.6) stay in step:
// the same ids in the same order, the same points (to 6 decimals) and the reference-tiling pieces.

import { readContentFiles } from '@number-island/content/node';
import { describe, expect, it } from 'vitest';
import { OUTLINES } from '../src/generators/geo/outlines';

interface YamlOutline {
  id: string;
  points: [number, number][];
  pieces?: string[];
}

/**
 * The outlines.yaml entries. The file uses flow-style arrays for `points` and `pieces` (on one line
 * or wrapped by the formatter), so a field's value runs until its brackets balance.
 */
function readYamlOutlines(): YamlOutline[] {
  const text = readContentFiles()['outlines.yaml'] ?? '';
  const out: YamlOutline[] = [];
  let field: 'points' | 'pieces' | null = null;
  let buf = '';
  const flush = () => {
    const last = out[out.length - 1];
    if (!last || !field) return;
    const flat = buf.replace(/\s+/g, '').replace(/,\]/g, ']');
    if (field === 'points') last.points = JSON.parse(flat) as [number, number][];
    else last.pieces = flat.slice(1, -1).split(',');
    field = null;
    buf = '';
  };
  const balanced = (s: string) => (s.match(/\[/g) ?? []).length === (s.match(/\]/g) ?? []).length;
  for (const line of text.split('\n')) {
    if (field) {
      buf += line;
      if (balanced(buf)) flush();
      continue;
    }
    const id = line.match(/^ {2}- id: (\S+)$/);
    if (id) {
      out.push({ id: id[1] as string, points: [] });
      continue;
    }
    const m = line.match(/^ {4}(points|pieces):(.*)$/);
    if (m) {
      field = m[1] as 'points' | 'pieces';
      buf = m[2] as string;
      if (buf.trim() !== '' && balanced(buf)) flush();
    }
  }
  return out;
}

describe('outlines.yaml', () => {
  const yaml = readYamlOutlines();
  it('lists every engine outline, in order', () => {
    expect(yaml.map((o) => o.id)).toEqual(OUTLINES.map((o) => o.id));
  });
  it.each(OUTLINES.map((o) => [o.id, o] as const))('%s has the same points and pieces', (id, o) => {
    const y = yaml.find((x) => x.id === id);
    expect(y?.points).toHaveLength(o.points.length);
    o.points.forEach((p, i) => {
      expect(y?.points[i]?.[0]).toBeCloseTo(p[0], 6);
      expect(y?.points[i]?.[1]).toBeCloseTo(p[1], 6);
    });
    expect(y?.pieces).toEqual(o.tiling.length > 0 ? o.tiling.map((p) => p.kind) : undefined);
  });
});
