// 03 §5.6 time.clock and time.sequence: fixed params → answer, widget and solution per format,
// exampleCorrect is correct, solutions replay through the order model, features at the extremes,
// validity (accepts), the clock.time checker and the two clock misconception rules.

import {
  type ItemFormat,
  type ItemTemplate,
  type MisconceptionSpec,
  type ParamValues,
  type ResponseValue,
  widgetConfigSchema,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { clockTime, faceMinutes } from '../../check/state/clock.time';
import { initContent, resetContent } from '../../content/binding';
import { formatModel } from '../../formats';
import { checkResponse } from '../../items/check';
import { generateItem, generateItemFromParams, itemFeatures } from '../../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../../items/solution';
import { hourHandNext } from '../../misconceptions/rules/hourHandNext';
import { hourMinuteSwap } from '../../misconceptions/rules/hourMinuteSwap';
import { GenerationError } from '../types';
import { precisionFeatures, turnDistance } from './clock';
import { nextHour, prevHour, timeText } from './face';
import { DAY_EVENTS, MORNING_EVENTS, NIGHT_EVENTS } from './sequence';

let nextId = 0;
function tpl(
  generator: 'time.clock' | 'time.sequence',
  format: ItemFormat,
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.${generator}.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier: format === 'clock-set' || format === 'shape-sort' ? 'concrete' : 'pictorial',
    generator,
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.one', 'h.two', 'h.three'] },
    ...over,
  };
}

beforeEach(() => {
  resetContent();
  initContent({ templates: [], narration: {}, misconceptions: [] });
});

const build = (t: ItemTemplate, params: ParamValues) => generateItemFromParams(t, params);

describe('clock face helpers', () => {
  it('wraps hours round the face', () => {
    expect(nextHour(12)).toBe(1);
    expect(nextHour(3)).toBe(4);
    expect(prevHour(1)).toBe(12);
    expect(prevHour(7)).toBe(6);
    expect(timeText(3, 0)).toBe('3:00');
    expect(timeText(11, 30)).toBe('11:30');
  });
  it('reads the precision a time needs', () => {
    expect(precisionFeatures(0)).toEqual({
      'precision.half': 0,
      'precision.quarter': 0,
      'precision.five': 0,
      'precision.one': 0,
    });
    expect(precisionFeatures(30)['precision.half']).toBe(1);
    expect(precisionFeatures(45)['precision.quarter']).toBe(1);
    expect(precisionFeatures(20)['precision.five']).toBe(1);
    expect(precisionFeatures(7)['precision.one']).toBe(1);
  });
  it('measures the turn the shorter way round', () => {
    expect(turnDistance(12, 12, 0)).toBe(0);
    expect(turnDistance(12, 6, 0)).toBe(1);
    expect(turnDistance(12, 3, 0)).toBe(0.5);
    expect(turnDistance(12, 9, 0)).toBe(0.5);
    expect(turnDistance(12, 11, 30)).toBeCloseTo(0.083, 3);
  });
});

