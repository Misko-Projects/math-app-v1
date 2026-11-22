// 03 §6.3 format state models and 03 §5.5 configs, features and answer semantics for the U05
// clock formats (#14): clock-set and clock-read, to #84's conventions (engine README "Time
// formats"). Every state response runs through `clock.time`, so the model and the checker agree,
// and every TIM template's solution replays to a correct response.

import {
  FORMAT_SUPPORT,
  type ItemFormat,
  type WidgetAction,
  type WidgetConfig,
  type WidgetConfigOf,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { stateChecker } from '../check/state';
import { precisionFeatures as generatorPrecision } from '../generators/time/clock';
import {
  hourAngle,
  minuteAngle,
  onFace,
  precisionFeatures,
  snapMinute,
  timeOf,
  turnMinuteHand,
} from './clock';
import { clockRead, isHourPick } from './clock-read';
import { clockSet } from './clock-set';
import { formatModel } from './index';
import { type FormatModel, type FormatState, UnsupportedOpError } from './types';

// biome-ignore lint/suspicious/noExplicitAny: the shared tables mix models of different formats.
type AnyModel = FormatModel<any, any>;

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };

function play<F extends ItemFormat, S extends FormatState<F>>(
  m: FormatModel<F, S>,
  config: WidgetConfigOf<F>,
  ops: WidgetAction[],
): S {
  return ops.reduce((s, a) => m.apply(s, a), m.initialState(config));
}

const respond = <F extends ItemFormat, S extends FormatState<F>>(
  m: FormatModel<F, S>,
  config: WidgetConfigOf<F>,
  ops: WidgetAction[],
) => m.toResponse(play(m, config, ops));

function issuePaths(m: AnyModel, config: unknown): string[] {
  const r = m.configSchema.safeParse(config);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
}

const clockTimeOk = (target: { h: number; m: number }, r: ReturnType<AnyModel['toResponse']>) =>
  r?.kind === 'state' && (stateChecker('clock.time')?.check(target, r.value) ?? false);

// ---------- configs (TIM.01.t1, TIM.04.t1 and TIM.09.t3 shapes, #84) ----------

const setHour: WidgetConfigOf<'clock-set'> = {
  format: 'clock-set',
  target: { h: 3, m: 0 },
  start: { h: 12, m: 0 },
  precision: 5,
  showDigital: true,
  prompt: 'spoken',
};

const setHalf: WidgetConfigOf<'clock-set'> = { ...setHour, target: { h: 3, m: 30 } };

const setElapsed: WidgetConfigOf<'clock-set'> = {
  ...setHour,
  target: { h: 4, m: 15 },
  start: { h: 3, m: 40 },
  prompt: 'elapsed',
  elapsed: { from: { h: 3, m: 40 }, minutes: 35 },
  showDigital: false,
  precision: 5,
};

const readPad: WidgetConfigOf<'clock-read'> = {
  format: 'clock-read',
  time: { h: 3, m: 30 },
  numerals: true,
  input: 'digital-pad',
};

const readHourPick: WidgetConfigOf<'clock-read'> = {
  format: 'clock-read',
  time: { h: 3, m: 40 },
  numerals: false,
  input: 'pick',
  options: [
    { id: 'opt-4', label: '4' },
    { id: 'opt-3', label: '3' },
    { id: 'opt-8', label: '8' },
    { id: 'opt-2', label: '2' },
  ],
};

const readTimePick: WidgetConfigOf<'clock-read'> = {
  format: 'clock-read',
  time: { h: 9, m: 15 },
  numerals: true,
  input: 'pick',
  options: [
    { id: 't-915', label: '9:15' },
    { id: 't-303', label: '3:45' },
    { id: 't-1015', label: '10:15' },
  ],
};

const readAmPm: WidgetConfigOf<'clock-read'> = {
  format: 'clock-read',
  time: { h: 7, m: 0 },
  numerals: true,
  input: 'pick',
  ampm: { scene: 'breakfast', isPm: false },
};

// ---------- face arithmetic ----------

