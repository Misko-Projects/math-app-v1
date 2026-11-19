// sort.byRule `{ cards: { id, props }[], bins: { id, rule }[] }` (03 §5.5 shape-sort, mode sort).
// Response `{ bins: Record<binId, cardId[]> }`; a card listed in no bin is in the tray.
// Correct when every card sits in a bin whose rule it satisfies (any of them when several match,
// e.g. a square in "rectangles" or "rhombuses"), every card that satisfies some bin is in one, and
// every card that satisfies none stays in the tray. Each card is placed at most once.
import type { SortRule } from '@number-island/shared';
import type { StateChecker } from './types';

type Props = Readonly<Record<string, unknown>>;

/** 03 §5.5 SortRule over a card's flat props (`shape`, ShapeProps fields, object props). */
export function ruleMatches(rule: SortRule, props: Props): boolean {
  if ('all' in rule) return rule.all.every((r) => ruleMatches(r, props));
  if ('any' in rule) return rule.any.some((r) => ruleMatches(r, props));
  const v = props[rule.prop];
  switch (rule.op) {
    case '==':
      return v === rule.value;
    case '>=':
      return typeof v === 'number' && typeof rule.value === 'number' && v >= rule.value;
    case '<=':
      return typeof v === 'number' && typeof rule.value === 'number' && v <= rule.value;
    case 'in':
      return (
        Array.isArray(rule.value) &&
        (typeof v === 'string' || typeof v === 'number') &&
        rule.value.includes(v)
      );
    default:
      return false;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

function isRule(v: unknown): v is SortRule {
  if (!isRecord(v)) return false;
  if (Array.isArray(v.all)) return v.all.every(isRule);
  if (Array.isArray(v.any)) return v.any.every(isRule);
  return typeof v.prop === 'string' && typeof v.op === 'string' && 'value' in v;
}

export const sortByRule: StateChecker = {
  id: 'sort.byRule',
  check(target, value) {
    const cards = target.cards;
    const bins = target.bins;
    if (!Array.isArray(cards) || !Array.isArray(bins) || bins.length === 0) return false;
    const cardProps = new Map<string, Props>();
    for (const c of cards) {
      if (!isRecord(c) || typeof c.id !== 'string' || !isRecord(c.props)) return false;
      cardProps.set(c.id, c.props);
    }
    const rules = new Map<string, SortRule>();
    for (const b of bins) {
      if (!isRecord(b) || typeof b.id !== 'string' || !isRule(b.rule)) return false;
      rules.set(b.id, b.rule);
    }
    const placed = value.bins;
    if (!isRecord(placed)) return false;
    const binOf = new Map<string, string>();
    for (const [bin, ids] of Object.entries(placed)) {
      const rule = rules.get(bin);
      if (!rule || !Array.isArray(ids)) return false;
      for (const id of ids) {
        if (typeof id !== 'string' || binOf.has(id)) return false;
        const props = cardProps.get(id);
        if (!props || !ruleMatches(rule, props)) return false;
        binOf.set(id, bin);
      }
    }
    // A card that fits some bin must be placed; a card that fits none stays in the tray (checked
    // above: a placed card always matches its bin).
    for (const [id, props] of cardProps) {
      const fits = [...rules.values()].some((r) => ruleMatches(r, props));
      if (fits && !binOf.has(id)) return false;
    }
    return true;
  },
};
