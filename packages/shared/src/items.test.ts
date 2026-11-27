import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type AnswerSpec,
  answerSpecSchema,
  type ChartSpec,
  type CheckResult,
  checkResultSchema,
  FORMAT_DEFAULT_REPRESENTATION,
  type GeneratedItem,
  generatedItemSchema,
  type HintStep,
  hintStepSchema,
  ITEM_FORMATS,
  type ItemFormat,
  intParamDomainSize,
  narrationKeySchema,
  type ParamSpec,
  paramSpecSchema,
  REPRESENTATION_IDS,
  type ResponseValue,
  responseValueSchema,
  type ShapeCard,
  type StimulusSpec,
  stimulusSpecSchema,
  type WidgetConfigOf,
  widgetConfigSchema,
} from './items';
import { ACTIVE_STRANDS, RESERVED_STRANDS, STRAND_IDS, strandIdSchema } from './strands';

const dots: StimulusSpec = { kind: 'dots', arrangement: 'dice', groups: [3, 2] };
const expr: StimulusSpec = {
  kind: 'expression',
  expr: {
    tokens: [
      { t: 'num', v: 8 },
      { t: 'op', v: '+' },
      { t: 'num', v: 5 },
      { t: 'rel', v: '=' },
      { t: 'blank', id: 'b0' },
    ],
  },
};
const chart: ChartSpec = {
  kind: 'bar',
  orientation: 'vertical',
  categories: [
    { id: 'fish', label: 'word.fish', value: 4 },
    { id: 'crab', label: 'word.crab', value: 2 },
  ],
  scale: 1,
  axisMax: 10,
};
const shapeCard: ShapeCard = {
  id: 'c0',
  shape: 'square',
  props: {
    sides: 4,
    corners: 4,
    rightAngles: 4,
    equalSides: true,
    parallelPairs: 2,
    curved: false,
    closed: true,
    solid: false,
  },
  rotationDeg: 45,
  scale: 1,
  color: 'blue',
};

