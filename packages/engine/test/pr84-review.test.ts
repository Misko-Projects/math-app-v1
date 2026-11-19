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
import { registry } from '../src/generators';
import { specDomain } from '../src/generators/common';
import { SORT_KINDS } from '../src/generators/data/sort';
import { SHARE_SPRITES } from '../src/generators/div/share';
import { hourClass } from '../src/generators/time/clock';
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

/** Every accepted param combination of a template's domain, with its built item. */
function domain(t: ItemTemplate): { params: ParamValues; item: GeneratedItem }[] {
  const g = registry.get(t.generator);
  if (!g) throw new Error(t.generator);
  const spec = mergedSpec(t, g);
  let combos: ParamValues[] = [{}];
  for (const [name, s] of Object.entries(spec)) {
    const values = specDomain(s as ParamSpec);
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

// ---------- what the UI draws today (copied; keep in step with the files named) ----------

/**
 * The stimulus kinds packages/ui/src/widgets/kit/StimulusView.tsx has a `case` for. Any other kind
 * draws a neutral placeholder card.
 */
const STIMULUS_VIEW_KINDS = new Set([
  'none',
  'objects',
  'dots',
  'ten-frame',
  'rekenrek',
  'number-line',
  'number-bond',
  'expression',
  'groups',
  'array',
  'base-ten',
  'scene',
]);

/**
 * The formats with a widget in packages/ui/src/widgets/registry.ts; both draw their `stimulus`
 * (and numeral-pick its options' `stimulus`) through StimulusView. A format's later widget issue
 * adds the kinds it needs to StimulusView with it.
 */
const STIMULUS_VIEW_FORMATS = new Set(['number-pad', 'numeral-pick']);

/**
 * Stimulus kinds on those formats that StimulusView does not draw yet, by template. All are on
 * origin/main and owned by later widget issues (bar models U04, shapes U05); pinned so the list
 * can only shrink, and no new template may join it.
 */
const UNDRAWN_STIMULI: Readonly<Record<string, string>> = {
  'ADD.09.t2': 'bar-model',
  'ADD.11.t3': 'bar-model',
  'ADD.12.t2': 'bar-model',
  'ADD.21.t3': 'bar-model',
  'GEO.01.t3': 'shape',
  'GEO.06.t2': 'shape',
  'GEO.07.t2': 'shape',
  'GEO.10.t3': 'shape',
  'GEO.11.t3': 'shape',
};

/** The DRAWINGS keys of packages/ui/src/widgets/kit/sprites.tsx; any other id draws a pebble. */
const DRAWN_SPRITES = new Set([
  'shell',
  'fish',
  'starfish',
  'crab',
  'leaf',
  'stone',
  'pebble',
  'stick',
  'plank',
  'firefly',
  'counter',
]);

/**
 * Sprite ids the catalog emits that sprites.tsx does not draw yet, by template. The origin/main
 * templates predate this check (story, geometry and measurement objects the art kit has not
 * drawn). Two K01 part 7 families need art no drawn sprite can stand in for: daily events
 * (TIM.08 order cards) and coloured shape units (the shapes representation of ALG.01 and
 * ALG.04). Pinned so the list can only shrink; any other new sprite id fails.
 */
const UNDRAWN_SPRITES: Readonly<Record<string, readonly string[]>> = {
  'ADD.12.t1': ['lantern'],
  'ADD.20.t3': ['lantern'],
  'ADD.21.t2': ['lantern'],
  'ADD.25.t2': ['lantern'],
  'ALG.01.t2': ['circle', 'square', 'triangle'], // K01 part 7: needs art
  'ALG.04.t2': ['circle', 'square', 'triangle'], // K01 part 7: needs art
  'CMP.01.t4': ['dot'],
  'CMP.01.t5': ['dot'],
  'CMP.05.t3': ['dot'],
  'CMP.13.t5': ['dot'],
  'CPS.01.t2': ['finger'],
  'GEO.05.t1': ['apple', 'bun', 'crate', 'jug', 'kite', 'lantern', 'pallet', 'sack'],
  'GEO.05.t3': ['apple', 'bun', 'crate', 'jug', 'kite', 'lantern', 'pallet', 'sack'],
  'GEO.07.t1': ['ball', 'block', 'can', 'dice', 'drum', 'ice-cream', 'orange', 'party-hat'],
  'GEO.07.t3': ['ball', 'block', 'can', 'dice', 'drum', 'ice-cream', 'orange', 'party-hat'],
  'MEA.01.t1': ['log', 'ribbon', 'rope', 'vine'],
  'MEA.01.t2': ['log', 'ribbon', 'rope', 'vine'],
  'MEA.01.t4': ['log', 'ribbon', 'rope', 'vine'],
  'MEA.02.t1': ['log', 'ribbon', 'rope', 'vine'],
  'MEA.02.t2': ['cube'],
  'MEA.07.t1': ['log', 'ribbon', 'rope', 'vine'],
  'MEA.07.t2': ['log', 'ribbon', 'rope', 'vine'],
  'MEA.15.t1': [
    'anchor',
    'balloon',
    'barrel',
    'button',
    'crate',
    'cup',
    'feather',
    'fishing-rod',
    'kite',
    'log',
    'ribbon',
    'rock',
    'rope',
    'spoon',
    'thimble',
  ],
  'MEA.15.t2': [
    'anchor',
    'balloon',
    'barrel',
    'bucket',
    'button',
    'crate',
    'cup',
    'feather',
    'fishing-rod',
    'jug',
    'kite',
    'log',
    'ribbon',
    'rock',
    'rope',
    'spoon',
    'thimble',
    'tub',
  ],
  'MEA.15.t3': [
    'anchor',
    'balloon',
    'button',
    'crate',
    'cup',
    'feather',
    'fishing-rod',
    'kite',
    'log',
    'ribbon',
    'rock',
    'rope',
    'spoon',
    'thimble',
  ],
  'MEA.15.t4': [
    'anchor',
    'balloon',
    'barrel',
    'bucket',
    'button',
    'crate',
    'cup',
    'feather',
    'fishing-rod',
    'jug',
    'kite',
    'log',
    'ribbon',
    'rock',
    'rope',
    'spoon',
    'thimble',
    'tub',
  ],
  'MEA.16.t1': ['apple', 'brick', 'coconut', 'feather', 'melon', 'pumpkin', 'rock'],
  'MEA.16.t2': ['apple', 'brick', 'coconut', 'feather', 'melon', 'pumpkin', 'rock'],
  'MEA.16.t3': ['apple', 'brick', 'feather', 'melon', 'pumpkin'],
  'MEA.16.t4': ['brick', 'coconut', 'feather', 'melon', 'pumpkin', 'rock'],
  'MEA.22.t1': ['log', 'ribbon', 'rope', 'vine'],
  'MEA.22.t2': ['cube'],
  'MEA.22.t3': ['log', 'ribbon', 'rope', 'vine'],
  'SUB.02.t1': ['finger'],
  'SUB.05.t1': ['finger'],
  'TIM.08.t2': ['event-bedtime', 'event-breakfast', 'event-dinner', 'event-lunch', 'event-wake-up'], // K01 part 7: needs art
  'TIM.08.t3': ['event-bedtime', 'event-breakfast', 'event-dinner', 'event-lunch', 'event-wake-up'], // K01 part 7: needs art
};

/** The stimuli a StimulusView-drawn format shows: its stimulus and its options' pictures. */
function viewStimuli(item: GeneratedItem): StimulusSpec[] {
  const w = item.widget;
  if (w.format === 'number-pad') return [w.stimulus];
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

  it('every item draws one row of pictures per category as a scene, totalling the answer', () => {
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

  it('catalog: number-pad and numeral-pick only show stimulus kinds StimulusView draws', () => {
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
    for (const [id, sprites] of Object.entries(got)) {
      const pinned = new Set(UNDRAWN_SPRITES[id] ?? []);
      for (const s of sprites) expect(pinned.has(s), `${id} emits ${s}`).toBe(true);
    }
    for (const id of Object.keys(UNDRAWN_SPRITES)) expect(got[id], `${id} is stale`).toBeDefined();
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

describe('PR #84 review (6): the DAT.10.t1 prompt asks only what sort.byRule checks', () => {
  it('DAT.10.t1 asks to sort, not to count', () => {
    const item = generateItem(fixtureTemplate('DAT.10.t1'), 1);
    expect(item.prompt.text).not.toMatch(/count|how many/i);
  });

  it('catalog: no sort.byRule item asks the child to count', () => {
    for (const { t: tt, items: its } of catalog) {
      for (const item of its.slice(0, 20)) {
        if (item.answer.kind !== 'state' || item.answer.checker !== 'sort.byRule') continue;
        // Sorting by an attribute ("by how many corners") is fine; asking for a count is not.
        expect(item.prompt.text, tt.id).not.toMatch(/\bcount\b|\bhow many\b[^.]*\?/i);
      }
    }
  });

  it('the DAT.10 lesson plays the picture-graph count (t2), a template of the skill', () => {
    const lesson = fixture.skills.find((s) => s.id === 'DAT.10')?.lesson;
    expect(lesson?.templateId).toBe('DAT.10.t2');
    expect(fixtureTemplate('DAT.10.t2').skillId).toBe('DAT.10');
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

  it('descending FRA.08.t4 finds the biggest first; ascending DAT.10.t4 the smallest', () => {
    expect(retryFeedback(first('FRA.08.t4'))).toBe('fb.order.retry-desc');
    expect(render('fb.order.retry-desc')).toMatch(/biggest/);
    expect(retryFeedback(first('DAT.10.t4'))).toBe('fb.order.retry');
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
    const item = first('DAT.10.t4');
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
    // TIM.09.t3, FRA.01.t3 and the most / least reads DAT.02.t3, DAT.09.t3 and DAT.10.t3.
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
