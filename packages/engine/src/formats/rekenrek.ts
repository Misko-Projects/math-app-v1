// 03 §5.5 rekenrek. Ten beads per row (five red, five white). State: beads pushed left per row.
// `read` answers with a number; the other modes answer with state `{ rows, value? }`.

import { rekenrekConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import { argNumber, type FormatModel, type FormatState, UnsupportedOpError } from './types';

type Config = WidgetConfigOf<'rekenrek'>;

export const BEADS_PER_ROW = 10;

export interface RekenrekState extends FormatState<'rekenrek'> {
  rows: [number, number];
  value: number | null;
  highlighted: { row: number; upTo: number } | null;
}

const configSchema = rekenrekConfigSchema.superRefine((c, ctx) => {
  const capacity = c.rows * BEADS_PER_ROW;
  if (c.preset.some((p) => p > BEADS_PER_ROW) || (c.rows === 1 && c.preset[1] !== 0)) {
    ctx.addIssue({ code: 'custom', path: ['preset'], message: 'preset beads exceed the rows' });
  }
  if (c.mode !== 'read' && (c.target === undefined || c.target > capacity)) {
    ctx.addIssue({ code: 'custom', path: ['target'], message: 'target must fit on the rows' });
  }
  if (c.mode === 'add' && (c.a === undefined || c.b === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['a'], message: 'add mode needs a and b' });
  }
});

export const rekenrek: FormatModel<'rekenrek', RekenrekState> = {
  format: 'rekenrek',
  configSchema,
  features: {
    'n.over10': { weight: 0.4, doc: 'the total is above 10' },
    'mode.add': { weight: 0.3, doc: 'add mode' },
    rowRule: { weight: 0.2, doc: 'the top row must be filled first' },
    'preset.nonzero': { weight: 0.2, doc: 'beads are already pushed over' },
  },
  featureValues(c: Config) {
    const n = c.mode === 'read' ? c.preset[0] + c.preset[1] : (c.target ?? 0);
    return {
      'n.over10': n > 10 ? 1 : 0,
      'mode.add': c.mode === 'add' ? 1 : 0,
      rowRule: c.rowRule === 'fill-top-first' ? 1 : 0,
      'preset.nonzero': c.mode !== 'read' && c.preset[0] + c.preset[1] > 0 ? 1 : 0,
    };
  },
  initialState: (config) => ({ config, rows: [...config.preset], value: null, highlighted: null }),
  apply(s, a) {
    switch (a.op) {
      case 'slide': {
        const row = argNumber(a, 'row') ?? 0;
        const count = Math.trunc(argNumber(a, 'count') ?? 0);
        if ((row !== 0 && row !== 1) || row >= s.config.rows) return s;
        const rows: [number, number] = [...s.rows];
        rows[row] = Math.max(0, Math.min(BEADS_PER_ROW, rows[row] + count));
        return { ...s, rows };
      }
      case 'highlight':
        return {
          ...s,
          highlighted: { row: argNumber(a, 'row') ?? 0, upTo: argNumber(a, 'upTo') ?? 0 },
        };
      case 'count-total':
        return { ...s, value: s.rows[0] + s.rows[1] };
      case 'answer': {
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('rekenrek', a.op);
    }
  },
  toResponse(s) {
    if (s.config.mode === 'read') {
      return s.value === null ? null : { kind: 'number', value: s.value };
    }
    return {
      kind: 'state',
      value: { rows: [...s.rows], ...(s.value !== null ? { value: s.value } : {}) },
    };
  },
};
