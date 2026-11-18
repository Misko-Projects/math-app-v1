// geo.identify (03 §5.6): fixed params → answer, widget and solution per format; feature extremes.

import type {
  ItemFormat,
  ItemTemplate,
  ParamValues,
  Representation,
  Tier,
} from '@number-island/shared';
import { widgetConfigSchema } from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { stateChecker } from '../../check/state';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItem, generateItemFromParams } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { geoIdentify } from './identify';

let nextId = 0;
function tpl(
  format: ItemFormat,
  params: ItemTemplate['params'] = {},
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.geo.identify.${nextId}`,
    skillId: 'X.01',
    format,
    tier: (format === 'shape-sort' ? 'concrete' : 'pictorial') as Tier,
    generator: 'geo.identify',
    params,
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
  const ex = itemExampleCorrect(it, t);
  expect(checkResponse(it, ex).correct).toBe(true);
  return it;
}

describe('geo.identify shape-sort', () => {
  it('find-all triangles: exactly the triangle cards, near miss left out', () => {
    const t = tpl('shape-sort');
    const it = item(t, {
      rule: 'kind',
      mode: 'find-all',
      kind: 'triangle',
      cards: 5,
      hits: 2,
      nearMiss: true,
    });
    expect(it.widget.format).toBe('shape-sort');
    if (it.widget.format !== 'shape-sort' || it.answer.kind !== 'state') throw new Error('shape');
    expect(it.answer.checker).toBe('select.exactSet');
    const ids = it.answer.target.ids as string[];
    expect(ids).toHaveLength(2);
    const triangles = it.widget.cards.filter(
      (c) => 'shape' in c.card && c.card.shape === 'triangle',
    );
    expect(triangles.map((c) => c.id).sort()).toEqual([...ids].sort());
    expect(it.widget.cards.some((c) => 'shape' in c.card && c.card.shape === 'open-figure')).toBe(
      true,
    );
    // The solution selects every triangle and ends with the last one.
    const steps = itemSolution(it, t);
    expect(steps.at(-1)?.action).toEqual({ op: 'drag-card', args: { id: ids.at(-1) } });
    expect(checkResponse(it, { kind: 'state', value: { ids: ids.slice(1) } }).correct).toBe(false);
  });

  it('sort by kind with a card that fits no bin', () => {
    const t = tpl('shape-sort');
    const it = item(t, {
      rule: 'kind',
      mode: 'sort',
      kind: 'triangle',
      other: 'square',
      cards: 5,
      bins: 2,
      nearMiss: true,
    });
    if (it.widget.format !== 'shape-sort' || it.answer.kind !== 'state') throw new Error('shape');
    expect(it.answer.checker).toBe('sort.byRule');
    expect(it.widget.bins?.map((b) => b.label)).toEqual([
      'shape.triangle.many',
      'shape.square.many',
    ]);
    const ex = itemExampleCorrect(it, t);
    if (ex.kind !== 'state') throw new Error('state');
    const placed = Object.values(ex.value.bins as Record<string, string[]>).flat();
    expect(placed).toHaveLength(4); // the open figure stays in the tray
    const steps = itemSolution(it, t);
    expect(steps.at(-1)?.action?.op).toBe('drag-card');
  });

  it('flat or solid sort (GEO.06) and MEA.15 heavy or light', () => {
    const geo = item(tpl('shape-sort'), {
      set: '3d',
      rule: 'flat-solid',
      mode: 'sort',
      cards: 6,
      hits: 3,
    });
    if (geo.widget.format !== 'shape-sort') throw new Error('shape');
    expect(geo.widget.bins?.map((b) => b.label)).toEqual(['word.solid', 'word.flat']);
    const mea = item(tpl('shape-sort', {}, { representation: 'words' as Representation }), {
      set: 'attributes',
      rule: 'heavy',
      mode: 'sort',
      cards: 5,
      hits: 2,
      nearMiss: true,
    });
    if (mea.widget.format !== 'shape-sort') throw new Error('shape');
    expect(mea.widget.bins?.map((b) => b.label)).toEqual(['word.heavy', 'word.light']);
    expect(mea.widget.cards.every((c) => 'kind' in c.card && c.card.kind === 'object')).toBe(true);
  });

  it('odd one out answers with the odd card', () => {
    const it = item(tpl('shape-sort'), {
      rule: 'kind',
      mode: 'odd-one-out',
      kind: 'circle',
      other: 'triangle',
      cards: 4,
    });
    if (it.widget.format !== 'shape-sort' || it.answer.kind !== 'choice') throw new Error('shape');
    const odd = it.widget.cards.find((c) => c.id === (it.answer as { id: string }).id);
    expect(odd && 'shape' in odd.card && odd.card.shape).toBe('triangle');
  });
});

describe('geo.identify numeral-pick, compare, number-pad', () => {
  it('numeral-pick: the one triangle among distinct shapes; the solution replays', () => {
    const t = tpl('numeral-pick');
    const it = item(t, { rule: 'kind', kind: 'triangle', cards: 4, nearMiss: true });
    if (it.widget.format !== 'numeral-pick' || it.answer.kind !== 'choice') throw new Error('pick');
    expect(it.widget.options).toHaveLength(4);
    const picked = it.widget.options.find((o) => o.id === (it.answer as { id: string }).id);
    expect(picked?.stimulus).toMatchObject({ kind: 'shape', shapes: [{ shape: 'triangle' }] });
    expect(
      checkResponse(it, replaySteps(it, itemSolution(it, t)) ?? { kind: 'skip' }).correct,
    ).toBe(true);
    expect(formatModel('numeral-pick')?.configSchema.safeParse(it.widget).success).toBe(true);
  });

  it('numeral-pick: real objects shaped like a cylinder (GEO.07)', () => {
    const t = tpl('numeral-pick', {}, { representation: 'objects' as Representation });
    const it = item(t, { set: 'solids', rule: 'kind', kind: 'cylinder', cards: 3 });
    if (it.widget.format !== 'numeral-pick' || it.answer.kind !== 'choice') throw new Error('pick');
    const picked = it.widget.options.find((o) => o.id === (it.answer as { id: string }).id);
    expect(picked?.stimulus).toMatchObject({ kind: 'objects' });
    expect(['can', 'drum']).toContain(
      picked?.stimulus?.kind === 'objects' ? picked.stimulus.set.sprite : '',
    );
  });

  it('compare: more corners, the same, and MEA.15 heavier', () => {
    const t = tpl('compare');
    const more = item(t, { rule: 'corners', kind: 'triangle', other: 'hexagon' });
    if (more.widget.format !== 'compare' || more.answer.kind !== 'choice') throw new Error('cmp');
    const hexSide =
      more.widget.left.kind === 'shape' && more.widget.left.shapes[0]?.shape === 'hexagon'
        ? 'left'
        : 'right';
    expect(more.answer.id).toBe(hexSide);
    expect(more.widget.ask).toBe('more');
    const same = item(t, { rule: 'sides', kind: 'square', other: 'rectangle' });
    expect(same.answer).toEqual({ kind: 'choice', id: 'same' });
    const heavy = item(tpl('compare', {}, { representation: 'objects' as Representation }), {
      set: 'attributes',
      rule: 'heavy',
      thing: 'rock',
      thing2: 'kite',
    });
    if (heavy.widget.format !== 'compare' || heavy.answer.kind !== 'choice') throw new Error('cmp');
    expect(heavy.widget.ask).toBe('heavier');
    const rockSide =
      heavy.widget.left.kind === 'objects' && heavy.widget.left.set.sprite === 'rock'
        ? 'left'
        : 'right';
    expect(heavy.answer.id).toBe(rockSide);
  });

  it('number-pad: count the sides of a hexagon; the solution replays', () => {
    const t = tpl('number-pad');
    const it = item(t, { rule: 'sides', kind: 'hexagon' });
    expect(it.answer).toEqual({ kind: 'number', value: 6 });
    expect(
      checkResponse(it, replaySteps(it, itemSolution(it, t)) ?? { kind: 'skip' }).correct,
    ).toBe(true);
  });
});

describe('geo.identify features', () => {
  it('the easiest item has every math feature at 0', () => {
    const t = tpl('shape-sort');
    // Two bins, four prototypical cards, two kinds: nothing to add.
    const it = generateItemFromParams(t, {
      rule: 'kind',
      mode: 'sort',
      kind: 'triangle',
      other: 'square',
      cards: 4,
    });
    expect(it.difficulty).toBe(0);
  });

  it('non-prototypical, near-miss and more cards raise the difficulty', () => {
    const t = tpl('shape-sort');
    const it = generateItemFromParams(t, {
      rule: 'kind',
      mode: 'find-all',
      kind: 'triangle',
      cards: 7,
      hits: 3,
      nonPrototypical: true,
      nearMiss: true,
    });
    // nonPrototypical 0.6 + nearMiss 0.6 + cards 0.3 + categories ≥ 0
    expect(it.difficulty).toBeGreaterThanOrEqual(1.5);
  });

  it('a heavy thing that looks small is a conflict item', () => {
    const t = tpl('compare', {}, { representation: 'objects' as Representation });
    const it = generateItemFromParams(t, {
      set: 'attributes',
      rule: 'heavy',
      thing: 'rock',
      thing2: 'kite',
    });
    expect(it.difficulty).toBeCloseTo(0.8 + 0.4); // conflict + unseen (weight)
    const easy = generateItemFromParams(t, {
      set: 'attributes',
      rule: 'long',
      thing: 'rope',
      thing2: 'pebble',
    });
    expect(easy.difficulty).toBe(0);
  });

  it('builds every format from its default params', () => {
    for (const f of geoIdentify.formats) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const t = tpl(f);
        const it = generateItem(t, seed);
        expect(widgetConfigSchema.safeParse(it.widget).success).toBe(true);
        expect(checkResponse(it, itemExampleCorrect(it, t)).correct).toBe(true);
      }
    }
  });

  it('state answers have registered checkers', () => {
    expect(stateChecker('sort.byRule')).toBeDefined();
    expect(stateChecker('select.exactSet')).toBeDefined();
  });
});
