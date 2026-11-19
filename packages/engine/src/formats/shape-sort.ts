// 03 §5.5 shape-sort: a general card sorter (shapes, solids, numbers, objects, coins, events).
// Cards have ids `c0`, `c1`, … in display order (K01, engine README).
// - `sort`: the child drags each card into a bin (`drag-card {id, bin}`; `bin: 'tray'` or
//   `remove: true` puts it back in the tray). Answers state `{ bins: Record<binId, cardId[]> }`
//   (`sort.byRule`); a card in no bin is in the tray. Every bin is listed, empty ones too.
// - `find-all`: the child taps every card that fits (`drag-card {id}` with no bin selects it,
//   `remove: true` takes it back). Answers state `{ ids }` in the order picked (`select.exactSet`).
// - `odd-one-out`: the child picks one card (`answer {id}`, or `drag-card {id}`). Answers
//   `choice` with the card id.
// `highlight-attribute {id, prop}` and `count-sides {id}` are visual (the widget marks the card's
// sides, corners or other attribute).

import {
  type AnswerSpec,
  type ShapeCard,
  type ShapeSortConfig,
  shapeSortConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import { ruleMatches } from '../check/state/sort.byRule';
import { argString, type FormatModel, type FormatState, UnsupportedOpError } from './types';

type Config = WidgetConfigOf<'shape-sort'>;
type Card = ShapeSortConfig['cards'][number]['card'];

/** The tray: where unsorted cards wait (`drag-card {bin: 'tray'}` puts a card back). */
export const TRAY = 'tray';

export interface ShapeSortState extends FormatState<'shape-sort'> {
  /** sort: the cards in each bin, in the order placed. */
  bins: Record<string, string[]>;
  /** find-all: the picked cards, in the order picked. */
  picked: string[];
  /** odd-one-out: the chosen card. */
  choice: string | null;
  /** The card and attribute the widget marks (`highlight-attribute`, `count-sides`). */
  highlight: { id: string; prop: string } | null;
}

export const isShapeCard = (card: Card): card is ShapeCard => !('kind' in card);

/**
 * The flat props a SortRule reads for a card (03 §5.5): `shape` plus every ShapeProps field for a
 * shape card (as `cardProps` in generators/geo/shapes.ts), an object card's own props, and the
 * value, coin or event of the other kinds.
 */
export function sortCardProps(card: Card): Record<string, string | number | boolean> {
  if (isShapeCard(card)) return { shape: card.shape, ...card.props };
  switch (card.kind) {
    case 'object':
      return { ...card.props };
    case 'number':
      return { value: card.value, even: card.value % 2 === 0 };
    case 'coin':
      return { coin: card.coin };
    case 'event':
      return card.isPm === undefined
        ? { event: card.event }
        : { event: card.event, isPm: card.isPm };
  }
}

/** A turned, resized or squashed shape (03 §5.5 `nonPrototypical`). */
export const isNonPrototypical = (card: Card): boolean =>
  isShapeCard(card) &&
  !card.props.solid &&
  (((card.rotationDeg % 360) + 360) % 360 !== 0 || card.scale !== 1);

/** An open figure or a curved near-circle among polygons (03 §5.5 `nearMiss`). */
export const isNearMiss = (card: Card): boolean =>
  isShapeCard(card) && (!card.props.closed || card.shape === 'oval');

const configSchema = shapeSortConfigSchema.superRefine((c, ctx) => {
  const ids = c.cards.map((x) => x.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['cards'], message: 'card ids must be distinct' });
  }
  if (ids.includes(TRAY)) {
    ctx.addIssue({ code: 'custom', path: ['cards'], message: `'${TRAY}' is not a card id` });
  }
  if (c.cards.length < 2) {
    ctx.addIssue({ code: 'custom', path: ['cards'], message: 'a sort needs at least two cards' });
  }
  c.cards.forEach((x, i) => {
    if (isShapeCard(x.card) && !(x.card.scale > 0)) {
      ctx.addIssue({ code: 'custom', path: ['cards', i, 'card', 'scale'], message: 'scale > 0' });
    }
  });
  if (c.mode === 'sort') {
    if (!c.bins || c.bins.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['bins'], message: 'sort needs two or more bins' });
    } else {
      const binIds = c.bins.map((b) => b.id);
      if (new Set(binIds).size !== binIds.length || binIds.includes(TRAY)) {
        ctx.addIssue({ code: 'custom', path: ['bins'], message: 'bin ids must be distinct' });
      }
    }
  } else if (c.bins !== null) {
    ctx.addIssue({ code: 'custom', path: ['bins'], message: `${c.mode} has no bins` });
  }
  // 03 §5.1: a pick shows at least three options.
  if (c.mode === 'odd-one-out' && c.cards.length < 3) {
    ctx.addIssue({ code: 'custom', path: ['cards'], message: 'odd-one-out shows ≥ 3 cards' });
  }
});

