import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import { generateItem } from '@number-island/engine';
import { describe, expect, it } from 'vitest';
import { browserContent, contentFiles } from './contentSources';
import { answerSummary, difficultyBreakdown, difficultySpread, hintRows } from './inspect';

describe('Content Browser sources', () => {
  it('bundles exactly the files content:build reads, under the same paths', () => {
    expect(contentFiles()).toEqual(readContentFiles());
  });

  it('compiles to the same content version as content:build', () => {
    const { result, errors } = browserContent();
    expect(errors).toEqual([]);
    expect(result.contentVersion).toBe(compileContent(readContentFiles()).contentVersion);
    expect(result.content?.templates.length).toBeGreaterThan(50);
  });
});

describe('Content Browser item inspection', () => {
  const template = () => {
    const t = browserContent().result.content?.templates.find((x) => x.id === 'CNT.07.t4');
    if (!t) throw new Error('CNT.07.t4 missing');
    return t;
  };

  it('breaks difficulty down into base + Σ weight × value = total', () => {
    const t = template();
    for (const seed of [1, 7, 42]) {
      const item = generateItem(t, seed);
      const b = difficultyBreakdown(t, item);
      expect(b.base).toBe(t.difficulty.base);
      const sum = b.terms.reduce((s, x) => s + x.contribution, b.base);
      expect(sum).toBeCloseTo(item.difficulty, 9);
      expect(b.terms.every((x) => x.value !== 0)).toBe(true);
    }
  });

  it('renders hint text and summarises the answer', () => {
    const item = generateItem(template(), 7);
    const hints = hintRows(item);
    expect(hints.length).toBe(item.hints.length);
    for (const h of hints) expect(h.text).not.toBe(h.key);
    expect(answerSummary(item)).toMatch(/^choice opt-\d+$/);
  });

  it('computes the untargeted difficulty spread', () => {
    const s = difficultySpread(template(), 100);
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.n).toBe(100);
    expect(s.min).toBeLessThanOrEqual(s.p10);
    expect(s.p10).toBeLessThanOrEqual(s.median);
    expect(s.median).toBeLessThanOrEqual(s.p90);
    expect(s.p90).toBeLessThanOrEqual(s.max);
  });
});
