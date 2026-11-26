// time.clock (03 §5.6): read and set an analog clock. Formats: clock-set, clock-read.
//
// - clock-set (`mode: set`), TIM.01, TIM.04, TIM.09: the target `h:m` is spoken (`prompt: spoken`)
//   or shown as a digital clock (`prompt: digital`); the geared hands start at `startH:00` and the
//   minute hand snaps to `precision` (K01: 5, so a swapped setting, 12:15 for 3:00, is reachable).
//   Answer state `clock.time {h, m}`; the response is the time the hands show, `{h, m}`.
// - clock-read (`mode: read`), `input: digital-pad`: type the time shown, numbers [h, m] (h 1–12).
// - clock-read `input: pick` with `ask: hour` (TIM.09): which hour is it after? The options are
//   hours (`opt-<h>`), the hour's run of consecutive hours in a fixed partition of the face
//   (`hourClass`: four with diagnostic distractors, otherwise three), so the set never depends on
//   which hour is the key.
// - clock-read `mode: match` (TIM.11), `input: pick`, `ask: time`: which digital time does the clock
//   show? Four options (`matchTimes`): the hour's pair (1–2, 3–4, … 11–12) times the minute's
//   mirror pair (m and 60 − m; 0 with 30), a fixed partition of the face, so every option is the
//   key of some item and the set never points at the key. Ids `time-<h>-<mm>`.
// - clock-read `mode: ampm` (TIM.05): the face shows `h:m` beside a daily-event scene (`scene`, one
//   of AMPM_SCENES) and the child picks a.m. or p.m. The face hour h (1–12) becomes the hour of day
//   in the scene's half of the day; the item is accepted only when that hour is one the scene
//   happens in (lunch at 12 or 1 is p.m., breakfast at 7 is a.m.). Noon is p.m.; no scene is at
//   midnight.
// - `mode: quarter` (TIM.10): read (pad) or set a time at quarter past (m 15) or quarter to (m 45).
//   The vars `hour` and `next` (the hour after h) let a prompt say "quarter past 3" or
//   "quarter to 4".
//
// The clock formats have no engine model (U05), so this generator emits their 03 §5.5 format
// features itself, reading the precision features from the target time (the finest step the time
// needs), not from the widget's snapping; `turn` is how far the hands travel from the start.

import type { LessonStep, ResponseValue } from '@number-island/shared';
import { AMPM_SCENES, isAmPmScene } from '../../formats/clock-read';
import { numberOptionId } from '../../formats/numeral-pick';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';
import { nextHour, timeText } from './face';

export { minuteHandNumber, nextHour, prevHour, timeText } from './face';

const MODES = ['read', 'set', 'match', 'ampm', 'quarter'];
const SCENES = Object.keys(AMPM_SCENES);
const INPUTS = ['digital-pad', 'pick'];
const ASKS = ['time', 'hour'];
const PROMPTS = ['spoken', 'digital'];
const PRECISIONS = [60, 30, 15, 5, 1];

/** The 03 §5.5 precision features of a time: the finest step it needs. */
export function precisionFeatures(m: number): Record<string, number> {
  const f = {
    'precision.half': 0,
    'precision.quarter': 0,
    'precision.five': 0,
    'precision.one': 0,
  };
  if (m === 0) return f;
  if (m === 30) f['precision.half'] = 1;
  else if (m % 15 === 0) f['precision.quarter'] = 1;
  else if (m % 5 === 0) f['precision.five'] = 1;
  else f['precision.one'] = 1;
  return f;
}

/**
 * The hour pick's option set (TIM.09, PR #84 review): a fixed partition of 1–12 into runs of
 * `size` consecutive hours (3 or 4, so the runs tile the face). Every hour of a run gets the same
 * options and each option is the key of some item, so the options never point at the hour. The
 * next hour (MC.hour-hand-next) is offered unless h ends its run, and the number the long hand
 * points at (MC.hour-minute-swap) when it falls in the run.
 */
export function hourClass(h: number, size: number): number[] {
  const start = Math.floor((h - 1) / size) * size;
  return Array.from({ length: size }, (_, k) => start + k + 1);
}

