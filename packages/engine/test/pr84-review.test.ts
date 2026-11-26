// Regression tests for the cross-model review of PR #84 (K01 part 7: fractions, time, data,
// patterns and puzzles), one block per finding, over the compiled catalog, plus the class sweep.

import type {
  GeneratedItem,
  ItemTemplate,
  ParamSpec,
  ParamValues,
  ResponseValue,
  StimulusSpec,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { constraintHolds } from '../src/content/expr';
import { render } from '../src/content/render';
import { patternGiven } from '../src/formats/hundred-chart';
import { registry } from '../src/generators';
import { specDomain } from '../src/generators/common';
import { groupSizes, SORT_KINDS } from '../src/generators/data/sort';
import { SHARE_SPRITES } from '../src/generators/div/share';
import { itemDens, pieceSize } from '../src/generators/frac/compare';
import { pathOrder, triangleOrder } from '../src/generators/puzzle/grid';
import { hourClass } from '../src/generators/time/clock';
import { isConstructedTemplate } from '../src/items/answer-kind';
import { checkResponse, retryFeedback } from '../src/items/check';
import {
  generateItem,
  generateItemFromParams,
  itemFeatures,
  mergedSpec,
} from '../src/items/generate';
import { itemSolution, replaySteps } from '../src/items/solution';
import { patternRestart } from '../src/misconceptions/rules/patternRestart';
import { fixtureTemplate, loadFixture } from './fixture';

const fixture = loadFixture();
const SEEDS = 200;
const items = (t: ItemTemplate, n = SEEDS): GeneratedItem[] =>
  Array.from({ length: n }, (_, k) => generateItem(t, k + 1));

/**
 * Every accepted param combination of a template's domain, with its built item. With `ownOnly`,
 * only the template's own params vary; the generator's other params (unused by the template's
 * variant) take the first value of their default domain.
 */
function domain(t: ItemTemplate, ownOnly = false): { params: ParamValues; item: GeneratedItem }[] {
  const g = registry.get(t.generator);
  if (!g) throw new Error(t.generator);
  const spec = mergedSpec(t, g);
  let combos: ParamValues[] = [{}];
  for (const [name, s] of Object.entries(spec)) {
    const all = specDomain(s as ParamSpec);
    const values = ownOnly && !(name in t.params) ? all.slice(0, 1) : all;
    combos = combos.flatMap((c) => values.map((v) => ({ ...c, [name]: v })));
    if (combos.length > 50_000) throw new Error(`${t.id}: domain too large`);
  }
  return combos.flatMap((raw) => {
    const params = { ...raw, ...g.derive(raw) };
    if (!g.accepts?.(params, t)) return [];
    if (!(t.constraints ?? []).every((c) => constraintHolds(c, params))) return [];
    return [{ params, item: generateItemFromParams(t, params) }];
  });
}

const key = (item: GeneratedItem): string => {
  if (item.answer.kind !== 'choice') throw new Error(`${item.templateId}: not a choice`);
  return item.answer.id;
};

// ---------- what the UI draws today ----------

/**
 * The stimulus kinds StimulusView draws a real picture for, from the kit's typed table
 * (packages/ui/src/widgets/kit/stimulusKinds.ts, which StimulusView's exhaustive switch and
 * stimulusKinds.test.tsx hold to the drawing). Any other kind draws a neutral placeholder card.
 * The table is loaded as a module at run time (the engine package never imports the UI, and its
 * tsconfig has no reference to it), so only what the kit really exports counts: when a widget
 * issue draws a kind, the pinned list below goes stale and its test fails until the entry goes.
 */
const KIT_KINDS_FILE = new URL('../../ui/src/widgets/kit/stimulusKinds.ts', import.meta.url).href;
const kit = (await import(/* @vite-ignore */ KIT_KINDS_FILE)) as {
  STIMULUS_KINDS: Readonly<Record<StimulusSpec['kind'], 'drawn' | 'placeholder'>>;
};
const STIMULUS_VIEW_KINDS: ReadonlySet<string> = new Set(
  Object.entries(kit.STIMULUS_KINDS).flatMap(([kind, how]) => (how === 'drawn' ? [kind] : [])),
);

/**
 * The formats with a widget in packages/ui/src/widgets/registry.ts that draw pictures through
 * StimulusView: number-pad its `stimulus`, numeral-pick also its options' `stimulus`, compare its
 * two sides and order its cards (both through kit/FitPicture.tsx, which hands every kind it does
 * not lay out itself to StimulusView). A format's later widget issue adds the kinds it needs to
 * StimulusView with it.
 */
const STIMULUS_VIEW_FORMATS = new Set(['number-pad', 'numeral-pick', 'compare', 'order']);

/**
 * Stimulus kinds on those formats that StimulusView does not draw yet, by template, each owned by
 * a later widget issue (bar models U04). Pinned so the list can only shrink, and no
 * new template may join it.
 *
 * The K01 part 7 compare and order templates (DAT.02.t4's bar charts, FRA.08.t1–t3's fraction
 * pictures) left this list when the kit drew `chart` and `fraction` (#98), and the six `shape`
 * templates (GEO.01.t3, GEO.06.t2, GEO.07.t2, GEO.08.t3, GEO.10.t3, GEO.11.t3) when it drew
 * `shape` (U05 part 1, #14).
 */
const UNDRAWN_STIMULI: Readonly<Record<string, string>> = {
  'ADD.09.t2': 'bar-model',
  'ADD.11.t3': 'bar-model',
  'ADD.12.t2': 'bar-model',
  'ADD.21.t3': 'bar-model',
};

/**
 * The sprite ids with their own drawing: the kit's `SPRITE_IDS` (the keys of the DRAWINGS registry
 * in packages/ui/src/widgets/kit/sprites.tsx), loaded as a module like the stimulus kinds above.
 * Any other id draws a pebble.
 */
const KIT_SPRITES_FILE = new URL('../../ui/src/widgets/kit/sprites.tsx', import.meta.url).href;
const DRAWN_SPRITES: ReadonlySet<string> = new Set(
  ((await import(/* @vite-ignore */ KIT_SPRITES_FILE)) as { SPRITE_IDS: readonly string[] })
    .SPRITE_IDS,
);

/**
 * Sprite ids the catalog emits that sprites.tsx does not draw yet, by template, exactly: the list
 * can only shrink (a drawn id must leave it) and no other sprite id may appear. The origin/main
 * templates predate this check (story, geometry and measurement objects the art kit has not
 * drawn). One K01 part 7 family needs art no drawn sprite can stand in for: coloured shape units
 * (the shapes representation of ALG.01 and ALG.04). The daily events of TIM.08 are drawn (#89).
 */
const UNDRAWN_SPRITES: Readonly<Record<string, readonly string[]>> = {
  'ALG.01.t2': ['circle', 'square', 'triangle'], // K01 part 7: needs art
  'ALG.04.t2': ['circle', 'square', 'triangle'], // K01 part 7: needs art
  'CPS.01.t2': ['finger'],
  'SUB.02.t1': ['finger'],
  'SUB.05.t1': ['finger'],
};

/**
 * The stimuli a StimulusView-drawn format shows: its stimulus and its options' pictures, the two
 * sides of a compare, the cards of an order.
 */
function viewStimuli(item: GeneratedItem): StimulusSpec[] {
  const w = item.widget;
  if (w.format === 'number-pad') return [w.stimulus];
  if (w.format === 'compare') return [w.left, w.right];
  if (w.format === 'order') return w.items.flatMap((i) => (i.stimulus ? [i.stimulus] : []));
  if (w.format === 'numeral-pick') {
    return [w.stimulus, ...w.options.flatMap((o) => (o.stimulus ? [o.stimulus] : []))].filter(
      (s): s is StimulusSpec => s !== undefined,
    );
  }
  return [];
}

/**
 * Every sprite id anywhere in a widget config: `sprite`, balance `object`, shape-compose `item`,
 * and the category ids of a picture graph (`ChartSpec` kind `picture`), which draw as pictures.
 */
function spriteIds(v: unknown, out: Set<string>, parent = ''): Set<string> {
  if (Array.isArray(v)) {
    for (const x of v) spriteIds(x, out, parent);
  } else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.kind === 'picture' && Array.isArray(o.categories)) {
      for (const c of o.categories as { id?: unknown }[]) {
        if (typeof c.id === 'string') out.add(c.id);
      }
    }
    for (const [k, x] of Object.entries(o)) {
      const named = k === 'sprite' || k === 'object' || (k === 'item' && parent === 'relation');
      if (named && typeof x === 'string') out.add(x);
      else if (k === 'objectWeights' && x && typeof x === 'object') {
        for (const s of Object.keys(x)) out.add(s);
      } else spriteIds(x, out, k);
    }
  }
  return out;
}

