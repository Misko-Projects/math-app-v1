// 03 §5.5 number-line-place: the format state model, widget schema and format features (U03).

import { FORMAT_SUPPORT, type WidgetAction, type WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { formatFeatures, formatModel, formatModels, UnsupportedOpError } from './index';
import {
  LINE_STEPS_CAP,
  lineLabels,
  lineSteps,
  lineTicks,
  type NumberLinePlaceState,
  numberLinePlace,
  snapPlacement,
} from './number-line-place';

type Config = WidgetConfigOf<'number-line-place'>;

const act = (op: string, args?: Record<string, unknown>): WidgetAction =>
  args ? { op, args } : { op };

const play = (config: Config, ops: WidgetAction[]): NumberLinePlaceState =>
  ops.reduce((s, a) => numberLinePlace.apply(s, a), numberLinePlace.initialState(config));

const respond = (config: Config, ops: WidgetAction[]) =>
  numberLinePlace.toResponse(play(config, ops));

const issuePaths = (config: unknown): string[] => {
  const r = numberLinePlace.configSchema.safeParse(config);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

/** The easiest item: place 2 on a 0–10 line with every tick and number shown. */
const base: Config = {
  format: 'number-line-place',
  min: 0,
  max: 10,
  ticksEvery: 1,
  labelsEvery: 1,
  target: 2,
  mode: 'place',
  snap: 'tick',
  vertical: false,
  valueScale: 1,
};
const estimate: Config = {
  ...base,
  max: 100,
  ticksEvery: null,
  labelsEvery: null,
  target: 37,
  snap: 'none',
};
const read: Config = { ...base, max: 20, labelsEvery: 5, target: 13, mode: 'read' };
const closer: Config = {
  ...base,
  min: 30,
  max: 40,
  labelsEvery: 10,
  target: 37,
  mode: 'closer',
  benchmarks: [30, 40],
};
const placement = (value: number) => ({ kind: 'placement', value });

describe('number-line-place model', () => {
  it('is registered and lists exactly the FORMAT_SUPPORT ops', () => {
    expect(formatModels()).toContain('number-line-place');
    expect(formatModel('number-line-place')).toBe(numberLinePlace);
    expect(formatFeatures('number-line-place')).toBe(numberLinePlace.features);
    expect(FORMAT_SUPPORT['number-line-place'].ops).toEqual([
      'drop',
      'show-tick',
      'count-ticks',
      'zoom',
    ]);
    // Every listed op (and the generic answer op) is accepted.
    const s = numberLinePlace.initialState(base);
    for (const op of FORMAT_SUPPORT['number-line-place'].ops) {
      expect(() => numberLinePlace.apply(s, act(op, { at: 3, from: 1, to: 4 }))).not.toThrow();
    }
    expect(() => numberLinePlace.apply(s, act('answer', { value: 2 }))).not.toThrow();
  });

  it.each([
    ['place: nothing dropped yet', base, [], null],
    ['place: a drop on a tick', base, [act('drop', { at: 2 })], placement(2)],
    ['place: a drop snaps to the nearest tick', base, [act('drop', { at: 6.4 })], placement(6)],
    ['place: a tie snaps to the smaller tick', base, [act('drop', { at: 2.5 })], placement(2)],
    ['place: a drop off the end is clamped', base, [act('drop', { at: 14 })], placement(10)],
    [
      'place: the last drop wins',
      base,
      [act('drop', { at: 7 }), act('drop', { at: 3 })],
      placement(3),
    ],
    [
      'place: estimation keeps the exact spot',
      estimate,
      [act('drop', { at: 41.25 })],
      placement(41.25),
    ],
    ['place: the answer op drops too', base, [act('answer', { value: 4.2 })], placement(4)],
    ['read: nothing typed yet', read, [act('drop', { at: 13 })], null],
    ['read: the typed value', read, [act('answer', { value: 13 })], { kind: 'number', value: 13 }],
    ['closer: nothing picked yet', closer, [], null],
    ['closer: a benchmark', closer, [act('answer', { id: 'b1' })], { kind: 'choice', id: 'b1' }],
    ['closer: an unknown id is ignored', closer, [act('answer', { id: 'b2' })], null],
    ['closer: a value is ignored', closer, [act('answer', { value: 40 })], null],
  ] as const)('%s', (_name, config, ops, expected) => {
    expect(respond(config, [...ops])).toEqual(expected);
  });

  it('snaps to the drawn ticks, which are multiples of ticksEvery', () => {
    const odd: Config = { ...base, min: 3, max: 13, ticksEvery: 2, target: 6 };
    expect(lineTicks(odd)).toEqual([4, 6, 8, 10, 12]);
    expect(snapPlacement(odd, 3.2)).toBe(4);
    expect(snapPlacement(odd, 12.9)).toBe(12);
    const tenths: Config = { ...base, max: 1, ticksEvery: 0.1, labelsEvery: 0.5, target: 0.3 };
    expect(lineTicks(tenths)).toHaveLength(11);
    // Review r2 F2: the steps stay inside [min, max] (no tick at 20 on a 0–19.999999 line by
    // tens), and the floating-point first step 0.07 is kept.
    expect(lineSteps(0, 19.999999, 10)).toEqual([0, 10]);
    expect(lineSteps(0.07, 0.1, 0.01)).toEqual([0.07, 0.08, 0.09, 0.1]);
    expect(lineSteps(0, 1, 0.1)).toHaveLength(11);
    const nearEnd = { ...odd, min: 0, max: 19.999999, ticksEvery: 10, snap: 'tick' as const };
    expect(snapPlacement(nearEnd, 19.999999)).toBe(10);
    expect(snapPlacement(nearEnd, 25)).toBe(10);
    expect(snapPlacement(tenths, 0.33)).toBe(0.3);
  });

  it('steps are exact at the step precision and never leave [min, max] (review r3 F2)', () => {
    // No slack: 20 lies past a 0–19.999999995 line, by any amount.
    expect(lineSteps(0, 19.999999995, 10)).toEqual([0, 10]);
    expect(lineSteps(0.000000005, 20, 10)).toEqual([10, 20]);
    expect(lineSteps(0.07, 0.1, 0.01)).toEqual([0.07, 0.08, 0.09, 0.1]);
    expect(lineSteps(0, 1, 0.1)).toContain(0.3);
    expect(lineSteps(0, 1, 0.1)).toHaveLength(11);
    // A computed step (0.1 / 10 is 0.010000000000000002) still lands on hundredths.
    expect(lineSteps(0.3, 0.4, (0.4 - 0.3) / 10)).toEqual([
      0.3, 0.31, 0.32, 0.33, 0.34, 0.35, 0.36, 0.37, 0.38, 0.39, 0.4,
    ]);
    expect(lineSteps(0, 1, 1 / 3).at(-1)).toBe(1);
    const odd: Config = { ...base, min: 0, max: 19.999999995, ticksEvery: 10, target: 6 };
    for (const snap of ['tick', 'none'] as const) {
      const line = { ...odd, snap };
      for (const at of [-5, 0, 0.0000001, 19.9999999, 19.999999995, 20, 25]) {
        const v = snapPlacement(line, at);
        expect(v).toBeGreaterThanOrEqual(line.min);
        expect(v).toBeLessThanOrEqual(line.max);
      }
    }
    expect(snapPlacement({ ...odd, snap: 'tick' }, 19.999999995)).toBe(10);
    expect(snapPlacement({ ...odd, snap: 'tick' }, 0)).toBe(0);
    const low: Config = { ...odd, min: 0.000000005, max: 20, snap: 'tick' };
    expect(snapPlacement(low, 0.000000005)).toBe(10);
  });

  it('a line too fine to step terminates with just its ends (review r3 F1)', () => {
    const started = performance.now();
    // The first index is near 1e17, where k + 1 === k.
    expect(lineSteps(1e-7, 2e-7, 1e-24)).toEqual([1e-7, 2e-7]);
    expect(lineSteps(0, 1e6, 1e-3)).toEqual([0, 1e6]);
    expect(lineSteps(1e20, 1e20 + 1e5, 1)).toEqual([1e20, 1e20 + 1e5]);
    expect(lineSteps(0, 1999, 1)).toHaveLength(LINE_STEPS_CAP);
    expect(lineSteps(0, 2000, 1)).toEqual([0, 2000]);
    expect(lineSteps(0, 10, Number.MIN_VALUE)).toEqual([0, 10]);
    expect(lineSteps(5, 5, 1)).toEqual([5]);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('hundredths stay in config units (valueScale 100)', () => {
    const dec: Config = { ...base, max: 100, ticksEvery: 10, labelsEvery: 50, target: 47 };
    expect(respond({ ...dec, valueScale: 100 }, [act('drop', { at: 47 })])).toEqual(placement(50));
    expect(respond({ ...dec, valueScale: 100, snap: 'none' }, [act('drop', { at: 47 })])).toEqual(
      placement(47),
    );
  });

  it('labels the ends even without labelsEvery', () => {
    expect(lineLabels(estimate)).toEqual([0, 100]);
    expect(lineLabels({ ...base, min: 3, max: 13, labelsEvery: 5 })).toEqual([3, 5, 10, 13]);
  });

  it('records shown ticks, the counted run and the zoom', () => {
    const s = play(base, [
      act('show-tick', { at: 5 }),
      act('show-tick', { at: 5 }),
      act('show-tick', { at: 12 }),
      act('show-tick', { at: 7 }),
      act('count-ticks', { from: 4, to: 1 }),
      act('zoom', { from: 2, to: 3 }),
      act('zoom', { from: 2 }),
    ]);
    expect(s).toMatchObject({
      shownTicks: [5, 7],
      counted: { from: 1, to: 4 },
      zoom: { from: 2, to: 3 },
      placed: null,
    });
    expect(numberLinePlace.toResponse(s)).toBeNull();
  });

  it('a drop without a position is ignored', () => {
    expect(respond(base, [act('drop')])).toBeNull();
  });

  it('throws UnsupportedOpError for an op it does not support', () => {
    const s = numberLinePlace.initialState(base);
    expect(() => numberLinePlace.apply(s, act('hop', { by: 1 }))).toThrow(UnsupportedOpError);
    try {
      numberLinePlace.apply(s, act('hop'));
    } catch (e) {
      expect(e).toMatchObject({ format: 'number-line-place', op: 'hop' });
    }
  });

  it('apply is pure', () => {
    const s = Object.freeze(numberLinePlace.initialState(base));
    const before = JSON.stringify(s);
    numberLinePlace.apply(s, act('drop', { at: 3 }));
    numberLinePlace.apply(s, act('show-tick', { at: 3 }));
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('number-line-place schema', () => {
  it('accepts the place, estimation, read, closer and vertical configs', () => {
    for (const c of [base, estimate, read, closer, { ...base, vertical: true }]) {
      expect(issuePaths(c)).toEqual([]);
    }
  });

  it.each([
    ['min ≥ max', { ...base, min: 10, max: 10, target: 10 }, 'max'],
    ['a target off the line (place)', { ...base, target: 11 }, 'target'],
    ['a target off the line (read)', { ...read, target: -1 }, 'target'],
    ['closer without benchmarks', { ...closer, benchmarks: undefined }, 'benchmarks'],
    ['benchmarks out of order', { ...closer, benchmarks: [40, 30] }, 'benchmarks'],
    ['benchmarks off the line', { ...closer, benchmarks: [30, 50] }, 'benchmarks'],
    ['zero ticks', { ...base, ticksEvery: 0 }, 'ticksEvery'],
    ['negative labels', { ...base, labelsEvery: -5 }, 'labelsEvery'],
    ['snapping without ticks', { ...base, ticksEvery: null }, 'snap'],
    ['a value scale of 10', { ...base, valueScale: 10 }, 'valueScale'],
  ])('rejects %s', (_name, config, path) => {
    expect(issuePaths(config)).toContain(path);
  });
});

describe('number-line-place features', () => {
  const answer = { kind: 'placement', value: 2, min: 0, max: 10, tolerance: 0.5 } as const;

  it('covers every feature and is 0 on the easiest config', () => {
    const values = numberLinePlace.featureValues(base, answer);
    expect(Object.keys(values).sort()).toEqual(Object.keys(numberLinePlace.features).sort());
    expect(Object.values(values).every((v) => v === 0)).toBe(true);
    for (const f of Object.values(numberLinePlace.features)) {
      expect(f.weight).toBeGreaterThan(0);
      expect(f.doc.length).toBeGreaterThan(0);
    }
  });

  it('estimation on 0–100 (37 is inside the middle 30%: 35–65)', () => {
    expect(numberLinePlace.featureValues({ ...estimate, target: 34 }, answer)).toMatchObject({
      'target.nearMiddle': 0,
    });
    expect(numberLinePlace.featureValues(estimate, answer)).toEqual({
      range: 1,
      'ticks.hidden': 1,
      'target.offLabel': 1,
      'target.nearMiddle': 1,
      'mode.read': 0,
      halfway: 0,
      negative: 0,
      decimal: 0,
    });
  });

  it('read, near the middle, halfway between printed numbers', () => {
    const v = numberLinePlace.featureValues(
      { ...read, max: 10, target: 5, labelsEvery: 10 },
      answer,
    );
    expect(v).toMatchObject({ 'mode.read': 1, 'target.nearMiddle': 1, halfway: 1 });
    expect(numberLinePlace.featureValues(read, answer)).toMatchObject({ halfway: 0 });
  });

  it('closer: halfway between the benchmarks', () => {
    expect(numberLinePlace.featureValues({ ...closer, target: 35 }, answer).halfway).toBe(1);
    expect(numberLinePlace.featureValues(closer, answer).halfway).toBe(0);
  });

  it('negative and decimal lines', () => {
    const v = numberLinePlace.featureValues(
      { ...base, min: -10, max: 10, target: -4, valueScale: 100 },
      answer,
    );
    expect(v.negative).toBe(1);
    expect(v.decimal).toBe(1);
    // A 0–100 hundredths line spans 1 whole: range 0.
    expect(v.range).toBe(0);
  });
});

describe('snapPlacement on a very short line (review, fresh run, F5)', () => {
  const tiny: Config = {
    ...base,
    min: 0,
    max: 4e-10,
    ticksEvery: 1e-10,
    labelsEvery: null,
    target: 4e-10,
    snap: 'tick',
  };

  it('snaps an exact tick to itself, however short the line', () => {
    expect(snapPlacement(tiny, 4e-10)).toBe(4e-10);
    expect(snapPlacement(tiny, 3e-10)).toBeCloseTo(3e-10, 20);
  });

  it('lets the nearer tick win by half a unit on a very long line (review round 2 F4)', () => {
    const long: Config = {
      ...base,
      min: 0,
      max: 1_000_000_000,
      ticksEvery: 1_000_000,
      labelsEvery: null,
      target: 1_000_000,
      snap: 'tick',
    };
    expect(snapPlacement(long, 500_000.25)).toBe(1_000_000);
    expect(snapPlacement(long, 499_999.75)).toBe(0);
    expect(snapPlacement(long, 500_000)).toBe(0);
  });

  it('still sends a midpoint tie to the smaller tick', () => {
    const tens: Config = {
      ...base,
      min: 0,
      max: 20,
      ticksEvery: 10,
      labelsEvery: 10,
      target: 10,
      snap: 'tick',
    };
    expect(snapPlacement(tens, 5)).toBe(0);
    expect(snapPlacement(tens, 15)).toBe(10);
  });
});
