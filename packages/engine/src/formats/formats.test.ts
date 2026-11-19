// 03 §6.3 format state models and 03 §5.5 format configs, features and answer semantics, for the
// 11 E01 fixture formats.

import type {
  AnswerSpec,
  ItemFormat,
  StimulusSpec,
  WidgetAction,
  WidgetConfig,
  WidgetConfigOf,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { dotFlash, stimulusGroups, stimulusQuantity } from './dot-flash';
import { chartLast, hundredChart } from './hundred-chart';
import {
  formatFeatures,
  formatFeatureValues,
  formatModel,
  formatModels,
  UnsupportedOpError,
} from './index';
import { makeSet } from './make-set';
import { missingSlot, numberBond } from './number-bond';
import { fewestJumps, numberLineJump } from './number-line-jump';
import { numberPad } from './number-pad';
import { numberOptionId, numeralPick, optionNumber, responseNumber } from './numeral-pick';
import { order } from './order';
import { rekenrek } from './rekenrek';
import { tapCount } from './tap-count';
import { tenframeFill, tenframeTotal } from './tenframe-fill';
import type { FormatModel, FormatState } from './types';

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

function respond<F extends ItemFormat, S extends FormatState<F>>(
  m: FormatModel<F, S>,
  config: WidgetConfigOf<F>,
  ops: WidgetAction[],
) {
  return m.toResponse(play(m, config, ops));
}

/** Paths of the schema issues for a config ([] when it parses). */
function issuePaths(m: AnyModel, config: unknown): string[] {
  const r = m.configSchema.safeParse(config);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
}

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v)) deepFreeze(x);
    Object.freeze(v);
  }
  return v;
}

/** Ten-frame frame of `size` cells starting with `xs`, the rest empty. */
const frame = (xs: number[], size = 10): number[] => [
  ...xs,
  ...new Array<number>(size - xs.length).fill(0),
];

// ---------- easiest-case configs (every feature value is 0) ----------

const tapBase: WidgetConfigOf<'tap-count'> = {
  format: 'tap-count',
  set: { count: 4, sprite: 'shell', layout: 'line', layoutSeed: 1 },
  mode: 'how-many',
  input: 'pad',
  marks: true,
  countAloud: false,
};
const makeSetBase: WidgetConfigOf<'make-set'> = {
  format: 'make-set',
  target: 4,
  mode: 'make',
  source: { sprite: 'shell', supply: 6 },
  container: 'basket',
  capacity: 10,
  showRunningCount: true,
};
const dotFlashBase: WidgetConfigOf<'dot-flash'> = {
  format: 'dot-flash',
  stimulus: { kind: 'dots', arrangement: 'dice', groups: [3] },
  flashMs: 1500,
  reflashes: 1,
  input: 'pad',
};
const numeralPickBase: WidgetConfigOf<'numeral-pick'> = {
  format: 'numeral-pick',
  stimulus: { kind: 'objects', set: { count: 4, sprite: 'shell', layout: 'line', layoutSeed: 1 } },
  options: [
    { id: 'opt-3', label: '3' },
    { id: 'opt-4', label: '4' },
    { id: 'opt-5', label: '5' },
  ],
  layout: 'row',
};
const numberPadBase: WidgetConfigOf<'number-pad'> = {
  format: 'number-pad',
  stimulus: { kind: 'none' },
  blanks: [{ id: 'b0', maxDigits: 1 }],
};
const numberPadTwoBlanks: WidgetConfigOf<'number-pad'> = {
  format: 'number-pad',
  stimulus: { kind: 'none' },
  expression: {
    tokens: [
      { t: 'blank', id: 'b0' },
      { t: 'op', v: '+' },
      { t: 'num', v: 3 },
      { t: 'rel', v: '=' },
      { t: 'blank', id: 'b1' },
    ],
  },
  blanks: [
    { id: 'b0', maxDigits: 1 },
    { id: 'b1', maxDigits: 2 },
  ],
};
const orderBase: WidgetConfigOf<'order'> = {
  format: 'order',
  items: [
    { id: 'a', value: 3 },
    { id: 'b', value: 1 },
    { id: 'c', value: 2 },
  ],
  direction: 'asc',
};
const tenframeBase: WidgetConfigOf<'tenframe-fill'> = {
  format: 'tenframe-fill',
  frames: 1,
  size: 10,
  prefilled: [],
  goal: 'show-n',
  n: 4,
  requireStandardFill: false,
  thenAsk: null,
  skin: 'frame',
};
const bondBase: WidgetConfigOf<'number-bond'> = {
  format: 'number-bond',
  whole: null,
  parts: [2, 1],
  mode: 'missing-whole',
  counters: true,
  nonZero: false,
};
const rekenrekBase: WidgetConfigOf<'rekenrek'> = {
  format: 'rekenrek',
  rows: 2,
  preset: [0, 0],
  mode: 'show',
  target: 7,
  rowRule: 'any',
  thenAsk: null,
};
const jumpBase: WidgetConfigOf<'number-line-jump'> = {
  format: 'number-line-jump',
  min: 0,
  max: 10,
  ticksEvery: 1,
  labelsEvery: 1,
  start: 3,
  goal: 'add',
  target: 4,
  allowedJumps: [1],
  path: 'stones',
  thenAsk: null,
};
const chartBase: WidgetConfigOf<'hundred-chart'> = {
  format: 'hundred-chart',
  first: 1,
  rows: 10,
  hidden: [],
  mode: 'find',
};

interface ModelRow {
  model: AnyModel;
  config: WidgetConfig;
  answer: AnswerSpec;
  /** A few representative ops, used for the purity check. */
  ops: WidgetAction[];
}

const MODEL_ROWS: ModelRow[] = [
  {
    model: tapCount,
    config: tapBase,
    answer: { kind: 'number', value: 4 },
    ops: [
      act('tap', { index: 0 }),
      act('count-aloud'),
      act('say-total'),
      act('answer', { value: 4 }),
    ],
  },
  {
    model: makeSet,
    config: makeSetBase,
    answer: { kind: 'state', checker: 'set.count', target: { count: 4 } },
    ops: [act('drag', { count: 3 }), act('remove'), act('bundle'), act('close-container')],
  },
  {
    model: dotFlash,
    config: dotFlashBase,
    answer: { kind: 'number', value: 3 },
    ops: [
      act('flash'),
      act('show'),
      act('circle-groups', { groups: [0] }),
      act('answer', { value: 3 }),
    ],
  },
  {
    model: numeralPick,
    config: numeralPickBase,
    answer: { kind: 'choice', id: 'opt-4' },
    ops: [
      act('highlight', { id: 'opt-3' }),
      act('tap', { id: 'opt-4' }),
      act('answer', { id: 'opt-5' }),
    ],
  },
  {
    model: numberPad,
    config: numberPadBase,
    answer: { kind: 'number', value: 7 },
    ops: [act('highlight', { token: 'b0' }), act('show-stimulus'), act('type', { value: 7 })],
  },
  {
    model: order,
    config: orderBase,
    answer: { kind: 'numbers', values: [1, 2, 3], ordered: true },
    ops: [
      act('drag', { id: 'b', slot: 0 }),
      act('drag', { id: 'b', slot: 1 }),
      act('highlight', { id: 'a' }),
    ],
  },
  {
    model: tenframeFill,
    config: tenframeBase,
    answer: { kind: 'state', checker: 'tenframe.total', target: { n: 4 } },
    ops: [
      act('place', { count: 4 }),
      act('remove'),
      act('count-total'),
      act('answer', { value: 3 }),
    ],
  },
  {
    model: numberBond,
    config: bondBase,
    answer: { kind: 'number', value: 3 },
    ops: [
      act('highlight', { slot: 'whole' }),
      act('fill', { slot: 'whole', value: 3 }),
      act('answer', { value: 4 }),
    ],
  },
  {
    model: rekenrek,
    config: rekenrekBase,
    answer: { kind: 'state', checker: 'rekenrek.total', target: { n: 7, rowRule: 'any' } },
    ops: [
      act('slide', { row: 0, count: 7 }),
      act('highlight', { row: 0, upTo: 5 }),
      act('count-total'),
    ],
  },
  {
    model: numberLineJump,
    config: jumpBase,
    answer: {
      kind: 'state',
      checker: 'jumps.reach',
      target: { start: 3, target: 4, allowedJumps: [1] },
    },
    ops: [
      act('hop', { by: 1 }),
      act('label-landing'),
      act('bridge-to', { at: 6 }),
      act('highlight', { at: 4 }),
    ],
  },
  {
    model: hundredChart,
    config: chartBase,
    answer: { kind: 'number', value: 37 },
    ops: [act('tap', { n: 37 }), act('highlight-row', { n: 3 }), act('slide', { dir: 'up' })],
  },
];

