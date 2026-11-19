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

const configSchema = expandedFormConfigSchema.superRefine((c, ctx) => {
  if (!Number.isInteger(c.target) || c.target < 1) {
    ctx.addIssue({ code: 'custom', path: ['target'], message: 'target is a positive integer' });
    return;
  }
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
