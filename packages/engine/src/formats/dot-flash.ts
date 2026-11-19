// 03 §5.5 dot-flash. The stimulus shows for `flashMs`, then hides; the child answers on the pad or
// by picking. A re-flash counts as the level-1 hint.

import {
  dotFlashConfigSchema,
  type StimulusSpec,
  type WidgetConfigOf,
} from '@number-island/shared';
import { argNumber, type FormatModel, type FormatState, UnsupportedOpError } from './types';

type Config = WidgetConfigOf<'dot-flash'>;

export interface DotFlashState extends FormatState<'dot-flash'> {
  flashes: number;
  shown: boolean;
  circledGroups: number[] | null;
  answer: number | null;
}

/** The quantity a flash stimulus shows (sum of its groups or object count). */
export function stimulusQuantity(s: StimulusSpec): number | null {
  switch (s.kind) {
    case 'dots':
      return s.groups.reduce((a, b) => a + b, 0);
    case 'objects':
      return s.set.count;
    case 'ten-frame':
      return s.filled.reduce((a, b) => a + b, 0);
    case 'rekenrek':
      return s.rows[0] + s.rows[1];
    case 'base-ten':
      // A quick-read base-ten picture (SUB.08): its value in units (hundredths when wholeIs flat).
      return (s.thousands ?? 0) * 1000 + s.hundreds * 100 + s.tens * 10 + s.ones;
    default:
      return null;
  }
}

/** Visible groups in a flash stimulus (dots groups, filled frames, rekenrek rows in use). */
export function stimulusGroups(s: StimulusSpec): number {
  switch (s.kind) {
    case 'dots':
      return s.groups.filter((g) => g > 0).length;
    case 'objects':
      return Math.max(1, (s.set.groups ?? [s.set.count]).filter((g) => g > 0).length);
    case 'ten-frame':
      return s.filled.filter((g) => g > 0).length;
    case 'rekenrek':
      return s.rows.filter((g) => g > 0).length;
    case 'base-ten':
      // One group per kind of piece shown (tens, ones, …).
      return Math.max(
        1,
        [s.thousands ?? 0, s.hundreds, s.tens, s.ones].filter((g) => g > 0).length,
      );
    default:
      return 1;
  }
}

const UNSTRUCTURED = new Set(['scatter']);

const configSchema = dotFlashConfigSchema.superRefine((c, ctx) => {
  if (stimulusQuantity(c.stimulus) === null) {
    ctx.addIssue({ code: 'custom', path: ['stimulus'], message: 'stimulus must show a quantity' });
  }
  if (c.input === 'pick') {
    const opts = c.pickOptions ?? [];
    const n = stimulusQuantity(c.stimulus);
    if (
      opts.length < 3 ||
      new Set(opts).size !== opts.length ||
      (n !== null && !opts.includes(n))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['pickOptions'],
        message: 'pick input needs ≥ 3 distinct options including the answer',
      });
    }
  }
});

export const dotFlash: FormatModel<'dot-flash', DotFlashState> = {
  format: 'dot-flash',
  configSchema,
  features: {
    'n.over4': { weight: 0.25, doc: 'units above 4' },
    'arrangement.unstructured': { weight: 0.6, doc: 'scattered, not a known pattern' },
    'flash.short': { weight: 0.4, doc: 'flashMs ≤ 700' },
    groups: { weight: 0.2, doc: 'visible groups − 1' },
  },
  featureValues(c: Config) {
    const n = stimulusQuantity(c.stimulus) ?? 0;
    const arrangement =
      c.stimulus.kind === 'dots'
        ? c.stimulus.arrangement
        : c.stimulus.kind === 'objects'
          ? c.stimulus.set.layout
          : 'structured';
    return {
      'n.over4': Math.max(0, n - 4),
      'arrangement.unstructured': UNSTRUCTURED.has(arrangement) ? 1 : 0,
      'flash.short': c.flashMs <= 700 ? 1 : 0,
      groups: Math.max(0, stimulusGroups(c.stimulus) - 1),
    };
  },
  initialState: (config) => ({
    config,
    flashes: 0,
    shown: false,
    circledGroups: null,
    answer: null,
  }),
  apply(s, a) {
    switch (a.op) {
      case 'flash':
        return { ...s, flashes: s.flashes + 1, shown: false };
      case 'show':
        return { ...s, shown: true };
      case 'circle-groups': {
        const g = a.args?.groups;
        return {
          ...s,
          shown: true,
          circledGroups: Array.isArray(g)
            ? g.filter((x): x is number => typeof x === 'number')
            : null,
        };
      }
      case 'answer': {
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, answer: v };
      }
      default:
        throw new UnsupportedOpError('dot-flash', a.op);
    }
  },
  toResponse: (s) => (s.answer === null ? null : { kind: 'number', value: s.answer }),
};