const catalog = fixture.templates.map((t) => ({ t, items: items(t, 120) }));

describe('PR #84 review (1): the DAT.02.t5 number pad shows its picture graph', () => {
  const t = fixtureTemplate('DAT.02.t5');

  it('every item draws one group of pictures per category as a scene, totalling the answer', () => {
    for (const item of items(t)) {
      if (item.widget.format !== 'number-pad') throw new Error('number-pad');
      const s = item.widget.stimulus;
      expect(s.kind).toBe('scene');
      if (s.kind !== 'scene' || item.answer.kind !== 'number') throw new Error('scene');
      const n = Number(item.params.categories);
      expect(s.sprites).toHaveLength(n);
      expect(new Set(s.sprites.map((x) => x.sprite)).size).toBe(n);
      expect(s.sprites.reduce((a, x) => a + x.count, 0)).toBe(item.answer.value);
    }
  });

  it('data.chart builds a number pad only from a picture graph', () => {
    const g = registry.get('data.chart');
    const base = { categories: 2, a: 3, b: 2, question: 'total' };
    for (const kind of ['bar', 'tally', 'table']) {
      expect(g?.accepts?.({ ...base, kind }, t), kind).toBe(false);
    }
    expect(g?.accepts?.({ ...base, kind: 'picture' }, t)).toBe(true);
  });

  it('reads the kinds StimulusView draws from the kit', () => {
    // The table covers every kind the catalog can emit, and each is drawn or a placeholder.
    for (const how of Object.values(kit.STIMULUS_KINDS)) {
      expect(['drawn', 'placeholder']).toContain(how);
    }
    for (const { items: its } of catalog) {
      for (const item of its) {
        for (const s of viewStimuli(item)) expect(kit.STIMULUS_KINDS[s.kind], s.kind).toBeDefined();
      }
    }
    // The kinds every drawn format has relied on since U03, and the two K01 part 7 needs (#98).
    for (const kind of ['none', 'objects', 'dots', 'number-line', 'expression', 'scene']) {
      expect(STIMULUS_VIEW_KINDS.has(kind), kind).toBe(true);
    }
    expect(STIMULUS_VIEW_KINDS.has('chart')).toBe(true);
    expect(STIMULUS_VIEW_KINDS.has('fraction')).toBe(true);
    // Shapes and gauges are drawn since U05 part 1 (#14).
    expect(STIMULUS_VIEW_KINDS.has('shape')).toBe(true);
    expect(STIMULUS_VIEW_KINDS.has('gauge')).toBe(true);
  });

  it('catalog: formats StimulusView draws for show only kinds it draws, or are pinned', () => {
    const seen = new Map<string, Set<string>>();
    for (const { t: tt, items: its } of catalog) {
      for (const item of its) {
        for (const s of viewStimuli(item)) {
          if (STIMULUS_VIEW_KINDS.has(s.kind)) continue;
          seen.set(tt.id, (seen.get(tt.id) ?? new Set()).add(s.kind));
        }
      }
    }
    const got = Object.fromEntries([...seen].map(([id, kinds]) => [id, [...kinds].join(' ')]));
    expect(got).toEqual(UNDRAWN_STIMULI);
    for (const id of Object.keys(UNDRAWN_STIMULI)) {
      expect(STIMULUS_VIEW_FORMATS.has(fixtureTemplate(id).format), id).toBe(true);
    }
  });
});

describe('PR #84 review (2): K01 generators emit only sprites the art kit draws', () => {
  it('the sort kinds and the shared things are drawn sprites', () => {
    for (const s of [...SORT_KINDS, ...SHARE_SPRITES]) expect(DRAWN_SPRITES.has(s), s).toBe(true);
  });

  it('catalog: every sprite id in any generated item is drawn, or pinned as undrawn', () => {
    const seen = new Map<string, Set<string>>();
    for (const { t: tt, items: its } of catalog) {
      for (const item of its) {
        for (const s of spriteIds(item.widget, new Set())) {
          if (DRAWN_SPRITES.has(s)) continue;
          seen.set(tt.id, (seen.get(tt.id) ?? new Set()).add(s));
        }
      }
    }
    const got = Object.fromEntries([...seen].map(([id, s]) => [id, [...s].sort()]));
    expect(got).toEqual(UNDRAWN_SPRITES);
    // The daily-event cards (TIM.08) are real drawings: none may fall back to a pebble.
    const events = catalog
      .filter(({ t: tt }) => tt.id.startsWith('TIM.08.'))
      .flatMap(({ items: its }) => its.flatMap((i) => [...spriteIds(i.widget, new Set())]))
      .filter((s) => s.startsWith('event-'));
    expect(new Set(events).size).toBe(5);
    for (const s of events) expect(DRAWN_SPRITES.has(s), s).toBe(true);
  });
});

