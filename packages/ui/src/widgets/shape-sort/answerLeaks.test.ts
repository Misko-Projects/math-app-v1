import { resetContent } from '@number-island/engine';
import type { GeneratedItem, ShapeCard, ShapeSortConfig, SortRule } from '@number-island/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { shippedItems } from '../shippedItems';
import { binPictureCard, cardNameKey, cardSpeech } from './ShapeSortWidget';

// Content walk (Refs #35): over every shipped shape-sort item, no card says or carries a name
// that answers the item, and no bin shows a card of the item, unless the config marks it as
// given. Written against the compiled content, so a new template cannot bring a leak back.

type Card = ShapeSortConfig['cards'][number];
const isShape = (c: Card['card']): c is ShapeCard => !('kind' in c);
const isPicture = (c: Card['card']) => isShape(c) || c.kind === 'object' || c.kind === 'coin';

/** The props a card's name does not state: what a named card may still be asked about. */
function askableWhenNamed(c: Card['card'], prop: string): boolean {
  if (isShape(c)) return ['sides', 'corners', 'faces', 'color', 'size'].includes(prop);
  if (c.kind === 'object') return prop !== 'kind';
  if (c.kind === 'coin') return prop !== 'coin';
  return true;
}

function ruleProps(r: SortRule, into: Set<string> = new Set()): Set<string> {
  if ('prop' in r) into.add(r.prop);
  else for (const x of 'all' in r ? r.all : r.any) ruleProps(x, into);
  return into;
}

const COUNTS = ['sides', 'corners', 'faces'] as const;
const count = (c: Card['card'], p: (typeof COUNTS)[number]) =>
  isShape(c) ? c.props[p] : undefined;

/** A named find-all or odd-one-out is fair only when a count (not the name) picks its answer. */
function countPicksAnswer(item: GeneratedItem, w: ShapeSortConfig): boolean {
  const a = item.answer;
  return COUNTS.some((p) => {
    const v = (c: Card) => count(c.card, p);
    if (w.mode === 'find-all' && a.kind === 'state') {
      const ids = new Set((a.target as { ids: string[] }).ids);
      const hit = w.cards.find((c) => ids.has(c.id));
      return hit !== undefined && w.cards.every((c) => (v(c) === v(hit)) === ids.has(c.id));
    }
    if (w.mode === 'odd-one-out' && a.kind === 'choice') {
      const odd = w.cards.find((c) => c.id === a.id);
      const rest = w.cards.filter((c) => c.id !== a.id);
      return (
        odd !== undefined &&
        rest.every((c) => v(c) === v(rest[0] as Card)) &&
        v(odd) !== v(rest[0] as Card)
      );
    }
    return false;
  });
}

afterAll(() => resetContent());

describe('shape-sort never says or shows the answer on shipped items', () => {
  const items = shippedItems('shape-sort');

  it('walks the shipped catalog', () => {
    expect(new Set(items.map((i) => i.templateId)).size).toBeGreaterThan(15);
  });

  it('a tap says a picture card aloud only where its name is given', () => {
    const bad = new Set<string>();
    for (const item of items) {
      const w = item.widget as ShapeSortConfig;
      for (const c of w.cards) {
        if (!isPicture(c.card) || w.namesGiven) continue;
        const s = cardSpeech(w, c);
        if (!('key' in s) || s.spoken) bad.add(`${item.templateId} ${c.id}`);
      }
    }
    expect([...bad]).toEqual([]);
  });

  it('a flat shape among flat shapes carries its name only where its counts are not unique', () => {
    const bad = new Set<string>();
    let described = 0;
    for (const item of items) {
      const w = item.widget as ShapeSortConfig;
      if (w.namesGiven) continue;
      if (w.cards.some((c) => !isShape(c.card) || c.card.props.solid)) continue;
      for (const c of w.cards) {
        if (!isShape(c.card)) continue;
        const card = c.card;
        const sameCounts = w.cards.some(
          (x) =>
            isShape(x.card) &&
            x.card.shape !== card.shape &&
            x.card.props.sides === card.props.sides &&
            x.card.props.corners === card.props.corners,
        );
        const s = cardSpeech(w, c);
        if (!('key' in s)) bad.add(`${item.templateId} ${c.id}`);
        else if (s.key === cardNameKey(card) && !sameCounts) bad.add(`${item.templateId} ${c.id}`);
        else if (s.key !== cardNameKey(card)) described += 1;
      }
    }
    expect([...bad]).toEqual([]);
    expect(described).toBeGreaterThan(0);
  });

  it('a screen reader can tell every two kinds of card apart (review round 1: GEO.08.t4)', () => {
    const bad = new Set<string>();
    const kindOf = (c: Card) =>
      isShape(c.card) ? c.card.shape : JSON.stringify(c.card).replace(/"id":"[^"]*",?/, '');
    for (const item of items) {
      const w = item.widget as ShapeSortConfig;
      const nameOf = (c: Card) => {
        const s = cardSpeech(w, c);
        // The place ("Shape N") is not the picture: compare what the label says about the card.
        return 'number' in s ? `n${s.number}` : JSON.stringify([s.key, { ...s.vars, n: 0 }]);
      };
      for (const a of w.cards)
        for (const b of w.cards)
          if (kindOf(a) !== kindOf(b) && nameOf(a) === nameOf(b))
            bad.add(`${item.templateId} ${kindOf(a)}/${kindOf(b)}`);
    }
    expect([...bad]).toEqual([]);
  });

  it('names are given only where they do not answer the item', () => {
    const bad = new Set<string>();
    for (const item of items) {
      const w = item.widget as ShapeSortConfig;
      if (!w.namesGiven) continue;
      const pictures = w.cards.filter((c) => isPicture(c.card));
      if (pictures.length === 0) continue;
      if (w.mode === 'sort') {
        // A bin that shows its category's picture already shows what the name says.
        if (w.binPicturesGiven) continue;
        const props = new Set((w.bins ?? []).flatMap((b) => [...ruleProps(b.rule)]));
        for (const c of pictures)
          for (const p of props)
            if (!askableWhenNamed(c.card, p)) bad.add(`${item.templateId} ${p}`);
      } else if (pictures.some((c) => isShape(c.card)) && !countPicksAnswer(item, w)) {
        bad.add(`${item.templateId} ${w.mode}`);
      }
    }
    expect([...bad]).toEqual([]);
  });

  it('a bin shows one of the cards only where its picture is given', () => {
    const bad = new Set<string>();
    for (const item of items) {
      const w = item.widget as ShapeSortConfig;
      for (const b of w.bins ?? [])
        if (binPictureCard(w, b) !== null && !w.binPicturesGiven) bad.add(item.templateId);
    }
    expect([...bad]).toEqual([]);
  });

  it('every card still has an accessible name', () => {
    for (const item of items) {
      const w = item.widget as ShapeSortConfig;
      for (const c of w.cards) {
        const s = cardSpeech(w, c);
        expect('number' in s || s.key.length > 0).toBe(true);
      }
    }
  });
});