describe('time.clock clock-set', () => {
  const t = tpl('time.clock', 'clock-set', { params: { mode: { kind: 'const', value: 'set' } } });

  it('asks for the target as a clock.time state and starts at 12:00', () => {
    const item = build(t, { h: 3, m: 30, showDigital: false });
    expect(item.answer).toEqual({ kind: 'state', checker: 'clock.time', target: { h: 3, m: 30 } });
    expect(item.widget).toMatchObject({
      format: 'clock-set',
      target: { h: 3, m: 30 },
      start: { h: 12, m: 0 },
      precision: 5,
      showDigital: false,
      prompt: 'spoken',
    });
    expect(widgetConfigSchema.safeParse(item.widget).success).toBe(true);
    expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
    const f = itemFeatures(item, t);
    expect(f['precision.half']).toBe(1);
    expect(f.afterHalf).toBe(1);
    expect(f['digital.hidden']).toBe(1);
    expect(f.turn).toBeCloseTo(3.5 / 6, 3);
  });

  it('shows a digital prompt and readout when asked; an hour has no precision feature', () => {
    const item = build(t, { h: 1, m: 0, prompt: 'digital', showDigital: true });
    expect(item.widget).toMatchObject({ prompt: 'digital', showDigital: true });
    const f = itemFeatures(item, t);
    expect(f['digital.hidden']).toBe(0);
    expect(f.afterHalf).toBe(0);
    expect(f['precision.half']).toBe(0);
  });

  it('solves by turning the long hand, then the short hand', () => {
    const item = build(t, { h: 8, m: 0 });
    const steps = itemSolution(item, t);
    expect(steps.map((s) => s.action?.op)).toEqual([
      'highlight-hand',
      'drag-minute',
      'highlight-hand',
      'drag-hour',
    ]);
    expect(steps.at(-1)?.action?.args).toEqual({ to: 8 });
    expect(steps.at(-1)?.vars).toEqual({ time: '8:00' });
    // Steps before the last name no number.
    expect(steps.slice(0, -1).every((s) => Object.keys(s.vars ?? {}).length === 0)).toBe(true);
  });

  it('rejects a target the hands already show, a minute off the snap, and the read mode', () => {
    expect(() => build(t, { h: 12, m: 0 })).toThrow(GenerationError);
    expect(() => build(t, { h: 3, m: 7 })).toThrow(GenerationError);
    expect(() => build(t, { h: 3, m: 0, mode: 'read' })).toThrow(GenerationError);
    expect(build(t, { h: 12, m: 0, startH: 3 }).widget).toMatchObject({ start: { h: 3, m: 0 } });
  });
});

describe('time.clock clock-read', () => {
  const pad = tpl('time.clock', 'clock-read');

  it('types the time as numbers [h, m]', () => {
    const item = build(pad, { h: 12, m: 0, numerals: false });
    expect(item.answer).toEqual({ kind: 'numbers', values: [12, 0], ordered: true });
    expect(item.widget).toEqual({
      format: 'clock-read',
      time: { h: 12, m: 0 },
      numerals: false,
      input: 'digital-pad',
    });
    expect(checkResponse(item, { kind: 'numbers', values: [12, 0] }).correct).toBe(true);
    expect(checkResponse(item, { kind: 'numbers', values: [0, 12] }).correct).toBe(false);
    const f = itemFeatures(item, pad);
    expect(f['numerals.off']).toBe(1);
    expect(f['input.pick']).toBe(0);
    const steps = itemSolution(item, pad);
    expect(steps.map((s) => s.action?.op)).toEqual(['point-hour', 'point-minute', 'answer']);
    expect(steps.at(-1)?.action?.args).toEqual({ values: [12, 0] });
  });

  it('the pick reads the hour only, and asks no full time (K01)', () => {
    expect(() => build(pad, { h: 3, m: 0, input: 'pick', ask: 'hour' })).toThrow(GenerationError);
    expect(() => build(pad, { h: 3, m: 30, input: 'pick', ask: 'time' })).toThrow(GenerationError);
    expect(() => build(pad, { h: 3, m: 30, ask: 'hour' })).toThrow(GenerationError);
  });

  const pick = tpl('time.clock', 'clock-read', {
    params: {
      input: { kind: 'const', value: 'pick' },
      ask: { kind: 'const', value: 'hour' },
    },
    distractors: [{ rule: 'MC.hour-hand-next' }, { rule: 'MC.hour-minute-swap' }],
  });

  it("offers the hour's run of four hours on the hour pick (PR #84 review: not built round the key)", () => {
    const item = build(pick, { h: 2, m: 40 });
    const ids =
      item.widget.format === 'clock-read' ? (item.widget.options ?? []).map((o) => o.id) : [];
    expect(item.answer).toEqual({ kind: 'choice', id: 'opt-2' });
    expect([...ids].sort()).toEqual(['opt-1', 'opt-2', 'opt-3', 'opt-4']);
    for (const h of [1, 3, 4]) {
      const other = build(pick, { h, m: 40 });
      const o =
        other.widget.format === 'clock-read' ? (other.widget.options ?? []).map((x) => x.id) : [];
      expect([...o].sort()).toEqual([...ids].sort());
    }
    const f = itemFeatures(item, pick);
    expect(f['input.pick']).toBe(1);
    expect(f.afterHalf).toBe(1);
    expect(f['precision.five']).toBe(0); // the minutes are not read
    expect(itemSolution(item, pick).at(-1)?.action).toEqual({
      op: 'answer',
      args: { id: 'opt-2' },
    });
  });

  it('runs of three without distractors, of four with them', () => {
    const plain = tpl('time.clock', 'clock-read', {
      params: { input: { kind: 'const', value: 'pick' }, ask: { kind: 'const', value: 'hour' } },
    });
    const item = build(plain, { h: 12, m: 10 });
    const ids =
      item.widget.format === 'clock-read' ? (item.widget.options ?? []).map((o) => o.id) : [];
    expect([...ids].sort()).toEqual(['opt-10', 'opt-11', 'opt-12']);
    const swapIsNext = build(pick, { h: 5, m: 30 }); // the long hand on 6 is also the next hour
    const ids2 =
      swapIsNext.widget.format === 'clock-read'
        ? (swapIsNext.widget.options ?? []).map((o) => o.id)
        : [];
    expect([...ids2].sort()).toEqual(['opt-5', 'opt-6', 'opt-7', 'opt-8']);
  });

  it('every generated item is valid and deterministic', () => {
    for (const t of [pad, pick]) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const item = generateItem(
          { ...t, params: { ...t.params, m: { kind: 'choice', values: [10, 30, 50] } } },
          seed,
        );
        expect(widgetConfigSchema.safeParse(item.widget).success).toBe(true);
        expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
      }
    }
  });
});