/** One minimal valid config per format (03 §5.5). */
const SAMPLES: { [F in ItemFormat]: WidgetConfigOf<F> } = {
  'tap-count': {
    format: 'tap-count',
    set: { count: 7, sprite: 'fish', layout: 'scatter', layoutSeed: 42 },
    mode: 'how-many',
    input: 'pad',
    marks: true,
    countAloud: true,
  },
  'make-set': {
    format: 'make-set',
    target: 6,
    mode: 'make',
    source: { sprite: 'shell', supply: 12 },
    container: 'basket',
    capacity: 10,
    showRunningCount: true,
    groupsOf: 10,
  },
  'dot-flash': {
    format: 'dot-flash',
    stimulus: dots,
    flashMs: 1000,
    reflashes: 1,
    input: 'pick',
    pickOptions: [4, 5, 6],
  },
  'numeral-pick': {
    format: 'numeral-pick',
    stimulus: { kind: 'none' },
    options: [
      { id: 'a', label: '12' },
      { id: 'b', label: '13', speak: 'num.13', vars: { n: 13 } },
      { id: 'c', stimulus: dots },
    ],
    layout: 'row',
  },
  'number-pad': {
    format: 'number-pad',
    stimulus: expr,
    blanks: [{ id: 'b0', maxDigits: 2 }],
    unit: null,
  },
  compare: {
    format: 'compare',
    left: { kind: 'objects', set: { count: 3, sprite: 'fish', layout: 'line', layoutSeed: 1 } },
    right: { kind: 'objects', set: { count: 5, sprite: 'fish', layout: 'line', layoutSeed: 2 } },
    ask: 'more',
    allowMatchLines: false,
  },
  order: {
    format: 'order',
    items: [
      { id: 'a', value: 3 },
      { id: 'b', value: 9, label: '9' },
      { id: 'c', value: 5 },
    ],
    direction: 'asc',
    fixed: { 0: 'a' },
  },
  'tenframe-fill': {
    format: 'tenframe-fill',
    frames: 2,
    size: 10,
    prefilled: [{ frame: 0, color: 'a', count: 8 }],
    goal: 'make-ten',
    a: 8,
    b: 5,
    requireStandardFill: false,
    thenAsk: 'total',
    skin: 'shell',
  },
  'number-bond': {
    format: 'number-bond',
    whole: 7,
    parts: [3, null],
    mode: 'new-way',
    found: [[3, 4]],
    counters: true,
    nonZero: true,
  },
  rekenrek: {
    format: 'rekenrek',
    rows: 2,
    preset: [0, 0],
    mode: 'show',
    target: 13,
    rowRule: 'fill-top-first',
    thenAsk: null,
  },
  'number-line-place': {
    format: 'number-line-place',
    min: 0,
    max: 100,
    ticksEvery: 10,
    labelsEvery: null,
    target: 37,
    mode: 'place',
    snap: 'none',
    benchmarks: [0, 100],
    vertical: false,
    valueScale: 1,
  },
  'number-line-jump': {
    format: 'number-line-jump',
    min: 0,
    max: 20,
    ticksEvery: null,
    labelsEvery: null,
    start: 8,
    goal: 'add',
    target: 13,
    allowedJumps: [1, 2, 5, 10, -1],
    path: 'open',
    thenAsk: 'landing',
  },
  'hundred-chart': {
    format: 'hundred-chart',
    first: 1,
    rows: 10,
    hidden: [45],
    mode: 'move',
    from: 34,
    moves: ['down', 'right'],
  },
  'base-ten-build': {
    format: 'base-ten-build',
    target: 34,
    mode: 'build-exact',
    pieces: { thousands: false, hundreds: false, tens: true, ones: true },
    exact: { tens: 2 },
    wholeIs: 'unit',
  },
  'base-ten-trade': {
    format: 'base-ten-trade',
    start: { hundreds: 0, tens: 5, ones: 2 },
    operation: { op: '-', operand: { hundreds: 0, tens: 2, ones: 7 } },
    goal: 'compute',
    showAlgorithm: true,
    thenAsk: true,
  },
  'expanded-form': {
    format: 'expanded-form',
    target: 345,
    mode: 'words',
    unusualOrder: false,
    wordOptions: [
      { id: 'a', words: 'word.n345' },
      { id: 'b', words: 'word.n354' },
    ],
  },
  'array-build': {
    format: 'array-build',
    maxRows: 6,
    maxCols: 6,
    mode: 'build-dims',
    rows: 3,
    cols: 4,
    orientationMatters: false,
    sprite: 'seedling',
    gridShown: true,
  },
  'equal-groups': {
    format: 'equal-groups',
    groups: 3,
    perGroup: 4,
    unknown: 'total',
    mode: 'read',
    container: 'raft',
    sprite: 'rider',
    maxGroups: 6,
  },
  'equal-share': {
    format: 'equal-share',
    items: 13,
    recipients: 4,
    sprite: 'bun',
    recipientsKind: 'plate',
    allowLeftover: true,
    ask: 'leftover',
  },
  'fraction-cut': {
    format: 'fraction-cut',
    shape: 'grid',
    parts: 4,
    shade: 1,
    cutMode: 'free',
    acceptNonCongruent: true,
    gridSize: [4, 4],
    thenName: true,
  },
  'fraction-pick': {
    format: 'fraction-pick',
    mode: 'name',
    stimulus: { kind: 'fraction', shape: 'circle', parts: 4, shaded: 3, equalParts: true },
    nameInput: 'pads',
  },
  'fraction-line': {
    format: 'fraction-line',
    max: 2,
    denominator: 4,
    ticksShown: true,
    labels: 'wholes',
    mode: 'place',
    target: { a: 5, b: 4 },
    skin: 'line',
    decimalLabels: false,
  },
  'clock-set': {
    format: 'clock-set',
    target: { h: 3, m: 30 },
    start: { h: 12, m: 0 },
    precision: 30,
    showDigital: true,
    prompt: 'elapsed',
    elapsed: { from: { h: 2, m: 45 }, minutes: 45 },
  },
  'clock-read': {
    format: 'clock-read',
    time: { h: 7, m: 0 },
    numerals: true,
    input: 'pick',
    options: [
      { id: 'am', label: 'a.m.' },
      { id: 'pm', label: 'p.m.', speak: 'time.pm' },
    ],
    ampm: { scene: 'bakery-bread', isPm: false },
  },
  'coin-pay': {
    format: 'coin-pay',
    target: 37,
    purse: { quarter: 'unlimited', dime: 3, penny: 'unlimited' },
    requireFewest: false,
    mode: 'new-way',
    found: ['q1d1n0p2'],
    showRunningTotal: true,
  },
  'coin-count': {
    format: 'coin-count',
    coins: ['quarter', 'dime', 'penny'],
    bills: [1],
    arrangement: 'mixed',
    answerUnit: 'dollars-cents',
    compareWith: { coins: ['nickel'], bills: [] },
  },
  'make-change': {
    format: 'make-change',
    price: 65,
    paid: 100,
    purse: { quarter: 'unlimited', dime: 'unlimited', nickel: 'unlimited' },
    countUpLine: true,
  },
  'measure-length': {
    format: 'measure-length',
    object: { sprite: 'plank', length: 40 },
    tool: 'ruler',
    unit: 'in',
    altUnit: 'cm',
    startOffset: 2,
    precision: 0.25,
    mode: 'read',
    input: 'tap-tick',
  },
  'compare-length': {
    format: 'compare-length',
    objects: [
      { id: 'a', sprite: 'plank', length: 7, offset: 0 },
      { id: 'b', sprite: 'plank', length: 5, offset: 1 },
    ],
    ask: 'longer',
    aligned: false,
  },
  'area-tiles': {
    format: 'area-tiles',
    region: { w: 3, h: 2, mask: '111110' },
    mode: 'tile',
    gridShown: true,
    sideLabels: false,
    unit: 'sq-units',
    decimalGrid: false,
  },
  'perimeter-walk': {
    format: 'perimeter-walk',
    polygon: { sides: [4, 3, 4, null], grid: true, shape: 'rect' },
    mode: 'missing-side',
    perimeter: 14,
  },
  'shape-compose': {
    format: 'shape-compose',
    mode: 'fill-outline',
    pieces: [
      { id: 'p0', kind: 'triangle', count: 2 },
      { id: 'p1', kind: 'stick', count: 4 },
    ],
    outline: {
      points: [
        [0, 0],
        [2, 0],
        [1, 1],
      ],
    },
    showOutlineLines: true,
    relation: { word: 'left-of', anchor: 'tree', item: 'fish' },
    require: { sides: 4, kind: 'rhombus' },
    rotationStep: 60,
  },
  'shape-sort': {
    format: 'shape-sort',
    cards: [
      { id: 'c0', card: shapeCard },
      { id: 'c1', card: { kind: 'number', value: 7 } },
      { id: 'c2', card: { kind: 'object', sprite: 'plank', props: { length: 5, heavy: true } } },
      { id: 'c3', card: { kind: 'coin', coin: 'dime' } },
      { id: 'c4', card: { kind: 'event', event: 'breakfast', isPm: false } },
    ],
    bins: [
      { id: 'b0', label: 'word.even', rule: { prop: 'parity', op: '==', value: 'even' } },
      {
        id: 'b1',
        label: 'shape.square.many',
        rule: {
          all: [
            { prop: 'sides', op: '==', value: 4 },
            { any: [{ prop: 'kind', op: 'in', value: ['square', 'rhombus'] }] },
          ],
        },
      },
    ],
    mode: 'sort',
  },
  'pattern-extend': {
    format: 'pattern-extend',
    sequence: [{ sprite: 'shell', color: 'red' }, { sprite: 'fish' }, null],
    palette: [{ sprite: 'shell', color: 'red' }, { sprite: 'fish' }],
    mode: 'table',
    kind: 'function',
    table: { inputs: [1, 2, 3], outputs: [3, null, 9] },
    translateTo: [{ n: 1 }, { tiles: 2 }],
  },
  balance: {
    format: 'balance',
    left: { terms: [{ n: 3 }, { op: '+' }, { n: 4 }] },
    right: { terms: [{ blank: 'b0' }, { op: '+' }, { letter: 'x' }, { object: 'sack', count: 2 }] },
    mode: 'fill-blank',
    objectWeights: { sack: 3 },
    showTilt: true,
  },
  'bar-graph-read': {
    format: 'bar-graph-read',
    chart,
    question: { type: 'difference', categories: ['fish', 'crab'] },
  },
  'bar-graph-build': {
    format: 'bar-graph-build',
    chart: {
      ...chart,
      kind: 'line-plot',
      categories: [{ id: '1.5', label: 'word.fish', value: 2 }],
      lineScale: { min: 0, max: 5, step: 0.5 },
    },
    data: { kind: 'measurements', values: [1, 1.5, 3] },
    mode: 'xs',
  },
  'story-problem': {
    format: 'story-problem',
    context: 'dock-fish',
    scene: {
      kind: 'scene',
      context: 'dock-fish',
      sprites: [{ sprite: 'fish', count: 9 }],
    },
    lines: [{ key: 'tp.ADD.12.t1.line1', vars: { who: '@resident', a: 9, b: 3 } }],
    situation: 'compare/bigger-fewer',
    steps: 1,
    workspace: 'bar-model',
    blanks: [{ id: 'b0', maxDigits: 2 }],
    showText: true,
  },
  'puzzle-grid': {
    format: 'puzzle-grid',
    variant: 'cage-sum',
    rows: 2,
    cols: 2,
    cells: [
      { r: 0, c: 0, given: 1 },
      { r: 0, c: 1, blank: true, cage: 'A' },
      { r: 1, c: 0, blank: true, cage: 'A' },
      { r: 1, c: 1, given: '?' },
    ],
    constraints: [
      { kind: 'cage-sum', cage: 'A', sum: 3 },
      { kind: 'row-unique' },
      { kind: 'col-unique' },
      {
        kind: 'line-sum',
        cells: [
          [0, 0],
          [1, 1],
        ],
        sum: 3,
      },
      { kind: 'adjacent-step', step: 1 },
      { kind: 'equation', expr: { tokens: [{ t: 'frac', a: 1, b: 'blank' }] } },
      { kind: 'clue', say: 'tp.PUZ.01.t1.clue1', test: 'n % 2 == 0' },
      { kind: 'use-each', values: [1, 2, 'x'] },
    ],
    palette: [1, 2],
    uniqueSolution: true,
  },
};