/**
 * Option-set check (rule 4): group a template's domain by its sorted option set; within a set, the
 * keys seen are exactly the options, and the features are the same whichever option is the key:
 * items that differ only in `keyParams` (the params that pick the key) have the same features.
 * `optionsOf` names each option by what it shows, so a shuffled layout does not split a set.
 */
function expectKeyFreeOptions(
  t: ItemTemplate,
  optionsOf: (item: GeneratedItem) => string[],
  keyOf: (item: GeneratedItem) => string,
  keyParams: readonly string[],
): number {
  const keys = new Map<string, Set<string>>();
  const features = new Map<string, string>();
  for (const { params, item } of domain(t)) {
    const set = [...optionsOf(item)].sort();
    const k = set.join(' | ');
    const ks = keys.get(k) ?? new Set<string>();
    keys.set(k, ks.add(keyOf(item)));
    const rest = Object.entries(params).filter(([name]) => !keyParams.includes(name));
    const fk = `${k} ? ${JSON.stringify(rest)}`;
    const f = JSON.stringify(itemFeatures(item, t));
    expect(features.get(fk) ?? f, fk).toBe(f);
    features.set(fk, f);
  }
  for (const [set, ks] of keys) expect([...ks].sort().join(' | '), set).toBe(set);
  return keys.size;
}

describe('PR #84 review (3): the TIM.09.t3 hour options never give the hour away', () => {
  const t = fixtureTemplate('TIM.09.t3');
  const hourOf = (id: string) => id.replace('opt-', '');
  const optionsOf = (item: GeneratedItem): string[] => {
    if (item.widget.format !== 'clock-read') throw new Error('clock-read');
    return (item.widget.options ?? []).map((o) => hourOf(o.id));
  };

  it('hours fall into fixed runs; each run is one option set whose every member is a key', () => {
    expect(hourClass(7, 4)).toEqual([5, 6, 7, 8]);
    expect(hourClass(12, 4)).toEqual([9, 10, 11, 12]);
    expect(hourClass(1, 3)).toEqual([1, 2, 3]);
    const sets = expectKeyFreeOptions(t, optionsOf, (i) => hourOf(key(i)), ['h']);
    expect(sets).toBe(3);
  });

  it('with distractors there are four options, and the next hour is offered inside a run', () => {
    for (const { item } of domain(t)) {
      const opts = optionsOf(item).map(Number);
      expect(opts).toHaveLength(4);
      const h = Number(item.params.h);
      if (h % 4 !== 0) expect(opts).toContain(h + 1);
    }
  });
});

describe('PR #84 review (4): the FRA.01.t3 pictures are the same whatever the key', () => {
  const t = fixtureTemplate('FRA.01.t3');
  const pictures = (item: GeneratedItem): Map<string, string> => {
    if (item.widget.format !== 'fraction-pick') throw new Error('fraction-pick');
    return new Map((item.widget.options ?? []).map((o) => [o.id, JSON.stringify(o.stimulus)]));
  };

  it('every picture of a set is the key of some item; name questions share their features', () => {
    const sets = expectKeyFreeOptions(
      t,
      (i) => [...pictures(i).values()],
      (i) => pictures(i).get(key(i)) as string,
      ['den'],
    );
    // circle and rect, each with two or four unequal parts.
    expect(sets).toBe(4);
  });

  it('the unequal picture has its own part count, not den', () => {
    for (const unequalParts of [2, 4]) {
      for (const den of [2, 4]) {
        const item = generateItemFromParams(t, {
          mode: 'pick',
          shape: 'circle',
          den,
          num: 1,
          ask: 'name',
          unequalParts,
          equalParts: true,
          acceptNonCongruent: false,
        });
        const unequal = [...pictures(item).values()]
          .map((s) => JSON.parse(s) as StimulusSpec)
          .find((s) => s.kind === 'fraction' && !s.equalParts);
        expect(unequal?.kind === 'fraction' && unequal.parts).toBe(unequalParts);
      }
    }
  });
});

describe('PR #84 review (5): MUL.12 assesses dealing, never a count in one basket', () => {
  const mul = fixture.templates.filter((x) => x.skillId === 'MUL.12');

  it('div.share builds no make-set, and MUL.12 has no make-set template', () => {
    expect(registry.get('div.share')?.formats).not.toContain('make-set');
    expect(mul.map((x) => x.format)).not.toContain('make-set');
  });

  it('V27 holds: constructed MUL.12 practice in two formats, one of them pictorial', () => {
    expect(new Set(mul.map((x) => x.format))).toEqual(new Set(['equal-share', 'number-pad']));
    expect(mul.some((x) => x.tier === 'pictorial')).toBe(true);
  });

  it('every equal-share MUL.12 item checks each share, and its solution deals in rounds', () => {
    for (const tt of mul.filter((x) => x.format === 'equal-share')) {
      for (const item of items(tt, 60)) {
        if (item.answer.kind !== 'state') throw new Error('state');
        expect(item.answer.checker).toBe('share.fair');
        const steps = itemSolution(item);
        const rounds = steps.filter((s) => s.action?.op === 'deal-round').length;
        expect(rounds).toBe(Number(item.params.each));
        // One share's worth in a single pile is not a fair share of the whole.
        const each = Number(item.params.each);
        const lumped: ResponseValue = {
          kind: 'state',
          value: { shares: [Number(item.params.items)], leftover: 0, value: each },
        };
        expect(checkResponse(item, lumped).correct).toBe(false);
        expect(checkResponse(item, replaySteps(item, steps) as ResponseValue).correct).toBe(true);
      }
    }
  });
});

