// Strategy praise detectors (03 §5.7): positive, negative and "wrong answer → no praise" cases for
// each StrategyId, on addsub.facts items built from in-test templates.

import {
  type GeneratedItem,
  type InteractionEvent,
  type ItemFormat,
  type ItemTemplate,
  type MisconceptionSpec,
  type ParamValues,
  type ResponseValue,
  STRATEGY_IDS,
} from '@number-island/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { initContent, resetContent } from '../content/binding';
import { checkResponse, detectProcessMisconceptions } from '../items/check';
import { generateItemFromParams } from '../items/generate';
import { itemExampleCorrect, itemSolution } from '../items/solution';
import { detectStrategies } from '.';

function tpl(id: string, skillId: string, format: ItemFormat, over: Partial<ItemTemplate> = {}) {
  const t: ItemTemplate = {
    id,
    skillId,
    format,
    tier: 'pictorial',
    generator: 'addsub.facts',
    params: {},
    difficulty: { base: 0, features: {} },
    narration: { prompt: 'p.x', hints: ['h.x'] },
    ...over,
  };
  return t;
}

const T = {
  pad: tpl('T.pad', 'ADD.03', 'number-pad'),
  frame: tpl('T.frame', 'ADD.08', 'tenframe-fill', {
    tier: 'concrete',
    representation: 'double-ten-frame',
  }),
  jump: tpl('T.jump', 'ADD.08', 'number-line-jump', { representation: 'open-number-line' }),
  near: tpl('T.near', 'ADD.16', 'number-line-jump', { representation: 'open-number-line' }),
};

const COUNT_ALL: MisconceptionSpec = {
  id: 'MC.count-all-instead',
  name: 'Counts all instead of counting on',
  area: 'addsub',
  detect: { kind: 'process', rule: 'countAllInstead' },
  appliesTo: { generators: ['addsub.facts'] },
  skills: ['ADD.03', 'ADD.08'],
  remediation: ['ADD.03'],
  feedback: 'fb.mc.count-all-instead',
  priority: 50,
  parentTip: 'tip',
  examples: [],
};

const make = (t: ItemTemplate, params: ParamValues): GeneratedItem =>
  generateItemFromParams(t, params);

const taps = (...ids: number[]): InteractionEvent[] =>
  ids.map((i, k) => ({ t: 'tap' as const, target: `counter-${i}`, ms: 300 * k }));
const meta = (trace?: InteractionEvent[]) =>
  trace ? { latencyMs: 4000, trace } : { latencyMs: 4000 };

const num = (value: number): ResponseValue => ({ kind: 'number', value });
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

/** Two ten-frames: `f0` and `f1` list the cell colours in order, the rest are empty. */
const frames = (f0: number[], f1: number[], value: number): ResponseValue => {
  const pad = (f: number[]) => [...f, ...new Array<number>(10 - f.length).fill(0)];
  return { kind: 'state', value: { cells: [pad(f0), pad(f1)], value } };
};
const fill = (n: number, c: number) => new Array<number>(n).fill(c);

const hops = (jumps: number[], value: number): ResponseValue => ({
  kind: 'state',
  value: { jumps, value },
});

/**
 * addsub.facts offers only ±1 hops today, so every generated path hops by ones. An open-number-line
 * template that allows bigger hops (ADD.08.t3) is modelled by widening `allowedJumps`.
 */
