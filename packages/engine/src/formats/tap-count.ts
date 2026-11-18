// 03 §5.5 tap-count. Objects are addressed as `obj-<i>` (0-based, reading order); the trace uses the
// same ids, which MC.off-by-one-counting and MC.recount-from-one read.

import { tapCountConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import {
  argNumber,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'tap-count'>;

export interface TapCountState extends FormatState<'tap-count'> {
  /** Object indexes in tap order (a double tap appears twice). */
  taps: number[];
  /** Ordinal mode: the ringed object. */
  ringed: number | null;
  /** The entered count (numeral tray, pad or pick), or the spoken total. */
  answer: number | null;
}

const configSchema = tapCountConfigSchema.superRefine((c, ctx) => {
  if (c.mode === 'ordinal') {
    if (!c.ordinal)
      ctx.addIssue({ code: 'custom', path: ['ordinal'], message: 'ordinal mode needs ordinal' });
    else if (c.ordinal.k > c.set.count) {
      ctx.addIssue({
        code: 'custom',
        path: ['ordinal', 'k'],
        message: 'k exceeds the object count',
      });
    }
  }
  if (c.input === 'pick') {
    const opts = c.pickOptions ?? [];
    if (opts.length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['pickOptions'],
        message: 'pick input needs ≥ 3 options',
      });
    }
    if (new Set(opts).size !== opts.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['pickOptions'],
        message: 'pick options must be distinct',
      });
    }
    if (c.mode === 'how-many' && !opts.includes(c.set.count)) {
      ctx.addIssue({
        code: 'custom',
        path: ['pickOptions'],
        message: 'pick options must include the count',
      });
    }
  }
  if (c.set.layout === 'array' && !c.set.rows) {
    ctx.addIssue({ code: 'custom', path: ['set', 'rows'], message: 'array layout needs rows' });
  }
});

export const tapCount: FormatModel<'tap-count', TapCountState> = {
  format: 'tap-count',
  configSchema,
  features: {
    'count.over5': { weight: 0.5, doc: 'max(0, n − 5) / 5' },
    'layout.scatter': { weight: 0.4, doc: 'objects are scattered' },
    'layout.circle': { weight: 0.3, doc: 'objects are in a circle (no clear start)' },
    distractors: { weight: 0.3, doc: 'other objects that must not be counted' },
    'marks.off': { weight: 0.3, doc: 'tapped objects are not marked' },
    'ordinal.fromRight': { weight: 0.4, doc: 'ordinal counted from the right' },
  },
  featureValues(c: Config) {
    return {
      'count.over5': Math.max(0, c.set.count - 5) / 5,
      'layout.scatter': c.set.layout === 'scatter' ? 1 : 0,
      'layout.circle': c.set.layout === 'circle' ? 1 : 0,
      distractors: c.set.distractors && c.set.distractors.count > 0 ? 1 : 0,
      'marks.off': c.marks ? 0 : 1,
      'ordinal.fromRight': c.ordinal?.from === 'right' ? 1 : 0,
    };
  },
  initialState: (config) => ({ config, taps: [], ringed: null, answer: null }),
  apply(s, a) {
    const n = s.config.set.count;
    switch (a.op) {
      case 'tap': {
        const i = argNumber(a, 'index');
        if (i === undefined || i < 0 || i >= n) return s;
        return { ...s, taps: [...s.taps, i] };
      }
      case 'count-aloud': {
        // Demo: touch the first `upTo` untouched objects in order.
        const upTo = Math.min(argNumber(a, 'upTo') ?? n, n);
        const seen = new Set(s.taps);
        const taps = [...s.taps];
        for (let i = 0; i < upTo; i += 1) if (!seen.has(i)) taps.push(i);
        return { ...s, taps };
      }
      case 'ring': {
        const i = argNumber(a, 'index');
        return i === undefined || i < 0 || i >= n ? s : { ...s, ringed: i };
      }
      case 'say-total':
        return { ...s, answer: new Set(s.taps).size };
      case 'answer': {
        const v = argNumber(a, 'value');
        if (v !== undefined) return { ...s, answer: v };
        const id = argString(a, 'id');
        const m = id?.match(/^obj-(\d+)$/);
        return m ? { ...s, ringed: Number(m[1]) } : s;
      }
      default:
        throw new UnsupportedOpError('tap-count', a.op);
    }
  },
  toResponse(s) {
    if (s.config.mode === 'ordinal') {
      return s.ringed === null ? null : { kind: 'choice', id: `obj-${s.ringed}` };
    }
    return s.answer === null ? null : { kind: 'number', value: s.answer };
  },
};
