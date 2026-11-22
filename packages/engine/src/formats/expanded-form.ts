// 03 §5.5 expanded-form. Place-value cards (300, 40, 5) and expanded expressions.
// - `build`: the child picks cards from `cards` (a multiset); answers `numbers`, unordered.
// - `fill`: an expression with blanks (`300 + _ + 5 = 345`); `place-card` drops a card in the next
//   empty blank (`{ remove: true, blank }` empties one), `answer` types them; one blank answers `number`, several `numbers` in order.
// - `to-standard`, `digit-value`: answer `number`. `digitIndex` counts digits from the left.
// - `words`: answer `choice` (a `wordOptions` id), or `number` when there are no word options.
// `stack-cards` slides the placed cards together (visual); `highlight-digit {index}` highlights a
// digit of the target, counted from the left.

import {
  type AnswerSpec,
  expandedFormConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import { hasInternalZero, isPlaceValue } from './place-value';
import {
  argNumber,
  argNumbers,
  argString,
  digitCount,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'expanded-form'>;

export interface ExpandedFormState extends FormatState<'expanded-form'> {
  /** `build`: the card values placed, in the order placed. */
  placed: number[];
  /** `fill`: one entry per expression blank, in reading order. */
  entries: (number | null)[];
  value: number | null;
  choice: string | null;
  stacked: boolean;
  highlightedDigit: number | null;
}

/** The expression's blank ids, in reading order. */
export const blankIds = (c: Config): string[] =>
  (c.expression?.tokens ?? []).flatMap((t) => (t.t === 'blank' ? [t.id] : []));

/**
 * Whether some sub-multiset of `cards` sums to `target`: subset sum over the reachable sums up to
 * the target, so it stays fast however many cards there are.
 */
export function cardsReach(cards: readonly number[], target: number): boolean {
  if (!(target > 0)) return false;
  let sums = new Set<number>([0]);
  for (const card of cards) {
    if (!(card > 0)) continue;
    const next = new Set(sums);
    for (const s of sums) if (s + card <= target) next.add(s + card);
    sums = next;
    if (sums.has(target)) return true;
  }
  return false;
}

/** Copies of `v` left among the cards after `placed`. */
function cardsLeft(c: Config, placed: readonly number[], v: number): number {
  const have = (c.cards ?? []).filter((x) => x === v).length;
  return have - placed.filter((x) => x === v).length;
}

/**
 * The supported domain (PR #74), well above shipped content (targets to 99) and what the widget's
 * stress stories draw at 1280 × 800: a four-digit number, seven cards, four blanks, four word
 * cards.
 */
export const EF_TARGET_MAX = 9999;
/**
 * pv.number deals a target's four terms and three near misses. Seven cards fit the tray even when
 * each carries the biggest picture of its place (the widget's StressSevenWideCards story).
 */
export const EF_CARDS_MAX = 7;
/** A card may be one place too far (pv.number's near miss for 1111 is 10000): five digits. */
export const EF_CARD_MAX = 90_000;
export const EF_BLANKS_MAX = 4;
/**
 * Three bracketed pairs, as mda.addsub groups a three-digit sum by place:
 * `(300 + 200) + (40 + 30) + (7 + 2)`. A four-blank fill (`□ + □ + □ + □ = 9999`) has nine.
 */
export const EF_TOKENS_MAX = 17;
export const EF_WORD_OPTIONS_MAX = 4;
const EF_TOKEN_KINDS: readonly string[] = ['num', 'op', 'rel', 'blank', 'paren'];

/** Where a config leaves the supported domain: every number and every list has a bound. */
export function domainIssues(c: Config): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = [];
  const whole = (v: number, lo: number) => Number.isInteger(v) && v >= lo && v <= EF_TARGET_MAX;
  if (!whole(c.target, 1)) {
    out.push({
      path: ['target'],
      message: `target is a whole number from 1 to ${EF_TARGET_MAX}; got ${c.target}`,
    });
  }
  const cards = c.cards ?? [];
  if (cards.length > EF_CARDS_MAX) {
    out.push({
      path: ['cards'],
      message: `at most ${EF_CARDS_MAX} cards fit the tray; got ${cards.length}`,
    });
  }
  cards.forEach((v, i) => {
    if (!(Number.isInteger(v) && v >= 1 && v <= EF_CARD_MAX)) {
      out.push({
        path: ['cards', i],
        message: `a card is a whole number from 1 to ${EF_CARD_MAX}; got ${v}`,
      });
    }
  });
  const tokens = c.expression?.tokens ?? [];
  if (tokens.length > EF_TOKENS_MAX) {
    out.push({
      path: ['expression', 'tokens'],
      message: `at most ${EF_TOKENS_MAX} expression tokens fit; got ${tokens.length}`,
    });
  }
  tokens.forEach((t, i) => {
    if (!EF_TOKEN_KINDS.includes(t.t)) {
      out.push({
        path: ['expression', 'tokens', i],
        message: `an expanded expression has numbers, signs, brackets and blanks only; got a ${t.t} token`,
      });
    } else if (t.t === 'num' && !whole(t.v, 0)) {
      out.push({
        path: ['expression', 'tokens', i, 'v'],
        message: `a term is a whole number from 0 to ${EF_TARGET_MAX}; got ${t.v}`,
      });
    }
  });
  const blanks = blankIds(c).length;
  if (blanks > EF_BLANKS_MAX) {
    out.push({
      path: ['expression', 'tokens'],
      message: `at most ${EF_BLANKS_MAX} blanks (one a place); got ${blanks}`,
    });
  }
  const options = c.wordOptions?.length ?? 0;
  if (options > EF_WORD_OPTIONS_MAX) {
    out.push({
      path: ['wordOptions'],
      message: `at most ${EF_WORD_OPTIONS_MAX} word cards fit; got ${options}`,
    });
  }
  return out;
}

const configSchema = expandedFormConfigSchema.superRefine((c, ctx) => {
  const domain = domainIssues(c);
  for (const d of domain) ctx.addIssue({ code: 'custom', ...d });
  if (domain.length > 0) return;
  if (c.mode === 'build' && !(c.cards && cardsReach(c.cards, c.target))) {
    ctx.addIssue({
      code: 'custom',
      path: ['cards'],
      message: 'build needs cards that add up to the target',
    });
  }
  if (c.mode === 'fill' && blankIds(c).length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['expression'],
      message: 'fill needs an expression with blanks',
    });
  }
  const ids = blankIds(c);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['expression'], message: 'blank ids must be distinct' });
  }
  if (c.mode === 'to-standard' && !c.expression) {
    ctx.addIssue({
      code: 'custom',
      path: ['expression'],
      message: 'to-standard shows the expanded expression',
    });
  }
  if (
    c.mode === 'digit-value' &&
    (c.digitIndex === undefined || c.digitIndex >= digitCount(c.target))
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['digitIndex'],
      message: 'digit-value needs a digit of the target',
    });
  }
  if (c.wordOptions) {
    const optIds = c.wordOptions.map((o) => o.id);
    if (optIds.length < 2 || new Set(optIds).size !== optIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['wordOptions'],
        message: 'word options need at least two distinct ids',
      });
    }
  }
});