describe('every format model (03 §6.3)', () => {
  const rows = MODEL_ROWS.map((r) => [r.model.format as string, r] as const);

  it.each(rows)('%s: the schema accepts the easiest valid config', (_f, r) => {
    expect(issuePaths(r.model, r.config)).toEqual([]);
  });

  it.each(rows)(
    '%s: featureValues covers every feature and is 0 on the easiest config',
    (_f, r) => {
      const values = r.model.featureValues(r.config, r.answer);
      expect(Object.keys(values).sort()).toEqual(Object.keys(r.model.features).sort());
      expect(Object.values(values).every((v) => v === 0)).toBe(true);
    },
  );

  it.each(rows)('%s: an unsupported op throws UnsupportedOpError', (f, r) => {
    const s = r.model.initialState(r.config);
    expect(() => r.model.apply(s, act('teleport'))).toThrow(UnsupportedOpError);
    try {
      r.model.apply(s, act('teleport'));
    } catch (e) {
      expect(e).toMatchObject({ format: f, op: 'teleport', name: 'UnsupportedOpError' });
    }
  });

  it.each(rows)('%s: apply is pure (the input state is never mutated)', (_f, r) => {
    let s = r.model.initialState(r.config);
    for (const a of r.ops) {
      const before = JSON.stringify(s);
      const next = r.model.apply(deepFreeze(s), a);
      expect(JSON.stringify(s)).toBe(before);
      s = next;
    }
  });
});

// ---------- tap-count ----------

describe('tap-count', () => {
  const ordinal: WidgetConfigOf<'tap-count'> = {
    ...tapBase,
    mode: 'ordinal',
    ordinal: { k: 3, from: 'left' },
  };

  it.each([
    ['nothing entered yet', tapBase, [], null],
    [
      'taps (a double tap counts once), an off-set tap is ignored, then say-total',
      tapBase,
      [
        act('tap', { index: 0 }),
        act('tap', { index: 1 }),
        act('tap', { index: 1 }),
        act('tap', { index: 9 }),
        act('say-total'),
      ],
      { kind: 'number', value: 2 },
    ],
    [
      'count-aloud touches the untouched objects up to upTo',
      tapBase,
      [act('tap', { index: 0 }), act('count-aloud', { upTo: 3 }), act('say-total')],
      { kind: 'number', value: 3 },
    ],
    [
      'the generic answer op enters a number',
      tapBase,
      [act('answer', { value: 4 })],
      { kind: 'number', value: 4 },
    ],
    ['ordinal: nothing ringed yet', ordinal, [act('tap', { index: 2 })], null],
    ['ordinal: ring', ordinal, [act('ring', { index: 2 })], { kind: 'choice', id: 'obj-2' }],
    [
      'ordinal: answer by id',
      ordinal,
      [act('answer', { id: 'obj-1' })],
      { kind: 'choice', id: 'obj-1' },
    ],
    ['ordinal: an off-set ring is ignored', ordinal, [act('ring', { index: 4 })], null],
  ] as const)('%s', (_name, config, ops, expected) => {
    expect(respond(tapCount, config, [...ops])).toEqual(expected);
  });

  it('count-aloud records taps in reading order without duplicates', () => {
    const s = play(tapCount, tapBase, [act('tap', { index: 2 }), act('count-aloud')]);
    expect(s.taps).toEqual([2, 0, 1, 3]);
  });

  it.each([
    ['ordinal mode without ordinal', { ...tapBase, mode: 'ordinal' }, 'ordinal'],
    ['ordinal k beyond the count', { ...ordinal, ordinal: { k: 5, from: 'left' } }, 'ordinal.k'],
    ['pick with two options', { ...tapBase, input: 'pick', pickOptions: [3, 4] }, 'pickOptions'],
    [
      'pick with duplicate options',
      { ...tapBase, input: 'pick', pickOptions: [4, 4, 5] },
      'pickOptions',
    ],
    [
      'pick without the count',
      { ...tapBase, input: 'pick', pickOptions: [1, 2, 3] },
      'pickOptions',
    ],
    [
      'array layout without rows',
      { ...tapBase, set: { ...tapBase.set, layout: 'array' } },
      'set.rows',
    ],
  ])('the schema rejects %s', (_name, config, path) => {
    expect(issuePaths(tapCount, config)).toContain(path);
  });

  it('feature values on a harder config', () => {
    const hard: WidgetConfigOf<'tap-count'> = {
      ...tapBase,
      set: {
        count: 8,
        sprite: 'shell',
        layout: 'scatter',
        layoutSeed: 1,
        distractors: { sprite: 'crab', count: 2 },
      },
      mode: 'ordinal',
      ordinal: { k: 3, from: 'right' },
      marks: false,
    };
    expect(tapCount.featureValues(hard, { kind: 'choice', id: 'obj-5' })).toEqual({
      'count.over5': 0.6,
      'layout.scatter': 1,
      'layout.circle': 0,
      distractors: 1,
      'marks.off': 1,
      'ordinal.fromRight': 1,
    });
  });
});

// ---------- make-set ----------