function withJumps(item: GeneratedItem, allowedJumps: number[]): GeneratedItem {
  if (item.widget.format !== 'number-line-jump' || item.answer.kind !== 'state') {
    throw new Error('expected a number-line-jump item');
  }
  return {
    ...item,
    widget: { ...item.widget, allowedJumps },
    answer: { ...item.answer, target: { ...item.answer.target, allowedJumps } },
  };
}
const OPEN = [-1, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * The ADD.08 show-addends / move-counters start: `a` colour-a counters in frame 0 and `b` colour-b
 * in frame 1 (addsub.facts itself prefills only `a`). One-frame items are returned unchanged.
 */
function withAddendsShown(item: GeneratedItem): GeneratedItem {
  if (item.widget.format !== 'tenframe-fill') throw new Error('expected a tenframe-fill item');
  if (item.widget.frames !== 2) return item;
  const { a, b } = item.params as { a: number; b: number };
  return {
    ...item,
    widget: {
      ...item.widget,
      prefilled: [
        { frame: 0, color: 'a', count: a },
        { frame: 1, color: 'b', count: b },
      ],
    },
  };
}
/** A ten-frame item that starts empty: the child places every counter. */
function emptyStart(item: GeneratedItem): GeneratedItem {
  if (item.widget.format !== 'tenframe-fill') throw new Error('expected a tenframe-fill item');
  return { ...item, widget: { ...item.widget, prefilled: [] } };
}

beforeEach(() => {
  resetContent();
  initContent({ templates: Object.values(T), narration: {}, misconceptions: [COUNT_ALL] });
});

describe('detectStrategies', () => {
  it('reports only the v1 StrategyIds, in STRATEGY_IDS order', () => {
    const item = withJumps(make(T.jump, { a: 5, b: 6 }), OPEN);
    const r = hops([5, 1], 11);
    expect(checkResponse(item, r).correct).toBe(true);
    // 5 + 6 as 5 + 5 + 1, and the first jump lands on 10.
    expect(detectStrategies(item, r, meta())).toEqual([
      'strategy.made-ten',
      'strategy.used-doubles',
    ]);
    for (const id of detectStrategies(item, r, meta())) expect(STRATEGY_IDS).toContain(id);
  });

  it('is pure: same inputs, same output; the trace is not changed', () => {
    const item = make(T.frame, { a: 8, b: 5 });
    const trace = taps(8, 9, 10, 11, 12);
    const copy = structuredClone(trace);
    const r = frames(fill(8, 1), fill(5, 2), 13);
    expect(detectStrategies(item, r, meta(trace))).toEqual(detectStrategies(item, r, meta(trace)));
    expect(trace).toEqual(copy);
  });

  it('gives no praise for a skip, an unbound template, subtraction or a missing addend', () => {
    const item = make(T.pad, { a: 5, b: 3 });
    expect(detectStrategies(item, { kind: 'skip' }, meta(taps(5, 6, 7)))).toEqual([]);
    const loose = { ...item, templateId: 'T.unbound' };
    expect(detectStrategies(loose, num(8), meta(taps(5, 6, 7)))).toEqual([]);
    const sub = make(T.pad, { a: 8, b: 3, op: '-' });
    expect(detectStrategies(sub, num(5), meta(taps(5, 6, 7)))).toEqual([]);
    const change = make(T.pad, { a: 5, b: 3, unknown: 'change' });
    expect(detectStrategies(change, num(3), meta(taps(5, 6, 7)))).toEqual([]);
  });

  it('never appears in detectProcessMisconceptions, which stays misconception-only', () => {
    const item = make(T.pad, { a: 5, b: 3 });
    expect(detectStrategies(item, num(8), meta(taps(5, 6, 7)))).toEqual(['strategy.counted-on']);
    expect(detectProcessMisconceptions(item, num(8), meta(taps(5, 6, 7)))).toEqual([]);
  });
});

describe('strategy.counted-on', () => {
  it('8 + 5 on ten-frames: taps only the five added counters', () => {
    const item = make(T.frame, { a: 8, b: 5 });
    const r = frames(fill(8, 1), fill(5, 2), 13);
    expect(checkResponse(item, r).correct).toBe(true);
    expect(detectStrategies(item, r, meta(taps(8, 9, 10, 11, 12)))).toEqual([
      'strategy.counted-on',
    ]);
    // Order and a repeated tap do not matter; every second-addend counter does.
    expect(detectStrategies(item, r, meta(taps(12, 8, 9, 9, 11, 10)))).toEqual([
      'strategy.counted-on',
    ]);
  });

  it('5 + 3 with counters beside the number pad', () => {
    expect(detectStrategies(make(T.pad, { a: 5, b: 3 }), num(8), meta(taps(5, 6, 7)))).toEqual([
      'strategy.counted-on',
    ]);
  });

  it.each<[string, InteractionEvent[] | undefined]>([
    ['no trace', undefined],
    ['an empty trace', []],
    ['counting all from the first addend (MC.count-all-instead)', taps(...range(0, 8))],
    ['one first-addend counter touched', taps(4, 5, 6, 7)],
    ['a second-addend counter left out', taps(5, 6)],
    ['a counter index past the set', taps(5, 6, 7, 8)],
    [
      'counters dragged, not tapped',
      [5, 6, 7].map((i, k) => ({ t: 'drag' as const, target: `counter-${i}`, ms: k })),
    ],
    [
      'objects tapped, not counters',
      [5, 6, 7].map((i, k) => ({ t: 'tap' as const, target: `obj-${i}`, ms: k })),
    ],
  ])('5 + 3, %s → no praise', (_label, trace) => {
    expect(detectStrategies(make(T.pad, { a: 5, b: 3 }), num(8), meta(trace))).toEqual([]);
  });

  it('a wrong answer gets no praise, however it was counted', () => {
    const item = make(T.pad, { a: 5, b: 3 });
    expect(detectStrategies(item, num(7), meta(taps(5, 6, 7)))).toEqual([]);
    expect(detectStrategies(item, num(9), meta(taps(5, 6, 7)))).toEqual([]);
  });

  it('number-line hops never count as counting on (the widget starts at a)', () => {
    const item = make(T.jump, { a: 5, b: 3 });
    expect(checkResponse(item, hops([1, 1, 1], 8)).correct).toBe(true);
    expect(detectStrategies(item, hops([1, 1, 1], 8), meta())).toEqual([]);
    expect(detectStrategies(item, hops([1, 1, 1], 8), meta(taps(5, 6, 7)))).toEqual([]);
  });
});

describe('strategy.made-ten', () => {
  it('8 + 5 shown on two ten-frames, 2 counters moved up: frame 0 is ten, 3 left in frame 1', () => {
    const item = withAddendsShown(make(T.frame, { a: 8, b: 5 }));
    const r = frames([...fill(8, 1), ...fill(2, 2)], fill(3, 2), 13);
    expect(checkResponse(item, r).correct).toBe(true);
    expect(detectStrategies(item, r, meta())).toEqual(['strategy.made-ten']);
    // Leaving both addends where they started is not making ten.
    expect(detectStrategies(item, frames(fill(8, 1), fill(5, 2), 13), meta())).toEqual([]);
  });

  it('the same end state from a start that does not show both addends is never praised', () => {
    const r = frames([...fill(8, 1), ...fill(2, 2)], fill(3, 2), 13);
    // Starts empty: the child places every counter, and a drop may overflow into frame 1.
    const empty = emptyStart(make(T.frame, { a: 8, b: 5 }));
    expect(checkResponse(empty, r).correct).toBe(true);
    expect(detectStrategies(empty, r, meta())).toEqual([]);
    // addsub.facts as generated: only `a` is shown, `b` is placed from the tray.
    const placed = make(T.frame, { a: 8, b: 5 });
    expect(detectStrategies(placed, r, meta())).toEqual([]);
    expect(detectStrategies(placed, itemExampleCorrect(placed), meta())).toEqual([]);
    // A start with part of b already in frame 0.
    if (placed.widget.format !== 'tenframe-fill') throw new Error('tenframe-fill');
    const wrongFrame: GeneratedItem = {
      ...placed,
      widget: {
        ...placed.widget,
        prefilled: [
          { frame: 0, color: 'a', count: 8 },
          { frame: 0, color: 'b', count: 2 },
          { frame: 1, color: 'b', count: 3 },
        ],
      },
    };
    expect(detectStrategies(wrongFrame, r, meta())).toEqual([]);
  });

  it('with counting on as well, both are praised', () => {
    const item = withAddendsShown(make(T.frame, { a: 9, b: 4 }));
    const r = frames([...fill(9, 1), 2], fill(3, 2), 13);
    expect(detectStrategies(item, r, meta(taps(9, 10, 11, 12)))).toEqual([
      'strategy.counted-on',
      'strategy.made-ten',
    ]);
  });

  it('8 + 5 on an open number line: 8 → 10 → 13, and 9 + 5 as 9 → 10 → 14', () => {
    const item = withJumps(make(T.jump, { a: 8, b: 5 }), OPEN);
    expect(detectStrategies(item, hops([2, 3], 13), meta())).toEqual(['strategy.made-ten']);
    expect(detectStrategies(item, hops([2, 1, 2], 13), meta())).toEqual(['strategy.made-ten']);
    const nine = withJumps(make(T.jump, { a: 9, b: 5 }), OPEN);
    expect(detectStrategies(nine, hops([1, 4], 14), meta())).toEqual(['strategy.made-ten']);
  });

  it.each<[string, ParamValues, ResponseValue]>([
    ['all of b in frame 1', { a: 8, b: 5 }, frames(fill(8, 1), fill(5, 2), 13)],
    [
      'frame 0 full, but a counter moved to frame 1',
      { a: 8, b: 5 },
      frames([...fill(7, 1), ...fill(3, 2)], [1, 2, 2], 13),
    ],
    [
      '7 + 3 is ten already (one frame)',
      { a: 7, b: 3 },
      { kind: 'state', value: { cells: [[...fill(7, 1), ...fill(3, 2)]], value: 10 } },
    ],
    ['10 + 3 has its ten given', { a: 10, b: 3 }, frames(fill(10, 1), fill(3, 2), 13)],
  ])('ten-frames, both addends shown, %s → no praise', (_label, params, r) => {
    const item = withAddendsShown(make(T.frame, params));
    expect(checkResponse(item, r).correct).toBe(true);
    expect(detectStrategies(item, r, meta())).toEqual([]);
  });

  it.each<[string, number[]]>([
    ['hopping by ones', [1, 1, 1, 1, 1]],
    ['the first jump passes 10', [3, 2]],
    ['the first jump stops short of 10', [1, 4]],
    ['one big jump', [5]],
  ])('open number line 8 + 5, %s → no praise', (_label, jumps) => {
    const item = withJumps(make(T.jump, { a: 8, b: 5 }), OPEN);
    expect(checkResponse(item, hops(jumps, 13)).correct).toBe(true);
    expect(detectStrategies(item, hops(jumps, 13), meta())).toEqual([]);
  });

  it('the generated number-line item (±1 hops only) never praises: every path passes 10', () => {
    const item = make(T.jump, { a: 8, b: 5 });
    const r = itemExampleCorrect(item);
    expect(checkResponse(item, r).correct).toBe(true);
    expect(detectStrategies(item, r, meta())).toEqual([]);
  });

  it('no praise for a wrong total, a wrong landing number, or counting all', () => {
    const item = withAddendsShown(make(T.frame, { a: 8, b: 5 }));
    const madeTenState = (value: number) =>
      frames([...fill(8, 1), ...fill(2, 2)], fill(3, 2), value);
    expect(detectStrategies(item, madeTenState(12), meta())).toEqual([]);
    expect(
      detectStrategies(item, frames([...fill(8, 1), ...fill(2, 2)], fill(2, 2), 12), meta()),
    ).toEqual([]);
    const all = taps(...range(0, 13));
    expect(detectStrategies(item, madeTenState(13), meta(all))).toEqual([]);
    expect(detectProcessMisconceptions(item, madeTenState(13), meta(all))).toEqual([
      'MC.count-all-instead',
    ]);
    const jump = withJumps(make(T.jump, { a: 8, b: 5 }), OPEN);
    expect(detectStrategies(jump, hops([2, 3], 12), meta())).toEqual([]);
    expect(detectStrategies(jump, hops([2, 2], 12), meta())).toEqual([]);
  });
});

describe('strategy.used-doubles', () => {
  it('6 + 7 as 6 + 6 + 1, and 7 + 6 as 7 + 7 − 1', () => {
    const up = withJumps(make(T.jump, { a: 6, b: 7 }), OPEN);
    expect(checkResponse(up, hops([6, 1], 13)).correct).toBe(true);
    expect(detectStrategies(up, hops([6, 1], 13), meta())).toEqual(['strategy.used-doubles']);
    const down = withJumps(make(T.jump, { a: 7, b: 6 }), OPEN);
    expect(checkResponse(down, hops([7, -1], 13)).correct).toBe(true);
    expect(detectStrategies(down, hops([7, -1], 13), meta())).toEqual(['strategy.used-doubles']);
  });

  it.each<[string, ParamValues, number[]]>([
    ['6 + 7 in one jump', { a: 6, b: 7 }, [7]],
    ['6 + 7 as 6 + 1 + 6', { a: 6, b: 7 }, [1, 6]],
    ['6 + 7 in three jumps', { a: 6, b: 7 }, [6, 2, -1]],
    ['6 + 6, a double, has nothing to build on', { a: 6, b: 6 }, [6]],
    ['6 + 8 is not a near double', { a: 6, b: 8 }, [6, 2]],
    ['1 + 2 is too small to tell', { a: 1, b: 2 }, [1, 1]],
  ])('number line, %s → no praise', (_label, params, jumps) => {
    const item = withJumps(make(T.jump, params), OPEN);
    const r = hops(jumps, (params.a as number) + (params.b as number));
    expect(checkResponse(item, r).correct).toBe(true);
    expect(detectStrategies(item, r, meta())).not.toContain('strategy.used-doubles');
  });

  it('ten-frames have no doubles signal: 6 + 7 is never praised for doubles', () => {
    const item = make(T.frame, { a: 6, b: 7 });
    for (const r of [
      frames(fill(6, 1), fill(7, 2), 13),
      frames([...fill(6, 1), 2], fill(6, 2), 13),
      itemExampleCorrect(item),
    ]) {
      expect(checkResponse(item, r).correct).toBe(true);
      expect(detectStrategies(item, r, meta())).not.toContain('strategy.used-doubles');
    }
  });

  it('the ADD.16 open-line worked solution jumps the double, then one more, and is praised', () => {
    const item = make(T.near, { a: 6, b: 7, op: '+', unknown: 'result', family: 'near-doubles' });
    const hopsBy = itemSolution(item, T.near)
      .map((s) => s.action)
      .filter((a) => a?.op === 'hop')
      .map((a) => a?.args?.by);
    expect(hopsBy).toEqual([6, 1]);
    const r = hops([6, 1], 13);
    expect(checkResponse(item, r).correct).toBe(true);
    expect(detectStrategies(item, r, meta())).toEqual(['strategy.used-doubles']);
  });

  it('a wrong landing number gets no praise', () => {
    const item = withJumps(make(T.jump, { a: 6, b: 7 }), OPEN);
    expect(detectStrategies(item, hops([6, 1], 12), meta())).toEqual([]);
    expect(detectStrategies(item, hops([6, 2], 14), meta())).toEqual([]);
  });
});
