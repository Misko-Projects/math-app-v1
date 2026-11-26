import { describe, expect, it } from 'vitest';
import {
  type BarSpec,
  describeBarModel,
  layoutBarModel,
  pieceNeed,
  pieceWeight,
  solveRow,
} from './barModel';

const t = (key: string, vars?: Record<string, string | number>) =>
  `${key}${vars ? JSON.stringify(vars) : ''}`;

const WHOLE: BarSpec = { kind: 'bar-model', parts: [45, '?'], whole: 72 };
const TOTAL: BarSpec = { kind: 'bar-model', parts: [38, 25, 12], whole: '?' };
const COMPARE: BarSpec = {
  kind: 'bar-model',
  parts: [45, '?'],
  whole: 72,
  compare: { bigger: 72, smaller: 45 },
};
/** Two steps: has 34, gets 18, gives away 25. */
const PLUS_MINUS: BarSpec = {
  kind: 'bar-model',
  parts: [34, 18],
  whole: null,
  lower: { parts: [25, '?'], whole: null },
};
/** Two steps: has 60, gives away 15, gets 22. */
const MINUS_PLUS: BarSpec = {
  kind: 'bar-model',
  parts: [15, null],
  whole: 60,
  lower: { parts: [null, 22], whole: '?' },
};
const ALL = [WHOLE, TOTAL, COMPARE, PLUS_MINUS, MINUS_PLUS];

describe('bar model layout (#17 slice 4d)', () => {
  it('solves the unknowns of a bar only to size it', () => {
    expect(solveRow([45, '?'], 72)).toEqual({ parts: [45, 27], whole: 72 });
    expect(solveRow([38, 25], '?')).toEqual({ parts: [38, 25], whole: 63 });
    expect(solveRow(['?', '?'], 40)).toEqual({ parts: [20, 20], whole: 40 });
    expect(solveRow([25, '?'], null, 52)).toEqual({ parts: [25, 27], whole: 52 });
  });

  it('snaps widths to three buckets, so a bigger amount is wider but nothing is to scale', () => {
    expect(pieceWeight(45, 45)).toBe(1);
    expect(pieceWeight(31, 45)).toBe(1);
    expect(pieceWeight(27, 45)).toBe(0.7);
    expect(pieceWeight(5, 45)).toBe(0.5);
    // 45 and 27 of 72: drawn 1 : 0.7, not 45 : 27.
    const [a, b] = layoutBarModel(WHOLE, 400).pieces;
    expect((b?.w ?? 0) / (a?.w ?? 1)).toBeCloseTo(0.7);
  });

  it.each(ALL.map((s, i) => [i, s] as const))(
    'model %i: no piece narrower than its label needs, at 300 px and at its widest',
    (_, spec) => {
      for (const maxWidth of [300, 720]) {
        const l = layoutBarModel(spec, maxWidth);
        for (const p of l.pieces) expect(p.w).toBeGreaterThanOrEqual(pieceNeed(p.label) - 0.5);
        expect(l.w).toBe(Math.max(l.minWidth, maxWidth));
      }
    },
  );

  it('labels the unknown "?" and leaves the first step blank', () => {
    expect(layoutBarModel(WHOLE, 400).pieces.map((p) => p.label)).toEqual(['45', '?']);
    expect(layoutBarModel(WHOLE, 400).braces.map((b) => b.label)).toEqual(['72']);
    const two = layoutBarModel(PLUS_MINUS, 500);
    expect(two.pieces.map((p) => p.label)).toEqual(['34', '18', '25', '?']);
    expect(two.braces).toEqual([]);
    expect(two.badges.map((b) => b.label)).toEqual(['1', '2']);
  });

  it('a comparison ends both bars together, the extra piece closing the smaller', () => {
    const [big, small, extra] = layoutBarModel(COMPARE, 400).pieces;
    expect(small?.x).toBe(0);
    expect((extra?.x ?? 0) + (extra?.w ?? 0)).toBe(big?.w);
    expect(extra?.label).toBe('?');
    expect(extra?.kind).toBe('unknown');
  });

  it('two steps: the first step result sits at the same place and width in both bars', () => {
    // +−: the whole first bar is the whole second bar.
    const pm = layoutBarModel(PLUS_MINUS, 500);
    const top = pm.pieces.slice(0, 2);
    const bottom = pm.pieces.slice(2);
    const end = (ps: typeof top) => Math.max(...ps.map((p) => p.x + p.w));
    expect(Math.min(...bottom.map((p) => p.x))).toBeCloseTo(Math.min(...top.map((p) => p.x)));
    expect(end(bottom)).toBeCloseTo(end(top));
    // −+: the blank piece of the first bar is the blank piece of the second.
    const mp = layoutBarModel(MINUS_PLUS, 500);
    const blanks = mp.pieces.filter((p) => p.kind === 'first');
    expect(blanks).toHaveLength(2);
    expect(blanks[1]?.x).toBeCloseTo(blanks[0]?.x ?? -1);
    expect(blanks[1]?.w).toBeCloseTo(blanks[0]?.w ?? -1);
    expect(mp.link?.x).toBeCloseTo(blanks[0]?.x ?? -1);
  });

  it('the accessible name tells the told numbers and "?", never the unknown', () => {
    expect(describeBarModel(WHOLE, t)).toBe('ui.widget.bar.whole{"parts":"45, ?","whole":"72"}');
    expect(describeBarModel(COMPARE, t)).toBe(
      'ui.widget.bar.compare{"bigger":"72","smaller":"45","extra":"?"}',
    );
    const two = describeBarModel(MINUS_PLUS, t);
    expect(two).toContain('"parts":"15, ui.widget.bar.from-first"');
    expect(two).not.toMatch(/\b(45|67)\b/);
  });
});
