// time.clock (03 §5.6): read and set an analog clock. Formats: clock-set, clock-read.
//
// - clock-set (`mode: set`), TIM.01, TIM.04, TIM.09: the target `h:m` is spoken (`prompt: spoken`)
//   or shown as a digital clock (`prompt: digital`); the geared hands start at `startH:00` and the
//   minute hand snaps to `precision` (K01: 5, so a swapped setting, 12:15 for 3:00, is reachable).
//   Answer state `clock.time {h, m}`; the response is the time the hands show, `{h, m}`.
// - clock-read (`mode: read`), `input: digital-pad`: type the time shown, numbers [h, m] (h 1–12).
// - clock-read `input: pick` with `ask: hour` (TIM.09): which hour is it after? The options are
//   hours (`opt-<h>`): the hour, the template's diagnostic distractors (MC.hour-hand-next: the next
//   hour when m ≥ 30; MC.hour-minute-swap: the number the long hand points at), then the hours
//   around it. K01 builds no full-time pick (TIM.11, K02).
//
// The clock formats have no engine model (U05), so this generator emits their 03 §5.5 format
// features itself, reading the precision features from the target time (the finest step the time
// needs), not from the widget's snapping; `turn` is how far the hands travel from the start.

import type { LessonStep, ResponseValue } from '@number-island/shared';
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
import { minuteHandNumber, nextHour, prevHour, timeText } from './face';

export { minuteHandNumber, nextHour, prevHour, timeText } from './face';

const MODES = ['read', 'set'];
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
      default: { kind: 'choice', values: MODES },
      doc: 'read (clock-read) or set (clock-set); K02 adds match, ampm and quarter',
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
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const h = asNum(p.h);
    const m = asNum(p.m);
    if (h < 1 || h > 12 || m < 0 || m > 59) return false;
    const mode = asStr(p.mode);
    if (t.format === 'clock-set') {
      const precision = asNum(p.precision, 5);
      if (mode !== 'set' || !PRECISIONS.includes(precision) || m % precision !== 0) return false;
      // The hands must have somewhere to go.
      return turnDistance(asNum(p.startH, 12), h, m) > 0;
    }
    if (mode !== 'read') return false;
    const input = asStr(p.input);
    const ask = asStr(p.ask);
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
        vars: pickVars(t, { time }),
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
    const math: Record<string, number> = {
      // The hour pick reads no minutes, so the minutes' precision does not make it harder.
      ...(pick ? precisionFeatures(0) : precisionFeatures(m)),
      afterHalf: m >= 30 ? 1 : 0,
      'numerals.off': numerals ? 0 : 1,
      'input.pick': pick ? 1 : 0,
    };
    if (pick) {
      const want = (t.distractors?.length ?? 0) > 0 ? 4 : 3;
      const rules = new Set((t.distractors ?? []).map((d) => d.rule));
      const hours: number[] = [h];
      const add = (n: number | null) => {
        if (n !== null && hours.length < want && !hours.includes(n)) hours.push(n);
      };
      if (rules.has('MC.hour-hand-next') && m >= 30) add(nextHour(h));
      if (rules.has('MC.hour-minute-swap')) add(minuteHandNumber(m));
      for (const n of [nextHour(h), prevHour(h), nextHour(nextHour(h)), prevHour(prevHour(h))])
        add(n);
      const shown = rng.fork('layout').shuffle(hours);
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
      vars: pickVars(t, {}),
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
