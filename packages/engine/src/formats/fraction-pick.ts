// 03 §5.5 fraction-pick. A fraction picture (or two) and a choice (engine README, "Sharing and
// fraction formats"):
// - `fair-or-not`: is the `stimulus` cut into equal parts? `choice` `yes` | `no`; no `options`.
// - `pick-picture`: pick the picture asked for; options are `fraction` pictures with ids
//   `pic-<k>` in display order. `compare` and `equivalent` pick an option too.
// - `name`: name the `stimulus`'s fraction. `nameInput: 'pads'` (the default) types [a, b] on two
//   pads stacked as a fraction (`numbers`, ordered); `words` picks a word option (`choice`).
// Every mode with options shows at least 3 (03 §5.1). Demo ops: `highlight {id}` (an option id,
// or `stimulus`), `overlay {a, b}` (lays an a/b picture over the stimulus to compare), and
// `count-parts` (counts the stimulus's parts aloud); `answer {id}` or `answer {values}`.
// `answer {id, off: true}` takes that pick back (the child taps the picked card again).
//
// Supported domain (the schema and `apply` enforce it): MIN_PICK_OPTIONS to MAX_PICK_OPTIONS
// options (one row in the smallest area, each picture big enough to count its parts); with any
// card that has no picture (a word or a symbol, which is wide) at most MAX_WORD_OPTIONS options
// (more scroll the smallest area); every fraction picture has 1 to MAX_PICTURE_PARTS parts and fills at most all of them;
// an overlay a/b has b 1 to MAX_PICTURE_PARTS and a at most b; typed numbers are whole, 0 to
// MAX_TYPED_NUMBER.

