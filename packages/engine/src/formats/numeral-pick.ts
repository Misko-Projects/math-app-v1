// 03 §5.5 numeral-pick. Three to five distinct options, exactly one correct. Generators that pick a
// number use option ids `opt-<value>` so misconception rules can read the picked number back.

import {
  type AnswerSpec,
  numeralPickConfigSchema,
  type ResponseValue,
  type WidgetConfigOf,
} from '@number-island/shared';
import { argString, type FormatModel, type FormatState, UnsupportedOpError } from './types';

type Config = WidgetConfigOf<'numeral-pick'>;

export interface NumeralPickState extends FormatState<'numeral-pick'> {
  highlighted: string | null;
  selected: string | null;
}

/** Option id for a numeric option. */
export const numberOptionId = (value: number): string => `opt-${value}`;

/** The number a numeric option id stands for, or null. */
export function optionNumber(id: string): number | null {
  const m = id.match(/^opt-(-?\d+)$/);
  return m ? Number(m[1]) : null;
}

/** A number response or a numeric pick, read as a number (misconception rules). */
export function responseNumber(r: ResponseValue): number | null {
  if (r.kind === 'number') return r.value;
  if (r.kind === 'choice') return optionNumber(r.id);
  return null;
}

const configSchema = numeralPickConfigSchema.superRefine((c, ctx) => {
  if (c.options.length < 3 || c.options.length > 5) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'numeral-pick shows 3–5 options' });
  }
  const ids = c.options.map((o) => o.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'option ids must be distinct' });
  }
  const labels = c.options.map((o) => o.label).filter((l) => l !== undefined);
  if (new Set(labels).size !== labels.length) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'option labels must be distinct' });
  }
});

export const numeralPick: FormatModel<'numeral-pick', NumeralPickState> = {
  format: 'numeral-pick',
  configSchema,
  features: {
    options: { weight: 0.15, doc: 'option count − 3' },
    'distractors.diagnostic': { weight: 0.2, doc: 'each diagnostic (misconception) distractor' },
    'stimulus.audioOnly': { weight: 0.2, doc: 'no picture; the question is only heard' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    return {
      options: Math.max(0, c.options.length - 3),
      // Generators that add diagnostic distractors report the count themselves (generator value wins).
      'distractors.diagnostic': 0,
      'stimulus.audioOnly': c.stimulus.kind === 'none' ? 1 : 0,
    };
  },
  initialState: (config) => ({ config, highlighted: null, selected: null }),
  apply(s, a) {
    const id = argString(a, 'id');
    const known = id !== undefined && s.config.options.some((o) => o.id === id);
    switch (a.op) {
      case 'highlight':
        return known ? { ...s, highlighted: id } : s;
      case 'tap':
      case 'answer':
        return known ? { ...s, selected: id } : s;
      default:
        throw new UnsupportedOpError('numeral-pick', a.op);
    }
  },
  toResponse: (s) => (s.selected === null ? null : { kind: 'choice', id: s.selected }),
};