describe('clock.time', () => {
  const target = { h: 3, m: 30 };
  it.each([
    [{ h: 3, m: 30 }, true],
    [{ h: 15, m: 30 }, true], // the same hour on the face (alternative end state)
    [{ h: 3, m: 35 }, false],
    [{ h: 4, m: 30 }, false],
    [{ h: 3, m: 60 }, false],
    [{ h: 3 }, false],
    [{ h: -1, m: 30 }, false],
  ])('%j → %s', (value, ok) => {
    expect(clockTime.check(target, value)).toBe(ok);
  });
  it('reads 12 and 0 as the same hour', () => {
    expect(clockTime.check({ h: 12, m: 0 }, { h: 0, m: 0 })).toBe(true);
    expect(faceMinutes(12, 15)).toBe(15);
    expect(faceMinutes(1, 1.5)).toBeNull();
  });
});

describe('MC.hour-minute-swap and MC.hour-hand-next', () => {
  const pad = tpl('time.clock', 'clock-read');
  const set = tpl('time.clock', 'clock-set', { params: { mode: { kind: 'const', value: 'set' } } });
  const pick = tpl('time.clock', 'clock-read', {
    params: {
      input: { kind: 'const', value: 'pick' },
      ask: { kind: 'const', value: 'hour' },
    },
    distractors: [{ rule: 'MC.hour-hand-next' }, { rule: 'MC.hour-minute-swap' }],
  });

  it('swap predicts 12:15 for 3:00, on the pad and on the clock', () => {
    const p = build(pad, { h: 3, m: 0 });
    expect(hourMinuteSwap.predict?.(p)).toEqual({ kind: 'numbers', values: [12, 15] });
    expect(hourMinuteSwap.match(p, { kind: 'numbers', values: [12, 15] })).toBe(true);
    expect(hourMinuteSwap.match(p, { kind: 'numbers', values: [4, 0] })).toBe(false);
    const s = build(set, { h: 3, m: 0 });
    expect(hourMinuteSwap.predict?.(s)).toEqual({ kind: 'state', value: { h: 12, m: 15 } });
    expect(hourMinuteSwap.match(s, { kind: 'state', value: { h: 0, m: 15 } })).toBe(true);
  });

  it('swap cannot discriminate 12:00 or 6:30, nor a minute the hand cannot reach', () => {
    expect(hourMinuteSwap.predict?.(build(pad, { h: 12, m: 0 }))).toBeNull();
    expect(hourMinuteSwap.predict?.(build(pad, { h: 6, m: 30 }))).toBeNull();
    expect(hourMinuteSwap.predict?.(build(set, { h: 3, m: 0, precision: 30 }))).toBeNull();
    expect(hourMinuteSwap.predict?.(build(pad, { h: 3, m: 7 }))).toBeNull();
  });

  it('swap names the long-hand number on the hour pick, unless it is the next hour', () => {
    expect(hourMinuteSwap.predict?.(build(pick, { h: 2, m: 20 }))).toEqual({
      kind: 'choice',
      id: 'opt-4',
    });
    // 8 is not in the run 1-4, so the pick cannot show the swap.
    expect(hourMinuteSwap.predict?.(build(pick, { h: 2, m: 40 }))).toBeNull();
    expect(hourMinuteSwap.predict?.(build(pick, { h: 5, m: 30 }))).toBeNull();
    expect(hourMinuteSwap.predict?.(build(pick, { h: 2, m: 10 }))).toBeNull(); // the long hand is on 2
  });

  it('hour-hand-next predicts the next hour from half past on', () => {
    expect(hourHandNext.predict?.(build(pad, { h: 2, m: 30 }))).toEqual({
      kind: 'numbers',
      values: [3, 30],
    });
    expect(hourHandNext.predict?.(build(pad, { h: 12, m: 30 }))).toEqual({
      kind: 'numbers',
      values: [1, 30],
    });
    expect(hourHandNext.predict?.(build(set, { h: 2, m: 30 }))).toEqual({
      kind: 'state',
      value: { h: 3, m: 30 },
    });
    expect(hourHandNext.predict?.(build(pick, { h: 5, m: 30 }))).toEqual({
      kind: 'choice',
      id: 'opt-6',
    });
    expect(hourHandNext.predict?.(build(pad, { h: 2, m: 0 }))).toBeNull();
    expect(hourHandNext.predict?.(build(pick, { h: 2, m: 20 }))).toBeNull();
    expect(
      hourHandNext.match(build(pad, { h: 2, m: 30 }), { kind: 'numbers', values: [1, 30] }),
    ).toBe(false);
  });

  it('checkResponse tags the swap through the bound library', () => {
    const spec: MisconceptionSpec = {
      id: 'MC.hour-minute-swap',
      name: 'swap',
      area: 'time-money',
      detect: { kind: 'answer', rule: 'hourMinuteSwap' },
      appliesTo: { generators: ['time.clock'] },
      skills: ['X.01'],
      remediation: [],
      feedback: 'fb.mc.hour-minute-swap',
      priority: 50,
      parentTip: 'tip',
      examples: [],
    };
    initContent({ templates: [pad], narration: {}, misconceptions: [spec] });
    const item = build(pad, { h: 4, m: 0 });
    const r: ResponseValue = { kind: 'numbers', values: [12, 20] };
    expect(checkResponse(item, r).misconceptionIds).toEqual(['MC.hour-minute-swap']);
  });
});