describe('make-set', () => {
  const hands: WidgetConfigOf<'make-set'> = {
    ...makeSetBase,
    target: 7,
    container: 'hands',
    source: { sprite: 'finger', supply: 10 },
  };
  const takeAway: WidgetConfigOf<'make-set'> = {
    ...makeSetBase,
    mode: 'take-away',
    target: 3,
    start: 7,
    source: { sprite: 'shell', supply: 0 },
  };
  const bundles: WidgetConfigOf<'make-set'> = {
    ...makeSetBase,
    target: 12,
    capacity: 20,
    source: { sprite: 'stick', supply: 20 },
    groupsOf: 10,
  };
  const state = (value: Record<string, unknown>) => ({ kind: 'state', value });

  it.each([
    ['an empty container is still submittable', makeSetBase, [], state({ count: 0, removed: 0 })],
    [
      'drag adds one by default',
      makeSetBase,
      [act('drag', { count: 3 }), act('drag')],
      state({ count: 4, removed: 0 }),
    ],
    [
      'drag is limited by the supply',
      makeSetBase,
      [act('drag', { count: 20 })],
      state({ count: 6, removed: 0 }),
    ],
    [
      'removed objects wait in a pile and are dragged back first',
      makeSetBase,
      [act('drag', { count: 6 }), act('remove', { count: 2 }), act('drag', { count: 5 })],
      state({ count: 6, removed: 0 }),
    ],
    [
      'count-aloud and close-container do not change the response',
      makeSetBase,
      [act('drag', { count: 4 }), act('count-aloud'), act('close-container')],
      state({ count: 4, removed: 0 }),
    ],
    [
      'hands fill the left hand to 5, then the right',
      hands,
      [act('drag', { count: 3 }), act('drag', { count: 4 })],
      state({ count: 7, removed: 0, parts: [5, 2] }),
    ],
    [
      'drag with an explicit hand fills only that hand',
      hands,
      [act('drag', { count: 2, hand: 1 }), act('drag', { count: 4, hand: 1 })],
      state({ count: 5, removed: 0, parts: [0, 5] }),
    ],
    [
      'remove with an explicit hand',
      hands,
      [act('drag', { count: 7 }), act('remove', { count: 4, hand: 0 })],
      state({ count: 3, removed: 4, parts: [1, 2] }),
    ],
    [
      'remove without a hand empties the right hand first',
      hands,
      [act('drag', { count: 8 }), act('remove', { count: 4 })],
      state({ count: 4, removed: 4, parts: [4, 0] }),
    ],
    [
      'take-away records removed and parts [kept, removed]',
      takeAway,
      [act('remove', { count: 4 })],
      state({ count: 3, removed: 4, parts: [3, 4] }),
    ],
    [
      'take-away: removed objects can be put back (review F2), the supply stays empty',
      takeAway,
      [act('remove', { count: 4 }), act('drag', { count: 2 }), act('drag', { count: 9 })],
      state({ count: 7, removed: 0, parts: [7, 0] }),
    ],
    [
      'remove never goes below zero',
      takeAway,
      [act('remove', { count: 10 })],
      state({ count: 0, removed: 7, parts: [0, 7] }),
    ],
    [
      'groupsOf 10 reports the bundled tens',
      bundles,
      [act('drag', { count: 12 }), act('bundle')],
      state({ count: 12, removed: 0, bundles: 1 }),
    ],
    [
      'groupsOf 10 before bundling',
      bundles,
      [act('drag', { count: 12 })],
      state({ count: 12, removed: 0, bundles: 0 }),
    ],
    [
      'answer {value} drags up to the value',
      makeSetBase,
      [act('drag', { count: 1 }), act('answer', { value: 4 })],
      state({ count: 4, removed: 0 }),
    ],
    [
      'answer {value} removes down to the value (take-away)',
      takeAway,
      [act('answer', { value: 3 })],
      state({ count: 3, removed: 4, parts: [3, 4] }),
    ],
    [
      'answer {value} on hands fills the left hand first',
      hands,
      [act('answer', { value: 7 })],
      state({ count: 7, removed: 0, parts: [5, 2] }),
    ],
    [
      'answer {value} with groupsOf 10 bundles every full ten',
      bundles,
      [act('answer', { value: 12 })],
      state({ count: 12, removed: 0, bundles: 1 }),
    ],
    [
      'answer {value} is limited by the supply; a bad value changes nothing',
      makeSetBase,
      [act('answer', { value: 20 }), act('answer', { value: -1 }), act('answer')],
      state({ count: 6, removed: 0 }),
    ],
  ] as const)('%s', (_name, config, ops, expected) => {
    expect(respond(makeSet, config, [...ops])).toEqual(expected);
  });

  it('starts add-more and take-away with start objects (hands split 5 + rest)', () => {
    expect(play(makeSet, takeAway, []).count).toBe(7);
    const s = play(makeSet, { ...hands, mode: 'add-more', start: 6 }, []);
    expect(s.hands).toEqual([5, 1]);
  });

  it.each([
    ['target over capacity', { ...makeSetBase, target: 11 }, 'target'],
    ['start over capacity', { ...takeAway, start: 11 }, 'start'],
    ['add-more with start ≥ target', { ...makeSetBase, mode: 'add-more', start: 4 }, 'start'],
    ['add-more without start', { ...makeSetBase, mode: 'add-more' }, 'start'],
    ['take-away without start', { ...takeAway, start: undefined }, 'start'],
    [
      'a supply that cannot reach the target',
      { ...makeSetBase, source: { sprite: 'shell', supply: 3 } },
      'source.supply',
    ],
    ['hands holding more than 10', { ...hands, capacity: 11 }, 'capacity'],
  ])('the schema rejects %s', (_name, config, path) => {
    expect(issuePaths(makeSet, config)).toContain(path);
  });

  it('accepts the hands, take-away and bundles configs', () => {
    for (const c of [hands, takeAway, bundles]) expect(issuePaths(makeSet, c)).toEqual([]);
  });

  it('feature values on a harder config', () => {
    const hard = {
      ...takeAway,
      target: 7,
      start: 10,
      source: { sprite: 'shell', supply: 20 },
      showRunningCount: false,
    };
    expect(
      makeSet.featureValues(hard, { kind: 'state', checker: 'set.count', target: {} }),
    ).toEqual({
      'target.over5': 0.4,
      'runningCount.off': 1,
      'mode.takeAway': 1,
      'mode.addMore': 0,
      'supply.excess': 1,
    });
    expect(
      makeSet.featureValues(
        { ...makeSetBase, mode: 'add-more', start: 1 },
        { kind: 'state', checker: 'set.count', target: {} },
      ),
    ).toMatchObject({
      'mode.addMore': 1,
    });
  });
});

// ---------- dot-flash ----------