describe('clock face (geared hands)', () => {
  it('both hands come from one time: hour 30° an hour + 0.5° a minute, minute 6° a minute', () => {
    expect(hourAngle(onFace(3 * 60))).toBe(90);
    // At 3:30 the hour hand is exactly halfway between 3 (90°) and 4 (120°).
    expect(hourAngle(3 * 60 + 30)).toBe(105);
    expect(minuteAngle(3 * 60 + 30)).toBe(180);
    expect(hourAngle(12 * 60)).toBe(0);
    expect(hourAngle(11 * 60 + 59)).toBeCloseTo(359.5);
    for (let t = 0; t < 720; t += 7) {
      // The hour hand's position past its hour is the minute hand's fraction of a turn.
      const intoHour = (hourAngle(t) % 30) / 30;
      expect(intoHour).toBeCloseTo(minuteAngle(t) / 360, 10);
    }
  });

  it('reads h 1–12 and m 0–59', () => {
    expect(timeOf(0)).toEqual({ h: 12, m: 0 });
    expect(timeOf(30)).toEqual({ h: 12, m: 30 });
    expect(timeOf(3 * 60 + 5)).toEqual({ h: 3, m: 5 });
    expect(timeOf(-5)).toEqual({ h: 11, m: 55 });
    expect(timeOf(725)).toEqual({ h: 12, m: 5 });
  });

  it('turning the minute hand past 12 carries the hour forward or back', () => {
    expect(timeOf(turnMinuteHand(3 * 60 + 50, 10))).toEqual({ h: 4, m: 10 });
    expect(timeOf(turnMinuteHand(4 * 60 + 10, 50))).toEqual({ h: 3, m: 50 });
    expect(timeOf(turnMinuteHand(12 * 60, 45))).toEqual({ h: 11, m: 45 });
    expect(timeOf(turnMinuteHand(12 * 60, 45, 'cw'))).toEqual({ h: 12, m: 45 });
    expect(timeOf(turnMinuteHand(3 * 60, 30))).toEqual({ h: 3, m: 30 });
    expect(timeOf(turnMinuteHand(3 * 60 + 20, 20, 'ccw'))).toEqual({ h: 3, m: 20 });
  });

  it('snaps to the precision', () => {
    expect(snapMinute(7, 5)).toBe(5);
    expect(snapMinute(58, 5)).toBe(0);
    expect(snapMinute(44, 15)).toBe(45);
    expect(snapMinute(29, 60)).toBe(0);
  });

  it('precision features match time.clock (#84) for every minute', () => {
    for (let m = 0; m < 60; m++) expect(precisionFeatures(m)).toEqual(generatorPrecision(m));
  });
});

// ---------- registry and ops ----------

const MODELS: [ItemFormat, AnyModel, WidgetConfig][] = [
  ['clock-set', clockSet, setHour],
  ['clock-read', clockRead, readPad],
];

describe('U05 clock format models (03 §6.3)', () => {
  it.each(MODELS)('%s is registered', (format, model) => {
    expect(formatModel(format)).toBe(model);
  });
  it.each(MODELS)('%s accepts every op its format lists', (format, model, config) => {
    let s = model.initialState(config);
    for (const op of FORMAT_SUPPORT[format].ops) s = model.apply(s, act(op));
    expect(model.toResponse(s)).toBeNull();
  });
  it.each(MODELS)('%s throws UnsupportedOpError on an unknown op', (_f, model, config) => {
    expect(() => model.apply(model.initialState(config), act('wind-up'))).toThrow(
      UnsupportedOpError,
    );
  });
  it.each(MODELS)('%s ignores malformed args without throwing', (format, model, config) => {
    const s0 = model.initialState(config);
    const junk = [
      { to: 'x' },
      { to: null },
      { hand: 7 },
      { values: ['3', 30] },
      { id: 9 },
      { h: 'x' },
    ];
    for (const op of [...FORMAT_SUPPORT[format].ops, 'answer']) {
      for (const args of junk) expect(model.toResponse(model.apply(s0, act(op, args)))).toBeNull();
    }
  });
  it.each(MODELS)('%s is pure', (format, model, config) => {
    const s0 = model.initialState(config);
    const before = JSON.stringify(s0);
    for (const op of FORMAT_SUPPORT[format].ops) model.apply(s0, act(op, { to: 25, hand: 'hour' }));
    model.apply(s0, act('answer', { values: [3, 30], h: 3, m: 30 }));
    expect(JSON.stringify(s0)).toBe(before);
  });
});