import {
  type AnswerSpec,
  fractionPickConfigSchema,
  type StimulusSpec,
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

type Config = WidgetConfigOf<'fraction-pick'>;
type FractionStimulus = Extract<StimulusSpec, { kind: 'fraction' }>;

export interface FractionPickState extends FormatState<'fraction-pick'> {
  choice: string | null;
  /** The typed name [a, b] (`name` with pads); an entry is null until typed. */
  values: [number | null, number | null];
  highlighted: string | null;
  overlay: { a: number; b: number } | null;
  /** How many times the parts were counted (count-parts). */
  counted: number;
}

/** Fewest options a pick shows (03 §5.1). */
export const MIN_PICK_OPTIONS = 3;
/**
 * Most options a pick shows. Four pictures in one row are about 130 px each in the smallest area
 * (five with a stimulus: about 90 px), so every cut can be counted; six were about 62 px with
 * hairline cuts (PR #100 evidence review).
 */
export const MAX_PICK_OPTIONS = 4;
/** Most options when a card has no picture (words and symbols are wide cards). */
export const MAX_WORD_OPTIONS = 3;
/** Most parts a fraction picture is cut into (the kit draws 1 to 12). */
export const MAX_PICTURE_PARTS = 12;
/** The largest number typed on a pad (two digits). */
export const MAX_TYPED_NUMBER = 99;
/** The fixed pair a fair-or-not item answers with. */
export const FAIR_CHOICES = ['yes', 'no'] as const;

export const nameInputOf = (c: Config): 'pads' | 'words' => c.nameInput ?? 'pads';

/** Whether the mode answers by picking one of `options`. */
export const usesOptions = (c: Config): boolean =>
  c.mode === 'pick-picture' ||
  c.mode === 'compare' ||
  c.mode === 'equivalent' ||
  (c.mode === 'name' && nameInputOf(c) === 'words');

/** The choice ids the item offers (none for the typed name). */
export function pickChoices(c: Config): string[] {
  if (c.mode === 'fair-or-not') return [...FAIR_CHOICES];
  return usesOptions(c) ? (c.options ?? []).map((o) => o.id) : [];
}

const asFraction = (s: StimulusSpec | undefined): FractionStimulus | null =>
  s?.kind === 'fraction' ? s : null;

/** A label "a/b" read as numbers, or null. */
export function labelFraction(label: string | undefined): { a: number; b: number } | null {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(label ?? '');
  return m ? { a: Number(m[1]), b: Number(m[2]) } : null;
}

/** Every fraction the item shows (stimulus first, then options), as {a, b, equal}. */
function shownFractions(c: Config) {
  const out: { a: number; b: number; equal: boolean; option: boolean }[] = [];
  const st = asFraction(c.stimulus);
  if (st) out.push({ a: st.shaded, b: st.parts, equal: st.equalParts, option: false });
  for (const o of c.options ?? []) {
    const f = asFraction(o.stimulus);
    if (f) out.push({ a: f.shaded, b: f.parts, equal: f.equalParts, option: true });
    else {
      const l = labelFraction(o.label);
      if (l) out.push({ ...l, equal: true, option: true });
    }
  }
  return out;
}

const configSchema = fractionPickConfigSchema.superRefine((c, ctx) => {
  const opts = c.options ?? [];
  if (usesOptions(c)) {
    if (opts.length < MIN_PICK_OPTIONS) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: `a pick shows at least ${MIN_PICK_OPTIONS} options`,
      });
    }
    if (opts.length > MAX_PICK_OPTIONS) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: `a pick shows at most ${MAX_PICK_OPTIONS} options`,
      });
    } else if (opts.some((o) => !o.stimulus) && opts.length > MAX_WORD_OPTIONS) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: `a pick with word or symbol cards shows at most ${MAX_WORD_OPTIONS} options`,
      });
    }
    if (new Set(opts.map((o) => o.id)).size !== opts.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'option ids are distinct' });
    }
    opts.forEach((o, i) => {
      if (!o.stimulus && o.label === undefined && o.speak === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['options', i],
          message: 'an option shows a picture or a label',
        });
      }
    });
  } else if (opts.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['options'],
      message: `${c.mode} has no options`,
    });
  }
  if (c.mode === 'pick-picture') {
    opts.forEach((o, i) => {
      if (o.stimulus?.kind !== 'fraction') {
        ctx.addIssue({
          code: 'custom',
          path: ['options', i, 'stimulus'],
          message: 'pick-picture options are fraction pictures',
        });
      }
    });
  }
  if ((c.mode === 'fair-or-not' || c.mode === 'name') && !c.stimulus) {
    ctx.addIssue({ code: 'custom', path: ['stimulus'], message: `${c.mode} shows a picture` });
  }
  if (c.mode === 'fair-or-not' && c.stimulus && c.stimulus.kind !== 'fraction') {
    ctx.addIssue({
      code: 'custom',
      path: ['stimulus'],
      message: 'fair-or-not judges a fraction picture',
    });
  }
  if (c.nameInput !== undefined && c.mode !== 'name') {
    ctx.addIssue({
      code: 'custom',
      path: ['nameInput'],
      message: 'only name mode types or picks a name',
    });
  }
  for (const f of [c.stimulus, ...opts.map((o) => o.stimulus)]) {
    const fr = asFraction(f);
    if (fr && (fr.parts < 1 || fr.parts > MAX_PICTURE_PARTS || fr.shaded > fr.parts)) {
      ctx.addIssue({
        code: 'custom',
        path: ['stimulus'],
        message: `a fraction picture has 1 to ${MAX_PICTURE_PARTS} parts and shades at most all of them`,
      });
    }
  }
});