describe('dot-flash', () => {
  it.each([
    ['nothing entered yet', [act('flash'), act('show')], null],
    ['answer', [act('flash'), act('answer', { value: 3 })], { kind: 'number', value: 3 }],
    ['an answer without a value is ignored', [act('answer', { id: 'x' })], null],
  ] as const)('%s', (_name, ops, expected) => {
    expect(respond(dotFlash, dotFlashBase, [...ops])).toEqual(expected);
  });

  it('counts flashes, shows and circles groups (non-numbers dropped)', () => {
    const s = play(dotFlash, dotFlashBase, [act('flash'), act('show'), act('flash')]);
    expect(s).toMatchObject({ flashes: 2, shown: false });
    const c = dotFlash.apply(s, act('circle-groups', { groups: [0, 'x', 1] }));
    expect(c).toMatchObject({ shown: true, circledGroups: [0, 1] });
    expect(dotFlash.apply(s, act('circle-groups')).circledGroups).toBeNull();
  });

  const stimuli: [StimulusSpec, number | null, number][] = [
    [{ kind: 'dots', arrangement: 'groups', groups: [3, 0, 4] }, 7, 2],
    [
      {
        kind: 'objects',
        set: { count: 5, sprite: 'shell', layout: 'groups', groups: [2, 3], layoutSeed: 1 },
      },
      5,
      2,
    ],
    [{ kind: 'objects', set: { count: 5, sprite: 'shell', layout: 'line', layoutSeed: 1 } }, 5, 1],
    [{ kind: 'ten-frame', frames: 2, filled: [10, 3] }, 13, 2],
    [{ kind: 'rekenrek', rows: [5, 0] }, 5, 1],
    [{ kind: 'none' }, null, 1],
  ];
  it.each(stimuli)('stimulus %j shows quantity %s in %s groups', (stimulus, quantity, groups) => {
    expect(stimulusQuantity(stimulus)).toBe(quantity);
    expect(stimulusGroups(stimulus)).toBe(groups);
  });

  it.each([
    ['a stimulus without a quantity', { ...dotFlashBase, stimulus: { kind: 'none' } }, 'stimulus'],
    [
      'pick with two options',
      { ...dotFlashBase, input: 'pick', pickOptions: [3, 4] },
      'pickOptions',
    ],
    [
      'pick with duplicate options',
      { ...dotFlashBase, input: 'pick', pickOptions: [3, 3, 4] },
      'pickOptions',
    ],
    [
      'pick without the answer',
      { ...dotFlashBase, input: 'pick', pickOptions: [1, 2, 4] },
      'pickOptions',
    ],
  ])('the schema rejects %s', (_name, config, path) => {
    expect(issuePaths(dotFlash, config)).toContain(path);
  });

  it('feature values on a harder config', () => {
    const hard: WidgetConfigOf<'dot-flash'> = {
      ...dotFlashBase,
      stimulus: { kind: 'dots', arrangement: 'scatter', groups: [4, 3] },
      flashMs: 500,
    };
    expect(dotFlash.featureValues(hard, { kind: 'number', value: 7 })).toEqual({
      'n.over4': 3,
      'arrangement.unstructured': 1,
      'flash.short': 1,
      groups: 1,
    });
  });
});

// ---------- numeral-pick ----------

describe('numeral-pick', () => {
  it.each([
    ['nothing picked yet', [act('highlight', { id: 'opt-4' })], null],
    ['tap', [act('tap', { id: 'opt-3' })], { kind: 'choice', id: 'opt-3' }],
    [
      'the generic answer op',
      [act('tap', { id: 'opt-3' }), act('answer', { id: 'opt-5' })],
      { kind: 'choice', id: 'opt-5' },
    ],
    [
      'unknown ids are ignored',
      [act('tap', { id: 'opt-4' }), act('tap', { id: 'opt-9' }), act('answer', { value: 3 })],
      { kind: 'choice', id: 'opt-4' },
    ],
  ] as const)('%s', (_name, ops, expected) => {
    expect(respond(numeralPick, numeralPickBase, [...ops])).toEqual(expected);
  });

  it('highlight ignores unknown ids', () => {
    const s = play(numeralPick, numeralPickBase, [
      act('highlight', { id: 'opt-4' }),
      act('highlight', { id: 'nope' }),
    ]);
    expect(s.highlighted).toBe('opt-4');
  });

  it('reads numeric option ids back', () => {
    expect(numberOptionId(-3)).toBe('opt--3');
    expect(optionNumber('opt--3')).toBe(-3);
    expect(optionNumber('opt-12')).toBe(12);
    expect(optionNumber('left')).toBeNull();
    expect(responseNumber({ kind: 'choice', id: 'opt-7' })).toBe(7);
    expect(responseNumber({ kind: 'number', value: 4 })).toBe(4);
    expect(responseNumber({ kind: 'numbers', values: [4] })).toBeNull();
  });

  const opts = (...ids: string[]) => ids.map((id) => ({ id }));
  it.each([
    ['two options', { ...numeralPickBase, options: opts('a', 'b') }],
    ['six options', { ...numeralPickBase, options: opts('a', 'b', 'c', 'd', 'e', 'f') }],
    ['duplicate ids', { ...numeralPickBase, options: opts('a', 'b', 'a') }],
    [
      'duplicate labels',
      {
        ...numeralPickBase,
        options: [{ id: 'a', label: '3' }, { id: 'b', label: '3' }, { id: 'c' }],
      },
    ],
  ])('the schema rejects %s', (_name, config) => {
    expect(issuePaths(numeralPick, config)).toContain('options');
  });

  it('feature values on a harder config', () => {
    const hard = {
      ...numeralPickBase,
      stimulus: { kind: 'none' as const },
      options: opts('a', 'b', 'c', 'd', 'e'),
    };
    expect(numeralPick.featureValues(hard, { kind: 'choice', id: 'a' })).toEqual({
      options: 2,
      'distractors.diagnostic': 0,
      'stimulus.audioOnly': 1,
    });
  });
});

// ---------- number-pad ----------

describe('number-pad', () => {
  it.each([
    [
      'nothing typed yet',
      numberPadBase,
      [act('highlight', { token: 'b0' }), act('show-stimulus')],
      null,
    ],
    [
      'type into the only blank (blank defaults to the first)',
      numberPadBase,
      [act('type', { value: 4 })],
      { kind: 'number', value: 4 },
    ],
    [
      'the generic answer op',
      numberPadBase,
      [act('answer', { value: 9 })],
      { kind: 'number', value: 9 },
    ],
    [
      'two blanks: one typed is not submittable',
      numberPadTwoBlanks,
      [act('type', { blank: 'b1', value: 7 })],
      null,
    ],
    [
      'two blanks answer numbers in blank order',
      numberPadTwoBlanks,
      [act('type', { blank: 'b1', value: 7 }), act('type', { blank: 'b0', value: 4 })],
      { kind: 'numbers', values: [4, 7] },
    ],
    [
      'an unknown blank or a missing value is ignored',
      numberPadTwoBlanks,
      [
        act('type', { blank: 'zz', value: 1 }),
        act('type', { blank: 'b0' }),
        act('type', { blank: 'b1', value: 2 }),
      ],
      null,
    ],
    [
      'answer values fills every blank',
      numberPadTwoBlanks,
      [act('answer', { values: [1, 2] })],
      { kind: 'numbers', values: [1, 2] },
    ],
    [
      'answer value fills only the first blank',
      numberPadTwoBlanks,
      [act('answer', { value: 5 })],
      null,
    ],
  ] as const)('%s', (_name, config, ops, expected) => {
    expect(respond(numberPad, config, [...ops])).toEqual(expected);
  });

  it('records the highlight and the stimulus toggle', () => {
    const s = play(numberPad, numberPadBase, [
      act('highlight', { token: 'b0' }),
      act('show-stimulus'),
    ]);
    expect(s).toMatchObject({ highlighted: 'b0', stimulusShown: true });
  });

  it.each([
    ['no blanks', { ...numberPadBase, blanks: [] }, 'blanks'],
    [
      'duplicate blank ids',
      {
        ...numberPadBase,
        blanks: [
          { id: 'b0', maxDigits: 1 },
          { id: 'b0', maxDigits: 1 },
        ],
      },
      'blanks',
    ],
    [
      'expression blanks out of order',
      { ...numberPadTwoBlanks, blanks: [...numberPadTwoBlanks.blanks].reverse() },
      'expression',
    ],
    [
      'an expression blank missing from the list',
      { ...numberPadTwoBlanks, blanks: [{ id: 'b0', maxDigits: 1 }] },
      'expression',
    ],
  ])('the schema rejects %s', (_name, config, path) => {
    expect(issuePaths(numberPad, config)).toContain(path);
  });

  it('accepts expression blanks in reading order', () => {
    expect(issuePaths(numberPad, numberPadTwoBlanks)).toEqual([]);
  });

  it('feature values on a harder config', () => {
    expect(
      numberPad.featureValues(numberPadTwoBlanks, {
        kind: 'numbers',
        values: [12, 105],
        ordered: true,
      }),
    ).toEqual({
      'answer.digits': 2,
      blanks: 1,
    });
  });
});