describe('PR #84 review (6): a sort.byRule prompt asks only what sort.byRule checks', () => {
  // Round 2 dropped the sort-only DAT.10.t1 altogether (see round 2 (1) below).
  it('catalog: no sort.byRule item asks the child to count', () => {
    for (const { t: tt, items: its } of catalog) {
      for (const item of its.slice(0, 20)) {
        if (item.answer.kind !== 'state' || item.answer.checker !== 'sort.byRule') continue;
        // Sorting by an attribute ("by how many corners") is fine; asking for a count is not.
        expect(item.prompt.text, tt.id).not.toMatch(/\bcount\b|\bhow many\b[^.]*\?/i);
      }
    }
  });

  it('the DAT.10 lesson plays the picture-graph count (t1), a template of the skill', () => {
    const lesson = fixture.skills.find((s) => s.id === 'DAT.10')?.lesson;
    expect(lesson?.templateId).toBe('DAT.10.t1');
    expect(fixtureTemplate('DAT.10.t1').skillId).toBe('DAT.10');
    expect(fixtureTemplate('DAT.10.t1').format).toBe('bar-graph-read');
  });
});

describe('PR #84 review (7): ALG.04.t3 makes exactly one more whole repeat', () => {
  const t = fixtureTemplate('ALG.04.t3');
  const g = registry.get('pattern.repeat');

  it('every draw fixes whole cores and frees exactly one core, in core order', () => {
    const all = domain(t);
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (const { params, item } of all) {
      const L = String(params.core).length;
      expect(Number(params.ask)).toBe(L);
      expect(Number(params.shown) % L).toBe(0);
      expect(Number(params.shown)).toBeGreaterThan(L);
      if (item.widget.format !== 'order') throw new Error('order');
      const fixed = new Set(Object.values(item.widget.fixed ?? {}));
      const free = item.widget.items.filter((x) => !fixed.has(x.id));
      const sprite = (x: (typeof free)[number]) =>
        x.stimulus?.kind === 'objects' ? x.stimulus.set.sprite : '';
      const firstCore = item.widget.items
        .filter((x) => x.value <= L)
        .sort((a, b) => a.value - b.value)
        .map(sprite);
      expect([...free].sort((a, b) => a.value - b.value).map(sprite)).toEqual(firstCore);
    }
  });

  it('accepts rejects a prefix that ends inside a core or a free run that is not one core', () => {
    const p = (core: string, shown: number, ask: number) => ({
      core,
      shown,
      ask,
      mode: 'core',
      theme: 0,
      coreLen: core.length,
    });
    expect(g?.accepts?.(p('ABC', 4, 2), t)).toBe(false); // A B C A, then B C
    expect(g?.accepts?.(p('ABC', 6, 2), t)).toBe(false);
    expect(g?.accepts?.(p('AB', 3, 2), t)).toBe(false);
    expect(g?.accepts?.(p('ABC', 6, 3), t)).toBe(true);
    expect(g?.accepts?.(p('AB', 4, 2), t)).toBe(true);
  });

  it('every pattern order fixes more than one core, so h.pattern.keep-going holds', () => {
    for (const tt of fixture.templates.filter(
      (x) => x.generator === 'pattern.repeat' && x.format === 'order',
    )) {
      for (const { params } of domain(tt)) {
        expect(Number(params.shown), tt.id).toBeGreaterThan(String(params.core).length);
      }
    }
  });

  it('h.pattern.keep-going never asks what came after the last unit before (AAB: A, then A or B)', () => {
    // A A B A: the last A came before the second A and before B, so that question has two answers.
    expect(render('h.pattern.keep-going')).not.toMatch(/came after it before/);
    expect(render('h.pattern.keep-going')).toMatch(/starts again/);
    for (const tt of fixture.templates.filter((x) =>
      x.narration.hints.includes('h.pattern.keep-going'),
    )) {
      // Every template using it shows the core starting again before the blanks.
      for (const { params } of domain(tt)) {
        expect(Number(params.shown), tt.id).toBeGreaterThan(String(params.core).length);
      }
    }
  });
});