// ---------- clock-set ----------

describe('clock-set', () => {
  it('#84 solution: long hand to m, short hand to h, from 12:00', () => {
    const r = respond(clockSet, setHalf, [
      act('highlight-hand', { hand: 'minute' }),
      act('drag-minute', { to: 30 }),
      act('highlight-hand', { hand: 'hour' }),
      act('drag-hour', { to: 3 }),
    ]);
    expect(r).toEqual({ kind: 'state', value: { h: 3, m: 30 } });
    expect(clockTimeOk(setHalf.target, r)).toBe(true);
  });

  it('a minute past half from 12:00 goes back round (11:45), then the hour hand fixes the hour', () => {
    const s = play(clockSet, { ...setHour, target: { h: 6, m: 45 } }, [
      act('drag-minute', { to: 45 }),
    ]);
    expect(timeOf(s.t)).toEqual({ h: 11, m: 45 });
    const t = clockSet.apply(s, act('drag-hour', { to: 6 }));
    expect(timeOf(t.t)).toEqual({ h: 6, m: 45 });
  });

  it('alternative end state: winding the long hand round three times reaches 3:00 too', () => {
    let s = clockSet.initialState(setHour);
    for (let turn = 0; turn < 3; turn++) {
      for (const to of [15, 30, 45, 0])
        s = clockSet.apply(s, act('drag-minute', { to, dir: 'cw' }));
    }
    const r = clockSet.toResponse(s);
    expect(r).toEqual({ kind: 'state', value: { h: 3, m: 0 } });
    expect(clockTimeOk(setHour.target, r)).toBe(true);
  });

  it('dragging the hour hand moves the minute hand with it (keeps the minutes)', () => {
    const s = play(clockSet, setHalf, [
      act('drag-minute', { to: 20 }),
      act('drag-hour', { to: 9 }),
    ]);
    expect(timeOf(s.t)).toEqual({ h: 9, m: 20 });
    expect(hourAngle(s.t)).toBe(9 * 30 + 10);
  });

  it('snaps the long hand to the precision', () => {
    const s = play(clockSet, setHour, [act('drag-minute', { to: 22 })]);
    expect(timeOf(s.t)).toEqual({ h: 12, m: 20 });
    const q = play(clockSet, { ...setHour, precision: 15 }, [act('drag-minute', { to: 22 })]);
    expect(timeOf(q.t)).toEqual({ h: 12, m: 15 });
  });

  it('nothing to submit until a hand moves; visual ops change no time', () => {
    const s = play(clockSet, setHour, [
      act('highlight-hand', { hand: 'hour' }),
      act('count-fives', { from: 0, to: 25 }),
    ]);
    expect(clockSet.toResponse(s)).toBeNull();
    expect(s.highlighted).toBe('hour');
    expect(s.fives).toEqual({ from: 0, to: 25 });
    expect(timeOf(s.t)).toEqual({ h: 12, m: 0 });
  });

  it('answer {h, m} or {values} sets the time; a wrong time fails clock.time', () => {
    expect(respond(clockSet, setHour, [act('answer', { values: [3, 0] })])).toEqual({
      kind: 'state',
      value: { h: 3, m: 0 },
    });
    const swapped = respond(clockSet, setHour, [act('answer', { h: 12, m: 15 })]);
    expect(clockTimeOk(setHour.target, swapped)).toBe(false);
    expect(respond(clockSet, setHour, [act('answer', { h: 3, m: 75 })])).toBeNull();
  });

  it('features: 0 for an o’clock target with the readout on, per 03 §5.5 otherwise', () => {
    expect(
      clockSet.featureValues(setHour, { kind: 'state', checker: 'clock.time', target: {} }),
    ).toEqual({
      'precision.half': 0,
      'precision.quarter': 0,
      'precision.five': 0,
      'precision.one': 0,
      afterHalf: 0,
      elapsed: 0,
      'digital.hidden': 0,
    });
    const f = clockSet.featureValues(setElapsed, {
      kind: 'state',
      checker: 'clock.time',
      target: {},
    });
    expect(f['precision.quarter']).toBe(1);
    expect(f.elapsed).toBe(1);
    expect(f['digital.hidden']).toBe(1);
    expect(
      clockSet.featureValues(setHalf, { kind: 'state', checker: 'clock.time', target: {} })
        .afterHalf,
    ).toBe(1);
  });

  it('configSchema accepts spec-valid configs and rejects the rest', () => {
    for (const c of [setHour, setHalf, setElapsed]) expect(issuePaths(clockSet, c)).toEqual([]);
    expect(issuePaths(clockSet, { ...setHour, target: { h: 3, m: 7 } })).toContain('target.m');
    expect(issuePaths(clockSet, { ...setHour, target: { h: 3, m: 60 } })).toContain('target');
    expect(issuePaths(clockSet, { ...setHour, target: { h: 12, m: 0 } })).toContain('start');
    expect(issuePaths(clockSet, { ...setHour, prompt: 'elapsed' })).toContain('elapsed');
    expect(
      issuePaths(clockSet, { ...setElapsed, elapsed: { from: { h: 3, m: 40 }, minutes: 30 } }),
    ).toContain('elapsed');
  });
});