// ---------- order ----------

describe('order', () => {
  const fixed: WidgetConfigOf<'order'> = { ...orderBase, fixed: { 1: 'c' } };

  it.each([
    ['nothing placed yet', orderBase, [], null],
    [
      'a partly filled row is not submittable',
      orderBase,
      [act('drag', { id: 'b', slot: 0 })],
      null,
    ],
    [
      'values in slot order once every slot is filled',
      orderBase,
      [
        act('drag', { id: 'b', slot: 0 }),
        act('drag', { id: 'c', slot: 1 }),
        act('drag', { id: 'a', slot: 2 }),
      ],
      { kind: 'numbers', values: [1, 2, 3] },
    ],
    [
      'unknown ids and off-row slots are ignored',
      orderBase,
      [
        act('drag', { id: 'zz', slot: 0 }),
        act('drag', { id: 'a', slot: 3 }),
        act('drag', { id: 'a', slot: -1 }),
      ],
      null,
    ],
    [
      'fixed: the pre-placed item counts, and its slot cannot be taken',
      fixed,
      [
        act('drag', { id: 'a', slot: 1 }),
        act('drag', { id: 'b', slot: 0 }),
        act('drag', { id: 'a', slot: 2 }),
      ],
      { kind: 'numbers', values: [1, 2, 3] },
    ],
  ] as const)('%s', (_name, config, ops, expected) => {
    expect(respond(order, config, [...ops])).toEqual(expected);
  });

  it('moving an item frees its old slot and sends the target slot item back to the tray', () => {
    const s = play(order, orderBase, [
      act('drag', { id: 'b', slot: 0 }),
      act('drag', { id: 'a', slot: 2 }),
      act('drag', { id: 'a', slot: 0 }),
    ]);
    expect(s.slots).toEqual(['a', null, null]);
  });

  it('places fixed items in the initial state', () => {
    expect(play(order, fixed, []).slots).toEqual([null, 'c', null]);
  });

  // Regression: a fixed item cannot move. Dragging it used to place it in a second slot, so the
  // response repeated its value.
  it('dragging a fixed item is a no-op', () => {
    const s = play(order, fixed, [act('drag', { id: 'c', slot: 0 })]);
    expect(s.slots).toEqual([null, 'c', null]);
  });

  it('records the highlight', () => {
    expect(play(order, orderBase, [act('highlight', { id: 'a' })]).highlighted).toBe('a');
  });

  it.each([
    ['one item', { ...orderBase, items: [{ id: 'a', value: 1 }] }, 'items'],
    [
      'duplicate ids',
      {
        ...orderBase,
        items: [
          { id: 'a', value: 1 },
          { id: 'a', value: 2 },
        ],
      },
      'items',
    ],
    ['a fixed slot off the row', { ...orderBase, fixed: { 5: 'a' } }, 'fixed.5'],
    ['a fixed id that is not an item', { ...orderBase, fixed: { 0: 'zz' } }, 'fixed.0'],
  ])('the schema rejects %s', (_name, config, path) => {
    expect(issuePaths(order, config)).toContain(path);
  });

  it('accepts a valid fixed slot', () => {
    expect(issuePaths(order, fixed)).toEqual([]);
  });

  it('feature values on a harder config', () => {
    const hard: WidgetConfigOf<'order'> = {
      format: 'order',
      items: [10, 11, 50, 70, 99].map((value, i) => ({ id: `i${i}`, value })),
      direction: 'desc',
    };
    expect(order.featureValues(hard, { kind: 'numbers', values: [], ordered: true })).toEqual({
      items: 2,
      closeness: 1,
      desc: 1,
      magnitude: 1,
    });
  });
});

// ---------- tenframe-fill ----------

describe('tenframe-fill', () => {
  const twoFrames: WidgetConfigOf<'tenframe-fill'> = { ...tenframeBase, frames: 2, n: 13 };
  const state = (cells: number[][], value?: number) => ({
    kind: 'state',
    value: value === undefined ? { cells } : { cells, value },
  });

  it.each([
    ['an empty frame is still submittable', tenframeBase, [], state([frame([])])],
    [
      'place colour a, then colour b, then remove the last counter',
      tenframeBase,
      [act('place', { count: 3 }), act('place', { count: 2, color: 'b' }), act('remove')],
      state([frame([1, 1, 1, 2])]),
    ],
    [
      'count-total enters the total; the generic answer op overrides it',
      tenframeBase,
      [act('place', { count: 4 }), act('count-total')],
      state([frame([1, 1, 1, 1])], 4),
    ],
    ['the generic answer op', tenframeBase, [act('answer', { value: 9 })], state([frame([])], 9)],
    [
      'place overflows into frame 1',
      twoFrames,
      [act('place', { count: 13 })],
      state([frame(new Array(10).fill(1)), frame([1, 1, 1])]),
    ],
    [
      'place into frame 1',
      twoFrames,
      [act('place', { frame: 1, count: 2, color: 'b' })],
      state([frame([]), frame([2, 2])]),
    ],
    [
      'move-counters moves the last counters with their colours',
      twoFrames,
      [
        act('place', { count: 3 }),
        act('place', { count: 2, color: 'b' }),
        act('move-counters', { fromFrame: 0, toFrame: 1, count: 2 }),
      ],
      state([frame([1, 1, 1]), frame([2, 2])]),
    ],
    [
      'move-counters is limited by the counters available',
      twoFrames,
      [act('place', { count: 1 }), act('move-counters', { fromFrame: 0, toFrame: 1, count: 5 })],
      state([frame([]), frame([1])]),
    ],
    [
      'place on a single frame stops at 10',
      tenframeBase,
      [act('place', { count: 12 })],
      state([frame(new Array(10).fill(1))]),
    ],
  ] as const)('%s', (_name, config, ops, expected) => {
    expect(respond(tenframeFill, config, [...ops])).toEqual(expected);
  });

  it('prefills each frame in reading order with its colour', () => {
    const s = play(
      tenframeFill,
      {
        ...tenframeBase,
        frames: 2,
        goal: 'add',
        n: undefined,
        a: 8,
        b: 5,
        prefilled: [
          { frame: 0, color: 'a', count: 8 },
          { frame: 1, color: 'b', count: 5 },
        ],
      },
      [act('move-counters', { fromFrame: 1, toFrame: 0, count: 2 })],
    );
    expect(s.cells).toEqual([frame([1, 1, 1, 1, 1, 1, 1, 1, 2, 2]), frame([2, 2, 2])]);
    expect(tenframeTotal(s.cells)).toBe(13);
  });

  it('show-addends and highlight record the highlight', () => {
    expect(play(tenframeFill, tenframeBase, [act('show-addends')]).highlighted).toBe(
      'show-addends',
    );
    expect(
      play(tenframeFill, tenframeBase, [act('highlight', { target: 'frame-0' })]).highlighted,
    ).toBe('frame-0');
  });

  // Regression: with `count: 0`, `.slice(-0)` copied every counter of the source frame into the
  // target frame while none was removed.
  it('move-counters with count 0 moves nothing', () => {
    const s = play(tenframeFill, twoFrames, [
      act('place', { count: 3 }),
      act('move-counters', { fromFrame: 0, toFrame: 1, count: 0 }),
    ]);
    expect(s.cells).toEqual([frame([1, 1, 1]), frame([])]);
  });

  it.each([
    [
      'prefilled counters overflowing a frame',
      {
        ...tenframeBase,
        prefilled: [
          { frame: 0, color: 'a', count: 6 },
          { frame: 0, color: 'b', count: 5 },
        ],
      },
      'prefilled',
    ],
    [
      'prefilled on a missing frame',
      { ...tenframeBase, prefilled: [{ frame: 1, color: 'a', count: 1 }] },
      'prefilled.0.frame',
    ],
    ['add without b', { ...tenframeBase, goal: 'add', a: 3 }, 'goal'],
    ['add that overflows the frames', { ...tenframeBase, goal: 'add', a: 7, b: 5 }, 'goal'],
    ['show-n without n', { ...tenframeBase, n: undefined }, 'n'],
    ['show-n over capacity', { ...tenframeBase, n: 11 }, 'n'],
    ['make-ten on a five-frame', { ...tenframeBase, goal: 'make-ten', size: 5 }, 'size'],
  ])('the schema rejects %s', (_name, config, path) => {
    expect(issuePaths(tenframeFill, config)).toContain(path);
  });

  it('feature values on a harder config', () => {
    const hard: WidgetConfigOf<'tenframe-fill'> = {
      ...tenframeBase,
      frames: 2,
      goal: 'add',
      n: undefined,
      a: 8,
      b: 5,
      requireStandardFill: true,
      thenAsk: 'total',
    };
    expect(issuePaths(tenframeFill, hard)).toEqual([]);
    expect(
      tenframeFill.featureValues(hard, { kind: 'state', checker: 'tenframe.total', target: {} }),
    ).toEqual({
      'n.over5': 1.6,
      twoFrames: 1,
      'goal.makeTen': 0,
      'goal.subtract': 0,
      standardFill: 1,
      thenAsk: 1,
    });
    expect(
      tenframeFill.featureValues(
        { ...tenframeBase, goal: 'make-ten' },
        { kind: 'state', checker: 'tenframe.total', target: {} },
      ),
    ).toMatchObject({
      'n.over5': 1,
      'goal.makeTen': 1,
    });
  });
});

