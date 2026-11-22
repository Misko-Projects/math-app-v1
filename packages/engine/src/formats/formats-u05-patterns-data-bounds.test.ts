// The supported domain of pattern-extend, bar-graph-read and bar-graph-build (U05 #14): one test
// per bound (the largest accepted value passes, one more is refused with a message that names the
// bound), and the answer and label rules that tie an item to what its widget can show and send.

import type {
  AnswerSpec,
  ChartSpec,
  PatternToken,
  WidgetConfig,
  WidgetConfigOf,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  BUILD_BAR_MAX,
  BUILD_DATA_TALLY_MAX,
  BUILD_LINE_POSITIONS_MAX,
  BUILD_PICTURES_MAX,
  GRAPH_ANSWER_MAX,
  GRAPH_BAR_ROWS_MAX,
  GRAPH_BAR_STEPS_MAX,
  GRAPH_COLUMNS_MAX,
  GRAPH_LABEL_CHARS_MAX,
  GRAPH_LINE_POSITIONS_MAX,
  GRAPH_LINE_STACK_MAX,
  GRAPH_PICTURES_MAX,
  GRAPH_ROWS_MAX,
  GRAPH_TALLY_MAX,
  GRAPH_VERTICAL_TOP_MAX,
  graphLabelIssues,
} from './bar-graph';
import {
  BUILD_DATA_MEASUREMENTS_MAX,
  BUILD_DATA_OBJECTS_MAX,
  barGraphBuild,
  barGraphBuildAnswerIssues,
} from './bar-graph-build';
import {
  barGraphRead,
  barGraphReadAnswer,
  barGraphReadAnswerIssues,
  readAnswerMax,
} from './bar-graph-read';
import {
  coreValues,
  MAX_TILES,
  PATTERN_BLANKS_MAX,
  PATTERN_LENGTH_MAX,
  PATTERN_NUMBER_MAX,
  PATTERN_TRANSLATE_LENGTH_MAX,
  PATTERN_TYPED_LENGTH_MAX,
  PATTERN_UNITS_MAX,
  patternAnswerIssues,
  patternExtend,
} from './pattern-extend';

type Pattern = WidgetConfigOf<'pattern-extend'>;
type Read = WidgetConfigOf<'bar-graph-read'>;
type Build = WidgetConfigOf<'bar-graph-build'>;

