// 03 §5.5 number-pad. One blank answers with `number`; several blanks answer with `numbers` in
// blank (reading) order.

import { type AnswerSpec, numberPadConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import {
  argNumber,
  argNumbers,
  argString,
  digitCount,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'number-pad'>;

export interface NumberPadState extends FormatState<'number-pad'> {
  entries: (number | null)[];
  highlighted: string | null;
  stimulusShown: boolean;
}

const configSchema = numberPadConfigSchema.superRefine((c, ctx) => {
  if (c.blanks.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['blanks'],
      message: 'number-pad needs at least one blank',
    });
  }
  const ids = c.blanks.map((b) => b.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['blanks'], message: 'blank ids must be distinct' });
  }
  // A stacked fraction's blank top or bottom is the box `frac-<token index>-a` / `-b` (FRA.05).
  const exprBlanks = (c.expression?.tokens ?? []).flatMap((t, i) =>
    t.t === 'blank'
      ? [t.id]
      : t.t === 'frac'
        ? [...(t.a === 'blank' ? [`frac-${i}-a`] : []), ...(t.b === 'blank' ? [`frac-${i}-b`] : [])]
        : [],
  );
  if (c.expression && exprBlanks.join('|') !== ids.join('|')) {
    ctx.addIssue({
      code: 'custom',
      path: ['expression'],
      message: 'expression blanks must match the blanks list, in reading order',
    });
  }
});

export const numberPad: FormatModel<'number-pad', NumberPadState> = {
  format: 'number-pad',
  configSchema,
  features: {
    'answer.digits': { weight: 0.3, doc: 'digits of the answer − 1' },
    blanks: { weight: 0.3, doc: 'blank count − 1' },
  },
  featureValues(c: Config, answer: AnswerSpec) {
    const values =
      answer.kind === 'number' ? [answer.value] : answer.kind === 'numbers' ? answer.values : [0];
    return {
      'answer.digits': Math.max(0, Math.max(...values.map(digitCount)) - 1),
      blanks: Math.max(0, c.blanks.length - 1),
    };
  },
  initialState: (config) => ({
    config,
    entries: config.blanks.map(() => null),
    highlighted: null,
    stimulusShown: false,
  }),
  apply(s, a) {
    switch (a.op) {
      case 'type': {
        const blank = argString(a, 'blank') ?? s.config.blanks[0]?.id;
        const i = s.config.blanks.findIndex((b) => b.id === blank);
        const v = argNumber(a, 'value');
        if (i < 0 || v === undefined) return s;
        const entries = [...s.entries];
        entries[i] = v;
        return { ...s, entries };
      }
      case 'highlight':
        return { ...s, highlighted: argString(a, 'token') ?? null };
      case 'show-stimulus':
        return { ...s, stimulusShown: true };
      case 'answer': {
        const values = argNumbers(a, 'values');
        const v = argNumber(a, 'value');
        if (values) return { ...s, entries: s.config.blanks.map((_, i) => values[i] ?? null) };
        if (v !== undefined)
          return { ...s, entries: s.config.blanks.map((_, i) => (i === 0 ? v : null)) };
        return s;
      }
      default:
        throw new UnsupportedOpError('number-pad', a.op);
    }
  },
  toResponse(s) {
    if (s.entries.some((e) => e === null)) return null;
    const values = s.entries as number[];
    return values.length === 1
      ? { kind: 'number', value: values[0] as number }
      : { kind: 'numbers', values };
  },
};