// ---------- number-bond ----------

describe('number-bond', () => {
  const missingPart: WidgetConfigOf<'number-bond'> = {
    ...bondBase,
    mode: 'missing-part',
    whole: 5,
    parts: [2, null],
  };
  const split: WidgetConfigOf<'number-bond'> = {
    ...bondBase,
    mode: 'split',
    whole: 5,
    parts: [null, null],
  };
  const newWay: WidgetConfigOf<'number-bond'> = { ...split, mode: 'new-way', found: [[1, 4]] };

  it.each([
    ['missing-whole: nothing entered', bondBase, [], null],
    [
      'missing-whole: answer fills the whole',
      bondBase,
      [act('answer', { value: 3 })],
      { kind: 'number', value: 3 },
    ],
    [
      'missing-part: answer fills the blank part',
      missingPart,
      [act('answer', { value: 3 })],
      { kind: 'number', value: 3 },
    ],
    [
      'missing-part: fill the slot directly',
      missingPart,
      [act('fill', { slot: 'part-1', value: 4 })],
      { kind: 'number', value: 4 },
    ],
    [
      'missing-part: filling another slot does not answer',
      missingPart,
      [act('fill', { slot: 'whole', value: 6 })],
      null,
    ],
    ['split: nothing entered', split, [act('fill', { slot: 'part-0', value: 1 })], null],
    [
      'split: split-counters',
      split,
      [act('split-counters', { left: 1, right: 4 })],
      { kind: 'state', value: { parts: [1, 4] } },
    ],
    [
      'split: fill both parts; a bad slot or missing value is ignored',
      split,
      [
        act('fill', { slot: 'part-0', value: 3 }),
        act('fill', { slot: 'part-2', value: 9 }),
        act('fill', { slot: 'part-1' }),
        act('fill', { slot: 'part-1', value: 2 }),
      ],
      { kind: 'state', value: { parts: [3, 2] } },
    ],
    ['split-counters needs both sides', split, [act('split-counters', { left: 1 })], null],
    [
      'new-way answers with parts too',
      newWay,
      [act('split-counters', { left: 2, right: 3 })],
      { kind: 'state', value: { parts: [2, 3] } },
    ],
  ] as const)('%s', (_name, config, ops, expected) => {
    expect(respond(numberBond, config, [...ops])).toEqual(expected);
  });

  const slots: [WidgetConfigOf<'number-bond'>, string][] = [
    [bondBase, 'whole'],
    [missingPart, 'part-1'],
    [{ ...missingPart, parts: [null, 3] }, 'part-0'],
  ];
  it.each(slots)('missingSlot(%j) is %s', (config, slot) => {
    expect(missingSlot(config)).toBe(slot);
  });

  it.each([
    ['missing-part with two blanks', { ...missingPart, parts: [null, null] }, 'parts'],
    ['missing-part without the whole', { ...missingPart, whole: null, parts: [2, 3] }, 'parts'],
    ['three parts', { ...split, parts: [null, null, null] }, 'parts'],
    ['missing-whole showing the whole', { ...bondBase, whole: 3 }, 'whole'],
    ['split showing a part', { ...split, parts: [2, null] }, 'parts'],
    ['new-way without found', { ...newWay, found: undefined }, 'found'],
  ])('the schema rejects %s', (_name, config, path) => {
    expect(issuePaths(numberBond, config)).toContain(path);
  });

  it('accepts the missing-part, split and new-way configs', () => {
    for (const c of [missingPart, split, newWay]) expect(issuePaths(numberBond, c)).toEqual([]);
  });

  it('feature values on a harder config', () => {
    const hard: WidgetConfigOf<'number-bond'> = {
      ...split,
      mode: 'new-way',
      whole: 12,
      found: [
        [5, 7],
        [6, 6],
      ],
      counters: false,
    };
    expect(
      numberBond.featureValues(hard, { kind: 'state', checker: 'bond.newWay', target: {} }),
    ).toEqual({
      'whole.over5': 1.4,
      teen: 1,
      'mode.missingPart': 0,
      'mode.newWay': 1.4,
      'counters.off': 1,
    });
    expect(
      numberBond.featureValues(missingPart, { kind: 'number', value: 3 })['mode.missingPart'],
    ).toBe(1);
  });
});

// ---------- rekenrek ----------