/** Four options with diagnostic distractors, otherwise three. */
const hourClassSize = (t: { distractors?: unknown[] }): number =>
  (t.distractors?.length ?? 0) > 0 ? 4 : 3;

/** The option id of a full time on the match pick (TIM.11). */
export const timeOptionId = (h: number, m: number): string =>
  `time-${h}-${String(m).padStart(2, '0')}`;

/**
 * The match pick's four times (TIM.11): the hour's pair (1–2, 3–4, … 11–12) times the minute's
 * mirror pair (m with 60 − m, 0 with 30: the long hand on the other side of the face). The pairs
 * tile the face and its minutes, so every time of a set gets the same set and every option is
 * the key of some item: the options never give the time away.
 */
export function matchTimes(h: number, m: number): { h: number; m: number }[] {
  const a = h % 2 === 1 ? h : h - 1;
  const ms = m === 0 || m === 30 ? [0, 30] : [Math.min(m, 60 - m), Math.max(m, 60 - m)];
  return [a, a + 1].flatMap((hh) => ms.map((mm) => ({ h: hh, m: mm })));
}

/** The hour of day (0–23) the face hour h (1–12) is in the scene's half of the day; null if none. */
export function sceneHour(scene: string, h: number): number | null {
  if (!isAmPmScene(scene)) return null;
  const { from, to } = AMPM_SCENES[scene];
  const h24 = (h % 12) + (from >= 12 ? 12 : 0);
  return h24 >= from && h24 <= to ? h24 : null;
}

