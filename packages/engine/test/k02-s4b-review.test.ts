// PR #133 review (K02 slice 4b, #17), round 1: the shipped templates against the findings.
// - A ruler a child reads never slides (a concrete ruler slides, so its "it starts at 0" hint and
//   the count-the-marks diagnosis would describe a ruler the child has moved), and ends by 9, so
//   every mark has its numeral at 960 × 600 (two-digit rulers drop numerals there).
// - No hint says slanted sides make a corner not square: a turned square has slanted sides and
//   square corners (GEO.15 says so).

import type { GeneratedItem, ItemTemplate } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { render } from '../src/content/render';
import { generateItem } from '../src/items/generate';
import { loadFixture } from './fixture';

const fixture = loadFixture();
const SEEDS = 200;
const items = (t: ItemTemplate): GeneratedItem[] =>
  Array.from({ length: SEEDS }, (_, k) => generateItem(t, k + 1));

/** The last numeral a ruler reading item draws (the ruler's or the number line's end). */
function rulerEnd(item: GeneratedItem): number {
  const w = item.widget;
  if (w.format === 'measure-length') return Math.ceil(w.startOffset + w.object.length) + 1;
  if (
    (w.format === 'number-pad' || w.format === 'numeral-pick') &&
    w.stimulus.kind === 'number-line'
  )
    return w.stimulus.max;
  throw new Error(`not a ruler reading: ${w.format}`);
}

describe('PR #133 review round 1', () => {
  const reads = fixture.templates.filter(
    (t) => /^MEA\.03\./.test(t.id) && items(t)[0]?.params.mode === 'read',
  );

  it('MEA.03 reads a ruler that does not slide', () => {
    expect(reads.map((t) => t.id).sort()).toEqual(['MEA.03.t2', 'MEA.03.t3', 'MEA.03.t4']);
    for (const t of reads) expect(t.tier, t.id).not.toBe('concrete');
  });

  it('MEA.03 rulers end by 9, so every mark has its numeral', () => {
    for (const t of reads) {
      for (const item of items(t)) expect(rulerEnd(item), t.id).toBeLessThanOrEqual(9);
    }
  });

  it('no shipped template reaches the test-only code (line plots, FRA.16 grid cuts)', () => {
    // Line plots have no accessible names yet (DAT.03 planned); FRA.16 has no pictorial template.
    expect(fixture.templates.filter((t) => t.generator === 'data.lineplot')).toEqual([]);
    const grid = fixture.templates.filter(
      (t) => t.generator === 'frac.partition' && JSON.stringify(t.params).includes('grid'),
    );
    expect(grid).toEqual([]);
  });

  it('no hint says slanted sides make a corner not square', () => {
    for (const t of fixture.templates.filter((x) => /^GEO\.1[56]\./.test(x.id))) {
      for (const h of t.narration.hints) expect(render(h), `${t.id} ${h}`).not.toMatch(/slant/i);
    }
  });
});