describe('PR #84 review (8): time hints hold for every time a template draws', () => {
  /** Hints that only hold when the long hand is past the top (the short hand between numbers). */
  const PAST_ONLY = new Set(['h.time.between', 'h.time.just-after']);
  /** Hints that only hold at o'clock (the short hand turned onto the hour). */
  const OCLOCK_ONLY = new Set(['h.time.short-hand-set']);

  it('TIM.04 (t1–t3) renders hints true at both o’clock and half past, for every time it draws', () => {
    for (const id of ['TIM.04.t1', 'TIM.04.t2', 'TIM.04.t3']) {
      const t = fixtureTemplate(id);
      const all = domain(t);
      expect(new Set(all.map((d) => Number(d.params.m))), id).toEqual(new Set([0, 30]));
      for (const { item } of all) {
        const lines = t.narration.hints.map((h) => render(h, item.prompt.vars));
        // No line that only holds at one of the two times (h.time.between, h.time.half-past, …).
        for (const line of lines) {
          expect(line, id).not.toMatch(/^The short hand is between/);
          expect(line, id).not.toMatch(/^At half past|^At o'clock/);
        }
        expect(lines.join(' '), id).toMatch(/o'clock/);
        expect(lines.join(' '), id).toMatch(/half past/);
      }
    }
  });

  it('no clock template that draws m = 0 uses a past-only hint, nor one drawing m > 0 an o’clock one', () => {
    for (const tt of fixture.templates.filter((x) => x.generator === 'time.clock')) {
      const ms = new Set(domain(tt).map((d) => Number(d.params.m)));
      for (const h of tt.narration.hints) {
        if (ms.has(0)) expect(PAST_ONLY.has(h), `${tt.id} ${h}`).toBe(false);
        if ([...ms].some((m) => m > 0)) expect(OCLOCK_ONLY.has(h), `${tt.id} ${h}`).toBe(false);
      }
    }
  });
});

describe('PR #84 review (9): an order retry line points the way the order goes', () => {
  const first = (id: string) => generateItem(fixtureTemplate(id), 1);

  it('descending FRA.08 orders find the biggest pieces first; ascending DAT.10.t3 the smallest', () => {
    // Round 2: fraction pieces have their own line, since on a part-count card (FRA.08.t4) the
    // biggest number is the smallest piece.
    for (const id of ['FRA.08.t3', 'FRA.08.t4']) {
      expect(retryFeedback(first(id))).toBe('fb.order.retry-pieces');
    }
    expect(render('fb.order.retry-pieces')).toMatch(/biggest pieces/);
    expect(render('fb.order.retry-desc')).toMatch(/biggest/);
    expect(retryFeedback(first('DAT.10.t3'))).toBe('fb.order.retry');
    expect(render('fb.order.retry')).toMatch(/smallest/);
  });

  it('pattern cards and daily events get their own line, not a size one', () => {
    for (const id of ['ALG.01.t3', 'ALG.04.t3']) {
      expect(retryFeedback(first(id))).toBe('fb.order.retry-pattern');
    }
    for (const id of ['TIM.08.t2', 'TIM.08.t3']) {
      expect(retryFeedback(first(id))).toBe('fb.order.retry-day');
    }
  });

  it('checkResponse uses it for a wrong order no misconception explains', () => {
    const item = first('DAT.10.t3');
    if (item.answer.kind !== 'numbers') throw new Error('numbers');
    const v = item.answer.values;
    const wrong: ResponseValue = { kind: 'numbers', values: [...v.slice(1), v[0] as number] };
    const r = checkResponse(item, wrong);
    expect(r.correct).toBe(false);
    if (r.misconceptionIds.length === 0) expect(r.feedback).toBe('fb.order.retry');
    for (const tt of fixture.templates.filter((x) => x.format === 'order')) {
      for (const it of items(tt, 20)) {
        if (it.widget.format !== 'order') throw new Error('order');
        if (it.widget.direction === 'desc')
          expect(retryFeedback(it), tt.id).not.toBe('fb.order.retry');
      }
    }
  });
});

/** The templates new in K01 part 7 (PR #84): the DAT, FRA, TIM, ALG, MUL and PUZ strands and CPS.06. */
const PART7 = /^(DAT|FRA|TIM|ALG|MUL|PUZ)\.|^CPS\.06\./;

/**
 * What a choice item offers, named by what each option shows (so a shuffled layout does not split
 * a set), with the key's name; null when the format's choices are a fixed pair (yes / no, or the
 * compare sides), which cannot depend on the key.
 */
function shownOptions(item: GeneratedItem): { options: string[]; key: string } | null {
  if (item.answer.kind !== 'choice') return null;
  const id = item.answer.id;
  const w = item.widget;
  const named = (opts: { id: string; label?: string; stimulus?: unknown }[]) => {
    const name = (o: (typeof opts)[number]) => JSON.stringify(o.stimulus ?? o.label ?? o.id);
    const key = opts.find((o) => o.id === id);
    if (!key) throw new Error(`${item.templateId}: the key ${id} is not an option`);
    return { options: opts.map(name), key: name(key) };
  };
  if ((w.format === 'clock-read' || w.format === 'fraction-pick') && w.options?.length) {
    return named(w.options);
  }
  if (w.format === 'numeral-pick') return named(w.options);
  if (w.format === 'bar-graph-read') return named(w.question.categories.map((c) => ({ id: c })));
  return null;
}

describe('PR #84 review: class sweep', () => {
  it('K01 part 7 option sets: every option of a set is the key of some item (findings 3, 4)', () => {
    // A seed sweep (TIM.09.t3 and FRA.01.t3 enumerate their whole domains above).
    let checked = 0;
    for (const { t, items: sample } of catalog) {
      if (!PART7.test(t.id) || !sample.some((i) => shownOptions(i))) continue;
      const keys = new Map<string, Set<string>>();
      for (const item of items(t, 400)) {
        const o = shownOptions(item);
        if (!o) continue;
        const set = [...o.options].sort().join(' | ');
        keys.set(set, (keys.get(set) ?? new Set()).add(o.key));
      }
      for (const [set, ks] of keys) expect([...ks].sort().join(' | '), `${t.id}: ${set}`).toBe(set);
      if (keys.size > 0) checked += 1;
    }
    // TIM.09.t3, FRA.01.t3 and the most / least reads DAT.02.t3, DAT.09.t3 and DAT.10.t2.
    expect(checked).toBe(5);
  });

  it('PUZ.02 corner hint holds when no corner is blank', () => {
    expect(render('h.puzzle.corner-two')).not.toMatch(/Find it/);
  });

  it('DAT.09.t2 (counts from 1) has no bundle-of-five hint', () => {
    expect(fixtureTemplate('DAT.09.t2').narration.hints).not.toContain('h.data.count-by-five');
  });

  it('ALG.02 grow hint holds for any number of asked terms', () => {
    expect(render('h.pattern.grow-same')).not.toMatch(/once more/);
  });

  it('ALG.01.t2 (fill: the gap ends before the last token) has no look-at-the-last hint', () => {
    expect(fixtureTemplate('ALG.01.t2').narration.hints).not.toContain('h.pattern.keep-going');
  });

  it('the bar-tops hint holds for fewer, least and equal bars', () => {
    expect(render('h.data.bar-tops')).not.toMatch(/taller\?/);
  });

  it('CPS.06.t3 says "the next way" once per way', () => {
    for (const item of items(fixtureTemplate('CPS.06.t3'), 30)) {
      const steps = itemSolution(item).filter((s) => s.action?.op === 'fill');
      const next = steps.filter((s) => s.say === 'gen.puzzle.grid.ways-next');
      const cols = new Set(
        next.map((s) => (s.action?.args as { c?: number } | undefined)?.c ?? -1),
      );
      expect([...cols]).toEqual([0]);
    }
  });

  it('TIM.08.t1 cards do not carry their own bin', () => {
    for (const item of items(fixtureTemplate('TIM.08.t1'), 30)) {
      if (item.widget.format !== 'shape-sort') throw new Error('shape-sort');
      for (const c of item.widget.cards) expect(c.card).not.toHaveProperty('isPm');
    }
  });

  it('TIM.08.t3 day-strip hint holds when the fixed event is first', () => {
    expect(render('h.time.day-strip')).not.toMatch(/before it\?/);
  });
});

describe('PR #84 review (7b): MC.pattern-restart skips "make the next repeat" orders', () => {
  it('restarting is the answer on ALG.04.t3, so the rule does not apply there', () => {
    for (const item of items(fixtureTemplate('ALG.04.t3'), 30)) {
      expect(patternRestart.applies?.(item)).toBe(false);
    }
    expect(items(fixtureTemplate('ALG.01.t3'), 30).every((i) => patternRestart.applies?.(i))).toBe(
      true,
    );
  });
});

// ---------- review round 2 ----------

/** A skill's evidence templates: its constructed-answer ones (04 §7a, V27). */
const evidence = (skillId: string): ItemTemplate[] =>
  fixture.templates.filter((t) => t.skillId === skillId && isConstructedTemplate(t));

/** The 04 §3 standard variety rule (V27) on a set of evidence templates. */
const meetsStandardVariety = (ev: ItemTemplate[]): boolean =>
  (new Set(ev.map((t) => t.format)).size >= 2 || new Set(ev.map((t) => t.tier)).size >= 2) &&
  ev.some((t) => t.tier !== 'concrete');

/**
 * Skills whose constructed practice includes a sort (`sort.byRule`): each one's skill is sorting or
 * classifying (by kind or attribute, shape names, flat or solid, sides and corners, what can be
 * measured, heavier or lighter than a named object, morning or night), so a sort is evidence of
 * it. Pinned, so a sort cannot become evidence for a counting or ordering skill again.
 */
const SORTING_SKILLS = [
  'DAT.01',
  'GEO.01',
  'GEO.06',
  'GEO.07',
  'GEO.08',
  'MEA.15',
  'MEA.16',
  'TIM.08',
];

describe('PR #84 review round 2 (1): every DAT.10 evidence item counts or orders the groups', () => {
  const ev = evidence('DAT.10');

  it('each constructed DAT.10 item answers a group count or the counts in order, never a sort', () => {
    expect(ev.map((t) => t.id)).toEqual(['DAT.10.t1', 'DAT.10.t3']);
    for (const t of ev) {
      for (const item of items(t, 150)) {
        const a = item.answer;
        expect(a.kind === 'state' && a.checker === 'sort.byRule', t.id).toBe(false);
        if (a.kind === 'number') {
          expect(a.value, t.id).toBe(Number(item.params.a));
        } else if (a.kind === 'numbers') {
          expect(a.ordered, t.id).toBe(true);
          expect(a.values, t.id).toEqual(groupSizes(item.params).sort((x, y) => x - y));
        } else {
          throw new Error(`${t.id}: ${a.kind}`);
        }
      }
    }
  });

  it('DAT.10 has no shape-sort, and its counts and orders alone meet V27', () => {
    const all = fixture.templates.filter((t) => t.skillId === 'DAT.10');
    expect(all.map((t) => t.format)).not.toContain('shape-sort');
    expect(meetsStandardVariety(ev)).toBe(true);
    const lesson = fixture.skills.find((s) => s.id === 'DAT.10')?.lesson;
    expect(lesson?.testOut.templateIds).toEqual(['DAT.10.t1', 'DAT.10.t3']);
  });

  it('catalog: a sort is evidence only for a sorting skill', () => {
    const skills = new Set<string>();
    for (const { t, items: its } of catalog) {
      const a = its[0]?.answer;
      if (isConstructedTemplate(t) && a?.kind === 'state' && a.checker === 'sort.byRule') {
        skills.add(t.skillId);
      }
    }
    expect([...skills].sort()).toEqual(SORTING_SKILLS);
  });
});

describe('PR #84 review round 2 (2): every FRA.08 evidence item compares differently cut wholes', () => {
  const ev = evidence('FRA.08');
  /** The part count an order card shows: its fraction picture's parts, or its label. */
  const cardParts = (card: { stimulus?: StimulusSpec; label?: string }): number =>
    card.stimulus?.kind === 'fraction' ? card.stimulus.parts : Number(card.label);

  it('each constructed FRA.08 item orders 2–3 wholes cut into different part counts', () => {
    expect(ev.map((t) => t.id)).toEqual(['FRA.08.t3', 'FRA.08.t4']);
    for (const t of ev) {
      for (const { params, item } of domain(t)) {
        if (item.widget.format !== 'order' || item.answer.kind !== 'numbers') {
          throw new Error(`${t.id}: not an order`);
        }
        const dens = itemDens(params);
        expect(dens.length, t.id).toBeGreaterThanOrEqual(2);
        expect(new Set(dens).size, t.id).toBe(dens.length);
        const shown = item.widget.items.map(cardParts).sort((x, y) => x - y);
        expect(shown, t.id).toEqual([...dens].sort((x, y) => x - y));
        expect(item.answer.values, t.id).toEqual(dens.map(pieceSize).sort((x, y) => y - x));
      }
    }
  });

  it('no FRA.08 template cuts one shape; its compares are choices; the orders alone meet V27', () => {
    const all = fixture.templates.filter((t) => t.skillId === 'FRA.08');
    expect(all.map((t) => t.format)).not.toContain('fraction-cut');
    for (const t of all.filter((x) => x.format === 'compare')) {
      expect(isConstructedTemplate(t), t.id).toBe(false);
    }
    expect(new Set(ev.map((t) => t.tier))).toEqual(new Set(['pictorial', 'abstract']));
    expect(meetsStandardVariety(ev)).toBe(true);
  });

  it('the abstract cards (t4) show only the part count; the strips (t3) only pictures', () => {
    for (const item of items(fixtureTemplate('FRA.08.t4'), 60)) {
      if (item.widget.format !== 'order') throw new Error('order');
      for (const c of item.widget.items) {
        expect(c.stimulus).toBeUndefined();
        expect(c.label).toMatch(/^[2-8]$/);
      }
    }
    for (const item of items(fixtureTemplate('FRA.08.t3'), 60)) {
      if (item.widget.format !== 'order') throw new Error('order');
      for (const c of item.widget.items) {
        expect(c.label).toBeUndefined();
        expect(c.stimulus?.kind).toBe('fraction');
      }
    }
  });

  it('the lesson is the auto choice (the concrete compare); the test-out is both orders', () => {
    const lesson = fixture.skills.find((s) => s.id === 'FRA.08')?.lesson;
    expect(lesson?.templateId).toBe('FRA.08.t1');
    expect(fixtureTemplate('FRA.08.t1').tier).toBe('concrete');
    expect(lesson?.testOut.templateIds).toEqual(['FRA.08.t3', 'FRA.08.t4']);
  });
});

/** A puzzle-grid item's response grid with only its givens filled. */
function givenGrid(item: GeneratedItem): (number | '')[][] {
  const w = item.widget;
  if (w.format !== 'puzzle-grid') throw new Error('puzzle-grid');
  const g: (number | '')[][] = Array.from({ length: w.rows }, () =>
    new Array<number | ''>(w.cols).fill(''),
  );
  for (const c of w.cells)
    if (!c.blank && typeof c.given === 'number') (g[c.r] as unknown[])[c.c] = c.given;
  return g;
}

type FillArgs = { r: number; c: number; value: number };
const isBlankCell = (g: (number | '')[][], r: number, c: number) => g[r]?.[c] === '';

describe('PR #84 review round 2 (3): puzzle solutions fill in dependency order', () => {
  const puzzles = fixture.templates.filter(
    (t) => t.generator === 'puzzle.grid' && t.format === 'puzzle-grid',
  );
  const ofVariant = (v: string) =>
    puzzles.filter((t) => {
      const w = generateItem(t, 1).widget;
      return w.format === 'puzzle-grid' && w.variant === v;
    });

  it('sum triangles: every fill follows a step naming a side with exactly that one cell open', () => {
    const triangles = ofVariant('sum-triangle');
    expect(triangles.map((t) => t.id)).toEqual(['PUZ.02.t1', 'PUZ.02.t3']);
    let chains = 0;
    for (const t of triangles) {
      for (const { item } of domain(t, true)) {
        const w = item.widget;
        if (w.format !== 'puzzle-grid') throw new Error('puzzle-grid');
        const g = givenGrid(item);
        const steps = itemSolution(item);
        let named: number | null = null;
        steps.forEach((s, k) => {
          if (s.action?.op === 'check-line') {
            const index = (s.action.args as { index: number }).index;
            const line = w.constraints[index];
            if (line?.kind !== 'line-sum') throw new Error(`${t.id}: line ${index}`);
            const open = line.cells.filter(([r, c]) => isBlankCell(g, r, c));
            expect(open.length, `${t.id} step ${k}`).toBe(1);
            named = index;
            return;
          }
          if (s.action?.op !== 'fill') return;
          const { r, c, value } = s.action.args as FillArgs;
          expect(named, `${t.id} step ${k}: a fill with no side named first`).not.toBeNull();
          const line = w.constraints[named ?? -1];
          if (line?.kind !== 'line-sum') throw new Error('line-sum');
          expect(line.cells.some(([lr, lc]) => lr === r && lc === c)).toBe(true);
          expect(isBlankCell(g, r, c)).toBe(true);
          // The side's sum less the numbers it already shows is exactly this cell.
          const known = line.cells
            .filter(([lr, lc]) => lr !== r || lc !== c)
            .reduce((sum, [lr, lc]) => sum + Number(g[lr]?.[lc]), 0);
          expect(value, `${t.id} step ${k}`).toBe(line.sum - known);
          (g[r] as (number | '')[])[c] = value;
          named = null;
          // Only the last step completes the grid (no earlier step gives the answer away).
          const open = w.cells.filter((x) => isBlankCell(g, x.r, x.c)).length;
          expect(open === 0, `${t.id} step ${k}`).toBe(k === steps.length - 1);
        });
        const r = checkResponse(item, { kind: 'state', value: { fill: g } });
        expect(r.correct, `${t.id} ${JSON.stringify(item.params)}`).toBe(true);
        if (item.params.blankSet === 'chain' || item.params.blankSet === 'corner-middle')
          chains += 1;
      }
    }
    expect(chains).toBeGreaterThan(0);
    // The sweep covers the whole parameter domain of both templates (thousands of expectations).
    // It ran 5.2 s on a loaded CI runner, over the default 5 s limit, so it gets its own budget.
  }, 30_000);

  it('the PUZ.02.t3 chain finds the corner from its solved side before the side it completes', () => {
    // chain: T, L, B blank. The left side (T, L, BL) has two open, so the right side (T, R, BR)
    // gives T first; then the left side has one open and gives L; the bottom side gives B. Filling
    // in cell order (T, L, B) filled T while the side that explains it was never shown.
    expect(triangleOrder(['T', 'L', 'B'])).toEqual([
      { side: 1, spot: 'T' },
      { side: 0, spot: 'L' },
      { side: 2, spot: 'B' },
    ]);
    expect(triangleOrder(['T', 'B'])).toEqual([
      { side: 0, spot: 'T' },
      { side: 2, spot: 'B' },
    ]);
    const chain = domain(fixtureTemplate('PUZ.02.t3'), true).find(
      (d) => d.params.blankSet === 'chain',
    );
    if (!chain) throw new Error('PUZ.02.t3 draws no chain');
    const ops = itemSolution(chain.item).map((s) => s.action?.op);
    expect(ops[0]).toBe('check-line');
    expect(ops.filter((op) => op === 'check-line')).toHaveLength(3);
    expect(ops.at(-1)).toBe('fill');
  });

  it('number paths: every fill is next to a known cell on the path and one step from it', () => {
    const paths = ofVariant('number-path');
    expect(paths.map((t) => t.id)).toEqual(['PUZ.01.t1']);
    for (const item of items(paths[0] as ItemTemplate, 400)) {
      if (item.answer.kind !== 'state') throw new Error('state');
      const path = item.answer.target.cells as [number, number][];
      const g = givenGrid(item);
      const steps = itemSolution(item);
      steps.forEach((s, k) => {
        if (s.action?.op !== 'fill') return;
        const { r, c, value } = s.action.args as FillArgs;
        const i = path.findIndex(([pr, pc]) => pr === r && pc === c);
        const near = [path[i - 1], path[i + 1]].filter(
          (p): p is [number, number] => p !== undefined && !isBlankCell(g, p[0], p[1]),
        );
        expect(near.length, `seed ${item.seed} step ${k}`).toBeGreaterThan(0);
        for (const [pr, pc] of near) expect(Math.abs(Number(g[pr]?.[pc]) - value)).toBe(1);
        (g[r] as (number | '')[])[c] = value;
      });
      expect(checkResponse(item, { kind: 'state', value: { fill: g } }).correct).toBe(true);
    }
  });

  it('pathOrder counts on after a given and back before the first one', () => {
    // blanks at 0, 1, 4, 5; givens at 2, 3
    expect(pathOrder([true, true, false, false, true, true])).toEqual([4, 5, 1, 0]);
    expect(pathOrder([false, true, true])).toEqual([1, 2]);
  });

  it('every puzzle-grid number solution replays to a correct grid', () => {
    for (const t of puzzles) {
      for (const item of items(t, 60)) {
        const w = item.widget;
        if (w.format !== 'puzzle-grid' || w.variant === 'shape-fill') continue;
        const g = givenGrid(item);
        for (const s of itemSolution(item)) {
          if (s.action?.op !== 'fill') continue;
          const { r, c, value } = s.action.args as FillArgs;
          (g[r] as (number | '')[])[c] = value;
        }
        expect(checkResponse(item, { kind: 'state', value: { fill: g } }).correct, t.id).toBe(true);
      }
    }
  });
});

describe('PR #84 review round 2 (4): picture-graph number pads name groups, not rows', () => {
  it('no DAT number-pad hint names a row', () => {
    const pads = fixture.templates.filter(
      (t) => t.skillId.startsWith('DAT.') && t.format === 'number-pad',
    );
    expect(pads.length).toBeGreaterThan(0);
    for (const t of pads) {
      for (const item of items(t, 20)) {
        for (const h of t.narration.hints) {
          expect(render(h, item.prompt.vars), `${t.id} ${h}`).not.toMatch(/\brows?\b/i);
        }
      }
    }
  });

  it('catalog: no number pad drawn as a scene (wrapped groups) has a row hint', () => {
    let scenes = 0;
    for (const { t, items: its } of catalog) {
      const item = its[0];
      if (item?.widget.format !== 'number-pad' || item.widget.stimulus.kind !== 'scene') continue;
      scenes += 1;
      for (const h of t.narration.hints) {
        expect(render(h, item.prompt.vars), `${t.id} ${h}`).not.toMatch(/\brows?\b/i);
      }
    }
    expect(scenes).toBeGreaterThan(0);
  });
});

describe('PR #84 review round 2: class sweep', () => {
  it('a fraction-cut with the cut-middle hint cuts the middle first, then each half', () => {
    // Sweep (solution order): FRA.01.t2 cut a strip into fourths at line 0, 1, 2 while its hint
    // said to cut down the middle first.
    let checked = 0;
    for (const t of fixture.templates.filter(
      (x) => x.format === 'fraction-cut' && x.narration.hints.includes('h.frac.cut-middle'),
    )) {
      for (const item of items(t, 60)) {
        const steps = itemSolution(item).filter((s) => s.action?.op === 'cut');
        expect(steps[0]?.say, t.id).toBe('gen.frac.partition.cut-middle');
        if (item.widget.format === 'fraction-cut' && item.widget.shape === 'bar') {
          const lines = steps.map((s) => (s.action?.args as { line?: number } | undefined)?.line);
          // A strip's lines run left to right: the middle of n − 1 lines is line (n − 2) / 2.
          expect(lines[0], t.id).toBe((item.widget.parts - 2) / 2);
          expect([...lines].sort()).toEqual(lines.map((_, i) => i));
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('K01 part 7 difficulty: every template median is within ±0.15 of 0 (rule 8)', () => {
    // Sweep: ALG.04.t3 sat at −0.6 and DAT.10.t3 at 0.16. PUZ.03.t2 (−0.4) is on origin/main.
    const ON_MAIN = new Set(['PUZ.03.t1', 'PUZ.03.t2']);
    for (const { t, items: its } of catalog) {
      if (!PART7.test(t.id) || ON_MAIN.has(t.id)) continue;
      const d = its.map((i) => i.difficulty).sort((a, b) => a - b);
      const median = d[Math.floor(d.length / 2)] as number;
      expect(Math.abs(median), `${t.id} median ${median}`).toBeLessThanOrEqual(0.15 + 1e-9);
    }
  });
});

describe('PR #84 review round 3: the abstract FRA.08 order states what makes it unique', () => {
  it('the part-count prompt says the strips are the same size and cut into equal parts', () => {
    // A number alone settles the order only for same-size wholes cut into equal parts: a long
    // strip's fourths can be bigger than a short strip's halves.
    const t = fixtureTemplate('FRA.08.t4');
    const text = fixture.narration[t.narration.prompt]?.text ?? '';
    expect(text).toMatch(/same size/i);
    expect(text).toMatch(/equal parts/i);
    expect(text).toMatch(/how many/i);
  });

  it('every FRA.08.t4 item is cards of part counts, ordered biggest piece first', () => {
    const t = fixtureTemplate('FRA.08.t4');
    for (let seed = 1; seed <= 60; seed += 1) {
      const item = generateItemFromParams(t, generateItem(t, seed).params);
      if (item.widget.format !== 'order') throw new Error('order');
      expect(item.widget.direction, t.id).toBe('desc');
    }
  });
});

describe('PR #84 review, fresh round 1: no line claims a picture the widget does not draw', () => {
  const lines = (t: ItemTemplate, item: GeneratedItem): string[] => [
    item.prompt.text,
    ...t.narration.hints.map((h) => render(h, item.prompt.vars)),
  ];

  // The hundred chart now gives a pattern's terms (`patternShown`), so the prompt may say so:
  // the chart must give exactly the terms the prompt names, and none of the asked ones.
  it('ALG.02.t1 says the chart shows its three terms, and the chart gives exactly those', () => {
    const t = fixtureTemplate('ALG.02.t1');
    for (const item of items(t)) {
      const w = item.widget;
      if (w.format !== 'hundred-chart') throw new Error('hundred-chart');
      const start = Number(w.patternStart);
      const step = Number(w.patternStep);
      const terms = [start, start + step, start + 2 * step];
      expect(patternGiven(w)).toEqual(terms);
      expect(item.prompt.text).toMatch(
        new RegExp(
          `^The chart shows ${terms.join(', ')}\\. Tap the next \\d numbers in the pattern\\.$`,
        ),
      );
      const a = item.answer;
      if (a.kind !== 'state') throw new Error('state');
      const asked = a.target.values as number[];
      expect(asked.filter((v) => terms.includes(v))).toEqual([]);
      expect(asked[0]).toBe(start + 3 * step);
    }
  });

  it('catalog: a line says a pattern chart shows terms only when the chart gives terms', () => {
    let seen = 0;
    let claimed = 0;
    for (const { t, items: its } of catalog) {
      for (const item of its) {
        if (item.widget.format !== 'hundred-chart' || item.widget.mode !== 'pattern') continue;
        seen += 1;
        const given = patternGiven(item.widget);
        for (const line of lines(t, item)) {
          if (!/chart shows|shaded|colou?red|marked|ringed/i.test(line)) continue;
          claimed += 1;
          expect(given.length, t.id).toBeGreaterThan(0);
        }
        // Every given term is named in the prompt: the chart and the words say the same thing.
        for (const g of given) expect(item.prompt.text, t.id).toMatch(new RegExp(`\\b${g}\\b`));
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(claimed).toBeGreaterThan(0);
  });

  it('catalog: a number bond draws a whole and two parts, so no line points at a drawn side', () => {
    let seen = 0;
    for (const { t, items: its } of catalog) {
      if (t.format !== 'number-bond') continue;
      for (const item of its) {
        seen += 1;
        for (const line of lines(t, item)) {
          expect(line, t.id).not.toMatch(/this side|that side|you see on/i);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(fixtureTemplate('PUZ.02.t2').narration.hints).not.toContain('h.puzzle.side-add');
  });
});