const cardIds = (c: Config): Set<string> => new Set(c.cards.map((x) => x.id));

/** Removes a card from every bin. */
const withoutCard = (bins: Record<string, string[]>, id: string): Record<string, string[]> =>
  Object.fromEntries(Object.entries(bins).map(([b, ids]) => [b, ids.filter((x) => x !== id)]));

export const shapeSort: FormatModel<'shape-sort', ShapeSortState> = {
  format: 'shape-sort',
  configSchema,
  features: {
    cards: { weight: 0.1, doc: 'cards − 4' },
    nonPrototypical: { weight: 0.6, doc: 'turned, skinny or resized shapes' },
    nearMiss: { weight: 0.6, doc: 'a near miss is shown (an open figure, an oval)' },
    overlappingBins: { weight: 0.8, doc: 'a card fits more than one bin' },
    'bins.over2': { weight: 0.2, doc: 'bins − 2' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    const bins = c.bins ?? [];
    const overlapping = c.cards.some((x) => {
      const props = sortCardProps(x.card);
      return bins.filter((b) => ruleMatches(b.rule, props)).length > 1;
    });
    return {
      cards: Math.max(0, c.cards.length - 4),
      nonPrototypical: c.cards.some((x) => isNonPrototypical(x.card)) ? 1 : 0,
      nearMiss: c.cards.some((x) => isNearMiss(x.card)) ? 1 : 0,
      overlappingBins: overlapping ? 1 : 0,
      'bins.over2': Math.max(0, bins.length - 2),
    };
  },
  initialState: (config) => ({
    config,
    bins: Object.fromEntries((config.bins ?? []).map((b) => [b.id, [] as string[]])),
    picked: [],
    choice: null,
    highlight: null,
  }),
  apply(s, a) {
    const c = s.config;
    const id = argString(a, 'id');
    const known = id !== undefined && cardIds(c).has(id);
    switch (a.op) {
      case 'drag-card': {
        if (!known) return s;
        const remove = a.args?.remove === true;
        if (c.mode === 'sort') {
          const bin = argString(a, 'bin');
          const bins = withoutCard(s.bins, id);
          if (remove || bin === TRAY) return { ...s, bins };
          if (bin === undefined || !(bin in s.bins)) return s;
          return { ...s, bins: { ...bins, [bin]: [...(bins[bin] ?? []), id] } };
        }
        if (c.mode === 'find-all') {
          if (remove) return { ...s, picked: s.picked.filter((x) => x !== id) };
          return s.picked.includes(id) ? s : { ...s, picked: [...s.picked, id] };
        }
        return { ...s, choice: remove ? null : id };
      }
      case 'highlight-attribute': {
        if (!known) return s;
        return { ...s, highlight: { id, prop: argString(a, 'prop') ?? 'shape' } };
      }
      case 'count-sides':
        return known ? { ...s, highlight: { id, prop: 'sides' } } : s;
      case 'answer': {
        if (!known) return s;
        if (c.mode === 'odd-one-out') return { ...s, choice: id };
        if (c.mode === 'find-all' && !s.picked.includes(id)) {
          return { ...s, picked: [...s.picked, id] };
        }
        return s;
      }
      default:
        throw new UnsupportedOpError('shape-sort', a.op);
    }
  },
  toResponse(s) {
    switch (s.config.mode) {
      case 'sort': {
        if (Object.values(s.bins).every((ids) => ids.length === 0)) return null;
        return {
          kind: 'state',
          value: {
            bins: Object.fromEntries(Object.entries(s.bins).map(([b, ids]) => [b, [...ids]])),
          },
        };
      }
      case 'find-all':
        return s.picked.length === 0 ? null : { kind: 'state', value: { ids: [...s.picked] } };
      case 'odd-one-out':
        return s.choice === null ? null : { kind: 'choice', id: s.choice };
    }
  },
};