/** One obviously invalid override per format: a missing field, bad enum or bad number. */
const INVALID: Record<ItemFormat, Record<string, unknown>> = {
  'tap-count': { mode: 'how-many-fish' },
  'make-set': { groupsOf: 5 },
  'dot-flash': { flashMs: -1 },
  'numeral-pick': { options: [{ label: 'no id' }] },
  'number-pad': { blanks: [{ id: 'b0', maxDigits: 0 }] },
  compare: { left: { kind: 'blob' } },
  order: { direction: 'up' },
  'tenframe-fill': { frames: 3 },
  'number-bond': { found: [[1, 2, 3]] },
  rekenrek: { preset: [1] },
  'number-line-place': { valueScale: 10 },
  'number-line-jump': { allowedJumps: 'any' },
  'hundred-chart': { moves: ['diagonal'] },
  'base-ten-build': { pieces: { tens: true } },
  'base-ten-trade': { start: { tens: 5 } },
  'expanded-form': { unusualOrder: 'no' },
  'array-build': { maxRows: 0 },
  'equal-groups': { container: 'bucket' },
  'equal-share': { recipients: 0 },
  'fraction-cut': { shape: 'star' },
  'fraction-pick': { nameInput: 'voice' },
  'fraction-line': { max: 4 },
  'clock-set': { precision: 10 },
  'clock-read': { time: { h: 7 } },
  'coin-pay': { purse: { euro: 3 } },
  'coin-count': { coins: ['half-dollar'] },
  'make-change': { purse: { dime: 'lots' } },
  'measure-length': { precision: 0.1 },
  'compare-length': { ask: 'wider' },
  'area-tiles': { region: { w: 3, h: 2, mask: '1111' } },
  'perimeter-walk': { polygon: { sides: [1, 2], grid: true, shape: 'hexagon' } },
  'shape-compose': { rotationStep: 15 },
  'shape-sort': { bins: [{ id: 'b0', label: 'word.even', rule: { prop: 'x', op: '!=' } }] },
  'pattern-extend': { sequence: [{ color: 'red' }] },
  balance: { left: { terms: [{ op: '÷' }] } },
  'bar-graph-read': { chart: { ...chart, scale: 3 } },
  'bar-graph-build': { data: { kind: 'survey', values: [] } },
  'story-problem': { situation: 'add-to/everything' },
  'puzzle-grid': { constraints: [{ kind: 'cage-sum', cage: 'A' }] },
};

