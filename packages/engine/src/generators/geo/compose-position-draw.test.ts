// geo.compose, geo.position and geo.draw (03 §5.6): fixed params → answer, widget and solution per
// format; feature extremes.

import type {
  ItemFormat,
  ItemTemplate,
  ParamValues,
  Representation,
  ResponseValue,
  Tier,
} from '@number-island/shared';
import { widgetConfigSchema } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { area, placeCorners } from '../../check/state/pieces';
import { initContent, resetContent } from '../../content/binding';
import { checkResponse } from '../../items/check';
import { generateItem, generateItemFromParams } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { geoCompose } from './compose';
import { geoDraw, gridOf } from './draw';
import { OUTLINES } from './outlines';
import { geoPosition } from './position';

let nextId = 0;
function tpl(
  generator: string,
  format: ItemFormat,
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.${generator}.${nextId}`,
    skillId: 'X.01',
    format,
    tier: (format === 'shape-compose' ? 'concrete' : 'pictorial') as Tier,
    generator,
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
    ...over,
  };
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

function item(t: ItemTemplate, params: ParamValues) {
  const it = generateItemFromParams(t, params);
  expect(widgetConfigSchema.safeParse(it.widget).success).toBe(true);
  expect(checkResponse(it, itemExampleCorrect(it, t)).correct).toBe(true);
  return it;
}

/** Applies a solution's shape-compose / puzzle-grid ops to build the response they describe. */
function responseFromSteps(t: ItemTemplate, params: ParamValues): ResponseValue {
  const it = generateItemFromParams(t, params);
  const steps = itemSolution(it, t);
  if (it.widget.format === 'shape-compose') {
    if (it.widget.mode === 'fill-outline') {
      const kindOf = new Map((it.widget.pieces ?? []).map((p) => [p.id, p.kind]));
      const pieces = steps
        .filter((s) => s.action?.op === 'drag-piece')
        .map((s) => {
          const a = s.action?.args as { id: string; to: [number, number]; rot: number };
          return { kind: kindOf.get(a.id), at: a.to, rot: a.rot };
        });
      return { kind: 'state', value: { pieces } };
    }
    if (it.widget.mode === 'place-relative') {
      const a = steps.at(-1)?.action?.args as { to: [number, number]; layer: string };
      return { kind: 'state', value: { at: a.to, layer: a.layer } };
    }
    const points = steps.map(
      (s) => (s.action?.args as { from: [number, number] } | undefined)?.from,
    );
    return { kind: 'state', value: { points } };
  }
  if (it.widget.format === 'puzzle-grid') {
    const { rows, cols } = it.widget;
    const fill = Array.from({ length: rows }, () => new Array<string>(cols).fill(''));
    for (const s of steps) {
      const a = s.action?.args as { r: number; c: number; value: string };
      (fill[a.r] as string[])[a.c] = a.value;
    }
    return { kind: 'state', value: { fill } };
  }
  const r = replaySteps(it, steps);
  if (!r) throw new Error('no response');
  return r;
}

describe('geo.compose', () => {
  it.each(OUTLINES.filter((o) => o.kit !== 'grid').map((o) => o.id))(
    'shape-compose %s: the solution fills the outline',
    (outline) => {
      const kit = OUTLINES.find((o) => o.id === outline)?.kit;
      const t = tpl('geo.compose', 'shape-compose', {
        representation: (kit === 'pattern-blocks' ? 'pattern-blocks' : 'shapes') as Representation,
      });
      const it = item(t, { outline, extra: true });
      expect(it.widget).toMatchObject({ format: 'shape-compose', mode: 'fill-outline' });
      expect(it.answer).toMatchObject({ kind: 'state', checker: 'compose.fill' });
      const r = responseFromSteps(t, { outline, extra: true });
      expect(checkResponse(it, r).correct).toBe(true);
    },
  );

  it('numeral-pick how-many: six triangles make a hexagon; the solution replays', () => {
    const t = tpl('geo.compose', 'numeral-pick');
    const it = item(t, { outline: 'hexagon-from-triangles', ask: 'how-many' });
    expect(it.answer).toEqual({ kind: 'choice', id: 'opt-6' });
    expect(
      checkResponse(
        it,
        responseFromSteps(t, { outline: 'hexagon-from-triangles', ask: 'how-many' }),
      ).correct,
    ).toBe(true);
  });

  it('numeral-pick which: the right pair among pairs that cannot fit', () => {
    const t = tpl('geo.compose', 'numeral-pick');
    const it = item(t, { outline: 'rhombus-from-triangles', ask: 'which' });
    expect(it.answer).toEqual({ kind: 'choice', id: 'pair-triangle-triangle' });
    if (it.widget.format !== 'numeral-pick') throw new Error('pick');
    expect(it.widget.options).toHaveLength(3);
  });

  it('numeral-pick: one visible target never stands for two outlines with different answers', () => {
    const pick = tpl('geo.compose', 'numeral-pick', { representation: 'shapes' as Representation });
    // What a card shows: its kind's piece at its scale (a ShapeCard has no corners of its own).
    const cardArea = (shapes: { shape: string; scale: number }[]) =>
      shapes.reduce(
        (s, c) =>
          s + area(placeCorners({ kind: c.shape, at: [0, 0], rot: 0 }) ?? []) * c.scale ** 2,
        0,
      );
    for (const ask of ['which', 'how-many']) {
      // Every outline numeral-pick can draw for this ask, keyed by what the child sees (and, for
      // how-many, the piece the prompt names).
      const byTarget = new Map<string, Set<string>>();
      for (const o of OUTLINES) {
        if (!geoCompose.accepts?.({ outline: o.id, ask, count: o.tiling.length }, pick)) continue;
        for (let seed = 1; seed <= 20; seed += 1) {
          const it = generateItem(
            {
              ...pick,
              params: {
                outline: { kind: 'const', value: o.id },
                ask: { kind: 'const', value: ask },
              },
            },
            seed,
          );
          if (it.widget.format !== 'numeral-pick' || it.widget.stimulus.kind !== 'shape')
            throw new Error('pick');
          const whole = it.widget.stimulus.shapes[0];
          if (!whole) throw new Error('no target');
          // The card is the outline: it has the outline's area.
          expect(cardArea([whole])).toBeCloseTo(area(o.points), 9);
          const named = ask === 'how-many' ? `/${o.tiling[0]?.kind}` : '';
          const key = `${whole.shape}@${whole.scale}${named}`;
          const answers = byTarget.get(key) ?? new Set<string>();
          answers.add(it.answer.kind === 'choice' ? it.answer.id : '?');
          byTarget.set(key, answers);
          if (ask === 'which') {
            // Only the right pair covers the card the child sees.
            for (const opt of it.widget.options) {
              if (opt.stimulus?.kind !== 'shape') throw new Error('pair');
              const fits = Math.abs(cardArea(opt.stimulus.shapes) - cardArea([whole])) < 1e-6;
              expect(fits).toBe(it.answer.kind === 'choice' && opt.id === it.answer.id);
            }
          }
        }
      }
      expect(byTarget.size).toBeGreaterThan(2);
      for (const [key, answers] of byTarget)
        expect({ key, n: answers.size }).toEqual({ key, n: 1 });
    }
    // The 3 × 1 rectangle would show the same card as the 2 × 1 one, so it is shape-compose only;
    // the 3 × 2 rectangle is no scaled 2 × 1 card either.
    for (const outline of ['long-rectangle', 'wide-rectangle']) {
      for (const ask of ['which', 'how-many'])
        expect(geoCompose.accepts?.({ outline, ask, count: 2 }, pick)).toBe(false);
    }
    expect(
      geoCompose.accepts?.({ outline: 'rectangle-from-squares', ask: 'which', count: 2 }, pick),
    ).toBe(true);
    const compose = tpl('geo.compose', 'shape-compose', {
      representation: 'shapes' as Representation,
    });
    expect(geoCompose.accepts?.({ outline: 'long-rectangle', count: 2 }, compose)).toBe(true);
  });

  it('puzzle-grid shape-fill: the solution covers the outline with the listed pieces', () => {
    const t = tpl('geo.compose', 'puzzle-grid', { representation: 'shapes' as Representation });
    const params = { outline: 'grid-block', pieces: 4 };
    const it = item(t, params);
    if (it.widget.format !== 'puzzle-grid') throw new Error('grid');
    expect(it.widget.variant).toBe('shape-fill');
    expect(it.widget.cells).toHaveLength(6);
    expect(it.widget.constraints).toEqual([
      { kind: 'use-each', values: ['rectangle', 'rectangle', 'square', 'square'] },
    ]);
    expect(it.widget.uniqueSolution).toBe(false);
    expect(checkResponse(it, responseFromSteps(t, params)).correct).toBe(true);
  });

  it('features: two pieces, no turn, lines shown is 0; a hidden-line star is hard', () => {
    const t = tpl('geo.compose', 'shape-compose', { representation: 'shapes' as Representation });
    expect(generateItemFromParams(t, { outline: 'rectangle-from-squares' }).difficulty).toBe(0);
    const star = tpl('geo.compose', 'shape-compose', {
      representation: 'pattern-blocks' as Representation,
    });
    // pieces 5 × 0.3 + rotations (3 turned triangles) × 0.3 + lines hidden 0.6
    expect(
      generateItemFromParams(star, { outline: 'star', linesHidden: true }).difficulty,
    ).toBeCloseTo(3.0);
  });

  it('a grid outline is never offered to shape-compose, nor a block outline to puzzle-grid', () => {
    const t = tpl('geo.compose', 'shape-compose', { representation: 'shapes' as Representation });
    expect(geoCompose.accepts?.({ outline: 'grid-block', count: 0 }, t)).toBe(false);
    const g = tpl('geo.compose', 'puzzle-grid');
    expect(geoCompose.accepts?.({ outline: 'house', pieces: 2, count: 2 }, g)).toBe(false);
  });
});

describe('geo.position', () => {
  it.each(['above', 'below', 'beside', 'next-to', 'in-front-of', 'behind', 'left-of', 'right-of'])(
    'shape-compose: put the crab %s the crate',
    (relation) => {
      const t = tpl('geo.position', 'shape-compose', {
        representation: 'objects' as Representation,
      });
      const params = { relation, anchor: 'crate', item: 'crab', scene: 'two' };
      const it = item(t, params);
      expect(it.widget).toMatchObject({
        mode: 'place-relative',
        relation: { word: relation, anchor: 'a0', item: 'crab' },
      });
      expect(checkResponse(it, responseFromSteps(t, params)).correct).toBe(true);
    },
  );

  it.each(['above', 'below', 'in-front-of'])(
    'shape-compose %s: hints before show-me never mark where the item goes',
    (relation) => {
      const t = tpl('geo.position', 'shape-compose', {
        representation: 'objects' as Representation,
      });
      const it = generateItemFromParams(t, { relation, anchor: 'crate', item: 'crab' });
      const nudge = it.hints.find((h) => h.level === 2);
      expect(nudge?.say).toBe('h.one');
      for (const level of [2, 3, 4]) {
        const h = it.hints.find((x) => x.level === level);
        expect(h).toBeDefined();
        expect(h?.actions ?? []).not.toContainEqual(
          expect.objectContaining({ op: 'highlight-region' }),
        );
      }
      // Show-me still demonstrates the region, then the drop.
      expect(it.hints.find((h) => h.level === 5)?.actions?.[0]).toEqual({
        op: 'highlight-region',
        args: { relation },
      });
    },
  );

  it('numeral-pick: the inverse word, never its synonym', () => {
    const t = tpl('geo.position', 'numeral-pick', {
      tier: 'abstract',
      representation: 'words' as Representation,
    });
    const above = item(t, { relation: 'above', options: 3 });
    expect(above.answer).toEqual({ kind: 'choice', id: 'below' });
    if (above.widget.format !== 'numeral-pick') throw new Error('pick');
    // The word the child heard is offered as a distractor.
    expect(above.widget.options.map((o) => o.id)).toContain('above');
    for (let seed = 1; seed <= 30; seed += 1) {
      const it = generateItem(
        {
          ...t,
          params: {
            relation: { kind: 'const', value: 'beside' },
            options: { kind: 'const', value: 4 },
          },
        },
        seed,
      );
      if (it.widget.format !== 'numeral-pick') throw new Error('pick');
      const ids = it.widget.options.map((o) => o.id);
      expect(ids).toContain('beside');
      expect(ids).not.toContain('next-to');
      expect(checkResponse(it, responseFromSteps(t, it.params)).correct).toBe(true);
    }
  });

  it('features: left/right and front/behind are harder', () => {
    const t = tpl('geo.position', 'shape-compose', { representation: 'objects' as Representation });
    expect(generateItemFromParams(t, { relation: 'above' }).difficulty).toBe(0);
    expect(generateItemFromParams(t, { relation: 'left-of', scene: 'two' }).difficulty).toBeCloseTo(
      0.9,
    );
    expect(generateItemFromParams(t, { relation: 'behind' }).difficulty).toBeCloseTo(0.4);
  });
});

describe('geo.draw', () => {
  it.each([
    [{ sides: 3 }, 'draw-on-grid'],
    [{ sides: 6 }, 'draw-on-grid'],
    [{ kind: 'square', sides: 0, tool: 'sticks' }, 'build-sticks'],
    [{ kind: 'rectangle', sides: 0 }, 'draw-on-grid'],
    [{ kind: 'trapezoid', sides: 0 }, 'draw-on-grid'],
    [{ sides: 4, rightAngles: 2 }, 'draw-on-grid'],
  ] as [ParamValues, string][])(
    'shape-compose %j: the solution draws a shape that passes',
    (params, mode) => {
      const t = tpl('geo.draw', 'shape-compose', { representation: 'dot-grid' as Representation });
      const it = item(t, params);
      expect(it.widget).toMatchObject({ format: 'shape-compose', mode });
      expect(it.answer).toMatchObject({ kind: 'state', checker: 'grid.polygon' });
      expect(checkResponse(it, responseFromSteps(t, params)).correct).toBe(true);
    },
  );

  it('a rectangle request draws a rectangle, not a square', () => {
    const t = tpl('geo.draw', 'shape-compose');
    const it = generateItemFromParams(t, { kind: 'rectangle', sides: 0 });
    const ex = itemExampleCorrect(it, t);
    expect(ex).toEqual({
      kind: 'state',
      value: {
        points: [
          [0, 0],
          [4, 0],
          [4, 2],
          [0, 2],
        ],
      },
    });
  });

  it('wide grids (cols × rows): the widget grid and the checker target are the same size', () => {
    const t = tpl('geo.draw', 'shape-compose');
    const it = generateItemFromParams(t, { kind: 'triangle', sides: 0, cols: 6, rows: 3 });
    if (it.widget.format !== 'shape-compose' || it.answer.kind !== 'state') throw new Error('grid');
    expect(it.widget.grid).toEqual({ cols: 6, rows: 3 });
    expect(it.answer.target.grid).toEqual({ cols: 6, rows: 3 });
    const ex = itemExampleCorrect(it, t) as unknown as { value: { points: [number, number][] } };
    for (const [x, y] of ex.value.points) {
      expect(x).toBeLessThan(6);
      expect(y).toBeLessThan(3);
    }
    expect(checkResponse(it, itemExampleCorrect(it, t)).correct).toBe(true);
  });

  it.each([
    ['triangle', 0],
    ['square', 0],
    ['rectangle', 0],
    ['any', 3],
    ['any', 4],
    ['any', 5],
    ['any', 6],
  ] as const)('3 rows × 6: a %s (%i sides) can be drawn', (kind, sides) => {
    const t = tpl('geo.draw', 'shape-compose');
    const p = { kind, sides, rightAngles: -1, cols: 6, rows: 3 };
    expect(geoDraw.accepts?.(p, t)).toBe(true);
    const it = generateItemFromParams(t, p);
    expect(checkResponse(it, itemExampleCorrect(it, t)).correct).toBe(true);
  });

  it('`grid` still sets a square grid when cols and rows are not given', () => {
    expect(gridOf({ grid: 5 })).toEqual({ cols: 5, rows: 5 });
    expect(gridOf({ grid: 5, cols: 6, rows: 3 })).toEqual({ cols: 6, rows: 3 });
    expect(gridOf({ cols: 0, rows: 0 })).toEqual({ cols: 5, rows: 5 });
  });

  it('an equal-sided triangle cannot be drawn on dots, so it is never generated', () => {
    const t = tpl('geo.draw', 'shape-compose');
    expect(
      geoDraw.accepts?.({ sides: 3, equalSides: true, kind: 'any', rightAngles: -1, grid: 5 }, t),
    ).toBe(false);
  });

  it('shape-sort: every card with the sides, the open figure left out', () => {
    const t = tpl('geo.draw', 'shape-sort');
    const it = item(t, { sides: 3, cards: 5, hits: 2, nearMiss: true });
    if (it.widget.format !== 'shape-sort' || it.answer.kind !== 'state') throw new Error('sort');
    const ids = it.answer.target.ids as string[];
    const triangles = it.widget.cards
      .filter((c) => 'shape' in c.card && c.card.shape === 'triangle')
      .map((c) => c.id);
    expect([...ids].sort()).toEqual(triangles.sort());
    expect(it.widget.cards.some((c) => 'shape' in c.card && c.card.shape === 'open-figure')).toBe(
      true,
    );
  });

  it('features: a triangle is 0, a square needs sides, square corners and equal sides', () => {
    const t = tpl('geo.draw', 'shape-compose');
    expect(generateItemFromParams(t, { sides: 3 }).difficulty).toBe(0);
    expect(generateItemFromParams(t, { kind: 'square', sides: 0 }).difficulty).toBeCloseTo(
      0.2 + 0.3 + 0.3,
    );
  });
});

describe('every geo generator builds every format from its defaults', () => {
  it.each(
    [geoCompose, geoPosition, geoDraw].flatMap((g) => g.formats.map((f) => [g.id, f] as const)),
  )('%s → %s', (id, f) => {
    const t = tpl(id, f);
    for (let seed = 1; seed <= 5; seed += 1) {
      const it = generateItem(t, seed);
      expect(checkResponse(it, itemExampleCorrect(it, t)).correct).toBe(true);
    }
  });
});
