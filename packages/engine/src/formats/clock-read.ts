// 03 §5.5 clock-read (pictorial): read the time a clock shows. `digital-pad` answers `numbers`
// `[h, m]` (ordered, h 1–12) from an `_ _ : _ _` pad; `pick` answers `choice` with one of its
// `options` (#84: hour picks use the numeric ids `opt-<h>`); `ampm` (TIM.05) answers `am` | `pm`.
// The face's hands come from the one time `time` (formats/clock.ts).
//
// Ops: `point-hour`, `point-minute` (Pip points at a hand), `count-fives {to}` (count the long
// hand round by fives from 12 to minute `to`), and the generic `answer {values}` / `{id}`.

import { type AnswerSpec, clockReadConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import { isTime, precisionFeatures } from './clock';
import { optionNumber } from './numeral-pick';
import {
  argNumber,
  argNumbers,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'clock-read'>;

export interface ClockReadState extends FormatState<'clock-read'> {
  pointed: 'hour' | 'minute' | null;
  /** The minute `count-fives` counted to (from 12). */
  fives: number | null;
  values: number[] | null;
  choice: string | null;
}

/** The answer ids a clock-read item offers: its options, or `am` / `pm`. */
export function readChoiceIds(c: Config): string[] {
  if (c.ampm) return ['am', 'pm'];
  return (c.options ?? []).map((o) => o.id);
}

/**
 * Whether the sun is up at hour `h` (0–23): from 6 in the morning until 6 in the evening. The
 * a.m./p.m. clue (TIM.05): the two times of day one face time can be are always one in daylight
 * and one in the dark (7 a.m. and 7 p.m., 3 p.m. and 3 a.m., noon and midnight), so the sky tells
 * them apart for every time.
 */
export const isDaylight = (h: number): boolean => h >= 6 && h < 18;

/** An hour pick (TIM.09, #84): every option is a numeric `opt-<h>` id, so no minutes are read. */
export const isHourPick = (c: Config): boolean =>
  c.input === 'pick' &&
  !c.ampm &&
  (c.options ?? []).length > 0 &&
  (c.options ?? []).every((o) => optionNumber(o.id) !== null);

const configSchema = clockReadConfigSchema.superRefine((c, ctx) => {
  if (!isTime(c.time)) {
    ctx.addIssue({
      code: 'custom',
      path: ['time'],
      message: 'a time is a whole h 0–23 and m 0–59',
    });
  }
  if (c.ampm && c.input !== 'pick') {
    ctx.addIssue({ code: 'custom', path: ['input'], message: 'am / pm is picked' });
  }
  // The clue is the sky beside the clock (`isDaylight`), drawn from the time of day itself, so the
  // time has to be the a.m. or p.m. one the item means: 7:00 p.m. is `h: 19`.
  if (c.ampm && isTime(c.time) && c.time.h >= 12 !== c.ampm.isPm) {
    ctx.addIssue({
      code: 'custom',
      path: ['ampm', 'isPm'],
      message: 'isPm goes with the time of day: h 0–11 is a.m., h 12–23 is p.m.',
    });
  }
  if (c.input === 'digital-pad' && c.options !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'the digital pad has no options' });
  }
  if (c.input === 'pick' && !c.ampm) {
    const opts = c.options ?? [];
    // 03 §5.1: a pre-reader pick shows at least three options.
    if (opts.length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'a pick shows 3 or more options',
      });
    }
    if (new Set(opts.map((o) => o.id)).size !== opts.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'option ids must be distinct' });
    }
    if (new Set(opts.map((o) => o.label)).size !== opts.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'option labels must be distinct',
      });
    }
  }
});

export const clockRead: FormatModel<'clock-read', ClockReadState> = {
  format: 'clock-read',
  configSchema,
  features: {
    'precision.half': { weight: 0.4, doc: 'the time needs half hours' },
    'precision.quarter': { weight: 0.6, doc: 'the time needs quarter hours' },
    'precision.five': { weight: 0.8, doc: 'the time needs five-minute steps' },
    'precision.one': { weight: 1.2, doc: 'the time needs single minutes' },
    afterHalf: { weight: 0.3, doc: 'the minute is 30 or more' },
    'numerals.off': { weight: 0.5, doc: 'the face has no numbers' },
    'input.pick': { weight: -0.3, doc: 'pick instead of typing' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    return {
      // An hour pick reads no minutes (#84), so their precision does not make it harder.
      ...precisionFeatures(isHourPick(c) ? 0 : c.time.m),
      afterHalf: c.time.m >= 30 ? 1 : 0,
      'numerals.off': c.numerals ? 0 : 1,
      'input.pick': c.input === 'pick' ? 1 : 0,
    };
  },
  initialState: (config) => ({ config, pointed: null, fives: null, values: null, choice: null }),
  apply(s, a) {
    switch (a.op) {
      case 'point-hour':
        return { ...s, pointed: 'hour' };
      case 'point-minute':
        return { ...s, pointed: 'minute' };
      case 'count-fives': {
        const to = argNumber(a, 'to');
        return to === undefined || to < 0 || to > 60 ? s : { ...s, fives: to };
      }
      case 'answer': {
        if (s.config.input === 'pick') {
          const id = argString(a, 'id');
          return id !== undefined && readChoiceIds(s.config).includes(id)
            ? { ...s, choice: id }
            : s;
        }
        const vs = argNumbers(a, 'values');
        return vs && vs.length === 2 ? { ...s, values: [...vs] } : s;
      }
      default:
        throw new UnsupportedOpError('clock-read', a.op);
    }
  },
  toResponse(s) {
    if (s.config.input === 'pick')
      return s.choice === null ? null : { kind: 'choice', id: s.choice };
    return s.values === null ? null : { kind: 'numbers', values: [...s.values] };
  },
};