export const fractionPick: FormatModel<'fraction-pick', FractionPickState> = {
  format: 'fraction-pick',
  configSchema,
  features: {
    denominator: { weight: 0.1, doc: 'b − 2: the largest denominator shown' },
    nonUnit: { weight: 0.3, doc: 'a fraction shown has more than one part filled' },
    'compare.sameNumerator': {
      weight: 0.6,
      doc: 'compare fractions with the same numerator and different denominators',
    },
    equivalent: { weight: 0.5, doc: 'equivalent mode' },
    unequalDistractor: { weight: 0.3, doc: 'an option is cut into parts that are not equal' },
  },
  featureValues(c: Config, answer: AnswerSpec) {
    // Order-free: the options are shuffled by layout, so only sets and maxima are read. A
    // distractor is an option that is not the answer (finding the unequal one is not a distractor).
    const shown = shownFractions(c);
    const answerId = answer.kind === 'choice' ? answer.id : null;
    const unequalDistractor = (c.options ?? []).some(
      (o) => o.id !== answerId && asFraction(o.stimulus)?.equalParts === false,
    );
    const b = Math.max(2, ...shown.map((f) => f.b));
    const opts = shown.filter((f) => f.option);
    const sameNum =
      c.mode === 'compare' &&
      opts.length >= 2 &&
      new Set(opts.map((f) => f.a)).size === 1 &&
      new Set(opts.map((f) => f.b)).size > 1;
    return {
      denominator: b - 2,
      nonUnit: shown.some((f) => f.a > 1) ? 1 : 0,
      'compare.sameNumerator': sameNum ? 1 : 0,
      equivalent: c.mode === 'equivalent' ? 1 : 0,
      unequalDistractor: usesOptions(c) && unequalDistractor ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    choice: null,
    values: [null, null],
    highlighted: null,
    overlay: null,
    counted: 0,
  }),
  apply(s, a) {
    const c = s.config;
    switch (a.op) {
      case 'highlight': {
        // No id clears the highlight; an id the item does not show is ignored.
        if (a.args?.id === undefined)
          return s.highlighted === null ? s : { ...s, highlighted: null };
        const id = argString(a, 'id');
        if (id === undefined || (id !== 'stimulus' && !pickChoices(c).includes(id))) return s;
        return { ...s, highlighted: id };
      }
      case 'overlay': {
        const ov = { a: argNumber(a, 'a'), b: argNumber(a, 'b') };
        if (ov.a === undefined || ov.b === undefined) return { ...s, overlay: null };
        if (!Number.isInteger(ov.a) || !Number.isInteger(ov.b) || ov.b < 1 || ov.a < 0) return s;
        if (ov.b > MAX_PICTURE_PARTS || ov.a > ov.b) return s;
        return { ...s, overlay: { a: ov.a, b: ov.b } };
      }
      case 'count-parts':
        return { ...s, counted: s.counted + 1 };
      case 'answer': {
        const id = argString(a, 'id');
        if (id !== undefined) {
          if (!pickChoices(c).includes(id)) return s;
          // `off` takes that pick back (only the pick that is made).
          if (a.args?.off === true) return s.choice === id ? { ...s, choice: null } : s;
          return { ...s, choice: id };
        }
        const typed = (x: number) => Number.isInteger(x) && x >= 0 && x <= MAX_TYPED_NUMBER;
        const v = argNumbers(a, 'values');
        if (c.mode === 'name' && nameInputOf(c) === 'pads' && v && v.length === 2) {
          return v.every(typed) ? { ...s, values: [v[0] as number, v[1] as number] } : s;
        }
        const one = argNumber(a, 'value');
        const slot = argNumber(a, 'slot');
        if (c.mode === 'name' && nameInputOf(c) === 'pads' && one !== undefined) {
          if (!typed(one)) return s;
          // One pad at a time: `slot` 0 is the top number (numerator), 1 the bottom.
          const i = slot === 1 ? 1 : 0;
          const values: [number | null, number | null] = [...s.values];
          values[i] = one;
          return { ...s, values };
        }
        return s;
      }
      default:
        throw new UnsupportedOpError('fraction-pick', a.op);
    }
  },
  toResponse(s) {
    const c = s.config;
    if (c.mode === 'name' && nameInputOf(c) === 'pads') {
      const [a, b] = s.values;
      return a === null || b === null ? null : { kind: 'numbers', values: [a, b] };
    }
    return s.choice === null ? null : { kind: 'choice', id: s.choice };
  },
};