describe('time.sequence order', () => {
  const order = tpl('time.sequence', 'order');
  const model = formatModel('order');

  it('puts the events in the order of the day, values their places', () => {
    const item = build(order, { events: 3, adjacent: true });
    expect(item.answer.kind).toBe('numbers');
    const values = item.answer.kind === 'numbers' ? item.answer.values : [];
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values.every((v, i) => i === 0 || v === (values[i - 1] as number) + 1)).toBe(true);
    const w = item.widget.format === 'order' ? item.widget : null;
    expect(w?.items.every((i) => i.stimulus?.kind === 'objects' && i.label === undefined)).toBe(
      true,
    );
    expect(w?.direction).toBe('asc');
    const f = itemFeatures(item, order);
    expect(f).toMatchObject({ adjacent: 1, 'events.over3': 0, anchor: 0, items: 0 });
    expect(model?.configSchema.safeParse(item.widget).success).toBe(true);
  });

  it('skips an event unless adjacent', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const item = generateItemFromParams(order, { events: 4, adjacent: false }, { seed });
      const v = item.answer.kind === 'numbers' ? item.answer.values : [];
      expect(v.every((x, i) => i === 0 || x === (v[i - 1] as number) + 1)).toBe(false);
      expect(v.every((x) => x >= 1 && x <= DAY_EVENTS.length)).toBe(true);
    }
  });

  it('a fixed event sits on its own place, and the solution replays to a correct order', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const item = generateItemFromParams(
        order,
        { events: 4, adjacent: seed % 2 === 0, fixed: true },
        { seed },
      );
      const w = item.widget.format === 'order' ? item.widget : null;
      const fixed = Object.entries(w?.fixed ?? {});
      expect(fixed).toHaveLength(1);
      const [slot, id] = fixed[0] as [string, string];
      const values = item.answer.kind === 'numbers' ? item.answer.values : [];
      expect(w?.items.find((i) => i.id === id)?.value).toBe(values[Number(slot)]);
      const steps = itemSolution(item, order);
      expect(steps[0]?.action).toBeUndefined();
      expect(steps).toHaveLength(4); // think, then three drags
      const r = replaySteps(item, steps);
      expect(r && checkResponse(item, r).correct).toBe(true);
      expect(itemFeatures(item, order).anchor).toBe(1);
    }
  });

  it('rejects five events that skip, an anchor on two, and out-of-range counts', () => {
    expect(() => build(order, { events: 5, adjacent: false })).toThrow(GenerationError);
    expect(() => build(order, { events: 2, fixed: true, adjacent: true })).toThrow(GenerationError);
    expect(() => build(order, { events: 6, adjacent: true })).toThrow(GenerationError);
    expect(build(order, { events: 5, adjacent: true }).answer).toEqual({
      kind: 'numbers',
      values: [1, 2, 3, 4, 5],
      ordered: true,
    });
  });
});

