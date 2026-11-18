// 03 §5.5 number-bond. Slots are `whole`, `part-0` and `part-1`. Missing-part and missing-whole
// answer with the number in the missing slot; split and new-way answer with state `{ parts }`.

import { numberBondConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import {
  argNumber,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'number-bond'>;

export interface NumberBondState extends FormatState<'number-bond'> {
  whole: number | null;
  parts: (number | null)[];
  highlighted: string | null;
}

const configSchema = numberBondConfigSchema.superRefine((c, ctx) => {
  if (c.parts.length !== 2) {
    ctx.addIssue({ code: 'custom', path: ['parts'], message: 'a number bond has two parts' });
  }
  const blanks = (c.whole === null ? 1 : 0) + c.parts.filter((p) => p === null).length;
  if (c.mode === 'missing-part' && !(c.whole !== null && blanks === 1)) {
    ctx.addIssue({
      code: 'custom',
      path: ['parts'],
      message: 'missing-part hides exactly one part',
    });
  }
  if (c.mode === 'missing-whole' && !(c.whole === null && blanks === 1)) {
    ctx.addIssue({
      code: 'custom',
      path: ['whole'],
      message: 'missing-whole hides only the whole',
    });
  }
  if ((c.mode === 'split' || c.mode === 'new-way') && !(c.whole !== null && blanks === 2)) {
    ctx.addIssue({
      code: 'custom',
      path: ['parts'],
      message: 'split shows the whole and two blank parts',
    });
  }
  if (c.mode === 'new-way' && !c.found) {
    ctx.addIssue({
      code: 'custom',
      path: ['found'],
      message: 'new-way lists the splits already found',
    });
  }
});

/** The slot a missing-part/missing-whole item asks for. */
export function missingSlot(c: Config): string {
  if (c.whole === null) return 'whole';
  return c.parts[0] === null ? 'part-0' : 'part-1';
}

export const numberBond: FormatModel<'number-bond', NumberBondState> = {
  format: 'number-bond',
  configSchema,
  features: {
    'whole.over5': { weight: 0.4, doc: 'max(0, whole − 5) / 5' },
    teen: { weight: 0.5, doc: 'whole > 10' },
    'mode.missingPart': { weight: 0.4, doc: 'missing-part mode' },
    'mode.newWay': { weight: 0.5, doc: 'new-way mode, + 0.1 per found pair (as extra 0.2 units)' },
    'counters.off': { weight: 0.3, doc: 'no counters to move' },
  },
  featureValues(c: Config) {
    const whole = c.whole ?? c.parts.reduce<number>((a, p) => a + (p ?? 0), 0);
    return {
      'whole.over5': Math.max(0, whole - 5) / 5,
      teen: whole > 10 ? 1 : 0,
      'mode.missingPart': c.mode === 'missing-part' ? 1 : 0,
      'mode.newWay': c.mode === 'new-way' ? 1 + 0.2 * (c.found?.length ?? 0) : 0,
      'counters.off': c.counters ? 0 : 1,
    };
  },
  initialState: (config) => ({
    config,
    whole: config.whole,
    parts: [...config.parts],
    highlighted: null,
  }),
  apply(s, a) {
    switch (a.op) {
      case 'split-counters': {
        const left = argNumber(a, 'left');
        const right = argNumber(a, 'right');
        if (left === undefined || right === undefined) return s;
        return { ...s, parts: [left, right] };
      }
      case 'fill': {
        const slot = argString(a, 'slot');
        const v = argNumber(a, 'value');
        if (v === undefined) return s;
        if (slot === 'whole') return { ...s, whole: v };
        const m = slot?.match(/^part-([01])$/);
        if (!m) return s;
        const parts = [...s.parts];
        parts[Number(m[1])] = v;
        return { ...s, parts };
      }
      case 'highlight':
        return { ...s, highlighted: argString(a, 'slot') ?? null };
      case 'answer': {
        const v = argNumber(a, 'value');
        if (v === undefined) return s;
        return numberBond.apply(s, { op: 'fill', args: { slot: missingSlot(s.config), value: v } });
      }
      default:
        throw new UnsupportedOpError('number-bond', a.op);
    }
  },
  toResponse(s) {
    const c = s.config;
    if (c.mode === 'missing-part' || c.mode === 'missing-whole') {
      const slot = missingSlot(c);
      const v = slot === 'whole' ? s.whole : s.parts[slot === 'part-0' ? 0 : 1];
      return v === null || v === undefined ? null : { kind: 'number', value: v };
    }
    if (s.parts.some((p) => p === null)) return null;
    return { kind: 'state', value: { parts: [...(s.parts as number[])] } };
  },
};