describe('rekenrek', () => {
  const read: WidgetConfigOf<'rekenrek'> = {
    ...rekenrekBase,
    mode: 'read',
    target: undefined,
    preset: [5, 2],
  };
  const oneRow: WidgetConfigOf<'rekenrek'> = { ...rekenrekBase, rows: 1 };
  const rows = (r: [number, number], value?: number) => ({
    kind: 'state',
    value: value === undefined ? { rows: r } : { rows: r, value },
  });

  it.each([
    ['show: the empty rack is still submittable', rekenrekBase, [], rows([0, 0])],
    [
      'slide beads on both rows',
      rekenrekBase,
      [act('slide', { row: 0, count: 7 }), act('slide', { row: 1, count: 3 })],
      rows([7, 3]),
    ],
    [
      'slide clamps at 10',
      rekenrekBase,
      [act('slide', { row: 0, count: 7 }), act('slide', { row: 0, count: 5 })],
      rows([10, 0]),
    ],
    [
      'slide clamps at 0',
      rekenrekBase,
      [act('slide', { row: 1, count: 2 }), act('slide', { row: 1, count: -20 })],
      rows([0, 0]),
    ],
    ['slide truncates the count', rekenrekBase, [act('slide', { count: 2.9 })], rows([2, 0])],
    [
      'count-total enters the total',
      rekenrekBase,
      [act('slide', { row: 0, count: 4 }), act('slide', { row: 1, count: 3 }), act('count-total')],
      rows([4, 3], 7),
    ],
    ['the generic answer op', rekenrekBase, [act('answer', { value: 6 })], rows([0, 0], 6)],
    [
      'one row: the bottom row cannot slide',
      oneRow,
      [act('slide', { row: 1, count: 3 })],
      rows([0, 0]),
    ],
    [
      'a row that does not exist is ignored',
      rekenrekBase,
      [act('slide', { row: 2, count: 3 })],
      rows([0, 0]),
    ],
    ['read: nothing entered yet', read, [act('highlight', { row: 0, upTo: 5 })], null],
    ['read: answer', read, [act('answer', { value: 7 })], { kind: 'number', value: 7 }],
    ['read: count-total', read, [act('count-total')], { kind: 'number', value: 7 }],
  ] as const)('%s', (_name, config, ops, expected) => {
    expect(respond(rekenrek, config, [...ops])).toEqual(expected);
  });

  it('starts from the preset and records the highlight', () => {
    const s = play(rekenrek, read, [act('highlight', { row: 1, upTo: 2 })]);
    expect(s).toMatchObject({ rows: [5, 2], highlighted: { row: 1, upTo: 2 } });
  });

  it.each([
    ['a preset over 10 beads', { ...rekenrekBase, preset: [11, 0] }, 'preset'],
    ['a bottom preset on one row', { ...oneRow, preset: [3, 2] }, 'preset'],
    ['a target over two rows', { ...rekenrekBase, target: 21 }, 'target'],
    ['a target over one row', { ...oneRow, target: 11 }, 'target'],
    ['show without a target', { ...rekenrekBase, target: undefined }, 'target'],
    ['add without a and b', { ...rekenrekBase, mode: 'add' }, 'a'],
  ])('the schema rejects %s', (_name, config, path) => {
    expect(issuePaths(rekenrek, config)).toContain(path);
  });

  it('accepts read without a target', () => {
    expect(issuePaths(rekenrek, read)).toEqual([]);
  });

  it('feature values on a harder config', () => {
    const hard: WidgetConfigOf<'rekenrek'> = {
      ...rekenrekBase,
      mode: 'add',
      target: 13,
      a: 8,
      b: 5,
      preset: [3, 0],
      rowRule: 'fill-top-first',
    };
    expect(
      rekenrek.featureValues(hard, { kind: 'state', checker: 'rekenrek.total', target: {} }),
    ).toEqual({
      'n.over10': 1,
      'mode.add': 1,
      rowRule: 1,
      'preset.nonzero': 1,
    });
    // read: the shown total drives n.over10, and a preset is the stimulus, not a head start.
    expect(
      rekenrek.featureValues({ ...read, preset: [10, 2] }, { kind: 'number', value: 12 }),
    ).toMatchObject({
      'n.over10': 1,
      'preset.nonzero': 0,
    });
  });
});

// ---------- number-line-jump ----------

describe('number-line-jump', () => {
  const bridge: WidgetConfigOf<'number-line-jump'> = {
    ...jumpBase,
    max: 20,
    start: 8,
    target: 13,
    allowedJumps: [1, 2, 3, 5],
    thenAsk: 'landing',
  };
  const difference: WidgetConfigOf<'number-line-jump'> = {
    ...bridge,
    goal: 'difference',
    start: 13,
    target: 8,
    allowedJumps: [-1, -2, -3, -5],
    thenAsk: 'total-jump',
  };
  const jumps = (j: number[], value?: number) => ({
    kind: 'state',
    value: value === undefined ? { jumps: j } : { jumps: j, value },
  });

  it.each([
    ['no jumps yet', jumpBase, [act('answer', { value: 4 })], null],
    ['one hop', jumpBase, [act('hop', { by: 1 })], jumps([1])],
    [
      'a zero or off-line hop is ignored',
      jumpBase,
      [act('hop', { by: 0 }), act('hop', { by: 8 }), act('hop', { by: -4 }), act('hop', { by: 1 })],
      jumps([1]),
    ],
    [
      'the generic answer op enters the value',
      jumpBase,
      [act('hop', { by: 1 }), act('answer', { value: 4 })],
      jumps([1], 4),
    ],
    [
      'bridge-to through 10, then label-landing (landing)',
      bridge,
      [act('bridge-to', { at: 10 }), act('bridge-to', { at: 13 }), act('label-landing')],
      jumps([2, 3], 13),
    ],
    ['bridge-to the current position is ignored', bridge, [act('bridge-to', { at: 8 })], null],
    [
      'label-landing with thenAsk total-jump enters |total|',
      difference,
      [act('bridge-to', { at: 10 }), act('bridge-to', { at: 8 }), act('label-landing')],
      jumps([-3, -2], 5),
    ],
  ] as const)('%s', (_name, config, ops, expected) => {
    expect(respond(numberLineJump, config, [...ops])).toEqual(expected);
  });

  it('tracks the position and the highlight', () => {
    const s = play(numberLineJump, bridge, [act('hop', { by: 5 }), act('highlight', { at: 13 })]);
    expect(s).toMatchObject({ position: 13, highlighted: 13 });
  });

  const fewest: [WidgetConfigOf<'number-line-jump'>, number | null][] = [
    [jumpBase, 1],
    [bridge, 1],
    [{ ...bridge, allowedJumps: [1, 2] }, 3],
    [{ ...jumpBase, start: 0, target: 3, allowedJumps: [2, -1] }, 3],
    [{ ...jumpBase, start: 0, target: 3, allowedJumps: [2] }, null],
    [{ ...jumpBase, target: undefined }, null],
  ];
  it.each(fewest)('fewestJumps(%j) is %s', (config, n) => {
    expect(fewestJumps(config)).toBe(n);
  });

  it.each([
    ['min ≥ max', { ...jumpBase, min: 10, max: 10, start: 10, target: 10 }, 'max'],
    ['start off the line', { ...jumpBase, start: 11 }, 'start'],
    ['a zero jump', { ...jumpBase, allowedJumps: [1, 0] }, 'allowedJumps'],
    ['no jumps', { ...jumpBase, allowedJumps: [] }, 'allowedJumps'],
    ['no target', { ...jumpBase, target: undefined }, 'target'],
    ['a target off the line', { ...jumpBase, target: 12 }, 'target'],
    [
      'an unreachable target',
      { ...jumpBase, start: 0, target: 3, allowedJumps: [2] },
      'allowedJumps',
    ],
  ])('the schema rejects %s', (_name, config, path) => {
    expect(issuePaths(numberLineJump, config)).toContain(path);
  });

  it('accepts the bridge and difference configs', () => {
    for (const c of [bridge, difference]) expect(issuePaths(numberLineJump, c)).toEqual([]);
  });

  it('feature values on a harder config', () => {
    const hard: WidgetConfigOf<'number-line-jump'> = {
      ...jumpBase,
      max: 100,
      start: 47,
      target: 23,
      allowedJumps: [-10, -1],
      path: 'open',
      goal: 'subtract',
    };
    expect(
      numberLineJump.featureValues(hard, { kind: 'state', checker: 'jumps.reach', target: {} }),
    ).toEqual({
      'jumps.min': 5,
      crossDecade: 1,
      backward: 1,
      'path.open': 1,
      magnitude: 1,
      mixedJumps: 1,
    });
    // Landing exactly on a decade does not cross it.
    expect(
      numberLineJump.featureValues(bridge, { kind: 'state', checker: 'jumps.reach', target: {} })
        .crossDecade,
    ).toBe(1);
    expect(
      numberLineJump.featureValues(
        { ...bridge, target: 10 },
        { kind: 'state', checker: 'jumps.reach', target: {} },
      ).crossDecade,
    ).toBe(0);
  });
});