describe('time.sequence shape-sort', () => {
  const sort = tpl('time.sequence', 'shape-sort');

  it('sorts event cards into morning and night', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const n = 4 + (seed % 3);
      const item = generateItemFromParams(sort, { events: n }, { seed });
      const w = item.widget.format === 'shape-sort' ? item.widget : null;
      expect(w?.cards).toHaveLength(n);
      expect(w?.bins?.map((b) => b.label)).toEqual(['word.morning', 'word.night']);
      const events = (w?.cards ?? []).map((c) => (c.card as { event: string }).event);
      expect(new Set(events).size).toBe(n);
      const morning = events.filter((e) => (MORNING_EVENTS as readonly string[]).includes(e));
      const night = events.filter((e) => (NIGHT_EVENTS as readonly string[]).includes(e));
      expect(morning.length).toBeGreaterThan(0);
      expect(night.length).toBeGreaterThan(0);
      expect(morning.length + night.length).toBe(n);
      const ex = itemExampleCorrect(item, sort);
      expect(checkResponse(item, ex).correct).toBe(true);
      expect(
        checkResponse(item, { kind: 'state', value: { bins: { b0: [], b1: [] } } }).correct,
      ).toBe(false);
      expect(itemFeatures(item, sort).cards).toBe(n - 4);
      const steps = itemSolution(item, sort);
      expect(steps.slice(1).every((s) => s.action?.op === 'drag-card')).toBe(true);
      expect(steps).toHaveLength(n + 1);
    }
  });

  it('a night card in the morning bin is wrong', () => {
    const item = build(sort, { events: 4 });
    const ex = itemExampleCorrect(item, sort);
    if (ex.kind !== 'state') throw new Error('state expected');
    const bins = ex.value.bins as Record<string, string[]>;
    const swapped = { b0: bins.b1 ?? [], b1: bins.b0 ?? [] };
    expect(checkResponse(item, { kind: 'state', value: { bins: swapped } }).correct).toBe(false);
  });

  it('accepts only 4–6 cards and no order params', () => {
    expect(() => build(sort, { events: 3 })).toThrow(GenerationError);
    expect(() => build(sort, { events: 7 })).toThrow(GenerationError);
    expect(() => build(sort, { events: 4, fixed: true })).toThrow(GenerationError);
  });
});