/** The messages a model's schema gives a config (empty: it is inside the domain). */
function issues(model: { configSchema: { safeParse: (c: unknown) => unknown } }, c: WidgetConfig) {
  const r = model.configSchema.safeParse(c) as {
    success: boolean;
    error?: { issues: { path: (string | number)[]; message: string }[] };
  };
  return r.success ? [] : (r.error?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`);
}
const refuses = (list: string[], words: string) => list.some((m) => m.includes(words));

const SPRITES = ['fish', 'leaf', 'shell', 'crab', 'apple'] as const;
const unit = (k: number): PatternToken => ({ sprite: SPRITES[k % SPRITES.length] as string });
const repeat = (length: number, units: number, blanks: number): Pattern => ({
  format: 'pattern-extend',
  sequence: Array.from({ length }, (_, i) => (i >= length - blanks ? null : unit(i % units))),
  palette: Array.from({ length: units }, (_, k) => unit(k)),
  mode: 'extend',
  kind: 'repeat',
});
const numbers = (values: (number | null)[], mode: Pattern['mode'] = 'extend'): Pattern => ({
  format: 'pattern-extend',
  sequence: values.map((n) => (n === null ? null : { n })),
  palette: [],
  mode,
  kind: 'number',
});

describe('pattern-extend: the supported domain', () => {
  it('a picture pattern has at most PATTERN_LENGTH_MAX places', () => {
    expect(issues(patternExtend, repeat(PATTERN_LENGTH_MAX, 2, 2))).toEqual([]);
    expect(
      refuses(issues(patternExtend, repeat(PATTERN_LENGTH_MAX + 1, 2, 2)), 'at most 12 places'),
    ).toBe(true);
  });

  it('a pattern has at most PATTERN_BLANKS_MAX blanks', () => {
    expect(issues(patternExtend, repeat(10, 2, PATTERN_BLANKS_MAX))).toEqual([]);
    expect(
      refuses(issues(patternExtend, repeat(10, 2, PATTERN_BLANKS_MAX + 1)), 'at most 4 blanks'),
    ).toBe(true);
  });

  it('a pattern has at most PATTERN_UNITS_MAX units, shown and in the palette', () => {
    expect(issues(patternExtend, repeat(10, PATTERN_UNITS_MAX, 2))).toEqual([]);
    const five = repeat(12, PATTERN_UNITS_MAX + 1, 2);
    expect(refuses(issues(patternExtend, five), 'the palette has at most 4 units')).toBe(true);
    expect(refuses(issues(patternExtend, five), 'at most 4 different units')).toBe(true);
  });

  it('a pattern of numbers or tile stacks has at most PATTERN_TYPED_LENGTH_MAX places', () => {
    expect(PATTERN_TYPED_LENGTH_MAX).toBe(6);
    expect(issues(patternExtend, numbers([1, 2, 3, 4, null, null]))).toEqual([]);
    expect(
      refuses(issues(patternExtend, numbers([1, 2, 3, 4, 5, null, null])), 'at most 6 places'),
    ).toBe(true);
    const stacks: Pattern = {
      ...numbers([]),
      sequence: [1, 2, 3, 4, 5, 6].map((tiles) => ({ tiles })).concat([null as never]),
      kind: 'grow',
    };
    expect(refuses(issues(patternExtend, stacks), 'at most 6 places')).toBe(true);
  });

  it('numbers are whole, 0 to PATTERN_NUMBER_MAX, and have no palette', () => {
    expect(issues(patternExtend, numbers([0, PATTERN_NUMBER_MAX, 0, null]))).toEqual([]);
    // A pattern that goes on by one steady step asks only for terms the pad can type.
    expect(issues(patternExtend, numbers([997, 998, null]))).toEqual([]);
    expect(
      refuses(
        issues(patternExtend, numbers([800, 900, null, null])),
        'the missing term 1000 cannot be typed',
      ),
    ).toBe(true);
    expect(
      refuses(issues(patternExtend, numbers([20, 10, null, null])), 'the missing term -10'),
    ).toBe(true);
    // Review round 2: a repeating pattern of numbers (800, 900, 800, 900) is not an arithmetic
    // one, and its answers are numbers it already shows.
    const repeating = { ...numbers([800, 900, null, null]), kind: 'repeat' as const };
    expect(issues(patternExtend, repeating)).toEqual([]);
    expect(
      patternAnswerIssues(repeating, {
        kind: 'state',
        checker: 'pattern.tokens',
        target: { expected: [{ n: 800 }, { n: 900 }] },
      }),
    ).toEqual([]);
    for (const n of [PATTERN_NUMBER_MAX + 1, -1, 2.5]) {
      expect(refuses(issues(patternExtend, numbers([1, n, null])), 'whole, 0–999'), `${n}`).toBe(
        true,
      );
    }
    const withPalette = { ...numbers([1, 2, null]), palette: [{ n: 3 }, { n: 4 }] };
    expect(refuses(issues(patternExtend, withPalette), 'it has no palette')).toBe(true);
  });

  it('a tile stack has 1 to MAX_TILES tiles', () => {
    const stacks = (top: number): Pattern => ({
      ...numbers([]),
      sequence: [{ tiles: 1 }, { tiles: top }, null],
      kind: 'grow',
    });
    expect(MAX_TILES).toBe(20);
    expect(issues(patternExtend, stacks(MAX_TILES))).toEqual([]);
    expect(refuses(issues(patternExtend, stacks(MAX_TILES + 1)), '1–20 tiles')).toBe(true);
  });

  it('rule shows numbers that grow by one whole step of 1 or more', () => {
    expect(issues(patternExtend, numbers([100, 250, 400, 550, 700, 850], 'rule'))).toEqual([]);
    for (const seq of [
      [30, 20, 10],
      [5, 5, 5],
      [1, 2, 4],
    ]) {
      expect(
        refuses(issues(patternExtend, numbers(seq, 'rule')), 'grow by one whole step'),
        seq.join(','),
      ).toBe(true);
    }
  });

  it('translate has at most PATTERN_TRANSLATE_LENGTH_MAX places of picture units', () => {
    const translate = (length: number): Pattern => ({
      ...repeat(length, 2, 0),
      mode: 'translate',
      translateTo: [
        { sprite: 'circle', color: 'red' },
        { sprite: 'square', color: 'blue' },
      ],
    });
    expect(issues(patternExtend, translate(PATTERN_TRANSLATE_LENGTH_MAX))).toEqual([]);
    expect(
      refuses(
        issues(patternExtend, translate(PATTERN_TRANSLATE_LENGTH_MAX + 1)),
        'at most 6 places',
      ),
    ).toBe(true);
    const five = {
      ...translate(4),
      translateTo: ['circle', 'square', 'triangle', 'hexagon', 'oval'].map((sprite) => ({
        sprite,
        color: 'red',
      })),
    };
    expect(refuses(issues(patternExtend, five), 'at most 4 new units')).toBe(true);
    const typed = { ...numbers([1, 2, 1, 2]), mode: 'translate' as const, translateTo: [] };
    expect(refuses(issues(patternExtend, typed), 'a picture pattern with picture units')).toBe(
      true,
    );
  });

  it('table is refused until the widget has a layout for it', () => {
    const table: Pattern = {
      ...numbers([1, 2]),
      mode: 'table',
      kind: 'function',
      table: { inputs: [1, 2], outputs: [3, null] },
    };
    expect(refuses(issues(patternExtend, table), 'table is not supported yet')).toBe(true);
  });
});

describe('pattern-extend: the answer is one the widget can send', () => {
  const tokens = (expected: unknown[]): AnswerSpec => ({
    kind: 'state',
    checker: 'pattern.tokens',
    target: { expected },
  });

  it('extend and fill expect one palette unit per blank', () => {
    const c = repeat(6, 2, 2);
    expect(patternAnswerIssues(c, tokens([unit(0), unit(1)]))).toEqual([]);
    expect(patternAnswerIssues(c, tokens([unit(0)])).join(' ')).toContain('one token per blank');
    expect(patternAnswerIssues(c, tokens([unit(0), unit(4)])).join(' ')).toContain(
      'not a unit of the palette',
    );
    expect(patternAnswerIssues(c, { kind: 'number', value: 1 }).join(' ')).toContain(
      'pattern.tokens',
    );
  });

  it('a number blank expects a number the pad can type', () => {
    const c = numbers([997, 998, null, null]);
    expect(patternAnswerIssues(c, tokens([{ n: 999 }, { n: 0 }]))).toEqual([]);
    expect(patternAnswerIssues(c, tokens([{ n: 999 }, { n: 1000 }])).join(' ')).toContain(
      'cannot be typed',
    );
    expect(patternAnswerIssues(c, tokens([{ n: 999 }, unit(0)])).join(' ')).toContain(
      'not a n token',
    );
  });

  it('core expects the first repeat, and any whole repeat answers as it', () => {
    const c: Pattern = { ...repeat(6, 2, 0), mode: 'core' };
    const core = (values: number[]): AnswerSpec => ({
      kind: 'state',
      checker: 'select.exactSet',
      target: { values },
    });
    expect(patternAnswerIssues(c, core([0, 1]))).toEqual([]);
    expect(patternAnswerIssues(c, core([2, 3])).join(' ')).toContain('places 0 to 1');
    expect(patternAnswerIssues(c, core([0, 1, 2, 3])).join(' ')).toContain('places 0 to 1');
    expect(coreValues(c, [0, 1])).toEqual([0, 1]);
    expect(coreValues(c, [2, 3])).toEqual([0, 1]);
    expect(coreValues(c, [4, 5])).toEqual([0, 1]);
    expect(coreValues(c, [1, 2])).toEqual([1, 2]);
    expect(coreValues(c, [0, 1, 2, 3])).toEqual([0, 1, 2, 3]);
    expect(coreValues(c, [0])).toEqual([0]);
  });

  it('rule expects the step the pattern shows', () => {
    const c = numbers([15, 25, 35], 'rule');
    expect(patternAnswerIssues(c, { kind: 'number', value: 10 })).toEqual([]);
    expect(patternAnswerIssues(c, { kind: 'number', value: 5 }).join(' ')).toContain('(10)');
  });

  it('translate expects the pattern as source and translateTo as units', () => {
    const to = [
      { sprite: 'circle', color: 'red' },
      { sprite: 'square', color: 'blue' },
    ];
    const c: Pattern = { ...repeat(4, 2, 0), mode: 'translate', translateTo: to };
    const iso = (source: unknown, units: unknown): AnswerSpec => ({
      kind: 'state',
      checker: 'pattern.isomorphic',
      target: { source, units },
    });
    expect(patternAnswerIssues(c, iso(c.sequence, to))).toEqual([]);
    expect(patternAnswerIssues(c, iso(c.sequence.slice(1), to)).join(' ')).toContain('source');
    expect(patternAnswerIssues(c, iso(c.sequence, to.slice(1))).join(' ')).toContain('units');
  });
});

const NAMES = ['fish', 'crab', 'shell', 'firefly', 'apple', 'leaf'];
const cats = (values: number[]) =>
  values.map((value, i) => ({ id: NAMES[i] as string, label: `noun.${NAMES[i]}.many`, value }));
const chartOf = (
  over: Partial<ChartSpec> & Pick<ChartSpec, 'kind'>,
  values: number[],
): ChartSpec => ({
  orientation: over.kind === 'bar' ? 'vertical' : 'horizontal',
  categories: cats(values),
  scale: 1,
  axisMax: Math.max(1, ...values),
  ...over,
});
const read = (chart: ChartSpec, question?: Read['question']): Read => ({
  format: 'bar-graph-read',
  chart,
  question: question ?? { type: 'how-many', categories: [chart.categories[0]?.id ?? ''] },
});
const build = (mode: Build['mode'], chart: ChartSpec, data: Build['data']): Build => ({
  format: 'bar-graph-build',
  chart: { ...chart, categories: chart.categories.map((c) => ({ ...c, value: 0 })) },
  data,
  mode,
});
const fill = (n: number, v: number) => Array.from({ length: n }, () => v);

describe('bar-graph-read: the supported domain', () => {
  it('a picture graph, tally chart or table has at most GRAPH_ROWS_MAX rows, and reads across', () => {
    for (const kind of ['picture', 'tally', 'table'] as const) {
      expect(issues(barGraphRead, read(chartOf({ kind }, fill(GRAPH_ROWS_MAX, 3)))), kind).toEqual(
        [],
      );
      expect(
        refuses(
          issues(barGraphRead, read(chartOf({ kind }, fill(GRAPH_ROWS_MAX + 1, 3)))),
          'reads across has at most 3',
        ),
        kind,
      ).toBe(true);
      expect(
        refuses(
          issues(barGraphRead, read(chartOf({ kind, orientation: 'vertical' }, [3, 2]))),
          'only bars stand upright',
        ),
        kind,
      ).toBe(true);
    }
  });

  it('horizontal bars and a keyed picture graph have at most GRAPH_BAR_ROWS_MAX rows', () => {
    const bars = (n: number) => chartOf({ kind: 'bar', orientation: 'horizontal' }, fill(n, 3));
    const keyed = (n: number) => chartOf({ kind: 'picture', scale: 2, axisMax: 4 }, fill(n, 4));
    expect(issues(barGraphRead, read(bars(GRAPH_BAR_ROWS_MAX)))).toEqual([]);
    expect(issues(barGraphRead, read(keyed(GRAPH_BAR_ROWS_MAX)))).toEqual([]);
    expect(
      refuses(issues(barGraphRead, read(bars(GRAPH_BAR_ROWS_MAX + 1))), 'horizontal bars have'),
    ).toBe(true);
    expect(
      refuses(issues(barGraphRead, read(keyed(GRAPH_BAR_ROWS_MAX + 1))), 'with a key has at most'),
    ).toBe(true);
  });

  it('vertical bars have at most GRAPH_COLUMNS_MAX columns and a two-digit axis', () => {
    const bars = (n: number, over: Partial<ChartSpec> = {}) =>
      chartOf({ kind: 'bar', ...over }, fill(n, 5));
    expect(issues(barGraphRead, read(bars(GRAPH_COLUMNS_MAX)))).toEqual([]);
    expect(
      refuses(issues(barGraphRead, read(bars(GRAPH_COLUMNS_MAX + 1))), 'reads upward has at most'),
    ).toBe(true);
    // At most GRAPH_BAR_STEPS_MAX steps of the scale, upright or across.
    expect(GRAPH_BAR_STEPS_MAX).toBe(10);
    expect(issues(barGraphRead, read(bars(2, { scale: 5, axisMax: 50 })))).toEqual([]);
    expect(
      refuses(
        issues(barGraphRead, read(bars(2, { scale: 5, axisMax: 55 }))),
        'at most 10 steps of its scale',
      ),
    ).toBe(true);
    const across = (axisMax: number) =>
      chartOf({ kind: 'bar', orientation: 'horizontal', scale: 10, axisMax }, [50, 30]);
    expect(issues(barGraphRead, read(across(100)))).toEqual([]);
    expect(refuses(issues(barGraphRead, read(across(110))), 'at most 10 steps of its scale')).toBe(
      true,
    );
    // Upright, the top as drawn keeps two digits: tens stop at 50 (60 would be drawn to 100).
    expect(GRAPH_VERTICAL_TOP_MAX).toBe(99);
    expect(issues(barGraphRead, read(bars(2, { scale: 10, axisMax: 50 })))).toEqual([]);
    expect(
      refuses(
        issues(barGraphRead, read(bars(2, { scale: 10, axisMax: 60 }))),
        'vertical bars count to at most 99',
      ),
    ).toBe(true);
  });

  it('a picture row has at most GRAPH_PICTURES_MAX pictures', () => {
    expect(
      issues(barGraphRead, read(chartOf({ kind: 'picture' }, [GRAPH_PICTURES_MAX, 2]))),
    ).toEqual([]);
    expect(
      refuses(
        issues(barGraphRead, read(chartOf({ kind: 'picture' }, [GRAPH_PICTURES_MAX + 1, 2]))),
        'at most 10 pictures',
      ),
    ).toBe(true);
    const keyed = chartOf({ kind: 'picture', scale: 2, axisMax: 22 }, [22, 2]);
    expect(refuses(issues(barGraphRead, read(keyed)), 'at most 10 pictures')).toBe(true);
  });

  it('a tally row or table count is at most GRAPH_TALLY_MAX', () => {
    for (const kind of ['tally', 'table'] as const) {
      expect(issues(barGraphRead, read(chartOf({ kind }, [GRAPH_TALLY_MAX, 2]))), kind).toEqual([]);
      expect(
        refuses(
          issues(barGraphRead, read(chartOf({ kind }, [GRAPH_TALLY_MAX + 1, 2]))),
          'counts to at most 20',
        ),
        kind,
      ).toBe(true);
    }
  });

  it('a line plot has at most GRAPH_LINE_POSITIONS_MAX positions and GRAPH_LINE_STACK_MAX Xs', () => {
    const plot = (max: number, axisMax: number): ChartSpec => ({
      kind: 'line-plot',
      orientation: 'horizontal',
      categories: [{ id: '0', label: 'noun.fish.many', value: 1 }],
      scale: 1,
      axisMax,
      lineScale: { min: 0, max, step: 0.25 },
    });
    expect(GRAPH_LINE_POSITIONS_MAX).toBe(13);
    expect(issues(barGraphRead, read(plot(3, GRAPH_LINE_STACK_MAX)))).toEqual([]);
    expect(refuses(issues(barGraphRead, read(plot(4, 6))), 'at most 13 positions')).toBe(true);
    expect(
      refuses(issues(barGraphRead, read(plot(3, GRAPH_LINE_STACK_MAX + 1))), 'at most 6 Xs'),
    ).toBe(true);
  });

  it('values are whole and the answer is 0 to GRAPH_ANSWER_MAX', () => {
    const half = chartOf({ kind: 'bar', axisMax: 5 }, [2.5, 4]);
    expect(refuses(issues(barGraphRead, read(half)), 'shows whole numbers')).toBe(true);
    const bars = chartOf({ kind: 'bar', orientation: 'horizontal', scale: 10 }, [100, 70]);
    const two = (extra: number): Read =>
      read(bars, { type: 'two-step', categories: ['fish', 'crab'], extra });
    expect(issues(barGraphRead, two(GRAPH_ANSWER_MAX - 170))).toEqual([]);
    expect(
      refuses(issues(barGraphRead, two(GRAPH_ANSWER_MAX - 169)), 'the answer is 0 to 999'),
    ).toBe(true);
    expect(refuses(issues(barGraphRead, two(-171)), 'the answer is 0 to 999')).toBe(true);
    expect(refuses(issues(barGraphRead, two(0.5)), 'extra is whole')).toBe(true);
    expect(readAnswerMax(two(100))).toBe(270);
  });
});

describe('bar-graph-read: the answer is the one the graph gives', () => {
  const chart = chartOf({ kind: 'bar' }, [9, 3, 5]);
  const ask = (type: Read['question']['type'], categories: string[], extra?: number) =>
    read(chart, { type, categories, ...(extra === undefined ? {} : { extra }) });

  it('derives every question type from the chart', () => {
    expect(barGraphReadAnswer(ask('how-many', ['crab']))).toEqual({ kind: 'number', value: 3 });
    expect(barGraphReadAnswer(ask('total', ['fish', 'crab', 'shell']))).toEqual({
      kind: 'number',
      value: 17,
    });
    expect(barGraphReadAnswer(ask('difference', ['fish', 'crab']))).toEqual({
      kind: 'number',
      value: 6,
    });
    expect(barGraphReadAnswer(ask('how-many-more-to', ['crab'], 10))).toEqual({
      kind: 'number',
      value: 7,
    });
    expect(barGraphReadAnswer(ask('two-step', ['fish', 'crab'], -2))).toEqual({
      kind: 'number',
      value: 10,
    });
    expect(barGraphReadAnswer(ask('most', ['fish', 'crab', 'shell']))).toEqual({
      kind: 'choice',
      id: 'fish',
    });
    expect(barGraphReadAnswer(ask('least', ['fish', 'crab', 'shell']))).toEqual({
      kind: 'choice',
      id: 'crab',
    });
    expect(barGraphReadAnswer(ask('how-many', ['pebble']))).toBeNull();
  });

  it('refuses an item whose answer is not that one', () => {
    const c = ask('difference', ['fish', 'crab']);
    expect(barGraphReadAnswerIssues(c, { kind: 'number', value: 6 })).toEqual([]);
    expect(barGraphReadAnswerIssues(c, { kind: 'number', value: 5 }).join(' ')).toContain(
      'answers 6',
    );
    expect(
      barGraphReadAnswerIssues(c, { kind: 'number', value: 6, tolerance: 1 }).join(' '),
    ).toContain('exactly');
    const most = ask('most', ['fish', 'crab', 'shell']);
    expect(barGraphReadAnswerIssues(most, { kind: 'choice', id: 'fish' })).toEqual([]);
    expect(barGraphReadAnswerIssues(most, { kind: 'choice', id: 'shell' }).join(' ')).toContain(
      'fish',
    );
  });

  it('the model enters only what the pad or the counter can, and puts a pick back', () => {
    const c = ask('how-many', ['crab']);
    const typed = (value: number) =>
      barGraphRead.apply(barGraphRead.initialState(c), { op: 'answer', args: { value } }).value;
    expect(typed(GRAPH_ANSWER_MAX)).toBe(GRAPH_ANSWER_MAX);
    expect(typed(GRAPH_ANSWER_MAX + 1)).toBeNull();
    expect(typed(-1)).toBeNull();
    expect(typed(2.5)).toBeNull();
    const most = ask('most', ['fish', 'crab', 'shell']);
    const picked = barGraphRead.apply(barGraphRead.initialState(most), {
      op: 'answer',
      args: { id: 'fish' },
    });
    expect(picked.choice).toBe('fish');
    const back = barGraphRead.apply(picked, { op: 'answer', args: {} });
    expect(back.choice).toBeNull();
    expect(barGraphRead.toResponse(back)).toBeNull();
  });
});

describe('bar-graph-build: the supported domain', () => {
  const table = (values: number[]): Build['data'] => ({ kind: 'table', values });

  it('a bar the child builds has at most BUILD_BAR_MAX blocks', () => {
    const bars = (top: number) =>
      build('bars', chartOf({ kind: 'bar', axisMax: top }, [top, 2]), table([top, 2]));
    expect(issues(barGraphBuild, bars(BUILD_BAR_MAX))).toEqual([]);
    expect(refuses(issues(barGraphBuild, bars(BUILD_BAR_MAX + 1)), 'at most 10 blocks')).toBe(true);
  });

  it('a picture row the child builds has at most BUILD_PICTURES_MAX pictures', () => {
    const pictures = (top: number) =>
      build('pictures', chartOf({ kind: 'picture', axisMax: top }, [top, 2]), table([top, 2]));
    expect(issues(barGraphBuild, pictures(BUILD_PICTURES_MAX))).toEqual([]);
    expect(
      refuses(issues(barGraphBuild, pictures(BUILD_PICTURES_MAX + 1)), 'at most 6 pictures'),
    ).toBe(true);
  });

  it('a tally chart the child builds keeps GRAPH_ROWS_MAX rows of GRAPH_TALLY_MAX marks', () => {
    const tally = (values: number[]) =>
      build('tally', chartOf({ kind: 'tally' }, values), table(values));
    expect(issues(barGraphBuild, tally([GRAPH_TALLY_MAX, 12, 5]))).toEqual([]);
    expect(refuses(issues(barGraphBuild, tally([21, 2])), 'counts to at most 20')).toBe(true);
    expect(refuses(issues(barGraphBuild, tally([4, 3, 2, 1])), 'at most 3')).toBe(true);
  });

  it('a line plot the child builds has at most BUILD_LINE_POSITIONS_MAX positions', () => {
    const xs = (max: number, values: number[], axisMax = 6): Build => ({
      format: 'bar-graph-build',
      chart: {
        kind: 'line-plot',
        orientation: 'horizontal',
        categories: [],
        scale: 1,
        axisMax,
        lineScale: { min: 1, max, step: 1 },
      },
      data: { kind: 'measurements', values },
      mode: 'xs',
    });
    expect(BUILD_LINE_POSITIONS_MAX).toBe(4);
    expect(issues(barGraphBuild, xs(4, [1, 2, 2, 4]))).toEqual([]);
    expect(refuses(issues(barGraphBuild, xs(5, [1, 2])), 'at most 4 positions')).toBe(true);
    expect(refuses(issues(barGraphBuild, xs(4, [1, 2], 7)), 'at most 6 Xs')).toBe(true);
    expect(
      issues(barGraphBuild, xs(4, fill(BUILD_DATA_MEASUREMENTS_MAX, 2).fill(1, 0, 4))),
    ).toEqual([]);
    expect(
      refuses(
        issues(barGraphBuild, xs(4, fill(BUILD_DATA_MEASUREMENTS_MAX + 1, 2).fill(1, 0, 5))),
        'at most 10 measurements',
      ),
    ).toBe(true);
  });

  it('the data board shows at most BUILD_DATA_OBJECTS_MAX objects and BUILD_DATA_TALLY_MAX marks', () => {
    const tally = chartOf({ kind: 'tally', axisMax: 12 }, [0, 0, 0]);
    const objects = (values: number[]) => build('tally', tally, { kind: 'objects', values });
    expect(issues(barGraphBuild, objects([9, 7, 4]))).toEqual([]);
    expect(BUILD_DATA_OBJECTS_MAX).toBe(20);
    expect(refuses(issues(barGraphBuild, objects([9, 8, 4])), 'at most 20 objects')).toBe(true);
    const bars = chartOf({ kind: 'bar', axisMax: 10 }, [0, 0]);
    const marks = (values: number[]) => build('bars', bars, { kind: 'tally', values });
    expect(issues(barGraphBuild, marks([BUILD_DATA_TALLY_MAX, 4]))).toEqual([]);
    const pictures = chartOf({ kind: 'picture', scale: 2, axisMax: 12 }, [0, 0]);
    expect(
      refuses(
        issues(barGraphBuild, build('pictures', pictures, { kind: 'tally', values: [12, 4] })),
        'at most 10 marks',
      ),
    ).toBe(true);
  });

  it('the answer is the chart the data asks for', () => {
    const c = build('tally', chartOf({ kind: 'tally', axisMax: 9 }, [0, 0]), table([9, 4]));
    const values = (v: number[]): AnswerSpec => ({
      kind: 'state',
      checker: 'chart.values',
      target: { values: v },
    });
    expect(barGraphBuildAnswerIssues(c, values([9, 4]))).toEqual([]);
    expect(barGraphBuildAnswerIssues(c, values([9, 5])).join(' ')).toContain('[9,4]');
    expect(barGraphBuildAnswerIssues(c, values([9])).join(' ')).toContain('[9,4]');
    expect(barGraphBuildAnswerIssues(c, { kind: 'number', value: 13 }).join(' ')).toContain(
      'chart.values',
    );
  });
});

describe('graph labels fit their cells', () => {
  const words: Record<string, string> = {
    'noun.fish.many': 'fish',
    'noun.firefly.many': 'fireflies',
    'noun.crab.many': 'hermit crabs',
    'noun.shell.many': 'periwinkles',
  };
  const text = (key: string) => words[key];

  it('a category name is one word of at most GRAPH_LABEL_CHARS_MAX letters', () => {
    expect(GRAPH_LABEL_CHARS_MAX).toBe(9);
    const ok = chartOf({ kind: 'tally' }, [1, 1]);
    ok.categories = [
      { id: 'fish', label: 'noun.fish.many', value: 1 },
      { id: 'firefly', label: 'noun.firefly.many', value: 1 },
    ];
    expect(graphLabelIssues(ok, text)).toEqual([]);
    const bad = chartOf({ kind: 'tally' }, [1, 1, 1]);
    bad.categories = [
      { id: 'crab', label: 'noun.crab.many', value: 1 },
      { id: 'shell', label: 'noun.shell.many', value: 1 },
      { id: 'apple', label: 'noun.apple.many', value: 1 },
    ];
    const found = graphLabelIssues(bad, text);
    expect(found).toHaveLength(3);
    expect(found[0]).toContain('"hermit crabs" is not one word of at most 9 letters');
    expect(found[1]).toContain('"periwinkles"');
    expect(found[2]).toContain('has no words');
    expect(barGraphRead.labelIssues?.(read(bad), text)).toEqual(found);
    expect(
      barGraphBuild.labelIssues?.(build('tally', bad, { kind: 'table', values: [1, 1, 1] }), text),
    ).toEqual(found);
  });
});

describe('review round 1 (PR #102)', () => {
  it('a line plot does not ask most or least: its positions are not choices', () => {
    const plot: ChartSpec = {
      kind: 'line-plot',
      orientation: 'horizontal',
      categories: [
        { id: '1', label: 'noun.fish.many', value: 2 },
        { id: '2', label: 'noun.fish.many', value: 4 },
      ],
      scale: 1,
      axisMax: 6,
      lineScale: { min: 0, max: 3, step: 1 },
    };
    expect(issues(barGraphRead, read(plot, { type: 'how-many', categories: ['2'] }))).toEqual([]);
    for (const type of ['most', 'least'] as const) {
      expect(
        refuses(
          issues(barGraphRead, read(plot, { type, categories: ['1', '2'] })),
          `a line plot does not ask ${type}`,
        ),
        type,
      ).toBe(true);
    }
  });

  it('most and least are asked of every category the chart shows', () => {
    const chart = chartOf({ kind: 'bar' }, [9, 3, 5]);
    const ask = (categories: string[]) => read(chart, { type: 'most', categories });
    expect(issues(barGraphRead, ask(['fish', 'crab', 'shell']))).toEqual([]);
    expect(issues(barGraphRead, ask(['shell', 'fish', 'crab']))).toEqual([]);
    expect(refuses(issues(barGraphRead, ask(['crab', 'shell'])), 'asked of every category')).toBe(
      true,
    );
  });

  it('a line plot starts at 0 or above, to read and to build', () => {
    const plot = (min: number): ChartSpec => ({
      kind: 'line-plot',
      orientation: 'horizontal',
      categories: [],
      scale: 1,
      axisMax: 4,
      lineScale: { min, max: min + 1, step: 0.5 },
    });
    const xs = (min: number): Build => ({
      format: 'bar-graph-build',
      chart: plot(min),
      data: { kind: 'measurements', values: [min + 0.5] },
      mode: 'xs',
    });
    expect(issues(barGraphBuild, xs(0))).toEqual([]);
    expect(refuses(issues(barGraphBuild, xs(-1)), 'starts at 0 or above')).toBe(true);
    const shown = (min: number) =>
      read({ ...plot(min), categories: [{ id: String(min), label: 'noun.fish.many', value: 1 }] });
    expect(issues(barGraphRead, shown(0))).toEqual([]);
    expect(refuses(issues(barGraphRead, shown(-1)), 'starts at 0 or above')).toBe(true);
  });

  it('the vertical bound is the top the axis draws, not the raw cap', () => {
    const bars = (axisMax: number) => read(chartOf({ kind: 'bar', scale: 10, axisMax }, [50, 20]));
    expect(issues(barGraphRead, bars(50))).toEqual([]);
    // 51 at scale 10 is six steps, which the axis may draw to 100.
    expect(refuses(issues(barGraphRead, bars(51)), 'vertical bars count to at most 99')).toBe(true);
    expect(refuses(issues(barGraphRead, bars(99)), 'vertical bars count to at most 99')).toBe(true);
  });

  it("a picture graph's top is a whole number of pictures", () => {
    const pictures = (axisMax: number): Build =>
      build('pictures', chartOf({ kind: 'picture', scale: 5, axisMax }, [0, 0]), {
        kind: 'table',
        values: [10, 5],
      });
    expect(issues(barGraphBuild, pictures(15))).toEqual([]);
    expect(refuses(issues(barGraphBuild, pictures(12)), 'a whole number of pictures of 5')).toBe(
      true,
    );
    const shown = chartOf({ kind: 'picture', scale: 5, axisMax: 12 }, [10, 5]);
    expect(refuses(issues(barGraphRead, read(shown)), 'a whole number of pictures of 5')).toBe(
      true,
    );
  });

  it('a picture that does not fit is not placed, so every placement can be taken back', () => {
    const c = build('pictures', chartOf({ kind: 'picture', scale: 2, axisMax: 6 }, [0, 0]), {
      kind: 'table',
      values: [5, 2],
    });
    const add = (s: ReturnType<typeof barGraphBuild.initialState>, count: number) =>
      barGraphBuild.apply(s, { op: 'add-picture', args: { id: 'fish', count } });
    let s = barGraphBuild.initialState(c);
    s = add(add(s, 1), 1);
    s = add(s, 0.5);
    expect(s.values).toEqual([5, 0]);
    // A whole picture would pass the top (6): refused, not clipped to a part of a picture.
    expect(add(s, 1)).toBe(s);
    expect(add(s, 0.5).values).toEqual([6, 0]);
    // More than the row holds is not taken away either.
    const one = add(barGraphBuild.initialState(c), 0.5);
    expect(add(one, -1)).toBe(one);
    expect(add(one, -0.5).values).toEqual([0, 0]);
    // `answer {values}` enters only counts the pictures can show.
    const typed = (values: number[]) =>
      barGraphBuild.apply(barGraphBuild.initialState(c), { op: 'answer', args: { values } }).values;
    expect(typed([5, 2])).toEqual([5, 2]);
    expect(typed([4.5, 2])).toEqual([0, 0]);
  });

  it('an erased rule answer is erased in the model', () => {
    const c = numbers([15, 25, 35], 'rule');
    const typed = (...values: (number | undefined)[]) =>
      values.reduce(
        (s, value) =>
          patternExtend.apply(s, { op: 'answer', args: value === undefined ? {} : { value } }),
        patternExtend.initialState(c),
      );
    expect(patternExtend.toResponse(typed(1, 10))).toEqual({ kind: 'number', value: 10 });
    expect(patternExtend.toResponse(typed(1, 10, 1, undefined))).toBeNull();
    expect(patternExtend.toResponse(typed(undefined))).toBeNull();
  });
});
