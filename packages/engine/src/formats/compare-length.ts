// 03 §5.5 compare-length: two to four objects side by side, ids `obj-<i>` in display order (K01).
// Each object starts `offset` length units right of the start line (all 0 when `aligned`).
// - `longer`, `shorter`, `indirect`: the child picks an object (`answer {id}`); answers `choice`.
//   For `indirect` (MEA.07) the objects cannot move: `lay-string {id}` lays a string along one
//   (the widget then shows the string's length beside the other).
// - `order`: the child drags the objects into the order slots (`place {id, slot}`; `slot: -1`
//   takes it out again); answers `numbers`, the lengths in slot order, once every slot is filled.
//   `answer {values}` fills the slots with objects of those lengths.
// - `how-much-longer`: the child types the difference (`answer {value}`); answers `number`.
// `align {id}` slides an object (every object without an id) to the start line;
// `highlight-difference` marks the part of the longer object that sticks out. Both are visual.

import {
  type AnswerSpec,
  compareLengthConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import {
  argNumber,
  argNumbers,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'compare-length'>;

export interface CompareLengthState extends FormatState<'compare-length'> {
  /** Objects slid to the start line (`align`). */
  aligned: string[];
  /** Objects a string has been laid along (`lay-string`), in order. */
  strings: string[];
  differenceShown: boolean;
  /** longer / shorter / indirect: the picked object. */
  choice: string | null;
  /** order: the object in each slot (slot 0 first). */
  slots: (string | null)[];
  /** how-much-longer: the typed difference. */
  value: number | null;
}

/** The closest pair's ratio (shorter ÷ longer), rounded to hundredths (03 §5.5 `closeness`). */
export function closeness(lengths: readonly number[]): number {
  const s = [...lengths].sort((a, b) => a - b);
  let best = 0;
  for (let i = 1; i < s.length; i += 1) {
    const hi = s[i] as number;
    if (hi > 0) best = Math.max(best, (s[i - 1] as number) / hi);
  }
  return Math.round(best * 100) / 100;
}

/** Where an object starts now: at the start line once aligned, else at its offset. */
export const startOf = (s: CompareLengthState, id: string): number =>
  s.aligned.includes(id) ? 0 : (s.config.objects.find((o) => o.id === id)?.offset ?? 0);

const configSchema = compareLengthConfigSchema.superRefine((c, ctx) => {
  const ids = c.objects.map((o) => o.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['objects'], message: 'object ids must be distinct' });
  }
  if (c.objects.length < 2 || c.objects.length > 4) {
    ctx.addIssue({ code: 'custom', path: ['objects'], message: 'two to four objects' });
  }
  if ((c.ask === 'indirect' || c.ask === 'how-much-longer') && c.objects.length !== 2) {
    ctx.addIssue({ code: 'custom', path: ['objects'], message: `${c.ask} compares two objects` });
  }
  c.objects.forEach((o, i) => {
    if (!(o.length > 0)) {
      ctx.addIssue({ code: 'custom', path: ['objects', i, 'length'], message: 'length > 0' });
    }
    if (o.offset < 0 || (c.aligned && o.offset !== 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['objects', i, 'offset'],
        message: c.aligned ? 'aligned objects start at 0' : 'offset ≥ 0',
      });
    }
  });
  // A longer, shorter, indirect or order question has one right answer.
  if (c.ask !== 'how-much-longer') {
    const lengths = c.objects.map((o) => o.length);
    if (new Set(lengths).size !== lengths.length) {
      ctx.addIssue({ code: 'custom', path: ['objects'], message: 'lengths must differ' });
    }
  }
});

export const compareLength: FormatModel<'compare-length', CompareLengthState> = {
  format: 'compare-length',
  configSchema,
  features: {
    misaligned: { weight: 0.5, doc: 'the left ends are not lined up (not indirect)' },
    closeness: { weight: 0.8, doc: 'shorter ÷ longer of the closest pair' },
    'objects.over2': { weight: 0.3, doc: 'objects − 2' },
    'ask.difference': { weight: 0.5, doc: 'how much longer' },
    indirect: { weight: 0.5, doc: 'compared through a string (the objects cannot move)' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    return {
      misaligned: !c.aligned && c.ask !== 'indirect' ? 1 : 0,
      closeness: closeness(c.objects.map((o) => o.length)),
      'objects.over2': Math.max(0, c.objects.length - 2),
      'ask.difference': c.ask === 'how-much-longer' ? 1 : 0,
      indirect: c.ask === 'indirect' ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    aligned: [],
    strings: [],
    differenceShown: false,
    choice: null,
    slots: config.objects.map(() => null),
    value: null,
  }),
  apply(s, a) {
    const c = s.config;
    const ids = c.objects.map((o) => o.id);
    const id = argString(a, 'id');
    const known = id !== undefined && ids.includes(id);
    switch (a.op) {
      case 'align': {
        // Indirect objects cannot move (03 §5.5).
        if (c.ask === 'indirect') return s;
        if (id === undefined) return { ...s, aligned: [...ids] };
        if (!known || s.aligned.includes(id)) return s;
        return { ...s, aligned: [...s.aligned, id] };
      }
      case 'lay-string':
        if (!known || s.strings.includes(id)) return s;
        return { ...s, strings: [...s.strings, id] };
      case 'highlight-difference':
        return { ...s, differenceShown: true };
      case 'place': {
        if (c.ask !== 'order' || !known) return s;
        const slot = argNumber(a, 'slot') ?? -2;
        const slots = s.slots.map((x) => (x === id ? null : x));
        if (slot === -1) return { ...s, slots };
        if (!Number.isInteger(slot) || slot < 0 || slot >= slots.length) return s;
        slots[slot] = id;
        return { ...s, slots };
      }
      case 'answer': {
        if (c.ask === 'order') {
          const values = argNumbers(a, 'values');
          if (!values || values.length !== c.objects.length) return s;
          const free = [...c.objects];
          const slots: string[] = [];
          for (const v of values) {
            const k = free.findIndex((o) => o.length === v);
            if (k < 0) return s;
            slots.push((free[k] as (typeof free)[number]).id);
            free.splice(k, 1);
          }
          return { ...s, slots };
        }
        if (c.ask === 'how-much-longer') {
          const v = argNumber(a, 'value');
          return v === undefined ? s : { ...s, value: v };
        }
        return known ? { ...s, choice: id } : s;
      }
      default:
        throw new UnsupportedOpError('compare-length', a.op);
    }
  },
  toResponse(s) {
    const c = s.config;
    switch (c.ask) {
      case 'order': {
        if (s.slots.some((x) => x === null)) return null;
        const length = (id: string | null) => c.objects.find((o) => o.id === id)?.length ?? 0;
        return { kind: 'numbers', values: s.slots.map(length) };
      }
      case 'how-much-longer':
        return s.value === null ? null : { kind: 'number', value: s.value };
      default:
        return s.choice === null ? null : { kind: 'choice', id: s.choice };
    }
  },
};
