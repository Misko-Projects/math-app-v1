// 03 §5.5 clock-set (concrete): turn the geared hands of a clock to a time. The state is one face
// time `t` (formats/clock.ts), so the hands can never disagree. The response is `{ h, m }`, the
// time the hands show (#84 convention: `h` the hour the short hand has reached, 1–12; `m` the
// minute the long hand points at), checked by `clock.time { h, m }` modulo 12 hours; null until a
// hand has moved.
//
// Ops (03 §5.5): `drag-minute {to, dir?}` turns the long hand to minute `to` (snapped to
// `precision`), the shorter way round unless `dir` is `cw` or `ccw`; passing 12 carries the short
// hand to the next hour or back. `drag-hour {to}` turns the short hand to hour `to` keeping the
// minutes (the long hand goes round with it), so `drag-minute {to: m}` then `drag-hour {to: h}`
// sets h:m from anywhere. `count-fives {from, to}` (count the long hand's steps by five) and
// `highlight-hand {hand}` are visual. The generic `answer {h, m}` (or `{values: [h, m]}`) sets the
// time directly.

import { type AnswerSpec, clockSetConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import {
  faceMinutes,
  isTime,
  onFace,
  precisionFeatures,
  snapMinute,
  timeOf,
  turnMinuteHand,
} from './clock';
import {
  argNumber,
  argNumbers,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'clock-set'>;

export type ClockHand = 'hour' | 'minute';

export interface ClockSetState extends FormatState<'clock-set'> {
  /** Minutes after 12:00 the face shows (0–719). */
  t: number;
  /** A hand has moved (the start time is never an answer by itself). */
  moved: boolean;
  highlighted: ClockHand | null;
  /** The five-minute steps `count-fives` counted, in minutes. */
  fives: { from: number; to: number } | null;
}

const configSchema = clockSetConfigSchema.superRefine((c, ctx) => {
  for (const key of ['target', 'start'] as const) {
    if (!isTime(c[key])) {
      ctx.addIssue({ code: 'custom', path: [key], message: 'a time is a whole h 0–23 and m 0–59' });
    } else if (c[key].m % c.precision !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: [key, 'm'],
        message: `the minute hand snaps to ${c.precision} minutes`,
      });
    }
  }
  if (
    isTime(c.target) &&
    isTime(c.start) &&
    faceMinutes(c.target.h, c.target.m) === faceMinutes(c.start.h, c.start.m)
  ) {
    ctx.addIssue({ code: 'custom', path: ['start'], message: 'the hands already show the target' });
  }
  if ((c.prompt === 'elapsed') !== (c.elapsed !== undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: ['elapsed'],
      message: 'elapsed goes with prompt: elapsed',
    });
  }
  if (c.elapsed) {
    const { from, minutes } = c.elapsed;
    const want = isTime(from) ? onFace((faceMinutes(from.h, from.m) ?? 0) + minutes) : null;
    if (minutes <= 0 || want !== faceMinutes(c.target.h, c.target.m)) {
      ctx.addIssue({
        code: 'custom',
        path: ['elapsed'],
        message: 'the target is the start time plus the minutes',
      });
    }
  }
});

export const clockSet: FormatModel<'clock-set', ClockSetState> = {
  format: 'clock-set',
  configSchema,
  features: {
    'precision.half': { weight: 0.4, doc: 'the target needs half hours' },
    'precision.quarter': { weight: 0.6, doc: 'the target needs quarter hours' },
    'precision.five': { weight: 0.8, doc: 'the target needs five-minute steps' },
    'precision.one': { weight: 1.2, doc: 'the target needs single minutes' },
    afterHalf: { weight: 0.3, doc: 'the target minute is 30 or more' },
    elapsed: { weight: 0.6, doc: 'the target is a start time plus some minutes' },
    'digital.hidden': { weight: 0.2, doc: 'no digital readout of the hands' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    // As time.clock (#84): the precision features read the target, not the widget's snapping.
    return {
      ...precisionFeatures(c.target.m),
      afterHalf: c.target.m >= 30 ? 1 : 0,
      elapsed: c.prompt === 'elapsed' ? 1 : 0,
      'digital.hidden': c.showDigital ? 0 : 1,
    };
  },
  initialState: (config) => ({
    config,
    t: onFace(faceMinutes(config.start.h, config.start.m) ?? 0),
    moved: false,
    highlighted: null,
    fives: null,
  }),
  apply(s, a) {
    switch (a.op) {
      case 'drag-minute': {
        const to = argNumber(a, 'to');
        if (to === undefined) return s;
        const dir = argString(a, 'dir');
        const t = turnMinuteHand(
          s.t,
          snapMinute(to, s.config.precision),
          dir === 'cw' || dir === 'ccw' ? dir : undefined,
        );
        return { ...s, t, moved: s.moved || t !== s.t };
      }
      case 'drag-hour': {
        const to = argNumber(a, 'to');
        if (to === undefined) return s;
        const t = onFace((Math.round(to) % 12) * 60 + (s.t % 60));
        return { ...s, t, moved: s.moved || t !== s.t };
      }
      case 'count-fives': {
        const to = argNumber(a, 'to');
        if (to === undefined || to < 0 || to > 60) return s;
        const from = argNumber(a, 'from') ?? 0;
        return { ...s, fives: { from: Math.max(0, Math.min(from, to)), to } };
      }
      case 'highlight-hand': {
        const hand = argString(a, 'hand');
        return { ...s, highlighted: hand === 'hour' || hand === 'minute' ? hand : null };
      }
      case 'answer': {
        const vs = argNumbers(a, 'values');
        const h = vs?.[0] ?? argNumber(a, 'h');
        const m = vs?.[1] ?? argNumber(a, 'm');
        const f = h === undefined || m === undefined ? null : faceMinutes(h, m);
        return f === null ? s : { ...s, t: f, moved: true };
      }
      default:
        throw new UnsupportedOpError('clock-set', a.op);
    }
  },
  toResponse: (s) => (s.moved ? { kind: 'state', value: { ...timeOf(s.t) } } : null),
};
