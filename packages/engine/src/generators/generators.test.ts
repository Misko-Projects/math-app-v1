// 03 §5.6 reference generators (count.set, count.sequence, subitize.flash, bond.parts,
// addsub.facts): fixed params → answer and widget per format, exampleCorrect and solution replay
// are checked correct, feature extremes, validity (accepts), family enforcement and the registry.

import type {
  AnswerSpec,
  GeneratorId,
  ItemFormat,
  ItemTemplate,
  ParamSpec,
  ParamValues,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../content/binding';
import { formatModel } from '../formats';
import { generatorRegistered } from '../hooks';
import { checkResponse } from '../items/check';
import { generateItem, generateItemFromParams, itemFeatures, mergedSpec } from '../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../items/solution';
import { GenerationError, registry } from '.';
import { inDomain } from './common';

const int = (min: number, max: number): ParamSpec => ({ kind: 'int', min, max });
const c = (value: string | number | boolean): ParamSpec => ({ kind: 'const', value });

let nextId = 0;
function tpl(
  generator: GeneratorId,
  format: ItemFormat,
  over: Partial<ItemTemplate> = {},
): ItemTemplate {
  nextId += 1;
  return {
    id: `T.${generator}.${format}.${nextId}`,
    skillId: 'X.01',
    format,
    tier: 'pictorial',
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

// ---------- fixed params → answer and widget, per generator and format ----------

interface Case {
  name: string;
  t: ItemTemplate;
  params: ParamValues;
  answer: AnswerSpec;
  widget?: Record<string, unknown>;
}

const COUNT_SET: Case[] = [
  {
    name: 'tap-count 34 in groups of ten (CNT.19)',
    t: tpl('count.set', 'tap-count', { tier: 'concrete' }),
    params: { n: 34, layout: 'groups', groupsOf: 10 },
    answer: { kind: 'number', value: 34 },
    widget: { set: { count: 34, layout: 'groups', groups: [10, 10, 10, 4] } },
  },
  {
    name: 'make-set a big collection: 37 in a container for 40, every ten bundled',
    t: tpl('count.set', 'make-set', { tier: 'concrete' }),
    params: { n: 37, mode: 'make', groupsOf: 10 },
    answer: { kind: 'state', checker: 'set.count', target: { count: 37, groupsOf: 10 } },
    widget: { target: 37, capacity: 40, groupsOf: 10 },
  },
  {
    name: 'tap-count concrete n=5',
    t: tpl('count.set', 'tap-count', { tier: 'concrete' }),
    params: { n: 5 },
    answer: { kind: 'number', value: 5 },
    widget: {
      set: { count: 5, layout: 'line' },
      mode: 'how-many',
      input: 'auto',
      marks: true,
      countAloud: true,
    },
  },
  {
    name: 'tap-count pictorial n=8 (pad input)',
    t: tpl('count.set', 'tap-count'),
    params: { n: 8, layout: 'array' },
    answer: { kind: 'number', value: 8 },
    widget: { set: { count: 8, layout: 'array', rows: 2 }, input: 'pad', marks: false },
  },
  {
    name: 'tap-count mode zero (the template sets n: 0)',
    t: tpl('count.set', 'tap-count', { tier: 'concrete', params: { mode: c('zero'), n: c(0) } }),
    params: {},
    answer: { kind: 'number', value: 0 },
    widget: { set: { count: 0 } },
  },
  {
    name: 'make-set make n=7',
    t: tpl('count.set', 'make-set', { tier: 'concrete' }),
    params: { n: 7, mode: 'make' },
    answer: { kind: 'state', checker: 'set.count', target: { count: 7 } },
    widget: { target: 7, mode: 'make', container: 'boat', capacity: 10, source: { supply: 10 } },
  },
  {
    name: 'make-set add-more 3 → 7',
    t: tpl('count.set', 'make-set', { tier: 'concrete' }),
    params: { n: 7, start: 3, mode: 'add-more' },
    answer: { kind: 'state', checker: 'set.count', target: { count: 7 } },
    widget: { target: 7, mode: 'add-more', start: 3, source: { supply: 7 } },
  },
  {
    name: 'make-set take-away 9 → 4',
    t: tpl('count.set', 'make-set', { tier: 'concrete' }),
    params: { n: 4, start: 9, mode: 'take-away' },
    answer: { kind: 'state', checker: 'set.count', target: { count: 4 } },
    widget: { target: 4, mode: 'take-away', start: 9 },
  },
  {
    name: 'make-set fingers n=7',
    t: tpl('count.set', 'make-set', { tier: 'concrete', representation: 'fingers' }),
    params: { n: 7, mode: 'make' },
    answer: { kind: 'state', checker: 'set.count', target: { count: 7 } },
    widget: { container: 'hands', capacity: 10 },
  },
  {
    name: 'make-set groups of ten n=14',
    t: tpl('count.set', 'make-set', { tier: 'concrete' }),
    params: { n: 14, mode: 'make', groupsOf: 10 },
    answer: { kind: 'state', checker: 'set.count', target: { count: 14, groupsOf: 10 } },
    widget: { capacity: 20, groupsOf: 10 },
  },
  {
    name: 'dot-flash n=6',
    t: tpl('count.set', 'dot-flash'),
    params: { n: 6 },
    answer: { kind: 'number', value: 6 },
    widget: {
      flashMs: 1500,
      reflashes: 1,
      input: 'pad',
      stimulus: { kind: 'objects', set: { count: 6 } },
    },
  },
  {
    name: 'numeral-pick n=6',
    t: tpl('count.set', 'numeral-pick'),
    params: { n: 6 },
    answer: { kind: 'choice', id: 'opt-6' },
    widget: { layout: 'row' },
  },
  {
    name: 'number-pad n=12',
    t: tpl('count.set', 'number-pad', { tier: 'abstract' }),
    params: { n: 12 },
    answer: { kind: 'number', value: 12 },
    widget: { blanks: [{ id: 'n', maxDigits: 2 }], unit: null },
  },
  {
    name: 'tenframe-fill n=13 (two frames)',
    t: tpl('count.set', 'tenframe-fill'),
    params: { n: 13 },
    answer: { kind: 'state', checker: 'tenframe.total', target: { n: 13 } },
    widget: { frames: 2, goal: 'show-n', n: 13, requireStandardFill: false, thenAsk: null },
  },
];

const COUNT_SEQUENCE: Case[] = [
  {
    name: 'number-pad tens then ones from 34 (CNT.20), the start drawn as base-ten pieces',
    t: tpl('count.sequence', 'number-pad', { representation: 'base-ten' }),
    params: { start: 34, length: 4, tens: 2, hide: 'all-after' },
    answer: { kind: 'numbers', values: [44, 54, 55, 56], ordered: true },
    widget: {
      stimulus: { kind: 'base-ten', hundreds: 0, tens: 3, ones: 4 },
      expression: {
        tokens: [
          { t: 'num', v: 34 },
          { t: 'blank', id: 't1' },
          { t: 'blank', id: 't2' },
          { t: 'blank', id: 't3' },
          { t: 'blank', id: 't4' },
        ],
      },
    },
  },
  {
    name: 'number-pad back by tens then ones from 62, only the last hidden',
    t: tpl('count.sequence', 'number-pad', { tier: 'abstract' }),
    params: { start: 62, dir: -1, length: 3, tens: 2, hide: 'last' },
    answer: { kind: 'number', value: 41 },
  },
  {
    name: 'numeral-pick what comes after 7',
    t: tpl('count.sequence', 'numeral-pick', { representation: 'number-path' }),
    params: { start: 7 },
    answer: { kind: 'choice', id: 'opt-8' },
    // Only the start is labelled; the asked term is '?' (never its numeral).
    widget: {
      stimulus: {
        kind: 'number-line',
        labelsEvery: null,
        marks: [
          { at: 7, label: '7', arrow: true },
          { at: 8, label: '?' },
        ],
      },
    },
  },
  {
    name: 'numeral-pick length 3 asks for the last term',
    t: tpl('count.sequence', 'numeral-pick'),
    params: { start: 4, step: 2, length: 3 },
    answer: { kind: 'choice', id: 'opt-10' },
    widget: { stimulus: { kind: 'none' } },
  },
  {
    name: 'number-pad length 1',
    t: tpl('count.sequence', 'number-pad'),
    params: { start: 7 },
    answer: { kind: 'number', value: 8 },
    widget: {
      expression: {
        tokens: [
          { t: 'num', v: 7 },
          { t: 'blank', id: 't1' },
        ],
      },
    },
  },
  {
    name: 'number-pad length 3, every term after start hidden',
    t: tpl('count.sequence', 'number-pad'),
    params: { start: 7, length: 3 },
    answer: { kind: 'numbers', values: [8, 9, 10], ordered: true },
    widget: {
      blanks: [
        { id: 't1', maxDigits: 3 },
        { id: 't2', maxDigits: 3 },
        { id: 't3', maxDigits: 3 },
      ],
    },
  },
  {
    name: 'number-pad length 3, only the last term hidden',
    t: tpl('count.sequence', 'number-pad'),
    params: { start: 7, length: 3, hide: 'last' },
    answer: { kind: 'number', value: 10 },
    widget: {
      expression: {
        tokens: [
          { t: 'num', v: 7 },
          { t: 'num', v: 8 },
          { t: 'num', v: 9 },
          { t: 'blank', id: 't3' },
        ],
      },
    },
  },
  {
    name: 'hundred-chart next after 19',
    t: tpl('count.sequence', 'hundred-chart'),
    params: { start: 19 },
    answer: { kind: 'number', value: 20 },
    widget: { first: 1, rows: 10, mode: 'next', from: 19, hidden: [] },
  },
  {
    name: 'hundred-chart fill three after 5',
    t: tpl('count.sequence', 'hundred-chart'),
    params: { start: 5, length: 3 },
    answer: { kind: 'numbers', values: [6, 7, 8], ordered: true },
    widget: { mode: 'fill', hidden: [6, 7, 8] },
  },
  {
    name: 'order ascending 3..6',
    t: tpl('count.sequence', 'order', { tier: 'abstract' }),
    params: { start: 3, length: 3 },
    answer: { kind: 'numbers', values: [3, 4, 5, 6], ordered: true },
    widget: { direction: 'asc' },
  },
  {
    name: 'order descending 10..7',
    t: tpl('count.sequence', 'order', { tier: 'abstract' }),
    params: { start: 10, length: 3, dir: -1 },
    answer: { kind: 'numbers', values: [10, 9, 8, 7], ordered: true },
    widget: { direction: 'desc' },
  },
  {
    name: 'number-line-jump next after 7 (stones)',
    t: tpl('count.sequence', 'number-line-jump', { tier: 'concrete' }),
    params: { start: 7 },
    answer: {
      kind: 'state',
      checker: 'jumps.reach',
      target: { start: 7, target: 8, allowedJumps: [1], value: 8 },
    },
    widget: {
      start: 7,
      target: 8,
      goal: 'next',
      thenAsk: 'landing',
      path: 'stones',
      allowedJumps: [1],
    },
  },
  {
    name: 'number-line-jump by 2 from 4 to 10',
    t: tpl('count.sequence', 'number-line-jump'),
    params: { start: 4, step: 2, length: 3 },
    answer: {
      kind: 'state',
      checker: 'jumps.reach',
      target: { start: 4, target: 10, allowedJumps: [2] },
    },
    widget: { goal: 'land-on', thenAsk: null, path: 'line', ticksEvery: 2, min: 0, max: 16 },
  },
  {
    name: 'number-line-jump backwards 10 → 8',
    t: tpl('count.sequence', 'number-line-jump'),
    params: { start: 10, dir: -1, length: 2 },
    answer: {
      kind: 'state',
      checker: 'jumps.reach',
      target: { start: 10, target: 8, allowedJumps: [-1] },
    },
    widget: { min: 6, max: 13, allowedJumps: [-1] },
  },
];

const SUBITIZE: Case[] = [
  {
    name: 'dot-flash dice n=4',
    t: tpl('subitize.flash', 'dot-flash'),
    params: { n: 4, arrangement: 'dice' },
    answer: { kind: 'number', value: 4 },
    widget: { flashMs: 1500, stimulus: { kind: 'dots', arrangement: 'dice', groups: [4] } },
  },
  {
    name: 'dot-flash flashMs 1000, groups of 2',
    t: tpl('subitize.flash', 'dot-flash'),
    params: { n: 6, arrangement: 'groups', groups: 3, flashMs: 1000 },
    answer: { kind: 'number', value: 6 },
    widget: { flashMs: 1000, stimulus: { kind: 'dots', arrangement: 'groups', groups: [2, 2, 2] } },
  },
  {
    name: 'numeral-pick n=3 (objects)',
    t: tpl('subitize.flash', 'numeral-pick', { representation: 'objects' }),
    params: { n: 3, arrangement: 'scatter' },
    answer: { kind: 'choice', id: 'opt-3' },
    widget: { stimulus: { kind: 'objects', set: { count: 3, layout: 'scatter' } } },
  },
  {
    name: 'number-pad ten-frame n=7',
    t: tpl('subitize.flash', 'number-pad', { tier: 'abstract' }),
    params: { n: 7, arrangement: 'ten-frame' },
    answer: { kind: 'number', value: 7 },
    widget: { stimulus: { kind: 'ten-frame', frames: 1, filled: [7] } },
  },
  {
    name: 'make-set fingers n=4',
    t: tpl('subitize.flash', 'make-set', { tier: 'concrete' }),
    params: { n: 4, arrangement: 'fingers' },
    answer: { kind: 'state', checker: 'set.count', target: { count: 4 } },
    widget: { target: 4, container: 'hands', capacity: 10 },
  },
  {
    name: 'tenframe-fill n=8 (standard fill)',
    t: tpl('subitize.flash', 'tenframe-fill', { tier: 'concrete' }),
    params: { n: 8, arrangement: 'ten-frame' },
    answer: {
      kind: 'state',
      checker: 'tenframe.total',
      target: { n: 8, requireStandardFill: true },
    },
    widget: { frames: 1, requireStandardFill: true, n: 8 },
  },
  {
    name: 'rekenrek read n=13',
    t: tpl('subitize.flash', 'rekenrek'),
    params: { n: 13 },
    answer: { kind: 'number', value: 13 },
    widget: { rows: 2, preset: [10, 3], mode: 'read' },
  },
  {
    name: 'number-bond missing whole 3 and 4 (counters)',
    t: tpl('subitize.flash', 'number-bond', { tier: 'concrete' }),
    params: { n: 7, arrangement: 'groups', groups: 2, part: 3 },
    answer: { kind: 'number', value: 7 },
    widget: { whole: null, parts: [3, 4], mode: 'missing-whole', counters: true },
  },
];

const BOND: Case[] = [
  {
    name: 'base-ten-build tens partner of 100: 3 tens on the mat, build 100',
    t: tpl('bond.parts', 'base-ten-build', { tier: 'concrete', representation: 'base-ten' }),
    params: { whole: 10, part: 3, tensOnly: true },
    answer: { kind: 'state', checker: 'baseten.value', target: { value: 100 } },
    widget: {
      target: 100,
      mode: 'build',
      pieces: { thousands: false, hundreds: false, tens: true, ones: false },
      prebuilt: { hundreds: 0, tens: 3, ones: 0 },
    },
  },
  {
    name: 'base-ten-build missing part of ones: 4 on the mat, build 9',
    t: tpl('bond.parts', 'base-ten-build', { tier: 'concrete' }),
    params: { whole: 9, part: 4 },
    answer: { kind: 'state', checker: 'baseten.value', target: { value: 9 } },
    widget: { pieces: { tens: true, ones: true }, prebuilt: { tens: 0, ones: 4 } },
  },
  {
    name: 'hundred-chart tens partner: 30 and ? make 100, tap 70',
    t: tpl('bond.parts', 'hundred-chart'),
    params: { whole: 10, part: 3, tensOnly: true },
    answer: { kind: 'number', value: 70 },
    widget: { first: 1, rows: 10, hidden: [], mode: 'find' },
  },
  {
    name: 'number-bond missing part 7 = 3 + ?',
    t: tpl('bond.parts', 'number-bond'),
    params: { whole: 7, part: 3 },
    answer: { kind: 'number', value: 4 },
    widget: { whole: 7, parts: [3, null], mode: 'missing-part', counters: false },
  },
  {
    name: 'number-bond missing whole 3 + 4',
    t: tpl('bond.parts', 'number-bond', { tier: 'concrete' }),
    params: { whole: 7, part: 3, unknown: 'whole' },
    answer: { kind: 'number', value: 7 },
    widget: { whole: null, parts: [3, 4], mode: 'missing-whole', counters: true },
  },
  {
    name: 'number-bond split 6',
    t: tpl('bond.parts', 'number-bond'),
    params: { whole: 6, unknown: 'split' },
    answer: { kind: 'state', checker: 'bond.split', target: { whole: 6, nonZero: true } },
    widget: { whole: 6, parts: [null, null], mode: 'split', nonZero: true },
  },
  {
    name: 'number-bond new way 6',
    t: tpl('bond.parts', 'number-bond'),
    params: { whole: 6, unknown: 'new-way' },
    answer: {
      kind: 'state',
      checker: 'bond.newWay',
      target: { whole: 6, found: [], nonZero: true },
    },
    widget: { mode: 'new-way', found: [] },
  },
  {
    name: 'tenframe-fill make ten from 6',
    t: tpl('bond.parts', 'tenframe-fill', { tier: 'concrete' }),
    params: { whole: 10, part: 6 },
    answer: { kind: 'state', checker: 'tenframe.makeTen', target: { total: 10, value: 4 } },
    widget: {
      goal: 'make-ten',
      thenAsk: 'missing',
      prefilled: [{ frame: 0, color: 'a', count: 6 }],
    },
  },
  {
    name: 'tenframe-fill missing part 7 = 3 + ?',
    t: tpl('bond.parts', 'tenframe-fill', { tier: 'concrete' }),
    params: { whole: 7, part: 3 },
    answer: { kind: 'state', checker: 'tenframe.total', target: { n: 7, value: 4 } },
    widget: { goal: 'show-n', n: 7, thenAsk: 'missing' },
  },
  {
    name: 'tenframe-fill split 6',
    t: tpl('bond.parts', 'tenframe-fill', { tier: 'concrete' }),
    params: { whole: 6, unknown: 'split' },
    answer: { kind: 'state', checker: 'bond.split', target: { whole: 6, nonZero: true } },
    widget: { goal: 'show-n', n: 6, thenAsk: null, prefilled: [] },
  },
  {
    name: 'rekenrek make ten from 6',
    t: tpl('bond.parts', 'rekenrek', { tier: 'concrete' }),
    params: { whole: 10, part: 6 },
    answer: {
      kind: 'state',
      checker: 'rekenrek.total',
      target: { n: 10, rowRule: 'fill-top-first' },
    },
    widget: { rows: 1, preset: [6, 0], mode: 'make-ten', rowRule: 'fill-top-first' },
  },
  {
    name: 'rekenrek missing part 15 = 4 + ? (two rows)',
    t: tpl('bond.parts', 'rekenrek', { tier: 'concrete' }),
    params: { whole: 15, part: 4 },
    answer: { kind: 'state', checker: 'rekenrek.total', target: { n: 15, rowRule: 'any' } },
    widget: { rows: 2, preset: [4, 0], mode: 'show' },
  },
  {
    name: 'rekenrek split 8',
    t: tpl('bond.parts', 'rekenrek', { tier: 'concrete' }),
    params: { whole: 8, unknown: 'split' },
    answer: { kind: 'state', checker: 'bond.split', target: { whole: 8, nonZero: true } },
    widget: { rows: 2, preset: [0, 0], target: 8 },
  },
  {
    name: 'number-pad abstract 4 + ? = 9',
    t: tpl('bond.parts', 'number-pad', { tier: 'abstract' }),
    params: { whole: 9, part: 4 },
    answer: { kind: 'number', value: 5 },
    widget: {
      stimulus: { kind: 'none' },
      expression: {
        tokens: [
          { t: 'num', v: 4 },
          { t: 'op', v: '+' },
          { t: 'blank', id: 'x' },
          { t: 'rel', v: '=' },
          { t: 'num', v: 9 },
        ],
      },
    },
  },
  {
    name: 'number-pad pictorial missing whole',
    t: tpl('bond.parts', 'number-pad'),
    params: { whole: 9, part: 4, unknown: 'whole' },
    answer: { kind: 'number', value: 9 },
    widget: { stimulus: { kind: 'number-bond', whole: '?', parts: [4, 5] } },
  },
  {
    name: 'number-line-jump 3 → 8',
    t: tpl('bond.parts', 'number-line-jump', { tier: 'concrete' }),
    params: { whole: 8, part: 3 },
    answer: {
      kind: 'state',
      checker: 'jumps.reach',
      target: { start: 3, target: 8, allowedJumps: [1], value: 5 },
    },
    widget: { start: 3, target: 8, thenAsk: 'total-jump', path: 'stones' },
  },
  {
    name: 'number-line-jump tens 20 → 50',
    t: tpl('bond.parts', 'number-line-jump'),
    params: { whole: 5, part: 2, tensOnly: true },
    answer: {
      kind: 'state',
      checker: 'jumps.reach',
      target: { start: 20, target: 50, allowedJumps: [10], value: 30 },
    },
    widget: { ticksEvery: 10, max: 70 },
  },
  {
    name: 'make-set add-more 3 → 7',
    t: tpl('bond.parts', 'make-set', { tier: 'concrete' }),
    params: { whole: 7, part: 3 },
    answer: { kind: 'state', checker: 'set.count', target: { count: 7 } },
    widget: {
      mode: 'add-more',
      start: 3,
      source: { sprite: 'shell', supply: 6 },
      container: 'boat',
    },
  },
  {
    name: 'make-set part 0 → make 5',
    t: tpl('bond.parts', 'make-set', { tier: 'concrete' }),
    params: { whole: 5, part: 0 },
    answer: { kind: 'state', checker: 'set.count', target: { count: 5 } },
    widget: { mode: 'make', target: 5 },
  },
  {
    name: 'make-set split 6 by taking away',
    t: tpl('bond.parts', 'make-set', { tier: 'concrete' }),
    params: { whole: 6, unknown: 'split' },
    answer: { kind: 'state', checker: 'bond.split', target: { whole: 6, nonZero: true } },
    widget: { mode: 'take-away', start: 6, container: 'boat' },
  },
  {
    name: 'make-set split 7 on two hands',
    t: tpl('bond.parts', 'make-set', { tier: 'concrete', representation: 'fingers' }),
    params: { whole: 7, unknown: 'split' },
    answer: { kind: 'state', checker: 'bond.split', target: { whole: 7, nonZero: true } },
    widget: { mode: 'make', container: 'hands' },
  },
];

const ADDSUB: Case[] = [
  {
    name: 'number-pad 5 + 3 = ?',
    t: tpl('addsub.facts', 'number-pad', { tier: 'abstract' }),
    params: { a: 5, b: 3 },
    answer: { kind: 'number', value: 8 },
    widget: {
      stimulus: { kind: 'none' },
      expression: {
        tokens: [
          { t: 'num', v: 5 },
          { t: 'op', v: '+' },
          { t: 'num', v: 3 },
          { t: 'rel', v: '=' },
          { t: 'blank', id: 'x' },
        ],
      },
    },
  },
  {
    name: 'number-pad 5 + ? = 8 (change unknown)',
    t: tpl('addsub.facts', 'number-pad', { tier: 'abstract' }),
    params: { a: 5, b: 3, unknown: 'change' },
    answer: { kind: 'number', value: 3 },
    widget: {
      expression: {
        tokens: [
          { t: 'num', v: 5 },
          { t: 'op', v: '+' },
          { t: 'blank', id: 'x' },
          { t: 'rel', v: '=' },
          { t: 'num', v: 8 },
        ],
      },
    },
  },
  {
    name: 'number-pad ? + 3 = 8 (start unknown)',
    t: tpl('addsub.facts', 'number-pad', { tier: 'abstract' }),
    params: { a: 5, b: 3, unknown: 'start' },
    answer: { kind: 'number', value: 5 },
  },
  {
    name: 'number-pad 9 − 4 (pictorial stimulus)',
    t: tpl('addsub.facts', 'number-pad'),
    params: { a: 9, b: 4, op: '-' },
    answer: { kind: 'number', value: 5 },
    widget: { stimulus: { kind: 'ten-frame', frames: 1, filled: [9] } },
  },
  {
    name: 'numeral-pick 6 + 7',
    t: tpl('addsub.facts', 'numeral-pick'),
    params: { a: 6, b: 7 },
    answer: { kind: 'choice', id: 'opt-13' },
    widget: { stimulus: { kind: 'expression' } },
  },
  {
    name: 'tenframe-fill 8 + 5 (two frames)',
    t: tpl('addsub.facts', 'tenframe-fill', { tier: 'concrete' }),
    params: { a: 8, b: 5 },
    answer: { kind: 'state', checker: 'tenframe.total', target: { n: 13, value: 13 } },
    widget: {
      frames: 2,
      goal: 'add',
      a: 8,
      b: 5,
      thenAsk: 'total',
      prefilled: [{ frame: 0, color: 'a', count: 8 }],
    },
  },
  {
    name: 'tenframe-fill 12 − 5',
    t: tpl('addsub.facts', 'tenframe-fill', { tier: 'concrete' }),
    params: { a: 12, b: 5, op: '-' },
    answer: { kind: 'state', checker: 'tenframe.total', target: { n: 7, value: 7 } },
    widget: {
      frames: 2,
      goal: 'subtract',
      prefilled: [
        { frame: 0, color: 'a', count: 10 },
        { frame: 1, color: 'a', count: 2 },
      ],
    },
  },
  {
    name: 'number-line-jump 5 + 3',
    t: tpl('addsub.facts', 'number-line-jump', { tier: 'concrete' }),
    params: { a: 5, b: 3 },
    answer: {
      kind: 'state',
      checker: 'jumps.reach',
      target: { start: 5, target: 8, allowedJumps: [1], value: 8 },
    },
    widget: {
      start: 5,
      target: 8,
      goal: 'add',
      thenAsk: 'landing',
      labelsEvery: 1,
      path: 'stones',
    },
  },
  {
    name: 'number-line-jump 9 − 3',
    t: tpl('addsub.facts', 'number-line-jump'),
    params: { a: 9, b: 3, op: '-' },
    answer: {
      kind: 'state',
      checker: 'jumps.reach',
      target: { start: 9, target: 6, allowedJumps: [-1], value: 6 },
    },
    widget: { goal: 'subtract', labelsEvery: 5, path: 'line' },
  },
  // K01 (#11): rekenrek, dot-flash and number-bond (more in addsub/facts.test.ts).
  {
    name: 'rekenrek 8 + 5 (make ten)',
    t: tpl('addsub.facts', 'rekenrek', { tier: 'concrete' }),
    params: { a: 8, b: 5, family: 'make-ten' },
    answer: {
      kind: 'state',
      checker: 'rekenrek.total',
      target: { n: 13, rowRule: 'fill-top-first', value: 13 },
    },
    widget: { preset: [8, 5], mode: 'make-ten', thenAsk: 'total' },
  },
  {
    name: 'dot-flash 4 + 4',
    t: tpl('addsub.facts', 'dot-flash'),
    params: { a: 4, b: 4, family: 'doubles' },
    answer: { kind: 'number', value: 8 },
    widget: { stimulus: { kind: 'dots', arrangement: 'groups', groups: [4, 4] } },
  },
  {
    name: 'number-bond 12 − 5 (think addition)',
    t: tpl('addsub.facts', 'number-bond'),
    params: { a: 12, b: 5, op: '-', family: 'think-add' },
    answer: { kind: 'number', value: 7 },
    widget: { whole: 12, parts: [5, null], mode: 'missing-part' },
  },
];

describe.each([
  ['count.set', COUNT_SET],
  ['count.sequence', COUNT_SEQUENCE],
  ['subitize.flash', SUBITIZE],
  ['bond.parts', BOND],
  ['addsub.facts', ADDSUB],
] as const)('%s', (generator, cases) => {
  it('covers every format the generator lists', () => {
    const formats = new Set(cases.map((k) => k.t.format));
    expect([...formats].sort()).toEqual([...(registry.get(generator)?.formats ?? [])].sort());
  });

  it.each(cases)('$name', ({ t, params, answer, widget }) => {
    const item = generateItemFromParams(t, params);
    expect(item.format).toBe(t.format);
    expect(item.widget.format).toBe(t.format);
    expect(item.answer).toEqual(answer);
    if (widget) expect(item.widget).toMatchObject(widget);
    for (const [k, v] of Object.entries(params)) expect(item.params[k]).toBe(v);

    // The widget passes its format's semantic schema (03 §9.4 step 3).
    const parsed = formatModel(t.format)?.configSchema.safeParse(item.widget);
    expect(parsed?.success, JSON.stringify(parsed?.error?.issues)).toBe(true);
    if (item.widget.format === 'numeral-pick' && item.answer.kind === 'choice') {
      expect(item.widget.options.map((o) => o.id)).toContain(item.answer.id);
    }

    // exampleCorrect is checked correct (03 §9.4 step 4).
    expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);

    // The worked solution replays through the format model to a correct response.
    const steps = itemSolution(item, t);
    expect(steps.length).toBeGreaterThan(0);
    const replayed = replaySteps(item, steps);
    expect(replayed).not.toBeNull();
    expect(checkResponse(item, replayed as NonNullable<typeof replayed>).correct).toBe(true);

    // Hint level 5 plays the whole solution.
    const showMe = item.hints.find((h) => h.level === 5);
    expect(showMe?.actions).toEqual(steps.flatMap((s) => (s.action ? [s.action] : [])));
  });
});

// ---------- feature values at the extremes ----------

interface FeatureCase {
  name: string;
  t: ItemTemplate;
  params: ParamValues;
  features: Record<string, number | undefined>;
}

const T_ADD_PAD = tpl('addsub.facts', 'number-pad', { tier: 'abstract' });
const T_COUNT_PAD = tpl('count.set', 'number-pad', { tier: 'abstract' });
const T_COUNT_MAKE = tpl('count.set', 'make-set', { tier: 'concrete' });
const T_SEQ_PAD = tpl('count.sequence', 'number-pad');
const T_BOND = tpl('bond.parts', 'number-bond');
const T_SUB_PAD = tpl('subitize.flash', 'number-pad');
const T_SUB_FLASH = tpl('subitize.flash', 'dot-flash');

const FEATURES: FeatureCase[] = [
  // addsub.facts
  {
    name: 'addsub 8 + 5 bridges ten',
    t: T_ADD_PAD,
    params: { a: 8, b: 5 },
    features: { bridge10: 1, size: 1.6 },
  },
  {
    name: 'addsub 3 + 4 does not bridge',
    t: T_ADD_PAD,
    params: { a: 3, b: 4 },
    features: { bridge10: 0, size: 0.4 },
  },
  {
    name: 'addsub 5 + 5 makes ten, no bridge',
    t: T_ADD_PAD,
    params: { a: 5, b: 5 },
    features: { bridge10: 0, double: 1 },
  },
  {
    name: 'addsub 10 + 3 adds ten, no bridge',
    t: T_ADD_PAD,
    params: { a: 10, b: 3 },
    features: { bridge10: 0, plusTen: 1 },
  },
  {
    name: 'addsub 12 − 5 bridges back',
    t: T_ADD_PAD,
    params: { a: 12, b: 5, op: '-' },
    features: { bridge10: 1, sub: 1 },
  },
  {
    name: 'addsub 15 − 3 stays in the teens',
    t: T_ADD_PAD,
    params: { a: 15, b: 3, op: '-' },
    features: { bridge10: 0 },
  },
  {
    name: 'addsub 4 + 4 is a double',
    t: T_ADD_PAD,
    params: { a: 4, b: 4 },
    features: { double: 1, nearDouble: 0 },
  },
  {
    name: 'addsub 4 + 5 is a near double',
    t: T_ADD_PAD,
    params: { a: 4, b: 5 },
    features: { double: 0, nearDouble: 1 },
  },
  {
    name: 'addsub 1 + 6 adds one',
    t: T_ADD_PAD,
    params: { a: 1, b: 6 },
    features: { zeroOrOne: 1 },
  },
  {
    name: 'addsub 0 + 5 adds zero',
    t: T_ADD_PAD,
    params: { a: 0, b: 5 },
    features: { zeroOrOne: 1 },
  },
  {
    name: 'addsub 7 − 1 takes one',
    t: T_ADD_PAD,
    params: { a: 7, b: 1, op: '-' },
    features: { zeroOrOne: 1 },
  },
  {
    name: 'addsub 8 − 6 takes more than one',
    t: T_ADD_PAD,
    params: { a: 8, b: 6, op: '-' },
    features: { zeroOrOne: 0 },
  },
  { name: 'addsub 9 + 4 adds nine', t: T_ADD_PAD, params: { a: 9, b: 4 }, features: { nine: 1 } },
  {
    name: 'addsub change unknown',
    t: T_ADD_PAD,
    params: { a: 5, b: 3, unknown: 'change' },
    features: { 'unknown.change': 1, 'unknown.start': 0 },
  },
  {
    name: 'addsub start unknown',
    t: T_ADD_PAD,
    params: { a: 5, b: 3, unknown: 'start' },
    features: { 'unknown.change': 0, 'unknown.start': 1 },
  },
  {
    name: 'addsub 2 + 3: no size, no bridge, only the near-double feature',
    t: T_ADD_PAD,
    params: { a: 2, b: 3 },
    features: {
      size: 0,
      bridge10: 0,
      sub: 0,
      'unknown.change': 0,
      'unknown.start': 0,
      zeroOrOne: 0,
      double: 0,
      nearDouble: 1,
      nine: 0,
      plusTen: 0,
    },
  },
  // count.set
  {
    name: 'count.set n = 11 is teen',
    t: T_COUNT_PAD,
    params: { n: 11 },
    features: { teen: 1, zero: 0 },
  },
  {
    name: 'count.set n = 10 is not teen',
    t: T_COUNT_PAD,
    params: { n: 10 },
    features: { teen: 0, 'count.over5': 1 },
  },
  {
    name: 'count.set n = 0 is zero',
    t: T_COUNT_PAD,
    params: { n: 0 },
    features: { zero: 1, teen: 0 },
  },
  {
    name: 'count.set n = 25 is over 20',
    t: T_COUNT_PAD,
    params: { n: 25 },
    features: { 'n.over20': 0.5 },
  },
  {
    name: 'count.set n = 3 has no size load',
    t: T_COUNT_PAD,
    params: { n: 3 },
    features: { 'count.over5': 0 },
  },
  {
    name: 'count.set make-set uses its own size feature',
    t: T_COUNT_MAKE,
    params: { n: 10, mode: 'make' },
    features: { 'count.over5': undefined, 'target.over5': 1 },
  },
  // count.sequence
  {
    name: 'count.sequence 19 → 20 crosses a decade',
    t: T_SEQ_PAD,
    params: { start: 19 },
    features: { crossDecade: 1, digits: 1 },
  },
  {
    name: 'count.sequence 7 → 8 stays in the decade',
    t: T_SEQ_PAD,
    params: { start: 7 },
    features: { crossDecade: 0, digits: 0 },
  },
  {
    name: 'count.sequence 99 → 100 crosses a century',
    t: T_SEQ_PAD,
    params: { start: 99 },
    features: { crossCentury: 1, crossDecade: 1, digits: 2 },
  },
  {
    name: 'count.sequence back by 2',
    t: T_SEQ_PAD,
    params: { start: 8, step: 2, dir: -1 },
    features: { backward: 1, 'step.notOne': 1 },
  },
  // bond.parts
  {
    name: 'bond.parts part 0 is a zero part',
    t: T_BOND,
    params: { whole: 7, part: 0 },
    features: { zeroPart: 1 },
  },
  {
    name: 'bond.parts part = whole is a zero part',
    t: T_BOND,
    params: { whole: 7, part: 7 },
    features: { zeroPart: 1 },
  },
  {
    name: 'bond.parts 3 + 4 has no zero part',
    t: T_BOND,
    params: { whole: 7, part: 3 },
    features: { zeroPart: 0 },
  },
  {
    name: 'bond.parts split never has a zero part',
    t: T_BOND,
    params: { whole: 7, unknown: 'split' },
    features: { zeroPart: 0 },
  },
  {
    name: 'bond.parts whole 10 size and tens bond',
    t: T_BOND,
    params: { whole: 3, part: 1, tensOnly: true },
    features: { 'whole.over5': 5, 'whole.over20': 1, tensBond: 1 },
  },
  // subitize.flash
  {
    name: 'subitize dice 4 is perceptual',
    t: T_SUB_PAD,
    params: { n: 4, arrangement: 'dice' },
    features: { conceptual: 0 },
  },
  {
    name: 'subitize 6 in two groups is conceptual',
    t: T_SUB_PAD,
    params: { n: 6, arrangement: 'groups' },
    features: { conceptual: 1, multiplicative: 0, 'n.over5': 0.2 },
  },
  {
    name: 'subitize 9 in three equal groups is multiplicative',
    t: T_SUB_PAD,
    params: { n: 9, arrangement: 'groups', groups: 3 },
    features: { multiplicative: 1 },
  },
  {
    name: 'subitize 13 on a double ten-frame shows place value',
    t: T_SUB_PAD,
    params: { n: 13, arrangement: 'double-ten-frame' },
    features: { teen: 1, placeValue: 1 },
  },
  {
    name: 'subitize dot-flash has no n.over5 (it has n.over4)',
    t: T_SUB_FLASH,
    params: { n: 7 },
    features: { 'n.over5': undefined, 'n.over4': 3 },
  },
];

describe('feature values', () => {
  it.each(FEATURES)('$name', ({ t, params, features }) => {
    const item = generateItemFromParams(t, params);
    const got = itemFeatures(item, t);
    for (const [k, v] of Object.entries(features)) {
      if (v === undefined) expect(got, k).not.toHaveProperty([k]);
      else expect(got[k], k).toBeCloseTo(v, 9);
    }
  });

  it('itemFeatures does not depend on layout randomness (same features for every seed)', () => {
    const t = tpl('count.set', 'numeral-pick');
    const base = itemFeatures(generateItemFromParams(t, { n: 6 }), t);
    for (let seed = 1; seed < 6; seed += 1) {
      expect(itemFeatures(generateItemFromParams(t, { n: 6 }, { seed }), t)).toEqual(base);
    }
  });
});

// ---------- widgets stay valid beyond the default domains ----------

describe('count.sequence hundred-chart near and above 100', () => {
  const t = tpl('count.sequence', 'hundred-chart');
  /** Either the params are rejected (GenerationError) or the widget passes its format schema. */
  function validOrRejected(params: ParamValues): boolean {
    let item: ReturnType<typeof generateItemFromParams>;
    try {
      item = generateItemFromParams(t, params);
    } catch (e) {
      if (e instanceof GenerationError) return true;
      throw e;
    }
    return formatModel('hundred-chart')?.configSchema.safeParse(item.widget).success ?? false;
  }

  it.each<[string, ParamValues]>([
    ['99 → 100', { start: 99 }],
    ['100 → 101 (1–120 chart)', { start: 100 }],
    ['110, 120 by tens (1–120 chart)', { start: 100, step: 10, length: 2 }],
    ['fill 202–205', { start: 201, length: 4 }],
  ])('%s', (_label, params) => {
    expect(validOrRejected(params)).toBe(true);
  });

  // Regression (fixed; was: generators/count/sequence.ts, hundred-chart branch): when the sequence runs past 120 but
  // starts at or below 100, `first` is computed from `lo` as 1 with 10 rows (cells 1–100), so the
  // hidden cells 110, 120, 130 are off the chart and the widget fails the hundred-chart schema
  // ("hidden cells must be on the chart"); accepts() does not reject these params either.
  // The same `first`-from-`lo` rule breaks any fill that crosses a century above 100: 200 → 204
  // gives first = 101 (cells 101–200), so 201–204 are off the chart.
  it.each<[string, ParamValues]>([
    ['100 → 130 by tens (fill)', { start: 100, step: 10, length: 3 }],
    ['200 → 204 (fill across 200)', { start: 200, length: 4 }],
  ])('%s is either rejected or valid', (_label, params) => {
    expect(validOrRejected(params)).toBe(true);
  });
});

// ---------- validity (accepts) ----------

describe('accepts rejects invalid params', () => {
  it.each<[string, ItemTemplate, ParamValues]>([
    ['addsub negative result 3 − 5', T_ADD_PAD, { a: 3, b: 5, op: '-' }],
    ['addsub above maxSum 15 + 9', T_ADD_PAD, { a: 15, b: 9 }],
    ['addsub above a lower maxSum', T_ADD_PAD, { a: 6, b: 5, maxSum: 10 }],
    ['addsub family mismatch (doubles 3 + 4)', T_ADD_PAD, { a: 3, b: 4, family: 'doubles' }],
    ['addsub family mismatch (make-ten 3 + 4)', T_ADD_PAD, { a: 3, b: 4, family: 'make-ten' }],
    ['addsub jump with b = 0', tpl('addsub.facts', 'number-line-jump'), { a: 5, b: 0 }],
    ['bond part > whole', T_BOND, { whole: 5, part: 8 }],
    ['bond negative part', T_BOND, { whole: 5, part: -1 }],
    ['bond split of 1', T_BOND, { whole: 1, unknown: 'split' }],
    ['bond jump with part = whole', tpl('bond.parts', 'number-line-jump'), { whole: 5, part: 5 }],
    ['sequence below 0', T_SEQ_PAD, { start: 2, dir: -1, length: 3 }],
    ['sequence with step 0', T_SEQ_PAD, { start: 2, step: 0 }],
    ['sequence with a negative start', T_SEQ_PAD, { start: -1 }],
  ])('%s → GenerationError', (_label, t, params) => {
    expect(() => generateItemFromParams(t, params)).toThrow(GenerationError);
  });

  it.each<[GeneratorId, ParamValues, boolean]>([
    ['addsub.facts', { a: 5, b: 3, op: '+', family: 'any', maxSum: 20 }, true],
    ['addsub.facts', { a: 3, b: 5, op: '-', family: 'any', maxSum: 20 }, false],
    ['addsub.facts', { a: 3, b: 3, op: '+', family: 'doubles', maxSum: 20 }, true],
    ['addsub.facts', { a: 14, b: 10, op: '-', family: 'teen-minus-ten', maxSum: 20 }, true],
    ['addsub.facts', { a: 14, b: 4, op: '-', family: 'back-to-ten', maxSum: 20 }, true],
    ['addsub.facts', { a: 14, b: 3, op: '-', family: 'back-to-ten', maxSum: 20 }, false],
    ['bond.parts', { whole: 5, part: 5, unknown: 'part' }, true],
    ['bond.parts', { whole: 5, part: 6, unknown: 'part' }, false],
    ['bond.parts', { whole: 2, unknown: 'new-way' }, true],
    ['count.sequence', { start: 3, step: 1, dir: -1, length: 3, last: 0 }, true],
    ['count.sequence', { start: 3, step: 1, dir: -1, length: 4, last: -1 }, false],
    // CNT.15's abstract tier: the place after k, on the pad only, while place k + 1 has a clip.
    ['count.ordinal', { ask: 'after', k: 9, n: 10, from: 'left' }, true],
    ['count.ordinal', { ask: 'after', k: 10, n: 10, from: 'left' }, false],
  ])('%s.accepts(%j) → %s', (id, params, want) => {
    const g = registry.get(id);
    expect(g?.accepts?.(params, tpl(id, 'number-pad'))).toBe(want);
  });
});

// ---------- family enforcement draws within the template's domains ----------

describe('addsub family enforcement', () => {
  it.each<[string, Record<string, ParamSpec>, (p: ParamValues) => boolean]>([
    [
      'doubles',
      { a: int(0, 10), b: int(0, 10), family: c('doubles'), op: c('+') },
      (p) => p.a === p.b,
    ],
    [
      'make-ten with b in [2, 4] (one-digit addends that pass ten)',
      { a: int(0, 10), b: int(2, 4), family: c('make-ten'), op: c('+') },
      (p) => (p.a as number) <= 9 && (p.a as number) + (p.b as number) >= 11,
    ],
    [
      'plus1 with a in [2, 9]',
      { a: int(2, 9), b: int(0, 9), family: c('plus1'), op: c('+') },
      (p) => p.b === 1,
    ],
    [
      'back-to-ten',
      { a: int(11, 19), b: int(0, 9), family: c('back-to-ten'), op: c('-') },
      (p) => (p.a as number) - (p.b as number) <= 10 && (p.b as number) >= 1,
    ],
  ])(
    '%s: every item is in the family and every param in its ParamSpec',
    (_label, params, inFamily) => {
      const t = tpl('addsub.facts', 'number-pad', { params });
      const g = registry.get('addsub.facts');
      if (!g) throw new Error('addsub.facts missing');
      const spec = mergedSpec(t, g);
      for (let seed = 0; seed < 60; seed += 1) {
        const item = generateItem(t, seed);
        expect(inFamily(item.params), JSON.stringify(item.params)).toBe(true);
        for (const [k, s] of Object.entries(spec)) {
          expect(
            inDomain(s, item.params[k] as string | number | boolean),
            `${k}=${item.params[k]}`,
          ).toBe(true);
        }
        expect(item.params.result).toBe(
          item.params.op === '-'
            ? (item.params.a as number) - (item.params.b as number)
            : (item.params.a as number) + (item.params.b as number),
        );
      }
    },
  );
});

// ---------- registry ----------

describe('registry', () => {
  it('has exactly the registered generators', () => {
    expect(registry.ids()).toEqual([
      'addsub.facts',
      'addsub.three',
      'bond.parts',
      'compare.numbers',
      'compare.sets',
      'count.ordinal',
      'count.sequence',
      'count.set',
      'data.chart',
      'data.sort',
      'div.share',
      'equality.eq',
      'estimate.quantity',
      'frac.compare',
      'frac.partition',
      'geo.compose',
      'geo.draw',
      'geo.identify',
      'geo.position',
      'mda.addsub',
      'mea.length',
      'mea.massvolume',
      'numberline.place',
      'pattern.grow',
      'pattern.repeat',
      'puzzle.grid',
      'pv.number',
      'pv.regroup',
      'pv.tenmore',
      'story.addsub',
      'subitize.flash',
      'time.clock',
      'time.sequence',
    ]);
    expect(
      registry
        .all()
        .map((g) => g.id)
        .sort(),
    ).toEqual(registry.ids());
    expect(registry.get('no.such')).toBeUndefined();
  });

  const pairs = registry.all().flatMap((g) => g.formats.map((f) => [g.id, f] as const));
  it.each(pairs)('%s builds %s from its default params', (id, format) => {
    expect(generatorRegistered(id, format)).toBe(true);
    const t = tpl(id, format);
    for (let seed = 0; seed < 10; seed += 1) {
      const item = generateItem(t, seed);
      expect(item.widget.format).toBe(format);
      expect(checkResponse(item, itemExampleCorrect(item, t)).correct).toBe(true);
    }
  });

  it('every generator param default lies in its declared value set', () => {
    for (const g of registry.all()) {
      for (const [name, decl] of Object.entries(g.params)) {
        if (decl.values && decl.default.kind === 'const') {
          expect(decl.values, `${g.id}.${name}`).toContain(decl.default.value);
        }
      }
    }
  });
});