/** The number values an item shows or asks for, other than the target itself. */
function shownTerms(c: Config, answer: AnswerSpec): number[] {
  const terms = (c.expression?.tokens ?? []).flatMap((t) => (t.t === 'num' ? [t.v] : []));
  if (answer.kind === 'number') terms.push(answer.value);
  if (answer.kind === 'numbers') terms.push(...answer.values);
  return terms.filter((v) => v !== c.target);
}

export const expandedForm: FormatModel<'expanded-form', ExpandedFormState> = {
  format: 'expanded-form',
  configSchema,
  features: {
    digits: { weight: 0.5, doc: 'digits of the target − 1' },
    'zero.internal': { weight: 0.6, doc: 'the target has a zero between its first and last digit' },
    unusualOrder: { weight: 0.5, doc: 'the parts are not in place-value order (5 + 300 + 40)' },
    'mode.words': { weight: 0.4, doc: 'words mode' },
    nonCanonical: { weight: 0.7, doc: 'a part is not one digit and zeros (2 tens 14 ones)' },
  },
  featureValues(c: Config, answer: AnswerSpec) {
    return {
      digits: Math.max(0, digitCount(c.target) - 1),
      'zero.internal': hasInternalZero(c.target) ? 1 : 0,
      unusualOrder: c.unusualOrder ? 1 : 0,
      'mode.words': c.mode === 'words' ? 1 : 0,
      nonCanonical: shownTerms(c, answer).some((v) => v !== 0 && !isPlaceValue(v)) ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    placed: [],
    entries: blankIds(config).map(() => null),
    value: null,
    choice: null,
    stacked: false,
    highlightedDigit: null,
  }),
  apply(s, a) {
    const c = s.config;
    switch (a.op) {
      case 'place-card': {
        const v = argNumber(a, 'value');
        if (c.mode === 'fill' && a.args?.remove === true) {
          // Take the card out of one blank: `{ remove: true, blank }`.
          const i = blankIds(c).indexOf(argString(a, 'blank') ?? '');
          if (i < 0 || s.entries[i] === null) return s;
          const entries = [...s.entries];
          entries[i] = null;
          return { ...s, entries };
        }
        if (v === undefined) return s;
        if (c.mode === 'fill') {
          const i = s.entries.indexOf(null);
          if (i < 0) return s;
          const entries = [...s.entries];
          entries[i] = v;
          return { ...s, entries };
        }
        if (c.mode !== 'build') return s;
        if (a.args?.remove === true) {
          const i = s.placed.lastIndexOf(v);
          if (i < 0) return s;
          return { ...s, placed: s.placed.filter((_, j) => j !== i), stacked: false };
        }
        if (cardsLeft(c, s.placed, v) <= 0) return s;
        return { ...s, placed: [...s.placed, v], stacked: false };
      }
      case 'stack-cards':
        return { ...s, stacked: true };
      case 'highlight-digit': {
        const i = argNumber(a, 'index');
        return { ...s, highlightedDigit: i === undefined ? null : i };
      }
      case 'answer': {
        const id = argString(a, 'id');
        const values = argNumbers(a, 'values');
        const v = argNumber(a, 'value');
        if (c.mode === 'build') {
          const vs = values ?? (v !== undefined ? [v] : undefined);
          return vs ? { ...s, placed: [...vs] } : s;
        }
        if (c.mode === 'fill') {
          if (values) return { ...s, entries: s.entries.map((_, i) => values[i] ?? null) };
          if (v !== undefined) return { ...s, entries: s.entries.map((e, i) => (i === 0 ? v : e)) };
          return s;
        }
        if (id !== undefined) return { ...s, choice: id };
        return v === undefined ? s : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('expanded-form', a.op);
    }
  },
  toResponse(s) {
    const c = s.config;
    switch (c.mode) {
      case 'build':
        return s.placed.length === 0 ? null : { kind: 'numbers', values: [...s.placed] };
      case 'fill': {
        if (s.entries.some((e) => e === null)) return null;
        const values = s.entries as number[];
        return values.length === 1
          ? { kind: 'number', value: values[0] as number }
          : { kind: 'numbers', values };
      }
      case 'words':
        if (c.wordOptions) return s.choice === null ? null : { kind: 'choice', id: s.choice };
        return s.value === null ? null : { kind: 'number', value: s.value };
      default:
        return s.value === null ? null : { kind: 'number', value: s.value };
    }
  },
};
