// The supported numeric domain of the number-line and chart formats (PR #94, review round 3): a
// config outside it is rejected by the format model's schema, which is also what the content
// checks validate every generated item with.
import type { WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { CHART_FIRST_MAX } from './hundred-chart';
import { formatModel } from './index';
import { HOP_MAX, STONE_ROAD_MAX } from './number-line-jump';
import {
  LINE_MAX_MAGNITUDE,
  LINE_MIN_STEP,
  lineDomainIssues,
  snapPlacement,
} from './number-line-place';

const messages = (
  format: 'number-line-jump' | 'number-line-place' | 'hundred-chart',
  c: unknown,
) => {
  const model = formatModel(format);
  if (!model) throw new Error(`no model for ${format}`);
  const r = model.configSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

const stones: WidgetConfigOf<'number-line-jump'> = {
  format: 'number-line-jump',
  min: 0,
  max: 10,
  ticksEvery: 1,
  labelsEvery: 1,
  start: 4,
  goal: 'add',
  target: 6,
  allowedJumps: [1],
  path: 'stones',
  thenAsk: 'landing',
};
const place: WidgetConfigOf<'number-line-place'> = {
  format: 'number-line-place',
  min: 0,
  max: 20,
  ticksEvery: 1,
  labelsEvery: 5,
  target: 13,
  mode: 'place',
  snap: 'tick',
  vertical: false,
  valueScale: 1,
};
const chart: WidgetConfigOf<'hundred-chart'> = {
  format: 'hundred-chart',
  first: 1,
  rows: 10,
  hidden: [],
  mode: 'next',
  from: 12,
};

describe('number-line-jump: supported domain', () => {
  it('accepts shipped shapes and the bounds themselves', () => {
    expect(messages('number-line-jump', stones)).toEqual([]);
    expect(messages('number-line-jump', { ...stones, max: STONE_ROAD_MAX })).toEqual([]);
  });

  it('rejects a stone road longer than the bound, with a clear message', () => {
    const out = messages('number-line-jump', { ...stones, max: STONE_ROAD_MAX + 1 });
    expect(out).toContain(`max: a stone road is at most ${STONE_ROAD_MAX} stones long (max − min)`);
  });

  it('rejects a hop longer than the bound (the 0–1,000,000 road with one hop of 1,000,000)', () => {
    const out = messages('number-line-jump', {
      ...stones,
      max: 1_000_000,
      start: 0,
      target: 1_000_000,
      allowedJumps: [1_000_000],
    });
    expect(out).toContain(`allowedJumps: a hop on a stone road is at most ${HOP_MAX} long`);
    expect(out.some((m) => m.startsWith('max: a stone road is at most'))).toBe(true);
  });

  it('rejects a line beyond the supported magnitude on every path', () => {
    const out = messages('number-line-jump', {
      ...stones,
      path: 'line',
      min: 0,
      max: LINE_MAX_MAGNITUDE + 1,
    });
    expect(out.some((m) => m.startsWith('max: max is within ±'))).toBe(true);
  });
});

describe('number-line-place: supported domain', () => {
  it('accepts shipped shapes and the bounds themselves', () => {
    expect(messages('number-line-place', place)).toEqual([]);
    expect(
      messages('number-line-place', {
        ...place,
        min: -LINE_MAX_MAGNITUDE,
        max: LINE_MAX_MAGNITUDE,
        ticksEvery: 100_000,
        labelsEvery: null,
        target: 0,
      }),
    ).toEqual([]);
    expect(
      messages('number-line-place', {
        ...place,
        min: 0,
        max: 0.00001,
        ticksEvery: LINE_MIN_STEP,
        labelsEvery: null,
        target: 0.000003,
      }),
    ).toEqual([]);
  });

  it('rejects a line at 10^15, a line 4e-10 long and ticks finer than the rounding', () => {
    expect(
      messages('number-line-place', {
        ...place,
        min: 1e15,
        max: 1e15 + 4,
        labelsEvery: null,
        target: 1e15 + 1,
      }).filter((m) => m.includes('is within ±')),
    ).toHaveLength(2);
    expect(
      messages('number-line-place', {
        ...place,
        max: 4e-10,
        ticksEvery: 1e-10,
        labelsEvery: null,
        target: 4e-10,
      }),
    ).toEqual(
      expect.arrayContaining([
        `max: the line is at least ${LINE_MIN_STEP} long`,
        `ticksEvery: ticksEvery is at least ${LINE_MIN_STEP}`,
      ]),
    );
  });

  it('lineDomainIssues is empty inside the domain', () => {
    expect(lineDomainIssues({ min: 0, max: 1000, ticksEvery: 0.01, labelsEvery: null })).toEqual(
      [],
    );
  });
});

describe('hundred-chart: supported domain', () => {
  it('accepts charts up to 901–1000 and rejects later ones with a clear message', () => {
    expect(messages('hundred-chart', chart)).toEqual([]);
    expect(messages('hundred-chart', { ...chart, first: CHART_FIRST_MAX, from: 912 })).toEqual([]);
    expect(messages('hundred-chart', { ...chart, first: 1_000_001, from: 1_000_012 })).toContain(
      `first: first is at most ${CHART_FIRST_MAX} (charts up to 1,000 are supported)`,
    );
  });
});

describe('snapPlacement tie margin (review round 3 F3)', () => {
  // The function itself stays right far outside the validated domain.
  it('snaps a drop on a tick to that tick at 10^15 with unit ticks', () => {
    const far = { ...place, min: 1e15, max: 1e15 + 4, labelsEvery: null, target: 1e15 + 1 };
    for (let i = 0; i <= 4; i++) expect(snapPlacement(far, 1e15 + i)).toBe(1e15 + i);
  });

  it('keeps the earlier cases: a long line, a tiny line, a midpoint tie', () => {
    const long = { ...place, max: 1e9, ticksEvery: 1e6, labelsEvery: null, target: 1e6 };
    expect(snapPlacement(long, 500_000.25)).toBe(1_000_000);
    const tiny = { ...place, max: 4e-10, ticksEvery: 1e-10, labelsEvery: null, target: 4e-10 };
    expect(snapPlacement(tiny, 4e-10)).toBe(4e-10);
    expect(snapPlacement({ ...place, ticksEvery: 10, labelsEvery: 10, target: 10 }, 5)).toBe(0);
  });
});