// ---------- clock-read ----------

describe('clock-read', () => {
  it('digital-pad answers [h, m]; pick answers an option id; am/pm answers am or pm', () => {
    expect(respond(clockRead, readPad, [act('answer', { values: [3, 30] })])).toEqual({
      kind: 'numbers',
      values: [3, 30],
    });
    expect(respond(clockRead, readPad, [act('answer', { values: [3] })])).toBeNull();
    expect(respond(clockRead, readHourPick, [act('answer', { id: 'opt-3' })])).toEqual({
      kind: 'choice',
      id: 'opt-3',
    });
    expect(respond(clockRead, readHourPick, [act('answer', { id: 'opt-5' })])).toBeNull();
    expect(respond(clockRead, readAmPm, [act('answer', { id: 'am' })])).toEqual({
      kind: 'choice',
      id: 'am',
    });
  });

  it('point and count-fives are visual', () => {
    const s = play(clockRead, readPad, [act('point-hour'), act('count-fives', { to: 30 })]);
    expect(s.pointed).toBe('hour');
    expect(s.fives).toBe(30);
    expect(clockRead.toResponse(s)).toBeNull();
    expect(clockRead.apply(s, act('point-minute')).pointed).toBe('minute');
  });

  it('features: hour picks read no minutes (#84); time picks do', () => {
    const none = { kind: 'choice', id: 'x' } as const;
    expect(isHourPick(readHourPick)).toBe(true);
    expect(isHourPick(readTimePick)).toBe(false);
    expect(clockRead.featureValues(readHourPick, none)).toEqual({
      'precision.half': 0,
      'precision.quarter': 0,
      'precision.five': 0,
      'precision.one': 0,
      afterHalf: 1,
      'numerals.off': 1,
      'input.pick': 1,
    });
    expect(clockRead.featureValues(readTimePick, none)['precision.quarter']).toBe(1);
    expect(clockRead.featureValues(readPad, none)['precision.half']).toBe(1);
  });

  it('configSchema accepts spec-valid configs and rejects the rest', () => {
    for (const c of [readPad, readHourPick, readTimePick, readAmPm]) {
      expect(issuePaths(clockRead, c)).toEqual([]);
    }
    expect(
      issuePaths(clockRead, { ...readHourPick, options: readHourPick.options?.slice(0, 2) }),
    ).toContain('options');
    expect(issuePaths(clockRead, { ...readPad, options: [] })).toContain('options');
    expect(issuePaths(clockRead, { ...readAmPm, input: 'digital-pad' })).toContain('input');
    expect(issuePaths(clockRead, { ...readPad, time: { h: 3, m: 61 } })).toContain('time');
  });
});
