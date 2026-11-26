import { resetContent } from '@number-island/engine';
import type { GeneratedItem, StimulusSpec } from '@number-island/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { shippedItems } from '../shippedItems';
import { jumpsDescription } from './StimulusView';

// Content walk (Refs #35): every shipped picture of jumps on a number line has words for a
// screen reader (start, jump size and count), and never the landing.

type Line = Extract<StimulusSpec, { kind: 'number-line' }>;

function jumpLines(item: GeneratedItem): Line[] {
  const found: Line[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x);
      return;
    }
    const o = v as Record<string, unknown>;
    if (o.kind === 'number-line' && Array.isArray(o.jumps) && o.jumps.length > 0)
      found.push(o as Line);
    for (const x of Object.values(o)) visit(x);
  };
  visit(item.widget);
  visit((item as { stimulus?: unknown }).stimulus);
  return found;
}

afterAll(() => resetContent());

describe('a picture of jumps says its start and jumps, never the landing', () => {
  const lines = shippedItems(null, 4).flatMap((item) =>
    jumpLines(item).map((line) => ({ id: item.templateId, line })),
  );

  it('walks the shipped pictures of jumps', () => {
    expect(lines.length).toBeGreaterThan(0);
  });

  it('describes each one without its landing', () => {
    for (const { id, line } of lines) {
      const d = jumpsDescription(line);
      expect(d, id).not.toBeNull();
      const jumps = line.jumps ?? [];
      const landing = jumps.at(-1)?.to;
      const sizes = jumps.map((j) => j.to - j.from);
      expect(d?.vars.start, id).toBe(jumps[0]?.from);
      // The words carry the start, the count and the sizes, and nothing else (no landing).
      const allowed = new Set<string | number>([
        jumps[0]?.from ?? 0,
        jumps.length,
        ...sizes,
        sizes.join(', '),
      ]);
      for (const v of Object.values(d?.vars ?? {})) expect(allowed.has(v), `${id} ${v}`).toBe(true);
      if (landing !== undefined && !allowed.has(landing))
        expect(Object.values(d?.vars ?? {}), id).not.toContain(landing);
    }
  });
});