describe('widgetConfigSchema', () => {
  it('is a discriminated union with one option per ItemFormat', () => {
    expect(ITEM_FORMATS).toHaveLength(39);
    expect(new Set(ITEM_FORMATS).size).toBe(39);
    expect(widgetConfigSchema.options).toHaveLength(ITEM_FORMATS.length);
    const covered = widgetConfigSchema.options.map((o) => o.shape.format.value);
    expect(new Set(covered)).toEqual(new Set(ITEM_FORMATS));
  });

  it.each(ITEM_FORMATS)('%s: a minimal valid config round-trips', (format) => {
    const sample = SAMPLES[format];
    expect(sample.format).toBe(format);
    expect(widgetConfigSchema.parse(sample)).toStrictEqual(sample);
  });

  it.each(ITEM_FORMATS)('%s: an invalid config fails', (format) => {
    const bad = { ...SAMPLES[format], ...INVALID[format] };
    expect(widgetConfigSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts the shared theme field and strips unknown keys', () => {
    const parsed = widgetConfigSchema.parse({ ...SAMPLES.compare, theme: 'dock', extra: 1 });
    expect(parsed).toStrictEqual({ ...SAMPLES.compare, theme: 'dock' });
  });

  it('rejects an unknown format', () => {
    expect(widgetConfigSchema.safeParse({ ...SAMPLES.compare, format: 'spinner' }).success).toBe(
      false,
    );
  });
});

describe('FORMAT_DEFAULT_REPRESENTATION', () => {
  it('maps every format to a known representation', () => {
    expect(Object.keys(FORMAT_DEFAULT_REPRESENTATION).sort()).toEqual([...ITEM_FORMATS].sort());
    for (const rep of Object.values(FORMAT_DEFAULT_REPRESENTATION)) {
      expect(REPRESENTATION_IDS).toContain(rep);
    }
  });
});

describe('strands', () => {
  it('splits 17 active and 14 reserved codes', () => {
    expect(ACTIVE_STRANDS).toHaveLength(17);
    expect(RESERVED_STRANDS).toHaveLength(14);
    expect(new Set(STRAND_IDS).size).toBe(31);
    expect(strandIdSchema.safeParse('SUB').success).toBe(true);
    expect(strandIdSchema.safeParse('XYZ').success).toBe(false);
  });
});

const roundTrips = <T>(schema: { parse(v: unknown): T }, samples: readonly T[]) => {
  for (const s of samples) expect(schema.parse(s)).toStrictEqual(s);
};

const ANSWERS: AnswerSpec[] = [
  { kind: 'number', value: 13 },
  { kind: 'number', value: 2.5, tolerance: 0.25 },
  { kind: 'numbers', values: [3, 4], ordered: true, fraction: { equivalentOk: true } },
  { kind: 'choice', id: 'obj-2' },
  { kind: 'placement', value: 37, min: 0, max: 100, tolerance: 5 },
  { kind: 'state', checker: 'baseten.value', target: { value: 34 } },
];
const RESPONSES: ResponseValue[] = [
  { kind: 'number', value: 13 },
  { kind: 'numbers', values: [7, 30] },
  { kind: 'choice', id: 'left' },
  { kind: 'placement', value: 36.4 },
  { kind: 'state', value: { tens: 2, ones: 14 } },
  { kind: 'skip' },
];
const STIMULI: StimulusSpec[] = [
  { kind: 'none' },
  {
    kind: 'objects',
    set: {
      count: 7,
      sprite: 'fish',
      layout: 'groups',
      groups: [3, 4],
      distractors: { sprite: 'crab', count: 2 },
      sizeVaries: true,
      layoutSeed: 3,
    },
  },
  dots,
  {
    kind: 'ten-frame',
    frames: 2,
    filled: [10, 3],
    colors: [
      ['a', 'b'],
      ['a', 'a'],
    ],
  },
  { kind: 'rekenrek', rows: [10, 3] },
  { kind: 'base-ten', thousands: 1, hundreds: 2, tens: 0, ones: 5, wholeIs: 'unit' },
  {
    kind: 'number-line',
    min: 0,
    max: 20,
    ticksEvery: 1,
    labelsEvery: 5,
    marks: [{ at: 8, label: '8', arrow: true }],
    jumps: [{ from: 8, to: 10 }],
  },
  { kind: 'bar-model', parts: [5, '?'], whole: 12, compare: { bigger: 12, smaller: '?' } },
  { kind: 'number-bond', whole: '?', parts: [3, 4] },
  { kind: 'groups', groups: 3, perGroup: 4, sprite: 'bun' },
  { kind: 'array', rows: 3, cols: 7, sprite: 'seedling', split: { atCol: 5 } },
  { kind: 'fraction', shape: 'loaf', parts: 3, shaded: 1, equalParts: false },
  {
    kind: 'gauge',
    instrument: 'beaker',
    min: 0,
    max: 10,
    ticksEvery: 1,
    labelsEvery: 2,
    value: 6,
    unit: 'L',
  },
  { kind: 'clock', h: 2, m: 50, numerals: false, digital: true },
  { kind: 'coins', coins: ['quarter', 'penny'], bills: [1, 5] },
  { kind: 'shape', shapes: [shapeCard] },
  { kind: 'chart', chart },
  expr,
  {
    kind: 'expression',
    expr: {
      tokens: [
        { t: 'paren', v: '(' },
        { t: 'var', name: 'n' },
        { t: 'op', v: '×' },
        { t: 'money', cents: 125, style: 'dollars' },
        { t: 'paren', v: ')' },
        { t: 'rel', v: '?' },
        { t: 'time', h: 3, m: 15 },
      ],
    },
  },
  { kind: 'scene', context: 'sawmill-planks', sprites: [{ sprite: 'plank', count: 4 }] },
  {
    kind: 'grid-parts',
    cols: 6,
    rows: 2,
    parts: [
      [0, 1, 6, 7],
      [2, 3, 4, 5],
      [8, 9, 10, 11],
    ],
  },
];
const PARAM_SPECS: ParamSpec[] = [
  { kind: 'int', min: 2, max: 9 },
  { kind: 'int', min: 0, max: 20, step: 2, exclude: [10] },
  { kind: 'choice', values: ['result', 'change', 'start'], weights: [3, 2, 1] },
  { kind: 'choice', values: [2, 5, 10] },
  { kind: 'bool', p: 0.3 },
  { kind: 'const', value: '+' },
];
const HINTS: HintStep[] = [
  { level: 1, kind: 'replay', say: 'h.replay' },
  {
    level: 3,
    kind: 'representation',
    say: 'h.addsub.make-ten.show-frame',
    vars: { a: 8, b: 5 },
    actions: [{ op: 'highlight', args: { target: 'frame-0' }, say: 'gen.addsub.facts.make-ten.2' }],
    overlay: { kind: 'ten-frame', frames: 2, filled: [8, 5] },
  },
];

describe('item contract schemas round-trip', () => {
  it('AnswerSpec (every kind)', () => roundTrips(answerSpecSchema, ANSWERS));
  it('ResponseValue (every kind)', () => roundTrips(responseValueSchema, RESPONSES));
  it('StimulusSpec (every kind)', () => {
    expect(new Set(STIMULI.map((s) => s.kind)).size).toBe(stimulusSpecSchema.options.length);
    roundTrips(stimulusSpecSchema, STIMULI);
  });
  it('ParamSpec (every kind)', () => roundTrips(paramSpecSchema, PARAM_SPECS));
  it('HintStep', () => roundTrips(hintStepSchema, HINTS));
  it('CheckResult', () => {
    const r: CheckResult = {
      correct: false,
      partialCredit: 0,
      misconceptionIds: ['MC.forgot-the-ten'],
      feedback: 'fb.mc.forgot-the-ten',
      closeness: 0.8,
    };
    roundTrips(checkResultSchema, [r]);
    expect(checkResultSchema.safeParse({ ...r, partialCredit: 1.5 }).success).toBe(false);
    expect(checkResultSchema.safeParse({ ...r, feedback: 'h.replay' }).success).toBe(false);
  });

  it('GeneratedItem', () => {
    const item: GeneratedItem = {
      templateId: 'ADD.08.t1',
      skillId: 'ADD.08',
      seed: 12345,
      format: 'tenframe-fill',
      tier: 'concrete',
      params: { a: 8, b: 5, op: '+', unknown: 'result', family: 'make-ten', result: 13 },
      prompt: {
        narration: 'tp.ADD.08.t1.prompt',
        vars: { a: 8, b: 5 },
        text: 'Fill the shell to make ten. How many is 8 + 5?',
      },
      widget: SAMPLES['tenframe-fill'],
      answer: { kind: 'state', checker: 'tenframe.makeTen', target: { total: 13 } },
      hints: HINTS,
      difficulty: -0.35,
    };
    roundTrips(generatedItemSchema, [item]);
    expect(generatedItemSchema.safeParse({ ...item, format: 'number-pad' }).success).toBe(false);
  });

  it('rejects invalid answer, response, param and hint samples', () => {
    expect(answerSpecSchema.safeParse({ kind: 'state', checker: 'nope', target: {} }).success).toBe(
      false,
    );
    expect(responseValueSchema.safeParse({ kind: 'number', value: '3' }).success).toBe(false);
    expect(paramSpecSchema.safeParse({ kind: 'int', min: 9, max: 2 }).success).toBe(false);
    expect(paramSpecSchema.safeParse({ kind: 'int', min: 0.5, max: 2 }).success).toBe(false);
    expect(
      paramSpecSchema.safeParse({ kind: 'choice', values: [1, 2], weights: [1] }).success,
    ).toBe(false);
    expect(paramSpecSchema.safeParse({ kind: 'bool', p: 1.2 }).success).toBe(false);
    // 03 §5.2: the value set after step and exclude must be non-empty
    expect(paramSpecSchema.safeParse({ kind: 'int', min: 3, max: 3, exclude: [3] }).success).toBe(
      false,
    );
    expect(
      paramSpecSchema.safeParse({ kind: 'int', min: 10, max: 30, step: 10, exclude: [10, 20, 30] })
        .success,
    ).toBe(false);
    // excluding a value the step never reaches leaves the domain intact
    expect(
      paramSpecSchema.safeParse({ kind: 'int', min: 10, max: 30, step: 10, exclude: [10, 15, 30] })
        .success,
    ).toBe(true);
    expect(intParamDomainSize({ min: 0, max: 20, exclude: [10] })).toBe(20);
    // exact arithmetic past 2^53: span 18014398509481979 holds exactly two step values
    const huge = {
      kind: 'int' as const,
      min: -9007199254740990,
      max: 9007199254740989,
      step: 9007199254740990,
      exclude: [-9007199254740990, 0],
    };
    expect(intParamDomainSize(huge)).toBe(0);
    expect(paramSpecSchema.safeParse(huge).success).toBe(false);
    // invalid fields are rejected as issues, never thrown (BigInt(0.5) and x / 0n both throw)
    for (const bad of [
      { kind: 'int', min: 0, max: 5, step: 0 },
      { kind: 'int', min: 0, max: 5, step: -2 },
      { kind: 'int', min: 0, max: 5, step: 0.5 },
      { kind: 'int', min: 0.5, max: 5 },
      { kind: 'int', min: 0, max: 5, exclude: [1.5] },
      { kind: 'int', min: 0, max: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => paramSpecSchema.safeParse(bad)).not.toThrow();
      expect(paramSpecSchema.safeParse(bad).success).toBe(false);
    }
    expect(intParamDomainSize({ min: 0, max: 5, step: 0 })).toBe(0);
    // 03 §5.2: params are integers, strings or booleans only
    expect(paramSpecSchema.safeParse({ kind: 'choice', values: [1, 2.5] }).success).toBe(false);
    expect(paramSpecSchema.safeParse({ kind: 'const', value: 0.5 }).success).toBe(false);
    expect(paramSpecSchema.safeParse({ kind: 'const', value: '+' }).success).toBe(true);
    expect(hintStepSchema.safeParse({ level: 6, kind: 'nudge', say: 'h.x' }).success).toBe(false);
  });
});

describe('NarrationKey grammar (03 §8.1)', () => {
  it.each(['tp.ADD.08.t1.prompt', 'sk.ADD.08.intro', 'fb.correct.1', 'h.addsub.make-ten.nudge'])(
    'accepts %s',
    (key) => expect(narrationKeySchema.safeParse(key).success).toBe(true),
  );
  it.each(['Tp.x', 'tp', 'tp..x', 'tp.', '', 'tp.a b', 'tp.x_y'])('rejects %j', (key) =>
    expect(narrationKeySchema.safeParse(key).success).toBe(false),
  );
});

describe('ResponseValue property', () => {
  const responseArb: fc.Arbitrary<ResponseValue> = fc.oneof(
    fc.record({
      kind: fc.constant('number' as const),
      value: fc.double({ noNaN: true, noDefaultInfinity: true }),
    }),
    fc.record({
      kind: fc.constant('numbers' as const),
      values: fc.array(fc.integer()),
    }),
    fc.record({ kind: fc.constant('choice' as const), id: fc.string() }),
    fc.record({
      kind: fc.constant('placement' as const),
      value: fc.double({ noNaN: true, noDefaultInfinity: true }),
    }),
    fc.record({
      kind: fc.constant('state' as const),
      value: fc.dictionary(
        fc.string().filter((k) => k !== '__proto__'),
        fc.jsonValue(),
      ),
    }),
    fc.constant({ kind: 'skip' as const }),
  );

  it('parse is the identity on valid responses and survives JSON', () => {
    fc.assert(
      fc.property(responseArb, (r) => {
        const json = JSON.parse(JSON.stringify(r)) as unknown;
        expect(responseValueSchema.parse(json)).toStrictEqual(json);
      }),
    );
  });
});