/** How far the hands turn from `startH:00` to `h:m`, the shorter way round, in half-days (0–1). */
export function turnDistance(startH: number, h: number, m: number): number {
  const minutes = ((((h % 12) * 60 + m - (startH % 12) * 60) % 720) + 720) % 720;
  return Math.round((Math.min(minutes, 720 - minutes) / 360) * 1000) / 1000;
}

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const timeClock: GeneratorDef = {
  id: 'time.clock',
  formats: ['clock-set', 'clock-read'],
  params: {
    h: { type: 'int', default: { kind: 'int', min: 1, max: 12 }, doc: 'the hour (1–12)' },
    m: { type: 'int', default: { kind: 'const', value: 0 }, doc: 'the minute (0–59)' },
    mode: {
      type: 'string',
      values: MODES,
      // Templates always set it; the default lets either format build from defaults.
      default: { kind: 'choice', values: ['read', 'set'] },
      doc: 'read or set; match (TIM.11 time pick), ampm (TIM.05), quarter (TIM.10: m 15 or 45)',
    },
    scene: {
      type: 'string',
      values: SCENES,
      default: { kind: 'choice', values: SCENES },
      doc: 'ampm: the daily event beside the clock, which tells the half of the day',
    },
    input: {
      type: 'string',
      values: INPUTS,
      default: { kind: 'const', value: 'digital-pad' },
      doc: 'clock-read: type the time on the digital pad, or pick an option',
    },
    ask: {
      type: 'string',
      values: ASKS,
      default: { kind: 'const', value: 'time' },
      doc: 'clock-read: the whole time (digital-pad), or only the hour it is after (pick, TIM.09)',
    },
    numerals: {
      type: 'bool',
      default: { kind: 'const', value: true },
      doc: 'clock-read: the face shows its numbers',
    },
    prompt: {
      type: 'string',
      values: PROMPTS,
      default: { kind: 'const', value: 'spoken' },
      doc: 'clock-set: the target is spoken, or shown on a digital clock',
    },
    showDigital: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'clock-set: a digital readout shows the time the hands are set to',
    },
    startH: {
      type: 'int',
      default: { kind: 'const', value: 12 },
      doc: 'clock-set: the hands start at startH:00',
    },
    precision: {
      type: 'int',
      default: { kind: 'const', value: 5 },
      doc: 'clock-set: the minute hand snaps to this many minutes (60, 30, 15, 5 or 1)',
    },
  },
  features: {
    'precision.half': { weight: 0.4, doc: 'format feature (03 §5.5): the time is a half hour' },
    'precision.quarter': { weight: 0.6, doc: 'format feature: a quarter hour' },
    'precision.five': { weight: 0.8, doc: 'format feature: a multiple of five minutes' },
    'precision.one': { weight: 1.2, doc: 'format feature: any minute' },
    afterHalf: { weight: 0.3, doc: 'format feature: m ≥ 30 (the short hand nears the next hour)' },
    'digital.hidden': { weight: 0.2, doc: 'clock-set format feature: no digital readout' },
    'numerals.off': { weight: 0.5, doc: 'clock-read format feature: the face has no numbers' },
    'input.pick': { weight: -0.3, doc: 'clock-read format feature: pick instead of typing' },
    turn: {
      weight: 0.4,
      doc: 'clock-set: how far the hands turn from the start, the shorter way (half a day = 1)',
    },
  },
  narration: [
    'gen.time.clock.long-hand',
    'gen.time.clock.short-hand',
    'gen.time.clock.turn-long',
    'gen.time.clock.turn-short',
    'gen.time.clock.reads',
    'gen.time.clock.between',
    'gen.time.clock.after',
    'gen.time.clock.am',
    'gen.time.clock.pm',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const h = asNum(p.h);
    const m = asNum(p.m);
    if (h < 1 || h > 12 || m < 0 || m > 59) return false;
    const mode = asStr(p.mode);
    if (mode === 'quarter' && m !== 15 && m !== 45) return false;
    if (t.format === 'clock-set') {
      const precision = asNum(p.precision, 5);
      if (mode !== 'set' && mode !== 'quarter') return false;
      if (!PRECISIONS.includes(precision) || m % precision !== 0) return false;
      // The hands must have somewhere to go.
      return turnDistance(asNum(p.startH, 12), h, m) > 0;
    }
    const input = asStr(p.input);
    const ask = asStr(p.ask);
    if (mode === 'match') return input === 'pick' && ask === 'time' && m % 5 === 0;
    if (mode === 'ampm') return input === 'pick' && sceneHour(asStr(p.scene), h) !== null;
    if (mode === 'quarter') return input === 'digital-pad' && ask === 'time';
    if (mode !== 'read') return false;
    // K01: the pad reads a whole time, the pick only the hour (TIM.09).
    if (input === 'pick') return ask === 'hour' && m > 0;
    return ask === 'time';
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const h = asNum(params.h);
    const m = asNum(params.m);
    const time = timeText(h, m);
    let p: PartialOutput;
    if (t.format === 'clock-set') {
      const showDigital = params.showDigital === true;
      const startH = asNum(params.startH, 12);
      p = {
        params,
        vars: pickVars(t, { time, hour: h, next: nextHour(h) }),
        math: {
          ...precisionFeatures(m),
          afterHalf: m >= 30 ? 1 : 0,
          'digital.hidden': showDigital ? 0 : 1,
          turn: turnDistance(startH, h, m),
        },
        widget: {
          format: 'clock-set',
          target: { h, m },
          start: { h: startH, m: 0 },
          precision: asNum(params.precision, 5) as 60 | 30 | 15 | 5 | 1,
          showDigital,
          prompt: asStr(params.prompt, 'spoken') === 'digital' ? 'digital' : 'spoken',
        },
        answer: { kind: 'state', checker: 'clock.time', target: { h, m } },
        nudge: [{ op: 'highlight-hand', args: { hand: 'minute' } }],
      };
      return finish(timeClock, ctx, p);
    }
    const numerals = params.numerals !== false;
    const pick = asStr(params.input) === 'pick';
    const mode = asStr(params.mode);
    const match = pick && mode === 'match';
    const hourOnly = pick && !match;
    // The match pick's features are its option set's, the same whichever time is the key: the
    // minute pair (m, 60 − m) shares its precision (0 with 30 counts as half past), and every set
    // has a time from half past on.
    const precisionMinute = match && m === 0 ? 30 : hourOnly ? 0 : m;
    const math: Record<string, number> = {
      // The hour and a.m./p.m. picks read no minutes, so the minutes' precision adds nothing.
      ...precisionFeatures(precisionMinute),
      afterHalf: match || m >= 30 ? 1 : 0,
      'numerals.off': numerals ? 0 : 1,
      'input.pick': pick ? 1 : 0,
    };
    if (mode === 'ampm') {
      const scene = asStr(params.scene);
      const h24 = sceneHour(scene, h) ?? h;
      const isPm = h24 >= 12;
      p = {
        params,
        vars: pickVars(t, {}),
        math,
        widget: {
          format: 'clock-read',
          time: { h: h24, m },
          numerals,
          input: 'pick',
          ampm: { scene: scene as never, isPm },
        },
        answer: { kind: 'choice', id: isPm ? 'pm' : 'am' },
        nudge: [{ op: 'point-hour' }],
      };
      return finish(timeClock, ctx, p);
    }
    if (mode === 'match') {
      const shown = rng.fork('layout').shuffle(matchTimes(h, m));
      p = {
        params,
        vars: pickVars(t, {}),
        math,
        widget: {
          format: 'clock-read',
          time: { h, m },
          numerals,
          input: 'pick',
          options: shown.map((o) => ({ id: timeOptionId(o.h, o.m), label: timeText(o.h, o.m) })),
        },
        answer: { kind: 'choice', id: timeOptionId(h, m) },
        nudge: [{ op: 'point-hour' }],
      };
      return finish(timeClock, ctx, p);
    }
    if (pick) {
      const shown = rng.fork('layout').shuffle(hourClass(h, hourClassSize(t)));
      p = {
        params,
        vars: pickVars(t, {}),
        math,
        widget: {
          format: 'clock-read',
          time: { h, m },
          numerals,
          input: 'pick',
          options: shown.map((n) => ({ id: numberOptionId(n), label: String(n) })),
        },
        answer: { kind: 'choice', id: numberOptionId(h) },
        nudge: [{ op: 'point-hour' }],
      };
      return finish(timeClock, ctx, p);
    }
    p = {
      params,
      vars: pickVars(t, { hour: h, next: nextHour(h) }),
      math,
      widget: { format: 'clock-read', time: { h, m }, numerals, input: 'digital-pad' },
      answer: { kind: 'numbers', values: [h, m], ordered: true },
      nudge: [{ op: 'point-hour' }],
    };
    return finish(timeClock, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    if (a.kind === 'state') return { kind: 'state', value: { h: a.target.h, m: a.target.m } };
    return correctFromAnswer(a);
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    if (w.format === 'clock-set') {
      const { h, m } = w.target;
      // Steps before the last name no number: the worked-step hint (level 4) plays them.
      return [
        say('gen.time.clock.long-hand', {}, { op: 'highlight-hand', args: { hand: 'minute' } }),
        say('gen.time.clock.turn-long', {}, { op: 'drag-minute', args: { to: m } }),
        say('gen.time.clock.short-hand', {}, { op: 'highlight-hand', args: { hand: 'hour' } }),
        say(
          'gen.time.clock.turn-short',
          { time: timeText(h, m) },
          {
            op: 'drag-hour',
            args: { to: h },
          },
        ),
      ];
    }
    if (w.format !== 'clock-read') return [];
    const { h, m } = w.time;
    if (w.ampm) {
      const id = w.ampm.isPm ? 'pm' : 'am';
      return [say(`gen.time.clock.${id}`, {}, { op: 'answer', args: { id } })];
    }
    if (w.input === 'pick' && (w.options ?? []).some((o) => o.id.startsWith('time-'))) {
      return [
        say('gen.time.clock.short-hand', {}, { op: 'point-hour' }),
        say('gen.time.clock.long-hand', {}, { op: 'point-minute' }),
        say(
          'gen.time.clock.reads',
          { time: timeText(h, m) },
          { op: 'answer', args: { id: timeOptionId(h, m) } },
        ),
      ];
    }
    if (w.input === 'pick') {
      return [
        say('gen.time.clock.between', {}, { op: 'point-hour' }),
        say('gen.time.clock.after', { hour: h }, { op: 'answer', args: { id: numberOptionId(h) } }),
      ];
    }
    return [
      say('gen.time.clock.short-hand', {}, { op: 'point-hour' }),
      say('gen.time.clock.long-hand', {}, { op: 'point-minute' }),
      say(
        'gen.time.clock.reads',
        { time: timeText(h, m) },
        {
          op: 'answer',
          args: { values: [h, m] },
        },
      ),
    ];
  },
};
