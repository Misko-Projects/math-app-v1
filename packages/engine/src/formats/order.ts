// 03 §5.5 order. The child drags items into slots; the response lists the dropped items' values in
// slot order. `fixed` pre-places items (slot → id) that cannot move.

import { orderConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import {
  argNumber,
  argString,
  digitCount,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'order'>;

export interface OrderState extends FormatState<'order'> {
  slots: (string | null)[];
  highlighted: string | null;
}

const configSchema = orderConfigSchema.superRefine((c, ctx) => {
  if (c.items.length < 2) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'order needs at least 2 items' });
  }
  const ids = c.items.map((i) => i.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'item ids must be distinct' });
  }
  for (const [slot, id] of Object.entries(c.fixed ?? {})) {
    const k = Number(slot);
    if (!Number.isInteger(k) || k < 0 || k >= c.items.length || !ids.includes(id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fixed', slot],
        message: 'fixed slot or id is invalid',
      });
    }
  }
});

function sortedGapRatio(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const range = (v[v.length - 1] as number) - (v[0] as number);
  if (range <= 0) return 0;
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < v.length; i += 1)
    gap = Math.min(gap, (v[i] as number) - (v[i - 1] as number));
  return gap / range;
}

export const order: FormatModel<'order', OrderState> = {
  format: 'order',
  configSchema,
  features: {
    items: { weight: 0.3, doc: 'item count − 3' },
    closeness: { weight: 0.5, doc: 'smallest gap ÷ range < 0.1' },
    desc: { weight: 0.3, doc: 'descending order' },
    magnitude: { weight: 0.3, doc: 'digits of the largest value − 1' },
  },
  featureValues(c: Config) {
    const values = c.items.map((i) => i.value);
    return {
      items: Math.max(0, c.items.length - 3),
      closeness: sortedGapRatio(values) < 0.1 ? 1 : 0,
      desc: c.direction === 'desc' ? 1 : 0,
      magnitude: Math.max(0, Math.max(...values.map(digitCount)) - 1),
    };
  },
  initialState(config) {
    const slots: (string | null)[] = config.items.map(() => null);
    for (const [slot, id] of Object.entries(config.fixed ?? {})) slots[Number(slot)] = id;
    return { config, slots, highlighted: null };
  },
  apply(s, a) {
    switch (a.op) {
      case 'drag': {
        const id = argString(a, 'id');
        const slot = argNumber(a, 'slot');
        if (id === undefined || slot === undefined || slot < 0 || slot >= s.slots.length) return s;
        if (!s.config.items.some((i) => i.id === id)) return s;
        const fixed = s.config.fixed ?? {};
        const fixedSlots = new Set(Object.keys(fixed).map(Number));
        // Fixed slots and fixed items never move.
        if (fixedSlots.has(slot) || Object.values(fixed).includes(id)) return s;
        // Moving an item frees its old slot; whatever occupied the target goes back to the tray.
        const slots = s.slots.map((x, i) => (x === id && !fixedSlots.has(i) ? null : x));
        slots[slot] = id;
        return { ...s, slots };
      }
      case 'highlight':
        return { ...s, highlighted: argString(a, 'id') ?? null };
      default:
        throw new UnsupportedOpError('order', a.op);
    }
  },
  toResponse(s) {
    if (s.slots.some((x) => x === null)) return null;
    const byId = new Map(s.config.items.map((i) => [i.id, i.value]));
    return { kind: 'numbers', values: s.slots.map((id) => byId.get(id as string) as number) };
  },
};