// ---------- hundred-chart ----------

describe('hundred-chart', () => {
  const fill: WidgetConfigOf<'hundred-chart'> = { ...chartBase, mode: 'fill', hidden: [15, 12] };
  const pattern: WidgetConfigOf<'hundred-chart'> = {
    ...chartBase,
    mode: 'pattern',
    patternStep: 5,
    patternStart: 5,
  };
  const values = (v: number[]) => ({ kind: 'state', value: { values: v } });

  it.each([
    ['find: nothing tapped yet', chartBase, [act('highlight-row', { n: 3 })], null],
    ['find: tap', chartBase, [act('tap', { n: 37 })], { kind: 'number', value: 37 }],
    [
      'find: off-chart taps are ignored',
      chartBase,
      [act('tap', { n: 0 }), act('tap', { n: 101 })],
      null,
    ],
    [
      'find: the generic answer op',
      chartBase,
      [act('tap', { n: 37 }), act('answer', { value: 42 })],
      { kind: 'number', value: 42 },
    ],
    ['fill: partly filled is not submittable', fill, [act('answer', { values: [15] })], null],
    [
      'fill: hidden cells in config order',
      fill,
      [act('answer', { values: [15, 12] })],
      { kind: 'numbers', values: [15, 12] },
    ],
    ['pattern: an empty selection is still submittable', pattern, [], values([])],
    [
      'pattern: tap toggles and the response is sorted',
      pattern,
      [act('tap', { n: 15 }), act('tap', { n: 5 }), act('tap', { n: 10 }), act('tap', { n: 5 })],
      values([10, 15]),
    ],
    [
      'pattern: answer values replaces the selection',
      pattern,
      [act('tap', { n: 7 }), act('answer', { values: [30, 20] })],
      values([20, 30]),
    ],
  ] as const)('%s', (_name, config, ops, expected) => {
    expect(respond(hundredChart, config, [...ops])).toEqual(expected);
  });

  it('records row, column and slide highlights', () => {
    const s = play(hundredChart, chartBase, [act('highlight-col', { n: 4 })]);
    expect(s.highlighted).toBe('highlight-col:4');
    expect(hundredChart.apply(s, act('slide', { dir: 'down' })).highlighted).toBe('slide:down');
  });

  it.each([
    [chartBase, 100],
    [{ ...chartBase, first: 0 }, 99],
    [{ ...chartBase, rows: 12 }, 120],
    [{ ...chartBase, first: 201 }, 300],
  ] as const)('chartLast(%j) is %s', (config, last) => {
    expect(chartLast(config)).toBe(last);
  });

  it.each([
    ['first = 5', { ...chartBase, first: 5 }, 'first'],
    ['first = 100', { ...chartBase, first: 100 }, 'first'],
    ['11 rows', { ...chartBase, rows: 11 }, 'rows'],
    ['a hidden cell off the chart', { ...chartBase, hidden: [0] }, 'hidden'],
    ['duplicate hidden cells', { ...chartBase, hidden: [4, 4] }, 'hidden'],
    ['next without from', { ...chartBase, mode: 'next' }, 'from'],
    ['move without moves', { ...chartBase, mode: 'move', from: 5, moves: [] }, 'moves'],
  ])('the schema rejects %s', (_name, config, path) => {
    expect(issuePaths(hundredChart, config)).toContain(path);
  });

  it.each([
    ['first 0', { ...chartBase, first: 0 }],
    ['first 101', { ...chartBase, first: 101 }],
    ['a 1–120 chart', { ...chartBase, rows: 12 }],
    ['fill', fill],
    ['pattern', pattern],
  ])('the schema accepts %s', (_name, config) => {
    expect(issuePaths(hundredChart, config)).toEqual([]);
  });

  it('feature values on a harder config', () => {
    const hard: WidgetConfigOf<'hundred-chart'> = {
      ...chartBase,
      mode: 'move',
      first: 101,
      hidden: [105, 106],
      from: 105,
      moves: ['up', 'right'],
    };
    expect(hundredChart.featureValues(hard, { kind: 'number', value: 96 })).toEqual({
      hidden: 2,
      'first.over100': 1,
      moves: 2,
      'pattern.step': 0,
      crossCentury: 1, // from 105 to 96 crosses a hundred
    });
    expect(
      hundredChart.featureValues(
        { ...pattern, patternStep: 3 },
        { kind: 'state', checker: 'select.exactSet', target: {} },
      )['pattern.step'],
    ).toBe(1);
    expect(
      hundredChart.featureValues(pattern, {
        kind: 'state',
        checker: 'select.exactSet',
        target: {},
      })['pattern.step'],
    ).toBe(0);
  });
});

// ---------- registry (formats/index.ts) ----------

describe('format registry', () => {
  const formats = MODEL_ROWS.map((r) => r.model.format as ItemFormat);
  const compare: WidgetConfig = {
    format: 'compare',
    left: { kind: 'none' },
    right: { kind: 'none' },
    ask: 'more',
    allowMatchLines: false,
  };

  it('registers the 11 fixture formats (U03–U05 add theirs; formats-u04.test.ts covers U04)', () => {
    expect(formatModels()).toEqual(expect.arrayContaining(formats));
  });

  it.each(MODEL_ROWS.map((r) => [r.model.format as string, r] as const))(
    'formatModel(%s) returns its model',
    (f, r) => {
      expect(formatModel(f as ItemFormat)).toBe(r.model);
      expect(formatFeatures(f as ItemFormat)).toBe(r.model.features);
    },
  );

  it('dispatches formatFeatureValues to the model', () => {
    const hard: WidgetConfigOf<'tap-count'> = { ...tapBase, marks: false };
    expect(formatFeatureValues(hard, { kind: 'number', value: 4 })).toEqual(
      tapCount.featureValues(hard, { kind: 'number', value: 4 }),
    );
  });

  it('has nothing for formats without a model yet', () => {
    expect(formatModel('compare')).toBeUndefined();
    expect(formatFeatures('compare')).toEqual({});
    expect(formatFeatureValues(compare, { kind: 'choice', id: 'left' })).toEqual({});
  });

  it('every feature has a non-zero weight and a doc', () => {
    for (const f of formatModels()) {
      for (const [name, feat] of Object.entries(formatFeatures(f))) {
        // 03 §5.5 gives a few format features a negative prior (mode.read, mode.build, predealt).
        expect(feat.weight, `${f}.${name}`).not.toBe(0);
        expect(feat.doc.length, `${f}.${name}`).toBeGreaterThan(0);
      }
    }
  });
});
